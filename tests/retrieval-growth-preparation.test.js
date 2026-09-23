import test from 'node:test';
import assert from 'node:assert/strict';
import { extendFixtureArray } from '../acceptance/retrieval/materialize-growth.js';

test('growth container insertion retains every existing row byte', () => {
  const original = { 'schema-version': 1, namespace: 'fixture', allocations: [
    { id: 'K-000001', publication: { review: 'old review with é and \\ escapes' } },
    { id: 'K-000004', state: 'retired', reason: 'retain occupied gap' },
  ] };
  const raw = Buffer.from(`${JSON.stringify(original, null, 2)}\n`);
  const rows = [{ id: 'K-000002', publication: { review: 'explicit synthetic setup' } }];
  const result = extendFixtureArray(raw, 'allocations', rows);
  assert.deepEqual(JSON.parse(result).allocations, [...original.allocations, ...rows]);
  const oldBody = raw.subarray(0, raw.length - Buffer.byteLength('\n  ]\n}\n'));
  assert(result.subarray(0, oldBody.length).equals(oldBody));
});

test('growth catalog preserves locators and appends separately rendered entries', () => {
  const original = { 'schema-version': 2, store: 'knowledge', entries: [{ id: 'K-000001', file: 'K-000001.md' }] };
  const raw = Buffer.from(`${JSON.stringify(original, null, 2)}\n`);
  assert.deepEqual(JSON.parse(extendFixtureArray(raw, 'entries', [{ id: 'K-000002', file: 'K-000002.md' }])),
    { ...original, entries: [...original.entries, { id: 'K-000002', file: 'K-000002.md' }] });
  assert.equal(raw.toString(), `${JSON.stringify(original, null, 2)}\n`);
});

test('unexpected container layout refuses rather than reserializing old content', () => {
  assert.throws(() => extendFixtureArray(Buffer.from('{"entries":[{"id":"K-000001"}]}'), 'entries', [{}]));
  const withTrailingField = Buffer.from(`${JSON.stringify({ entries: [{}], trailing: true }, null, 2)}\n`);
  assert.throws(() => extendFixtureArray(withTrailingField, 'entries', [{}]));
});
