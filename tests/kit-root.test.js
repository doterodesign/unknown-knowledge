// UCS-934: the Kit root has exactly one authority.
//
// The engine's load-bearing promise is the single health model — the
// validator, the reverse audit and preflight can never disagree about a
// Store. That promise is void if they cannot agree on WHICH Store they are
// looking at. Two locators with opposite tie-breaks used to make a repo
// carrying both layouts read as two different Stores depending on which
// surface asked.
//
// These tests pin the agreement itself, not the plumbing: one repo, every
// surface, one answer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { locateKit, locateKitRoot, AmbiguousKitLayout, KIT_DIR_DEFAULT } from '../payload/engine/lib/kit-root.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const engine = (name) => join(root, 'payload', 'engine', name);

const scratch = mkdtempSync(join(tmpdir(), 'kit-root-'));
process.on('exit', () => rmSync(scratch, { recursive: true, force: true }));
let n = 0;

/** Plant a repo from a path→content map; returns its absolute root. */
function plant(files) {
  const repo = join(scratch, `r${n += 1}`);
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(repo, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  }
  mkdirSync(repo, { recursive: true });
  // The reverse audit rides the survey map, which enumerates git-tracked
  // files — an unversioned repo fails before it ever reaches the locator.
  const git = (...args) => execFileSync('git', ['-C', repo, ...args], { stdio: 'ignore' });
  git('init', '--quiet');
  git('add', '-A');
  git('-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '--quiet', '-m', 'planted');
  return repo;
}

const RULES = 'schema-version: 1\nstore: ontology\nrules: []\n';
const catalog = (id, title, file) =>
  `schema-version: 1\nstore: ontology\nentries:\n  - id: ${id}\n    title: ${title}\n    file: ${file}\n`;
const concept = (id, term, pointer) =>
  `schema-version: 1\nentries:\n  - id: ${id}\n    term: ${term}\n    class: 100-a\n`
  + `    summary: A concept used to tell two stores apart.\n    status: active\n`
  + (pointer ? `    source-of-truth: [${pointer}]\n` : '');

/** A store whose single concept id identifies which Store was read. */
const storeAt = (prefix, id, term, pointer) => ({
  [`${prefix}ontology/_rules.yaml`]: RULES,
  [`${prefix}ontology/_catalog.yaml`]: catalog(id, term, 'classes/100-a.yaml'),
  [`${prefix}ontology/classes/100-a.yaml`]: concept(id, term, pointer),
});

/** A registry-shaped anchor: the survey map sees it, so the audit will too. */
const ANCHOR = "export const SPORTS = ['nfl', 'nba'];\n";

// ------------------------------------------------------- the locator itself

test('a seeded kit dir alone is the Kit; the kit dir is the kit zone', () => {
  const repo = plant(storeAt(`${KIT_DIR_DEFAULT}/`, 'K-200', 'Nested'));
  const { kitRoot, kitPrefixes } = locateKit(repo);
  assert.equal(kitRoot, join(repo, KIT_DIR_DEFAULT));
  assert.deepEqual(kitPrefixes, [KIT_DIR_DEFAULT]);
  assert.equal(locateKitRoot(repo), kitRoot);
});

test('stores at the root and no seeded dir: the root is the Kit, and the stores are kit zone', () => {
  const repo = plant(storeAt('', 'K-100', 'Root'));
  const { kitRoot, kitPrefixes } = locateKit(repo);
  assert.equal(kitRoot, repo);
  for (const zone of ['ontology', 'knowledge', 'decisions', 'logs']) {
    assert.ok(kitPrefixes.includes(zone), `${zone} must be kit zone in the flat layout`);
  }
});

test('a decisions store at the root does not make the root a Kit — the kit repo dogfoods that way', () => {
  // The kit's own repo keeps decisions/ and logs/ at its root. Seeding a kit
  // beside them must resolve to the seeded dir, not refuse.
  const repo = plant({
    'decisions/_catalog.yaml': 'schema-version: 1\nstore: decisions\nentries: []\n',
    ...storeAt(`${KIT_DIR_DEFAULT}/`, 'K-200', 'Nested'),
  });
  assert.equal(locateKitRoot(repo), join(repo, KIT_DIR_DEFAULT));
});

test('no stores anywhere: the root is the Kit — an unseeded repo still audits', () => {
  const repo = plant({ 'src/a.ts': 'export const A = 1;\n' });
  assert.equal(locateKitRoot(repo), repo);
});

// -------------------------------------------------- ambiguity is not guessed

test('a seeded kit dir AND root-level stores refuses, naming both candidates', () => {
  const repo = plant({
    ...storeAt('', 'K-100', 'Root'),
    ...storeAt(`${KIT_DIR_DEFAULT}/`, 'K-200', 'Nested'),
  });
  assert.throws(() => locateKit(repo), AmbiguousKitLayout);
  assert.throws(() => locateKit(repo), /two candidate kit roots/);
  // The message tells the human how to resolve it, not merely that it failed.
  assert.throws(() => locateKit(repo), /remove the stale one/);
});

// ------------------------------------ the invariant: every surface, one Store

/** Every repo-root-taking surface, as a caller would invoke it. */
const SURFACES = [
  ['validate', (repo) => [engine('validate.js'), '--root', repo, '--json']],
  ['validate-values', (repo) => [engine('validate-values.js'), '--root', repo, '--json']],
  ['preflight', (repo) => [engine('preflight.js'), '--root', repo, '--json']],
  ['resolve', (repo) => [engine('resolve.js'), '--paths', 'src/a.ts', '--root', repo, '--json']],
  ['audit', (repo) => [engine('audit.js'), '--root', repo, '--json']],
];

const spawn = (args) => spawnSync(process.execPath, args, { encoding: 'utf8' });

test('one repo, every surface, one Store: every surface reads the seeded Kit', () => {
  // The nested store carries K-200 and points it at the anchor. A decisions
  // store sits at the root — the kit's own dogfood shape — which must not
  // tempt any surface into reading the root as the Kit.
  //
  // Each assertion below FAILS if a surface read the root instead: an id that
  // does not exist there is "a check that never ran" (exit 2), the reverse
  // lookup finds nothing, and the audit proposes the anchor as unmatched.
  const repo = plant({
    'decisions/_catalog.yaml': 'schema-version: 1\nstore: decisions\nentries: []\n',
    'src/a.ts': ANCHOR,
    ...storeAt(`${KIT_DIR_DEFAULT}/`, 'K-200', 'Nested', 'src/a.ts'),
  });

  // No surface may fail: the layout is unambiguous.
  for (const [name, argv] of SURFACES) {
    const r = spawn(argv(repo));
    assert.notEqual(r.status, 2, `${name} must resolve the seeded Kit, not fail: ${r.stderr}`);
  }

  // The concept-filtering surfaces resolve an id that exists ONLY in the
  // seeded store. Reading the root would hard-error "not in the ontology".
  for (const cli of ['validate.js', 'validate-values.js', 'preflight.js']) {
    const r = spawn([engine(cli), '--concepts', 'K-200', '--root', repo, '--json']);
    assert.notEqual(r.status, 2, `${cli} did not find K-200 in the seeded Store: ${r.stderr}`);
    assert.ok(r.stdout.includes('K-200'), `${cli} did not report on the seeded Store's concept`);
  }

  // The reverse lookup attributes the anchor to the seeded store's concept.
  const rev = spawn([engine('resolve.js'), '--paths', 'src/a.ts', '--root', repo, '--json']);
  assert.equal(rev.status, 0, rev.stderr);
  assert.ok(rev.stdout.includes('K-200'), 'resolve read a Store without K-200');

  // And the audit, riding the same Store, sees the anchor as already mapped.
  const audit = spawn([engine('audit.js'), '--root', repo, '--json']);
  assert.equal(audit.status, 0, audit.stderr);
  const findings = JSON.parse(audit.stdout).findings;
  assert.ok(
    !findings.some((f) => f.code === 'unmatched-anchor' && f.path === 'src/a.ts'),
    `the audit read a Store that does not map src/a.ts: ${JSON.stringify(findings)}`,
  );
});

test('one repo, every surface, one refusal: an ambiguous layout fails identically', () => {
  const repo = plant({
    'src/a.ts': 'export const A = 1;\n',
    ...storeAt('', 'K-100', 'Root'),
    ...storeAt(`${KIT_DIR_DEFAULT}/`, 'K-200', 'Nested'),
  });
  for (const [name, argv] of SURFACES) {
    const r = spawn(argv(repo));
    assert.equal(r.status, 2, `${name} must refuse an ambiguous layout, not guess: exit ${r.status}`);
    assert.match(r.stderr, /two candidate kit roots/, `${name} must name the ambiguity`);
    // A refusal is an engine failure, never the FINDINGS code.
    assert.notEqual(r.status, 1, `${name} must not report a refusal as findings`);
  }
});
