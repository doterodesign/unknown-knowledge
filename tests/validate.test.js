// KK-05: structural validator CLI (PRD §4 validator row; UCS-908). Blocking-
// grade checks over the KK-04 loader model — id shape/range, catalog/tree
// index consistency, source-of-truth path existence, orphans, citations,
// decision-chain acyclicity — with the engine exit-code contract (PRD §5):
// 0 clean, 1 findings, 2 engine failure. Tested only through its public seam:
// the CLI process — exit codes and output ARE the contract.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadStores } from '../payload/engine/lib/load-stores.js';

const cli = fileURLToPath(new URL('../payload/engine/validate.js', import.meta.url));
const fixtures = (name) =>
  fileURLToPath(new URL(`fixtures/structural-validator/${name}`, import.meta.url));
const clean = fixtures('clean');
const findingsStore = fixtures('findings-canonical');
const warningsStore = fixtures('warnings');
const brokenStore = fileURLToPath(new URL('fixtures/loader/duplicate-id', import.meta.url));
const malformedStore = fileURLToPath(new URL('fixtures/loader/malformed', import.meta.url));
const repoRoot = fileURLToPath(new URL('..', import.meta.url));

function run(...args) {
  return spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });
}
function runJson(expectStatus, ...args) {
  const r = run(...args, '--json');
  assert.equal(r.status, expectStatus, `expected exit ${expectStatus}, got ${r.status}: ${r.stderr}`);
  return JSON.parse(r.stdout);
}

// ------------------------------------------------- clean store (exit 0)

test('clean store: exit 0, zero findings, every check class reported as run', () => {
  const out = runJson(0, '--root', clean);
  assert.deepEqual(out.findings, []);
  assert.deepEqual(out.counts, { errors: 0, warnings: 0 });
  assert.equal(out['store-health'].ok, true);
  assert.deepEqual(out.checks, [
    'disconnected-revocation', 'gated-category-graduation',
    'graduation-field-shape', 'graduation-not-trust-category',
    'id-shape', 'index-drift',
    'malformed-verified', 'missing-authority', 'missing-citation',
    'missing-graduation-table', 'missing-path', 'missing-registry',
    'missing-verified', 'orphan', 'ref-cycle', 'registry-shape-mismatch',
    'suppressed-value', 'unaccounted-edition', 'undeclared-category',
    'unminted-segment', 'unregistered-value',
  ]);
});

test('clean store human output says structurally clean and lists checks run', () => {
  const r = run('--root', clean);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /0 findings — structurally clean/);
  assert.match(r.stdout, /checks run: disconnected-revocation, gated-category-graduation/);
});

// -------------------------------------- every finding class (exit 1, §4)

test('findings store exits 1 with error counts in JSON and human output', () => {
  const out = runJson(1, '--root', findingsStore);
  // Originally nine: malformed identity now has its own loader-refusal control;
  // class-range ownership is explicitly retired and positively tested below.
  assert.equal(out.counts.errors, 7);
  assert.equal(out.counts.warnings, 0);
  const human = run('--root', findingsStore);
  assert.equal(human.status, 1);
  assert.match(human.stdout, /7 finding/);
});

test('findings are stable-sorted by file/path/code/id — attribution pinned (D-012)', () => {
  const out = runJson(1, '--root', findingsStore);
  assert.deepEqual(
    out.findings.map((f) => [f.code, f.id]),
    [
      ['ref-cycle', 'D-000001'],
      ['index-drift', 'K-000002'],
      ['missing-citation', 'K-000001'],
      ['orphan', 'K-000003'],
      ['index-drift', 'O-000004'],
      ['orphan', 'O-000002'],
      ['missing-path', 'O-000001'],
    ],
  );
});

test('a malformed catalog identity blocks the loader before structural checks', () => {
  const model = loadStores(fixtures('findings'));
  assert.equal(model.ok, false);
  assert.deepEqual(model.diagnostics.filter((d) => d.code === 'invalid-identity')
    .map((d) => [d.file, d.path]), [['ontology/_catalog.yaml', 'entries[0].id']]);
  const result = run('--root', fixtures('findings'), '--json');
  assert.equal(result.status, 2);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /invalid-identity/);
  assert.match(result.stderr, /structural checks never ran/);
});

test('permanent ontology identity is independent of class numeric placement', () => {
  // The former class-range defect is retired by the canonical contract.
  // BAD still fails in the sibling control; the other seven defects stay below.
  const model = loadStores(findingsStore);
  assert.equal(model.ok, true);
  assert.equal(model.concepts.get('O-000003').record.class, '300-widgets');
  const out = runJson(0, '--root', findingsStore, '--concepts', 'O-000003');
  assert.deepEqual(out.findings, []);
  assert.ok(!out.checks.includes('id-range'));
});

test('missing-path: an active concept source-of-truth path that does not exist', () => {
  const out = runJson(1, '--root', findingsStore);
  const f = out.findings.find((x) => x.code === 'missing-path');
  assert.equal(f.id, 'O-000001');
  assert.equal(f.severity, 'error');
  assert.equal(f.path, 'source-of-truth[0]');
  assert.match(f.message, /src\/widgets\/registry\.ts/);
});

test('index-drift: catalog row naming a file that does not exist', () => {
  const out = runJson(1, '--root', findingsStore);
  const f = out.findings.find((x) => x.code === 'index-drift' && x.id === 'O-000004');
  assert.equal(f.file, 'ontology/_catalog.yaml');
  assert.equal(f.path, 'entries[2].file');
  assert.match(f.message, /does not exist/);
});

test('index-drift: catalog row whose id is not in the file it names', () => {
  const out = runJson(1, '--root', findingsStore);
  const f = out.findings.find((x) => x.code === 'index-drift' && x.id === 'K-000002');
  assert.equal(f.file, 'knowledge/_catalog.yaml');
  assert.match(f.message, /not found in/);
});

test('orphan: loaded records the store catalog never declares (both stores)', () => {
  const out = runJson(1, '--root', findingsStore);
  const orphans = out.findings.filter((x) => x.code === 'orphan');
  assert.deepEqual(orphans.map((f) => f.id).sort(), ['K-000003', 'O-000002']);
  for (const f of orphans) assert.match(f.message, /catalog/);
});

test('missing-citation: a leaf citation with an empty source', () => {
  const out = runJson(1, '--root', findingsStore);
  const f = out.findings.find((x) => x.code === 'missing-citation');
  assert.equal(f.id, 'K-000001');
  assert.equal(f.path, 'citations[0].source');
});

test('ref-cycle: a supersedes chain that loops is reported once, deterministically', () => {
  const out = runJson(1, '--root', findingsStore);
  const cycles = out.findings.filter((x) => x.code === 'ref-cycle');
  assert.equal(cycles.length, 1, 'one cycle, one finding');
  assert.equal(cycles[0].id, 'D-000001');
  assert.match(cycles[0].message, /D-000001 -> D-000002 -> D-000001/);
});

// ------------------------------- §3.5 status semantics & pending marker

test('deprecated concept missing-path demotes to warning; warnings alone exit 0', () => {
  const out = runJson(0, '--root', warningsStore);
  assert.equal(out.counts.errors, 0);
  const f = out.findings.find((x) => x.code === 'missing-path');
  assert.equal(f.severity, 'warning');
  assert.equal(f.id, 'O-000001');
});

test('catalog pending-import marker surfaces as an index-drift warning, not a block', () => {
  const out = runJson(0, '--root', warningsStore);
  const f = out.findings.find((x) => x.code === 'index-drift');
  assert.equal(f.severity, 'warning');
  assert.equal(f.id, 'D-000001');
  assert.match(f.message, /pending/);
});

// -------------------------------------- --concepts filter (mid-session ACT)

test('--concepts filters findings to the named concepts only', () => {
  const out = runJson(1, '--root', findingsStore, '--concepts', 'O-000001');
  assert.deepEqual(out.concepts, ['O-000001']);
  assert.deepEqual(out.findings.map((f) => [f.code, f.id]), [['missing-path', 'O-000001']]);
});

test('--concepts accepts a comma-separated list and stays sorted', () => {
  const out = runJson(1, '--root', findingsStore, '--concepts', 'O-000003,O-000001');
  assert.deepEqual(out.concepts, ['O-000001', 'O-000003']);
  assert.deepEqual(out.findings.map((f) => f.code), ['missing-path']);
});

test('--concepts on a clean concept exits 0 with zero findings', () => {
  const out = runJson(0, '--root', clean, '--concepts', 'O-000001');
  assert.deepEqual(out.findings, []);
});

test('--concepts with an unknown id is a hard error, exit 2 — never a silent pass', () => {
  const r = run('--root', findingsStore, '--concepts', 'O-999777');
  assert.equal(r.status, 2);
  assert.match(r.stderr, /unknown concept id "O-999777"/);
});

// ------------------------------------------- engine failure (exit 2, PRD §5)

test('loader error diagnostics gate to exit 2 — checks that never ran are a defect', () => {
  for (const store of [brokenStore, malformedStore]) {
    const r = run('--root', store);
    assert.equal(r.status, 2, `expected exit 2 for ${store}: ${r.stderr}`);
    assert.match(r.stderr, /structural checks never ran/);
  }
});

test('unreadable root exits 2', () => {
  const r = run('--root', `${clean}/does-not-exist`);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /validate: /);
});

test('usage errors exit 2: unknown flag, positional arg, missing value, --json=x', () => {
  for (const args of [
    ['--nope', '--root', clean],
    ['stray-positional', '--root', clean],
    ['--root'],
    ['--concepts', '--root', clean],
    ['--json=yes', '--root', clean],
  ]) {
    const r = run(...args);
    assert.equal(r.status, 2, `expected exit 2 for: ${args.join(' ')}`);
    assert.match(r.stderr, /usage:/i);
  }
});

test('--flag=value equals-forms are accepted for --root and --concepts', () => {
  const r = run(`--root=${findingsStore}`, '--concepts=O-000001', '--json');
  assert.equal(r.status, 1, r.stderr);
  assert.deepEqual(JSON.parse(r.stdout).findings.map((f) => f.id), ['O-000001']);
});

// --------------------------------------------- determinism (D-012)

test('JSON output is deterministic: two runs byte-identical, no timestamps', () => {
  const a = run('--root', findingsStore, '--json');
  const b = run('--root', findingsStore, '--json');
  assert.equal(a.stdout, b.stdout);
  assert.equal(a.status, 1);
  assert.doesNotMatch(a.stdout, /\d{4}-\d{2}-\d{2}T/);
});

// --------------------------------------------- dogfood (PRD §9.2)

test("the kit's own stores pass the structural validator with exit 0", () => {
  const r = run('--root', repoRoot, '--json');
  assert.equal(r.status, 0, r.stderr || r.stdout);
  const out = JSON.parse(r.stdout);
  assert.deepEqual(out.findings, []);
  assert.equal(out['store-health'].ok, true);
});
