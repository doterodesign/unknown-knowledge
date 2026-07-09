// KK-26: preflight verdict module (PRD §4, D-011; acceptance A6). Joins
// loader diagnostics + validator results to a --concepts list: per-concept
// verdicts (trusted / quarantined / unknown) + next actions, store-wide
// failures degrade all requested verdicts to unknown, the exit-code contract
// (0 = all trusted, 1 = quarantines, 2 = engine failure / check-never-ran),
// the engine-attributed quarantine finding trigger (KK-13), and store-health-
// only mode on an empty --concepts list. Tested only through the public seam:
// the CLI process — exit codes and output ARE the contract.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { load } from 'js-yaml';

const cli = fileURLToPath(new URL('../payload/engine/preflight.js', import.meta.url));
const fixture = (name) => fileURLToPath(new URL(`fixtures/preflight/${name}`, import.meta.url));

function run(...args) {
  return spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });
}
function runJson(store, expectedStatus, ...args) {
  const r = run('--root', fixture(store), '--json', ...args);
  assert.equal(r.status, expectedStatus, `expected exit ${expectedStatus}, got ${r.status}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`);
  return JSON.parse(r.stdout);
}
const verdictOf = (out, id) => out.verdicts.find((v) => v.concept === id);

// -------------------------------------------------------- all trusted (exit 0)

test('clean store: every requested active concept is trusted — exit 0', () => {
  const out = runJson('clean', 0, '--concepts', 'K-100,K-110');
  assert.equal(out.ok, true);
  assert.equal(out['store-verdict'], 'trusted');
  assert.deepEqual(out.counts, { trusted: 2, quarantined: 0, unknown: 0 });
  for (const id of ['K-100', 'K-110']) {
    const v = verdictOf(out, id);
    assert.equal(v.verdict, 'trusted');
    assert.deepEqual(v.evidence, []);
    assert.match(v['next-action'], /never cache/i); // no verdict caching (D-011)
  }
});

// --------------------------- drift → quarantined, untouched stay trusted (exit 1)

test('fixture drift: quarantined verdict for the touching concept, trusted for the rest — exit 1', () => {
  const out = runJson('drift', 1, '--concepts', 'K-100,K-110');
  assert.equal(out.ok, false);
  assert.deepEqual(out.counts, { trusted: 1, quarantined: 1, unknown: 0 });
  const bad = verdictOf(out, 'K-100');
  assert.equal(bad.verdict, 'quarantined');
  const codes = bad.evidence.map((e) => e.code);
  assert.ok(codes.includes('value-not-in-source'), `codes: ${codes}`);
  assert.ok(codes.includes('source-value-missing'), `codes: ${codes}`);
  assert.match(bad['next-action'], /protocol-layer/); // conduct is not the engine's
  assert.equal(verdictOf(out, 'K-110').verdict, 'trusted');
});

// ----------------------------------------- draft/proposed → unknown (§3.5)

test('draft concept verdicts unknown — value checks were skipped, so nothing certifies it', () => {
  const out = runJson('clean', 2, '--concepts', 'K-130');
  const v = verdictOf(out, 'K-130');
  assert.equal(v.verdict, 'unknown');
  assert.equal(v.status, 'draft');
  assert.match(v.reason, /structural checks only/);
});

test('an unknown verdict is never exit 0 — only all-trusted reads as clean', () => {
  // K-100 is trusted here, but K-130's checks never ran: exit 2, not 0.
  const r = run('--root', fixture('clean'), '--concepts', 'K-100,K-130');
  assert.equal(r.status, 2, r.stdout + r.stderr);
});

// --------------------------- store-wide failure → all unknown (exit 2)

test('store-wide parse failure degrades ALL requested verdicts to unknown — exit 2', () => {
  const out = runJson('malformed', 2, '--concepts', 'K-100,K-110');
  assert.equal(out.ok, false);
  assert.equal(out['store-verdict'], 'unknown');
  assert.deepEqual(out.counts, { trusted: 0, quarantined: 0, unknown: 2 });
  for (const v of out.verdicts) {
    assert.equal(v.verdict, 'unknown');
    assert.match(v.reason, /store-wide failure/);
  }
  assert.ok(out['store-errors'].some((d) => d.code === 'parse-error'));
});

// ------------------------------------------------ never-ran paths (exit 2)

test('--concepts naming an id not in the ontology → exit 2, message on stderr', () => {
  const r = run('--root', fixture('clean'), '--concepts', 'K-999');
  assert.equal(r.status, 2, r.stdout + r.stderr);
  assert.match(r.stderr, /K-999/);
});

test('nonexistent root → exit 2 (engine failure), message on stderr', () => {
  const r = run('--root', '/nonexistent/store/root');
  assert.equal(r.status, 2);
  assert.match(r.stderr, /not a readable directory/);
});

// ------------------------------------- store-health-only mode (empty --concepts)

test('omitted --concepts validates store health only — clean store exits on the store verdict (0)', () => {
  const out = runJson('clean', 0);
  assert.equal(out.mode, 'store-health');
  assert.equal(out['store-verdict'], 'trusted');
  assert.deepEqual(out.verdicts, []); // no per-concept check ran, so no verdict exists
});

test('explicitly empty --concepts is store-health-only too; a broken store exits 2', () => {
  const clean = runJson('clean', 0, '--concepts=');
  assert.equal(clean.mode, 'store-health');
  const broken = runJson('malformed', 2, '--concepts=');
  assert.equal(broken['store-verdict'], 'unknown');
});

test('store-health-only mode does NOT hide drift behind exit 0 semantics — drift is per-concept, health is the loader', () => {
  // The drift store LOADS fine (single health model): store verdict trusted.
  // Per-concept trust requires naming the concepts — no silent all-clear on
  // facts nothing checked.
  const out = runJson('drift', 0);
  assert.equal(out['store-verdict'], 'trusted');
  assert.deepEqual(out.verdicts, []);
});

// ------------------------------- quarantine finding trigger (KK-13, --log)

function withDriftCopy(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'unknown-knowledge-preflight-'));
  try {
    cpSync(fixture('drift'), dir, { recursive: true });
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('--log appends one engine-attributed quarantine finding per quarantined concept (KK-13 schema)', () => {
  withDriftCopy((dir) => {
    const r = run('--root', dir, '--concepts', 'K-100,K-110', '--log', '--today', '2026-01-05', '--json');
    assert.equal(r.status, 1, r.stdout + r.stderr);
    const out = JSON.parse(r.stdout);
    assert.equal(out.logged.length, 1); // K-110 is trusted: no fragment for it
    const [file] = out.logged;
    assert.match(file, /^logs\/findings\/2026-01-05-[0-9a-f]{8}\.yaml$/); // injected date, D-010 one-file-per-entry
    const entry = load(readFileSync(join(dir, file), 'utf8'));
    assert.equal(entry.trigger, 'quarantine');
    assert.equal(entry.status, 'open');
    assert.equal(entry.date, '2026-01-05');
    assert.deepEqual(entry.consulted, { concepts: ['K-100'] });
    // Capture content policy (§3.4): concept ids, codes, and paths only.
    assert.match(entry.summary, /K-100/);
    assert.match(entry.summary, /value-not-in-source/);
    assert.match(entry.summary, /src\/sports\.txt/);
  });
});

test('without --log nothing is appended — logging is opt-in, never a side effect', () => {
  withDriftCopy((dir) => {
    const r = run('--root', dir, '--concepts', 'K-100', '--json');
    assert.equal(r.status, 1);
    assert.equal(JSON.parse(r.stdout).logged, undefined);
    assert.throws(() => readdirSync(join(dir, 'logs', 'findings')), /ENOENT/);
  });
});

test('--log requires --today — the finding helper never reads the wall clock', () => {
  const r = run('--root', fixture('drift'), '--concepts', 'K-100', '--log');
  assert.equal(r.status, 2);
  assert.match(r.stderr, /--log requires --today/);
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

test('--json and --log take no value; --root, --concepts, and --today require one', () => {
  assert.equal(run('--json=yes', '--root', fixture('clean')).status, 2);
  assert.equal(run('--log=yes', '--root', fixture('clean')).status, 2);
  assert.equal(run('--root').status, 2);
  assert.equal(run('--root', fixture('clean'), '--concepts').status, 2);
  assert.equal(run('--root', fixture('clean'), '--today').status, 2);
  assert.equal(run('--root', fixture('clean'), '--today', 'not-a-date').status, 2);
  // Date.parse would roll 2026-02-30 over to March — a permanent bad log date.
  assert.equal(run('--root', fixture('clean'), '--today', '2026-02-30').status, 2);
});

test('--flag value and --flag=value are interchangeable', () => {
  const a = run('--root', fixture('drift'), '--concepts', 'K-100,K-110', '--json');
  const b = run(`--root=${fixture('drift')}`, '--concepts=K-100,K-110', '--json');
  assert.equal(a.status, 1);
  assert.equal(b.status, 1);
  assert.deepEqual(JSON.parse(a.stdout), JSON.parse(b.stdout));
});

// ------------------------------------------------ determinism & output modes

test('two runs are byte-identical — no verdict caching, no wall-clock timestamps (D-011, D-012)', () => {
  const args = ['--root', fixture('drift'), '--concepts', 'K-130,K-100,K-110', '--json'];
  const a = run(...args);
  const b = run(...args);
  assert.equal(a.stdout, b.stdout);
  const out = JSON.parse(a.stdout);
  const ids = out.verdicts.map((v) => v.concept);
  assert.deepEqual(ids, [...ids].sort()); // stable-sorted regardless of argv order
  assert.ok(!a.stdout.match(/\d{2}:\d{2}:\d{2}/), 'no wall-clock timestamps in diffable output');
});

test('human mode reports each verdict with concept, status, and next action', () => {
  const r = run('--root', fixture('drift'), '--concepts', 'K-100,K-110');
  assert.equal(r.status, 1);
  assert.match(r.stdout, /QUARANTINED {2}K-100/);
  assert.match(r.stdout, /TRUSTED {2}K-110/);
  assert.match(r.stdout, /value-not-in-source/);
  assert.match(r.stdout, /next:/);
});

test('human mode on an all-trusted run says so', () => {
  const r = run('--root', fixture('clean'), '--concepts', 'K-100,K-110');
  assert.equal(r.status, 0);
  assert.match(r.stdout, /2 trusted, 0 quarantined, 0 unknown/);
  assert.match(r.stdout, /never cached/);
});
