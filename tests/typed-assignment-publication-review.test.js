import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { canonicalJsonBytes, canonicalSha256 } from '../payload/engine/lib/canonical-json.js';
import { runFinalPreparedAssignmentGate } from '../payload/engine/lib/final-prepared-assignment.js';
import { recordApprovedCandidateReview, readRetainedCandidateReview } from '../payload/engine/lib/candidate-review.js';
import { publishPreparedCandidate } from '../payload/engine/lib/publish-prepared-candidate.js';
import { reviewTypedAssignmentFixture, typedAssignmentEvidenceVariant } from './helpers/typed-assignment-publication-fixture.js';

const publicationPolicy = JSON.parse(readFileSync(new URL('../payload/engine/policies/candidate-publication.json', import.meta.url)));
const refusedReview = async (f, request, code) => {
  await assert.rejects(recordApprovedCandidateReview(f.writer(request)), error => {
    assert.equal(error.name, 'EngineRefusal');
    assert.equal(error.code, code);
    return true;
  });
};

for (const [objectFormat, nested] of [['sha1', false], ['sha256', true]]) {
  test(`mixed typed assignment ${objectFormat}: actual receipt, declared source loss, restoration and CAS`, async t => {
    const f = await reviewTypedAssignmentFixture(t, { kind: 'mixed', objectFormat, nested, continuation: true });
    assert.equal(f.git('rev-parse', '--show-object-format'), objectFormat);
    assert.equal(f.source.kitPath, nested ? 'unknown-knowledge' : '.');
    assert.equal(f.final.status, 'passed');
    assert.equal(f.request.operation, 'subject-assignment');
    assert.equal(f.final.policy.id, 'typed-subject-assignment-publication-v1');
    assert.equal(f.final.gate.version, 2);
    assert.deepEqual(new Set(f.event.scope.refs.map(row => row.kind)), new Set(['knowledge', 'ontology', 'decision']));
    const original = JSON.parse(f.retained.artifacts.find(row => row.file === 'checks/operation/input.json').bytes);
    assert.deepEqual(original.operationInputs.selection, f.event.scope);

    const saved = await recordApprovedCandidateReview(f.writer());
    assert.equal(saved.status, 'retained', JSON.stringify(saved));
    const input = f.publisher(saved);
    const receipt = readRetainedCandidateReview({ evidenceDirectory: f.evidenceDirectory,
      validationBundleDigest: input.validationBundleDigest, reviewBundleDigest: input.reviewBundleDigest,
      expectedRequestDigest: input.expectedRequestDigest, limits: input.limits.review });
    assert.equal(receipt.status, 'verified', JSON.stringify(receipt));
    assert.deepEqual(receipt.receipt.review.decision, f.event.decision);
    assert.deepEqual(receipt.receipt.review.decisionCapture, f.event.review['decision-capture']);
    assert.equal(receipt.receipt.review.decisionDigest, f.event.review['decision-digest']);
    const index = readFileSync(join(f.root, '.git/index'));
    const status = f.git('status', '--porcelain');
    const assertUnchanged = () => {
      assert.deepEqual(readFileSync(join(f.root, '.git/index')), index);
      assert.equal(f.git('status', '--porcelain'), status);
      assert.equal(f.git('rev-parse', f.request.source.ref), f.source.commit);
    };
    const control = await publishPreparedCandidate(input);
    assert.equal(control.status, 'published', JSON.stringify(control));
    assert.equal(f.git('rev-parse', f.request.publish.outputRef), f.candidate.commit);
    f.git('update-ref', '-d', f.request.publish.outputRef, f.candidate.commit);
    assertUnchanged();

    const historical = row => row.capture?.source?.commit
      && ![f.source.commit, f.candidate.commit].includes(row.capture.source.commit);
    const sources = [
      ['Decision', f.evidence.decisionCaptures.find(historical)],
      ['material', f.evidence.materialCaptures.find(historical)],
    ];
    for (const [kind, capture] of sources) await t.test(`missing declared historical ${kind} refuses fresh review and publication`, async () => {
      assert.ok(capture, `fixture must have a declared historical ${kind} source`);
      const commit = capture.capture.source.commit;
      assert.equal(f.git('cat-file', '-t', commit), 'commit');
      const file = join(f.root, '.git/objects', commit.slice(0, 2), commit.slice(2));
      const bytes = readFileSync(file);
      unlinkSync(file);
      try {
        // The source and candidate remain available; only an explicitly declared historical dependency is missing.
        assert.equal(f.git('cat-file', '-t', f.source.commit), 'commit');
        assert.equal(f.git('cat-file', '-t', f.candidate.commit), 'commit');
        await refusedReview(f, f.request, 'review-final-gate-mismatch');
        const refused = await publishPreparedCandidate(input);
        assert.equal(refused.status, 'not-published', JSON.stringify(refused));
        assert.equal(refused.code, 'review-final-gate-mismatch');
        assert.equal(f.git('for-each-ref', '--format=%(objectname)', f.request.publish.outputRef), '');
      } finally {
        writeFileSync(file, bytes, { flag: 'wx' });
      }
      assert.equal(f.git('cat-file', '-t', commit), 'commit');
      assertUnchanged();
    });

    const sameTree = f.git('commit-tree', f.source.tree, '-p', f.source.commit, '-m', 'same tree, different source identity');
    assert.notEqual(sameTree, f.source.commit);
    assert.equal(f.git('rev-parse', `${sameTree}^{tree}`), f.source.tree);
    f.git('update-ref', f.request.source.ref, sameTree);
    const staleSource = await publishPreparedCandidate(input);
    assert.equal(staleSource.status, 'not-published', JSON.stringify(staleSource));
    assert.equal(staleSource.code, 'source-ref-stale');
    f.git('update-ref', f.request.source.ref, f.source.commit);
    f.git('update-ref', f.request.publish.outputRef, f.source.commit);
    const staleOutput = await publishPreparedCandidate(input);
    assert.equal(staleOutput.status, 'not-published', JSON.stringify(staleOutput));
    assert.equal(staleOutput.code, 'output-ref-stale');
    f.git('update-ref', '-d', f.request.publish.outputRef, f.source.commit);
    const restored = await publishPreparedCandidate(input);
    assert.equal(restored.status, 'published', JSON.stringify(restored));
    assert.equal(restored.requestDigest, saved.requestDigest);
    assert.equal(f.git('rev-parse', f.request.publish.outputRef), f.candidate.commit);
    assertUnchanged();
  });
}

test('original retained typed selection and policy cannot be replaced by event inference or rehashed caller reports', async t => {
  const f = await reviewTypedAssignmentFixture(t, { kind: 'mixed' });
  const control = await recordApprovedCandidateReview(f.writer());
  assert.equal(control.status, 'retained', JSON.stringify(control));
  assert.equal(f.final.gate.version, 1);
  assert.equal(f.final.policy.digest, canonicalSha256(publicationPolicy.typedSubjectAssignment));

  await t.test('old Knowledge policy cannot authorize the same typed event', async () => {
    const request = structuredClone(f.request);
    const old = publicationPolicy.operations['subject-assignment'];
    request.policy = { id: old.id, digest: canonicalSha256(old) };
    await refusedReview(f, request, 'review-policy-mismatch');
  });

  await t.test('rehashed supplied final policy still must equal actual fresh final', async () => {
    const request = structuredClone(f.request);
    request.operationEvidence.finalGate.result.policy.digest = '0'.repeat(64);
    request.operationEvidence.finalGate.resultDigest = canonicalSha256(request.operationEvidence.finalGate.result);
    await refusedReview(f, request, 'review-final-gate-mismatch');
  });

  const mutations = [
    ['removed selection', operation => { delete operation.operationInputs.selection; }],
    ['narrowed selection', operation => { operation.operationInputs.selection.refs.pop(); }],
    ['null selection', operation => { operation.operationInputs.selection = null; }],
    ['different original source', operation => { operation.source.commit = operation.candidate.commit; }],
  ];
  for (const [name, mutate] of mutations) await t.test(`${name}: artifact reseal does not replace original injected binding`, async () => {
    const input = typedAssignmentEvidenceVariant(f, rows => {
      const artifact = rows.find(row => row.file === 'checks/operation/input.json');
      const operation = JSON.parse(artifact.bytes);
      mutate(operation);
      artifact.bytes = canonicalJsonBytes(operation);
    });
    const result = await runFinalPreparedAssignmentGate(input);
    assert.equal(result.status, 'failed', JSON.stringify(result));
    assert.equal(result.gate, null);
    assert.ok(result.diagnostics.some(row => row.code === 'final-assignment-evidence-unavailable'), JSON.stringify(result));
  });
});
