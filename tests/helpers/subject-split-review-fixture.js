/** Actual retained split review inputs; authorization/profile are synthetic test fixtures. */
import assert from 'node:assert/strict';
import { finalSubjectSplitFixture, evidenceLimits, runtimeLimits } from './final-subject-split-fixture.js';
import { runFinalPreparedSubjectSplitGate } from '../../payload/engine/lib/final-prepared-subject-split.js';
import { canonicalSha256 } from '../../payload/engine/lib/canonical-json.js';
import { artifactCapture } from '../../payload/engine/lib/prepared-evidence.js';
import { verifyRetainedRuntimeCapability } from '../../payload/engine/lib/runtime-capability.js';

export const reviewLimits = { ...evidenceLimits, maxRequestBytes: 20000000, maxAuthorizationBytes: 10000, maxReceiptBytes: 100000 };
export async function subjectSplitReviewFixture(t, options = {}) {
  const f = await finalSubjectSplitFixture(t, options);
  const final = await runFinalPreparedSubjectSplitGate(f.input);
  assert.equal(final.status, 'passed', JSON.stringify(final));
  const validationInput = { evidenceDirectory: f.input.evidenceDirectory, bundleDigest: f.input.validationBundleDigest,
    expected: f.input.expected, limits: evidenceLimits };
  const capability = verifyRetainedRuntimeCapability(validationInput, f.input.approvedRuntimeProfile);
  const member = file => f.retained.artifacts.find(row => row.file === `checks/operation/${file}`);
  const capture = file => artifactCapture(member(file).file, member(file).bytes);
  const zero = f.operationInputs.gateInput.operation.assignmentEvent === null;
  const request = { version: 1, operation: 'subject-split', namespace: final.gate.decision.ref.namespace,
    objectFormat: f.source.commit.length === 40 ? 'sha1' : 'sha256',
    source: { ref: 'refs/heads/source', expectedCommit: f.source.commit, tree: f.source.tree, kitPath: f.source.kitPath },
    candidate: f.candidate, runtimeDigest: f.validation.runtimeDigest, policy: { id: final.policy.id, digest: final.policy.digest },
    evidence: { bundleDigest: f.input.validationBundleDigest, reportDigest: f.validation.reportDigest },
    runtimeCapability: { profileDigest: f.input.approvedRuntimeProfile.digest, resultDigest: canonicalSha256(capability), result: capability },
    operationEvidence: { kind: 'subject-split', operationId: final.gate.operation.id,
      registryEvents: structuredClone(final.gate.sources.registryEvents), registryCapture: capture('registry.yaml'), identityCapture: capture('identity.yaml'),
      assignmentEvent: zero ? null : { eventId: final.gate.sources.assignmentEvent.eventId,
        eventDigest: final.gate.sources.assignmentEvent.eventDigest, eventCapture: capture('event.yaml') },
      decision: structuredClone(final.gate.decision), validation: { inputDigest: final.gate.inputDigest,
        inputCapture: capture('input.json'), reportDigest: canonicalSha256(final.gate), reportCapture: capture('result') },
      finalGate: { resultDigest: canonicalSha256(final), result: final } },
    publish: { outputRef: 'refs/unknown-knowledge/candidates/12345678-1234-4123-8123-123456789abc', expectedOldCommit: null } };
  f.git('update-ref', request.source.ref, f.source.commit);
  const writer = (value = request) => ({ repoRoot: f.root, evidenceDirectory: f.input.evidenceDirectory,
    request: value, approvedRuntimeProfile: f.input.approvedRuntimeProfile, limits: reviewLimits, executionLimits: runtimeLimits,
    authorization: { outcome: 'approved', requestDigest: canonicalSha256(value), reference: 'synthetic operator authorization distinct from registry review',
      bytes: Buffer.from('Synthetic authorization for this exact isolated test request.') } });
  const publisher = saved => ({ repoRoot: f.root, evidenceDirectory: f.input.evidenceDirectory,
    validationBundleDigest: request.evidence.bundleDigest, reviewBundleDigest: saved.reviewBundleDigest,
    expectedRequestDigest: saved.requestDigest, approvedRuntimeProfile: f.input.approvedRuntimeProfile,
    limits: { review: reviewLimits, execution: runtimeLimits,
      transaction: { maxOutputBytes: 100000, maxCommandMilliseconds: 3000, maxTransactionMilliseconds: 15000, maxWorktrees: 10 } } });
  const adapterInput = { repoRoot: f.root, request,
    artifacts: { registry: member('registry.yaml'), identity: member('identity.yaml'), input: member('input.json'), report: member('result'), event: zero ? null : member('event.yaml') },
    validationInput, approvedRuntimeProfile: f.input.approvedRuntimeProfile, executionLimits: runtimeLimits };
  return { ...f, final, request, writer, publisher, adapterInput, validationInput };
}
