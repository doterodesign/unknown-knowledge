import { subjectCreationFixture } from './subject-creation-fixture.js';
import { reconsiderationImpactLimits } from './subject-reconsideration-gate-fixture.js';
/** Real immutable reconsideration fixtures. Runtime approval is synthetic test configuration. */
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { subjectReconsiderationGateFixture } from './subject-reconsideration-gate-fixture.js';
import { subjectReconsiderationInputWire } from '../../payload/engine/lib/subject-reconsideration-input.js';
import { canonicalSha256 } from '../../payload/engine/lib/canonical-json.js';
import { artifactCapture, readRetainedPreparedEvidence, retainPreparedEvidence } from '../../payload/engine/lib/prepared-evidence.js';
import { verifyRetainedRuntimeCapability } from '../../payload/engine/lib/runtime-capability.js';

export const runtimeLimits = { maxRuntimeFiles: 3000, maxRuntimeBytes: 30000000,
  maxOutputBytesPerCheck: 50000000, maxCheckMilliseconds: 120000 };
export const evidenceLimits = { maxManifestBytes: 2000000, maxArtifacts: 4000,
  maxArtifactBytes: 60000000, maxTotalArtifactBytes: 400000000 };
export const reviewLimits = { ...evidenceLimits, maxRequestBytes: 60000000,
  maxAuthorizationBytes: 10000, maxReceiptBytes: 100000 };

/** Setup only: no runner, final gate, or additional owner evaluation. */
export function preparedReconsiderationFixture(t, options = {}) { return prepareFixture(t, options, false); }
export function preparedCreationFixture(t, options = {}) { return prepareFixture(t, options, true); }
function prepareFixture(t, options, ordinary) {
  const f = ordinary ? subjectCreationFixture(t, options) : subjectReconsiderationGateFixture(t, options);
  if (ordinary) { f.impact = reconsiderationImpactLimits(); f.gateInput = () => ({ ...f.input(), impact: f.impact }); }
  const rawInput = f.gateInput();
  const gateInput = { ...subjectReconsiderationInputWire(rawInput), impact: structuredClone(rawInput.impact) };
  const captureLimits = { maxRegistryBytes: Buffer.byteLength(f.read('subjects/registry.yaml')),
    maxIdentityBytes: Buffer.byteLength(f.read('_identity.yaml')) };
  const evidenceDirectory = mkdtempSync(join(dirname(f.repoRoot), 'reconsideration-evidence-'));
  t.after(() => rmSync(evidenceDirectory, { recursive: true, force: true }));
  const operationInputs = { gateInput, captureLimits };
  const runnerInput = { repoRoot: f.repoRoot, source: f.before, candidate: f.candidate,
    operation: ordinary ? 'subject-creation' : 'subject-reconsideration', operationInputs, limits: runtimeLimits, evidenceDirectory };
  return { ...f, rawInput, gateInput, source: f.before, captureLimits, operationInputs, runnerInput, evidenceDirectory };
}

/** Actual runner and readback; despite its name this does not run the final gate. */
export async function finalReconsiderationFixture(t, options = {}) { return finalFixture(t, options, false); }
export async function finalCreationFixture(t, options = {}) { return finalFixture(t, options, true); }
async function finalFixture(t, options, ordinary) {
  const f = prepareFixture(t, options, ordinary);
  const { runPreparedCandidateChecks } = await import('../../payload/engine/lib/prepared-validation.js');
  const validation = await runPreparedCandidateChecks(f.runnerInput);
  assert.equal(validation.retention?.status, 'retained', JSON.stringify(validation));
  const expected = { source: f.source, candidate: f.candidate, operation: f.runnerInput.operation,
    runtimeDigest: validation.runtimeDigest, reportDigest: validation.reportDigest };
  const validationInput = { evidenceDirectory: f.evidenceDirectory, bundleDigest: validation.retention.bundleDigest,
    expected, limits: evidenceLimits };
  const retained = readRetainedPreparedEvidence(validationInput);
  assert.equal(retained.status, 'verified', JSON.stringify(retained.diagnostics));
  const profile = { version: 1, id: 'subject-route-persistence-unsupported-v1',
    scope: 'kit-managed-subject-route-persistence', persistence: 'unsupported', managedPaths: [],
    exclusions: ['caller-request-files', 'external-client-saved-routes', 'arbitrary-repository-json'], files: retained.runtimeManifest.files };
  const approvedRuntimeProfile = { digest: canonicalSha256(profile), profile };
  const artifact = retained.artifacts.find(row => row.file === 'checks/operation/result');
  const gate = artifact ? JSON.parse(artifact.bytes) : null;
  const finalInput = { repoRoot: f.repoRoot, evidenceDirectory: f.evidenceDirectory,
    validationBundleDigest: validation.retention.bundleDigest, expected, approvedRuntimeProfile,
    limits: { evidence: evidenceLimits, runtime: runtimeLimits } };
  return { ...f, validation, retained, gate, finalInput, validationInput, approvedRuntimeProfile };
}

/** Only actual final success can seed a review request. */
export async function reconsiderationReviewFixture(t, options = {}) { return reviewFixture(t, options, false); }
export async function creationReviewFixture(t, options = {}) { return reviewFixture(t, options, true); }
async function reviewFixture(t, options, ordinary) {
  const f = await finalFixture(t, options, ordinary);
  const runFinalPreparedSubjectReconsiderationGate = ordinary
    ? (await import('../../payload/engine/lib/final-prepared-subject-creation.js')).runFinalPreparedSubjectCreationGate
    : (await import('../../payload/engine/lib/final-prepared-subject-reconsideration.js')).runFinalPreparedSubjectReconsiderationGate;
  const final = await runFinalPreparedSubjectReconsiderationGate(f.finalInput);
  assert.equal(final.status, 'passed', JSON.stringify(final.diagnostics));
  const capability = verifyRetainedRuntimeCapability(f.validationInput, f.approvedRuntimeProfile);
  assert.deepEqual(final.capability, { profileDigest: f.approvedRuntimeProfile.digest, resultDigest: canonicalSha256(capability) });
  const member = file => f.retained.artifacts.find(row => row.file === `checks/operation/${file}`);
  const capture = file => artifactCapture(member(file).file, member(file).bytes);
  const { ref, review } = final.gate.core.decision;
  const decision = { ref, reference: review.reference, acceptedStatus: review.acceptedStatus,
    decisionDigest: review.decisionDigest, decisionCapture: review.decisionCapture };
  const request = { version: 1, operation: f.runnerInput.operation, namespace: ref.namespace,
    objectFormat: f.source.commit.length === 40 ? 'sha1' : 'sha256',
    source: { ref: 'refs/heads/source', expectedCommit: f.source.commit, tree: f.source.tree, kitPath: f.source.kitPath },
    candidate: f.candidate, runtimeDigest: f.validation.runtimeDigest, policy: { id: final.policy.id, digest: final.policy.digest },
    evidence: { bundleDigest: f.validation.retention.bundleDigest, reportDigest: f.validation.reportDigest },
    runtimeCapability: { profileDigest: f.approvedRuntimeProfile.digest,
      resultDigest: canonicalSha256(capability), result: capability },
    operationEvidence: { kind: f.runnerInput.operation, operationId: final.gate.operation.id,
      registryEvents: structuredClone(final.gate.sources.registryEvents), registryCapture: capture('registry.yaml'),
      identityCapture: capture('identity.yaml'), assignmentEvent: null, decision,
      validation: { inputDigest: final.gate.inputDigest, inputCapture: capture('input.json'),
        reportDigest: canonicalSha256(final.gate), reportCapture: capture('result') },
      finalGate: { resultDigest: canonicalSha256(final), result: final } },
    publish: { outputRef: 'refs/unknown-knowledge/candidates/a2000000-0000-4000-8000-000000000090', expectedOldCommit: null } };
  f.git('update-ref', request.source.ref, f.source.commit);
  const writer = (value = request) => ({ repoRoot: f.repoRoot, evidenceDirectory: f.evidenceDirectory,
    request: value, approvedRuntimeProfile: f.approvedRuntimeProfile, limits: reviewLimits, executionLimits: runtimeLimits,
    authorization: { outcome: 'approved', requestDigest: canonicalSha256(value), reference: 'synthetic isolated test approval',
      bytes: Buffer.from('Synthetic authorization of this exact test request, not customer approval.') } });
  const publisher = saved => ({ repoRoot: f.repoRoot, evidenceDirectory: f.evidenceDirectory,
    validationBundleDigest: request.evidence.bundleDigest, reviewBundleDigest: saved.reviewBundleDigest,
    expectedRequestDigest: saved.requestDigest, approvedRuntimeProfile: f.approvedRuntimeProfile,
    limits: { review: reviewLimits, execution: runtimeLimits,
      transaction: { maxOutputBytes: 100000, maxCommandMilliseconds: 3000, maxTransactionMilliseconds: 15000, maxWorktrees: 10 } } });
  const adapterInput = { repoRoot: f.repoRoot, request,
    artifacts: { registry: member('registry.yaml'), identity: member('identity.yaml'), input: member('input.json'), report: member('result') },
    validationInput: f.validationInput, approvedRuntimeProfile: f.approvedRuntimeProfile, executionLimits: runtimeLimits };
  return { ...f, final, request, writer, publisher, adapterInput };
}

/** Rebundle actual artifact bytes; the caller must still establish fresh proof. */
export function reconsiderationEvidenceVariant(f, edit) {
  const artifacts = f.retained.artifacts.map(({ file, bytes }) => ({ file, bytes: Buffer.from(bytes) }));
  edit(artifacts);
  const retained = retainPreparedEvidence({ evidenceDirectory: f.evidenceDirectory, repoRoot: f.repoRoot,
    runtimeRoot: f.repoRoot, binding: f.finalInput.expected, artifacts });
  assert.equal(retained.status, 'retained', JSON.stringify(retained));
  return { ...f.finalInput, validationBundleDigest: retained.bundleDigest };
}
