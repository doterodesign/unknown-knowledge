import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { assignmentGateFixture } from './assignment-gate-fixture.js';
import { queryBudgets } from './subject-query-fixture.js';
import { runPreparedCandidateChecks } from '../../payload/engine/lib/prepared-validation.js';
import { readRetainedPreparedEvidence } from '../../payload/engine/lib/prepared-evidence.js';
import { canonicalSha256 } from '../../payload/engine/lib/canonical-json.js';

export const runtimeLimits = { maxRuntimeFiles: 2000, maxRuntimeBytes: 30000000,
  maxOutputBytesPerCheck: 12000000, maxCheckMilliseconds: 20000 };
export const evidenceLimits = { maxManifestBytes: 2000000, maxArtifacts: 3000,
  maxArtifactBytes: 20000000, maxTotalArtifactBytes: 150000000 };
export async function finalAssignmentFixture(t, change) {
  const f = assignmentGateFixture(t, { afterIds: [] });
  const tree = f.git('write-tree'); const commit = f.git('commit-tree', tree, '-p', f.commit, '-m', 'prepared final assignment');
  const base = mkdtempSync(join(tmpdir(), 'final-assignment-evidence-'));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const evidenceDirectory = join(base, 'evidence'); mkdirSync(evidenceDirectory, { mode: 0o700 });
  const source = { commit: f.commit, tree: f.tree, kitPath: '.' }; const candidate = { commit, tree, kitPath: '.' };
  const { repoRoot, decisionCaptures, impact, ...values } = f.options;
  const operationInputs = { ...values, maxEventBytes: 100000,
    decisionCaptures: decisionCaptures.map(({ bytes, ...rest }) => ({ ...rest, bytesBase64: bytes.toString('base64') })),
    impact: { regeneratedViews: { inventory: { version: 1, coverage: 'complete', views: [{ id: 'subject-tree', kind: 'subject-tree',
      options: { budget: { nodes: 50, edges: 50, rows: 20 }, maxBytes: 100000 } }] }, limits: { version: 1, maxViews: 10 } },
    representativeReplays: { limits: { version: 1, maxSubjects: 3, maxEligibilityRedirects: 0,
      maxCases: 72, maxInventoryBytes: 1000000 }, queryBudgets: { ...queryBudgets } } } };
  change?.(operationInputs);
  const validation = await runPreparedCandidateChecks({ repoRoot, source, candidate, operation: 'subject-assignment',
    operationInputs, evidenceDirectory, limits: runtimeLimits });
  const expected = { source, candidate, operation: 'subject-assignment', runtimeDigest: validation.runtimeDigest, reportDigest: validation.reportDigest };
  const retained = readRetainedPreparedEvidence({ evidenceDirectory, bundleDigest: validation.retention.bundleDigest, expected, limits: evidenceLimits });
  // Test-only stand-in for independently adopted configuration; production never auto-approves an observed inventory.
  const profile = { version: 1, id: 'subject-route-persistence-unsupported-v1', scope: 'kit-managed-subject-route-persistence',
    persistence: 'unsupported', managedPaths: [], exclusions: ['caller-request-files', 'external-client-saved-routes', 'arbitrary-repository-json'],
    files: retained.runtimeManifest.files };
  const input = { repoRoot, evidenceDirectory, validationBundleDigest: retained.bundleDigest, expected,
    approvedRuntimeProfile: { digest: canonicalSha256(profile), profile }, limits: { evidence: evidenceLimits, runtime: runtimeLimits } };
  return { ...f, source, candidate, operationInputs, validation, retained, input };
}
