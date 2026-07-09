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

test('K-170 wrong-pointer: no claimed value appears anywhere in the pointed file', () => {
  // The wrong-pointer signature is that ALL claimed values are missing from
  // the pointed file — lexically too: grep-level detectors (and the KK-25
  // pre-scan) work lexically, so even a doc comment naming a claimed value
  // would contaminate the signature.
  const { record } = model.concepts.get('K-170');
  for (const desc of record.enumerates) {
    const body = readFileSync(join(fixtureRoot, desc.source), 'utf8').toLowerCase();
    for (const value of desc.values) {
      assert.ok(
        !body.includes(String(value).toLowerCase()),
        `K-170 claimed value "${value}" must not appear lexically in ${desc.source}`,
      );
    }
  }
});

test('nothing shipped by init (payload/, cli/) references the acceptance fixtures (D-007)', () => {
  // KK-17's kit.manifest.yaml now exists and the CONSTRUCTIONAL guard lives
  // in cli/lib/copy-payload.js (loadManifest refuses any source outside
  // payload/ or under fixtures//tests/ — covered by tests/init-copy.test.js
  // and the A1 acceptance criterion). cli/ legitimately names the D-007
  // boundary and the seeded engine/tests/fixtures/<stack> targets, so the
  // lexical pin here is the part the copy engine can't check: no shippable
  // tree may reference the acceptance fixture APPS by any form, and
  // payload/ (which never needs the word) keeps the stricter fixtures/ grep.
  const walk = (dir, out = []) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p, out);
      else out.push(p);
    }
    return out;
  };
  for (const tree of ['payload', 'cli']) {
    for (const file of walk(join(root, tree))) {
      const text = readFileSync(file, 'utf8');
      assert.ok(
        !/\b(?:swift|ts)-app\b/.test(text),
        `${file} must not reference the acceptance fixture apps (D-007)`,
      );
      if (tree === 'payload') {
        assert.ok(
          !/\bfixtures\//.test(text),
          `${file} must not reference the acceptance fixtures (D-007)`,
        );
      }
    }
  }
});
