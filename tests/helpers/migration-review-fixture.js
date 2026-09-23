import assert from 'node:assert/strict';
import fs from 'node:fs';
import { join } from 'node:path';
import { fixture } from './prepared-migration-fixture.js';
import { runPreparedCandidateChecks } from '../../payload/engine/lib/prepared-validation.js';
import { canonicalJsonBytes, canonicalSha256 } from '../../payload/engine/lib/canonical-json.js';
import { verifyRetainedRuntimeCapability } from '../../payload/engine/lib/runtime-capability.js';

export const limits = { maxManifestBytes: 1000000, maxArtifacts: 2000, maxArtifactBytes: 20000000,
  maxTotalArtifactBytes: 40000000, maxRequestBytes: 100000, maxAuthorizationBytes: 10000, maxReceiptBytes: 10000 };
export async function reviewedFixture(t) {
  const f = fixture(t); const validation = await runPreparedCandidateChecks(f.input);
  const expected = { source: f.input.source, candidate: f.input.candidate, operation: f.input.operation,
    runtimeDigest: validation.runtimeDigest, reportDigest: validation.reportDigest };
  const readbackInput = { evidenceDirectory: f.evidence, bundleDigest: validation.retention.bundleDigest,
    expected, limits: Object.fromEntries(Object.entries(limits).slice(0, 4)) };
  const result = verifyRetainedRuntimeCapability(readbackInput, null);
  const gateCapture = validation.report.checks.find((row) => row.id === 'operation').result;
  const gate = JSON.parse(fs.readFileSync(join(f.evidence, 'blobs/sha256', gateCapture.sha256)));
  const request = { version: 1, operation: 'identity-migration', namespace: f.input.operationInputs.migrationInputs.namespace,
    objectFormat: 'sha1', source: { ref: 'refs/heads/source', expectedCommit: expected.source.commit,
      tree: expected.source.tree, kitPath: expected.source.kitPath }, candidate: expected.candidate,
    runtimeDigest: expected.runtimeDigest,
    policy: { id: 'identity-migration-publication-v1', digest: canonicalSha256({ id: 'identity-migration-publication-v1', version: 1 }) },
    evidence: { bundleDigest: readbackInput.bundleDigest, reportDigest: expected.reportDigest },
    runtimeCapability: { profileDigest: null, resultDigest: canonicalSha256(result), result },
    operationEvidence: { kind: 'identity-migration', validationInputDigest: gate.validationInputDigest,
      validationCapture: gateCapture, scopeCapture: gateCapture },
    publish: { outputRef: 'refs/unknown-knowledge/candidates/12345678-1234-4123-8123-123456789abc', expectedOldCommit: null } };
  const input = () => ({ repoRoot: f.root, evidenceDirectory: f.evidence, request: structuredClone(request),
    authorization: { outcome: 'approved', requestDigest: canonicalSha256(request), reference: 'fixture actual operator response',
      bytes: Buffer.from('Fixture steward response: approve exact attached request\r\n') },
    approvedRuntimeProfile: null, executionLimits: null, limits: { ...limits } });
  return { ...f, validation, request, input };
}

