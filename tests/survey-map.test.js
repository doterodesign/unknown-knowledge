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
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { load } from 'js-yaml';
import { buildSurveyMap, loadSurveyScope, inScope, main } from '../payload/engine/survey-map.js';
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
  ['dir-modules', 'modules'],
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
for (const m of ['nfl', 'nba', 'mlb']) plant(`modules/${m}.ts`, `export const id = '${m}';\n`);
// Denylisted-but-tracked: none of these may surface anywhere in the map.
plant('node_modules/pkg/index.js', "export const SPORTS = { x: 1 };\n");
plant('vendor/lib.js', "export const SPORTS = { x: 1 };\n");
plant('package-lock.json', '{ "lockfileVersion": 3 }\n');
plant('src/types.gen.ts', "export type Sport = 'stale' | 'copy';\n");
plant('assets/logo.png', 'not really a png');
plant('.github/workflows/ci.yml', 'jobs:\n  test: {}\n');
// Untracked file: git-tracked-only means it never appears at all.
plant('scratch.js', "export const SPORTS = { x: 1 };\n");
git('add', '--force', 'src', 'App', 'config', 'Locales', 'modules',
  'node_modules', 'vendor', 'package-lock.json', 'assets', '.github');
// Submodule gitlink (mode 160000) via plumbing — no real submodule needed.
git('update-index', '--add', '--cacheinfo',
  '160000,1234567890123456789012345678901234567890,libs/billing-sub');
// Out-of-root symlink: target resolves outside the repo root.
writeFileSync(join(outer, 'outside.txt'), 'outside\n');
symlinkSync(join(outer, 'outside.txt'), join(repo, 'linked.txt'));
git('add', 'linked.txt');

test.after(() => rmSync(outer, { recursive: true, force: true }));

const map = buildSurveyMap(repo);

// ------------------------------------------------ signature table (§5.1)

test('signature table covers every §5.1 kind and every pattern compiles', () => {
  const kinds = ANCHOR_SIGNATURES.map((s) => s.kind);
  assert.deepEqual(kinds, [
    'dir-modules', 'json-keys', 'json-map-keys', 'strings-keys',
    'swift-const-array', 'swift-enum', 'ts-const-array', 'ts-enum',
    'ts-object-keys', 'ts-union', 'yaml-keys', 'yaml-map-keys',
  ]);
  assert.ok(Object.isFrozen(ANCHOR_SIGNATURES));
  for (const sig of ANCHOR_SIGNATURES) {
    if (sig.pattern !== null) assert.doesNotThrow(() => new RegExp(sig.pattern, sig.flags));
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
  assert.deepEqual(map.scope.include, ['App', 'Locales', 'config', 'modules', 'src']);
  assert.deepEqual(map.scope.exclude, ['.github', 'assets', 'node_modules', 'vendor']);
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
