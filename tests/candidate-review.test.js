import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { join } from 'node:path';
import { syncBuiltinESMExports } from 'node:module';
import { canonicalJsonBytes, canonicalSha256 } from '../payload/engine/lib/canonical-json.js';
import { recordApprovedCandidateReview, readRetainedCandidateReview } from '../payload/engine/lib/candidate-review.js';

import { reviewedFixture, limits } from './helpers/migration-review-fixture.js';

test('actual migration evidence retains exactly three review artifacts and exact response bytes', async (t) => {
  const f = await reviewedFixture(t); const input = f.input();
  const result = await recordApprovedCandidateReview(input);
  assert.equal(result.status, 'retained');
  assert.equal(result.requestDigest, canonicalSha256(f.request));
  assert.equal(Object.hasOwn(result, 'publicationReady'), false);
  const read = readRetainedCandidateReview({ evidenceDirectory: f.evidence, reviewBundleDigest: result.reviewBundleDigest,
    expectedRequestDigest: result.requestDigest, validationBundleDigest: f.request.evidence.bundleDigest, limits });
  assert.equal(read.status, 'verified');
  assert.deepEqual(read.manifest.artifacts.map((row) => row.file), ['authorization.txt', 'receipt.json', 'request.json']);
  assert.deepEqual(read.request, f.request);
  assert.deepEqual(read.artifacts.find((row) => row.file === 'authorization.txt').bytes, input.authorization.bytes);
  assert.equal(read.request.runtimeCapability.result.status, 'unavailable');
  assert.equal(JSON.parse(fs.readFileSync(join(f.evidence, 'blobs/sha256', f.request.operationEvidence.validationCapture.sha256))).impact.status, 'not-performed');
  assert.deepEqual(await recordApprovedCandidateReview(input), result, 'exact retry is idempotent');
  const file = join(f.evidence, 'bundles', `${result.reviewBundleDigest}.json`);
  assert.deepEqual(fs.readFileSync(file), canonicalJsonBytes(read.manifest));
});

test('rejected outcome, changed review tuple, fake capability and missing evidence never install review markers', async (t) => {
  const f = await reviewedFixture(t); const before = fs.readdirSync(join(f.evidence, 'bundles'));
  for (const change of [
    (p) => { p.authorization.outcome = 'rejected'; },
    (p) => { p.authorization.requestDigest = '1'.repeat(64); },
    (p) => { p.authorization.bytes = Buffer.alloc(0); },
    (p) => { p.request.evidence.reportDigest = '1'.repeat(64); },
    (p) => { p.request.policy.digest = '1'.repeat(64); },
    (p) => { p.request.runtimeCapability.result.status = 'established'; },
    (p) => { p.request.runtimeCapability.profileDigest = '1'.repeat(64); },
    (p) => { p.approvedRuntimeProfile = { digest: '1'.repeat(64), profile: {} }; },
    (p) => { p.request.operationEvidence.validationInputDigest = '1'.repeat(64); },
    (p) => { p.request.operationEvidence.scopeCapture.file = 'report.json'; },
    (p) => { p.request.publish.expectedOldCommit = 'HEAD'; },
    (p) => { p.request.extra = true; },
  ]) {
    const input = f.input(); change(input);
    if (input.authorization.requestDigest === canonicalSha256(f.request)) input.authorization.requestDigest = canonicalSha256(input.request);
    await assert.rejects(() => recordApprovedCandidateReview(input));
    assert.deepEqual(fs.readdirSync(join(f.evidence, 'bundles')), before);
  }
});

test('all seven positive limits and class/aggregate byte bounds are enforced', async (t) => {
  const f = await reviewedFixture(t);
  for (const key of Object.keys(limits)) {
    const input = f.input(); input.limits[key] = 0;
    await assert.rejects(() => recordApprovedCandidateReview(input), undefined, key);
  }
  for (const key of ['maxRequestBytes', 'maxAuthorizationBytes', 'maxReceiptBytes', 'maxArtifactBytes', 'maxTotalArtifactBytes', 'maxManifestBytes']) {
    const input = f.input(); input.limits[key] = 1;
    await assert.rejects(() => recordApprovedCandidateReview(input), undefined, key);
  }
});

test('review readback rejects corrupt bytes, wrong bindings and additional artifact rows', async (t) => {
  const f = await reviewedFixture(t); const saved = await recordApprovedCandidateReview(f.input());
  const readInput = { evidenceDirectory: f.evidence, reviewBundleDigest: saved.reviewBundleDigest,
    expectedRequestDigest: saved.requestDigest, validationBundleDigest: f.request.evidence.bundleDigest, limits };
  assert.throws(() => readRetainedCandidateReview({ ...readInput, expectedRequestDigest: '1'.repeat(64) }));
  const read = readRetainedCandidateReview(readInput);
  const extra = structuredClone(read.manifest);
  extra.artifacts.push({ ...extra.artifacts[0], file: 'extra.txt' });
  const extraBytes = canonicalJsonBytes(extra); const extraDigest = canonicalSha256(extra);
  fs.writeFileSync(join(f.evidence, 'bundles', `${extraDigest}.json`), extraBytes, { mode: 0o400 });
  assert.throws(() => readRetainedCandidateReview({ ...readInput, reviewBundleDigest: extraDigest }), { code: 'invalid-review-artifacts' });
  const noncanonical = Buffer.concat([canonicalJsonBytes(read.manifest), Buffer.from('\n')]);
  const { createHash } = await import('node:crypto');
  const noncanonicalDigest = createHash('sha256').update(noncanonical).digest('hex');
  fs.writeFileSync(join(f.evidence, 'bundles', `${noncanonicalDigest}.json`), noncanonical, { mode: 0o400 });
  assert.throws(() => readRetainedCandidateReview({ ...readInput, reviewBundleDigest: noncanonicalDigest }), { code: 'review-json-noncanonical' });
  const row = read.manifest.artifacts.find((item) => item.file === 'authorization.txt');
  const file = join(f.evidence, 'blobs/sha256', row.sha256);
  fs.chmodSync(file, 0o600); fs.writeFileSync(file, Buffer.alloc(row.size, 120)); fs.chmodSync(file, 0o400);
  assert.throws(() => readRetainedCandidateReview(readInput));
});

test('uncertain review completion retains reconciliation coordinates without success', async (t) => {
  const f = await reviewedFixture(t); const original = fs.fsyncSync;
  // Validation readback synchronizes first; fault only once the new review marker exists.
  const baseline = fs.readdirSync(join(f.evidence, 'bundles')).length;
  fs.fsyncSync = (fd) => {
    if (fs.readdirSync(join(f.evidence, 'bundles')).length > baseline) {
      const error = new Error('fixture durability failure'); error.code = 'EIO'; error.errno = -5; throw error;
    }
    return original(fd);
  };
  syncBuiltinESMExports();
  let result;
  try { result = await recordApprovedCandidateReview(f.input()); }
  finally { fs.fsyncSync = original; syncBuiltinESMExports(); }
  assert.equal(result.status, 'retention-unknown'); assert.match(result.reviewBundleDigest, /^[0-9a-f]{64}$/);
  assert.equal(fs.readdirSync(join(f.evidence, 'bundles')).length, baseline + 1);
});
