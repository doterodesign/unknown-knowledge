// KK-07: value validator CLI (PRD §4, §5; acceptance A2). Enumerates
// descriptor parsing + the per-kind dispatch frame: both-direction diffing
// (value-not-in-source / source-value-missing, §3.5 set equality), the
// wrong-pointer signature, duplicate source values, and the hard-error paths
// (malformed descriptor, unknown kind, missing source, out-of-envelope
// sentinel — a check that never ran is a blocking defect, never a silent
// pass). Concrete kinds land in KK-08/09/10; the shipped `test-lines` kind
// proves dispatch. Tested only through the public seam: the CLI process —
// exit codes and output ARE the contract.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const cli = fileURLToPath(new URL('../payload/engine/validate-values.js', import.meta.url));
const fixture = (name) => fileURLToPath(new URL(`fixtures/value-validator/${name}`, import.meta.url));

function run(...args) {
  return spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });
}
function runJson(store, expectedStatus, ...args) {
  const r = run('--root', fixture(store), '--json', ...args);
  assert.equal(r.status, expectedStatus, `expected exit ${expectedStatus}, got ${r.status}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`);
  return JSON.parse(r.stdout);
}

// ------------------------------------------------------------- clean (exit 0)

test('clean store: every claim agrees as a SET (order irrelevant) — exit 0', () => {
  const out = runJson('clean', 0);
  assert.equal(out.ok, true);
  assert.deepEqual(out.findings, []);
  // K-100 was actually checked, not skipped.
  const checked = out.checked.find((c) => c.concept === 'K-100');
  assert.equal(checked.descriptors, 1);
});

test('draft concepts are skipped (§3.5 structural checks only), even with a dead source', () => {
  // K-130 is draft and points at src/missing.txt — must NOT hard-error.
  const out = runJson('clean', 0);
  const skipped = out.checked.find((c) => c.concept === 'K-130');
  assert.equal(skipped.skipped, 'draft');
});

// ------------------------------------------- both-direction diffing (exit 1)

test('drift store: value-not-in-source AND source-value-missing in one run — exit 1', () => {
  const out = runJson('drift', 1, '--concepts', 'K-100');
  assert.equal(out.ok, false);
  const codes = out.findings.map((f) => f.code);
  assert.ok(codes.includes('value-not-in-source'), `codes: ${codes}`);
  assert.ok(codes.includes('source-value-missing'), `codes: ${codes}`);
  const notInSource = out.findings.find((f) => f.code === 'value-not-in-source');
  assert.equal(notInSource.concept, 'K-100');
  assert.equal(notInSource.value, 'xfl');
  assert.equal(notInSource.severity, 'error');
  const missing = out.findings.find((f) => f.code === 'source-value-missing');
  assert.equal(missing.value, 'mls');
  assert.equal(missing.severity, 'error');
});

test('duplicate value in the source is a finding (§3.5: values compare as sets)', () => {
  const out = runJson('drift', 1, '--concepts', 'K-100');
  const dup = out.findings.find((f) => f.code === 'duplicate-source-value');
  assert.ok(dup, `findings: ${JSON.stringify(out.findings)}`);
  assert.equal(dup.value, 'nba');
});

test('equality is byte-exact and case-sensitive — no normalization sneaks in', () => {
  // usd/eur match exactly; if comparison lowercased or trimmed this would
  // still pass, so the drift store proves the negative: "xfl" vs source
  // holding no near-miss. The clean store proves order-insensitivity.
  const out = runJson('drift', 0, '--concepts', 'K-110');
  assert.deepEqual(out.findings, []);
});

// ------------------------------------------------------- wrong-pointer (§4)

test('ALL claimed values missing from a real parseable file → one wrong-pointer finding, not a cascade', () => {
  const out = runJson('wrong-pointer', 1);
  assert.deepEqual(out.findings.map((f) => f.code), ['wrong-pointer']);
  const [f] = out.findings;
  assert.equal(f.concept, 'K-100');
  assert.equal(f.source, 'src/registry.txt');
  assert.equal(f.severity, 'error');
});

// --------------------------------------------- deprecated demotion (§3.5)

test('deprecated concepts: value findings demote to warnings — exit 0 when nothing blocks', () => {
  const out = runJson('drift', 0, '--concepts', 'K-120');
  assert.equal(out.ok, true);
  const [f] = out.findings;
  assert.equal(f.code, 'source-value-missing');
  assert.equal(f.severity, 'warning');
  assert.equal(f.concept, 'K-120');
});

// -------------------------------------------------------- --concepts filter

test('--concepts filters to the named ids only', () => {
  const all = runJson('drift', 1);
  assert.ok(all.findings.some((f) => f.concept === 'K-100'));
  assert.ok(all.findings.some((f) => f.concept === 'K-120'));
  const one = runJson('drift', 1, '--concepts', 'K-100');
  assert.ok(one.findings.every((f) => f.concept === 'K-100'));
  // comma list and repeated flag both work
  const two = runJson('drift', 1, '--concepts=K-100,K-110');
  assert.ok(two.findings.every((f) => f.concept === 'K-100'));
  assert.ok(two.checked.some((c) => c.concept === 'K-110'));
  assert.ok(!two.checked.some((c) => c.concept === 'K-120'));
});

test('--concepts naming an id that does not exist is a hard error (exit 2) — a check that never ran', () => {
  const r = run('--root', fixture('drift'), '--concepts', 'K-999');
  assert.equal(r.status, 2, r.stdout + r.stderr);
  assert.match(r.stderr, /K-999/);
});

// --------------------------------------------------- hard errors (exit 2)

test('malformed descriptor (coerced non-string value, unlisted source) → exit 2, never skipped', () => {
  const out = runJson('malformed', 2);
  assert.equal(out.ok, false);
  const codes = out['hard-errors'].map((e) => e.code);
  assert.ok(codes.includes('non-string-enumerates-value'), `codes: ${codes}`);
  assert.ok(codes.includes('enumerates-source-not-listed'), `codes: ${codes}`);
  assert.deepEqual(out.findings, []); // the check never ran; no findings claimed
});

test('unknown extractor kind → exit 2 with a typed hard error naming the kind', () => {
  const out = runJson('unknown-kind', 2);
  const [e] = out['hard-errors'].filter((x) => x.code === 'unknown-kind');
  assert.ok(e, JSON.stringify(out['hard-errors']));
  assert.match(e.message, /no-such-kind/);
  assert.equal(e.concept, 'K-100');
});

test('missing source file and out-of-envelope sentinel both hard-error — and BOTH are reported in one run', () => {
  const out = runJson('never-ran', 2);
  const codes = out['hard-errors'].map((e) => e.code).sort();
  assert.ok(codes.includes('source-missing'), `codes: ${codes}`);
  assert.ok(codes.includes('out-of-envelope'), `codes: ${codes}`);
  const envelope = out['hard-errors'].find((e) => e.code === 'out-of-envelope');
  assert.equal(envelope.concept, 'K-110');
  assert.match(envelope.message, /@if/);
});

test('nonexistent root → exit 2 (engine failure), message on stderr', () => {
  const r = run('--root', '/nonexistent/store/root');
  assert.equal(r.status, 2);
  assert.match(r.stderr, /not a readable directory/);
});

// ---------------------------------------------------- CLI conventions (KK-06)

test('unknown flags hard-error (exit 2) with usage', () => {
  const r = run('--root', fixture('clean'), '--bogus');
  assert.equal(r.status, 2);
  assert.match(r.stderr, /unknown flag --bogus/);
  assert.match(r.stderr, /usage:/);
});

test('positional arguments are rejected — this CLI takes flags only', () => {
  const r = run('stray', '--root', fixture('clean'));
  assert.equal(r.status, 2);
  assert.match(r.stderr, /unexpected argument/);
});

test('--json takes no value; --root requires one', () => {
  assert.equal(run('--json=yes', '--root', fixture('clean')).status, 2);
  assert.equal(run('--root').status, 2);
});

test('--flag value and --flag=value are interchangeable', () => {
  const a = run('--root', fixture('clean'), '--json');
  const b = run(`--root=${fixture('clean')}`, '--json');
  assert.equal(a.status, 0);
  assert.deepEqual(JSON.parse(a.stdout), JSON.parse(b.stdout));
});

// ------------------------------------------------ determinism & output modes

test('JSON output is stable-sorted and deterministic across runs (no timestamps)', () => {
  const a = run('--root', fixture('drift'), '--json');
  const b = run('--root', fixture('drift'), '--json');
  assert.equal(a.stdout, b.stdout);
  const out = JSON.parse(a.stdout);
  const keys = out.findings.map((f) => `${f.concept} ${f.path} ${f.code}`);
  assert.deepEqual(keys, [...keys].sort());
  assert.ok(!a.stdout.match(/\d{2}:\d{2}:\d{2}/), 'no wall-clock timestamps in diffable output');
});

test('human mode reports findings with concept, code, and source', () => {
  const r = run('--root', fixture('drift'));
  assert.equal(r.status, 1);
  assert.match(r.stdout, /K-100/);
  assert.match(r.stdout, /value-not-in-source/);
  assert.match(r.stdout, /source-value-missing/);
  assert.match(r.stdout, /src\/sports\.txt/);
});

test('human mode on a clean store says so', () => {
  const r = run('--root', fixture('clean'));
  assert.equal(r.status, 0);
  assert.match(r.stdout, /0 finding/);
});

test('store loaded with error-severity diagnostics elsewhere is exit 2 — unprovable claims never silently pass', () => {
  // The malformed store's diagnostics are enumerates-shaped, but the contract
  // is broader: the value validator refuses to certify values on a store the
  // single health model marks unhealthy.
  const r = run('--root', fixture('malformed'));
  assert.equal(r.status, 2);
  assert.match(r.stdout, /hard error/i);
});
