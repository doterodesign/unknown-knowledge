// KK-10: the dir-modules directory kind (PRD §5.1) — directory-listing
// extraction with pattern/strip options. Four seams:
//   1. the registry's directory dispatch: dir-modules is the one
//      `{ reads: 'directory', extract }` entry, every other kind stays a
//      plain file-kind function (KK-08/09 untouched);
//   2. the shipped D-009 pair (payload/extractor-fixtures/ts/dir-modules/):
//      a sample DIRECTORY round-tripped through listDirectory + the kind;
//   3. the option matrix at the extract seam — plain listing / pattern only /
//      strip only / pattern+strip — plus the glob grammar, strip hard-error,
//      symlink envelope, and determinism guarantees;
//   4. the value-validator CLI: K-110 (plain) and K-111 (pattern+strip)
//      extract clean from fixtures/ts-app, and a missing directory is
//      source-missing (exit 2), same as an unreadable file.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { load } from 'js-yaml';
import { KINDS, EnvelopeError, ExtractError, listDirectory } from '../payload/engine/lib/extractor-kinds.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const pairDir = join(root, 'payload', 'extractor-fixtures', 'ts', 'dir-modules');
const cli = join(root, 'payload', 'engine', 'validate-values.js');

const extract = KINDS['dir-modules'].extract;
const d = (over = {}) => ({ kind: 'dir-modules', source: 's', values: [], ...over });
const file = (name) => ({ name, isDirectory: false, isSymbolicLink: false });
const dir = (name) => ({ name, isDirectory: true, isSymbolicLink: false });

// ------------------------------------------------ 1. the registry dispatch seam

test('dir-modules is the registry\'s one directory kind; file kinds stay plain functions', () => {
  const entry = KINDS['dir-modules'];
  assert.equal(typeof entry, 'object');
  assert.equal(entry.reads, 'directory');
  assert.equal(typeof entry.extract, 'function');
  for (const [kind, recipe] of Object.entries(KINDS)) {
    if (kind === 'dir-modules') continue;
    assert.equal(typeof recipe, 'function', `${kind} must remain a plain file-kind function`);
  }
});

// ------------------------------------------------- 2. the shipped D-009 pair

test('the D-009 pair round-trips: listDirectory + dir-modules extract EXACTLY the expected set', () => {
  const expected = load(readFileSync(join(pairDir, 'EXPECTED.yaml'), 'utf8'));
  assert.equal(expected.kind, 'dir-modules');
  const entries = listDirectory(join(pairDir, expected.file));
  const actual = extract(entries, expected);
  assert.deepEqual([...actual].sort(), [...expected.values].sort(),
    'sample-modules/ and EXPECTED.yaml have rotted apart');
});

// --------------------------------------------------------- 3. the option matrix

const LISTING = [
  dir('sportsbook'), dir('casino'), dir('poker'),
  file('README.md'), file('home.route.ts'), file('bets.route.ts'), file('routes.test.ts'),
];

test('plain (no options): the SUBDIRECTORY facet — files beside the module folders are scenery', () => {
  assert.deepEqual(extract(LISTING, d()), ['casino', 'poker', 'sportsbook']);
});

test('pattern only: the FILE facet — matching file names as-is, subdirectories excluded', () => {
  assert.deepEqual(
    extract(LISTING, d({ pattern: '*.route.ts' })),
    ['bets.route.ts', 'home.route.ts'],
  );
  // A subdirectory whose name matches the pattern is still not a file.
  const trap = [...LISTING, dir('decoy.route.ts')];
  assert.deepEqual(
    extract(trap, d({ pattern: '*.route.ts' })),
    ['bets.route.ts', 'home.route.ts'],
  );
});

test('strip only: subdirectory names with the suffix removed (the asset-catalog shape)', () => {
  const catalog = [dir('hero.imageset'), dir('logo.imageset'), file('Contents.json')];
  assert.deepEqual(extract(catalog, d({ strip: '.imageset' })), ['hero', 'logo']);
});

test('pattern+strip: matching file names with the suffix removed (file-based routing)', () => {
  assert.deepEqual(
    extract(LISTING, d({ pattern: '*.route.ts', strip: '.route.ts' })),
    ['bets', 'home'],
  );
});

test('glob grammar: whole-name match, literal dots, * spans any run — richer syntax is refused', () => {
  // Whole-name anchoring: a bare literal never substring-matches.
  assert.throws(() => extract([file('home.route.ts')], d({ pattern: 'route' })), ExtractError);
  // Dots are literal, never wildcards.
  assert.throws(() => extract([file('homeXrouteXts')], d({ pattern: '*.route.ts' })), ExtractError);
  // `*` spans any run, including none.
  assert.deepEqual(extract([file('.hidden.route.ts'), file('a.route.ts'), file('route.ts')],
    d({ pattern: '*route.ts' })), ['a.route.ts', 'route.ts']);
  // Regex metacharacters in the pattern are literal, not regex.
  assert.deepEqual(extract([file('a+b.ts'), file('aab.ts')], d({ pattern: 'a+b.ts' })), ['a+b.ts']);
  // Unsupported glob metacharacters are refused loudly, never misread.
  for (const pattern of ['?.ts', '[ab].ts', '{a,b}.ts']) {
    assert.throws(() => extract([file('a.ts')], d({ pattern })), /only wildcard/);
  }
});

test('strip hard-errors on a facet name that lacks the suffix, or that IS the suffix', () => {
  assert.throws(
    () => extract([dir('hero.imageset'), dir('notes')], d({ strip: '.imageset' })),
    /does not carry the suffix/,
  );
  assert.throws(
    () => extract([file('.route.ts')], d({ pattern: '*route.ts', strip: '.route.ts' })),
    ExtractError, // dotfile is excluded → empty facet; and were it listed, nothing would remain
  );
  assert.throws(
    () => extract([dir('.imageset')], d({ strip: '.imageset' })),
    ExtractError,
  );
});

test('malformed options extract-fail: pattern/strip must be non-empty strings when present', () => {
  assert.throws(() => extract(LISTING, d({ pattern: '' })), /"pattern:"/);
  assert.throws(() => extract(LISTING, d({ pattern: 3 })), /"pattern:"/);
  assert.throws(() => extract(LISTING, d({ strip: '' })), /"strip:"/);
});

test('an empty facet is an ExtractError — wrong pointer or wrong pattern, never a silent empty set', () => {
  assert.throws(() => extract([file('a.ts')], d()), /no subdirectories/);
  assert.throws(() => extract([dir('mod')], d({ pattern: '*.route.ts' })), /no files matching/);
  assert.throws(() => extract([], d()), ExtractError);
});

test('dot-prefixed names are hidden-by-convention and never part of either facet', () => {
  const listing = [dir('.git'), dir('mods'), file('.DS_Store'), file('a.route.ts')];
  assert.deepEqual(extract(listing, d()), ['mods']);
  assert.deepEqual(extract(listing, d({ pattern: '*.route.ts' })), ['a.route.ts']);
});

test('a symlink in the listing is out-of-envelope — it can point outside the surveyed tree', () => {
  const linked = { name: 'shared', isDirectory: false, isSymbolicLink: true };
  assert.throws(() => extract([dir('real'), linked], d()), EnvelopeError);
  // Even under a pattern that would never match it: the listing itself is dishonest.
  assert.throws(() => extract([file('a.route.ts'), linked], d({ pattern: '*.route.ts' })), /symlink/);
  // A hidden symlink is tooling residue, not a module — outside the facet, no sentinel.
  assert.deepEqual(extract([dir('mods'), { ...linked, name: '.cache' }], d()), ['mods']);
});

test('listDirectory sees a real symlink as a symlink (lstat-level), and the kind hard-errors', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'kk10-symlink-'));
  mkdirSync(join(tmp, 'real'));
  try {
    symlinkSync(join(tmp, 'real'), join(tmp, 'linked'));
  } catch {
    return; // filesystem without symlink support: nothing to prove here
  }
  const entries = listDirectory(tmp);
  assert.deepEqual(entries, [
    { name: 'linked', isDirectory: false, isSymbolicLink: true },
    { name: 'real', isDirectory: true, isSymbolicLink: false },
  ]);
  assert.throws(() => extract(entries, d()), EnvelopeError);
});

test('determinism: output is sorted by name regardless of listing order (D-012 diffability)', () => {
  const scrambled = [dir('zebra'), dir('alpha'), dir('mid')];
  assert.deepEqual(extract(scrambled, d()), ['alpha', 'mid', 'zebra']);
  assert.deepEqual(extract([...scrambled].reverse(), d()), ['alpha', 'mid', 'zebra']);
  // listDirectory itself sorts, so messages derived from it are stable too.
  const listed = listDirectory(join(pairDir, 'sample-modules'));
  assert.deepEqual(listed.map((e) => e.name), [...listed.map((e) => e.name)].sort());
});

// ------------------------------------------------------------ 4. the CLI seam

function runCli(rootDir, ...args) {
  return spawnSync(process.execPath, [cli, '--root', rootDir, '--json', ...args], { encoding: 'utf8' });
}

test('fixtures/ts-app: K-110 (plain) and K-111 (pattern+strip) extract clean — exit 0, zero findings', () => {
  const r = runCli(join(root, 'fixtures', 'ts-app'), '--concepts', 'K-110,K-111');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const out = JSON.parse(r.stdout);
  assert.deepEqual(out.findings, []);
  assert.deepEqual(out['hard-errors'], []);
  assert.equal(out.checked.filter((c) => !c.skipped).length, 2);
});

/** Minimal one-concept store around a dir-modules descriptor (KK-07 fixture shape). */
function plantStore(descriptorYaml, plantFiles = {}) {
  const repo = mkdtempSync(join(tmpdir(), 'kk10-cli-'));
  const write = (rel, content) => {
    mkdirSync(dirname(join(repo, rel)), { recursive: true });
    writeFileSync(join(repo, rel), content);
  };
  write('ontology/_catalog.yaml',
    'schema-version: 1\nstore: ontology\nentries:\n  - id: K-100\n    title: Module\n    file: classes/100-core.yaml\n');
  write('ontology/_rules.yaml', 'schema-version: 1\nstore: ontology\nrules: []\n');
  write('ontology/classes/100-core.yaml',
    'schema-version: 1\nentries:\n'
    + '  - id: K-100\n    term: Module\n    class: 100-core\n'
    + '    summary: Per-module folders.\n    source-of-truth: [src/modules]\n'
    + '    status: active\n'
    + descriptorYaml);
  for (const [rel, content] of Object.entries(plantFiles)) write(rel, content);
  return repo;
}

const DESCRIPTOR =
  '    enumerates:\n      - kind: dir-modules\n        source: src/modules\n        values: [alpha]\n';

test('a missing directory is source-missing (exit 2) — same envelope as an unreadable file', () => {
  const repo = plantStore(DESCRIPTOR); // src/modules never created
  const r = runCli(repo);
  assert.equal(r.status, 2, r.stdout + r.stderr);
  const out = JSON.parse(r.stdout);
  assert.deepEqual(out['hard-errors'].map((e) => [e.concept, e.code]), [['K-100', 'source-missing']]);
  assert.deepEqual(out.findings, []);
});

test('a dir-modules source that is a FILE (ENOTDIR) is source-missing too — never content-sniffed', () => {
  const repo = plantStore(DESCRIPTOR, { 'src/modules': 'not a directory\n' });
  const r = runCli(repo);
  assert.equal(r.status, 2, r.stdout + r.stderr);
  const out = JSON.parse(r.stdout);
  assert.deepEqual(out['hard-errors'].map((e) => [e.concept, e.code]), [['K-100', 'source-missing']]);
});

test('the CLI diffs dir-modules like any kind: drift in both directions surfaces as findings', () => {
  const repo = plantStore(
    '    enumerates:\n      - kind: dir-modules\n        source: src/modules\n        values: [alpha, ghost]\n',
    { 'src/modules/alpha/index.ts': 'export {};\n', 'src/modules/extra/index.ts': 'export {};\n' },
  );
  const r = runCli(repo);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  const out = JSON.parse(r.stdout);
  assert.deepEqual(
    out.findings.map((f) => [f.code, f.value]),
    [['source-value-missing', 'extra'], ['value-not-in-source', 'ghost']], // stable-sorted by code
  );
});
