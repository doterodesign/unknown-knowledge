import assert from 'node:assert/strict';
import { semanticFixture } from './migration-semantic-fixture.js';
import { runPreparedCandidateChecks } from '../../payload/engine/lib/prepared-validation.js';
import { readRetainedPreparedEvidence } from '../../payload/engine/lib/prepared-evidence.js';
import { canonicalSha256 } from '../../payload/engine/lib/canonical-json.js';

export const evidenceLimits = { maxManifestBytes: 2000000, maxArtifacts: 3000, maxArtifactBytes: 20000000, maxTotalArtifactBytes: 150000000 };
export async function finalMigrationFixture(t, options) {
  const f = semanticFixture(t, options);
  return retainMigrationFixture(f);
}
export async function retainMigrationFixture(f) {
  const validation = await runPreparedCandidateChecks({ repoRoot: f.root, source: f.source, candidate: f.candidate,
    operation: 'identity-migration', operationInputs: { migrationInputs: f.migrationInputs, limits: f.limits },
    evidenceDirectory: f.evidenceDirectory, limits: f.runtimeLimits });
  const expected = { source: f.source, candidate: f.candidate, operation: 'identity-migration',
    runtimeDigest: validation.runtimeDigest, reportDigest: validation.reportDigest };
  const retained = readRetainedPreparedEvidence({ evidenceDirectory: f.evidenceDirectory,
    bundleDigest: validation.retention.bundleDigest, expected, limits: evidenceLimits });
  assert.equal(retained.status, 'verified');
  // Synthetic fixture-only trusted configuration; production requires independent adoption.
  const profile = { version: 1, id: 'subject-route-persistence-unsupported-v1', scope: 'kit-managed-subject-route-persistence',
    persistence: 'unsupported', managedPaths: [], exclusions: ['caller-request-files', 'external-client-saved-routes', 'arbitrary-repository-json'],
    files: retained.runtimeManifest.files };
  const migration = { migrationInputs: f.migrationInputs, limits: f.limits, semantic: f.semantic };
  const input = { repoRoot: f.root, evidenceDirectory: f.evidenceDirectory, validationBundleDigest: retained.bundleDigest, expected,
    approvedRuntimeProfile: { digest: canonicalSha256(profile), profile }, migration,
    limits: { evidence: evidenceLimits, runtime: f.runtimeLimits } };
  return { ...f, validation, retained, input };
}
