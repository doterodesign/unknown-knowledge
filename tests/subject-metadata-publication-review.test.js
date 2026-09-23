import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { load } from 'js-yaml';
import { canonicalSha256 } from '../payload/engine/lib/canonical-json.js';
import { recordApprovedCandidateReview, readRetainedCandidateReview } from '../payload/engine/lib/candidate-review.js';
import { publishPreparedCandidate } from '../payload/engine/lib/publish-prepared-candidate.js';
import { subjectMetadataReviewFixture, subjectMetadataEvidenceVariant } from './helpers/subject-metadata-fixture.js';

// This authored assignment makes the new parent gain a real unchanged owner.
// It is committed before either metadata snapshot; no query/planner supplies truth.
function assignSecondSubject(h) {
  const file = 'knowledge/K-000002.md';
  const [, front, ...body] = h.read(file).split('---');
  const record = load(front);
  record.subjects = ['S-000002'];
  h.put(file, `---\n${JSON.stringify(record)}\n---${body.join('---')}`);
}

for (const options of [
  { action: 'rename', objectFormat: 'sha1', nested: false, material: false },
  { action: 'reparent', objectFormat: 'sha256', nested: true, material: true, beforeChange: assignSecondSubject },
]) {
  test(`metadata ${options.action} ${options.objectFormat}: actual publication, retained evidence and CAS`, async t => {
    const f = await subjectMetadataReviewFixture(t, options);
    assert.equal(f.git('rev-parse', '--show-object-format'), options.objectFormat);
    assert.equal(f.source.kitPath, options.nested ? 'unknown-knowledge' : '.');
    assert.equal(f.final.status, 'passed', JSON.stringify(f.final));
    const gate = f.final.gate;
    assert.equal(gate.ok, true);
    assert.equal(gate.operation.action, options.action);
    assert.equal(gate.assignments, null);
    assert.equal(gate.sources.assignmentEvent, null);
    assert.equal(gate.assignmentAssessment.reason, 'registry-only-transition');
    assert.equal(f.retained.artifacts.some(row => row.file === 'checks/operation/event.yaml'), false);
    const registryFile = options.nested ? 'unknown-knowledge/subjects/registry.yaml' : 'subjects/registry.yaml';
    assert.deepEqual(gate.preservation.proof.changedPaths, [registryFile]);
    assert.deepEqual(gate.preservation.proof.inputs, { before: f.source, candidate: f.candidate });
    assert.equal(gate.preservation.proof.operationDigest, canonicalSha256(f.input.operation));
    assert.equal(gate.preservation.proofDigest, canonicalSha256(gate.preservation.proof));

    const prefix = options.nested ? 'unknown-knowledge/' : '';
    const recordFile = `${prefix}knowledge/K-000002.md`;
    assert.equal(f.git('show', `${f.source.commit}:${recordFile}`), f.git('show', `${f.candidate.commit}:${recordFile}`));
    const replay = gate.impacts.representativeReplays;
    assert.equal(replay.status, 'complete');
    const direct = replay.comparison.cases.filter(row => row.specification.query.expansion === 'direct');
    assert.ok(direct.length > 0);
    for (const row of direct) for (const kind of ['strict', 'possible']) {
      assert.deepEqual(row.candidates[kind].added, []);
      assert.deepEqual(row.candidates[kind].removed, []);
    }
    if (options.action === 'reparent') {
      const row = replay.comparison.cases.find(item => item.id === 'knowledge/current/self-and-descendants/assigned/S-000001');
      assert.ok(row, 'retain the actual new-parent query');
      assert.equal(row.before.groups.knowledge.strict.some(item => item.ref?.id === 'K-000002'), false);
      assert.equal(row.after.groups.knowledge.strict.some(item => item.ref?.id === 'K-000002'), true);
      assert.ok(row.candidates.strict.added.some(item => item.ref?.id === 'K-000002'));
    }

    const saved = await recordApprovedCandidateReview(f.writer());
    assert.equal(saved.status, 'retained', JSON.stringify(saved));
    const publicationInput = f.publisher(saved);
    const retainedReview = readRetainedCandidateReview({ evidenceDirectory: f.evidenceDirectory,
      validationBundleDigest: publicationInput.validationBundleDigest, reviewBundleDigest: publicationInput.reviewBundleDigest,
      expectedRequestDigest: publicationInput.expectedRequestDigest, limits: publicationInput.limits.review });
    assert.equal(retainedReview.status, 'verified', JSON.stringify(retainedReview));
    assert.deepEqual(retainedReview.receipt.review.decision, f.event.decision);
    assert.deepEqual(retainedReview.receipt.review.decisionCapture, f.event.review.decisionCapture);
    assert.equal(retainedReview.receipt.review.decisionDigest, f.event.review.decisionDigest);

    const index = readFileSync(join(f.root, '.git/index'));
    const worktree = f.git('status', '--porcelain');
    const unchanged = () => {
      assert.deepEqual(readFileSync(join(f.root, '.git/index')), index);
      assert.equal(f.git('status', '--porcelain'), worktree);
      assert.equal(f.git('rev-parse', f.request.source.ref), f.source.commit);
    };
    const published = await publishPreparedCandidate(publicationInput);
    assert.equal(published.status, 'published', JSON.stringify(published));
    assert.equal(f.git('rev-parse', f.request.publish.outputRef), f.candidate.commit);
    f.git('update-ref', '-d', f.request.publish.outputRef, f.candidate.commit);
    unchanged();

    if (options.material) for (const [name, captures] of [
      ['Decision', f.input.evidence.decisionCaptures], ['material', f.input.evidence.materialCaptures],
    ]) await t.test(`post-receipt ${name} source loss refuses fresh review/publication`, async () => {
      const captured = captures.find(row => row.capture.source && ![f.source.commit, f.candidate.commit].includes(row.capture.source.commit));
      assert.ok(captured, `independent historical ${name} source must exist`);
      const commit = captured.capture.source.commit;
      assert.equal(f.git('cat-file', '-t', commit), 'commit');
      const file = join(f.root, '.git/objects', commit.slice(0, 2), commit.slice(2));
      const bytes = readFileSync(file);
      unlinkSync(file);
      try {
        assert.equal(f.git('cat-file', '-t', f.source.commit), 'commit');
        assert.equal(f.git('cat-file', '-t', f.candidate.commit), 'commit');
        await assert.rejects(recordApprovedCandidateReview(f.writer()), error => {
          assert.equal(error.code, 'review-final-metadata-mismatch');
          return true;
        });
        const refused = await publishPreparedCandidate(publicationInput);
        assert.equal(refused.status, 'not-published', JSON.stringify(refused));
        assert.equal(refused.code, 'review-final-metadata-mismatch');
        assert.equal(f.git('for-each-ref', '--format=%(objectname)', f.request.publish.outputRef), '');
      } finally {
        writeFileSync(file, bytes, { flag: 'wx' });
      }
      unchanged();
    });

    const sameTree = f.git('commit-tree', f.source.tree, '-p', f.source.commit, '-m', 'Distinct actual source identity');
    assert.notEqual(sameTree, f.source.commit);
    assert.equal(f.git('rev-parse', `${sameTree}^{tree}`), f.source.tree);
    f.git('update-ref', f.request.source.ref, sameTree);
    const staleSource = await publishPreparedCandidate(publicationInput);
    assert.equal(staleSource.status, 'not-published', JSON.stringify(staleSource));
    assert.equal(staleSource.code, 'source-ref-stale');
    f.git('update-ref', f.request.source.ref, f.source.commit);
    f.git('update-ref', f.request.publish.outputRef, f.source.commit);
    const staleOutput = await publishPreparedCandidate(publicationInput);
    assert.equal(staleOutput.status, 'not-published', JSON.stringify(staleOutput));
    assert.equal(staleOutput.code, 'output-ref-stale');
    f.git('update-ref', '-d', f.request.publish.outputRef, f.source.commit);
    const restored = await publishPreparedCandidate(publicationInput);
    assert.equal(restored.status, 'published', JSON.stringify(restored));
    unchanged();

    if (!options.material) {
      await t.test('resealed final preservation assertion cannot replace actual owner evidence', async () => {
        const request = structuredClone(f.request);
        const result = request.operationEvidence.finalGate.result;
        result.gate.preservation.proof.changedPaths = [];
        result.gate.preservation.proofDigest = canonicalSha256(result.gate.preservation.proof);
        result.gate.assignmentAssessment.preservationDigest = result.gate.preservation.proofDigest;
        request.operationEvidence.finalGate.resultDigest = canonicalSha256(result);
        await assert.rejects(recordApprovedCandidateReview(f.writer(request)), error => {
          assert.equal(error.code, 'review-final-metadata-mismatch');
          return true;
        });
      });
      await t.test('eventless metadata refuses a resealed assignment artifact', async () => {
        const variant = subjectMetadataEvidenceVariant(f, artifacts => {
          artifacts.push({ file: 'checks/operation/event.yaml', bytes: Buffer.from('unexpected: assignment\n') });
        });
        const { runFinalPreparedSubjectMetadataGate } = await import('../payload/engine/lib/final-prepared-subject-metadata.js');
        const refused = await runFinalPreparedSubjectMetadataGate(variant);
        assert.equal(refused.status, 'failed', JSON.stringify(refused));
        assert.ok(refused.diagnostics.length > 0);
      });
    }
  });
}
