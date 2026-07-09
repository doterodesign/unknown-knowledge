// KK-15: the TS/JS acceptance fixture's knowledge store must stay loadable
// and schema-valid — the planted A2/A3 cases live in enumerates VALUES
// (drift vs. the TS/JS sources), never in store health: a fixture that
// fails to load would abort extraction before any drift check ran.
// Planted-case inventory: fixtures/ts-app/FIXTURE.md (KK-16 asserts it).
// (The D-007 payload/cli guard lives in fixture-swift-store.test.js and is
// fixture-agnostic — it covers this fixture too.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadStores } from '../payload/engine/lib/load-stores.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const fixtureRoot = join(root, 'fixtures', 'ts-app');
const model = loadStores(join(fixtureRoot, 'unknown-knowledge'));

test('the TS fixture store loads with zero diagnostics', () => {
  assert.deepEqual(model.diagnostics, []);
  assert.equal(model.ok, true);
});

test('every planted concept K-101..K-116 is present and cataloged', () => {
  // K-111 (dir-modules pattern/strip) landed with KK-10, which ratified the
  // pattern/strip descriptor options in the ontology-concept schema.
  const expected = [
    'K-101', 'K-102', 'K-103', 'K-104', 'K-105', 'K-106', 'K-107', 'K-108',
    'K-109', 'K-110', 'K-111', 'K-112', 'K-113', 'K-114', 'K-115', 'K-116',
  ];
  assert.deepEqual([...model.concepts.keys()], expected);
  const cataloged = model.stores.ontology.catalog.entries.map((e) => e.id).sort();
  assert.deepEqual(cataloged, expected);
});

test('every source-of-truth pointer resolves to a real fixture path', () => {
  // Pointers are relative to the fixture repo root (fixtures/ts-app/), not
  // the store root — a real post-init repo nests unknown-knowledge/ inside
  // the codebase its pointers describe. K-110's folder-identity pointer
  // (§3.1) is a directory, so this is an existence check, not a read. The
  // deliberately unhealthy pointer case (K-108) is wrong-VALUES at a real
  // file — a dangling path would be a different finding (KK-05's), so no
  // pointer here may dangle.
  for (const [path, ids] of model.pointers) {
    assert.ok(
      statSync(join(fixtureRoot, path), { throwIfNoEntry: false }) !== undefined,
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

test('K-108 wrong-pointer: no claimed value appears anywhere in the pointed file', () => {
  // The wrong-pointer signature is that ALL claimed values are missing from
  // the pointed file — lexically too: grep-level detectors (and the KK-25
  // pre-scan) work lexically, so even a doc comment naming a claimed value
  // would contaminate the signature.
  const { record } = model.concepts.get('K-108');
  for (const desc of record.enumerates) {
    const body = readFileSync(join(fixtureRoot, desc.source), 'utf8').toLowerCase();
    for (const value of desc.values) {
      assert.ok(
        !body.includes(String(value).toLowerCase()),
        `K-108 claimed value "${value}" must not appear lexically in ${desc.source}`,
      );
    }
  }
});

test("K-102 drift: the claimed-but-absent value never appears lexically in the source", () => {
  // K-102 claims one extra market type that the anchored file lacks. The
  // value-not-in-source signature must hold at grep level: if the source
  // file named the value even in a comment, lexical detectors would see it
  // as present and report a false all-clear.
  const { record } = model.concepts.get('K-102');
  const [desc] = record.enumerates;
  const body = readFileSync(join(fixtureRoot, desc.source), 'utf8').toLowerCase();
  assert.ok(desc.values.includes('futures'), 'K-102 must still claim the planted drift value');
  assert.ok(
    !body.includes('futures'),
    `the planted drift value must not appear lexically in ${desc.source}`,
  );
});
