/** Independent publication tests in disposable Git repositories; synthetic approval only. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, writeFileSync, unlinkSync, statSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { reconsiderationReviewFixture, reviewLimits } from './helpers/prepared-reconsideration-fixture.js';
import { recordApprovedCandidateReview, readRetainedCandidateReview } from '../payload/engine/lib/candidate-review.js';
import { publishPreparedCandidate } from '../payload/engine/lib/publish-prepared-candidate.js';
import { canonicalJsonBytes } from '../payload/engine/lib/canonical-json.js';
import { rawSha256 } from '../payload/engine/lib/prepared-evidence.js';
import { EngineRefusal } from '../payload/engine/lib/engine-refusal.js';

function readReview(input) {
  return readRetainedCandidateReview({ evidenceDirectory: input.evidenceDirectory,
    validationBundleDigest: input.validationBundleDigest, reviewBundleDigest: input.reviewBundleDigest,
    expectedRequestDigest: input.expectedRequestDigest, limits: reviewLimits });
}

// Re-seal altered receipt bytes through the exact existing review envelope. The
// immutable request and synthetic authorization remain untouched; hash integrity
// cannot substitute for the publisher's authorizer binding check.
function receiptVariant(input, retained, edit) {
  const receipt = structuredClone(retained.receipt); edit(receipt.review);
  const bytes = canonicalJsonBytes(receipt); const digest = rawSha256(bytes);
  const manifest = structuredClone(retained.manifest);
  manifest.receiptDigest = digest;
  const row = manifest.artifacts.find(row => row.file === 'receipt.json');
  row.sha256 = digest; row.size = bytes.length;
  const manifestBytes = canonicalJsonBytes(manifest); const bundle = rawSha256(manifestBytes);
  for (const [file, content] of [
    [join(input.evidenceDirectory, 'blobs/sha256', digest), bytes],
    [join(input.evidenceDirectory, 'bundles', `${bundle}.json`), manifestBytes],
  ]) {
    if (existsSync(file)) assert.deepEqual(readFileSync(file), content);
    else writeFileSync(file, content, { flag: 'wx', mode: 0o400 });
  }
  return { ...input, reviewBundleDigest: bundle };
}

const absentOutput = f => assert.equal(f.git('for-each-ref', '--format=%(objectname)', f.request.publish.outputRef), '');
function unchanged(f, index, status) {
  assert.deepEqual(readFileSync(join(f.repoRoot, '.git/index')), index);
  assert.equal(f.git('status', '--porcelain'), status);
  assert.equal(f.git('rev-parse', f.request.source.ref), f.source.commit);
}

for (const [objectFormat, nested] of [['sha1', false], ['sha256', true]]) {
  test(`actual reconsideration publication ${objectFormat}: receipt, fresh provenance and exact CAS`, async t => {
    const f = await reconsiderationReviewFixture(t, { objectFormat, nested, archivedPrior: true, sourceMaterial: true });
    assert.equal(f.final.status, 'passed');
    assert.equal(f.git('rev-parse', '--show-object-format'), objectFormat);
    const saved = await recordApprovedCandidateReview(f.writer());
    assert.equal(saved.status, 'retained', JSON.stringify(saved));
    const input = f.publisher(saved); const retained = readReview(input);
    assert.equal(retained.status, 'verified');
    assert.deepEqual(retained.receipt.review.decision, f.final.gate.core.decision.ref);
    assert.deepEqual(retained.receipt.review.decisionCapture, f.final.gate.core.decision.review.decisionCapture);
    assert.equal(retained.receipt.review.decisionDigest, f.final.gate.core.decision.review.decisionDigest);
    assert.notEqual(retained.receipt.review.reference, f.final.gate.core.decision.reference);
    assert.equal(f.request.operationEvidence.assignmentEvent, null);
    assert.equal(f.retained.artifacts.some(row => row.file === 'checks/operation/event.yaml'), false);
    const index = readFileSync(join(f.repoRoot, '.git/index')); const status = f.git('status', '--porcelain');

    const control = await publishPreparedCandidate(input);
    assert.equal(control.status, 'published', JSON.stringify(control));
    assert.equal(control.requestDigest, saved.requestDigest);
    assert.equal(control.receiptDigest, saved.receiptDigest);
    assert.equal(f.git('rev-parse', f.request.publish.outputRef), f.candidate.commit);
    unchanged(f, index, status);
    f.git('update-ref', '-d', f.request.publish.outputRef, f.candidate.commit);
    absentOutput(f);

    for (const [name, edit] of [
      ['Decision digest', review => { review.decisionDigest = 'f'.repeat(64); }],
      ['complete Decision source locator', review => {
        review.decisionCapture.source.tree = 'f'.repeat(f.source.tree.length);
      }],
    ]) await t.test(`resealed receipt ${name} cannot replace event-independent authorizer`, async () => {
      const changed = receiptVariant(input, retained, edit);
      assert.equal(readReview(changed).status, 'verified', 'altered receipt passes actual retained integrity before semantic binding');
      const refused = await publishPreparedCandidate(changed);
      assert.equal(refused.status, 'not-published');
      assert.equal(refused.code, 'publication-authorizer-binding-mismatch', JSON.stringify(refused));
      absentOutput(f); unchanged(f, index, status);
    });

    // Equal source tree/authority bytes never weaken the original commit binding.
    const identicalTreeCommit = f.git('commit-tree', f.source.tree, '-p', f.source.commit, '-m', 'actual same-tree source ref movement');
    assert.notEqual(identicalTreeCommit, f.source.commit);
    assert.equal(f.git('rev-parse', `${identicalTreeCommit}^{tree}`), f.source.tree);
    f.git('update-ref', f.request.source.ref, identicalTreeCommit, f.source.commit);
    const staleSource = await publishPreparedCandidate(input);
    assert.equal(staleSource.status, 'not-published'); assert.equal(staleSource.code, 'source-ref-stale');
    absentOutput(f);
    f.git('update-ref', f.request.source.ref, f.source.commit, identicalTreeCommit);

    f.git('update-ref', f.request.publish.outputRef, f.source.commit);
    const staleOutput = await publishPreparedCandidate(input);
    assert.equal(staleOutput.status, 'not-published'); assert.equal(staleOutput.code, 'output-ref-stale');
    assert.equal(f.git('rev-parse', f.request.publish.outputRef), f.source.commit);
    f.git('update-ref', '-d', f.request.publish.outputRef, f.source.commit);

    // Each supplied historical source is checked by the mandatory fresh owner.
    // Removing one commit object leaves original/candidate trees and retained
    // approval bytes intact; this is not a missing-body or semantic-novelty test.
    const sourceRows = [
      ['prior refusal Decision', f.evidence.decisionCaptures[0].capture.source],
      ['current selected Decision declaration', f.final.gate.core.decision.review.decisionCapture.source],
      ['captured reconsideration material', f.evidence.materialCaptures[0].capture.source],
    ];
    assert.equal(new Set(sourceRows.map(([, source]) => source.commit)).size, 3);
    for (const [name, source] of sourceRows) await t.test(`fresh ${name} source unavailable after receipt`, async () => {
      assert.notEqual(source.commit, f.source.commit);
      assert.notEqual(source.commit, f.candidate.commit);
      const object = resolve(f.repoRoot, f.git('rev-parse', '--git-dir'), 'objects', source.commit.slice(0, 2), source.commit.slice(2));
      const original = readFileSync(object), mode = statSync(object).mode & 0o777;
      unlinkSync(object);
      try {
        assert.equal(f.git('cat-file', '-t', f.source.commit), 'commit');
        assert.equal(f.git('cat-file', '-t', f.candidate.commit), 'commit');
        assert.equal(readReview(input).status, 'verified', 'retained receipt integrity remains valid');
        await assert.rejects(recordApprovedCandidateReview(f.writer()),
          error => error instanceof EngineRefusal && error.code === 'review-reconsideration-fresh-final');
        const refused = await publishPreparedCandidate(input);
        assert.equal(refused.status, 'not-published', JSON.stringify(refused));
        assert.equal(refused.code, 'review-reconsideration-fresh-final', JSON.stringify(refused));
        absentOutput(f);
        unchanged(f, index, status);
      } finally { writeFileSync(object, original, { flag: 'wx', mode }); }
    });

    const published = await publishPreparedCandidate(input);
    assert.equal(published.status, 'published', JSON.stringify(published));
    assert.equal(f.git('rev-parse', f.request.publish.outputRef), f.candidate.commit);
    unchanged(f, index, status);
  });
}
