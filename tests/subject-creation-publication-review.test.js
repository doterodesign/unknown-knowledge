import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { canonicalSha256 } from '../payload/engine/lib/canonical-json.js';
import { recordApprovedCandidateReview, readRetainedCandidateReview } from '../payload/engine/lib/candidate-review.js';
import { publishPreparedCandidate } from '../payload/engine/lib/publish-prepared-candidate.js';
import { subjectCreationFixture } from './helpers/subject-creation-fixture.js';
import { creationReviewFixture } from './helpers/prepared-creation-fixture.js';

for (const [name, options] of [
  ['fresh activation', { action: 'activate' }],
  ['unrefused proposal promotion', { action: 'promote-proposal' }],
  ['fresh broader union preserving originals', { action: 'activate', union: true, objectFormat: 'sha256', nested: true }],
]) {
  test(`ordinary creation: ${name} through actual review and publication`, async t => {
    const f = await creationReviewFixture(t, options);
    assert.equal(f.git('rev-parse', '--show-object-format'), options.objectFormat ?? 'sha1');
    assert.equal(f.source.kitPath, options.nested ? 'unknown-knowledge' : '.');
    assert.equal(f.final.status, 'passed', JSON.stringify(f.final));
    assert.equal(f.final.gate.operation.action, options.action);
    assert.equal(f.final.gate.assignments, null);
    assert.equal(f.final.gate.sources.assignmentEvent, null);
    assert.deepEqual(f.final.gate.core.allocation.proof.ids, [f.operation.subject]);
    assert.equal(f.beforeDocument.subjects.some(row => row.id === f.operation.subject), false);
    assert.equal(f.beforeIdentity.allocations.some(row => row.kind === 'subject' && row.id === f.operation.subject), false);
    assert.deepEqual(f.candidateDocument.history.slice(0, -1), f.beforeDocument.history);
    assert.equal(f.candidateIdentity.allocations.length, f.beforeIdentity.allocations.length + 1);
    for (const old of f.beforeIdentity.allocations) {
      assert.deepEqual(f.candidateIdentity.allocations.find(row => row.kind === old.kind && row.id === old.id), old);
    }
    if (options.action === 'promote-proposal') {
      const proposal = f.beforeDocument.subjects.find(row => row.id === f.operation.proposal);
      assert.equal(proposal.status, 'proposed');
      assert.deepEqual(proposal.changes, []);
      assert.equal(Object.hasOwn(proposal, 'refusal'), false);
      assert.deepEqual(f.event.promotes, { key: proposal.id, before: proposal });
      assert.equal(f.candidateDocument.subjects.some(row => row.id === proposal.id), false);
    }
    if (options.union) {
      assert.deepEqual(f.beforeDocument.subjects.map(row => row.id), ['S-000001', 'S-000002']);
      assert.equal(f.operation.subject, 'S-000003');
      for (const original of f.beforeDocument.subjects) {
        assert.deepEqual(f.candidateDocument.subjects.find(row => row.id === original.id), original);
        assert.equal(original.status, 'active');
        assert.equal(Object.hasOwn(original, 'retirement'), false);
      }
      assert.equal(f.candidateDocument.subjects.find(row => row.id === 'S-000003').label, 'Ground transport');
    }
    const prefix = options.nested ? 'unknown-knowledge/' : '';
    assert.deepEqual(f.git('diff', '--name-only', f.source.tree, f.candidate.tree).split('\n'),
      [`${prefix}_identity.yaml`, `${prefix}subjects/registry.yaml`]);
    assert.equal(f.retained.artifacts.some(row => row.file === 'checks/operation/event.yaml'), false);

    const saved = await recordApprovedCandidateReview(f.writer());
    assert.equal(saved.status, 'retained', JSON.stringify(saved));
    const input = f.publisher(saved);
    const review = readRetainedCandidateReview({ evidenceDirectory: f.evidenceDirectory,
      validationBundleDigest: input.validationBundleDigest, reviewBundleDigest: input.reviewBundleDigest,
      expectedRequestDigest: input.expectedRequestDigest, limits: input.limits.review });
    assert.equal(review.status, 'verified', JSON.stringify(review));
    assert.deepEqual(review.receipt.review.decision, f.event.decision);
    assert.deepEqual(review.receipt.review.decisionCapture, f.event.review.decisionCapture);
    assert.equal(review.receipt.review.decisionDigest, f.event.review.decisionDigest);
    const index = readFileSync(join(f.repoRoot, '.git/index'));
    const status = f.git('status', '--porcelain');
    const unchanged = () => {
      assert.deepEqual(readFileSync(join(f.repoRoot, '.git/index')), index);
      assert.equal(f.git('status', '--porcelain'), status);
      assert.equal(f.git('rev-parse', f.request.source.ref), f.source.commit);
    };
    const published = await publishPreparedCandidate(input);
    assert.equal(published.status, 'published', JSON.stringify(published));
    assert.equal(f.git('rev-parse', f.request.publish.outputRef), f.candidate.commit);
    f.git('update-ref', '-d', f.request.publish.outputRef, f.candidate.commit);
    unchanged();

    if (options.union) {
      await t.test('declared historical authorizer loss after receipt cannot reuse prior success', async () => {
        const capture = f.evidence.decisionCaptures.find(row => row.capture.source
          && ![f.source.commit, f.candidate.commit].includes(row.capture.source.commit));
        assert.ok(capture, 'the control must have an actual independently removable historical Decision source');
        const commit = capture.capture.source.commit;
        assert.equal(f.git('cat-file', '-t', commit), 'commit');
        const file = join(f.repoRoot, '.git/objects', commit.slice(0, 2), commit.slice(2));
        const bytes = readFileSync(file);
        unlinkSync(file);
        try {
          assert.equal(f.git('cat-file', '-t', f.source.commit), 'commit');
          assert.equal(f.git('cat-file', '-t', f.candidate.commit), 'commit');
          await assert.rejects(recordApprovedCandidateReview(f.writer()), error => {
            assert.equal(error.code, 'review-creation-fresh-final');
            return true;
          });
          const refused = await publishPreparedCandidate(input);
          assert.equal(refused.status, 'not-published', JSON.stringify(refused));
          assert.equal(refused.code, 'review-creation-fresh-final');
          assert.equal(f.git('for-each-ref', '--format=%(objectname)', f.request.publish.outputRef), '');
        } finally {
          writeFileSync(file, bytes, { flag: 'wx' });
        }
        unchanged();
      });
      await t.test('resealing a supplied allocation assertion does not change actual allocation authority', async () => {
        const request = structuredClone(f.request);
        const result = request.operationEvidence.finalGate.result;
        result.gate.core.allocation.proof.ids = ['S-000004'];
        request.operationEvidence.finalGate.resultDigest = canonicalSha256(result);
        await assert.rejects(recordApprovedCandidateReview(f.writer(request)), error => {
          assert.equal(error.code, 'review-creation-fresh-final');
          return true;
        });
      });
    }

    const moved = f.git('commit-tree', f.source.tree, '-p', f.source.commit, '-m', 'Same bytes, distinct source commit');
    assert.notEqual(moved, f.source.commit);
    assert.equal(f.git('rev-parse', `${moved}^{tree}`), f.source.tree);
    f.git('update-ref', f.request.source.ref, moved);
    const sourceRefused = await publishPreparedCandidate(input);
    assert.equal(sourceRefused.status, 'not-published', JSON.stringify(sourceRefused));
    assert.equal(sourceRefused.code, 'source-ref-stale');
    f.git('update-ref', f.request.source.ref, f.source.commit);
    f.git('update-ref', f.request.publish.outputRef, f.source.commit);
    const outputRefused = await publishPreparedCandidate(input);
    assert.equal(outputRefused.status, 'not-published', JSON.stringify(outputRefused));
    assert.equal(outputRefused.code, 'output-ref-stale');
    f.git('update-ref', '-d', f.request.publish.outputRef, f.source.commit);
    const restored = await publishPreparedCandidate(input);
    assert.equal(restored.status, 'published', JSON.stringify(restored));
    assert.equal(f.git('rev-parse', f.request.publish.outputRef), f.candidate.commit);
    unchanged();
  });
}

test('actual union candidate cannot rewrite an original allocation publication', async t => {
  const { inspectSubjectCreationCore } = await import('../payload/engine/lib/subject-creation-core.js');
  const f = subjectCreationFixture(t, { union: true });
  const control = await inspectSubjectCreationCore(f.input());
  assert.equal(control.ok, true, JSON.stringify(control.diagnostics));
  f.candidateIdentity.allocations.find(row => row.kind === 'subject' && row.id === 'S-000001').publication.review = 'unreviewed replacement';
  f.reload('actual changed historical allocation provenance');
  const refused = await inspectSubjectCreationCore(f.input());
  assert.equal(refused.ok, false, JSON.stringify(refused));
  assert.ok(refused.diagnostics.some(row => row.code === 'subject-creation-allocation-mismatch'), JSON.stringify(refused.diagnostics));
  assert.equal(refused.allocation, null);
});
