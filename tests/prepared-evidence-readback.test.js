import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs, { chmodSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { join } from 'node:path';
import { canonicalJsonBytes } from '../payload/engine/lib/canonical-json.js';
import { rawSha256, readRetainedPreparedEvidence } from '../payload/engine/lib/prepared-evidence.js';

import { fixture, limits } from './helpers/prepared-evidence-fixture.js';

test('readback proves bytes and bindings without changing failed/null results or claiming execution/authentication', (t) => {
  const f = fixture(t); const saved = f.save();
  const result = readRetainedPreparedEvidence(saved.input);
  assert.equal(result.status, 'verified'); assert.deepEqual(result.report, saved.report);
  assert.equal(result.report.checks[0].exitCode, 2); assert.equal(result.report.checks[1].result, null);
  assert.deepEqual(result.artifacts.find(({ file }) => file === 'checks/structural/stdout').bytes, Buffer.from('\uFEFFraw\r\n'));
  assert.equal(result.report.publicationReady, false);
  // Native executable descriptors are integrity data, not an assertion those paths are this host.
  assert.equal(result.runtimeManifest.executables.node.path, '/trusted/node');
});

test('all four readback limits and exact expected bindings refuse before unbounded blob reads', (t) => {
  const f = fixture(t); const { input } = f.save();
  for (const key of Object.keys(limits)) {
    assert.throws(() => readRetainedPreparedEvidence({ ...input, limits: { ...limits, [key]: 1 } }));
  }
  for (const expected of [
    { ...input.expected, reportDigest: 'c'.repeat(64) },
    { ...input.expected, candidate: { ...input.expected.candidate, commit: '3'.repeat(40) } },
    { ...input.expected, operation: 'subject-assignment' },
  ]) assert.throws(() => readRetainedPreparedEvidence({ ...input, expected }), /mismatched retained manifest/);
  assert.throws(() => readRetainedPreparedEvidence({ ...input, repair: true }), /invalid bounded readback/);
});

test('cryptographically matching reports still require exact detached capture membership', (t) => {
  const f = fixture(t);
  for (const editReport of [
    (r) => { r.checks[0].stdout.file = 'not-in-bundle'; },
    (r) => { r.checks[0].stdout.size += 1; },
    (r) => { r.checks[0].stdout.sha256 = 'c'.repeat(64); },
    (r) => { r.execution.stderr.extra = true; },
    (r) => { r.checks[0].result = { file: 'no-kind', size: 0, sha256: '0'.repeat(64) }; },
    (r) => { r.source.commit = '3'.repeat(40); },
  ]) assert.throws(() => readRetainedPreparedEvidence(f.save({ editReport }).input), /capture|bindings/);
});

test('runtime file and entrypoint inventories cannot duplicate, omit or substitute captured bytes', (t) => {
  const f = fixture(t);
  for (const editRuntime of [
    (r) => { r.files.push(r.files[0]); }, (r) => { r.files.shift(); },
    (r) => { r.files[0].sha256 = 'd'.repeat(64); }, (r) => { r.files[0].mode = 0o600; },
    (r) => { r.entrypoints[1] = r.entrypoints[0]; },
    (r) => { r.entrypoints[0].path = 'client/test.js'; },
    (r) => { r.entrypoints[0].sha256 = 'd'.repeat(64); },
  ]) assert.throws(() => readRetainedPreparedEvidence(f.save({ editRuntime }).input), /runtime|entrypoint/);
});

test('artifact corruption, symlink substitution and noncanonical completion markers are refused without repair', (t) => {
  const f = fixture(t); const saved = f.save();
  const artifact = saved.artifacts.find(({ file }) => file === 'checks/structural/stdout');
  const blob = join(f.evidenceDirectory, 'blobs/sha256', rawSha256(artifact.bytes));
  chmodSync(blob, 0o600); writeFileSync(blob, Buffer.alloc(artifact.bytes.length, 120)); chmodSync(blob, 0o400);
  assert.throws(() => readRetainedPreparedEvidence(saved.input), /artifact bytes differ/);
  assert.deepEqual(readFileSync(blob), Buffer.alloc(artifact.bytes.length, 120));
  rmSync(blob); symlinkSync(join(f.root, 'outside'), blob);
  assert.throws(() => readRetainedPreparedEvidence(saved.input), /retained object unavailable/);
  rmSync(blob); writeFileSync(blob, artifact.bytes, { mode: 0o400 });
  const marker = join(f.evidenceDirectory, 'bundles', `${saved.input.bundleDigest}.json`);
  const manifest = JSON.parse(readFileSync(marker));
  const bytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`); const digest = rawSha256(bytes);
  writeFileSync(join(f.evidenceDirectory, 'bundles', `${digest}.json`), bytes, { mode: 0o400 });
  assert.throws(() => readRetainedPreparedEvidence({ ...saved.input, bundleDigest: digest }), /exact canonical JSON/);
});

test('valid manifest hashes do not authorize duplicate logical names, unsorted rows or false byte lengths', (t) => {
  const f = fixture(t); const saved = f.save();
  const original = JSON.parse(readFileSync(join(f.evidenceDirectory, 'bundles', `${saved.input.bundleDigest}.json`)));
  for (const edit of [
    (m) => { m.artifacts.push(m.artifacts[0]); }, (m) => { m.artifacts.reverse(); },
    (m) => { m.artifacts[0].size += 1; }, (m) => { m.artifacts[0].file = '../escape'; },
  ]) {
    const changed = structuredClone(original); edit(changed);
    const bytes = canonicalJsonBytes(changed); const digest = rawSha256(bytes);
    writeFileSync(join(f.evidenceDirectory, 'bundles', `${digest}.json`), bytes, { mode: 0o400 });
    assert.throws(() => readRetainedPreparedEvidence({ ...saved.input, bundleDigest: digest }));
  }
});

test('reconciliation durability failure returns unknown without weakening content verification', (t) => {
  const f = fixture(t); const saved = f.save();
  const original = fs.fsyncSync;
  fs.fsyncSync = () => { throw Object.assign(new Error('simulated durability failure'), { code: 'EIO', errno: -5 }); };
  syncBuiltinESMExports();
  let result;
  try { result = readRetainedPreparedEvidence(saved.input); }
  finally { fs.fsyncSync = original; syncBuiltinESMExports(); }
  assert.deepEqual(result, { status: 'retention-unknown', bundleDigest: saved.input.bundleDigest, code: 'EIO' });
  assert.equal(readRetainedPreparedEvidence(saved.input).status, 'verified');
});
