/** Independent actual-Git continuation checks; retained runs require a frozen runtime. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { subjectRetirementMaterialFixture, reviewSubjectRetirementMaterialFixture,
  reviewLimits } from './helpers/subject-retirement-material-fixture.js';
import { runPreparedSubjectRetirementGate } from '../payload/engine/lib/subject-retirement-gate.js';
import { recordApprovedCandidateReview, readRetainedCandidateReview } from '../payload/engine/lib/candidate-review.js';
import { publishPreparedCandidate } from '../payload/engine/lib/publish-prepared-candidate.js';
import { EngineRefusal } from '../payload/engine/lib/engine-refusal.js';

async function passed(input) {
  const result = await runPreparedSubjectRetirementGate(input);
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  assert.equal(result.version, 2);
  return result;
}

function retainedReview(input) {
  return readRetainedCandidateReview({ evidenceDirectory: input.evidenceDirectory,
    validationBundleDigest: input.validationBundleDigest, reviewBundleDigest: input.reviewBundleDigest,
    expectedRequestDigest: input.expectedRequestDigest, limits: reviewLimits });
}

function noOutput(f) {
  assert.equal(f.git('for-each-ref', '--format=%(objectname)', f.request.publish.outputRef), '');
}

for (const [objectFormat, nested] of [['sha1', false], ['sha256', true]]) {
  for (const zero of [true, false]) {
    test(`retirement material publication ${objectFormat} ${zero ? 'zero' : 'positive'}`, async t => {
      const f = await reviewSubjectRetirementMaterialFixture(t, { objectFormat, nested, zero });
      assert.equal(f.final.status, 'passed');
      assert.equal(f.final.gate.version, 2);
      assert.equal(f.retained.artifacts.some(row => row.file === 'checks/operation/event.yaml'), !zero);
      assert.equal(f.request.operationEvidence.assignmentEvent === null, zero);
      const saved = await recordApprovedCandidateReview(f.writer());
      assert.equal(saved.status, 'retained', JSON.stringify(saved));
      const input = f.publisher(saved);
      const retained = retainedReview(input);
      assert.equal(retained.status, 'verified');
      assert.deepEqual(retained.receipt.review.decision, f.final.gate.decision.ref);
      assert.deepEqual(retained.receipt.review.decisionCapture, f.final.gate.decision.decisionCapture);
      assert.equal(retained.receipt.review.decisionDigest, f.final.gate.decision.decisionDigest);
      const original = snapshot(f);

      const control = await publishPreparedCandidate(input);
      assert.equal(control.status, 'published', JSON.stringify(control));
      assert.equal(control.receiptDigest, saved.receiptDigest);
      assert.equal(f.git('rev-parse', f.request.publish.outputRef), f.candidate.commit);
      unchanged(f, original);
      f.git('update-ref', '-d', f.request.publish.outputRef, f.candidate.commit);
      noOutput(f);

      for (const [family, row] of [
        ['Decision', f.input.evidence.decisionCaptures[0]],
        ['material', f.input.evidence.materialCaptures[0]],
      ]) {
        await t.test(`retained receipt cannot replace fresh ${family} source proof`, async () => {
          await withoutSourceCommit(f, row.capture.source, async () => {
            assert.equal(retainedReview(input).status, 'verified');
            await assert.rejects(recordApprovedCandidateReview(f.writer()), error =>
              error instanceof EngineRefusal && error.code === 'review-final-retirement-mismatch');
            const refused = await publishPreparedCandidate(input);
            assert.equal(refused.status, 'not-published', JSON.stringify(refused));
            assert.equal(refused.code, 'review-final-retirement-mismatch', JSON.stringify(refused));
            noOutput(f);
            unchanged(f, original);
          });
        });
      }

      const sameTree = f.git('commit-tree', f.source.tree, '-p', f.source.commit, '-m', 'same tree new source commit');
      assert.notEqual(sameTree, f.source.commit);
      assert.equal(f.git('rev-parse', `${sameTree}^{tree}`), f.source.tree);
      f.git('update-ref', f.request.source.ref, sameTree, f.source.commit);
      try {
        const refused = await publishPreparedCandidate(input);
        assert.equal(refused.status, 'not-published');
        assert.equal(refused.code, 'source-ref-stale');
        noOutput(f);
      } finally {
        f.git('update-ref', f.request.source.ref, f.source.commit, sameTree);
      }

      const restored = await publishPreparedCandidate(input);
      assert.equal(restored.status, 'published', JSON.stringify(restored));
      assert.equal(f.git('rev-parse', f.request.publish.outputRef), f.candidate.commit);
      unchanged(f, original);
    });
  }
}

function snapshot(f) {
  return { index: readFileSync(join(f.repoRoot, '.git/index')), status: f.git('status', '--porcelain') };
}

function unchanged(f, original) {
  assert.deepEqual(readFileSync(join(f.repoRoot, '.git/index')), original.index);
  assert.equal(f.git('status', '--porcelain'), original.status);
}

async function withoutSourceCommit(f, source, callback) {
  assert.notEqual(source.commit, f.input.before.commit);
  assert.notEqual(source.commit, f.input.candidate.commit);
  assert.equal(f.git('cat-file', '-t', source.commit), 'commit');
  const file = resolve(f.repoRoot, f.git('rev-parse', '--git-dir'),
    'objects', source.commit.slice(0, 2), source.commit.slice(2));
  const bytes = readFileSync(file);
  const mode = statSync(file).mode & 0o777;
  unlinkSync(file);
  try {
    assert.equal(f.git('cat-file', '-t', f.input.before.commit), 'commit');
    assert.equal(f.git('cat-file', '-t', f.input.candidate.commit), 'commit');
    await callback();
  } finally {
    writeFileSync(file, bytes, { flag: 'wx', mode });
  }
}

for (const [objectFormat, nested] of [['sha1', false], ['sha256', true]]) {
  for (const zero of [true, false]) {
    test(`retirement material actual provenance ${objectFormat} ${zero ? 'zero' : 'positive'}`, async t => {
      const f = await subjectRetirementMaterialFixture(t, { objectFormat, nested, zero });
      assert.equal(f.reconsideration.ok, true);
      assert.equal(f.git('rev-parse', '--show-object-format'), objectFormat);
      assert.equal(f.input.before.kitPath, nested ? 'unknown-knowledge' : '.');
      const original = snapshot(f);
      await passed(f.input);
      unchanged(f, original);

      // The actual source objects are distinct from the retirement pair. Losing
      // a source leaves the supplied buffers and both current trees intact.
      const sources = [
        ['Decision', f.input.evidence.decisionCaptures[0]],
        ['material', f.input.evidence.materialCaptures[0]],
      ];
      assert.equal(new Set(sources.map(([, row]) => row.capture.source.commit)).size, 2);
      for (const [family, row] of sources) {
        await t.test(`missing declared ${family} source refuses with retained bytes intact`, async () => {
          const retainedBytes = Buffer.from(row.bytes);
          await withoutSourceCommit(f, row.capture.source, async () => {
            const refused = await runPreparedSubjectRetirementGate(f.input);
            assert.equal(refused.ok, false, JSON.stringify(refused));
            assert.ok(refused.diagnostics.length > 0);
            assert.deepEqual(row.bytes, retainedBytes);
            unchanged(f, original);
          });
          await passed(f.input);
          unchanged(f, original);
        });
      }
    });
  }
}
