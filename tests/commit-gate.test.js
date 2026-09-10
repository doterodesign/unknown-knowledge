// UCS-1227: the public seam is a real commit with the actual seeded hook.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const source = "export const FORMATS = ['png', 'svg'];\n";
const ontology = `schema-version: 1
entries:
  - id: K-101
    term: Export format
    class: 100-product
    summary: Formats available for export.
    status: active
    source-of-truth: [src/formats.ts]
    enumerates:
      - kind: ts-const-array
        source: src/formats.ts
        symbol: FORMATS
        values: [png, svg]
`;
const conceptPath = 'unknown-knowledge/ontology/classes/100-product.yaml';

function setup(t) {
  const repo = mkdtempSync(join(tmpdir(), 'ucs-1227-'));
  t.after(() => rmSync(repo, { recursive: true, force: true }));
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (key.startsWith('GIT_')) delete env[key];
  delete env.KIT_DIR;
  delete env.UK_ROOT;
  env.GIT_CONFIG_NOSYSTEM = '1';
  env.GIT_CONFIG_GLOBAL = '/dev/null';
  const run = (command, args) => spawnSync(command, args, { cwd: repo, env, encoding: 'utf8' });
  const git = (...args) => run('git', args);
  const ok = (result) => assert.equal(result.status, 0, result.stdout + result.stderr);
  const write = (path, text) => {
    mkdirSync(dirname(join(repo, path)), { recursive: true });
    writeFileSync(join(repo, path), text);
  };
  ok(git('init', '-q'));
  ok(git('config', 'user.name', 'Hook Test'));
  ok(git('config', 'user.email', 'hook@example.test'));
  symlinkSync(join(root, 'node_modules'), join(repo, 'node_modules'), 'dir');
  write('.gitignore', 'node_modules\n');
  ok(run(process.execPath, [join(root, 'cli/init.js'), 'init', '--yes', '--target', repo, '--stacks', 'ts', '--platforms', 'codex']));
  write('src/formats.ts', source);
  write(conceptPath, ontology);
  write('unknown-knowledge/ontology/_catalog.yaml', 'schema-version: 1\nstore: ontology\nentries:\n  - id: K-101\n    title: Export format\n    file: classes/100-product.yaml\n');
  const hook = join(repo, 'unknown-knowledge/hooks/pre-commit');
  chmodSync(hook, 0o755);
  symlinkSync('../../unknown-knowledge/hooks/pre-commit', join(repo, '.git/hooks/pre-commit'));
  const commit = () => { ok(git('add', '-A')); return git('commit', '-qm', 'fixture change'); };
  ok(commit());
  const base = git('rev-parse', 'HEAD').stdout;
  return { repo, git, write, commit, base, run };
}

test('installed gate refuses an added source value with value-drift evidence', (t) => {
  const { write, commit, git, base } = setup(t);
  write('src/formats.ts', "export const FORMATS = ['png', 'svg', 'pdf'];\n");
  const result = commit();
  assert.notEqual(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout + result.stderr, /source-value-missing.*K-101.*pdf/);
  assert.equal(git('rev-parse', 'HEAD').stdout, base, 'refused commit must leave HEAD unchanged');
});

test('installed gate commits a matching source and ontology update', (t) => {
  const { write, commit, git } = setup(t);
  const nextSource = "export const FORMATS = ['png', 'svg', 'pdf'];\n";
  const nextOntology = ontology.replace('values: [png, svg]', 'values: [png, svg, pdf]');
  write('src/formats.ts', nextSource);
  write(conceptPath, nextOntology);
  const result = commit();
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stderr, /validate: clean \(exit 0\)/);
  assert.match(result.stderr, /validate-values: clean \(exit 0\)/);
  assert.equal(git('show', 'HEAD:src/formats.ts').stdout, nextSource);
  assert.equal(git('show', `HEAD:${conceptPath}`).stdout, nextOntology);
});

test('structural findings block despite a clean value check', (t) => {
  const { write, commit, git, base } = setup(t);
  write(conceptPath, ontology.replace('source-of-truth: [src/formats.ts]', 'source-of-truth: [src/formats.ts, src/missing.ts]'));
  const result = commit();
  assert.notEqual(result.status, 0);
  assert.match(result.stdout + result.stderr, /missing-path/);
  assert.match(result.stderr, /validate: findings \(exit 1\)/);
  assert.match(result.stderr, /validate-values: clean \(exit 0\)/);
  assert.equal(git('rev-parse', 'HEAD').stdout, base);
});

for (const check of ['validate', 'validate-values']) {
  test(`a missing ${check} blocks the commit while the other check still runs`, (t) => {
    const { repo, commit, git, base, run } = setup(t);
    rmSync(join(repo, `unknown-knowledge/engine/commands/${check}.js`));
    const result = commit();
    const other = check === 'validate' ? 'validate-values' : 'validate';
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, new RegExp(`${check}: failure \\(exit 2\\)`));
    assert.match(result.stderr, new RegExp(`${other}: clean \\(exit 0\\)`));
    assert.equal(git('rev-parse', 'HEAD').stdout, base);
    // Git normalizes hook failure; the public command retains the exit-2 contract.
    const command = run(process.execPath, ['unknown-knowledge/engine/commit-check.js', '--root', '.']);
    assert.equal(command.status, 2, command.stderr);
  });
}

test('failure dominates findings while preserving both check diagnostics', (t) => {
  const { repo, write, commit, run } = setup(t);
  write('src/formats.ts', "export const FORMATS = ['png', 'svg', 'pdf'];\n");
  rmSync(join(repo, 'unknown-knowledge/engine/commands/validate.js'));
  const result = commit();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /validate: failure \(exit 2\)/);
  assert.match(result.stderr, /validate-values: findings \(exit 1\)/);
  assert.match(result.stdout + result.stderr, /source-value-missing.*K-101.*pdf/);
  assert.equal(run(process.execPath, ['unknown-knowledge/engine/commit-check.js', '--root', '.']).status, 2);
});

test('whole-store gate refuses existing drift when only an unrelated file is staged', (t) => {
  const { write, git, base } = setup(t);
  write('src/formats.ts', "export const FORMATS = ['png', 'svg', 'pdf'];\n");
  // Install the prior drift as committed history, outside the gate under test.
  assert.equal(git('-c', 'core.hooksPath=/dev/null', 'add', 'src/formats.ts').status, 0);
  assert.equal(git('-c', 'core.hooksPath=/dev/null', 'commit', '-qm', 'prior drift').status, 0);
  const driftHead = git('rev-parse', 'HEAD').stdout;
  assert.notEqual(driftHead, base);
  write('note.txt', 'unrelated edit\n');
  assert.equal(git('add', 'note.txt').status, 0);
  const result = git('commit', '-qm', 'unrelated change');
  assert.notEqual(result.status, 0);
  assert.match(result.stdout + result.stderr, /source-value-missing.*K-101.*pdf/);
  assert.equal(git('rev-parse', 'HEAD').stdout, driftHead);
});
