import assert from 'node:assert/strict';
import { finalAssignmentFixture, runtimeLimits, evidenceLimits } from './final-assignment-fixture.js';
import { runFinalPreparedAssignmentGate } from '../../payload/engine/lib/final-prepared-assignment.js';
import { verifyRetainedRuntimeCapability } from '../../payload/engine/lib/runtime-capability.js';
import { canonicalSha256 } from '../../payload/engine/lib/canonical-json.js';

export async function assignmentReviewFixture(t) {
  const f = await finalAssignmentFixture(t); const result = await runFinalPreparedAssignmentGate(f.input);
  assert.equal(result.status, 'passed', JSON.stringify(result.diagnostics));
  const capability = verifyRetainedRuntimeCapability({ evidenceDirectory: f.input.evidenceDirectory,
    bundleDigest: f.input.validationBundleDigest, expected: f.input.expected, limits: evidenceLimits }, f.input.approvedRuntimeProfile);
  const request = { version: 1, operation: 'subject-assignment', namespace: f.event.namespace, objectFormat: 'sha1',
    source: { ref: 'refs/heads/source', expectedCommit: f.source.commit, tree: f.source.tree, kitPath: f.source.kitPath },
    candidate: f.candidate, runtimeDigest: f.validation.runtimeDigest,
    policy: { id: result.policy.id, digest: result.policy.digest },
    evidence: { bundleDigest: f.input.validationBundleDigest, reportDigest: f.validation.reportDigest },
    runtimeCapability: { profileDigest: f.input.approvedRuntimeProfile.digest, resultDigest: canonicalSha256(capability), result: capability },
    operationEvidence: { kind: 'subject-assignment', event: f.options.eventId, eventCapture: f.validation.report.eventSource.capture,
      eventDigest: f.validation.report.eventSource.eventDigest, finalGate: { resultDigest: canonicalSha256(result), result } },
    publish: { outputRef: 'refs/unknown-knowledge/candidates/12345678-1234-4123-8123-123456789abc', expectedOldCommit: null } };
  f.git('update-ref', request.source.ref, f.source.commit);
  const limits = { ...evidenceLimits, maxRequestBytes: 20000000, maxAuthorizationBytes: 10000, maxReceiptBytes: 100000 };
  const writer = () => ({ repoRoot: f.root, evidenceDirectory: f.input.evidenceDirectory, request: structuredClone(request),
    approvedRuntimeProfile: structuredClone(f.input.approvedRuntimeProfile), executionLimits: { ...runtimeLimits }, limits,
    authorization: { outcome: 'approved', requestDigest: canonicalSha256(request), reference: 'fixture independent operator approval',
      bytes: Buffer.from('Fixture: actual approval response for the attached immutable request.') } });
  return { ...f, request, writer, reviewLimits: limits };
}

