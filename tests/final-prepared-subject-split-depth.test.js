import test from 'node:test';
import assert from 'node:assert/strict';
import { finalSubjectSplitFixture, splitEvidenceVariant } from './helpers/final-subject-split-fixture.js';
import { runFinalPreparedSubjectSplitGate } from '../payload/engine/lib/final-prepared-subject-split.js';

test('deep retained split JSON refuses without a native encoding exception', async t => {
  const f = await finalSubjectSplitFixture(t, { zero: true });
  assert.equal(f.gate.ok, true, JSON.stringify(f.gate.diagnostics));
  const control = await runFinalPreparedSubjectSplitGate(f.input);
  assert.equal(control.status, 'passed', JSON.stringify(control));
  const deep = Buffer.from('['.repeat(12000) + 'null' + ']'.repeat(12000));
  for (const name of ['input.json', 'capture-limits.json']) await t.test(name, async () => {
    const input = splitEvidenceVariant(f, artifacts => {
      artifacts.find(row => row.file === `checks/operation/${name}`).bytes = deep;
    });
    const result = await runFinalPreparedSubjectSplitGate(input);
    assert.equal(result.status, 'failed');
    assert.ok(result.diagnostics.length > 0);
  });
});
