// UCS-939: Store health has one authority.
//
// The engine's load-bearing promise is that the validator, the reverse audit
// and preflight can never disagree about a Store. Today that holds only
// because six sites happen to filter `model.diagnostics` by severity the same
// way — the helper meant to guarantee it reports counts, which is not what any
// of them need, so they walk around it.
//
// `storeDiagnostics` is the widened seam. These tests pin it directly: it was
// previously exercised only transitively, through spawned command-line tests,
// despite being the invariant itself.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { loadStores, storeDiagnostics, storeHealth } from '../payload/engine/lib/load-stores.js';

const fixture = (name) => fileURLToPath(new URL(`fixtures/${name}`, import.meta.url));

/** A store with error-severity Diagnostics (duplicate ids) plus warnings. */
const unhealthy = () => loadStores(fixture('loader/duplicate-id'));
/** A store that loads with warnings only (two stores absent). */
const warned = () => loadStores(fixture('resolver/on-disk'));
/** A store with all three stores present and nothing to report. */
const clean = () => loadStores(fixture('resolver/store'));

// --------------------------------------------------------- the three states

test('a store with errors: the Diagnostics themselves, and ok is false', () => {
  const h = storeDiagnostics(unhealthy());
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
  const h = storeDiagnostics(warned());
  assert.equal(h.ok, true, 'loader warnings do not block');
  assert.equal(h.errorCount, 0);
  assert.deepEqual(h.errors, []);
  assert.ok(h.warningCount > 0);
  assert.equal(h.warnings.length, h.warningCount);
  for (const d of h.warnings) assert.equal(d.severity, 'warning');
});

test('a clean store: ok, and nothing to report in either bucket', () => {
  const h = storeDiagnostics(clean());
  assert.deepEqual(h, { ok: true, errors: [], warnings: [], errorCount: 0, warningCount: 0 });
});

// ------------------------------------------- derived from the single model

test('every Diagnostic lands in exactly one bucket — none is invented or dropped', () => {
  for (const model of [unhealthy(), warned(), clean()]) {
    const h = storeDiagnostics(model);
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
    assert.equal(storeDiagnostics(model).ok, model.ok);
  }
});

// ------------------------------------- the widened form agrees with the old
//
// Both forms coexist until UCS-951 deletes the counts-only one. While they do,
// they must never disagree — that would be the very drift this refactor ends.

test('the counts-only form and the widened form report the same health', () => {
  for (const model of [unhealthy(), warned(), clean()]) {
    const narrow = storeHealth(model);
    const wide = storeDiagnostics(model);
    assert.equal(narrow.ok, wide.ok);
    assert.equal(narrow.errors, wide.errorCount);
    assert.equal(narrow.warnings, wide.warningCount);
  }
});

test('the widened form is what the six hand-filters were computing by hand', () => {
  // Pins the migration target: UCS-945 replaces each open-coded filter with
  // this call, and the results must be identical.
  for (const model of [unhealthy(), warned(), clean()]) {
    const wide = storeDiagnostics(model);
    assert.deepEqual(wide.errors, model.diagnostics.filter((d) => d.severity === 'error'));
    assert.deepEqual(wide.warnings, model.diagnostics.filter((d) => d.severity === 'warning'));
  }
});
