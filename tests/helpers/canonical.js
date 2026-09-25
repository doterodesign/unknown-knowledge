// The one shared test fixture: eight development-v2 installations committed as
// plain files under fixtures/canonical, with the gold judgments that
// tests/ask-gold.test.js scores against.
//
// Read-only tests use it in place. Tests that edit get a private copy. Tests
// that need Git copy one repository committed once per process instead of
// running `git init` and a first commit themselves.
import { cpSync, mkdirSync, mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const CANONICAL = fileURLToPath(new URL('../../fixtures/canonical', import.meta.url));
export const INSTALLATIONS = Object.freeze(['cedar-holding', 'cedar-north', 'cedar-south', 'cultural-research',
  'engineering', 'manufacturing', 'policy', 'professional-services']);

/** Absolute root of one canonical installation, for read-only use. */
export const installation = (name) => join(CANONICAL, name);

/** A private, disposable copy of one installation, removed after the test. */
export function copy(t, name) {
  const dir = mkdtempSync(join(tmpdir(), `uk-${name}-`));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  cpSync(installation(name), dir, { recursive: true });
  return { root: dir, kit: join(dir, 'unknown-knowledge') };
}

const GIT_IDENTITY = ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false'];
export const git = (dir, ...args) => {
  const r = spawnSync('git', ['-C', dir, ...GIT_IDENTITY, ...args], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout;
};

const committed = new Map();
process.on('exit', () => { for (const dir of committed.values()) rmSync(dir, { recursive: true, force: true }); });

/**
 * A private copy of one installation as a Git repository with the fixture as
 * its single commit. The commit is made once per process; each call copies it.
 */
export function repository(t, name) {
  if (!committed.has(name)) {
    const base = mkdtempSync(join(tmpdir(), `uk-${name}-git-`));
    cpSync(installation(name), base, { recursive: true });
    git(base, 'init', '-q');
    // Keep automatic maintenance synchronous so it never writes into .git
    // while a test removes its copy.
    git(base, 'config', 'gc.autoDetach', 'false');
    git(base, 'config', 'maintenance.autoDetach', 'false');
    git(base, 'add', '-A');
    git(base, 'commit', '-q', '-m', 'canonical fixture');
    committed.set(name, base);
  }
  const dir = mkdtempSync(join(tmpdir(), `uk-${name}-repo-`));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  cpSync(committed.get(name), dir, { recursive: true });
  return { root: dir, kit: join(dir, 'unknown-knowledge') };
}

export const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));
export const writeJson = (file, value) => writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);

let emptyRepository = null;

/**
 * A private Git repository holding exactly `files`, for tests whose scenario
 * is the planted tree itself (a survey blind spot, an audit candidate). The
 * empty repository is initialized once per process and copied, so no test runs
 * `git init`. Files are staged; pass `commit: true` to also commit them. `t`
 * may be null, and the copy is then removed when the process exits.
 */
export function scratchRepository(t, files = {}, { commit = false } = {}) {
  if (!emptyRepository) {
    emptyRepository = mkdtempSync(join(tmpdir(), 'uk-empty-git-'));
    git(emptyRepository, 'init', '-q');
    git(emptyRepository, 'config', 'gc.autoDetach', 'false');
    git(emptyRepository, 'config', 'maintenance.autoDetach', 'false');
    committed.set('\0empty', emptyRepository); // removed with the others on exit
  }
  const parent = mkdtempSync(join(tmpdir(), 'uk-scratch-'));
  // Without a test context (module-level setup), remove it when the process exits.
  if (t) t.after(() => rmSync(parent, { recursive: true, force: true }));
  else committed.set(parent, parent);
  const dir = join(parent, 'repo');
  cpSync(emptyRepository, dir, { recursive: true });
  for (const [file, content] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, file)), { recursive: true });
    writeFileSync(join(dir, file), content);
  }
  git(dir, 'add', '-A');
  if (commit) git(dir, 'commit', '-q', '-m', 'planted');
  return dir;
}
