import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, lstatSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { withTreeSnapshot, withCommitSnapshot, readCommittedTree, changedTreePaths } from '../payload/engine/lib/commit-snapshot.js';
import { scratchRepository } from './helpers/canonical.js';

function fixture(t, format = 'sha1') {
  let root;
  if (format === 'sha1') root = scratchRepository(t);
  else {
    root = mkdtempSync(join(tmpdir(), 'tree-snapshot-test-'));
    t.after(() => rmSync(root, { recursive: true, force: true }));
  }
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (key.startsWith('GIT_')) delete env[key];
  Object.assign(env, { GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' });
  const git = (...args) => {
    const result = spawnSync('git', ['-C', root, ...args], { env, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr); return result.stdout.trim();
  };
  if (format !== 'sha1') git('init', '-q', `--object-format=${format}`);
  git('config', 'user.name', 'Tree Test'); git('config', 'user.email', 'tree@example.test');
  git('config', 'core.autocrlf', 'false');
  const bytes = Buffer.from('\uFEFFold-format: retained\r\n# unchanged raw body\r\n');
  writeFileSync(join(root, 'source.txt'), bytes); chmodSync(join(root, 'source.txt'), 0o755);
  symlinkSync('source.txt', join(root, 'alias'));
  git('add', '.'); git('commit', '-qm', 'pinned source');
  return { root, git, bytes, commit: git('rev-parse', 'HEAD'), tree: git('rev-parse', 'HEAD^{tree}') };
}

// Git's default object format (sha1) throughout, like the canonical fixture;
// one test at the end proves the other format is detected.
test('explicit raw tree snapshots preserve bytes/modes and ignore dirty user state', async (t) => {
  {
    const f = fixture(t);
    writeFileSync(join(f.root, 'source.txt'), 'staged change'); f.git('add', 'source.txt');
    writeFileSync(join(f.root, 'source.txt'), 'unstaged change');
    writeFileSync(join(f.root, 'untracked'), 'untracked');
    const index = readFileSync(join(f.root, '.git/index'));
    let materialized;
    const output = await withTreeSnapshot(f.root, f.tree, async (snapshot) => {
      materialized = snapshot.root;
      assert.equal(snapshot.tree, f.tree);
      assert.equal(Object.hasOwn(snapshot, 'commit'), false);
      assert.deepEqual(readFileSync(join(snapshot.root, 'source.txt')), f.bytes);
      assert.deepEqual(readFileSync(join(snapshot.root, 'alias')), f.bytes);
      assert.equal(lstatSync(join(snapshot.root, 'alias')).isSymbolicLink(), true);
      assert.equal(lstatSync(join(snapshot.root, 'source.txt')).mode & 0o777, 0o755);
      assert.equal(existsSync(join(snapshot.root, 'untracked')), false);
      assert.equal(existsSync(join(snapshot.root, '_identity.yaml')), false, 'old-format trees need no canonical model');
      await Promise.resolve(); return { inspected: f.tree };
    });
    assert.deepEqual(output, { inspected: f.tree });
    assert.equal(existsSync(dirname(materialized)), false, 'disposable root cleaned after callback');
    assert.deepEqual(readFileSync(join(f.root, '.git/index')), index);
    assert.equal(readFileSync(join(f.root, 'source.txt'), 'utf8'), 'unstaged change');
    assert.equal(readFileSync(join(f.root, 'untracked'), 'utf8'), 'untracked');
    assert.equal(f.git('rev-parse', 'HEAD'), f.commit);
  }
});

test('tree callbacks clean up on failure and reject revision expressions or non-tree objects', async (t) => {
  const f = fixture(t);
  let materialized;
  await assert.rejects(withTreeSnapshot(f.root, f.tree, ({ root }) => {
    materialized = root; throw new Error('consumer refusal');
  }), /consumer refusal/);
  assert.equal(existsSync(dirname(materialized)), false);
  for (const tree of ['HEAD^{tree}', f.tree.slice(0, 12), f.tree.toUpperCase(), '0'.repeat(64), f.commit]) {
    await assert.rejects(withTreeSnapshot(f.root, tree, () => assert.fail('invalid input must not reach callback')), /snapshot:/);
  }
});

test('explicit tree reads clear ambient Git routing and keep existing raw materializer refusals', async (t) => {
  const f = fixture(t);
  const overrides = { GIT_DIR: '/missing/repository', GIT_WORK_TREE: '/missing/worktree', GIT_INDEX_FILE: '/missing/index',
    GIT_OBJECT_DIRECTORY: '/missing/objects', GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'core.bare', GIT_CONFIG_VALUE_0: 'true' };
  const previous = Object.fromEntries(Object.keys(overrides).map((key) => [key, process.env[key]]));
  Object.assign(process.env, overrides);
  try {
    await withTreeSnapshot(f.root, f.tree, ({ root }) => assert.deepEqual(readFileSync(join(root, 'source.txt')), f.bytes));
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
  symlinkSync('../escape', join(f.root, 'outside')); f.git('add', 'outside');
  const escaped = f.git('write-tree');
  await assert.rejects(withTreeSnapshot(f.root, escaped, () => assert.fail('unsafe symlink')), /points outside/);
  f.git('rm', '--cached', 'outside');
  f.git('update-index', '--add', '--cacheinfo', `160000,${f.commit},submodule`);
  await assert.rejects(withTreeSnapshot(f.root, f.git('write-tree'), () => assert.fail('unsupported gitlink')), /unsupported Git entry/);
});

test('committed descriptors stay pinned while shared tree diffs retain every rename/copy endpoint', async (t) => {
  {
    const format = 'sha1';
    const f = fixture(t, format);
    f.git('mv', 'source.txt', 'renamed file.txt');
    writeFileSync(join(f.root, 'copy.txt'), f.bytes); chmodSync(join(f.root, 'copy.txt'), 0o755);
    const unusual = 'odd\tname\n.txt';
    writeFileSync(join(f.root, unusual), 'raw unusual path');
    f.git('add', '.');
    const nextTree = f.git('write-tree');
    const expected = ['source.txt', 'renamed file.txt', 'copy.txt', unusual].sort();
    const index = readFileSync(join(f.root, '.git/index'));
    assert.deepEqual(changedTreePaths(f.root, f.tree, nextTree).sort(), expected);
    await withCommitSnapshot(f.root, ({ changedPaths }) => {
      assert.deepEqual(changedPaths().sort(), expected);
      return 0;
    });
    assert.deepEqual(readFileSync(join(f.root, '.git/index')), index);
    f.git('commit', '-qm', 'advance HEAD');
    assert.deepEqual(readCommittedTree(f.root, f.commit), { commit: f.commit, tree: f.tree, objectFormat: format });
    const nextCommit = f.git('rev-parse', 'HEAD');
    assert.deepEqual(readCommittedTree(f.root, nextCommit), { commit: nextCommit, tree: nextTree, objectFormat: format });
    assert.deepEqual(changedTreePaths(f.root, nextTree, nextTree), []);
  }
});

test('commit/tree evidence helpers reject expressions, truncated IDs and cross-type substitutions', (t) => {
  const f = fixture(t);
  for (const commit of ['HEAD', f.commit.slice(0, 12), f.commit.toUpperCase(), f.commit.slice(0, -1) + '\n', f.tree,
    f.git('rev-parse', 'HEAD:source.txt')]) {
    assert.throws(() => readCommittedTree(f.root, commit), /snapshot:/);
  }
  for (const tree of ['HEAD^{tree}', f.tree.slice(0, 12), f.tree.slice(0, -1) + '\n', f.commit, '0'.repeat(64)]) {
    assert.throws(() => changedTreePaths(f.root, tree, f.tree), /snapshot:/);
    assert.throws(() => changedTreePaths(f.root, f.tree, tree), /snapshot:/);
  }
});

test('a sha256 repository is detected as sha256', async (t) => {
  const f = fixture(t, 'sha256');
  assert.equal(f.commit.length, 64);
  assert.deepEqual(readCommittedTree(f.root, f.commit), { commit: f.commit, tree: f.tree, objectFormat: 'sha256' });
  await withTreeSnapshot(f.root, f.tree, ({ root }) => assert.deepEqual(readFileSync(join(root, 'source.txt')), f.bytes));
});
