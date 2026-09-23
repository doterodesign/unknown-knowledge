import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, chmodSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { assignmentReviewFixture } from './helpers/assignment-review-fixture.js';
import { recordApprovedCandidateReview, readRetainedCandidateReview } from '../payload/engine/lib/candidate-review.js';
import { publishPreparedCandidate } from '../payload/engine/lib/publish-prepared-candidate.js';

const transaction = { maxOutputBytes: 100000, maxCommandMilliseconds: 3000, maxTransactionMilliseconds: 15000, maxWorktrees: 10 };
test('real final publisher refuses corrupted approval and stale refs, then atomically publishes the exact reviewed candidate', async (t) => {
  const f = await assignmentReviewFixture(t); const saved = await recordApprovedCandidateReview(f.writer());
  const input = { repoRoot: f.root, evidenceDirectory: f.input.evidenceDirectory,
    validationBundleDigest: f.input.validationBundleDigest, reviewBundleDigest: saved.reviewBundleDigest,
    expectedRequestDigest: saved.requestDigest, approvedRuntimeProfile: f.input.approvedRuntimeProfile,
    limits: { review: f.reviewLimits, execution: f.input.limits.runtime, transaction } };
  const review = readRetainedCandidateReview({ evidenceDirectory: input.evidenceDirectory,
    validationBundleDigest: input.validationBundleDigest, reviewBundleDigest: input.reviewBundleDigest,
    expectedRequestDigest: input.expectedRequestDigest, limits: input.limits.review });
  const authorization = review.artifacts.find((row) => row.file === 'authorization.txt');
  const file = join(input.evidenceDirectory, 'blobs/sha256', authorization.sha256);
  chmodSync(file, 0o600); writeFileSync(file, Buffer.alloc(authorization.size, 120)); chmodSync(file, 0o400);
  assert.equal((await publishPreparedCandidate(input)).status, 'not-published');
  chmodSync(file, 0o600); writeFileSync(file, authorization.bytes); chmodSync(file, 0o400);
  f.git('update-ref', f.request.source.ref, f.candidate.commit);
  const stale = await publishPreparedCandidate(input);
  assert.equal(stale.status, 'not-published'); assert.equal(stale.code, 'source-ref-stale');
  f.git('update-ref', f.request.source.ref, f.source.commit);
  f.git('update-ref', f.request.publish.outputRef, f.source.commit);
  const collision = await publishPreparedCandidate(input);
  assert.equal(collision.status, 'not-published'); assert.equal(collision.code, 'output-ref-stale');
  f.git('update-ref', '-d', f.request.publish.outputRef, f.source.commit);
  const index = readFileSync(join(f.root, '.git/index'));
  const published = await publishPreparedCandidate(input);
  assert.equal(published.status, 'published', JSON.stringify(published));
  assert.equal(f.git('rev-parse', f.request.publish.outputRef), f.candidate.commit);
  assert.equal(f.git('rev-parse', f.request.source.ref), f.source.commit);
  assert.deepEqual(readFileSync(join(f.root, '.git/index')), index);
  assert.equal(published.requestDigest, saved.requestDigest); assert.equal(published.receiptDigest, saved.receiptDigest);
});

test('mechanically valid approved migration still refuses missing impact evidence and never creates a ref', async (t) => {
  const { reviewedFixture } = await import('./helpers/migration-review-fixture.js');
  const { spawnSync } = await import('node:child_process');
  const f = await reviewedFixture(t); const writer = f.input(); const saved = await recordApprovedCandidateReview(writer);
  const result = await publishPreparedCandidate({ repoRoot: f.root, evidenceDirectory: f.evidence,
    validationBundleDigest: f.request.evidence.bundleDigest, reviewBundleDigest: saved.reviewBundleDigest,
    expectedRequestDigest: saved.requestDigest, approvedRuntimeProfile: null,
    limits: { review: writer.limits, execution: null, transaction } });
  assert.equal(result.status, 'not-published'); assert.equal(result.code, 'migration-impact-unavailable');
  const refs = spawnSync('/usr/bin/git', ['-C', f.root, 'for-each-ref', '--format=%(refname)', f.request.publish.outputRef]);
  assert.equal(refs.status, 0); assert.equal(refs.stdout.length, 0);
});

test('lost final commit acknowledgement retains exact publication coordinates without rollback', async (t) => {
  const childProcess = (await import('node:child_process')).default;
  const { syncBuiltinESMExports } = await import('node:module');
  const f = await assignmentReviewFixture(t); const saved = await recordApprovedCandidateReview(f.writer());
  const original = childProcess.spawn;
  childProcess.spawn = (...args) => {
    const child = original(...args);
    if (args[1].includes('update-ref')) {
      const emit = child.stdout.emit.bind(child.stdout);
      child.stdout.emit = (name, bytes, ...rest) => name === 'data' && bytes.includes(Buffer.from('commit: ok'))
        ? true : emit(name, bytes, ...rest);
    }
    return child;
  };
  syncBuiltinESMExports();
  let result;
  try { result = await publishPreparedCandidate({ repoRoot: f.root, evidenceDirectory: f.input.evidenceDirectory,
    validationBundleDigest: f.input.validationBundleDigest, reviewBundleDigest: saved.reviewBundleDigest,
    expectedRequestDigest: saved.requestDigest, approvedRuntimeProfile: f.input.approvedRuntimeProfile,
    limits: { review: f.reviewLimits, execution: f.input.limits.runtime,
      transaction: { ...transaction, maxCommandMilliseconds: 1000 } } }); }
  finally { childProcess.spawn = original; syncBuiltinESMExports(); }
  assert.equal(result.status, 'publication-unknown'); assert.equal(result.requestDigest, saved.requestDigest);
  assert.equal(result.reviewBundleDigest, saved.reviewBundleDigest); assert.equal(result.candidateCommit, f.candidate.commit);
  assert.equal(f.git('rev-parse', f.request.publish.outputRef), f.candidate.commit);
});
