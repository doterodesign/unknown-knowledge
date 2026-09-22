import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assignmentGateFixture } from './helpers/assignment-gate-fixture.js';
import { runAssignmentGate, runPreparedAssignmentGate } from '../payload/engine/lib/assignment-gate.js';
import { assignmentEventDigest } from '../payload/engine/lib/assignment-event.js';

function prepared(t) {
  const f = assignmentGateFixture(t, { nested: true });
  const tree = f.git('write-tree');
  const commit = f.git('commit-tree', tree, '-p', f.commit, '-m', 'Prepared event source');
  const candidate = { commit, tree, kitPath: 'unknown-knowledge' };
  return { ...f, candidate, input: { ...f.options,
    before: { commit: f.commit, tree: f.tree, kitPath: 'unknown-knowledge' }, candidate } };
}

test('prepared gate identifies its actual selected event while staged mode makes no committed event claim', async (t) => {
  const f = prepared(t);
  const result = await runPreparedAssignmentGate(f.input);
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  assert.deepEqual(result.eventSource, { file: `unknown-knowledge/subjects/_assignments/${f.event.event}.yaml`,
    eventId: f.event.event, eventDigest: assignmentEventDigest(f.event), candidate: f.candidate });
  assert.equal(Object.hasOwn(result.eventSource, 'capture'), false);
  assert.equal((await runAssignmentGate(f.options)).eventSource, null);
});

test('source identity requires passed source/history and does not imply later impact success', async (t) => {
  const f = prepared(t);
  const beforeFailure = await runPreparedAssignmentGate({ ...f.input,
    candidate: { ...f.candidate, tree: f.tree } });
  assert.equal(beforeFailure.ok, false);
  assert.equal(beforeFailure.eventSource, null);
  const laterFailure = await runPreparedAssignmentGate({ ...f.input, impact: { required: ['representativeReplays'] } });
  assert.equal(laterFailure.ok, false);
  assert.equal(laterFailure.checks.history.status, 'passed');
  assert.equal(laterFailure.checks.impactPolicy.status, 'failed');
  assert.equal(laterFailure.eventSource.eventId, f.event.event);
  assert.equal(laterFailure.publicationReady, false);
});
