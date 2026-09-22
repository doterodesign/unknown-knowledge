import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { retainedAssignmentContinuationFixture } from './helpers/assignment-continuation-fixture.js';
import { runFinalPreparedAssignmentGate } from '../payload/engine/lib/final-prepared-assignment.js';
import { verifyRetainedRuntimeCapability } from '../payload/engine/lib/runtime-capability.js';
import { canonicalSha256 } from '../payload/engine/lib/canonical-json.js';
import { recordApprovedCandidateReview, readRetainedCandidateReview } from '../payload/engine/lib/candidate-review.js';
import { publishPreparedCandidate } from '../payload/engine/lib/publish-prepared-candidate.js';

async function reviewFixture(t, options) {
  const f = await retainedAssignmentContinuationFixture(t, options);
  const final = await runFinalPreparedAssignmentGate(f.input);
  assert.equal(final.status, 'passed', JSON.stringify(final));
  const capability = verifyRetainedRuntimeCapability({ evidenceDirectory: f.input.evidenceDirectory,
    bundleDigest: f.input.validationBundleDigest, expected: f.input.expected, limits: f.input.limits.evidence }, f.input.approvedRuntimeProfile);
  const request = { version: 1, operation: 'subject-assignment', namespace: f.event.namespace, objectFormat: options.objectFormat,
    source: { ref: 'refs/heads/source', expectedCommit: f.source.commit, tree: f.source.tree, kitPath: f.source.kitPath },
    candidate: f.candidate, runtimeDigest: f.validation.runtimeDigest, policy: { id: final.policy.id, digest: final.policy.digest },
    evidence: { bundleDigest: f.input.validationBundleDigest, reportDigest: f.validation.reportDigest },
    runtimeCapability: { profileDigest: f.input.approvedRuntimeProfile.digest, resultDigest: canonicalSha256(capability), result: capability },
    operationEvidence: { kind: 'subject-assignment', event: f.options.eventId, eventCapture: f.validation.report.eventSource.capture,
      eventDigest: f.validation.report.eventSource.eventDigest, finalGate: { resultDigest: canonicalSha256(final), result: final } },
    publish: { outputRef: 'refs/unknown-knowledge/candidates/12345678-1234-4123-8123-123456789abc', expectedOldCommit: null } };
  f.git('update-ref', request.source.ref, f.source.commit);
  const limits = { ...f.input.limits.evidence, maxRequestBytes: 20000000, maxAuthorizationBytes: 10000, maxReceiptBytes: 100000 };
  const writer = (value = request) => ({ repoRoot: f.root, evidenceDirectory: f.input.evidenceDirectory, request: value,
    approvedRuntimeProfile: f.input.approvedRuntimeProfile, executionLimits: f.input.limits.runtime, limits,
    authorization: { outcome: 'approved', requestDigest: canonicalSha256(value), reference: 'synthetic fixture operator authorization',
      bytes: Buffer.from('Synthetic approval for this exact isolated assignment request.') } });
  const publisher = saved => ({ repoRoot: f.root, evidenceDirectory: f.input.evidenceDirectory,
    validationBundleDigest: f.input.validationBundleDigest, reviewBundleDigest: saved.reviewBundleDigest,
    expectedRequestDigest: saved.requestDigest, approvedRuntimeProfile: f.input.approvedRuntimeProfile,
    limits: { review: limits, execution: f.input.limits.runtime,
      transaction: { maxOutputBytes: 100000, maxCommandMilliseconds: 3000, maxTransactionMilliseconds: 15000, maxWorktrees: 10 } } });
  return { ...f, final, request, writer, publisher };
}

for (const [objectFormat, nested] of [['sha1', false], ['sha256', true]]) {
  test(`actual continuation review/publication ${objectFormat} nested=${nested} binds fresh proof and unchanged CAS`, async t => {
    const f = await reviewFixture(t, { objectFormat, nested });
    const saved = await recordApprovedCandidateReview(f.writer());
    assert.equal(saved.status, 'retained', JSON.stringify(saved));
    const input = f.publisher(saved);
    const receipt = readRetainedCandidateReview({ evidenceDirectory: input.evidenceDirectory,
      validationBundleDigest: input.validationBundleDigest, reviewBundleDigest: input.reviewBundleDigest,
      expectedRequestDigest: input.expectedRequestDigest, limits: input.limits.review });
    assert.equal(receipt.status, 'verified');
    assert.deepEqual(receipt.receipt.review.decision, f.event.decision);
    const index = readFileSync(join(f.root, '.git/index')), status = f.git('status', '--porcelain');
    const published = await publishPreparedCandidate(input);
    assert.equal(published.status, 'published', JSON.stringify(published));
    assert.equal(published.requestDigest, saved.requestDigest);
    assert.equal(f.git('rev-parse', f.request.publish.outputRef), f.candidate.commit);
    f.git('update-ref', '-d', f.request.publish.outputRef, f.candidate.commit);

    f.git('update-ref', f.request.source.ref, f.candidate.commit);
    const stale = await publishPreparedCandidate(input);
    assert.equal(stale.status, 'not-published');
    assert.equal(stale.code, 'source-ref-stale');
    f.git('update-ref', f.request.source.ref, f.source.commit);
    f.git('update-ref', f.request.publish.outputRef, f.source.commit);
    const collision = await publishPreparedCandidate(input);
    assert.equal(collision.status, 'not-published');
    assert.equal(collision.code, 'output-ref-stale');
    f.git('update-ref', '-d', f.request.publish.outputRef, f.source.commit);

    const material = f.options.continuation.materialCaptures.find(row => row.capture.source);
    assert.ok(material);
    const commit = material.capture.source.commit;
    assert.notEqual(commit, f.source.commit);
    const path = join(f.root, '.git/objects', commit.slice(0, 2), commit.slice(2)), bytes = readFileSync(path);
    unlinkSync(path);
    let unavailable;
    try { unavailable = await publishPreparedCandidate(input); }
    finally { writeFileSync(path, bytes, { flag: 'wx' }); }
    assert.equal(unavailable.status, 'not-published', JSON.stringify(unavailable));
    assert.equal(f.git('for-each-ref', '--format=%(objectname)', f.request.publish.outputRef), '');
    assert.equal(f.git('rev-parse', f.request.source.ref), f.source.commit);
    assert.deepEqual(readFileSync(join(f.root, '.git/index')), index);
    assert.equal(f.git('status', '--porcelain'), status);
  });
}

test('a rehashed supplied final counter cannot replace the independently rerun final result', async t => {
  const f = await reviewFixture(t, { objectFormat: 'sha1', nested: false });
  const control = await recordApprovedCandidateReview(f.writer());
  assert.equal(control.status, 'retained');
  const changed = structuredClone(f.request);
  changed.operationEvidence.finalGate.result.gate.continuation.governance.used.documentNodes--;
  changed.operationEvidence.finalGate.resultDigest = canonicalSha256(changed.operationEvidence.finalGate.result);
  await assert.rejects(recordApprovedCandidateReview(f.writer(changed)));
});
