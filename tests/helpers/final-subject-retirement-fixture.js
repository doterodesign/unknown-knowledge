import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { subjectRetirementAssignmentFixture } from './subject-retirement-assignment-fixture.js';
import { subjectRetirementInputWire } from '../../payload/engine/lib/subject-retirement-input.js';
import { runPreparedCandidateChecks } from '../../payload/engine/lib/prepared-validation.js';
import { readRetainedPreparedEvidence, retainPreparedEvidence } from '../../payload/engine/lib/prepared-evidence.js';
import { canonicalSha256 } from '../../payload/engine/lib/canonical-json.js';
export const runtimeLimits = { maxRuntimeFiles: 3000, maxRuntimeBytes: 30000000, maxOutputBytesPerCheck: 20000000, maxCheckMilliseconds: 60000 };
export const evidenceLimits = { maxManifestBytes: 2000000, maxArtifacts: 4000, maxArtifactBytes: 30000000, maxTotalArtifactBytes: 200000000 };
export async function finalSubjectRetirementFixture(t, options = {}) {
  const f = subjectRetirementAssignmentFixture(t, options);
  const evidenceDirectory = mkdtempSync(join(f.root, '..', 'retirement-final-evidence-'));
  t.after(() => rmSync(evidenceDirectory, { recursive: true, force: true }));
  const operationInputs = { gateInput: subjectRetirementInputWire(f.input), captureLimits: { maxRegistryBytes: 1000000, maxEventBytes: 1000000 } };
  const source = f.input.before; const candidate = f.input.candidate;
  const validation = await runPreparedCandidateChecks({ repoRoot: f.root, source, candidate, operation: 'subject-retirement',
    operationInputs, evidenceDirectory, limits: runtimeLimits });
  if (validation.retention?.status !== 'retained') throw new Error(`Actual retirement validation failed: ${JSON.stringify(validation)}`);
  const expected = { source, candidate, operation: 'subject-retirement', runtimeDigest: validation.runtimeDigest, reportDigest: validation.reportDigest };
  const retained = readRetainedPreparedEvidence({ evidenceDirectory, bundleDigest: validation.retention.bundleDigest, expected, limits: evidenceLimits });
  if (retained.status !== 'verified') throw new Error(`Actual retirement readback failed: ${JSON.stringify(retained)}`);
  // Synthetic fixture configuration only, never production approval by observation.
  const profile = { version: 1, id: 'subject-route-persistence-unsupported-v1', scope: 'kit-managed-subject-route-persistence',
    persistence: 'unsupported', managedPaths: [], exclusions: ['caller-request-files', 'external-client-saved-routes', 'arbitrary-repository-json'],
    files: retained.runtimeManifest.files };
  const gate = JSON.parse(retained.artifacts.find(({ file }) => file === 'checks/operation/result').bytes);
  const input = { repoRoot: f.root, evidenceDirectory, validationBundleDigest: validation.retention.bundleDigest, expected,
    approvedRuntimeProfile: { digest: canonicalSha256(profile), profile }, limits: { evidence: evidenceLimits, runtime: runtimeLimits } };
  return { ...f, source, candidate, validation, retained, gate, operationInputs, input };
}

/** Rebundle altered test evidence through real retention; no production proof is substituted. */
export function retirementEvidenceVariant(f, edit) {
  const artifacts = f.retained.artifacts.map(({ file, bytes }) => ({ file, bytes: Buffer.from(bytes) }));
  edit(artifacts);
  const retained = retainPreparedEvidence({ evidenceDirectory: f.input.evidenceDirectory, repoRoot: f.root,
    runtimeRoot: f.root, binding: f.input.expected, artifacts });
  if (retained.status !== 'retained') throw new Error(`Variant retention failed: ${JSON.stringify(retained)}`);
  return { ...f.input, validationBundleDigest: retained.bundleDigest };
}
