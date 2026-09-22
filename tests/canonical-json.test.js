import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { canonicalSha256, CapturedInputError } from '../payload/engine/lib/canonical-json.js';

test('shared semantic digest hashes full canonical JSON without array normalization', () => {
  const expected = createHash('sha256').update('{"a":[2,1],"z":{"a":"é","b":true}}').digest('hex');
  const value = { z: { b: true, a: 'é' }, a: [2, 1] };
  assert.equal(canonicalSha256(value), expected);
  assert.equal(canonicalSha256({ a: [2, 1], z: { a: 'é', b: true } }), expected);
  assert.notEqual(canonicalSha256({ ...value, a: [1, 2] }), expected);
  assert.notEqual(canonicalSha256({ ...value, review: { decision: 'D-000001' } }), expected);
});

test('deliberate JSON rejections are typed while unexpected property failures propagate', () => {
  const cycle = {};
  cycle.self = cycle;
  for (const value of [undefined, NaN, Infinity, 1n, () => {}, new Map(), new Date(), cycle, [, 1]]) {
    assert.throws(() => canonicalSha256(value), (error) => {
      assert.ok(error instanceof TypeError);
      assert.ok(error instanceof CapturedInputError);
      assert.equal(error.name, 'CapturedInputError');
      assert.equal(error.code, 'invalid-captured-input');
      return true;
    });
  }
  const bug = new TypeError('unexpected property failure');
  assert.throws(() => canonicalSha256({ get value() { throw bug; } }), (error) => error === bug);
});
