import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runAssignmentGate, runPreparedAssignmentGate } from '../payload/engine/lib/assignment-gate.js';
import { assignmentGateFixture } from './helpers/assignment-gate-fixture.js';
import { describeCandidateBytes } from '../payload/engine/lib/captured-source.js';

function prepare(t, options, edit) {
  const f = assignmentGateFixture(t, options);
  edit?.(f);
  const tree = f.git('write-tree');
  const commit = f.git('commit-tree', tree, '-p', f.commit, '-m', 'Immutable prepared fixture');
  const kitPath = f.event['before-input']['kit-path'];
  return { ...f, prepared: { ...f.options, before: { commit: f.commit, tree: f.tree, kitPath }, candidate: { commit, tree, kitPath } } };
}
const code = (result, expected) => assert.ok(result.diagnostics.some(({ code }) => code === expected), JSON.stringify(result));

test('a real prepared commit shares the staged gate domain results and verifies its own membership', async (t) => {
  const f = prepare(t);
  const staged = await runAssignmentGate(f.options);
  const prepared = await runPreparedAssignmentGate(f.prepared);
  assert.equal(staged.ok, true, JSON.stringify(staged));
  assert.equal(prepared.ok, true, JSON.stringify(prepared));
  assert.deepEqual(prepared.scope, staged.scope);
  assert.deepEqual(prepared.rows, staged.rows);
  assert.equal(prepared.inputs.candidate.kind, 'commit');
  assert.equal(prepared.inputs.candidate.commit, f.prepared.candidate.commit);
  assert.equal(prepared.checks.candidateCommitMembership.status, 'passed');
  assert.equal(staged.checks.candidateCommitMembership.status, 'not-performed');
  assert.equal(prepared.checks.humanApproval.status, 'not-performed');
  assert.equal(prepared.publicationReady, false);
});

test('each commit and supplied tree are independently verified against actual objects', async (t) => {
  const f = prepare(t);
  for (const side of ['before', 'candidate']) {
    const input = { ...f.prepared, [side]: { ...f.prepared[side], tree: f.prepared[side === 'before' ? 'candidate' : 'before'].tree } };
    const result = await runPreparedAssignmentGate(input);
    code(result, 'assignment-snapshot-unavailable');
    assert.equal(result.checks.candidateCommitMembership.status, 'not-performed');
  }
  for (const commit of [f.prepared.candidate.tree, '0'.repeat(f.prepared.candidate.commit.length)]) {
    code(await runPreparedAssignmentGate({ ...f.prepared, candidate: { ...f.prepared.candidate, commit } }), 'assignment-snapshot-unavailable');
  }
});

test('both requested kit paths must match their own actual materialized layout', async (t) => {
  const f = prepare(t, { nested: true });
  for (const side of ['before', 'candidate']) {
    const result = await runPreparedAssignmentGate({ ...f.prepared, [side]: { ...f.prepared[side], kitPath: '.' } });
    code(result, 'assignment-kit-path-mismatch');
    assert.equal(result.diagnostics[0].side, side);
  }
});

test('caller roots, models and tree-only assertions cannot replace prepared provenance', async (t) => {
  const f = prepare(t);
  for (const input of [
    { ...f.prepared, model: f.beforeModel },
    { ...f.prepared, candidate: { ...f.prepared.candidate, root: f.root } },
    { ...f.prepared, candidate: { kind: 'tree', tree: f.prepared.candidate.tree, kitPath: '.' } },
  ]) code(await runPreparedAssignmentGate(input), 'invalid-assignment-gate-input');
});

test('the actual complete prepared tree diff refuses an unrelated committed path', async (t) => {
  const f = prepare(t, {}, (f) => { f.put('unrelated.txt', 'Outside the assignment operation.'); f.git('add', '.'); });
  code(await runPreparedAssignmentGate(f.prepared), 'assignment-unselected-path-changed');
});

test('a real committed after capture still cannot authorize changed evidence body bytes', async (t) => {
  const f = prepare(t, {}, (f) => {
    const file = f.event.rows[0]['after-capture'].file;
    f.put(file, f.read(file).replace('Retained body', 'Altered evidence'));
    f.event.rows[0]['after-capture'] = describeCandidateBytes({ file, bytes: Buffer.from(f.read(file)), objectFormat: f.prior.objectFormat });
    f.save();
  });
  code(await runPreparedAssignmentGate(f.prepared), 'assignment-preservation-failed');
});

test('prepared provenance does not waive shared required impact or capture budgets', async (t) => {
  const f = prepare(t);
  code(await runPreparedAssignmentGate({ ...f.prepared, impact: { required: ['representativeReplays'] } }), 'assignment-required-impact-incomplete');
  code(await runPreparedAssignmentGate({ ...f.prepared, limits: { ...f.prepared.limits, maxCaptureBytes: 0 } }), 'assignment-byte-budget');
});

test('prepared snapshot layout errors contain stable side labels instead of temporary tree paths', async (t) => {
  const f = prepare(t, {}, (f) => { f.put('unknown-knowledge/_identity.yaml', f.beforeModel.identity); f.git('add', '.'); });
  const a = await runPreparedAssignmentGate(f.prepared); const b = await runPreparedAssignmentGate(f.prepared);
  code(a, 'assignment-snapshot-unavailable');
  assert.deepEqual(a, b);
  assert.doesNotMatch(JSON.stringify(a), /unknown-knowledge-tree-/);
});

test('prepared evaluation ignores later HEAD, staged and worktree drift without modifying them', async (t) => {
  const f = prepare(t, { nested: true });
  f.put('user-note.txt', 'Later committed user work.\n'); f.git('add', '.'); f.git('commit', '-qm', 'Later user HEAD');
  f.put('user-note.txt', 'Later staged user work.\n'); f.git('add', '.');
  f.put('user-note.txt', 'Later unstaged user work.\n');
  const head = f.git('rev-parse', 'HEAD'); const index = readFileSync(join(f.root, '.git/index'));
  const bytes = readFileSync(join(f.kitRoot, 'user-note.txt'));
  const result = await runPreparedAssignmentGate(f.prepared);
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.inputs.before.commit, f.commit);
  assert.equal(result.inputs.candidate.kitPath, 'unknown-knowledge');
  assert.equal(f.git('rev-parse', 'HEAD'), head);
  assert.deepEqual(readFileSync(join(f.root, '.git/index')), index);
  assert.deepEqual(readFileSync(join(f.kitRoot, 'user-note.txt')), bytes);
});
