// UCS-952: the contract the whole wide refactor was for.
//
//   EXIT 1 MEANS FINDINGS. NO COMMAND-LINE SURFACE CAN WEAR IT BY CRASHING.
//
// An engine that dies mid-check and exits 1 tells an agent riding the exit-code
// contract that the check RAN and found problems (PRD §5, D-011). So it
// quarantines, and continues, past a check that never ran. This session found
// that defect six times in surfaces that each hand-rolled their own catch.
//
// The rule is now structural — `runCli` owns the epilogue, the entry shims own
// the module load — and these tests are what keep it structural. They ENUMERATE
// the surfaces rather than listing them, so a tenth CLI cannot quietly opt out.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { EXIT_CODES } from '../payload/engine/lib/exit-codes.js';
import { catchBlocks } from './lib/catch-blocks.js';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const fixture = join(repoRoot, 'fixtures', 'ts-app');

/**
 * Every command-line surface in the repo, discovered rather than listed: the
 * engine's entry shims, plus the two init entry points. A new CLI is covered
 * the day it lands.
 */
function surfaces() {
  const engine = readdirSync(join(repoRoot, 'payload', 'engine'))
    .filter((f) => f.endsWith('.js'))
    .map((f) => join('payload', 'engine', f));
  const cli = readdirSync(join(repoRoot, 'cli'))
    .filter((f) => f.endsWith('.js'))
    .map((f) => join('cli', f));
  return [...engine, ...cli].sort();
}

/**
 * The argv each surface needs to get PAST its flag grammar and into `main`,
 * where the injected bug waits. A surface with no entry here fails the crash
 * test with a usage error rather than passing vacuously — fail-closed on
 * purpose, so adding a CLI forces you to say how to run it.
 */
const ARGV = {
  'payload/engine/resolve.js': ['some-term'],
  'payload/engine/log-entry.js': ['create'],
  'cli/init-copy.js': ['--target', '.'],
};

/** Surfaces that can legitimately return exit 1, and why. */
const EMITS_FINDINGS = new Set([
  'payload/engine/validate.js', // structural findings
  'payload/engine/validate-values.js', // value findings
  'payload/engine/preflight.js', // quarantined concepts
  'payload/engine/audit.js', // findings, under the human opt-in only
  'payload/engine/survey-map.js', // blind spots
]);

/** The command module behind a surface's entry shim. */
const commandOf = (surface) => surface.replace(/\/([\w-]+\.js)$/, '/commands/$1');

/**
 * A throwaway git repo whose only oddity is a tracked symlink pointing outside
 * it — a blind spot the survey map must disclose, and exit 1 for. Nothing in
 * this repo has one, so the FINDINGS branch would otherwise never be exercised.
 */
function repoWithBlindSpot(t) {
  const dir = mkdtempSync(join(tmpdir(), 'uk-blind-'));
  const outside = mkdtempSync(join(tmpdir(), 'uk-outside-'));
  t.after(() => { rmSync(dir, { recursive: true, force: true }); rmSync(outside, { recursive: true, force: true }); });

  writeFileSync(join(outside, 'outside.txt'), 'not visible from the root\n');
  writeFileSync(join(dir, 'a.ts'), 'export const a = 1;\n');
  symlinkSync(join(outside, 'outside.txt'), join(dir, 'link.txt'));

  const git = (...args) => spawnSync('git', ['-C', dir, ...args], { encoding: 'utf8', timeout: 20_000 });
  assert.equal(git('init', '-q', '.').status, 0, 'git init');
  git('config', 'user.email', 'test@example.com');
  git('config', 'user.name', 'test');
  assert.equal(git('add', '-A').status, 0, 'git add');
  return dir;
}

test('the enumeration finds every surface, and each one is a shim over a real command', () => {
  const found = surfaces();
  assert.ok(found.length >= 9, `expected at least 9 surfaces, found ${found.length}: ${found.join(', ')}`);

  // Every surface pairs with a command module that exports what the shim boots.
  // A shim pointing at nothing would make the crash test spawn a process that
  // dies before `main`, which is a pass for the wrong reason.
  for (const surface of found) {
    const command = readFileSync(join(repoRoot, commandOf(surface)), 'utf8');
    assert.match(command, /^export (?:async )?function main/m, `${commandOf(surface)} must export main`);
    assert.match(command, /^export const USAGE/m, `${commandOf(surface)} must export USAGE`);
  }

  // The two tables below drive every other test in this file. A surface missing
  // from both is a surface nobody classified; a name in either that no longer
  // exists is a rename that silently stopped testing something.
  for (const named of [...Object.keys(ARGV), ...EMITS_FINDINGS]) {
    assert.ok(found.includes(named), `${named} is in a table but is not a surface any more`);
  }
});

test('a crash in ANY surface exits 2 — never 1', (t) => {
  // The bug is injected into `process.cwd`, which every surface calls while
  // resolving its default root. It throws a TypeError from inside `main`, the
  // deepest place a real bug lives, and nothing about it is mocked: a real
  // process, a real throw, a real exit code.
  const dir = mkdtempSync(join(tmpdir(), 'uk-crash-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const preload = join(dir, 'crash.mjs');
  writeFileSync(preload, "process.cwd = () => { throw new TypeError('injected runtime bug'); };\n");

  for (const surface of surfaces()) {
    const r = spawnSync(process.execPath, [join(repoRoot, surface), ...(ARGV[surface] ?? [])], {
      encoding: 'utf8',
      timeout: 20_000,
      cwd: repoRoot,
      env: { ...process.env, NODE_OPTIONS: `--import ${pathToFileURL(preload).href}` },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    assert.notEqual(r.signal, 'SIGTERM', `${surface}: timed out`);
    assert.notEqual(r.status, EXIT_CODES.FINDINGS,
      `${surface} exited 1 on a crash. An agent reads that as "the check ran and found problems"`);
    assert.equal(r.status, EXIT_CODES.FAILURE, `${surface}: a crash exits 2\n${r.stderr}`);
    // Proves the bug reached `main` rather than being deflected by a usage
    // error, which would make this test pass without testing anything.
    assert.match(r.stderr, /internal failure/,
      `${surface}: the crash never reached the harness — did its argv change?\n${r.stderr}`);
    assert.match(r.stderr, /injected runtime bug/, `${surface}: a different failure than the one injected`);
  }
});

test('no surface defines its own flag parser or its own catch-to-exit mapping', () => {
  for (const surface of surfaces()) {
    const source = readFileSync(join(repoRoot, commandOf(surface)), 'utf8');

    assert.ok(!/class UsageError extends Error/.test(source), `${surface} redeclares UsageError`);
    assert.ok(!/instanceof UsageError/.test(source),
      `${surface} decides what a usage error means — that belongs to the harness`);
    assert.ok(!/internal failure/.test(source),
      `${surface} hand-rolls the crash epilogue — that belongs to the harness`);
    assert.ok(!/function parseArgs\(argv\) \{[\s\S]{0,300}?for \(let i = 0/.test(source),
      `${surface} still hand-rolls the flag loop`);
    assert.match(source, /parseArgs as parseFlags/, `${surface} must parse through the shared grammar`);

    // Every catch that decides the exit code must first let a bug travel on.
    for (const block of catchBlocks(source)) {
      if (!/EXIT_CODES\.FAILURE/.test(block)) continue;
      assert.match(block, /rethrowIfBug\(error\)/,
        `${surface} has a catch that decides the exit code without first rethrowing bugs`);
    }
  }
});

test('exit 1 is unreachable — not merely unused — for the surfaces that find nothing', () => {
  // The resolver answers a question. log-entry appends a record. init seeds a
  // repo. None of them can "find 3 problems", so the FINDINGS code must not
  // appear in their source at all: a reader cannot reach for what is not there.
  for (const surface of surfaces().filter((s) => !EMITS_FINDINGS.has(s))) {
    const source = readFileSync(join(repoRoot, commandOf(surface)), 'utf8');
    assert.doesNotMatch(source, /EXIT_CODES\.FINDINGS/,
      `${surface} names the FINDINGS code, but it has no findings to report`);
  }
});

test('exit 1 still MEANS findings for the surfaces that have them', (t) => {
  // The other half of the contract. Making a crash unable to exit 1 is worth
  // nothing if the code stopped meaning anything.
  const run = (surface, ...args) =>
    spawnSync(process.execPath, [join(repoRoot, surface), ...args],
      { encoding: 'utf8', timeout: 20_000, cwd: repoRoot, stdio: ['ignore', 'pipe', 'pipe'] });

  // The reverse audit: advisory by default (D-013), exit 1 only on the human
  // opt-in — and never a shipped CI default.
  assert.equal(run('payload/engine/audit.js', '--root', fixture).status, EXIT_CODES.CLEAN,
    'findings alone never gate the audit');
  assert.equal(run('payload/engine/audit.js', '--root', fixture, '--fail-on-findings').status, EXIT_CODES.FINDINGS,
    'the human opt-in still turns audit findings into exit 1');

  // The survey map: blind spots are findings. Deriving the expectation from the
  // map's own output would only check a run against itself — and no root in
  // this repo has a blind spot, so the FINDINGS branch would never run. Build
  // one: a tracked symlink pointing out of the root is a blind spot by
  // definition (§11.1), because the map cannot see what it points at.
  const clean = run('payload/engine/survey-map.js', '--root', fixture, '--json');
  assert.equal(clean.status, EXIT_CODES.CLEAN, 'a root with nothing hidden exits 0');
  assert.equal(JSON.parse(clean.stdout).unsurveyed.length, 0);

  const blindRoot = repoWithBlindSpot(t);
  const blind = run('payload/engine/survey-map.js', '--root', blindRoot, '--json');
  assert.equal(blind.status, EXIT_CODES.FINDINGS, 'a disclosed blind spot IS a finding, and exits 1');
  assert.deepEqual(JSON.parse(blind.stdout).unsurveyed,
    [{ path: 'link.txt', reason: 'out-of-root-symlink' }]);

  // And every findings-capable surface still names the code it returns.
  for (const surface of EMITS_FINDINGS) {
    const source = readFileSync(join(repoRoot, commandOf(surface)), 'utf8');
    assert.match(source, /EXIT_CODES\.FINDINGS/, `${surface} no longer returns the FINDINGS code it exists to return`);
  }
});
