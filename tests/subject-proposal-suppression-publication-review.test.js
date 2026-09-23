import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { canonicalSha256 } from '../payload/engine/lib/canonical-json.js';
import { EngineRefusal } from '../payload/engine/lib/engine-refusal.js';
import { validateSubjectTransition } from '../payload/engine/lib/subject-governance.js';
import { recordApprovedCandidateReview, readRetainedCandidateReview } from '../payload/engine/lib/candidate-review.js';
import { publishPreparedCandidate } from '../payload/engine/lib/publish-prepared-candidate.js';
import { subjectProposalSuppressionReviewFixture, subjectProposalSuppressionEvidenceVariant,
  suppressedProposal } from './helpers/subject-proposal-suppression-fixture.js';

for (const options of [
  { objectFormat: 'sha1', nested: false, material: false },
  { objectFormat: 'sha256', nested: true, material: true },
]) {
  test(`proposal suppression ${options.objectFormat}: original meaning, refusal and actual publication`, async t => {
    const f = await subjectProposalSuppressionReviewFixture(t, options);
    assert.equal(f.git('rev-parse', '--show-object-format'), options.objectFormat);
    assert.equal(f.source.kitPath, options.nested ? 'unknown-knowledge' : '.');
    const native = f.native();
    assert.equal(native.ok, true, JSON.stringify(native.diagnostics));
    const substituted = validateSubjectTransition({ before: f.beforeModel.subjectRegistry.document,
      candidate: f.candidateModel.subjectRegistry.document, model: f.candidateModel,
      identityIndex: f.candidateModel.identityIndex, ...f.input.evidence });
    assert.equal(substituted.ok, false);
    assert.ok(substituted.diagnostics.some(row => row.code === 'subject-capture-mismatch'), JSON.stringify(substituted.diagnostics));

    const before = f.beforeModel.subjectRegistry.document;
    const after = f.candidateModel.subjectRegistry.document;
    const original = before.subjects.find(row => row.id === suppressedProposal);
    const refused = after.subjects.find(row => row.id === suppressedProposal);
    assert.equal(original.status, 'proposed');
    assert.deepEqual(refused, { ...original, status: 'suppressed',
      refusal: { decision: f.event.decision, reason: f.event.reason }, changes: [...original.changes, f.event.id] });
    assert.deepEqual(after.history.slice(0, -1), before.history);
    for (const row of before.subjects.filter(row => row.id !== suppressedProposal)) {
      assert.deepEqual(after.subjects.find(candidate => candidate.id === row.id), row);
    }
    assert.deepEqual(f.beforeModel.identity, f.candidateModel.identity);
    const gate = f.final.gate;
    assert.equal(f.final.status, 'passed');
    assert.equal(gate.operation.action, 'suppress');
    assert.equal(gate.assignments, null);
    assert.equal(gate.sources.assignmentEvent, null);
    assert.equal(gate.assignmentAssessment.reason, 'registry-only-transition');
    const registry = options.nested ? 'unknown-knowledge/subjects/registry.yaml' : 'subjects/registry.yaml';
    assert.deepEqual(f.git('diff', '--name-only', f.source.tree, f.candidate.tree).split('\n'), [registry]);
    assert.deepEqual(gate.preservation.proof.changedPaths, [registry]);
    assert.equal(f.retained.artifacts.some(row => ['checks/operation/event.yaml', 'checks/operation/identity.yaml'].includes(row.file)), false);
    const replays = gate.impacts.representativeReplays;
    assert.equal(replays.status, 'complete');
    assert.ok(replays.comparison.cases.length > 0);
    for (const row of replays.comparison.cases) for (const kind of ['strict', 'possible']) {
      assert.deepEqual(row.candidates[kind].added, []);
      assert.deepEqual(row.candidates[kind].removed, []);
    }

    const saved = await recordApprovedCandidateReview(f.writer());
    assert.equal(saved.status, 'retained', JSON.stringify(saved));
    const input = f.publisher(saved);
    const receipt = readRetainedCandidateReview({ evidenceDirectory: f.evidenceDirectory,
      validationBundleDigest: input.validationBundleDigest, reviewBundleDigest: input.reviewBundleDigest,
      expectedRequestDigest: input.expectedRequestDigest, limits: input.limits.review });
    assert.equal(receipt.status, 'verified', JSON.stringify(receipt));
    assert.deepEqual(receipt.receipt.review.decision, f.event.decision);
    assert.deepEqual(receipt.receipt.review.decisionCapture, f.event.review.decisionCapture);
    assert.equal(receipt.receipt.review.decisionDigest, f.event.review.decisionDigest);
    const index = readFileSync(join(f.root, '.git/index'));
    const status = f.git('status', '--porcelain');
    const unchanged = () => {
      assert.deepEqual(readFileSync(join(f.root, '.git/index')), index);
      assert.equal(f.git('status', '--porcelain'), status);
      assert.equal(f.git('rev-parse', f.request.source.ref), f.source.commit);
    };
    const published = await publishPreparedCandidate(input);
    assert.equal(published.status, 'published', JSON.stringify(published));
    assert.equal(f.git('rev-parse', f.request.publish.outputRef), f.candidate.commit);
    f.git('update-ref', '-d', f.request.publish.outputRef, f.candidate.commit);
    unchanged();

    if (options.material) for (const [kind, captures] of [
      ['Decision', f.input.evidence.decisionCaptures], ['material', f.input.evidence.materialCaptures],
    ]) await t.test(`missing declared historical ${kind} after receipt refuses fresh authority`, async () => {
      const capture = captures.find(row => row.capture.source && ![f.source.commit, f.candidate.commit].includes(row.capture.source.commit));
      assert.ok(capture, `actual historical ${kind} source required for this control`);
      const commit = capture.capture.source.commit;
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
        const result = await publishPreparedCandidate(input);
        assert.equal(result.status, 'not-published', JSON.stringify(result));
        assert.equal(result.code, 'review-final-metadata-mismatch');
        assert.equal(f.git('for-each-ref', '--format=%(objectname)', f.request.publish.outputRef), '');
      } finally {
        writeFileSync(file, bytes, { flag: 'wx' });
      }
      unchanged();
    });

    if (!options.material) {
      await t.test('rehashing a metadata profile substitution cannot authorize suppression', async () => {
        const request = structuredClone(f.request);
        request.operation = 'subject-metadata';
        request.operationEvidence.kind = 'subject-metadata';
        const result = request.operationEvidence.finalGate.result;
        result.gate.operation.action = 'rename';
        request.operationEvidence.finalGate.resultDigest = canonicalSha256(result);
        await assert.rejects(recordApprovedCandidateReview(f.writer(request)), error => {
          assert.ok(error instanceof EngineRefusal, error.stack);
          assert.equal(error.message, 'prepared evidence: invalid or mismatched retained manifest');
          return true;
        });
      });
      await t.test('resealed eventless bundle still refuses an assignment artifact', async () => {
        const variant = subjectProposalSuppressionEvidenceVariant(f, rows => {
          rows.push({ file: 'checks/operation/event.yaml', bytes: Buffer.from('unexpected: assignment\n') });
        });
        const { runFinalPreparedSubjectProposalSuppressionGate } = await import('../payload/engine/lib/final-prepared-subject-metadata.js');
        const result = await runFinalPreparedSubjectProposalSuppressionGate(variant);
        assert.equal(result.status, 'failed', JSON.stringify(result));
        assert.ok(result.diagnostics.length > 0);
      });
    }

    const moved = f.git('commit-tree', f.source.tree, '-p', f.source.commit, '-m', 'Different source commit, same contents');
    assert.notEqual(moved, f.source.commit);
    assert.equal(f.git('rev-parse', `${moved}^{tree}`), f.source.tree);
    f.git('update-ref', f.request.source.ref, moved);
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
    assert.equal(f.git('rev-parse', f.request.publish.outputRef), f.candidate.commit);
    unchanged();
  });
}
