import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chmodSync, cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { capturePreparedRuntime } from '../payload/engine/lib/prepared-runtime.js';
import { canonicalSha256 } from '../payload/engine/lib/canonical-json.js';
import { rawSha256 } from '../payload/engine/lib/prepared-evidence.js';
import { verifyMigrationHistoricalRuntime } from '../payload/engine/lib/migration-historical-runtime.js';

const prefix = 'engine/compatibility/identity-migration-08066b5';
const profile = JSON.parse(readFileSync(new URL('../payload/engine/policies/identity-migration-08066b5.json', import.meta.url)));
function captured(t) {
  const work = mkdtempSync('/private/tmp/migration-historical-runtime-');
  t.after(() => rmSync(work, { recursive: true, force: true }));
  return capturePreparedRuntime(work, { maxRuntimeFiles: 1500, maxRuntimeBytes: 30000000,
    maxOutputBytesPerCheck: 1000000, maxCheckMilliseconds: 10000 }, 'identity-migration');
}

test('the actual captured historical distribution exactly matches its complete fixed subset', (t) => {
  const runtime = captured(t);
  assert.deepEqual(verifyMigrationHistoricalRuntime(runtime), {
    profileDigest: canonicalSha256(profile), sourceCommit: profile.sourceCommit,
    root: prefix, files: 85, bytes: 2478434, entrypoints: profile.entrypoints,
  });
});

test('a missing local dependency refuses instead of resolving an ambient package', (t) => {
  const runtime = captured(t);
  unlinkSync(join(runtime.root, prefix, 'node_modules/js-yaml/dist/js-yaml.mjs'));
  assert.throws(() => verifyMigrationHistoricalRuntime(runtime));
});

test('changed same-version dependency bytes refuse even with a rehashed caller manifest', (t) => {
  const runtime = captured(t);
  const file = `${prefix}/node_modules/argparse/argparse.js`;
  const path = join(runtime.root, file); const bytes = Buffer.concat([readFileSync(path), Buffer.from('\n// changed\n')]);
  chmodSync(path, 0o600); writeFileSync(path, bytes); chmodSync(path, 0o400);
  const row = runtime.manifest.files.find((item) => item.path === file);
  row.size = bytes.length; row.sha256 = rawSha256(bytes);
  assert.throws(() => verifyMigrationHistoricalRuntime(runtime), /historical runtime/);
});

test('extra unmanifested modules and empty directories are rejected', (t) => {
  const runtime = captured(t);
  const path = join(runtime.root, prefix, 'engine/extra.js');
  writeFileSync(path, 'export const extra = true;', { mode: 0o400 });
  assert.throws(() => verifyMigrationHistoricalRuntime(runtime), /historical runtime/);
  unlinkSync(path);
  mkdirSync(join(runtime.root, prefix, 'unreviewed'), { mode: 0o700 });
  assert.throws(() => verifyMigrationHistoricalRuntime(runtime), /historical runtime/);
});

test('a dependency directory symlink cannot supply reviewed bytes', (t) => {
  const runtime = captured(t);
  const path = join(runtime.root, prefix, 'node_modules/argparse');
  rmSync(path, { recursive: true });
  symlinkSync(join(process.cwd(), 'node_modules/argparse'), path);
  assert.throws(() => verifyMigrationHistoricalRuntime(runtime), /historical runtime/);
});

test('a profile artifact changed independently of the implementing fixed profile refuses', (t) => {
  const runtime = captured(t);
  const path = join(runtime.root, 'engine/policies/identity-migration-08066b5.json');
  chmodSync(path, 0o600); writeFileSync(path, '{}'); chmodSync(path, 0o400);
  assert.throws(() => verifyMigrationHistoricalRuntime(runtime), /historical runtime/);
});

function legacyFixture(t) {
  const root = mkdtempSync('/private/tmp/migration-historical-source-');
  t.after(() => rmSync(root, { recursive: true, force: true }));
  cpSync(new URL('./fixtures/migration-08066b5/', import.meta.url), root, { recursive: true });
  return root;
}
function run(runtime, root, entrypoint, ...args) {
  const result = spawnSync(runtime.manifest.executables.node.path,
    [join(runtime.root, prefix, 'engine', entrypoint), ...args, '--root', root, '--json'],
    { cwd: runtime.root, env: runtime.env, maxBuffer: 1000000, timeout: 10000, encoding: 'utf8' });
  assert.equal(result.error, undefined); assert.equal(result.signal, null); assert.equal(result.stderr, '');
  return { exitCode: result.status, result: JSON.parse(result.stdout) };
}

test('the captured historical runtime actually validates, resolves and derives the original legacy fixture', (t) => {
  const runtime = captured(t); const root = legacyFixture(t);
  verifyMigrationHistoricalRuntime(runtime);
  for (const file of ['validate.js', 'validate-values.js']) {
    const checked = run(runtime, root, file);
    assert.equal(checked.exitCode, 0); assert.equal(checked.result['store-health'].ok, true);
  }
  const queried = run(runtime, root, 'resolve.js', 'component', '--today', '2026-09-12');
  assert.equal(queried.exitCode, 0); assert.equal(queried.result['store-health'].ok, true);
  assert.equal(queried.result.results[0].id, 'K-102');
  const zero = run(runtime, root, 'resolve.js', 'zzmigrationnomatchq9', '--today', '2026-09-12');
  assert.equal(zero.exitCode, 0); assert.deepEqual(zero.result.results, []); assert.deepEqual(zero.result.leaves, []);
  const paths = run(runtime, root, 'resolve.js', '--path', 'src/feed/latency.ts', '--today', '2026-09-12');
  assert.equal(paths.exitCode, 0); assert.equal(paths.result.paths[0].concepts[0].id, 'K-102');
  const derived = run(runtime, root, 'derive.js', '--write', '--today', '2026-09-12');
  assert.equal(derived.exitCode, 0); assert.equal(derived.result['store-health'].ok, true);
  assert.deepEqual(readdirSync(join(root, 'knowledge/derived')).sort(), ['index.json', 'tree.domain-form.md', 'tree.form-domain.md']);
  const index = JSON.parse(readFileSync(join(root, 'knowledge/derived/index.json')));
  assert.deepEqual(index.counts, { leaves: 6, demoted: 3 });
  assert.equal(run(runtime, root, 'derive.js', '--check', '--today', '2026-09-12').exitCode, 0);
  verifyMigrationHistoricalRuntime(runtime);
});

test('historical resolver exit zero does not hide an unhealthy source from the compatibility predicate', (t) => {
  const runtime = captured(t); const root = legacyFixture(t);
  const file = join(root, 'knowledge/design-system/component-render-budget.md');
  writeFileSync(file, readFileSync(file, 'utf8').replace('id: L-000213\n', ''));
  const actual = run(runtime, root, 'resolve.js', 'component', '--today', '2026-09-12');
  assert.equal(actual.exitCode, 0); assert.equal(actual.result['store-health'].ok, false);
  assert.ok(actual.result['store-health'].errors > 0);
});
