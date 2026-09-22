import test from 'node:test';
import assert from 'node:assert/strict';
import { finalCreationFixture } from './helpers/prepared-creation-fixture.js';
import { runFinalPreparedSubjectCreationGate } from '../payload/engine/lib/final-prepared-subject-creation.js';

test('actual final creation reruns the fixed owner and equals the retained eventless proof', async t => {
  const f = await finalCreationFixture(t, { action: 'promote-proposal' });
  const result = await runFinalPreparedSubjectCreationGate(f.finalInput);
  assert.equal(result.status, 'passed', JSON.stringify(result.diagnostics));
  assert.equal(result.kind, 'final-prepared-subject-creation');
  assert.deepEqual(result.gate, f.gate);
  assert.equal(result.gate.assignments, null);
});
