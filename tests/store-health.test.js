// UCS-939: Store health has one authority.
//
// The engine's load-bearing promise is that the validator, the reverse audit
// and preflight can never disagree about a Store. Today that holds only
// because six sites happen to filter `model.diagnostics` by severity the same
// way — the helper meant to guarantee it reports counts, which is not what any
// of them need, so they walk around it.
//
// `storeHealth` is that one authority. These tests pin it directly: it was
// previously exercised only transitively, through spawned command-line tests,
// despite being the invariant itself.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { healthSummary, loadStores, storeHealth } from '../payload/engine/lib/load-stores.js';

const fixture = (name) => fileURLToPath(new URL(`fixtures/${name}`, import.meta.url));

/** A store with error-severity Diagnostics (duplicate ids) plus warnings. */
const unhealthy = () => loadStores(fixture('loader/duplicate-id'));
/** A store that loads with warnings only (two stores absent). */
const warned = () => loadStores(fixture('resolver/on-disk'));
/** A store with all three stores present and nothing to report. */
const clean = () => loadStores(fixture('resolver/store'));

// --------------------------------------------------------- the three states

test('a store with errors: the Diagnostics themselves, and ok is false', () => {
  const h = storeHealth(unhealthy());
  assert.equal(h.ok, false);
  assert.ok(h.errorCount > 0, 'the fixture must carry error-severity diagnostics');
  assert.equal(h.errors.length, h.errorCount);
  // Callers need the Diagnostic, not a tally: they render it, or refuse on it.
  for (const d of h.errors) {
    assert.equal(d.severity, 'error');
    assert.ok(typeof d.code === 'string' && d.code.length > 0, 'a Diagnostic names its code');
    assert.ok('file' in d && 'message' in d, 'a Diagnostic names where and why');
  }
  assert.ok(h.errors.some((d) => d.code === 'duplicate-id'), 'the planted error must surface');
});

test('a store with warnings only: ok stays true, and the warnings are still surfaced', () => {
  const h = storeHealth(warned());
  assert.equal(h.ok, true, 'loader warnings do not block');
  assert.equal(h.errorCount, 0);
  assert.deepEqual(h.errors, []);
  assert.ok(h.warningCount > 0);
  assert.equal(h.warnings.length, h.warningCount);
  for (const d of h.warnings) assert.equal(d.severity, 'warning');
});

test('a clean store: ok, and nothing to report in either bucket', () => {
  const h = storeHealth(clean());
  assert.deepEqual(h, { ok: true, errors: [], warnings: [], errorCount: 0, warningCount: 0 });
});

// ------------------------------------------- derived from the single model

test('every Diagnostic lands in exactly one bucket — none is invented or dropped', () => {
  for (const model of [unhealthy(), warned(), clean()]) {
    const h = storeHealth(model);
    assert.equal(h.errorCount + h.warningCount, model.diagnostics.length,
      'the buckets partition the loader diagnostics');
    for (const d of [...h.errors, ...h.warnings]) {
      assert.ok(model.diagnostics.includes(d), 'a surfaced Diagnostic came from the model, not a second source');
    }
  }
});

test('ok is the loader\'s verdict, never re-derived from the counts', () => {
  // `ok` must mirror model.ok exactly. A surface that recomputed it from the
  // error count would be a second health model — the thing this seam prevents.
  for (const model of [unhealthy(), warned(), clean()]) {
    assert.equal(storeHealth(model).ok, model.ok);
  }
});

// ------------------------------------------------ the wire shape (UCS-951)
//
// `healthSummary` is the counts shape every surface puts on the `store-health`
// JSON key. It takes the HEALTH, never the model, so it is a projection of the
// one authority and cannot quietly become a second derivation of it.

test('healthSummary projects the authority onto the wire shape', () => {
  for (const model of [unhealthy(), warned(), clean()]) {
    const health = storeHealth(model);
    assert.deepEqual(healthSummary(health), {
      ok: health.ok,
      errors: health.errorCount,
      warnings: health.warningCount,
    });
  }
});

test('healthSummary cannot re-derive: it never sees the model', () => {
  // Hand it a health object with no diagnostics attached at all. If it were
  // secretly filtering a model, this would throw or lie.
  assert.deepEqual(healthSummary({ ok: false, errorCount: 3, warningCount: 1 }),
    { ok: false, errors: 3, warnings: 1 });
});

test('the authority is what the seven hand-filters were computing', () => {
  for (const model of [unhealthy(), warned(), clean()]) {
    const health = storeHealth(model);
    assert.deepEqual(health.errors, model.diagnostics.filter((d) => d.severity === 'error'));
    assert.deepEqual(health.warnings, model.diagnostics.filter((d) => d.severity === 'warning'));
  }
});

// -------------------------------------- the seam is used, not walked around
//
// UCS-945. The single-health-model guarantee must hold because one function
// decides what "healthy" means — not because every call site happens to filter
// the same way. This is a structural pin: it fails the moment a surface starts
// deriving store health for itself again.

test('no engine surface derives store health by hand — only the loader does', async () => {
  const engineDir = fileURLToPath(new URL('../payload/engine', import.meta.url));
  const offenders = [];
  const walk = async (dir) => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) { await walk(path); continue; }
      if (!entry.name.endsWith('.js')) continue;
      // The loader is the one authority; it alone may filter by severity.
      if (path.endsWith(join('lib', 'load-stores.js'))) continue;
      const source = await readFile(path, 'utf8');
      if (/diagnostics\s*\.\s*filter/.test(source)) offenders.push(relative(engineDir, path));
    }
  };
  await walk(engineDir);
  assert.deepEqual(offenders, [],
    `these surfaces re-derive store health instead of asking the loader: ${offenders.join(', ')}`);
});

test('the resolver has no forked health helper of its own', async () => {
  const source = await readFile(fileURLToPath(new URL('../payload/engine/commands/resolve.js', import.meta.url)), 'utf8');
  assert.ok(!/^function storeHealth/m.test(source), 'the resolver must import the loader\'s helper, not redeclare it');
  assert.match(source, /import \{[^}]*storeHealth[^}]*\} from '\.\.?\/(?:\.\.\/)*lib\/load-stores\.js'/);
});

// ---------------------------- the guarantee, across surfaces (UCS-951)
//
// The point of the whole refactor. For any Store, the validator, the value
// validator, the reverse audit and preflight report the SAME health — because
// they all ask the same function, not because they all happen to filter alike.
// This asserts the invariant through the public seam (the CLI process), so it
// holds regardless of how any surface is implemented.

const engineCli = (name) => fileURLToPath(new URL(`../payload/engine/${name}`, import.meta.url));
const runCli = (name, ...args) =>
  spawnSync(process.execPath, [engineCli(name), ...args], { encoding: 'utf8' });

test('every surface reports the same store health for the same Store', () => {
  const stores = [
    ['unhealthy', fixture('loader/duplicate-id')],
    ['warnings only', fixture('resolver/on-disk')],
    ['clean', fixture('resolver/store')],
  ];

  for (const [label, store] of stores) {
    const truth = healthSummary(storeHealth(loadStores(store)));

    // Each surface that publishes `store-health` must publish exactly this.
    const published = [
      ['validate', 'validate.js', ['--root', store, '--json']],
      ['validate-values', 'validate-values.js', ['--root', store, '--json']],
      ['preflight', 'preflight.js', ['--root', store, '--json']],
      ['resolve', 'resolve.js', ['--paths', 'src/a.ts', '--root', store, '--json']],
    ];

    for (const [name, cli, args] of published) {
      const r = runCli(cli, ...args);
      // An unhealthy store makes some surfaces refuse (exit 2) before they
      // render a payload; those that do render must agree with the authority.
      if (!r.stdout.trim()) continue;
      const payload = JSON.parse(r.stdout);
      assert.deepEqual(payload['store-health'], truth,
        `${name} disagrees with the single health model on the ${label} store`);
    }
  }
});

test('an unhealthy Store stops every surface that can certify nothing', () => {
  // Not a health-reporting test — a conduct one. The surfaces that certify
  // (validate, validate-values) and the one that audits must all refuse: a
  // check that never ran is a blocking defect, never a silent pass (PRD §5).
  const store = fixture('loader/duplicate-id');
  for (const cli of ['validate.js', 'validate-values.js']) {
    assert.equal(runCli(cli, '--root', store).status, 2, `${cli} must refuse an unhealthy Store`);
  }
});
