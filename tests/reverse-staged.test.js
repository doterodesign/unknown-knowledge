// UCS-1230: real Git commits through both opt-in installed hooks.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const kit = fileURLToPath(new URL('..', import.meta.url));
const conceptFile = 'unknown-knowledge/ontology/classes/100-product.yaml';
const concept = (path) => `schema-version: 1\nentries:\n  - id: K-101\n    term: Export format\n    class: 100-product\n    summary: Available export formats.\n    status: active\n    source-of-truth: [${JSON.stringify(path)}]\n`;

function setup(t, { initial = true } = {}) {
  const repo = mkdtempSync(join(tmpdir(), 'ucs-1230-'));
  const scratch = mkdtempSync(join(tmpdir(), 'ucs-1230-evidence-'));
  t.after(() => { rmSync(repo, { recursive: true, force: true }); rmSync(scratch, { recursive: true, force: true }); });
  const env = { ...process.env, TMPDIR: scratch, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' };
  for (const key of Object.keys(env)) if (key.startsWith('GIT_') && !['GIT_CONFIG_NOSYSTEM', 'GIT_CONFIG_GLOBAL'].includes(key)) delete env[key];
  delete env.KIT_DIR;
  delete env.UK_ROOT;
  const run = (command, args) => spawnSync(command, args, { cwd: repo, env, encoding: 'utf8' });
  const git = (...args) => run('git', args);
  const ok = (r) => assert.equal(r.status, 0, r.stdout + r.stderr);
  const write = (path, bytes) => { mkdirSync(dirname(join(repo, path)), { recursive: true }); writeFileSync(join(repo, path), bytes); };
  ok(git('init', '-q'));
  ok(git('config', 'user.name', 'Hook Test'));
  ok(git('config', 'user.email', 'hook@example.test'));
  symlinkSync(join(kit, 'node_modules'), join(repo, 'node_modules'), 'dir');
  write('.gitignore', 'node_modules\n');
  ok(run(process.execPath, [join(kit, 'cli/init.js'), 'init', '--yes', '--target', repo, '--stacks', 'ts', '--platforms', 'codex']));
  for (const [hook, event] of [['pre-commit', 'pre-commit'], ['reverse-lookup', 'prepare-commit-msg']]) {
    chmodSync(join(repo, 'unknown-knowledge/hooks', hook), 0o755);
    symlinkSync(`../../unknown-knowledge/hooks/${hook}`, join(repo, '.git/hooks', event));
  }
  write('src/formats.ts', 'export const formats = ["png"];\n');
  write(conceptFile, concept('src/formats.ts'));
  write('unknown-knowledge/ontology/_catalog.yaml', 'schema-version: 1\nstore: ontology\nentries:\n  - id: K-101\n    title: Export format\n    file: classes/100-product.yaml\n');
  const commit = () => { ok(git('add', '-A')); return git('commit', '-qm', 'fixture change'); };
  if (initial) ok(commit());
  return { repo, scratch, env, run, git, write, commit, ok };
}

// Each origin owns a complete resolver JSON payload; paths are never parsed
// from human display lines (which can themselves contain filename newlines).
function attribution(result) {
  const output = result.stdout + result.stderr;
  const sections = output.split(/^staged attribution: (candidate|before) ([a-f0-9]+)\n/m);
  const records = {};
  for (let i = 1; i < sections.length; i += 3) records[sections[i]] = { tree: sections[i + 1], ...JSON.parse(sections[i + 2]) };
  return records;
}

test('deleting a governed file and repairing its pointer retains before attribution', (t) => {
  const { git, write, commit, scratch } = setup(t);
  const beforeTree = git('rev-parse', 'HEAD^{tree}').stdout.trim();
  assert.equal(git('rm', 'src/formats.ts').status, 0);
  write('src/replacement.ts', 'replacement\n');
  write(conceptFile, concept('src/replacement.ts'));
  const result = commit();
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const records = attribution(result);
  assert.ok(records.before, 'hook must expose pre-change attribution');
  assert.equal(records.before.tree, beforeTree);
  assert.deepEqual(records.before.paths.find((p) => p.path === 'src/formats.ts').concepts.map((c) => c.id), ['K-101']);
  assert.deepEqual(records.candidate.paths.find((p) => p.path === 'src/formats.ts').concepts, []);
  assert.deepEqual(records.candidate.paths.find((p) => p.path === 'src/replacement.ts').concepts.map((c) => c.id), ['K-101']);
  assert.deepEqual(readdirSync(scratch).filter((name) => name.startsWith('unknown-knowledge-commit-')), [], 'before and candidate evidence is cleaned');
});

test('a copied file reports the source and destination without changing their identities', (t) => {
  const { git, write, commit } = setup(t);
  write('src/copy.ts', git('show', 'HEAD:src/formats.ts').stdout);
  write(conceptFile, concept('src/copy.ts'));
  const result = commit();
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const records = attribution(result);
  assert.deepEqual(records.before.paths.find((p) => p.path === 'src/formats.ts')?.concepts.map((c) => c.id), ['K-101']);
  assert.deepEqual(records.candidate.paths.find((p) => p.path === 'src/copy.ts')?.concepts.map((c) => c.id), ['K-101']);
});

test('rename and staged pointer repair retain both origins despite conflicting unstaged pointers', (t) => {
  const { repo, git, write, run, scratch } = setup(t);
  assert.equal(git('mv', 'src/formats.ts', 'src/renamed.ts').status, 0);
  write(conceptFile, concept('src/renamed.ts'));
  assert.equal(git('add', conceptFile).status, 0);
  write(conceptFile, concept('src/unstaged.ts'));
  const index = readFileSync(join(repo, '.git/index'));
  const check = run('sh', ['unknown-knowledge/hooks/reverse-lookup']);
  assert.equal(check.status, 0, check.stdout + check.stderr);
  assert.deepEqual(readFileSync(join(repo, '.git/index')), index);
  const result = git('commit', '-qm', 'rename and repair');
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const records = attribution(result);
  assert.equal(records.candidate.tree, git('rev-parse', 'HEAD^{tree}').stdout.trim());
  for (const origin of ['before', 'candidate']) {
    assert.deepEqual(records[origin].paths.map((p) => p.path), ['src/formats.ts', 'src/renamed.ts', conceptFile]);
  }
  assert.deepEqual(records.before.paths[0].concepts.map((c) => c.id), ['K-101']);
  assert.deepEqual(records.before.paths[1].concepts, []);
  assert.deepEqual(records.candidate.paths[0].concepts, []);
  assert.deepEqual(records.candidate.paths[1].concepts.map((c) => c.id), ['K-101']);
  assert.equal(readFileSync(join(repo, conceptFile), 'utf8'), concept('src/unstaged.ts'));
  assert.deepEqual(readdirSync(scratch).filter((name) => name.startsWith('unknown-knowledge-commit-')), []);
});

test('valid unusual filenames survive Git, installed hooks and complete-path resolution', (t) => {
  const { repo, git, write, commit } = setup(t);
  const names = ['comma,name.ts', 'tab\tname.ts', 'line\nname.ts', ' spaces.ts ', '   ', '"quotes".ts', "single'quote.ts", '--option.ts', '雪.ts', '$(touch PWNED).ts', '`touch PWNED`.ts', 'back\\slash.ts'];
  for (const [i, name] of names.entries()) write(name, `file ${i}\n`);
  write(conceptFile, `schema-version: 1\nentries:\n${names.map((name, i) => `  - id: K-${110 + i}\n    term: Fixture ${i}\n    class: 100-product\n    summary: Governed filename fixture.\n    status: active\n    source-of-truth: [${JSON.stringify(name)}]\n`).join('')}`);
  write('unknown-knowledge/ontology/_catalog.yaml', `schema-version: 1\nstore: ontology\nentries:\n${names.map((_, i) => `  - id: K-${110 + i}\n    title: Fixture ${i}\n    file: classes/100-product.yaml\n`).join('')}`);
  const added = commit();
  assert.equal(added.status, 0, added.stdout + added.stderr);
  const paths = attribution(added).candidate.paths;
  for (const [i, name] of names.entries()) {
    assert.deepEqual(paths.find((p) => p.path === name)?.concepts.map((c) => c.id), [`K-${110 + i}`]);
    assert.equal(git('show', `HEAD:${name}`).stdout, `file ${i}\n`);
  }
  const oldName = 'line\nname.ts';
  const newName = ' renamed,\t"雪".ts ';
  assert.equal(git('mv', '--', oldName, newName).status, 0);
  write(conceptFile, readFileSync(join(repo, conceptFile), 'utf8').replace(JSON.stringify(oldName), JSON.stringify(newName)));
  const renamed = commit();
  assert.equal(renamed.status, 0, renamed.stdout + renamed.stderr);
  const records = attribution(renamed);
  assert.deepEqual(records.before.paths.find((p) => p.path === oldName)?.concepts.map((c) => c.id), ['K-112']);
  assert.deepEqual(records.candidate.paths.find((p) => p.path === newName)?.concepts.map((c) => c.id), ['K-112']);
  assert.equal(readdirSync(repo).includes('PWNED'), false, 'filenames never execute shell syntax');
});

test('type changes and modifications remain attributable without narrowing the whole-store gate', (t) => {
  const { repo, git, write, commit } = setup(t);
  write('src/target.ts', 'target\n');
  rmSync(join(repo, 'src/formats.ts'));
  symlinkSync('target.ts', join(repo, 'src/formats.ts'));
  const typed = commit();
  assert.equal(typed.status, 0, typed.stdout + typed.stderr);
  for (const origin of ['candidate', 'before']) assert.deepEqual(attribution(typed)[origin].paths.find((p) => p.path === 'src/formats.ts').concepts.map((c) => c.id), ['K-101']);
  write(conceptFile, concept('src/target.ts'));
  write('src/target.ts', 'modified target\n');
  const modified = commit();
  assert.equal(modified.status, 0, modified.stdout + modified.stderr);
  assert.deepEqual(attribution(modified).candidate.paths.find((p) => p.path === 'src/target.ts').concepts.map((c) => c.id), ['K-101']);
  assert.equal(git('show', 'HEAD:src/target.ts').stdout, 'modified target\n');
});

test('an empty unborn index is a quiet no-op even before the kit is staged', (t) => {
  const { run } = setup(t, { initial: false });
  const result = run('sh', ['unknown-knowledge/hooks/reverse-lookup']);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, '');
});

test('empty staged diff is a no-op without loading the resolver; a real change cannot hide its failure', (t) => {
  const { repo, git, write, run, scratch } = setup(t);
  rmSync(join(repo, 'unknown-knowledge/engine/commands/resolve.js'));
  const empty = run('sh', ['unknown-knowledge/hooks/reverse-lookup']);
  assert.equal(empty.status, 0, empty.stderr);
  assert.equal(empty.stdout, '');
  write('note.txt', 'unrelated change\n');
  assert.equal(git('add', 'note.txt').status, 0);
  const base = git('rev-parse', 'HEAD').stdout;
  const result = git('commit', '-qm', 'missing resolver');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /ERR_MODULE_NOT_FOUND|Cannot find module/);
  assert.equal(git('rev-parse', 'HEAD').stdout, base);
  assert.equal(run('sh', ['unknown-knowledge/hooks/reverse-lookup']).status, 2);
  assert.deepEqual(readdirSync(scratch).filter((name) => name.startsWith('unknown-knowledge-commit-')), []);
});

test('a failed Git change-record read refuses the installed-hook commit with exit 2', (t) => {
  const { repo, git, write, run, env, scratch } = setup(t);
  write('note.txt', 'candidate\n');
  assert.equal(git('add', 'note.txt').status, 0);
  const base = git('rev-parse', 'HEAD').stdout;
  const index = readFileSync(join(repo, '.git/index'));
  // Fault injection only at the OS/Git boundary: the real installed hook
  // reaches a bounded-output failure instead of treating truncated bytes as empty.
  const preload = join(scratch, 'git-fault.mjs');
  writeFileSync(preload, `import cp from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
const spawn = cp.spawnSync;
cp.spawnSync = (command, args, options) => command === 'git' && args.includes('diff-tree')
  ? { status: null, stdout: Buffer.from(''), stderr: Buffer.from(''), error: new Error('ENOBUFS: Git output exceeded maxBuffer') }
  : spawn(command, args, options);
syncBuiltinESMExports();\n`);
  env.NODE_OPTIONS = `--import=${pathToFileURL(preload).href}`;
  const check = run('sh', ['unknown-knowledge/hooks/reverse-lookup']);
  assert.equal(check.status, 2, check.stderr);
  assert.match(check.stderr, /git diff-tree failed.*ENOBUFS/);
  assert.equal(check.stdout, '');
  assert.deepEqual(readFileSync(join(repo, '.git/index')), index);
  const result = git('commit', '-qm', 'failed attribution');
  assert.notEqual(result.status, 0);
  assert.equal(git('rev-parse', 'HEAD').stdout, base);
  assert.deepEqual(readdirSync(scratch).filter((name) => name.startsWith('unknown-knowledge-commit-')), []);
});

test('repairing an unsupported before symlink cannot turn incomplete history attribution into success', (t) => {
  const { repo, git, write, commit, run } = setup(t);
  symlinkSync('/tmp', join(repo, 'outside'));
  assert.equal(git('add', 'outside').status, 0);
  // Establish deliberately unsupported history as fixture input before the
  // installed hooks are exercised on its repair.
  assert.equal(git('-c', 'core.hooksPath=/dev/null', 'commit', '-qm', 'unsupported history fixture').status, 0);
  const base = git('rev-parse', 'HEAD').stdout;
  assert.equal(git('rm', 'outside').status, 0);
  write('note.txt', 'repair\n');
  const result = commit();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /symlink.*outside.*points outside/);
  assert.match(result.stderr, /validate: clean/);
  assert.match(result.stderr, /validate-values: clean/);
  assert.equal(git('rev-parse', 'HEAD').stdout, base);
  assert.equal(run('sh', ['unknown-knowledge/hooks/reverse-lookup']).status, 2);
});

test('a missing deleted blob refuses before materialization instead of dropping historical governance', (t) => {
  const { repo, git, write, commit, run } = setup(t);
  const blob = git('rev-parse', 'HEAD:src/formats.ts').stdout.trim();
  assert.equal(git('rm', 'src/formats.ts').status, 0);
  write('src/replacement.ts', 'replacement\n');
  write(conceptFile, concept('src/replacement.ts'));
  rmSync(join(repo, '.git/objects', blob.slice(0, 2), blob.slice(2)));
  const result = commit();
  assert.notEqual(result.status, 0);
  assert.equal(run('sh', ['unknown-knowledge/hooks/reverse-lookup']).status, 2);
  assert.match(result.stderr, /failed|unable to read/);
});

test('an initial staged commit has candidate attribution and no invented before origin', (t) => {
  const { commit } = setup(t, { initial: false });
  const result = commit();
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const records = attribution(result);
  assert.equal(records.before, undefined);
  assert.deepEqual(records.candidate.paths.find((p) => p.path === 'src/formats.ts').concepts.map((c) => c.id), ['K-101']);
});

test('copy attribution is independent of the local Git rename limit', (t) => {
  const { git, write, commit, run } = setup(t);
  for (let i = 0; i < 4; i += 1) {
    write(`src/original-${i}.ts`, Array.from({ length: 100 }, (_, n) => `source ${i} line ${n}\n`).join(''));
  }
  write(conceptFile, concept('src/original-0.ts'));
  assert.equal(commit().status, 0);
  for (let i = 0; i < 4; i += 1) {
    write(`src/copied-${i}.ts`, Array.from({ length: 100 }, (_, n) => n < 90 ? `source ${i} line ${n}\n` : `changed ${i} line ${n}\n`).join(''));
  }
  assert.equal(git('add', '-A').status, 0);
  assert.equal(git('config', 'diff.renameLimit', '1').status, 0);
  const low = run('sh', ['unknown-knowledge/hooks/reverse-lookup']);
  assert.equal(git('config', 'diff.renameLimit', '999').status, 0);
  const high = run('sh', ['unknown-knowledge/hooks/reverse-lookup']);
  assert.equal(low.status, 0, low.stderr);
  assert.equal(high.status, 0, high.stderr);
  assert.equal(low.stdout, high.stdout, 'identical trees must have identical attribution');
  assert.equal(git('config', 'diff.renameLimit', '1').status, 0);
  const result = git('commit', '-qm', 'copy attribution with local limit');
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.deepEqual(attribution(result).before.paths.find((p) => p.path === 'src/original-0.ts').concepts.map((c) => c.id), ['K-101']);
});
