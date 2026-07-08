// KK-14: the Swift acceptance fixture's knowledge store must stay loadable
// and schema-valid — the planted A2/A3 cases live in enumerates VALUES
// (drift vs. the Swift sources), never in store health: a fixture that
// fails to load would abort extraction before any drift check ran.
// Planted-case inventory: fixtures/swift-app/FIXTURE.md (KK-16 asserts it).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadStores } from '../payload/engine/lib/load-stores.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const fixtureRoot = join(root, 'fixtures', 'swift-app');
const model = loadStores(join(fixtureRoot, 'unknown-knowledge'));

test('the Swift fixture store loads with zero diagnostics', () => {
  assert.deepEqual(model.diagnostics, []);
  assert.equal(model.ok, true);
});

test('every planted concept K-110..K-180 is present and cataloged', () => {
  const expected = ['K-110', 'K-120', 'K-130', 'K-140', 'K-150', 'K-160', 'K-170', 'K-180'];
  assert.deepEqual([...model.concepts.keys()], expected);
  const cataloged = model.stores.ontology.catalog.entries.map((e) => e.id).sort();
  assert.deepEqual(cataloged, expected);
});

test('every source-of-truth pointer resolves to a real fixture file', () => {
  // The one deliberately unhealthy pointer case (K-170) is wrong-VALUES at a
  // real file — a dangling path would be a different finding (KK-05's), so
  // no pointer here may dangle.
  for (const [path, ids] of model.pointers) {
    assert.doesNotThrow(
      () => readFileSync(join(fixtureRoot, path)),
      `${ids.join(',')}: source-of-truth "${path}" must exist in the fixture`,
    );
  }
});

test('every enumerates descriptor names a listed source-of-truth entry (§3.5)', () => {
  for (const { id, record } of model.concepts.values()) {
    for (const desc of record.enumerates ?? []) {
      assert.ok(
        record['source-of-truth'].includes(desc.source),
        `${id}: descriptor source "${desc.source}" must be a listed source-of-truth entry`,
      );
    }
  }
});

test('nothing under fixtures/ is referenced by the payload (D-007)', () => {
  // No kit.manifest.yaml exists yet (KK-17); until it does, pin the invariant
  // lexically: the payload tree never mentions the acceptance fixtures.
  const walk = (dir, out = []) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p, out);
      else out.push(p);
    }
    return out;
  };
  for (const file of walk(join(root, 'payload'))) {
    assert.ok(
      !readFileSync(file, 'utf8').includes('fixtures/swift-app'),
      `${file} must not reference the acceptance fixture (D-007)`,
    );
  }
});
