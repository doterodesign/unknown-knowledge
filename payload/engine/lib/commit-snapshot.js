/** Raw Git objects as disposable evidence; never checkout filters or client code. */
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import process from 'node:process';

/**
 * @typedef {{root: string, tree: string}} TreeSnapshot
 * @typedef {{candidate: TreeSnapshot, before: null | {commit: string, tree: string, materialize: () => TreeSnapshot}, changedPaths: () => string[]}} CommitSnapshot
 *
 * The callback owns no files. Candidate evidence and optional before evidence
 * share this lifetime; immutable tree IDs pin provenance for later attribution.
 * Before materialization is lazy: consumers request it for transition checks.
 * @param {string} repoRoot
 * @param {(snapshot: CommitSnapshot) => Promise<number>} check
 * @param {{skipUnchanged?: boolean}} [options] Attribution can skip an empty diff.
 */
export async function withCommitSnapshot(repoRoot, check, { skipUnchanged = false } = {}) {
  const temporary = mkdtempSync(join(tmpdir(), 'unknown-knowledge-commit-'));
  const env = { ...process.env, GIT_NO_REPLACE_OBJECTS: '1', GIT_NO_LAZY_FETCH: '1' };
  try {
    repoRoot = realpathSync(repoRoot);
    const git = gitReader(repoRoot, env);
    const top = git(['rev-parse', '--show-toplevel']).toString().replace(/\n$/, '');
    if (realpathSync(top) !== repoRoot) {
      throw new Error('snapshot: --root must be the Git repository root');
    }
    let beforeTree = null;
    const beforeCommit = git(['rev-parse', '--verify', '--quiet', 'HEAD^{commit}'], { missing: true })?.toString().trim() ?? null;
    if (beforeCommit !== null) {
      beforeTree = git(['rev-parse', '--verify', `${beforeCommit}^{tree}`]).toString().trim();
    } else {
      // Only an absent branch is an unborn HEAD. A broken existing ref must
      // never be interpreted as an empty before snapshot.
      const ref = git(['symbolic-ref', 'HEAD']).toString().trim();
      if (git(['show-ref', '--verify', '--quiet', ref], { missing: true }) !== null) {
        throw new Error('snapshot: HEAD exists but its tree could not be read');
      }
    }
    // write-tree may refresh index metadata: give it a private copy, including
    // Git's alternate index during a path-limited commit.
    const index = git(['rev-parse', '--git-path', 'index']).toString().replace(/\n$/, '');
    const privateIndex = join(temporary, 'index');
    try {
      copyFileSync(resolve(repoRoot, index), privateIndex);
    } catch (error) {
      // A new repo may have no index yet. Git writes the empty tree from the
      // absent private index; other missing/unreadable indexes still fail.
      if (error.code !== 'ENOENT' || beforeTree !== null) throw error;
    }
    env.GIT_INDEX_FILE = privateIndex;
    const tree = git(['write-tree']).toString().trim();
    const candidate = { root: join(temporary, 'candidate'), tree };
    let beforeSnapshot;
    const before = beforeTree === null ? null : {
      commit: beforeCommit,
      tree: beforeTree,
      materialize: () => {
        if (!beforeSnapshot) {
          const root = join(temporary, 'before');
          materializeTree(root, beforeTree, git);
          beforeSnapshot = { root, tree: beforeTree };
        }
        return beforeSnapshot;
      },
    };
    let pathsCache;
    const changedPaths = () => {
      if (pathsCache) return pathsCache;
      const base = beforeTree ?? git(['hash-object', '-w', '-t', 'tree', '--stdin']).toString().trim();
      pathsCache = diffPaths(git, base, tree);
      return pathsCache;
    };
    if (skipUnchanged && changedPaths().length === 0) return 0;
    materializeTree(candidate.root, tree, git);
    return await check({ candidate, before, changedPaths });
  } finally {
    removeSnapshot(temporary);
  }
}

/**
 * Materialize one exact raw tree for a trusted in-process consumer. No index,
 * canonical ledger or model is required, so an old-format source remains
 * inspectable. The callback owns no files: the snapshot is removed on return
 * or throw. A tree is evidence only, never a commit-membership/publication claim.
 * @template T
 * @param {string} repoRoot actual repository root
 * @param {string} tree full lowercase tree OID in this repository's object format
 * @param {(snapshot: TreeSnapshot) => T | Promise<T>} check trusted engine callback
 * @returns {Promise<T>}
 */
export async function withTreeSnapshot(repoRoot, tree, check) {
  const temporary = mkdtempSync(join(tmpdir(), 'unknown-knowledge-tree-'));
  try {
    const { git, width } = explicitGitReader(repoRoot);
    requireTree(git, tree, width);
    const snapshot = { root: join(temporary, 'tree'), tree };
    materializeTree(snapshot.root, tree, git);
    return await check(snapshot);
  } finally { removeSnapshot(temporary); }
}

/** Verify an exact committed object and derive its own tree, never a later ref. */
export function readCommittedTree(repoRoot, commit) {
  const { git, width, objectFormat } = explicitGitReader(repoRoot);
  requireOid(commit, width);
  if (git(['cat-file', '-t', commit]).toString().trim() !== 'commit') throw new Error('snapshot: supplied object must be a commit');
  const tree = git(['rev-parse', '--verify', `${commit}^{tree}`]).toString().trim();
  requireTree(git, tree, width);
  return { commit, tree, objectFormat };
}

/** All changed paths from two exact immutable trees, including both rename/copy endpoints. */
export function changedTreePaths(repoRoot, beforeTree, candidateTree) {
  const { git, width } = explicitGitReader(repoRoot);
  requireTree(git, beforeTree, width);
  requireTree(git, candidateTree, width);
  return diffPaths(git, beforeTree, candidateTree);
}

function explicitGitReader(repoRoot) {
  const env = { ...process.env };
  // Explicit object readers must not inherit user index/repository routing.
  for (const key of Object.keys(env)) if (key.startsWith('GIT_')) delete env[key];
  Object.assign(env, { GIT_NO_REPLACE_OBJECTS: '1', GIT_NO_LAZY_FETCH: '1', GIT_TERMINAL_PROMPT: '0',
    GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' });
  repoRoot = realpathSync(repoRoot);
  const git = gitReader(repoRoot, env);
  const top = git(['rev-parse', '--show-toplevel']).toString().replace(/\n$/, '');
  if (realpathSync(top) !== repoRoot) throw new Error('snapshot: --root must be the Git repository root');
  const objectFormat = git(['rev-parse', '--show-object-format']).toString().trim();
  const width = { sha1: 40, sha256: 64 }[objectFormat];
  if (!width) throw new Error('snapshot: unsupported repository object format');
  return { git, width, objectFormat };
}

function requireOid(oid, width) {
  if (typeof oid !== 'string' || oid.length !== width || !/^[0-9a-f]+(?![\s\S])$/.test(oid)) {
    throw new Error('snapshot: expected a full lowercase object OID in the repository object format');
  }
}

function requireTree(git, tree, width) {
  requireOid(tree, width);
  if (git(['cat-file', '-t', tree]).toString().trim() !== 'tree') throw new Error('snapshot: supplied object must be a tree');
}

function diffPaths(git, base, tree) {
  // Pin similarity and exhaustive-search limits: host diff.renameLimit
  // must not change the path set for the same immutable trees.
  const bytes = git(['diff-tree', '--no-commit-id', '--name-status', '-r', '-z', '--no-ext-diff', '--no-textconv', '--find-renames=50%', '--find-copies=50%', '--find-copies-harder', '-l1000', base, tree, '--']);
  const text = bytes.toString();
  if (!Buffer.from(text).equals(bytes)) throw new Error('snapshot: non-UTF-8 changed paths cannot be attributed faithfully');
  if (text && !text.endsWith('\0')) throw new Error('snapshot: incomplete Git change records');
  const records = text ? text.slice(0, -1).split('\0') : [];
  const paths = [];
  for (let i = 0; i < records.length;) {
    const status = records[i++];
    if (!/^(?:[ADMT]|[RC]\d+)$/.test(status)) throw new Error(`snapshot: unsupported Git change status ${JSON.stringify(status)}`);
    const count = /^[RC]/.test(status) ? 2 : 1;
    for (let n = 0; n < count; n += 1) {
      const path = records[i++];
      if (!path) throw new Error('snapshot: incomplete Git change records');
      paths.push(path);
    }
  }
  return [...new Set(paths)];
}

function gitReader(repoRoot, env) {
  return (args, { missing = false } = {}) => {
    const result = spawnSync('git', ['-c', 'core.fsmonitor=false', '-C', repoRoot, ...args], { env, maxBuffer: 64 * 1024 * 1024 });
    if (missing && result.status === 1) return null;
    if (result.status !== 0) throw new Error(`snapshot: git ${args[0]} failed: ${result.error?.message ?? result.stderr.toString().trim()}`);
    return result.stdout;
  };
}

function removeSnapshot(temporary) {
  try { rmSync(temporary, { recursive: true, force: true, maxRetries: 3 }); }
  catch (error) { throw new Error(`snapshot cleanup failed at ${JSON.stringify(temporary)}: ${error.message}`, { cause: error }); }
}

function materializeTree(snapshotRoot, tree, git) {
  mkdirSync(snapshotRoot);
  const listing = git(['ls-tree', '-rz', '--full-tree', tree]);
  const text = listing.toString();
  if (!Buffer.from(text).equals(listing)) throw new Error('snapshot: non-UTF-8 Git paths cannot be materialized faithfully');
  const entries = text.split('\0').filter(Boolean);
  const links = [];
  for (const entry of entries) {
    const [header, path] = [entry.slice(0, entry.indexOf('\t')), entry.slice(entry.indexOf('\t') + 1)];
    const [mode, type, object] = header.split(' ');
    if (type !== 'blob' || !['100644', '100755', '120000'].includes(mode)) {
      throw new Error(`snapshot: unsupported Git entry ${JSON.stringify(path)} (${mode})`);
    }
    const target = resolve(snapshotRoot, path);
    if (outside(snapshotRoot, target) || target === snapshotRoot) throw new Error('snapshot: Git path escapes its root');
    mkdirSync(dirname(target), { recursive: true });
    const bytes = git(['cat-file', 'blob', object]);
    if (mode === '120000') {
      const link = bytes.toString();
      if (!Buffer.from(link).equals(bytes)) {
        throw new Error(`snapshot: non-UTF-8 symlink target at ${JSON.stringify(path)} cannot be materialized faithfully`);
      }
      if (isAbsolute(link) || outside(snapshotRoot, resolve(dirname(target), link))) {
        throw new Error(`snapshot: symlink ${JSON.stringify(path)} points outside the candidate`);
      }
      links.push({ link, target });
    } else {
      writeFileSync(target, bytes, { mode: Number.parseInt(mode, 8), flag: 'wx' });
    }
  }
  for (const { link, target } of links) symlinkSync(link, target);
  // Check complete link chains before either validator can read a store.
  for (const entry of entries.filter((entry) => entry.startsWith('120000 '))) {
    const path = entry.slice(entry.indexOf('\t') + 1);
    try {
      if (outside(realpathSync(snapshotRoot), realpathSync(join(snapshotRoot, path)))) {
        throw new Error(`snapshot: symlink ${JSON.stringify(path)} resolves outside the candidate`);
      }
    } catch (error) {
      if (error.code !== 'ENOENT') throw error; // dangling evidence remains missing
    }
  }
}

function outside(root, target) {
  const path = relative(root, target);
  return path === '..' || path.startsWith(`..${sep}`) || isAbsolute(path);
}
