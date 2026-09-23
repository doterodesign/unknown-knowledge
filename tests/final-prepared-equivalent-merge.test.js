import assert from 'node:assert/strict';
import { test } from 'node:test';
import { finalEquivalentMergeFixture } from './helpers/final-equivalent-merge-fixture.js';
import { runFinalPreparedEquivalentMergeGate } from '../payload/engine/lib/final-prepared-equivalent-merge.js';

test('fresh equivalent merge final proof requires actual runtime capability and preserves the owner report', async (t) => {
  const f = await finalEquivalentMergeFixture(t);
  const result = await runFinalPreparedEquivalentMergeGate(f.input);
  assert.equal(result.status, 'passed', JSON.stringify(result));
  assert.deepEqual(result.gate, f.gate);
  assert.equal(result.gate.publicationReady, false);
  assert.equal(result.gate.impacts.routes.status, 'requires-final-capability');
  assert.equal((await runFinalPreparedEquivalentMergeGate({ ...f.input, approvedRuntimeProfile: null })).status, 'failed');
});
