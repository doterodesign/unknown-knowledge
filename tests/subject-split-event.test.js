import test from 'node:test';
import assert from 'node:assert/strict';
import { assignmentEventFixture, sealAssignmentEvent } from './helpers/assignment-event-fixture.js';
import { validateAssignmentEventMetadata, assignmentEventProjection } from '../payload/engine/lib/assignment-event.js';
import { validateAssignmentHistoryChain } from '../payload/engine/lib/subject-history.js';

const namespace = '12345678-1234-4123-8123-123456789abc';
function fixture(ids = ['S-000004', 'S-000006']) {
  const value = assignmentEventFixture({ namespace, event: '45678901-2345-4678-89ab-123456789abc', rows: [
    { ref: { namespace, kind: 'ontology', id: 'O-000001' }, before: { state: 'known', ids: ['S-000002', 'S-000001', 'S-000003'] },
      after: { state: 'known', ids: ['S-000002', ...ids, 'S-000003'] }, 'before-revision': 0, 'after-revision': 1,
      disposition: 'changed', reason: 'Substitute the reviewed meanings at the original source position' },
  ] });
  return sealAssignmentEvent({ ...value, 'schema-version': 2, operation: 'subject-use-transition', scope: {
    kind: 'subject-use-transition', operation: '11111111-1111-4111-8111-111111111111', action: 'split', subject: 'S-000001',
    successors: ['S-000004', 'S-000005', 'S-000006'],
    'registry-events': ['22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333'],
  } });
}

for (const ids of [[], ['S-000005'], ['S-000004', 'S-000006']]) test(`split metadata retains a nonempty existing-owner history with ${ids.length} successor choices`, () => {
  const event = fixture(ids); const result = validateAssignmentEventMetadata(event);
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  const row = event.rows[0]; const history = validateAssignmentHistoryChain({ namespace,
    baselines: [{ ref: row.ref, state: row.before, capture: row['before-capture'] }], events: [assignmentEventProjection(event)] });
  assert.equal(history.ok, true, JSON.stringify(history));
  // The history reader compares membership as a set; the wire preserves authored order.
  assert.deepEqual(history.revisions[0].state, { state: 'known', ids: [...row.after.ids].sort() });
  assert.deepEqual(assignmentEventProjection(event).rows[0].after.ids, ['S-000002', ...ids, 'S-000003']);
});

for (const [name, edit] of [
  ['one successor', e => { e.scope.successors = ['S-000004']; }],
  ['duplicate successors', e => { e.scope.successors[1] = e.scope.successors[0]; }],
  ['source as successor', e => { e.scope.successors[0] = e.scope.subject; }],
  ['zero successor', e => { e.scope.successors[0] = 'S-000000'; }],
  ['one registry event', e => { e.scope['registry-events'].pop(); }],
  ['three registry events', e => { e.scope['registry-events'].push('44444444-4444-4444-8444-444444444444'); }],
  ['duplicate registry event', e => { e.scope['registry-events'][1] = e.scope['registry-events'][0]; }],
  ['empty rows', e => { e.rows = []; }],
  ['unchanged row', e => { e.rows[0].disposition = 'unchanged'; }],
  ['unknown before', e => { e.rows[0].before = { state: 'unknown', reason: 'absent' }; }],
  ['unknown after', e => { e.rows[0].after = { state: 'unknown', reason: 'absent' }; }],
  ['missing known IDs', e => { delete e.rows[0].after.ids; }],
  ['null birth', e => { Object.assign(e.rows[0], { before: null, 'before-capture': null, 'before-revision': null, 'after-revision': 0, disposition: 'created' }); }],
  ['foreign merge field', e => { e.scope.absorbed = ['S-000001']; }],
  ['wrong event version', e => { e['schema-version'] = 1; }],
]) test(`split metadata refuses ${name}`, () => {
  const event = fixture(); edit(event);
  assert.equal(validateAssignmentEventMetadata(sealAssignmentEvent(event)).ok, false);
});

test('multi-store split metadata requires qualified owner order without renormalizing the event', () => {
  const event = fixture(); const template = event.rows[0];
  event.rows = [['decision', 'D-000002'], ['knowledge', 'K-000001'], ['ontology', 'O-000001']]
    .map(([kind, id]) => ({ ...structuredClone(template), ref: { namespace, kind, id } }));
  assert.equal(validateAssignmentEventMetadata(sealAssignmentEvent(event)).ok, true);
  event.rows.reverse();
  const result = validateAssignmentEventMetadata(sealAssignmentEvent(event));
  assert.equal(result.ok, false);
  assert.ok(result.diagnostics.some(row => row.code === 'assignment-event-scope'));
});
