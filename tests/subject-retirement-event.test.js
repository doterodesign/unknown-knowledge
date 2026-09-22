import test from 'node:test';
import assert from 'node:assert/strict';
import { assignmentEventFixture, sealAssignmentEvent } from './helpers/assignment-event-fixture.js';
import { validateAssignmentEventMetadata, assignmentEventProjection } from '../payload/engine/lib/assignment-event.js';
import { validateAssignmentHistoryChain } from '../payload/engine/lib/subject-history.js';

const namespace = '12345678-1234-4123-8123-123456789abc';
function fixture() {
  const value = assignmentEventFixture({ namespace, event: '45678901-2345-4678-89ab-123456789abc', rows: [
    { ref: { namespace, kind: 'knowledge', id: 'K-000001' }, before: { state: 'known', ids: ['S-000001'] },
      after: { state: 'known', ids: [] }, 'before-revision': 0, 'after-revision': 1,
      disposition: 'changed', reason: 'Withdraw the retired subject and preserve explicit empty classification.' },
  ] });
  return sealAssignmentEvent({ ...value, 'schema-version': 2, operation: 'subject-use-transition', scope: {
    kind: 'subject-use-transition', operation: '11111111-1111-4111-8111-111111111111', action: 'retire', subject: 'S-000001',
    'registry-events': ['22222222-2222-4222-8222-222222222222'],
  } });
}

test('retirement metadata uses its closed scope and the existing nonempty revision chain', () => {
  const event = fixture(); const result = validateAssignmentEventMetadata(event);
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  const row = event.rows[0];
  const history = validateAssignmentHistoryChain({ namespace,
    baselines: [{ ref: row.ref, state: row.before, capture: row['before-capture'] }], events: [assignmentEventProjection(event)] });
  assert.equal(history.ok, true, JSON.stringify(history));
  assert.deepEqual(history.revisions[0].state, { state: 'known', ids: [] });
});

for (const [name, change] of [
  ['merge fields', e => { e.scope.survivor = 'S-000002'; e.scope.absorbed = ['S-000001']; }],
  ['missing subject', e => { delete e.scope.subject; }],
  ['zero subject', e => { e.scope.subject = 'S-000000'; }],
  ['duplicate registry events', e => { e.scope['registry-events'].push(e.scope['registry-events'][0]); }],
  ['no registry events', e => { e.scope['registry-events'] = []; }],
  ['foreign action', e => { e.scope.action = 'split'; }],
  ['empty event', e => { e.rows = []; }],
  ['invented birth', e => { Object.assign(e.rows[0], { before: null, 'before-capture': null, 'before-revision': null,
    'after-revision': 0, disposition: 'created' }); }],
]) test(`retirement metadata refuses ${name}`, () => {
  const event = fixture(); change(event);
  assert.equal(validateAssignmentEventMetadata(sealAssignmentEvent(event)).ok, false);
});
