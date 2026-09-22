import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { finalSubjectRetirementFixture, evidenceLimits, runtimeLimits } from './helpers/final-subject-retirement-fixture.js';
import { canonicalSha256 } from '../payload/engine/lib/canonical-json.js';
import { artifactCapture } from '../payload/engine/lib/prepared-evidence.js';
import { verifyRetainedRuntimeCapability } from '../payload/engine/lib/runtime-capability.js';

for (const zero of [true, false]) test(`actual ${zero ? 'eventless' : 'nonempty'} retirement binds Decision review and final isolated CAS`, async t => {
  const f = await finalSubjectRetirementFixture(t, { zero, nested: zero, objectFormat: zero ? 'sha256' : 'sha1',
    kind: zero ? 'knowledge' : 'decision' });
  assert.equal(f.git('rev-parse', '--show-object-format'), zero ? 'sha256' : 'sha1');
  assert.equal(f.candidate.commit.length, zero ? 64 : 40);
  const { runFinalPreparedSubjectRetirementGate } = await import('../payload/engine/lib/final-prepared-subject-retirement.js');
  const { recordApprovedCandidateReview, readRetainedCandidateReview } = await import('../payload/engine/lib/candidate-review.js');
  const { publishPreparedCandidate } = await import('../payload/engine/lib/publish-prepared-candidate.js');
  const final = await runFinalPreparedSubjectRetirementGate(f.input);
  assert.equal(final.status, 'passed', JSON.stringify(final));
  const capability = verifyRetainedRuntimeCapability({ evidenceDirectory: f.input.evidenceDirectory,
    bundleDigest: f.input.validationBundleDigest, expected: f.input.expected, limits: evidenceLimits }, f.input.approvedRuntimeProfile);
  const capture = file => artifactCapture(file, f.retained.artifacts.find(row => row.file === file).bytes);
  const request = { version: 1, operation: 'subject-retirement', namespace: final.gate.decision.ref.namespace,
    objectFormat: zero ? 'sha256' : 'sha1',
    source: { ref: 'refs/heads/source', expectedCommit: f.source.commit, tree: f.source.tree, kitPath: f.source.kitPath },
    candidate: f.candidate, runtimeDigest: f.validation.runtimeDigest, policy: { id: final.policy.id, digest: final.policy.digest },
    evidence: { bundleDigest: f.input.validationBundleDigest, reportDigest: f.validation.reportDigest },
    runtimeCapability: { profileDigest: f.input.approvedRuntimeProfile.digest, resultDigest: canonicalSha256(capability), result: capability },
    operationEvidence: { kind: 'subject-retirement', operationId: final.gate.operation.id, registryEvents: final.gate.sources.registryEvents,
      registryCapture: capture('checks/operation/registry.yaml'), assignmentEvent: zero ? null : {
        eventId: final.gate.sources.assignmentEvent.eventId, eventDigest: final.gate.sources.assignmentEvent.eventDigest,
        eventCapture: capture('checks/operation/event.yaml') }, decision: structuredClone(final.gate.decision),
      validation: { inputDigest: final.gate.inputDigest, inputCapture: capture('checks/operation/input.json'),
        reportDigest: canonicalSha256(final.gate), reportCapture: capture('checks/operation/result') },
      finalGate: { resultDigest: canonicalSha256(final), result: final } },
    publish: { outputRef: 'refs/unknown-knowledge/candidates/12345678-1234-4123-8123-123456789abc', expectedOldCommit: null } };
  f.git('update-ref', request.source.ref, f.source.commit);
  const review = { ...evidenceLimits, maxRequestBytes: 20000000, maxAuthorizationBytes: 10000, maxReceiptBytes: 100000 };
  const writer = value => ({ repoRoot: f.root, evidenceDirectory: f.input.evidenceDirectory, request: value,
    approvedRuntimeProfile: f.input.approvedRuntimeProfile, limits: review, executionLimits: runtimeLimits,
    authorization: { outcome: 'approved', requestDigest: canonicalSha256(value), reference: 'synthetic operator authorization, distinct from registry review',
      bytes: Buffer.from('Synthetic approval for this exact isolated test request.') } });
  for (const mutate of [
    r => { r.namespace = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'; },
    r => { delete r.operationEvidence.decision; },
    r => { r.operationEvidence.decision.ref.id = 'D-000002'; },
    r => { r.operationEvidence.decision.reference += '-tampered'; },
    r => { r.operationEvidence.decision.acceptedStatus = 'addressed'; },
    r => { r.operationEvidence.decision.decisionDigest = 'f'.repeat(64); },
    r => { r.operationEvidence.decision.decisionCapture = { ...r.operationEvidence.decision.decisionCapture,
      source: { commit: f.source.commit, tree: 'f'.repeat(f.source.tree.length) } }; },
    r => { r.operationEvidence.assignmentEvent = zero ? { eventId: f.event.id, eventDigest: 'f'.repeat(64), eventCapture: capture('checks/operation/registry.yaml') } : null; },
  ]) {
    const changed = structuredClone(request); mutate(changed);
    await assert.rejects(recordApprovedCandidateReview(writer(changed)), /retirement|review-operation|review-authorizer/);
  }
  const changed = structuredClone(request);
  changed.operationEvidence.finalGate.result.gate.publicationReady = true;
  changed.operationEvidence.finalGate.resultDigest = canonicalSha256(changed.operationEvidence.finalGate.result);
  await assert.rejects(recordApprovedCandidateReview(writer(changed)), /retirement/);
  const saved = await recordApprovedCandidateReview(writer(request));
  const retained = readRetainedCandidateReview({ evidenceDirectory: f.input.evidenceDirectory, reviewBundleDigest: saved.reviewBundleDigest,
    expectedRequestDigest: saved.requestDigest, validationBundleDigest: f.input.validationBundleDigest, limits: review });
  assert.equal(retained.status, 'verified'); assert.equal(retained.artifacts.length, 3);
  assert.deepEqual(retained.receipt.review.decision, final.gate.decision.ref);
  assert.deepEqual(retained.receipt.review.decisionCapture, final.gate.decision.decisionCapture);
  assert.equal(retained.receipt.review.decisionDigest, final.gate.decision.decisionDigest);
  assert.notEqual(retained.receipt.review.reference, final.gate.decision.reference);
  const input = { repoRoot: f.root, evidenceDirectory: f.input.evidenceDirectory, validationBundleDigest: f.input.validationBundleDigest,
    reviewBundleDigest: saved.reviewBundleDigest, expectedRequestDigest: saved.requestDigest, approvedRuntimeProfile: f.input.approvedRuntimeProfile,
    limits: { review, execution: runtimeLimits, transaction: { maxOutputBytes: 100000, maxCommandMilliseconds: 3000, maxTransactionMilliseconds: 15000, maxWorktrees: 10 } } };
  f.git('update-ref', request.source.ref, f.candidate.commit);
  assert.equal((await publishPreparedCandidate(input)).code, 'source-ref-stale');
  f.git('update-ref', request.source.ref, f.source.commit);
  const index = readFileSync(join(f.root, '.git/index')); const status = f.git('status', '--porcelain');
  const published = await publishPreparedCandidate(input);
  assert.equal(published.status, 'published', JSON.stringify(published));
  assert.equal(f.git('rev-parse', request.publish.outputRef), f.candidate.commit);
  assert.deepEqual(readFileSync(join(f.root, '.git/index')), index); assert.equal(f.git('status', '--porcelain'), status);
  assert.equal((await publishPreparedCandidate(input)).status, 'not-published', 'Existing output cannot be silently replaced');
});
