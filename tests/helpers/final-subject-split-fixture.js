/** Actual split runner/retention fixtures; synthetic capability configuration is test-only. */
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { subjectSplitAssignmentFixture } from './subject-split-assignment-fixture.js';
import { subjectSplitInputWire } from '../../payload/engine/lib/subject-split-input.js';
import { runPreparedCandidateChecks } from '../../payload/engine/lib/prepared-validation.js';
import { readRetainedPreparedEvidence, retainPreparedEvidence } from '../../payload/engine/lib/prepared-evidence.js';
import { canonicalSha256 } from '../../payload/engine/lib/canonical-json.js';
export const runtimeLimits = { maxRuntimeFiles: 3000, maxRuntimeBytes: 30000000, maxOutputBytesPerCheck: 20000000, maxCheckMilliseconds: 60000 };
export const evidenceLimits = { maxManifestBytes: 2000000, maxArtifacts: 4000, maxArtifactBytes: 30000000, maxTotalArtifactBytes: 200000000 };
export async function finalSubjectSplitFixture(t, options = {}) {
  const f = subjectSplitAssignmentFixture(t, options);
  const evidenceDirectory = mkdtempSync(join(f.root, '..', 'split-final-evidence-'));
  t.after(() => rmSync(evidenceDirectory, { recursive: true, force: true }));
  const operationInputs = { gateInput: subjectSplitInputWire(f.input), captureLimits: {
    maxRegistryBytes: Buffer.byteLength(f.read('subjects/registry.yaml')),
    maxIdentityBytes: Buffer.byteLength(f.read('_identity.yaml')),
    maxEventBytes: f.input.operation.assignmentEvent === null ? 1 : Buffer.byteLength(f.read(`subjects/_assignments/${f.input.operation.assignmentEvent.id}.yaml`)),
  } };
  const source = f.input.before; const candidate = f.input.candidate;
  const validation = await runPreparedCandidateChecks({ repoRoot: f.root, source, candidate, operation: 'subject-split',
    operationInputs, evidenceDirectory, limits: runtimeLimits });
  if (validation.retention?.status !== 'retained') throw new Error(`Actual split retention failed: ${JSON.stringify(validation)}`);
  const expected = { source, candidate, operation: 'subject-split', runtimeDigest: validation.runtimeDigest, reportDigest: validation.reportDigest };
  const retained = readRetainedPreparedEvidence({ evidenceDirectory, bundleDigest: validation.retention.bundleDigest, expected, limits: evidenceLimits });
  if (retained.status !== 'verified') throw new Error(`Actual split readback failed: ${JSON.stringify(retained)}`);
  const profile = { version: 1, id: 'subject-route-persistence-unsupported-v1', scope: 'kit-managed-subject-route-persistence',
    persistence: 'unsupported', managedPaths: [], exclusions: ['caller-request-files', 'external-client-saved-routes', 'arbitrary-repository-json'],
    files: retained.runtimeManifest.files };
  const artifact = retained.artifacts.find(({ file }) => file === 'checks/operation/result');
  const gate = artifact ? JSON.parse(artifact.bytes) : null;
  const input = { repoRoot: f.root, evidenceDirectory, validationBundleDigest: validation.retention.bundleDigest, expected,
    approvedRuntimeProfile: { digest: canonicalSha256(profile), profile }, limits: { evidence: evidenceLimits, runtime: runtimeLimits } };
  return { ...f, source, candidate, validation, retained, gate, operationInputs, input };
}

/** Rebundle actual altered test artifacts; this cannot replace fresh production proof. */
export function splitEvidenceVariant(f, edit) {
  const artifacts = f.retained.artifacts.map(({ file, bytes }) => ({ file, bytes: Buffer.from(bytes) }));
  edit(artifacts);
  const retained = retainPreparedEvidence({ evidenceDirectory: f.input.evidenceDirectory, repoRoot: f.root,
    runtimeRoot: f.root, binding: f.input.expected, artifacts });
  if (retained.status !== 'retained') throw new Error(`Variant retention failed: ${JSON.stringify(retained)}`);
  return { ...f.input, validationBundleDigest: retained.bundleDigest };
}
