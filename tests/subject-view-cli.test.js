import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadStores } from '../payload/engine/lib/load-stores.js';

const cli = fileURLToPath(new URL('../payload/engine/subject-view.js', import.meta.url));
const namespace = '11111111-1111-4111-8111-111111111111';
const limits = ['--max-nodes', '20', '--max-edges', '20', '--max-rows', '10', '--max-bytes', '10000'];
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'subject-view-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const identity = { 'schema-version': 1, 'identity-format': 1, namespace, allocations: [] };
  const registry = { 'schema-version': 1, namespace, revision: 0, 'hierarchy-revision': 0,
    subjects: [{ id: `proposal:subject:${namespace}`, label: 'Café', status: 'proposed',
      definition: { text: 'Coffee places', includes: [], excludes: [] }, aliases: [], related: [], changes: [] }], history: [] };
  const put = (path, value) => {
    mkdirSync(join(root, path, '..'), { recursive: true });
    writeFileSync(join(root, path), typeof value === 'string' ? value : JSON.stringify(value));
  };
  put('_identity.yaml', identity);
  put('subjects/registry.yaml', registry);
  const run = (...args) => spawnSync(process.execPath, [cli, '--root', root, '--json', ...limits, ...args],
    { encoding: 'utf8', timeout: 20000 });
  return { root, identity, registry, put, run };
}

test('real CLI checks, writes, deletes and regenerates a disposable structural tree', (t) => {
  const f = fixture(t);
  const before = loadStores(f.root);
  assert.equal(before.ok, true, JSON.stringify(before.diagnostics));
  const missing = f.run();
  assert.equal(missing.status, 1, missing.stderr);
  assert.equal(JSON.parse(missing.stdout).findings.length, 2);
  const wrote = f.run('--write');
  assert.equal(wrote.status, 0, wrote.stderr);
  const tree = readFileSync(join(f.root, 'subjects/derived/tree.md'), 'utf8');
  const metadata = readFileSync(join(f.root, 'subjects/derived/metadata.json'), 'utf8');
  assert.match(tree, /Café/);
  assert.match(tree, /approval not checked/);
  assert.equal(JSON.parse(metadata).inputScope, 'registry-only');
  assert.equal(f.run('--check').status, 0);
  const removed = f.run('--delete');
  assert.equal(removed.status, 0, removed.stderr);
  assert.equal(existsSync(join(f.root, 'subjects/derived')), false);
  const after = loadStores(f.root);
  assert.deepEqual(after.subjectRegistry.document, before.subjectRegistry.document);
  assert.deepEqual(after.identity, before.identity);
  assert.deepEqual(after.diagnostics, before.diagnostics);
  assert.equal(f.run('--write').status, 0);
  assert.equal(readFileSync(join(f.root, 'subjects/derived/tree.md'), 'utf8'), tree);
  assert.equal(readFileSync(join(f.root, 'subjects/derived/metadata.json'), 'utf8'), metadata);
});

test('actual authority changes invalidate artifacts without trusting derived metadata', (t) => {
  const f = fixture(t);
  assert.equal(f.run('--write').status, 0);
  f.registry.subjects[0].definition.text = 'Changed definition with unchanged revisions';
  f.put('subjects/registry.yaml', f.registry);
  const stale = f.run('--check');
  assert.equal(stale.status, 1, stale.stderr);
  assert.ok(JSON.parse(stale.stdout).findings.every(({ code }) => code === 'subject-view-stale'));
  f.put('subjects/derived/extra.txt', 'disposable');
  assert.equal(f.run('--write').status, 0);
  assert.equal(existsSync(join(f.root, 'subjects/derived/extra.txt')), false);
});

test('incomplete budgets preserve existing artifacts and report failure, not findings', (t) => {
  const f = fixture(t);
  f.put('subjects/derived/keep.txt', 'previous artifact');
  for (const extra of [['--max-nodes', '0'], ['--max-rows', '0'], ['--max-bytes', '1']]) {
    const args = limits.slice();
    args[args.indexOf(extra[0]) + 1] = extra[1];
    const result = spawnSync(process.execPath, [cli, '--root', f.root, '--write', '--json', ...args], { encoding: 'utf8' });
    assert.equal(result.status, 2, result.stderr);
    assert.equal(JSON.parse(result.stdout).status, 'incomplete');
    assert.equal(readFileSync(join(f.root, 'subjects/derived/keep.txt'), 'utf8'), 'previous artifact');
  }
});

test('missing or invalid real authority cannot write a successful empty tree', (t) => {
  for (const mutate of [
    (f) => rmSync(join(f.root, '_identity.yaml')),
    (f) => rmSync(join(f.root, 'subjects/registry.yaml')),
    (f) => f.put('subjects/registry.yaml', 'invalid: ['),
    (f) => f.put('_identity.yaml', { ...f.identity, namespace: 'invalid' }),
  ]) {
    const f = fixture(t); mutate(f);
    const result = f.run('--write');
    assert.equal(result.status, 2);
    assert.equal(existsSync(join(f.root, 'subjects/derived')), false);
  }
});

test('a present valid empty registry generates a complete empty view', (t) => {
  const f = fixture(t);
  f.registry.subjects = [];
  f.put('subjects/registry.yaml', f.registry);
  const result = f.run('--write');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).metadata.coverage.total, 0);
  assert.match(readFileSync(join(f.root, 'subjects/derived/tree.md'), 'utf8'), /Renderable subjects: 0\/0/);
});

test('derived symlinks and file-as-directory failures cannot be mistaken for drift', (t) => {
  const f = fixture(t);
  f.put('outside.md', 'must remain untouched');
  mkdirSync(join(f.root, 'subjects/derived'));
  symlinkSync(join(f.root, 'outside.md'), join(f.root, 'subjects/derived/tree.md'));
  for (const verb of ['--check', '--write']) assert.equal(f.run(verb).status, 2);
  assert.equal(readFileSync(join(f.root, 'outside.md'), 'utf8'), 'must remain untouched');
  rmSync(join(f.root, 'subjects/derived'), { recursive: true });
  f.put('subjects/derived', 'not a directory');
  assert.equal(f.run('--check').status, 2);
});

test('mutually exclusive verbs and missing numeric limits are usage failures', (t) => {
  const f = fixture(t);
  assert.equal(f.run('--write', '--delete').status, 2);
  const result = spawnSync(process.execPath, [cli, '--root', f.root], { encoding: 'utf8' });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /max-nodes/);
});

test('the shared parser refuses unexpected positional arguments before write or delete', (t) => {
  const f = fixture(t);
  f.put('subjects/derived/sentinel.txt', 'preserve before parsing');
  for (const verb of ['--write', '--delete']) {
    const result = f.run(verb, 'unexpected');
    assert.equal(result.status, 2);
    assert.match(result.stderr, /unexpected argument/);
    assert.equal(readFileSync(join(f.root, 'subjects/derived/sentinel.txt'), 'utf8'), 'preserve before parsing');
    assert.equal(existsSync(join(f.root, 'subjects/derived/tree.md')), false);
  }
});
