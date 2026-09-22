import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { retainMigrationFixture, evidenceLimits } from './helpers/final-migration-fixture.js';
import { runFinalPreparedMigrationGate } from '../payload/engine/lib/final-prepared-migration.js';
import { canonicalSha256 } from '../payload/engine/lib/canonical-json.js';
import { verifyRetainedRuntimeCapability } from '../payload/engine/lib/runtime-capability.js';
import { recordApprovedCandidateReview, readRetainedCandidateReview } from '../payload/engine/lib/candidate-review.js';
import { publishPreparedCandidate } from '../payload/engine/lib/publish-prepared-candidate.js';
import { installationFixture } from './helpers/installation-cutover-fixture.js';
import { verifyMigrationActivation } from '../payload/engine/lib/migration-activation.js';
import { writeFileSync, rmSync } from 'node:fs';
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';

test('installation cutover retains exact review, freshly publishes and observes bounded local activation', async (t) => {
  const f = await retainMigrationFixture(installationFixture(t));
  const capture = f.validation.report.checks.find(row => row.id === 'operation').result;
  const mechanical = JSON.parse(f.retained.artifacts.find(row => row.file === capture.file).bytes);
  assert.equal(mechanical.mechanicalStatus, 'passed', JSON.stringify(mechanical.checks));
  const reviewConfig = { version: 1, source: f.source, candidate: f.candidate, inventoryDigest: mechanical.installation.reviewDigest,
    activation: { hooksPath: '.hooks', externalConsumers: 'none', environment: 'current-process' } };
  f.input.approvedInstallationReview = { digest: canonicalSha256(reviewConfig), review: reviewConfig };
  const result = await runFinalPreparedMigrationGate(f.input);
  assert.equal(result.status, 'passed', JSON.stringify(result.diagnostics));
  assert.equal(result.policy.id, 'installation-cutover-publication-v1');
  assert.equal(result.gate.operationalHistory.documents.length, 4);
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
    approvedRuntimeProfile: f.input.approvedRuntimeProfile, approvedInstallationReview: f.input.approvedInstallationReview, executionLimits: f.runtimeLimits, limits,
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
  const wrongRole = structuredClone(writer); wrongRole.authorization.bytes = Buffer.from(writer.authorization.bytes);
  wrongRole.approvedInstallationReview.review.activation.externalConsumers = 'unknown';
  wrongRole.approvedInstallationReview.digest = canonicalSha256(wrongRole.approvedInstallationReview.review);
  await assert.rejects(recordApprovedCandidateReview(wrongRole), /review-final-migration-mismatch/);
  const review = await recordApprovedCandidateReview(writer); assert.equal(review.status, 'retained');
  const read = readRetainedCandidateReview({ evidenceDirectory: f.evidenceDirectory, reviewBundleDigest: review.reviewBundleDigest,
    validationBundleDigest: f.input.validationBundleDigest, expectedRequestDigest: review.requestDigest, limits });
  assert.equal(read.status, 'verified'); assert.equal(read.artifacts.length, 3);
  for (const row of read.artifacts) assert(!row.bytes.includes(Buffer.from('PRIVATE')));
  const cleanIndex = readFileSync(join(f.root, '.git/index'));
  const dirtyLocal = join(f.root, 'dirty-local.txt'); writeFileSync(dirtyLocal, 'Unrelated staged client work.\n');
  f.git('add', 'dirty-local.txt');
  const index = readFileSync(join(f.root, '.git/index'));
  const publish = { repoRoot: f.root, evidenceDirectory: f.evidenceDirectory, validationBundleDigest: f.input.validationBundleDigest,
    reviewBundleDigest: review.reviewBundleDigest, expectedRequestDigest: review.requestDigest,
    approvedRuntimeProfile: f.input.approvedRuntimeProfile, approvedInstallationReview: f.input.approvedInstallationReview, migration: f.input.migration,
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
  assert.equal(readFileSync(dirtyLocal, 'utf8'), 'Unrelated staged client work.\n');
  // The fixture operator restores its own unrelated work before activating.
  writeFileSync(join(f.root, '.git/index'), cleanIndex); rmSync(dirtyLocal);
  const activation = { ...publish, limits: { review: limits, execution: f.runtimeLimits,
    observation: { maxFiles: 4000, maxBytes: 50000000, maxOutputBytes: 2000000, maxCommandMilliseconds: 10000 } } };
  // The fixture operator explicitly selects the supported environment. A host's
  // benign GIT_PAGER must not make this positive fixture depend on its runner.
  const environmentKeys = Object.keys(process.env).filter(key => /^(?:GIT_|LD_|DYLD_)/.test(key)
    || ['NODE_OPTIONS', 'NODE_PATH', 'KIT_DIR', 'UK_ROOT'].includes(key));
  const savedEnvironment = Object.fromEntries(environmentKeys.map(key => [key, process.env[key]]));
  for (const key of environmentKeys) delete process.env[key];
  t.after(() => { for (const [key, value] of Object.entries(savedEnvironment)) process.env[key] = value; });
  f.git('config', 'core.hooksPath', '.hooks');
  for (const key of ['LD_AUDIT', 'DYLD_FRAMEWORK_PATH']) await t.test(`${key} refuses before any child spawn`, async () => {
    const prior = process.env[key], originals = { spawn: childProcess.spawn, spawnSync: childProcess.spawnSync };
    let spawns = 0;
    // Never pass the sentinel to an actual child, including on the RED path.
    childProcess.spawnSync = () => { spawns += 1; return { status: 1, stderr: 'test spawn trap', stdout: '' }; };
    childProcess.spawn = () => { spawns += 1; throw new Error('test asynchronous spawn trap'); };
    syncBuiltinESMExports();
    process.env[key] = 'ucs1240-loader-override-sentinel';
    try {
      const result = await verifyMigrationActivation(activation);
      assert.deepEqual({ spawns, result }, { spawns: 0, result: { status: 'not-observed', code: 'activation-environment-unsupported' } });
    } finally {
      if (prior === undefined) delete process.env[key]; else process.env[key] = prior;
      Object.assign(childProcess, originals); syncBuiltinESMExports();
    }
  });
  const observed = await verifyMigrationActivation(activation);
  assert.equal(observed.status, 'observed', JSON.stringify(observed));
  assert.equal(observed.futureState, 'not-guaranteed');
  for (const file of ['AGENTS.md', 'unknown-knowledge/node_modules/js-yaml/package.json']) {
    const path = join(f.root, file), original = readFileSync(path);
    writeFileSync(path, Buffer.concat([original, Buffer.from('\nUnreviewed drift\n')]));
    const drift = await verifyMigrationActivation(activation);
    assert.equal(drift.code, 'activation-live-tree-drift'); writeFileSync(path, original);
  }
  const prior = process.env.NODE_OPTIONS;
  process.env.NODE_OPTIONS = '--require=unknown-client-code';
  try { assert.equal((await verifyMigrationActivation(activation)).code, 'activation-environment-unsupported'); }
  finally { if (prior === undefined) delete process.env.NODE_OPTIONS; else process.env.NODE_OPTIONS = prior; }
  const dirty = join(f.root, 'unexpected-reader.js'); writeFileSync(dirty, 'export const reader = 1;\n');
  const unknown = await verifyMigrationActivation(activation);
  assert.equal(unknown.code, 'activation-live-tree-drift'); rmSync(dirty);
  f.git('config', 'core.hooksPath', '.unavailable');
  const staleHook = await verifyMigrationActivation(activation);
  assert.equal(staleHook.code, 'activation-hooks-path-mismatch');
  assert.deepEqual(readFileSync(join(f.root, '.git/index')), cleanIndex);
});
