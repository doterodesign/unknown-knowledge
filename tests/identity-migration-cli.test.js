import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const cli = fileURLToPath(new URL('../payload/engine/migrate-identity.js', import.meta.url));
function repository(t) {
  const root = mkdtempSync(join(tmpdir(), 'identity-inventory-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const env = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' };
  for (const key of ['GIT_DIR', 'GIT_INDEX_FILE', 'GIT_WORK_TREE']) delete env[key];
  const git = (...args) => {
    const result = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8', env });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  const write = (path, text) => { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), text); };
  git('init', '-q'); git('config', 'user.name', 'Fixture'); git('config', 'user.email', 'fixture@example.test');
  write('decisions/entries/one.yaml', 'schema-version: 1\nentries: [{id: D-1}]\n');
  write('decisions/_catalog.yaml', 'schema-version: 1\nstore: decisions\nentries: [{id: D-1, file: entries/one.yaml}]\n');
  git('add', '.'); git('commit', '-qm', 'source');
  const source = git('rev-parse', 'HEAD');
  const run = (...args) => spawnSync(process.execPath, [cli, '--root', root, '--source', source, '--kit-root', '.', '--json', ...args], { encoding: 'utf8', env });
  return { root, git, write, source, run };
}

test('CLI inventories the pinned committed tree and preserves staged, unstaged and untracked user bytes', (t) => {
  const { root, git, write, source, run } = repository(t);
  write('decisions/entries/one.yaml', 'entries: [{id: D-2}]\n'); git('add', '.');
  write('decisions/entries/one.yaml', 'not even yaml: [\n');
  write('decisions/entries/private.yaml', 'entries: [{id: D-3}]\n');
  const index = readFileSync(join(root, '.git/index'));
  const work = readFileSync(join(root, 'decisions/entries/one.yaml'));
  const untracked = readFileSync(join(root, 'decisions/entries/private.yaml'));
  const result = run();
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.deepEqual(output.records.map(({ id }) => id), ['D-1']);
  assert.equal(output.source.commit, source);
  assert.match(output.source.tree, /^[a-f0-9]{40}$/);
  assert.match(output.runtimeDigest, /^[a-f0-9]{64}$/);
  assert.equal(output.files.find(({ file }) => file === 'decisions/entries/one.yaml').blob, git('rev-parse', `${source}:decisions/entries/one.yaml`));
  assert.match(output.files.find(({ file }) => file === 'decisions/entries/one.yaml').sha256, /^[a-f0-9]{64}$/);
  assert.deepEqual(output.excludedLocalState, ['index', 'worktree', 'untracked']);
  assert.deepEqual(readFileSync(join(root, '.git/index')), index);
  assert.deepEqual(readFileSync(join(root, 'decisions/entries/one.yaml')), work);
  assert.deepEqual(readFileSync(join(root, 'decisions/entries/private.yaml')), untracked);
  assert.equal(git('rev-parse', 'HEAD'), source);
});

test('CLI refuses unpinned source names instead of silently following a moving branch', (t) => {
  const { run } = repository(t);
  const result = run('--source', 'HEAD');
  assert.equal(result.status, 2);
  assert.match(result.stderr, /full.*commit/i);
});

test('CLI captures a committed pending declaration as unavailable payload without allocating it', (t) => {
  const { git, write, run } = repository(t);
  write('decisions/_catalog.yaml', 'schema-version: 1\nstore: decisions\nentries: [{id: D-1, title: Existing, file: entries/one.yaml}, {id: D-9, title: Pending, file: pending-import}]\n');
  git('add', '.'); git('commit', '-qm', 'pending source declaration');
  const source = git('rev-parse', 'HEAD');
  const result = run('--source', source);
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  const declared = output.records.find((row) => row.availability === 'declared-only');
  assert.equal(declared.id, 'D-9'); assert.equal(declared.lifecycle, null);
  assert.deepEqual(declared.declaration.locator, { file: 'decisions/_catalog.yaml', path: ['entries', 1] });
  assert.equal(output.source.commit, source); assert.equal(output.publicationReady, false);
  assert.equal(Object.hasOwn(output, 'correspondence'), false); assert.equal(Object.hasOwn(output, 'ledger'), false);
  assert.equal(git('rev-parse', 'HEAD'), source);
});

test('CLI reports review artifacts and local extensions without declaring publication readiness', (t) => {
  const { git, write, run } = repository(t);
  write('reviews/reflect/cycle.yaml', 'schema-version: 1\nitems: []\n');
  write('decisions/custom.json', '{"ref":"D-1"}\n');
  write('knowledge/_notes.md', 'Metadata, not a Knowledge record.\n');
  write('knowledge/derived/tree.md', 'Disposable view, not a Knowledge record.\n');
  git('add', '.'); git('commit', '-qm', 'extensions');
  const result = run('--source', git('rev-parse', 'HEAD'));
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.deepEqual(output.unclassifiedPaths, ['decisions/custom.json', 'knowledge/_notes.md', 'knowledge/derived/tree.md', 'reviews/reflect/cycle.yaml']);
  assert.equal(output.publicationReady, false);
});

test('CLI refuses a committed source symlink and ignores its untracked target', (t) => {
  const { root, git, write, run } = repository(t);
  write('outside.yaml', 'entries: [{id: D-9}]\n');
  symlinkSync('../../outside.yaml', join(root, 'decisions/entries/link.yaml'));
  git('add', 'decisions/entries/link.yaml'); git('commit', '-qm', 'source symlink');
  const result = run('--source', git('rev-parse', 'HEAD'));
  assert.equal(result.status, 2);
  assert.match(result.stderr, /link\.yaml must be a regular committed file/);
});

test('CLI refuses existing canonical identity authority without minting or reading old keys', (t) => {
  const { git, write, run } = repository(t);
  write('_identity.yaml', 'identity-format: 1\n'); git('add', '.'); git('commit', '-qm', 'canonical marker');
  const result = run('--source', git('rev-parse', 'HEAD'));
  assert.equal(result.status, 2);
  assert.match(result.stderr, /already applied or requires review/);
});

test('completed inventory with an unresolved reference returns findings, not an engine failure', (t) => {
  const { git, write, run } = repository(t);
  write('decisions/entries/one.yaml', 'entries: [{id: D-1, supersedes: [D-9]}]\n');
  git('add', '.'); git('commit', '-qm', 'unresolved source reference');
  const result = run('--source', git('rev-parse', 'HEAD'));
  assert.equal(result.status, 1, result.stderr);
  assert.ok(JSON.parse(result.stdout).diagnostics.some(({ code }) => code === 'missing-source-reference'));
});
