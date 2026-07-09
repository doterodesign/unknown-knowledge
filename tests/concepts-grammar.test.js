// UCS-935: `--concepts` means one thing, everywhere.
//
// The structural validator and preflight normalized the flag (trim, drop
// empties, de-duplicate, stable sort) with byte-identical code in two places.
// The value validator only dropped empties. So the same argument, against the
// same Store, produced contradictory outcomes: `--concepts " K-101 "` passed
// the structural gate and hard-errored the value gate as "a check that never
// ran". A CI pipeline that padded its arguments got a clean pass from one
// gate and a blocking defect from the other.
//
// The grammar now lives in one place. These tests pin AGREEMENT across the
// surfaces rather than each surface's spelling of it, so a future edit cannot
// reintroduce the drift without turning this suite red.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeConceptIds } from '../payload/engine/lib/load-stores.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const tsApp = join(root, 'fixtures', 'ts-app');
const engine = (name) => join(root, 'payload', 'engine', name);

/** Every surface that takes `--concepts`. */
const SURFACES = ['validate.js', 'validate-values.js', 'preflight.js'];

const run = (cli, ...args) =>
  spawnSync(process.execPath, [engine(cli), '--root', tsApp, ...args], { encoding: 'utf8' });

// ------------------------------------------------------- the grammar itself

test('the grammar trims, drops empties, de-duplicates, and sorts stably', () => {
  assert.deepEqual(normalizeConceptIds([' K-101 ', 'K-101', '', '  ', 'K-100']), ['K-100', 'K-101']);
  assert.deepEqual(normalizeConceptIds([]), []);
  assert.deepEqual(normalizeConceptIds(['  ']), []);
  // Stable: the same input always yields the same order.
  assert.deepEqual(normalizeConceptIds(['K-103', 'K-101']), normalizeConceptIds(['K-101', 'K-103']));
});

// ------------------------------------- the surfaces agree on the same table
//
// K-101 is a clean, active concept in the TS fixture, so every surface should
// treat these spellings of it identically. The exit code is the contract.

const SPELLINGS = [
  ['bare', 'K-101'],
  ['padded', ' K-101 '],
  ['duplicated', 'K-101,K-101'],
  ['padded and duplicated', ' K-101 , K-101'],
  ['with an empty member', 'K-101,'],
];

for (const [label, value] of SPELLINGS) {
  test(`every surface reads ${label} (${JSON.stringify(value)}) the same way`, () => {
    const exits = SURFACES.map((cli) => [cli, run(cli, '--concepts', value).status]);
    const bare = SURFACES.map((cli) => run(cli, '--concepts', 'K-101').status);
    for (const [i, [cli, status]] of exits.entries()) {
      assert.equal(status, bare[i], `${cli}: ${label} must behave exactly like the bare id`);
      assert.notEqual(status, 2, `${cli}: ${label} must not read as a check that never ran`);
    }
  });
}

test('a duplicated id is checked once, not twice', () => {
  const once = JSON.parse(run('validate-values.js', '--concepts', 'K-101', '--json').stdout);
  const twice = JSON.parse(run('validate-values.js', '--concepts', 'K-101,K-101', '--json').stdout);
  assert.deepEqual(twice.checked, once.checked, 'a duplicate must not double the work');
  assert.equal(twice.checked.length, 1);
});

// --------------------------------------- what the grammar must NOT swallow

test('an id that does not exist still hard-errors on every surface', () => {
  // The grammar is permissive about spelling, never about truth: a filter on
  // a typo is a check that never ran, which is a blocking defect (PRD §5).
  for (const cli of SURFACES) {
    const r = run(cli, '--concepts', 'K-999');
    assert.equal(r.status, 2, `${cli} must refuse an unknown id`);
    assert.match(r.stderr, /K-999/);
  }
});

test('padding cannot smuggle an unknown id past any surface', () => {
  for (const cli of SURFACES) {
    assert.equal(run(cli, '--concepts', '  K-999  ').status, 2, `${cli} must refuse a padded unknown id`);
  }
});

// ------------------------------------ shared grammar, per-surface policy
//
// Whether an EMPTY list is an error belongs to the caller, not the grammar.

test('an empty list: the validators refuse it, preflight reads it as store-health-only', () => {
  for (const cli of ['validate.js', 'validate-values.js']) {
    const r = run(cli, '--concepts=');
    assert.equal(r.status, 2, `${cli}: a filter that names nothing never ran`);
    assert.match(r.stderr, /must name at least one concept id/);
  }
  // PRD §7: preflight validates store health alone and exits on that verdict.
  assert.equal(run('preflight.js', '--concepts=').status, 0);
});

test('a list of only whitespace is empty, not a concept named " "', () => {
  assert.equal(run('validate.js', '--concepts', '  ,  ').status, 2);
  assert.equal(run('validate-values.js', '--concepts', '  ,  ').status, 2);
  assert.equal(run('preflight.js', '--concepts', '  ,  ').status, 0);
});
