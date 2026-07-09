// KK-25: survey map (PRD §4) — deterministic traversal-surface builder.
// Git-tracked files only, built-in denylist, per-directory histograms, an
// anchor-candidate pre-scan sharing regex signatures with the extractor
// kinds, a proposed include/exclude scope, and an explicit unsurveyed:
// disclosure. Tested against a synthetic git repo planted by this file AND
// against the kit repo itself (the kit eats its own cooking).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import { Buffer } from 'node:buffer';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { load, dump } from 'js-yaml';
import { buildSurveyMap, loadSurveyScope, inScope, main, SCOPE_FILE } from '../payload/engine/commands/survey-map.js';
import { ANCHOR_SIGNATURES } from '../payload/engine/lib/anchor-signatures.js';
import { validateStoreFile } from '../payload/engine/lib/validate-record.js';

const kitRoot = fileURLToPath(new URL('..', import.meta.url));
const surveyMapJs = join(kitRoot, 'payload/engine/survey-map.js');

// ------------------------------------------------ synthetic repo fixture

const outer = mkdtempSync(join(tmpdir(), 'kk25-'));
const repo = join(outer, 'repo');

function git(...args) {
  const result = spawnSync('git', ['-C', repo, ...args], { encoding: 'utf8' });
  assert.equal(result.status, 0, `git ${args[0]}: ${result.stderr}`);
  return result.stdout;
}

function plant(rel, content) {
  const abs = join(repo, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content);
}

// Planted anchors — one per §5.1 pre-scannable shape (kind → path).
const PLANTED = [
  ['ts-union', 'src/sports.ts'],
  ['ts-object-keys', 'src/registry.ts'],
  ['ts-const-array', 'src/markets.ts'],
  ['ts-enum', 'src/tiers.ts'],
  ['swift-enum', 'App/Models/Sport.swift'],
  ['swift-const-array', 'App/Models/Markets.swift'],
  ['json-keys', 'config/app.json'],
  ['yaml-keys', 'config/flags.yaml'],
  ['strings-keys', 'Locales/en.strings'],
  ['strings-keys', 'Locales/App.xcstrings'],
  ['strings-keys', 'Locales/legacy-utf16.strings'],
  ['dir-modules', 'modules'],
  ['dir-modules', 'modules2'],
];

mkdirSync(repo);
git('init', '-q');
plant('src/sports.ts', "export type Sport = 'nfl' | 'nba' | 'mlb';\n");
plant('src/registry.ts', 'export const SPORTS = {\n  nfl: {},\n  nba: {},\n};\n');
plant('src/markets.ts', "export const supportedMarkets = ['spread', 'total'];\n");
plant('src/tiers.ts', 'export enum Tier {\n  Free,\n  Paid,\n}\n');
plant('App/Models/Sport.swift', 'enum Sport: String, CaseIterable {\n  case nfl\n}\n');
plant('App/Models/Markets.swift', 'static let supportedMarkets = ["spread", "total"]\n');
plant('config/app.json', '{\n  "features": { "parlay": true }\n}\n');
plant('config/flags.yaml', 'flags:\n  parlay: true\n');
plant('Locales/en.strings', '"bet.place" = "Place bet";\n');
// .xcstrings is JSON — PRD §5.1 defines strings-keys over BOTH formats.
plant('Locales/App.xcstrings',
  '{\n  "sourceLanguage" : "en",\n  "strings" : {\n    "bet.place" : {}\n  },\n  "version" : "1.0"\n}\n');
// Legacy UTF-16 .strings (BOM-marked): unsniffable as UTF-8 — candidate by extension.
plant('Locales/legacy-utf16.strings', Buffer.from('\ufeff"bet.cancel" = "Cancel bet";\n', 'utf16le'));
for (const m of ['nfl', 'nba', 'mlb']) plant(`modules/${m}.ts`, `export const id = '${m}';\n`);
// PRD's canonical dir-modules layout: one SUBFOLDER per module (modules/nfl/, …).
for (const m of ['nfl', 'nba', 'mlb']) plant(`modules2/${m}/index.ts`, `export const id = '${m}';\n`);
// Denylisted-but-tracked: none of these may surface anywhere in the map.
plant('node_modules/pkg/index.js', "export const SPORTS = { x: 1 };\n");
plant('vendor/lib.js', "export const SPORTS = { x: 1 };\n");
plant('package-lock.json', '{ "lockfileVersion": 3 }\n');
plant('src/types.gen.ts', "export type Sport = 'stale' | 'copy';\n");
plant('assets/logo.png', 'not really a png');
plant('.github/workflows/ci.yml', 'jobs:\n  test: {}\n');
// Untracked file: git-tracked-only means it never appears at all.
plant('scratch.js', "export const SPORTS = { x: 1 };\n");
git('add', '--force', 'src', 'App', 'config', 'Locales', 'modules', 'modules2',
  'node_modules', 'vendor', 'package-lock.json', 'assets', '.github');
// Submodule gitlink (mode 160000) via plumbing — no real submodule needed.
git('update-index', '--add', '--cacheinfo',
  '160000,1234567890123456789012345678901234567890,libs/billing-sub');
// Out-of-root symlink: target resolves outside the repo root.
writeFileSync(join(outer, 'outside.txt'), 'outside\n');
symlinkSync(join(outer, 'outside.txt'), join(repo, 'linked.txt'));
git('add', 'linked.txt');
// In-repo ABSOLUTE symlink: must never be flagged as a blind spot, even when
// the survey root is itself reached through a symlink (/tmp -> /private/tmp).
symlinkSync(join(repo, 'src/sports.ts'), join(repo, 'linked-in.txt'));
git('add', 'linked-in.txt');

test.after(() => rmSync(outer, { recursive: true, force: true }));

const map = buildSurveyMap(repo);

// ------------------------------------------------ signature table (§5.1)

test('signature table covers every §5.1 kind and every pattern compiles', () => {
  const kinds = ANCHOR_SIGNATURES.map((s) => s.kind);
  // strings-keys appears twice: one signature per format (.strings / .xcstrings).
  assert.deepEqual(kinds, [
    'dir-modules', 'json-keys', 'json-map-keys', 'strings-keys', 'strings-keys',
    'swift-const-array', 'swift-enum', 'ts-const-array', 'ts-enum',
    'ts-object-keys', 'ts-union', 'yaml-keys', 'yaml-map-keys',
  ]);
  assert.ok(Object.isFrozen(ANCHOR_SIGNATURES));
  for (const sig of ANCHOR_SIGNATURES) {
    if (sig.pattern !== null) assert.doesNotThrow(() => new RegExp(sig.pattern, sig.flags));
  }
});

test('signature table is DEEP-frozen: extensions arrays cannot be mutated', () => {
  for (const sig of ANCHOR_SIGNATURES) {
    assert.ok(Object.isFrozen(sig), `${sig.kind} entry is mutable`);
    if (sig.extensions !== null) {
      assert.ok(Object.isFrozen(sig.extensions), `${sig.kind} extensions array is mutable`);
      assert.throws(() => sig.extensions.push('.evil'), TypeError);
    }
  }
});

// ------------------------------------------------ candidates & denylist

test('candidate list contains every planted anchor with its kind', () => {
  for (const [kind, path] of PLANTED) {
    assert.ok(
      map.candidates.some((c) => c.kind === kind && c.path === path),
      `missing candidate ${kind} at ${path}`,
    );
  }
});

test('zero denylisted paths anywhere; untracked files never appear', () => {
  const denied = /^(node_modules|vendor|assets|\.github)\/|^package-lock\.json$|\.gen\.|^scratch\.js$/;
  const everyPath = [
    ...map.candidates.map((c) => c.path),
    ...map.directories.map((d) => d.path),
  ];
  assert.ok(everyPath.length > 0);
  for (const p of everyPath) assert.ok(!denied.test(p), `denylisted/untracked path surfaced: ${p}`);
});

test('per-directory extension/count histograms', () => {
  const src = map.directories.find((d) => d.path === 'src');
  assert.deepEqual(src, { path: 'src', files: 4, extensions: { '.ts': 4 } });
  const paths = map.directories.map((d) => d.path);
  assert.deepEqual(paths, [...paths].sort(), 'directories must be stable-sorted');
});

test('proposed include/exclude scope splits surface from vendored dirs', () => {
  assert.equal(map.scope.source, 'proposed');
  // '.' covers root-level files (linked-in.txt) — the proposal must not drop them.
  assert.deepEqual(map.scope.include,
    ['.', 'App', 'Locales', 'config', 'modules', 'modules2', 'src']);
  assert.deepEqual(map.scope.exclude, ['.github', 'assets', 'node_modules', 'vendor']);
});

test('proposal round-trip: propose → persist → re-survey loses no files', () => {
  writeFileSync(join(repo, SCOPE_FILE), dump({
    'schema-version': 1, include: [...map.scope.include], exclude: [...map.scope.exclude],
  }));
  try {
    const again = buildSurveyMap(repo);
    assert.equal(again.scope.source, SCOPE_FILE);
    assert.equal(again.counts.surveyed, map.counts.surveyed, 'accepting the proposal dropped files');
    assert.deepEqual(again.directories, map.directories);
    assert.deepEqual(again.candidates, map.candidates);
    assert.ok(again.directories.some((d) => d.path === '.'), 'root-level files were lost');
  } finally {
    rmSync(join(repo, SCOPE_FILE));
  }
});

test('unsurveyed: discloses the gitlink and the out-of-root symlink', () => {
  assert.deepEqual(map.unsurveyed, [
    { path: 'libs/billing-sub', reason: 'submodule-gitlink' },
    { path: 'linked.txt', reason: 'out-of-root-symlink' },
  ]);
});

test('deterministic: two builds are byte-identical, no wall-clock inside', () => {
  const twice = buildSurveyMap(repo);
  assert.equal(JSON.stringify(map, null, 2), JSON.stringify(twice, null, 2));
  assert.ok(!/\d{4}-\d{2}-\d{2}[T ]\d{2}:/.test(JSON.stringify(map)), 'timestamp leaked into output');
});

test('in-repo absolute symlinks are in-root even via a symlinked survey root', () => {
  // Reproduces /tmp -> /private/tmp: the root itself is reached via a symlink,
  // so naive prefix comparison flags every absolute in-repo link as escaping.
  const alias = join(outer, 'repo-alias');
  symlinkSync(repo, alias);
  try {
    const viaAlias = buildSurveyMap(alias);
    assert.deepEqual(viaAlias.unsurveyed, [
      { path: 'libs/billing-sub', reason: 'submodule-gitlink' },
      { path: 'linked.txt', reason: 'out-of-root-symlink' },
    ], 'in-repo symlink linked-in.txt falsely flagged as out-of-root');
  } finally {
    rmSync(alias);
  }
});

test('merge-stage duplicates collapse: one row per conflicted path', () => {
  // `git ls-files --stage` emits stages 1/2/3 for a conflicted path.
  plant('conflict.ts', "export const conflictMarkets = ['spread'];\n");
  const sha = git('hash-object', '-w', 'conflict.ts').trim();
  const info = [1, 2, 3].map((s) => `100644 ${sha} ${s}\tconflict.ts`).join('\n');
  const staged = spawnSync('git', ['-C', repo, 'update-index', '--index-info'], {
    input: `${info}\n`, encoding: 'utf8',
  });
  assert.equal(staged.status, 0, staged.stderr);
  try {
    const merged = buildSurveyMap(repo);
    assert.equal(merged.counts.tracked, map.counts.tracked + 1, 'tracked count inflated by stages');
    assert.equal(merged.counts.surveyed, map.counts.surveyed + 1);
    assert.equal(merged.candidates.filter((c) => c.path === 'conflict.ts').length, 1,
      'candidate rows triplicated for a conflicted path');
    const rootDir = merged.directories.find((d) => d.path === '.');
    assert.equal(rootDir.extensions['.ts'], 1, '3 stages of one file inflated the histogram');
  } finally {
    git('update-index', '--force-remove', 'conflict.ts');
    rmSync(join(repo, 'conflict.ts'));
  }
});

// ------------------------------------------------ survey-scope.yaml

const SCOPE_YAML = 'schema-version: 1\ninclude:\n  - src\nexclude:\n  - vendor\n';

test('survey-scope.yaml schema round-trips through the shipped validator', () => {
  const doc = load(SCOPE_YAML);
  assert.deepEqual(validateStoreFile('survey-scope', doc).errors, []);
  const bad = validateStoreFile('survey-scope', { 'schema-version': 1, includes: ['typo'] });
  assert.ok(bad.errors.some((e) => e.code === 'unknown-property'));
  assert.ok(bad.errors.some((e) => e.code === 'missing-required'));
});

test('honor-it contract: a present scope file bounds the whole map', () => {
  writeFileSync(join(repo, 'survey-scope.yaml'), SCOPE_YAML);
  try {
    const scoped = buildSurveyMap(repo);
    assert.equal(scoped.scope.source, 'survey-scope.yaml');
    assert.deepEqual(scoped.scope.include, ['src']);
    assert.ok(scoped.candidates.every((c) => c.path === 'src' || c.path.startsWith('src/')));
    assert.ok(scoped.directories.every((d) => d.path === 'src' || d.path.startsWith('src/')));
    // Blind spots are disclosed even when out of scope — never silent.
    assert.equal(scoped.unsurveyed.length, 2);
    // The same contract audit/reflect consume:
    const scope = loadSurveyScope(repo);
    assert.equal(scope.present, true);
    assert.ok(inScope('src/sports.ts', scope));
    assert.ok(!inScope('config/app.json', scope), 'not included');
    assert.ok(!inScope('vendor/lib.js', { ...scope, include: ['vendor'] }), 'exclude wins');
  } finally {
    rmSync(join(repo, 'survey-scope.yaml'));
  }
});

test('trailing-slash prefixes are normalized; "." matches root-level files only', () => {
  writeFileSync(join(repo, SCOPE_FILE), 'schema-version: 1\ninclude:\n  - src/\n');
  try {
    const scoped = buildSurveyMap(repo);
    assert.deepEqual(scoped.scope.include, ['src'], 'trailing slash not normalized');
    assert.ok(scoped.counts.surveyed > 0, 'include: [src/] silently surveyed nothing');
    assert.ok(scoped.candidates.some((c) => c.path === 'src/sports.ts'));
  } finally {
    rmSync(join(repo, SCOPE_FILE));
  }
  const dotScope = { present: true, include: ['.'], exclude: [] };
  assert.ok(inScope('package.json', dotScope), "'.' covers root-level files");
  assert.ok(!inScope('src/sports.ts', dotScope), "'.' does not swallow subdirectories");
});

test('a scope whose include matches zero tracked files is an engine failure', () => {
  writeFileSync(join(repo, SCOPE_FILE), 'schema-version: 1\ninclude:\n  - no-such-dir\n');
  try {
    assert.throws(() => buildSurveyMap(repo), /zero tracked files/);
    assert.equal(main([repo, '--json']), 2, 'silent empty survey must exit 2');
  } finally {
    rmSync(join(repo, SCOPE_FILE));
  }
});

test('a malformed scope file is an engine failure, never silently ignored', () => {
  writeFileSync(join(repo, 'survey-scope.yaml'), 'include: nope\n');
  try {
    assert.throws(() => buildSurveyMap(repo), /survey-scope\.yaml/);
    assert.equal(main([repo, '--json']), 2);
  } finally {
    rmSync(join(repo, 'survey-scope.yaml'));
  }
});

// ------------------------------------------------ CLI contract (PRD §5)

function run(args) {
  return spawnSync(process.execPath, [surveyMapJs, ...args], { encoding: 'utf8' });
}

test('CLI --json: parseable stdout, exit 1 while blind spots exist', () => {
  const result = run([repo, '--json']);
  assert.equal(result.status, 1, result.stderr);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.unsurveyed.length, 2);
  // --flag=value and --flag value both parse.
  assert.equal(JSON.parse(run([`--root=${repo}`, '--json']).stdout).counts.tracked,
    parsed.counts.tracked);
  assert.equal(run(['--root', repo, '--json']).status, 1);
});

test('CLI: exit 0 on a repo with no blind spots; human mode summarizes', () => {
  git('update-index', '--force-remove', 'libs/billing-sub', 'linked.txt');
  try {
    const result = run([repo]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /candidates/i);
    assert.match(result.stdout, /nothing unsurveyed/i);
  } finally {
    git('update-index', '--add', '--cacheinfo',
      '160000,1234567890123456789012345678901234567890,libs/billing-sub');
    git('add', 'linked.txt');
  }
});

test('CLI: exit 2 on a non-git root and on unknown flags', () => {
  assert.equal(run([outer]).status, 2, 'not a git repo');
  assert.equal(run([repo, '--frobnicate']).status, 2, 'unknown flag');
});

// ------------------------------------------------ the kit repo itself

const underEngine = (p) => p === 'payload/engine' || p.startsWith('payload/engine/');

test('kit repo self-survey: engine surveyed, lockfile denied, deterministic', () => {
  const own = buildSurveyMap(kitRoot);
  assert.ok(own.directories.some((d) => underEngine(d.path)));
  const everyPath = [
    ...own.candidates.map((c) => c.path),
    ...own.directories.map((d) => d.path),
  ];
  for (const p of everyPath) {
    assert.ok(!/^node_modules\/|^package-lock\.json$|^\.github\//.test(p), p);
  }
  // The kit's own decisions store is anchor material (yaml-keys).
  assert.ok(own.candidates.some((c) => c.kind === 'yaml-keys' && c.path.startsWith('decisions/')));
  assert.equal(JSON.stringify(own), JSON.stringify(buildSurveyMap(kitRoot)));
});
