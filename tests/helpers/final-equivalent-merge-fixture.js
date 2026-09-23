import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { subjectUseAssignmentFixture } from './subject-use-assignment-fixture.js';
import { equivalentMergeInputWire } from '../../payload/engine/lib/subject-equivalent-merge-input.js';
import { runPreparedCandidateChecks } from '../../payload/engine/lib/prepared-validation.js';
import { readRetainedPreparedEvidence } from '../../payload/engine/lib/prepared-evidence.js';
import { canonicalSha256 } from '../../payload/engine/lib/canonical-json.js';
export const runtimeLimits = { maxRuntimeFiles: 3000, maxRuntimeBytes: 30000000, maxOutputBytesPerCheck: 20000000, maxCheckMilliseconds: 60000 };
export const evidenceLimits = { maxManifestBytes: 2000000, maxArtifacts: 4000, maxArtifactBytes: 30000000, maxTotalArtifactBytes: 200000000 };
export async function finalEquivalentMergeFixture(t, factory = subjectUseAssignmentFixture) {
  const f = factory(t);
  const evidenceDirectory = mkdtempSync(join(f.root, '..', 'merge-final-evidence-'));
  t.after(() => rmSync(evidenceDirectory, { recursive: true, force: true }));
  const operationInputs = { gateInput: equivalentMergeInputWire(f.input), captureLimits: { maxRegistryBytes: 1000000, maxEventBytes: 1000000 } };
  const source = f.input.before; const candidate = f.input.candidate;
  const validation = await runPreparedCandidateChecks({ repoRoot: f.root, source, candidate, operation: 'subject-equivalent-merge',
    operationInputs, evidenceDirectory, limits: runtimeLimits });
  const expected = { source, candidate, operation: 'subject-equivalent-merge', runtimeDigest: validation.runtimeDigest, reportDigest: validation.reportDigest };
  const retained = readRetainedPreparedEvidence({ evidenceDirectory, bundleDigest: validation.retention.bundleDigest, expected, limits: evidenceLimits });
  // Synthetic fixture configuration only, never production approval by observation.
  const profile = { version: 1, id: 'subject-route-persistence-unsupported-v1', scope: 'kit-managed-subject-route-persistence',
    persistence: 'unsupported', managedPaths: [], exclusions: ['caller-request-files', 'external-client-saved-routes', 'arbitrary-repository-json'],
    files: retained.runtimeManifest.files };
  const gate = JSON.parse(retained.artifacts.find(({ file }) => file === 'checks/operation/result').bytes);
  const input = { repoRoot: f.root, evidenceDirectory, validationBundleDigest: validation.retention.bundleDigest, expected,
    approvedRuntimeProfile: { digest: canonicalSha256(profile), profile }, limits: { evidence: evidenceLimits, runtime: runtimeLimits } };
  return { ...f, source, candidate, validation, retained, gate, operationInputs, input };
}
