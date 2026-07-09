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

const cli = fileURLToPath(new URL('../payload/engine/validate.js', import.meta.url));
const fixtures = (name) =>
  fileURLToPath(new URL(`fixtures/structural-validator/${name}`, import.meta.url));
const clean = fixtures('clean');
const findingsStore = fixtures('findings');
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
    'id-range', 'id-shape', 'index-drift', 'missing-citation',
    'missing-path', 'orphan', 'ref-cycle',
  ]);
});

test('clean store human output says structurally clean and lists checks run', () => {
  const r = run('--root', clean);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /0 findings — structurally clean/);
  assert.match(r.stdout, /checks run: id-range, id-shape, index-drift/);
});

// -------------------------------------- every finding class (exit 1, §4)

test('findings store exits 1 with error counts in JSON and human output', () => {
  const out = runJson(1, '--root', findingsStore);
  assert.equal(out.counts.errors, 9);
  assert.equal(out.counts.warnings, 0);
  const human = run('--root', findingsStore);
  assert.equal(human.status, 1);
  assert.match(human.stdout, /9 finding/);
});

test('findings are stable-sorted by file/path/code/id — attribution pinned (D-012)', () => {
  const out = runJson(1, '--root', findingsStore);
  assert.deepEqual(
    out.findings.map((f) => [f.code, f.id]),
    [
      ['ref-cycle', 'D-101'],
      ['index-drift', '500.2'],
      ['missing-citation', '500.1'],
      ['orphan', '500.3'],
      ['id-shape', 'BAD'],
      ['index-drift', 'K-330'],
      ['id-range', 'K-999'],
      ['orphan', 'K-320'],
      ['missing-path', 'K-310'],
    ],
  );
});

test('id-shape: catalog id violating the store id grammar', () => {
  const out = runJson(1, '--root', findingsStore);
  const f = out.findings.find((x) => x.code === 'id-shape');
  assert.equal(f.severity, 'error');
  assert.equal(f.id, 'BAD');
  assert.equal(f.file, 'ontology/_catalog.yaml');
  assert.equal(f.path, 'entries[0].id');
  assert.match(f.message, /K-NNN/);
});

test('id-range: concept id outside the class file declared range', () => {
  const out = runJson(1, '--root', findingsStore);
  const f = out.findings.find((x) => x.code === 'id-range');
  assert.equal(f.id, 'K-999');
  assert.equal(f.file, 'ontology/classes/300-widgets.yaml');
  assert.match(f.message, /300/);
});

test('missing-path: an active concept source-of-truth path that does not exist', () => {
  const out = runJson(1, '--root', findingsStore);
  const f = out.findings.find((x) => x.code === 'missing-path');
  assert.equal(f.id, 'K-310');
  assert.equal(f.severity, 'error');
  assert.equal(f.path, 'source-of-truth[0]');
  assert.match(f.message, /src\/widgets\/registry\.ts/);
});

test('index-drift: catalog row naming a file that does not exist', () => {
  const out = runJson(1, '--root', findingsStore);
  const f = out.findings.find((x) => x.code === 'index-drift' && x.id === 'K-330');
  assert.equal(f.file, 'ontology/_catalog.yaml');
  assert.equal(f.path, 'entries[3].file');
  assert.match(f.message, /does not exist/);
});

test('index-drift: catalog row whose id is not in the file it names', () => {
  const out = runJson(1, '--root', findingsStore);
  const f = out.findings.find((x) => x.code === 'index-drift' && x.id === '500.2');
  assert.equal(f.file, 'knowledge/_catalog.yaml');
  assert.match(f.message, /not found in/);
});

test('orphan: loaded records the store catalog never declares (both stores)', () => {
  const out = runJson(1, '--root', findingsStore);
  const orphans = out.findings.filter((x) => x.code === 'orphan');
  assert.deepEqual(orphans.map((f) => f.id).sort(), ['500.3', 'K-320']);
  for (const f of orphans) assert.match(f.message, /catalog/);
});

test('missing-citation: a leaf citation with an empty source', () => {
  const out = runJson(1, '--root', findingsStore);
  const f = out.findings.find((x) => x.code === 'missing-citation');
  assert.equal(f.id, '500.1');
  assert.equal(f.path, 'citations[0].source');
});

test('ref-cycle: a supersedes chain that loops is reported once, deterministically', () => {
  const out = runJson(1, '--root', findingsStore);
  const cycles = out.findings.filter((x) => x.code === 'ref-cycle');
  assert.equal(cycles.length, 1, 'one cycle, one finding');
  assert.equal(cycles[0].id, 'D-101');
  assert.match(cycles[0].message, /D-101 -> D-102 -> D-101/);
});

// ------------------------------- §3.5 status semantics & pending marker

test('deprecated concept missing-path demotes to warning; warnings alone exit 0', () => {
  const out = runJson(0, '--root', warningsStore);
  assert.equal(out.counts.errors, 0);
  const f = out.findings.find((x) => x.code === 'missing-path');
  assert.equal(f.severity, 'warning');
  assert.equal(f.id, 'K-800');
});

test('catalog pending-import marker surfaces as an index-drift warning, not a block', () => {
  const out = runJson(0, '--root', warningsStore);
  const f = out.findings.find((x) => x.code === 'index-drift');
  assert.equal(f.severity, 'warning');
  assert.equal(f.id, 'D-301');
  assert.match(f.message, /pending/);
});

// -------------------------------------- --concepts filter (mid-session ACT)

test('--concepts filters findings to the named concepts only', () => {
  const out = runJson(1, '--root', findingsStore, '--concepts', 'K-310');
  assert.deepEqual(out.concepts, ['K-310']);
  assert.deepEqual(out.findings.map((f) => [f.code, f.id]), [['missing-path', 'K-310']]);
});

test('--concepts accepts a comma-separated list and stays sorted', () => {
  const out = runJson(1, '--root', findingsStore, '--concepts', 'K-999,K-310');
  assert.deepEqual(out.concepts, ['K-310', 'K-999']);
  assert.deepEqual(out.findings.map((f) => f.code), ['id-range', 'missing-path']);
});

test('--concepts on a clean concept exits 0 with zero findings', () => {
  const out = runJson(0, '--root', clean, '--concepts', 'K-410');
  assert.deepEqual(out.findings, []);
});

test('--concepts with an unknown id is a hard error, exit 2 — never a silent pass', () => {
  const r = run('--root', findingsStore, '--concepts', 'K-777');
  assert.equal(r.status, 2);
  assert.match(r.stderr, /unknown concept id "K-777"/);
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
  const r = run(`--root=${findingsStore}`, '--concepts=K-310', '--json');
  assert.equal(r.status, 1, r.stderr);
  assert.deepEqual(JSON.parse(r.stdout).findings.map((f) => f.id), ['K-310']);
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
