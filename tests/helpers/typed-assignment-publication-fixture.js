import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { typedAssignmentSourceFixture } from './typed-assignment-source-fixture.js';
import { runFinalPreparedAssignmentGate } from '../../payload/engine/lib/final-prepared-assignment.js';
import { verifyRetainedRuntimeCapability } from '../../payload/engine/lib/runtime-capability.js';
import { queryBudgets } from './subject-query-fixture.js';
import { runPreparedCandidateChecks } from '../../payload/engine/lib/prepared-validation.js';
import { readRetainedPreparedEvidence, retainPreparedEvidence } from '../../payload/engine/lib/prepared-evidence.js';
import { canonicalSha256 } from '../../payload/engine/lib/canonical-json.js';

export const runtimeLimits = { maxRuntimeFiles: 2000, maxRuntimeBytes: 30000000,
  maxOutputBytesPerCheck: 20000000, maxCheckMilliseconds: 60000 };
export const evidenceLimits = { maxManifestBytes: 2000000, maxArtifacts: 3000,
  maxArtifactBytes: 30000000, maxTotalArtifactBytes: 180000000 };
export const reviewLimits = { ...evidenceLimits, maxRequestBytes: 30000000,
  maxAuthorizationBytes: 10000, maxReceiptBytes: 100000 };
export const typedAssignmentImpact = () => ({
  regeneratedViews: { inventory: { version: 1, coverage: 'complete', views: [{ id: 'subject-tree', kind: 'subject-tree',
    options: { budget: { nodes: 100, edges: 100, rows: 100 }, maxBytes: 1000000 } }] }, limits: { version: 1, maxViews: 1 } },
  representativeReplays: { limits: { version: 1, maxSubjects: 100, maxEligibilityRedirects: 1000,
    maxCases: 2000, maxInventoryBytes: 5000000 }, queryBudgets: { ...queryBudgets, maxResultsPerStore: 1000, maxExplanationNodes: 100000 } },
});

export async function preparedTypedAssignmentFixture(t, setup = {}) {
  const f = await typedAssignmentSourceFixture(t, setup);
  const input = f.prepared;
  const capture = ({ bytes, ...row }) => ({ ...row, bytesBase64: bytes.toString('base64') });
  const operationInputs = { eventId: input.eventId, selection: structuredClone(input.selection),
    reviewNote: input.reviewNote, limits: input.limits, maxEventBytes: 1000000,
    decisionCaptures: input.decisionCaptures.map(({ bytes, ...row }) => ({ ...row, bytesBase64: bytes.toString('base64') })),
    impact: typedAssignmentImpact(), ...(Object.hasOwn(input, 'continuation') ? { continuation: { ...input.continuation,
      assessmentCaptures: input.continuation.assessmentCaptures.map(pair => ({ registry: capture(pair.registry), identity: capture(pair.identity) })),
      materialCaptures: input.continuation.materialCaptures.map(capture) } } : {}) };
  const base = mkdtempSync(join(tmpdir(), 'typed-assignment-evidence-'));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const evidenceDirectory = join(base, 'evidence'); mkdirSync(evidenceDirectory, { mode: 0o700 });
  return { ...f, input, source: input.before, candidate: input.candidate, operationInputs, evidenceDirectory };
}

export async function finalTypedAssignmentFixture(t, setup = {}, change) {
  const f = await preparedTypedAssignmentFixture(t, setup);
  change?.(f.operationInputs, f);
  const validation = await runPreparedCandidateChecks({ repoRoot: f.root, source: f.source, candidate: f.candidate,
    operation: 'subject-assignment', operationInputs: f.operationInputs, evidenceDirectory: f.evidenceDirectory, limits: runtimeLimits });
  const expected = { source: f.source, candidate: f.candidate, operation: 'subject-assignment',
    runtimeDigest: validation.runtimeDigest, reportDigest: validation.reportDigest };
  const retained = readRetainedPreparedEvidence({ evidenceDirectory: f.evidenceDirectory,
    bundleDigest: validation.retention.bundleDigest, expected, limits: evidenceLimits });
  assert.equal(retained.status, 'verified', JSON.stringify(retained));
  const profile = { version: 1, id: 'subject-route-persistence-unsupported-v1', scope: 'kit-managed-subject-route-persistence',
    persistence: 'unsupported', managedPaths: [], exclusions: ['caller-request-files', 'external-client-saved-routes', 'arbitrary-repository-json'],
    files: retained.runtimeManifest.files };
  const finalInput = { repoRoot: f.root, evidenceDirectory: f.evidenceDirectory, validationBundleDigest: retained.bundleDigest,
    expected, approvedRuntimeProfile: { digest: canonicalSha256(profile), profile }, limits: { evidence: evidenceLimits, runtime: runtimeLimits } };
  const validationInput = { evidenceDirectory: f.evidenceDirectory, bundleDigest: retained.bundleDigest, expected, limits: evidenceLimits };
  const gate = JSON.parse(retained.artifacts.find(row => row.file === 'checks/operation/result').bytes);
  return { ...f, validation, retained, expected, finalInput, validationInput, gate, approvedRuntimeProfile: finalInput.approvedRuntimeProfile };
}


export async function reviewTypedAssignmentFixture(t, setup = {}) {
  const f = await finalTypedAssignmentFixture(t, setup);
  const final = await runFinalPreparedAssignmentGate(f.finalInput);
  assert.equal(final.status, 'passed', JSON.stringify(final.diagnostics));
  const capability = verifyRetainedRuntimeCapability(f.validationInput, f.approvedRuntimeProfile);
  assert.equal(capability.status, 'established');
  const request = { version: 1, operation: 'subject-assignment', namespace: f.event.namespace, objectFormat: f.objectFormat,
    source: { ref: 'refs/heads/source', expectedCommit: f.source.commit, tree: f.source.tree, kitPath: f.source.kitPath }, candidate: f.candidate,
    runtimeDigest: f.validation.runtimeDigest, policy: { id: final.policy.id, digest: final.policy.digest },
    evidence: { bundleDigest: f.retained.bundleDigest, reportDigest: f.validation.reportDigest },
    runtimeCapability: { profileDigest: f.approvedRuntimeProfile.digest, resultDigest: canonicalSha256(capability), result: capability },
    operationEvidence: { kind: 'subject-assignment', event: f.options.eventId,
      eventCapture: f.validation.report.eventSource.capture, eventDigest: f.validation.report.eventSource.eventDigest,
      finalGate: { resultDigest: canonicalSha256(final), result: final } },
    publish: { outputRef: 'refs/unknown-knowledge/candidates/b7000000-0000-4000-8000-000000000050', expectedOldCommit: null } };
  f.git('update-ref', request.source.ref, f.source.commit);
  const writer = (value = request) => ({ repoRoot: f.root, evidenceDirectory: f.evidenceDirectory, request: value,
    approvedRuntimeProfile: f.approvedRuntimeProfile, limits: reviewLimits, executionLimits: runtimeLimits,
    authorization: { outcome: 'approved', requestDigest: canonicalSha256(value), reference: 'synthetic isolated test approval',
      bytes: Buffer.from('Fixture approval for this exact disposable request only.') } });
  const publisher = saved => ({ repoRoot: f.root, evidenceDirectory: f.evidenceDirectory, validationBundleDigest: f.retained.bundleDigest,
    reviewBundleDigest: saved.reviewBundleDigest, expectedRequestDigest: saved.requestDigest, approvedRuntimeProfile: f.approvedRuntimeProfile,
    limits: { review: reviewLimits, execution: runtimeLimits,
      transaction: { maxOutputBytes: 100000, maxCommandMilliseconds: 3000, maxTransactionMilliseconds: 15000, maxWorktrees: 10 } } });
  return { ...f, final, request, writer, publisher };
}

/** Reseals actual artifacts; edit owns any dependent report/input digests for its attack. */
export function typedAssignmentEvidenceVariant(f, edit) {
  const rows = f.retained.artifacts.map(row => ({ file: row.file, bytes: Buffer.from(row.bytes) }));
  edit(rows);
  const variant = retainPreparedEvidence({ evidenceDirectory: f.evidenceDirectory, repoRoot: f.root,
    runtimeRoot: f.root, binding: f.validationInput.expected, artifacts: rows });
  assert.equal(variant.status, 'retained');
  return { ...f.finalInput, validationBundleDigest: variant.bundleDigest };
}
