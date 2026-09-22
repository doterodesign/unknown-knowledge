import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runAssignmentGate, runPreparedAssignmentGate } from '../payload/engine/lib/assignment-gate.js';
import { typedAssignmentFixture } from './helpers/typed-assignment-fixture.js';
const has = (result, code) => assert.ok(result.diagnostics.some((row) => row.code === code), JSON.stringify(result));

for (const kind of ['knowledge', 'ontology', 'decision']) test(`${kind}: actual v2 selected edits preserve history, unknown state and file siblings`, async (t) => {
  const f = typedAssignmentFixture(t, { kind, nested: kind === 'decision' });
  const staged = await runAssignmentGate(f.options);
  const result = await runPreparedAssignmentGate(f.prepared);
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(staged.ok, true, JSON.stringify(staged));
  assert.deepEqual(result.rows, staged.rows);
  assert.equal(result.scope.basis, 'reviewed-typed-existing-records');
  assert.deepEqual(result.rows[0].eligibility.candidate, { state: 'unknown', reason: 'absent' });
  assert.equal(result.checks.history.status, 'passed');
  assert.equal(result.publicationReady, false);
  assert.equal(result.checks.humanApproval.status, 'not-performed');
});

test('typed selection cannot be borrowed from event rows or changed to a different reviewed set', async (t) => {
  const f = typedAssignmentFixture(t);
  const { selection, ...missing } = f.prepared;
  has(await runPreparedAssignmentGate(missing), 'assignment-event-operation-mismatch');
  has(await runPreparedAssignmentGate({ ...f.prepared, selection: { ...selection, refs: selection.refs.slice(0, 1) } }), 'assignment-scope-mismatch');
  has(await runPreparedAssignmentGate({ ...f.prepared, selection: { ...selection, refs: [...selection.refs, selection.refs[0]] } }), 'invalid-assignment-gate-input');
});

test('captured unselected sibling formatting and original evidence metadata remain immutable', async (t) => {
  const f = typedAssignmentFixture(t, { kind: 'decision' });
  f.put(f.file, f.read(f.file).replace('"Original D-000004"', "'Original D-000004'"));
  has(await runPreparedAssignmentGate(f.save()), 'assignment-preservation-failed');
});

test('typed subject edits cannot authorize lifecycle, ledger, unrelated files or over-budget scope', async (t) => {
  const f = typedAssignmentFixture(t);
  has(await runPreparedAssignmentGate({ ...f.prepared, limits: { ...f.prepared.limits, maxRecords: 1 } }), 'assignment-record-budget');
  f.put('unrelated.txt', 'Not an assignment edit.');
  has(await runPreparedAssignmentGate(f.save()), 'assignment-unselected-path-changed');
});

test('newly assigned unavailable Subjects still refuse through actual candidate governance', async (t) => {
  const f = typedAssignmentFixture(t);
  f.put(f.file, f.read(f.file).replace('["S-000002"]', '["S-999999"]'));
  f.event.rows[1].after.ids = ['S-999999'];
  const result = await runPreparedAssignmentGate(f.save());
  assert.equal(result.ok, false);
  assert.ok(result.diagnostics.length);
});

test('withdrawal never authorizes a lifecycle transition or an identity-ledger change', async (t) => {
  const lifecycle = typedAssignmentFixture(t);
  lifecycle.put(lifecycle.file, lifecycle.read(lifecycle.file).replace('status: "active"', 'status: "draft"'));
  has(await runPreparedAssignmentGate(lifecycle.save()), 'assignment-target-not-effective');
  const ledger = typedAssignmentFixture(t);
  const identity = JSON.parse(ledger.read('_identity.yaml'));
  identity.allocations.push({ kind: 'ontology', id: 'O-999999', state: 'cancelled', reason: 'Outside authoring scope',
    publication: identity.allocations[0].publication });
  ledger.put('_identity.yaml', identity);
  has(await runPreparedAssignmentGate(ledger.save()), 'assignment-installation-changed');
});

test('typed authoring requires valid capacities for its fixed representative replay recipe', async (t) => {
  const f = typedAssignmentFixture(t);
  has(await runPreparedAssignmentGate({ ...f.prepared, impact: { required: ['representativeReplays'], representativeReplays: { limits: {}, queryBudgets: {} } } }),
    'assignment-required-impact-incomplete');
});

for (const operation of ['canonical-creation', 'subject-use-transition']) test(`existing-record gates refuse valid ${operation} history`, async (t) => {
  const f = typedAssignmentFixture(t);
  f.event.operation = operation;
  if (operation === 'canonical-creation') {
    for (const [i, row] of f.event.rows.entries()) {
      Object.assign(row, { before: null, 'before-capture': null, 'before-revision': null, 'after-revision': 0, disposition: 'created' });
      Object.assign(f.baseline.baselines[i], { state: row.after, capture: row['after-capture'], origin: { kind: 'creation', event: f.event.event } });
    }
  } else {
    f.event.scope = { kind: 'subject-use-transition', operation: '12345678-1234-4567-89ab-123456789abc',
      action: 'merge-equivalent', survivor: 'S-000002', absorbed: ['S-000001'],
      'registry-events': ['23456789-1234-4567-89ab-123456789abc'] };
  }
  const prepared = await runPreparedAssignmentGate(f.save());
  const staged = await runAssignmentGate(f.options);
  for (const result of [prepared, staged]) {
    assert.equal(result.checks.models.status, 'passed', JSON.stringify(result));
    has(result, 'assignment-event-operation-mismatch');
    assert.equal(result.publicationReady, false);
  }
});
