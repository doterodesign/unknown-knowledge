import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeInput } from './helpers/equivalent-merge-input-fixture.js';
import { equivalentMergeInputWire } from '../payload/engine/lib/subject-equivalent-merge-input.js';
import { decodePreparedEquivalentMerge, validMergeCaptureLimits } from '../payload/engine/lib/prepared-equivalent-merge.js';

test('merge capture transport keeps exact canonical bytes, digest inputs and detached evidence', () => {
  const input = mergeInput(); const wire = equivalentMergeInputWire(input);
  const decoded = decodePreparedEquivalentMerge(input.repoRoot, wire);
  assert.deepEqual(equivalentMergeInputWire(decoded), wire);
  decoded.evidence.decisionCaptures[0].bytes[0] ^= 1;
  assert.deepEqual(equivalentMergeInputWire(input), wire);
  assert.equal(validMergeCaptureLimits({ maxRegistryBytes: 1, maxEventBytes: 1 }), true);
  assert.equal(validMergeCaptureLimits({ maxRegistryBytes: 1, maxEventBytes: 0 }), false);
  assert.equal(validMergeCaptureLimits({ maxRegistryBytes: 1, maxEventBytes: 1, extra: true }), false);
});

for (const [message, change] of [
  ['invalid input wire', wire => { wire.extra = true; }],
  ['invalid capture capacity', wire => { delete wire.limits.governance.maxCaptureBytes; }],
  ['invalid capture wire', wire => { wire.evidence.decisionCaptures[0].bytesBase64 = '?'; }],
  ['capture decode capacity', wire => { wire.limits.governance.maxCaptureBytes = 0; }],
  ['owner input admission', wire => { wire.operation.action = 'retire'; }],
]) test(`merge decoder preserves original refusal: ${message}`, () => {
  const input = mergeInput(); const wire = equivalentMergeInputWire(input); change(wire);
  assert.throws(() => decodePreparedEquivalentMerge(input.repoRoot, wire),
    error => error.name === 'EngineRefusal' && error.message === `prepared equivalent merge: ${message}`);
});
