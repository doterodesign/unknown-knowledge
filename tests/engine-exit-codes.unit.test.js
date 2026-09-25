// Engine contract (PRD §5): exit codes are uniform across all engine modules.
// This is the scaffold's proving module — the first payload code exercised by
// the test harness. KK-04 (loader) and KK-05 (validator) build on it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EXIT_CODES } from '../payload/engine/lib/exit-codes.js';

test('exit-code contract: 0 clean, 1 findings, 2 engine failure', () => {
  assert.equal(EXIT_CODES.CLEAN, 0);
  assert.equal(EXIT_CODES.FINDINGS, 1);
  assert.equal(EXIT_CODES.FAILURE, 2);
});

test('the contract is frozen — no module may redefine what a pass means', () => {
  assert.ok(Object.isFrozen(EXIT_CODES));
});
