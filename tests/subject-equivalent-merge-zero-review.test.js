import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { canonicalJsonBytes, canonicalSha256 } from '../payload/engine/lib/canonical-json.js';
import { recordApprovedCandidateReview, readRetainedCandidateReview } from '../payload/engine/lib/candidate-review.js';
import { publishPreparedCandidate } from '../payload/engine/lib/publish-prepared-candidate.js';
import { runFinalPreparedEquivalentMergeGate } from '../payload/engine/lib/final-prepared-equivalent-merge.js';
import { runPreparedEquivalentMergeGate } from '../payload/engine/lib/subject-equivalent-merge-gate.js';
import { changedTreePaths } from '../payload/engine/lib/commit-snapshot.js';
import { equivalentMergeZeroFixture, equivalentMergeZeroReviewFixture, equivalentMergeZeroEvidenceVariant } from './helpers/equivalent-merge-zero-fixture.js';

test('actual zero-use source control does not authorize extra paths, mode, ledger, record or history edits', async t => {
  const control = await equivalentMergeZeroFixture(t);
  const passed = await runPreparedEquivalentMergeGate(control.input);
  assert.equal(passed.ok, true, JSON.stringify(passed));
  const edits = [
    ['extra path', h => h.put('extra-evidence.txt', 'Unreviewed file.\n'), 'extra-evidence.txt'],
    ['record executable mode', h => chmodSync(join(h.kitRoot, 'knowledge/K-000001.md'), 0o755), 'knowledge/K-000001.md'],
    ['identity raw bytes', h => h.put('_identity.yaml', h.read('_identity.yaml') + '\n# Unreviewed ledger bytes.\n'), '_identity.yaml'],
    ['record body', h => h.put('knowledge/K-000001.md', h.read('knowledge/K-000001.md') + '\nUnreviewed claim.\n'), 'knowledge/K-000001.md'],
  ];
  for (const [name, candidateChange, file] of edits) await t.test(name, async () => {
    const f = await equivalentMergeZeroFixture(t, { candidateChange });
    assert.deepEqual(changedTreePaths(f.root, f.input.before.tree, f.input.candidate.tree), [file, 'subjects/registry.yaml'].sort());
    const result = await runPreparedEquivalentMergeGate(f.input);
    assert.equal(result.ok, false, JSON.stringify(result));
    assert.equal(result.checks.models.status, 'passed', JSON.stringify(result.diagnostics));
    assert.equal(result.checks.preservation.status, 'failed');
    assert.ok(result.diagnostics.some(row => row.code === 'merge-zero-use-path-changed'), JSON.stringify(result.diagnostics));
    assert.equal(result.assignmentAssessment, null);
  });

  await t.test('rehashed old registry history remains immutable', async () => {
    const f = await equivalentMergeZeroFixture(t, { candidateChange({ document }) {
      const event = document.history[0];
      event.reason = 'Unreviewed replacement of retained historical rationale';
      const { review, ...body } = event;
      event.review.changeDigest = canonicalSha256(body);
    } });
    const result = await runPreparedEquivalentMergeGate(f.input);
    assert.equal(result.ok, false, JSON.stringify(result));
    assert.equal(result.checks.models.status, 'passed', JSON.stringify(result.diagnostics));
    assert.ok(result.diagnostics.some(row => row.code === 'merge-scope-refused'
      && row.diagnostics.some(detail => detail.code === 'merge-registry-suffix')), JSON.stringify(result.diagnostics));
  });

  await t.test('unchanged actual candidate is not a zero-use merge', async () => {
    const result = await runPreparedEquivalentMergeGate({ ...control.input, candidate: control.input.before });
    assert.equal(result.ok, false, JSON.stringify(result));
    assert.equal(result.checks.models.status, 'passed', JSON.stringify(result.diagnostics));
    assert.ok(result.diagnostics.some(row => row.code === 'merge-scope-refused'
      && row.diagnostics.some(detail => detail.code === 'merge-registry-suffix')), JSON.stringify(result.diagnostics));
  });
});

for (const [objectFormat, nested, material] of [['sha1', false, false], ['sha256', true, true]]) {
  test(`zero-use equivalent merge ${objectFormat}: survivor query gain, actual publication and preserved CAS`, async t => {
    const f = await equivalentMergeZeroReviewFixture(t, { objectFormat, nested, material });
    assert.equal(f.git('rev-parse', '--show-object-format'), objectFormat);
    assert.equal(f.source.kitPath, nested ? 'unknown-knowledge' : '.');
    const gate = f.final.gate;
    assert.equal(f.final.status, 'passed');
    assert.equal(gate.version, 3);
    assert.equal(f.operationInputs.gateInput.operation.assignmentEvent, null);
    assert.equal(gate.assignments, null);
    assert.equal(gate.sources.assignmentEvent, null);
    assert.equal(gate.checks.assignments.status, 'not-applicable');
    assert.deepEqual(gate.authoredReferenceClosure.affectedRefs, []);
    assert.deepEqual(gate.assignmentAssessment.effectiveDirectRefs, []);
    assert.equal(gate.assignmentAssessment.reason, 'zero-effective-direct-use');
    assert.equal(f.retained.artifacts.some(row => row.file === 'checks/operation/event.yaml'), false);
    const proof = gate.preservation.proof;
    assert.deepEqual(proof.inputs, { before: f.source, candidate: f.candidate });
    assert.deepEqual(proof.changedPaths, [nested ? 'unknown-knowledge/subjects/registry.yaml' : 'subjects/registry.yaml']);
    assert.equal(proof.operationDigest, canonicalSha256(f.input.operation));
    assert.equal(proof.inventoryDigest, canonicalSha256(gate.inventory));
    assert.equal(gate.preservation.proofDigest, canonicalSha256(proof));
    assert.ok(gate.resources.closure.used.rows >= 1);
    assert.ok(gate.resources.closure.used.bytes >= canonicalJsonBytes(proof).length);

    const oldRecord = f.capture(f.source, 'knowledge/K-000001.md');
    const newRecord = f.capture(f.candidate, 'knowledge/K-000001.md');
    assert.deepEqual(oldRecord.bytes, newRecord.bytes);
    assert.match(oldRecord.bytes.toString(), new RegExp(`subjects: \\["${f.survivorId}"\\]`));
    const replay = gate.impacts.representativeReplays;
    assert.equal(replay.status, 'complete');
    const query = replay.comparison.cases.find(row => row.id === `knowledge/current/direct/assigned/${f.sourceId}`);
    assert.ok(query, 'the fixed recipe must retain the original absorbed operand');
    assert.equal(query.before.query.where.subject, f.sourceId);
    assert.equal(query.after.query.where.subject, f.sourceId);
    assert.equal(query.before.query.subjectPolicy, 'equivalent');
    assert.equal(query.candidates.status, 'exact');
    assert.equal(query.before.groups.knowledge.strict.some(row => row.ref.id === f.survivorRef.id), false);
    assert.ok(query.after.groups.knowledge.strict.some(row => row.ref.id === f.survivorRef.id));
    assert.ok(query.candidates.strict.added.some(row => canonicalSha256(row.ref) === canonicalSha256(f.survivorRef)),
      'zero authored assignment changes still permit the native redirect-induced query gain');

    const saved = await recordApprovedCandidateReview(f.writer());
    assert.equal(saved.status, 'retained', JSON.stringify(saved));
    const input = f.publisher(saved);
    const receipt = readRetainedCandidateReview({ evidenceDirectory: f.evidenceDirectory,
      validationBundleDigest: input.validationBundleDigest, reviewBundleDigest: input.reviewBundleDigest,
      expectedRequestDigest: input.expectedRequestDigest, limits: input.limits.review });
    assert.equal(receipt.status, 'verified', JSON.stringify(receipt));
    assert.equal(receipt.request.operationEvidence.assignmentEvent, null);
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

    if (material) for (const [kind, rows] of [['Decision', f.input.evidence.decisionCaptures], ['material', f.input.evidence.materialCaptures]]) {
      await t.test(`loss of declared historical ${kind} after receipt refuses fresh review and publication`, async () => {
        const capture = rows.find(row => row.capture.source && ![f.source.commit, f.candidate.commit].includes(row.capture.source.commit));
        assert.ok(capture, `actual historical ${kind} source is required for this test`);
        const commit = capture.capture.source.commit;
        assert.equal(f.git('cat-file', '-t', commit), 'commit');
        const file = join(f.root, '.git/objects', commit.slice(0, 2), commit.slice(2));
        const bytes = readFileSync(file);
        unlinkSync(file);
        try {
          assert.equal(f.git('cat-file', '-t', f.source.commit), 'commit');
          assert.equal(f.git('cat-file', '-t', f.candidate.commit), 'commit');
          await assert.rejects(recordApprovedCandidateReview(f.writer()), error => {
            assert.equal(error.code, 'review-final-merge-mismatch');
            return true;
          });
          const refused = await publishPreparedCandidate(input);
          assert.equal(refused.status, 'not-published', JSON.stringify(refused));
          assert.equal(refused.code, 'review-final-merge-mismatch');
          assert.equal(f.git('for-each-ref', '--format=%(objectname)', f.request.publish.outputRef), '');
        } finally {
          writeFileSync(file, bytes, { flag: 'wx' });
        }
        unchanged();
      });
    }

    const sameTree = f.git('commit-tree', f.source.tree, '-p', f.source.commit, '-m', 'independent source commit identity');
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
    assert.equal(f.git('rev-parse', f.request.publish.outputRef), f.candidate.commit);
    unchanged();

    if (!material) {
      await t.test('zero retained artifact set cannot contain an assignment event', async () => {
        const variant = equivalentMergeZeroEvidenceVariant(f, rows => {
          rows.push({ file: 'checks/operation/event.yaml', bytes: Buffer.from('unexpected: assignment-event\n') });
        });
        const refused = await runFinalPreparedEquivalentMergeGate(variant);
        assert.equal(refused.status, 'failed', JSON.stringify(refused));
        assert.ok(refused.diagnostics.length > 0);
      });
      await t.test('rehashed supplied zero preservation proof cannot replace the fresh owner result', async () => {
        const request = structuredClone(f.request);
        const final = request.operationEvidence.finalGate.result;
        final.gate.preservation.proof.changedPaths = [];
        final.gate.preservation.proofDigest = canonicalSha256(final.gate.preservation.proof);
        final.gate.assignmentAssessment.preservationDigest = final.gate.preservation.proofDigest;
        request.operationEvidence.finalGate.resultDigest = canonicalSha256(final);
        await assert.rejects(recordApprovedCandidateReview(f.writer(request)), error => {
          assert.equal(error.code, 'review-final-merge-mismatch');
          return true;
        });
      });
    }
  });
}
