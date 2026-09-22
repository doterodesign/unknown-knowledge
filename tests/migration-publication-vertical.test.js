import assert from 'node:assert/strict';
import { test } from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { finalMigrationFixture, evidenceLimits } from './helpers/final-migration-fixture.js';
import { runFinalPreparedMigrationGate } from '../payload/engine/lib/final-prepared-migration.js';
import { canonicalSha256 } from '../payload/engine/lib/canonical-json.js';
import { verifyRetainedRuntimeCapability } from '../payload/engine/lib/runtime-capability.js';
import { recordApprovedCandidateReview, readRetainedCandidateReview } from '../payload/engine/lib/candidate-review.js';
import { publishPreparedCandidate } from '../payload/engine/lib/publish-prepared-candidate.js';
import { optionalStoreSource } from './helpers/migration-optional-store-fixture.js';

for (const options of [{ history: true, nested: true }, { nested: true, amendSource: optionalStoreSource() }]) {
test(`actual v4 ${options.history ? 'mixed operational-history' : 'Decisions-only'} migration binds fresh proof before final ref CAS`, async (t) => {
  const f = await finalMigrationFixture(t, options); const result = await runFinalPreparedMigrationGate(f.input);
  assert.equal(result.status, 'passed', JSON.stringify(result.diagnostics));
  assert.equal(result.policy.id, 'identity-migration-publication-v4');
  assert.equal(result.gate.operationalHistory.documents.length, options.history ? 4 : 0);
  const capability = verifyRetainedRuntimeCapability({ evidenceDirectory: f.evidenceDirectory,
    bundleDigest: f.input.validationBundleDigest, expected: f.input.expected, limits: evidenceLimits }, f.input.approvedRuntimeProfile);
  const gateCapture = f.validation.report.checks.find((row) => row.id === 'operation').result;
  const request = { version: 1, operation: 'identity-migration', namespace: f.migrationInputs.namespace, objectFormat: 'sha1',
    source: { ref: 'refs/heads/source', expectedCommit: f.source.commit, tree: f.source.tree, kitPath: f.source.kitPath },
    candidate: f.candidate, runtimeDigest: f.validation.runtimeDigest, policy: { id: result.policy.id, digest: result.policy.digest },
    evidence: { bundleDigest: f.input.validationBundleDigest, reportDigest: f.validation.reportDigest },
    runtimeCapability: { profileDigest: f.input.approvedRuntimeProfile.digest, resultDigest: canonicalSha256(capability), result: capability },
    operationEvidence: { kind: 'identity-migration', validationInputDigest: result.gate.mechanical.validationInputDigest,
      validationCapture: gateCapture, scopeCapture: gateCapture, finalGate: { resultDigest: canonicalSha256(result), result } },
    publish: { outputRef: 'refs/unknown-knowledge/candidates/12345678-1234-4123-8123-123456789abc', expectedOldCommit: null } };
  f.git('update-ref', request.source.ref, f.source.commit);
  const limits = { ...evidenceLimits, maxRequestBytes: 10000000, maxAuthorizationBytes: 10000, maxReceiptBytes: 100000 };
  const writer = { repoRoot: f.root, evidenceDirectory: f.evidenceDirectory, request, migration: f.input.migration,
    approvedRuntimeProfile: f.input.approvedRuntimeProfile, executionLimits: f.runtimeLimits, limits,
    authorization: { outcome: 'approved', requestDigest: canonicalSha256(request), reference: 'Synthetic test operator response',
      bytes: Buffer.from('Fixture-only approved response for this exact immutable request.') } };
  const wrongNamespace = structuredClone(writer); wrongNamespace.request.namespace = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  wrongNamespace.authorization.bytes = Buffer.from(writer.authorization.bytes);
  wrongNamespace.authorization.requestDigest = canonicalSha256(wrongNamespace.request);
  await assert.rejects(recordApprovedCandidateReview(wrongNamespace), /review-final-migration-mismatch/);
  const forged = structuredClone(writer); forged.authorization.bytes = Buffer.from(writer.authorization.bytes);
  forged.request.operationEvidence.finalGate.result.gate.recipe.today = '2026-09-02';
  forged.request.operationEvidence.finalGate.resultDigest = canonicalSha256(forged.request.operationEvidence.finalGate.result);
  forged.authorization.requestDigest = canonicalSha256(forged.request);
  await assert.rejects(recordApprovedCandidateReview(forged), /review-final-migration-mismatch/);
  const wrongProfile = structuredClone(writer); wrongProfile.authorization.bytes = Buffer.from(writer.authorization.bytes);
  wrongProfile.request.operationEvidence.finalGate.result.gate.sourceProfile.before.knowledge.present = !options.history;
  wrongProfile.request.operationEvidence.finalGate.resultDigest = canonicalSha256(wrongProfile.request.operationEvidence.finalGate.result);
  wrongProfile.authorization.requestDigest = canonicalSha256(wrongProfile.request);
  await assert.rejects(recordApprovedCandidateReview(wrongProfile), /review-final-migration-mismatch/);
  const review = await recordApprovedCandidateReview(writer); assert.equal(review.status, 'retained');
  const read = readRetainedCandidateReview({ evidenceDirectory: f.evidenceDirectory, reviewBundleDigest: review.reviewBundleDigest,
    validationBundleDigest: f.input.validationBundleDigest, expectedRequestDigest: review.requestDigest, limits });
  assert.equal(read.status, 'verified'); assert.equal(read.artifacts.length, 3);
  for (const row of read.artifacts) assert(!row.bytes.includes(Buffer.from('PRIVATE')));
  const index = readFileSync(join(f.root, '.git/index'));
  const publish = { repoRoot: f.root, evidenceDirectory: f.evidenceDirectory, validationBundleDigest: f.input.validationBundleDigest,
    reviewBundleDigest: review.reviewBundleDigest, expectedRequestDigest: review.requestDigest,
    approvedRuntimeProfile: f.input.approvedRuntimeProfile, migration: f.input.migration,
    limits: { review: limits, execution: f.runtimeLimits,
      transaction: { maxOutputBytes: 100000, maxCommandMilliseconds: 10000, maxTransactionMilliseconds: 30000, maxWorktrees: 20 } } };
  const missing = await publishPreparedCandidate({ ...publish, migration: null }); assert.equal(missing.status, 'not-published');
  f.git('update-ref', request.source.ref, f.candidate.commit);
  const stale = await publishPreparedCandidate(publish); assert.equal(stale.status, 'not-published');
  f.git('update-ref', request.source.ref, f.source.commit);
  const published = await publishPreparedCandidate(publish);
  assert.equal(published.status, 'published', JSON.stringify(published));
  assert.equal(f.git('rev-parse', request.publish.outputRef), f.candidate.commit);
  assert.deepEqual(readFileSync(join(f.root, '.git/index')), index);
  if (!options.history) assert(!existsSync(join(f.root, f.candidate.kitPath, 'knowledge')));
});
}
