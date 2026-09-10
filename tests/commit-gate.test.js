// UCS-1227: the public seam is a real commit with the actual seeded hook.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

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
  const scratch = mkdtempSync(join(tmpdir(), 'ucs-1228-snapshots-'));
  t.after(() => rmSync(scratch, { recursive: true, force: true }));
  env.TMPDIR = scratch;
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
  return { repo, git, write, commit, base, run, env, scratch };
}

test('valid staged source and stores commit despite invalid unstaged bytes and agree with committed validation', (t) => {
  const { repo, git, write, run, scratch } = setup(t);
  const nextSource = "export const FORMATS = ['png', 'svg', 'pdf'];\n";
  const nextOntology = ontology.replace('values: [png, svg]', 'values: [png, svg, pdf]');
  write('src/formats.ts', nextSource);
  write(conceptPath, nextOntology);
  assert.equal(git('add', 'src/formats.ts', conceptPath).status, 0);
  write('src/formats.ts', 'invalid unstaged source\n');
  write(conceptPath, 'entries: [broken\n');
  const index = readFileSync(join(repo, '.git/index'));
  const check = run(process.execPath, ['unknown-knowledge/engine/commit-check.js', '--root', '.']);
  assert.equal(check.status, 0, check.stderr);
  assert.deepEqual(readFileSync(join(repo, '.git/index')), index, 'the CLI does not refresh the user index');
  const staged = git('ls-files', '--stage', '-z').stdout;
  const result = git('commit', '-qm', 'valid candidate');
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(git('show', 'HEAD:src/formats.ts').stdout, nextSource);
  assert.equal(git('show', `HEAD:${conceptPath}`).stdout, nextOntology);
  assert.equal(git('ls-files', '--stage', '-z').stdout, staged);
  assert.equal(readFileSync(join(repo, 'src/formats.ts'), 'utf8'), 'invalid unstaged source\n');
  assert.equal(readFileSync(join(repo, conceptPath), 'utf8'), 'entries: [broken\n');
  assert.deepEqual(readdirSync(scratch).filter((name) => name.startsWith('unknown-knowledge-commit-')), [], 'success removes the isolated evidence');
  const committed = join(scratch, 'committed');
  assert.equal(git('clone', '-q', '--no-hardlinks', repo, committed).status, 0);
  symlinkSync(join(root, 'node_modules'), join(committed, 'node_modules'), 'dir');
  for (const name of ['validate', 'validate-values']) {
    const ci = run(process.execPath, [join(committed, `unknown-knowledge/engine/${name}.js`), '--root', committed]);
    assert.equal(ci.status, 0, ci.stdout + ci.stderr);
  }
});

test('unstaged source repair cannot conceal staged source-value drift', (t) => {
  const { repo, git, write, base, scratch } = setup(t);
  write('src/formats.ts', "export const FORMATS = ['png', 'svg', 'pdf'];\n");
  assert.equal(git('add', 'src/formats.ts').status, 0);
  write('src/formats.ts', source);
  const staged = git('ls-files', '--stage', '-z').stdout;
  const result = git('commit', '-qm', 'hidden source drift');
  assert.notEqual(result.status, 0);
  assert.match(result.stdout + result.stderr, /source-value-missing.*K-101.*pdf/);
  assert.equal(git('rev-parse', 'HEAD').stdout, base);
  assert.equal(git('ls-files', '--stage', '-z').stdout, staged);
  assert.equal(readFileSync(join(repo, 'src/formats.ts'), 'utf8'), source);
  assert.deepEqual(readdirSync(scratch).filter((name) => name.startsWith('unknown-knowledge-commit-')), []);
});

test('untracked evidence and installed dependencies are absent from both validators candidate', (t) => {
  const { repo, git, write, base, scratch } = setup(t);
  write('src/untracked.ts', source);
  write(conceptPath, ontology.replaceAll('src/formats.ts', 'src/untracked.ts')
    .replace('source-of-truth: [src/untracked.ts]', 'source-of-truth: [src/untracked.ts, node_modules/js-yaml/package.json]'));
  assert.equal(git('add', conceptPath).status, 0);
  const staged = git('ls-files', '--stage', '-z').stdout;
  const result = git('commit', '-qm', 'untracked evidence');
  assert.notEqual(result.status, 0);
  assert.match(result.stdout + result.stderr, /missing-path/);
  assert.match(result.stdout + result.stderr, /source-missing/);
  assert.match(result.stdout + result.stderr, /node_modules\/js-yaml\/package.json/);
  assert.equal(git('rev-parse', 'HEAD').stdout, base);
  assert.equal(git('ls-files', '--stage', '-z').stdout, staged);
  assert.equal(readFileSync(join(repo, 'src/untracked.ts'), 'utf8'), source);
  assert.deepEqual(readdirSync(scratch).filter((name) => name.startsWith('unknown-knowledge-commit-')), []);
});

test('candidate rules and filenames survive attributes without executing checkout filters', (t) => {
  const { repo, git, write, scratch } = setup(t);
  const rules = readFileSync(join(repo, 'unknown-knowledge/ontology/_rules.yaml'), 'utf8');
  const name = '-formats, "quoted"\t雪\n$.ts';
  write(name, source);
  write(conceptPath, ontology.replaceAll('src/formats.ts', JSON.stringify(name)));
  write('unknown-knowledge/ontology/_rules.yaml', 'invalid: [rules\n');
  write('.gitattributes', 'unknown-knowledge/** export-ignore\n*.ts filter=probe\n');
  assert.equal(git('add', '-A').status, 0);
  // Repair only the worktree config. Snapshot must still see the staged defect.
  write('unknown-knowledge/ontology/_rules.yaml', rules);
  assert.equal(git('config', 'filter.probe.smudge', 'touch filter-was-run').status, 0);
  const rejected = git('commit', '-qm', 'staged config');
  assert.notEqual(rejected.status, 0);
  assert.match(rejected.stdout + rejected.stderr, /parse-error/);
  assert.equal(git('add', 'unknown-knowledge/ontology/_rules.yaml').status, 0);
  const accepted = git('commit', '-qm', 'candidate paths');
  assert.equal(accepted.status, 0, accepted.stdout + accepted.stderr);
  assert.equal(git('show', `HEAD:${name}`).stdout, source);
  assert.equal(git('ls-files', '--others', '--exclude-standard').stdout, '');
  assert.deepEqual(readdirSync(scratch).filter((name) => name.startsWith('unknown-knowledge-commit-')), []);
});

test('a candidate source cannot read through a path outside the snapshot', (t) => {
  const { repo, git, write } = setup(t);
  const outside = `../../../${basename(repo)}/src/formats.ts`;
  write(conceptPath, ontology.replaceAll('src/formats.ts', outside));
  assert.equal(git('add', conceptPath).status, 0);
  const result = git('commit', '-qm', 'outside evidence');
  assert.notEqual(result.status, 0);
  assert.match(result.stdout + result.stderr, /source-missing.*K-101/);
  assert.match(result.stdout + result.stderr, /outside the repo root/);
});

test('relative symlinks resolve only to staged evidence', (t) => {
  const { repo, git, write, scratch } = setup(t);
  symlinkSync('formats.ts', join(repo, 'src/link.ts'));
  write(conceptPath, ontology.replaceAll('src/formats.ts', 'src/link.ts'));
  assert.equal(git('add', '-A').status, 0);
  write('src/formats.ts', 'unstaged invalid source\n');
  const result = git('commit', '-qm', 'staged symlink');
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(git('show', 'HEAD:src/link.ts').stdout, 'formats.ts');
  assert.deepEqual(readdirSync(scratch).filter((name) => name.startsWith('unknown-knowledge-commit-')), []);
});

test('cleanup failure blocks a clean candidate with an explicit cleanup diagnostic', (t) => {
  const { repo, git, write, run, env, base, scratch } = setup(t);
  write('note.txt', 'candidate\n');
  assert.equal(git('add', 'note.txt').status, 0);
  // Fault injection at the filesystem boundary, in a separate process. The
  // real removal still occurs, then simulates a filesystem completion error.
  const preload = join(scratch, 'cleanup-fault.mjs');
  writeFileSync(preload, `import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
const remove = fs.rmSync;
fs.rmSync = (path, options) => {
  remove(path, options);
  if (String(path).includes('unknown-knowledge-commit-')) throw new Error('injected filesystem failure');
};
syncBuiltinESMExports();\n`);
  env.NODE_OPTIONS = `--import=${pathToFileURL(preload).href}`;
  const staged = git('ls-files', '--stage', '-z').stdout;
  const result = git('commit', '-qm', 'cleanup fault');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /snapshot cleanup failed/);
  assert.equal(git('rev-parse', 'HEAD').stdout, base);
  assert.equal(git('ls-files', '--stage', '-z').stdout, staged);
  assert.equal(readFileSync(join(repo, 'note.txt'), 'utf8'), 'candidate\n');
  const index = readFileSync(join(repo, '.git/index'));
  assert.equal(run(process.execPath, ['unknown-knowledge/engine/commit-check.js', '--root', '.']).status, 2);
  assert.deepEqual(readFileSync(join(repo, '.git/index')), index);
  assert.deepEqual(readdirSync(scratch).filter((name) => name.startsWith('unknown-knowledge-commit-')), []);
});

for (const fault of ['snapshot', 'dependency', 'escaping-link', 'gitlink']) {
  test(`${fault} failure refuses a real commit, cleans snapshots and preserves local work`, (t) => {
    const { repo, git, write, env, scratch, run, base } = setup(t);
    write('note.txt', 'staged note\n');
    assert.equal(git('add', 'note.txt').status, 0);
    write('note.txt', 'unstaged note\n');
    if (fault === 'snapshot') {
      const preload = join(scratch, 'git-fault.mjs');
      writeFileSync(preload, `import cp from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
const spawn = cp.spawnSync;
cp.spawnSync = (command, args, options) => command === 'git' && args.includes('cat-file')
  ? { status: 77, stderr: Buffer.from('injected Git read failure') }
  : spawn(command, args, options);
syncBuiltinESMExports();\n`);
      env.NODE_OPTIONS = `--import=${pathToFileURL(preload).href}`;
    } else if (fault === 'dependency') {
      rmSync(join(repo, 'node_modules'));
    } else if (fault === 'escaping-link') {
      symlinkSync(join(repo, 'src/formats.ts'), join(repo, 'escape.ts'));
      write(conceptPath, ontology.replaceAll('src/formats.ts', 'escape.ts'));
      assert.equal(git('add', 'escape.ts', conceptPath).status, 0);
    } else {
      assert.equal(git('update-index', '--add', '--cacheinfo', '160000', base.trim(), 'submodule').status, 0);
    }
    const staged = git('ls-files', '--stage', '-z').stdout;
    const result = git('commit', '-qm', `fault ${fault}`);
    assert.notEqual(result.status, 0);
    if (fault === 'snapshot') assert.match(result.stderr, /snapshot.*git cat-file failed.*injected Git read failure/);
    if (fault === 'dependency') {
      assert.match(result.stderr, /validate: failure \(exit 2\)/);
      assert.match(result.stderr, /validate-values: failure \(exit 2\)/);
    }
    if (fault === 'escaping-link') assert.match(result.stderr, /snapshot.*symlink.*outside/);
    if (fault === 'gitlink') assert.match(result.stderr, /snapshot.*unsupported Git entry.*160000/);
    assert.equal(git('rev-parse', 'HEAD').stdout, base);
    assert.equal(git('ls-files', '--stage', '-z').stdout, staged);
    assert.equal(readFileSync(join(repo, 'note.txt'), 'utf8'), 'unstaged note\n');
    const index = readFileSync(join(repo, '.git/index'));
    const command = run(process.execPath, ['unknown-knowledge/engine/commit-check.js', '--root', '.']);
    assert.equal(command.status, 2, command.stderr);
    assert.deepEqual(readFileSync(join(repo, '.git/index')), index);
    assert.deepEqual(readdirSync(scratch).filter((name) => name.startsWith('unknown-knowledge-commit-')), []);
  });
}

test('a path-limited commit checks Git alternate index and leaves other staging intact', (t) => {
  const { repo, git, write, scratch } = setup(t);
  write('src/formats.ts', "export const FORMATS = ['png', 'svg', 'pdf'];\n");
  assert.equal(git('add', 'src/formats.ts').status, 0);
  const stagedSource = git('show', ':src/formats.ts').stdout;
  write('note.txt', 'only this file\n');
  assert.equal(git('add', 'note.txt').status, 0);
  const result = git('commit', '-qm', 'only note', '--', 'note.txt');
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(git('show', 'HEAD:src/formats.ts').stdout, source);
  assert.equal(git('show', ':src/formats.ts').stdout, stagedSource);
  assert.equal(readFileSync(join(repo, 'src/formats.ts'), 'utf8'), stagedSource);
  assert.deepEqual(readdirSync(scratch).filter((name) => name.startsWith('unknown-knowledge-commit-')), []);
});

test('a split index can be checked without changing its staged entries', (t) => {
  const { repo, git, write, run } = setup(t);
  assert.equal(git('update-index', '--split-index').status, 0);
  write('note.txt', 'split index\n');
  assert.equal(git('add', 'note.txt').status, 0);
  const index = readFileSync(join(repo, '.git/index'));
  const result = run(process.execPath, ['unknown-knowledge/engine/commit-check.js', '--root', '.']);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.deepEqual(readFileSync(join(repo, '.git/index')), index);
  assert.equal(git('commit', '-qm', 'split index').status, 0);
});

test('commit-check refuses a root below the Git repository instead of checking a different tree', (t) => {
  const { run, repo } = setup(t);
  const index = readFileSync(join(repo, '.git/index'));
  const result = run(process.execPath, ['unknown-knowledge/engine/commit-check.js', '--root', 'src']);
  assert.equal(result.status, 2, result.stdout + result.stderr);
  assert.match(result.stderr, /snapshot.*--root must be the Git repository root/);
  assert.deepEqual(readFileSync(join(repo, '.git/index')), index);
});

test('installed gate refuses malformed staged store bytes despite an unstaged repair', (t) => {
  const { repo, write, git, base } = setup(t);
  write(conceptPath, 'entries: [broken\n');
  assert.equal(git('add', conceptPath).status, 0);
  write(conceptPath, ontology);
  const index = git('ls-files', '--stage', '-z').stdout;
  const result = git('commit', '-qm', 'partially staged store');
  assert.notEqual(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout + result.stderr, /parse-error/);
  assert.equal(git('rev-parse', 'HEAD').stdout, base);
  assert.equal(git('ls-files', '--stage', '-z').stdout, index);
  assert.equal(readFileSync(join(repo, conceptPath), 'utf8'), ontology);
});

test('installed gate refuses an added source value with value-drift evidence', (t) => {
  const { write, commit, git, base } = setup(t);
  write('src/formats.ts', "export const FORMATS = ['png', 'svg', 'pdf'];\n");
  const result = commit();
  assert.notEqual(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout + result.stderr, /source-value-missing.*K-101.*pdf/);
  assert.equal(git('rev-parse', 'HEAD').stdout, base, 'refused commit must leave HEAD unchanged');
});

test('untracked stores cannot turn a staged source change into an empty clean check', (t) => {
  const { git, write, base } = setup(t);
  assert.equal(git('rm', '-r', '--cached', 'unknown-knowledge').status, 0);
  write('src/formats.ts', "export const FORMATS = ['png', 'svg', 'pdf'];\n");
  assert.equal(git('add', 'src/formats.ts').status, 0);
  const index = git('ls-files', '--stage', '-z').stdout;
  const result = git('commit', '-qm', 'stores absent from candidate');
  assert.notEqual(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stderr, /snapshot.*no governed stores/);
  assert.equal(git('rev-parse', 'HEAD').stdout, base);
  assert.equal(git('ls-files', '--stage', '-z').stdout, index);
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
