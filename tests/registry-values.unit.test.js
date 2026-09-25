import { test } from 'node:test';
import assert from 'node:assert/strict';
import { indexRegistryValues } from '../payload/engine/lib/registry-values.js';
import { canonicalSha256 } from '../payload/engine/lib/canonical-json.js';

const document = () => ({ 'schema-version': 2, registry: 'jurisdictions', store: 'knowledge', hierarchical: false,
  values: [{ value: 'eu', gloss: 'European context', warrant: 'Reviewed applicability', decision: 'D-000001' },
    { value: 'us', status: 'suppressed', warrant: 'Outside coverage', decision: 'D-000001' }] });

test('registry projection preserves absent-status minting and explicit suppression', () => {
  const doc = document();
  const result = indexRegistryValues(doc);
  assert.equal(result.ok, true);
  assert.deepEqual([...result.minted], ['eu']);
  assert.deepEqual([...result.suppressed], ['us']);
  assert.deepEqual(result.rows, [{ index: 0, entry: doc.values[0] }, { index: 1, entry: doc.values[1] }]);
  assert.deepEqual(result.diagnostics, []);
});

test('duplicate declarations refuse independent of matching or competing statuses', () => {
  for (const status of ['minted', 'suppressed']) {
    const doc = document();
    doc.values.push({ ...doc.values[0], status });
    const result = indexRegistryValues(doc);
    assert.equal(result.ok, false);
    assert.equal(result.diagnostics[0].code, 'duplicate-registry-value');
    assert.equal(result.diagnostics[0].path, 'values[2].value');
    assert.equal(result.rows.length, 2, 'diagnostic partial rows do not add a second authorizer');
  }
});

test('the real registry schema refuses malformed source documents before membership indexing', () => {
  for (const doc of [null, { ...document(), 'schema-version': 1 }, { ...document(), values: 'eu' },
    { ...document(), values: [{ ...document().values[0], status: 'maybe' }] }]) {
    const result = indexRegistryValues(doc);
    assert.equal(result.ok, false);
    assert.ok(result.diagnostics.length);
    assert.equal(result.minted.size, 0);
    assert.equal(result.rows.length, 0);
  }
});

test('membership derives from the same full document whose authored metadata is fingerprinted', () => {
  const doc = document();
  const original = canonicalSha256(doc);
  indexRegistryValues(doc).minted.clear();
  assert.equal(indexRegistryValues(doc).minted.has('eu'), true, 'projection mutation does not rewrite authority');
  doc.values[0].gloss = 'Changed context explanation';
  assert.notEqual(canonicalSha256(doc), original);
  assert.deepEqual([...indexRegistryValues(doc).minted], ['eu'], 'a metadata-only change still changes the authority digest');
});
