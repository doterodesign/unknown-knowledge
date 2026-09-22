import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assignmentEventFixture, sealAssignmentEvent } from './helpers/assignment-event-fixture.js';
import { validateAssignmentEventMetadata, assignmentEventProjection } from '../payload/engine/lib/assignment-event.js';
import { validateAssignmentHistoryChain } from '../payload/engine/lib/subject-history.js';

const namespace = '12345678-1234-4123-8123-123456789abc';
const ref = (kind = 'ontology', id = 'O-000001') => ({ namespace, kind, id });
const unknown = { state: 'unknown', reason: 'absent' };
const known = { state: 'known', ids: ['S-000001'] };
function event() {
  const value = assignmentEventFixture({ namespace, event: '45678901-2345-4678-89ab-123456789abc', rows: [
    { ref: ref(), before: known, after: unknown, 'before-revision': 0, 'after-revision': 1,
      disposition: 'changed', reason: 'Withdraw unsupported classification; aboutness remains unknown.' },
  ] });
  return sealAssignmentEvent({ ...value, 'schema-version': 2, operation: 'existing-subjects',
    scope: { kind: 'typed-records', refs: [ref()] } });
}

test('v2 typed existing-record withdrawal preserves version, operation and unknown through the real chain', () => {
  const value = event();
  assert.equal(validateAssignmentEventMetadata(value).ok, true);
  const projection = assignmentEventProjection(value);
  assert.equal(projection['schema-version'], 2);
  assert.equal(projection.operation, 'existing-subjects');
  const result = validateAssignmentHistoryChain({ namespace,
    baselines: [{ ref: ref(), state: known, capture: value.rows[0]['before-capture'] }], events: [projection] });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.deepEqual(result.revisions, [{ ref: ref(), revision: 1, state: { state: 'unknown' } }]);
});

test('typed scope is a nonempty exact unique qualified row set, not an untyped ID list', () => {
  for (const refs of [[], [ref(), ref()], [ref('decision', 'D-000001')], [{ ...ref(), namespace: '11111111-1111-4111-8111-111111111111' }],
    [{ ...ref(), kind: 'knowledge' }], [{ ...ref(), extra: true }]]) {
    const value = event(); value.scope.refs = refs;
    assert.equal(validateAssignmentEventMetadata(sealAssignmentEvent(value)).ok, false, JSON.stringify(refs));
  }
});

test('v1 domain and v2 typed scope/operation cannot be interchanged or extended with open keys', () => {
  for (const edit of [
    (v) => { v['schema-version'] = 1; },
    (v) => { delete v.operation; },
    (v) => { v.operation = 'canonical-creation'; },
    (v) => { v.operation = 'merge-equivalent'; },
    (v) => { v.extra = true; },
    (v) => { v.scope.extra = true; },
    (v) => { v.scope = { kind: 'knowledge-domain', occupancy: 'allocated', field: 'facets.domain', match: 'exact', values: ['design'] }; },
  ]) {
    const value = event(); edit(value);
    assert.equal(validateAssignmentEventMetadata(sealAssignmentEvent(value)).ok, false);
  }
});

test('creation null tuples remain unsupported in this existing-record implementation', () => {
  const value = event();
  Object.assign(value.rows[0], { before: null, 'before-capture': null, 'before-revision': null,
    'after-revision': 0, disposition: 'created' });
  assert.equal(validateAssignmentEventMetadata(sealAssignmentEvent(value)).ok, false);
});

test('withdrawal has a real reason and revision transition, and unknown never becomes empty', () => {
  const value = event(); value.rows[0].reason = '   ';
  assert.equal(validateAssignmentEventMetadata(sealAssignmentEvent(value)).ok, false);
  const invalid = event(); invalid.rows[0]['after-revision'] = 0;
  const checked = validateAssignmentHistoryChain({ namespace,
    baselines: [{ ref: ref(), state: known, capture: invalid.rows[0]['before-capture'] }],
    events: [assignmentEventProjection(invalid)] });
  assert.equal(checked.ok, false);
  assert.deepEqual(assignmentEventProjection(event()).rows[0].after, unknown);
});
