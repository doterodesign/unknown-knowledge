import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { finalEquivalentMergeFixture, evidenceLimits, runtimeLimits } from './helpers/final-equivalent-merge-fixture.js';
import { typedEquivalentMergeFixture } from './helpers/typed-equivalent-merge-fixture.js';
import { runFinalPreparedEquivalentMergeGate } from '../payload/engine/lib/final-prepared-equivalent-merge.js';
import { recordApprovedCandidateReview, readRetainedCandidateReview } from '../payload/engine/lib/candidate-review.js';
import { publishPreparedCandidate } from '../payload/engine/lib/publish-prepared-candidate.js';
import { verifyRetainedRuntimeCapability } from '../payload/engine/lib/runtime-capability.js';
import { canonicalSha256 } from '../payload/engine/lib/canonical-json.js';
import { artifactCapture } from '../payload/engine/lib/prepared-evidence.js';

test('typed nested K/O/D equivalent merge binds actual raw files, retained review and final CAS', async (t) => {
  const f = await finalEquivalentMergeFixture(t, (t) => typedEquivalentMergeFixture(t, { nested: true }));
  const final = await runFinalPreparedEquivalentMergeGate(f.input);
  assert.equal(final.status, 'passed', JSON.stringify(final.diagnostics));
  assert.equal(final.gate.impacts.reach.status, 'incomplete');
  const capability = verifyRetainedRuntimeCapability({ evidenceDirectory: f.input.evidenceDirectory,
    bundleDigest: f.input.validationBundleDigest, expected: f.input.expected, limits: evidenceLimits }, f.input.approvedRuntimeProfile);
  const capture = (file) => artifactCapture(file, f.retained.artifacts.find((row) => row.file === file).bytes);
  const request = { version: 1, operation: 'subject-equivalent-merge', namespace: f.assignmentEvent.namespace, objectFormat: 'sha1',
    source: { ref: 'refs/heads/source', expectedCommit: f.source.commit, tree: f.source.tree, kitPath: f.source.kitPath },
    candidate: f.candidate, runtimeDigest: f.validation.runtimeDigest, policy: { id: final.policy.id, digest: final.policy.digest },
    evidence: { bundleDigest: f.input.validationBundleDigest, reportDigest: f.validation.reportDigest },
    runtimeCapability: { profileDigest: f.input.approvedRuntimeProfile.digest, resultDigest: canonicalSha256(capability), result: capability },
    operationEvidence: { kind: 'subject-equivalent-merge', operationId: final.gate.operation.id, registryEvents: final.gate.sources.registryEvents,
      registryCapture: capture('checks/operation/registry.yaml'), assignmentEvent: { eventId: f.assignmentEvent.event,
        eventDigest: final.gate.sources.assignmentEvent.eventDigest, eventCapture: capture('checks/operation/event.yaml') },
      validation: { inputDigest: final.gate.inputDigest, inputCapture: capture('checks/operation/input.json'),
        reportDigest: canonicalSha256(final.gate), reportCapture: capture('checks/operation/result') },
      finalGate: { resultDigest: canonicalSha256(final), result: final } },
    publish: { outputRef: 'refs/unknown-knowledge/candidates/12345678-1234-4123-8123-123456789abc', expectedOldCommit: null } };
  f.git('update-ref', request.source.ref, f.source.commit);
  const review = { ...evidenceLimits, maxRequestBytes: 20000000, maxAuthorizationBytes: 10000, maxReceiptBytes: 100000 };
  const writer = (value = request) => ({ repoRoot: f.root, evidenceDirectory: f.input.evidenceDirectory, request: value,
    approvedRuntimeProfile: f.input.approvedRuntimeProfile, limits: review, executionLimits: runtimeLimits,
    authorization: { outcome: 'approved', requestDigest: canonicalSha256(value), reference: 'synthetic fixture operator', bytes: Buffer.from('Synthetic approval for this exact test request.') } });
  const wrongNamespace = structuredClone(request); wrongNamespace.namespace = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  await assert.rejects(recordApprovedCandidateReview(writer(wrongNamespace)), /authorizer/);
  const changed = structuredClone(request); changed.operationEvidence.finalGate.result.gate.publicationReady = true;
  changed.operationEvidence.finalGate.resultDigest = canonicalSha256(changed.operationEvidence.finalGate.result);
  await assert.rejects(recordApprovedCandidateReview(writer(changed)), /final-merge-mismatch/);
  const saved = await recordApprovedCandidateReview(writer());
  const read = readRetainedCandidateReview({ evidenceDirectory: f.input.evidenceDirectory, reviewBundleDigest: saved.reviewBundleDigest,
    expectedRequestDigest: saved.requestDigest, validationBundleDigest: f.input.validationBundleDigest, limits: review });
  assert.equal(read.artifacts.length, 3); assert.deepEqual(read.receipt.review.decision, f.assignmentEvent.decision);
  const input = { repoRoot: f.root, evidenceDirectory: f.input.evidenceDirectory, validationBundleDigest: f.input.validationBundleDigest,
    reviewBundleDigest: saved.reviewBundleDigest, expectedRequestDigest: saved.requestDigest, approvedRuntimeProfile: f.input.approvedRuntimeProfile,
    limits: { review, execution: runtimeLimits, transaction: { maxOutputBytes: 100000, maxCommandMilliseconds: 3000, maxTransactionMilliseconds: 15000, maxWorktrees: 10 } } };
  f.git('update-ref', request.source.ref, f.candidate.commit);
  assert.equal((await publishPreparedCandidate(input)).code, 'source-ref-stale');
  f.git('update-ref', request.source.ref, f.source.commit);
  const index = readFileSync(join(f.root, '.git/index'));
  const published = await publishPreparedCandidate(input);
  assert.equal(published.status, 'published', JSON.stringify(published));
  assert.equal(f.git('rev-parse', request.publish.outputRef), f.candidate.commit);
  assert.deepEqual(readFileSync(join(f.root, '.git/index')), index);
});
