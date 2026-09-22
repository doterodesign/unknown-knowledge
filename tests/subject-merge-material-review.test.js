/** Independent positive-merge continuation; native zero-use merge remains unsupported. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { reviewSubjectMergeMaterialFixture, reviewLimits } from './helpers/subject-merge-material-fixture.js';
import { recordApprovedCandidateReview, readRetainedCandidateReview } from '../payload/engine/lib/candidate-review.js';
import { publishPreparedCandidate } from '../payload/engine/lib/publish-prepared-candidate.js';
import { EngineRefusal } from '../payload/engine/lib/engine-refusal.js';

function readReview(input) {
  return readRetainedCandidateReview({ evidenceDirectory: input.evidenceDirectory,
    validationBundleDigest: input.validationBundleDigest, reviewBundleDigest: input.reviewBundleDigest,
    expectedRequestDigest: input.expectedRequestDigest, limits: reviewLimits });
}

for (const [objectFormat, nested] of [['sha1', false], ['sha256', true]]) {
  test(`material merge publication preserves actual source authority ${objectFormat}`, async t => {
    const f = await reviewSubjectMergeMaterialFixture(t, { objectFormat, nested });
    assert.equal(f.reconsideration.ok, true);
    assert.equal(f.final.status, 'passed');
    assert.equal(f.final.gate.version, 2);
    assert.equal(f.git('rev-parse', '--show-object-format'), objectFormat);
    assert.equal(f.source.kitPath, nested ? 'unknown-knowledge' : '.');
    assert.ok(f.request.operationEvidence.assignmentEvent);
    assert.equal(f.retained.artifacts.filter(row => row.file === 'checks/operation/event.yaml').length, 1);
    const saved = await recordApprovedCandidateReview(f.writer());
    assert.equal(saved.status, 'retained', JSON.stringify(saved));
    const input = f.publisher(saved), retained = readReview(input);
    assert.equal(retained.status, 'verified');
    assert.deepEqual(retained.receipt.review.decision, f.assignmentEvent.decision);
    assert.deepEqual(retained.receipt.review.decisionCapture, f.assignmentEvent.review['decision-capture']);
    assert.equal(retained.receipt.review.decisionDigest, f.assignmentEvent.review['decision-digest']);
    const index = readFileSync(join(f.root, '.git/index')), status = f.git('status', '--porcelain');
    const unchanged = () => {
      assert.deepEqual(readFileSync(join(f.root, '.git/index')), index);
      assert.equal(f.git('status', '--porcelain'), status);
      assert.equal(f.git('rev-parse', f.request.source.ref), f.source.commit);
    };
    const absent = () => assert.equal(f.git('for-each-ref', '--format=%(objectname)', f.request.publish.outputRef), '');
    const control = await publishPreparedCandidate(input);
    assert.equal(control.status, 'published', JSON.stringify(control));
    assert.equal(control.receiptDigest, saved.receiptDigest);
    assert.equal(f.git('rev-parse', f.request.publish.outputRef), f.candidate.commit);
    unchanged();
    f.git('update-ref', '-d', f.request.publish.outputRef, f.candidate.commit);

    for (const [family, row] of [
      ['Decision', f.input.evidence.decisionCaptures[0]],
      ['material', f.input.evidence.materialCaptures[0]],
    ]) await t.test(`fresh ${family} source loss refuses despite a valid retained receipt`, async () => {
      const source = row.capture.source;
      assert.notEqual(source.commit, f.source.commit);
      assert.notEqual(source.commit, f.candidate.commit);
      const file = resolve(f.root, f.git('rev-parse', '--git-dir'), 'objects', source.commit.slice(0, 2), source.commit.slice(2));
      const bytes = readFileSync(file), mode = statSync(file).mode & 0o777;
      unlinkSync(file);
      try {
        assert.equal(f.git('cat-file', '-t', f.source.commit), 'commit');
        assert.equal(f.git('cat-file', '-t', f.candidate.commit), 'commit');
        assert.equal(readReview(input).status, 'verified');
        await assert.rejects(recordApprovedCandidateReview(f.writer()), error =>
          error instanceof EngineRefusal && error.code === 'review-final-merge-mismatch');
        const refused = await publishPreparedCandidate(input);
        assert.equal(refused.status, 'not-published', JSON.stringify(refused));
        assert.equal(refused.code, 'review-final-merge-mismatch', JSON.stringify(refused));
        absent(); unchanged();
      } finally {
        writeFileSync(file, bytes, { flag: 'wx', mode });
      }
    });

    const sameTree = f.git('commit-tree', f.source.tree, '-p', f.source.commit, '-m', 'same tree distinct merge source');
    assert.notEqual(sameTree, f.source.commit);
    assert.equal(f.git('rev-parse', `${sameTree}^{tree}`), f.source.tree);
    f.git('update-ref', f.request.source.ref, sameTree, f.source.commit);
    try {
      const stale = await publishPreparedCandidate(input);
      assert.equal(stale.status, 'not-published');
      assert.equal(stale.code, 'source-ref-stale');
      absent();
    } finally {
      f.git('update-ref', f.request.source.ref, f.source.commit, sameTree);
    }
    const restored = await publishPreparedCandidate(input);
    assert.equal(restored.status, 'published', JSON.stringify(restored));
    assert.equal(f.git('rev-parse', f.request.publish.outputRef), f.candidate.commit);
    unchanged();
  });
}
