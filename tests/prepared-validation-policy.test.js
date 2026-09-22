import assert from 'node:assert/strict';
import { test } from 'node:test';
import { preparedOperationEntrypoint } from '../payload/engine/lib/prepared-validation-policy.js';
test('fixed operation lookup rejects nonstrings without invoking caller coercion', () => {
  const unexpected = () => { throw new Error('caller coercion executed'); };
  for (const operation of [null, undefined, 1, true, Symbol('operation'), {},
    { toString: unexpected }, { [Symbol.toPrimitive]: unexpected }, ['subject-equivalent-merge']]) {
    assert.equal(preparedOperationEntrypoint(operation), null);
  }
  assert.equal(preparedOperationEntrypoint('subject-equivalent-merge').path, 'engine/lib/prepared-equivalent-merge-check.js');
  assert.equal(preparedOperationEntrypoint('toString'), null);
});
