// UCS-956: a module-load failure exits 2, never 1.
//
// `runCli` promises that a crash exits 2. It cannot keep that promise for a
// failure that happens BEFORE it loads: Node exits 1 on an unhandled ES module
// load error. Exit 1 means FINDINGS, so a SyntaxError in a lib/ module used to
// tell an agent that the check RAN and found problems — and it would quarantine
// and continue, past a check that never ran (PRD §5, D-011).
//
// This is more reachable than an ordinary crash, because the kit is seeded into
// a client repo (D-001): a partial copy, a corrupted file, or an uninstalled
// dependency lands exactly here.
//
// Nothing here is mocked — the defect lives in Node's module loader, so a fake
// loader would prove nothing. Each test breaks a real module and spawns a real
// CLI. It breaks a COPY: `node --test` runs test files concurrently, so
// corrupting the engine in place would sabotage every sibling suite.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { appendFileSync, cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const engineDir = join(repoRoot, 'payload', 'engine');
const fixture = join(repoRoot, 'fixtures', 'ts-app');

/** Every entry shim, i.e. every path an agent is told to invoke. */
const SURFACES = readdirSync(engineDir).filter((f) => f.endsWith('.js'));

/**
 * A throwaway copy of the engine, isolated from the repo and from every other
 * test file. `deps: false` withholds node_modules, which is how a client who
 * never installed `js-yaml` sees the kit (§9.1).
 */
function sandbox(t, { deps = true } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'uk-module-load-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  // The whole payload, not just engine/: the engine reads its JSON schemas from
  // a sibling directory, and payload/package.json is the ESM marker without
  // which Node reads every engine file as CommonJS.
  cpSync(join(repoRoot, 'payload'), dir, { recursive: true });
  if (deps) symlinkSync(join(repoRoot, 'node_modules'), join(dir, 'node_modules'), 'dir');
  return dir;
}

/** Append invalid JavaScript to a module inside the sandbox. */
const corrupt = (dir, relPath) =>
  appendFileSync(join(dir, 'engine', relPath), '\nthis is not valid javascript ===\n');

const run = (dir, surface, ...args) =>
  spawnSync(process.execPath, [join(dir, 'engine', surface), ...args], { encoding: 'utf8', timeout: 20_000 });

/** The whole point: exit 1 is a lie when nothing ran. */
function assertNeverFindings(r, surface, why) {
  assert.notEqual(r.signal, 'SIGTERM', `${surface}: timed out`);
  assert.notEqual(r.status, 1,
    `${surface} exited 1 — FINDINGS — ${why}. An agent would quarantine and continue past a check that never ran`);
  assert.equal(r.status, 2, `${surface}: a check that never ran exits 2 (${why})`);
}

test('every surface is an entry shim that statically imports nothing', () => {
  assert.ok(SURFACES.length >= 7, 'the engine must expose its command-line surfaces');
  for (const surface of SURFACES) {
    const source = readFileSync(join(engineDir, surface), 'utf8');
    // A static import is evaluated before any statement in the file, so a shim
    // that has one can fail to load — and Node exits 1 when it does.
    assert.equal(source.match(/^import /gm), null,
      `${surface} statically imports something; its own load can then fail, and Node exits 1`);
    assert.match(source, /^\s*import\('\.\/lib\/boot\.js'\),$/m,
      `${surface} must reach the engine through a dynamic import`);
    assert.match(source, /^\s*import\('\.\/commands\/[\w-]+\.js'\),$/m,
      `${surface} must load its command dynamically too`);
  }
});

test('a SyntaxError deep in lib/ makes every surface exit 2, never 1', (t) => {
  const dir = sandbox(t);
  corrupt(dir, 'lib/exit-codes.js'); // a leaf every surface reaches
  for (const surface of SURFACES) {
    const r = run(dir, surface, '--root', fixture);
    assertNeverFindings(r, surface, 'on an engine that never loaded');
    assert.match(r.stderr, /internal failure — the engine could not be loaded/);
    assert.match(r.stderr, /SyntaxError/, `${surface} must say what could not be loaded, and why`);
  }
});

test('a SyntaxError in the harness itself still exits 2', (t) => {
  // cli.js defines runCli. If the thing that guarantees exit 2 cannot load,
  // the guarantee has to hold anyway.
  const dir = sandbox(t);
  corrupt(dir, 'lib/cli.js');
  for (const surface of SURFACES) assertNeverFindings(run(dir, surface, '--root', fixture), surface, 'with a broken harness');
});

test('a SyntaxError in boot.js — the shim\'s only reach — still exits 2', (t) => {
  // The shim imports boot.js dynamically for exactly this reason: its own catch
  // has to cover the case where boot.js is what is broken.
  const dir = sandbox(t);
  corrupt(dir, 'lib/boot.js');
  for (const surface of SURFACES) assertNeverFindings(run(dir, surface, '--root', fixture), surface, 'with a broken boot');
});

test('a SyntaxError in the command module exits 2', (t) => {
  const dir = sandbox(t);
  corrupt(dir, 'commands/validate.js');
  assertNeverFindings(run(dir, 'validate.js', '--root', fixture), 'validate.js', 'with a broken command');
});

test('a missing runtime dependency makes every surface exit 2, never 1', (t) => {
  // The seeded kit resolves js-yaml from the CLIENT's node_modules (§9.1). A
  // client who never installed it must get an engine failure, not findings.
  const dir = sandbox(t, { deps: false });
  for (const surface of SURFACES) {
    const r = run(dir, surface, '--root', fixture);
    assertNeverFindings(r, surface, 'with js-yaml absent');
    assert.match(r.stderr, /internal failure — the engine could not be loaded/);
    assert.match(r.stderr, /Cannot find package|ERR_MODULE_NOT_FOUND/);
  }
});

test('a healthy engine is untouched by the shim', (t) => {
  // The guard must cost nothing on the happy path.
  const dir = sandbox(t);
  const r = run(dir, 'validate.js', '--root', fixture, '--json');
  assert.equal(r.status, 0, r.stderr);
  assert.doesNotMatch(r.stderr, /internal failure/);
  assert.ok(JSON.parse(r.stdout), 'the shim forwards stdout untouched');
});
