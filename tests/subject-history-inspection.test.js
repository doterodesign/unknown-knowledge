import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inspectAssignmentHistory, validateAssignmentHistory } from '../payload/engine/lib/subject-history.js';
import { buildIdentityIndex } from '../payload/engine/lib/record-identity-index.js';

const namespace = '12345678-1234-4123-8123-123456789abc';
const ref = { namespace, kind: 'knowledge', id: 'K-000001' };
const unknown = { state: 'unknown' };
const assigned = { state: 'known', ids: ['S-000002'] };
const capture = {
  file: 'knowledge/one.md', blob: '1'.repeat(40), sha256: '2'.repeat(64),
  source: { commit: '3'.repeat(40), tree: '4'.repeat(40) },
};
const terminalCapture = { ...capture, blob: '5'.repeat(40), sha256: '6'.repeat(64) };
const publication = { id: '00000000-0000-4000-8000-000000000001', review: 'review:allocation' };
const allocation = { id: ref.id, kind: 'knowledge', state: 'retired', publication, reason: 'Retired through review.' };
const entry = { file: 'knowledge/one.md', record: { id: ref.id, subjects: ['S-000002'], edition: 2 } };
const event = {
  'schema-version': 1, event: '00000000-0000-4000-8000-000000000002', namespace,
  beforeInputRef: 'captured:before', candidateInputRef: 'captured:after',
  rows: [{ ref, before: unknown, after: assigned, beforeRevision: 0, afterRevision: 1,
    disposition: 'changed', reason: 'Reviewed assignment.' }],
};
function index(allocations = [allocation], records = []) {
  return buildIdentityIndex({
    identity: { 'schema-version': 1, 'identity-format': 1, namespace, allocations },
    identitySource: { file: '_identity.yaml', path: '' },
    records, declarations: [],
  });
}
function input() {
  return {
    namespace, baselines: [{ ref, state: unknown, capture }], events: [event],
    identityIndex: index(), capturedRecords: [{ ref, capture: terminalCapture, entry }],
  };
}
function invalid(value, code) {
  const result = inspectAssignmentHistory(value);
  assert.equal(result.mode, 'history-only');
  assert.equal(result.status, 'invalid');
  assert.deepEqual(result.history, []);
  assert.ok(result.diagnostics.some((d) => d.code === code), JSON.stringify(result));
}

test('retired identity history checks supplied terminal assignments without claiming current or byte verification', () => {
  const value = input();
  const before = structuredClone({ baselines: value.baselines, events: value.events, capturedRecords: value.capturedRecords });
  assert.deepEqual(inspectAssignmentHistory(value), {
    mode: 'history-only', status: 'complete', captureVerification: 'not-performed', diagnostics: [],
    history: [{ ref, revision: 1, state: assigned, allocation, currentCheck: 'retired',
      assignmentStateCheck: 'matched', capture: terminalCapture }],
  });
  assert.deepEqual({ baselines: value.baselines, events: value.events, capturedRecords: value.capturedRecords }, before);
  assert.equal(validateAssignmentHistory({ ...value, currentRecords: [] }).ok, false,
    'historical inspection must not weaken current-record matching');
});

test('unavailable historical payload keeps occupied identity and last-known metadata with incomplete status', () => {
  const value = input(); value.capturedRecords = [];
  const result = inspectAssignmentHistory(value);
  assert.equal(result.status, 'incomplete');
  assert.deepEqual(result.history, [{ ref, revision: 1, state: assigned, allocation,
    currentCheck: 'retired', assignmentStateCheck: 'unavailable' }]);
  assert.ok(result.diagnostics.some((d) => d.code === 'historical-assignment-state-unavailable'));
});

test('allocated occupancy without payload is unavailable, never retired or an empty assignment', () => {
  const value = input();
  const occupied = { id: ref.id, kind: 'knowledge', state: 'allocated', publication };
  value.identityIndex = index([occupied]); value.capturedRecords = [];
  const result = inspectAssignmentHistory(value);
  assert.equal(result.status, 'incomplete');
  assert.deepEqual(result.history[0], { ref, revision: 1, state: assigned, allocation: occupied,
    currentCheck: 'unavailable', assignmentStateCheck: 'unavailable' });
  value.identityIndex = index([]);
  invalid(value, 'uninspectable-identity');
});

test('retained resolver payload alone cannot imply a verified capture', () => {
  const value = input(); value.capturedRecords = [];
  value.identityIndex = index([allocation], [{ kind: 'knowledge', entry,
    locator: { file: entry.file, path: '' } }]);
  const result = inspectAssignmentHistory(value);
  assert.equal(result.status, 'incomplete');
  assert.equal(result.history[0].assignmentStateCheck, 'unavailable');
});

test('captured assignment mismatch or wrong record identity refuses historical equality', () => {
  const value = input();
  value.capturedRecords = [{ ref, capture: terminalCapture, entry: { record: { id: ref.id, subjects: [] } } }];
  invalid(value, 'historical-state-mismatch');
  value.capturedRecords[0].entry.record.id = 'K-000002';
  invalid(value, 'invalid-reference');
});

test('live loaded identities and ambiguous allocations cannot silently choose a historical substitute', () => {
  const value = input();
  value.identityIndex = index([{ id: ref.id, kind: 'knowledge', state: 'allocated', publication }],
    [{ kind: 'knowledge', entry, locator: { file: entry.file, path: '' } }]);
  invalid(value, 'uninspectable-identity');
  value.identityIndex = index([allocation, allocation]);
  invalid(value, 'uninspectable-identity');
});

test('a broken history still refuses even when current payload is unavailable', () => {
  const value = input(); value.capturedRecords = []; value.events = [event, event];
  invalid(value, 'duplicate-event');
});

test('old baseline payload cannot stand in for terminal assignments after a change', () => {
  const value = input(); value.capturedRecords = [{ ref, capture, entry: { record: { id: ref.id } } }];
  invalid(value, 'historical-state-mismatch');
});

test('malformed, duplicate and out-of-scope historical captures refuse without partial history', () => {
  const value = input(); value.capturedRecords = [value.capturedRecords[0], value.capturedRecords[0]];
  invalid(value, 'duplicate-historical-record');
  value.capturedRecords = [{ ref, capture: { ...terminalCapture, file: '../escape.md' }, entry }];
  invalid(value, 'invalid-capture');
  value.capturedRecords = [{ ref: { ...ref, id: 'K-000002' }, capture, entry: { record: { id: 'K-000002' } } }];
  invalid(value, 'missing-baseline');
});

test('historical inspection requires a real captured identity index and valid assignment payload', () => {
  const value = input(); value.identityIndex = { namespace, identityFormat: 1 };
  invalid(value, 'invalid-identity-index');
  const malformed = input();
  malformed.capturedRecords = [{ ref, capture, entry: { record: { id: ref.id, subjects: null } } }];
  invalid(malformed, 'invalid-historical-record');
  invalid({ ...input(), capturedRecords: null }, 'invalid-input');
});

test('one unavailable capture makes the selected report incomplete while retaining every occupied history', () => {
  const otherRef = { namespace, kind: 'ontology', id: 'O-000001' };
  const otherAllocation = { id: otherRef.id, kind: 'ontology', state: 'allocated', publication };
  const value = input(); value.identityIndex = index([allocation, otherAllocation]);
  value.baselines.push({ ref: otherRef, state: { state: 'known', ids: [] },
    capture: { ...capture, file: 'ontology/classes/one.yaml' } });
  const result = inspectAssignmentHistory(value);
  assert.equal(result.status, 'incomplete');
  assert.deepEqual(result.history, [
    { ref, revision: 1, state: assigned, allocation, currentCheck: 'retired',
      assignmentStateCheck: 'matched', capture: terminalCapture },
    { ref: otherRef, revision: 0, state: { state: 'known', ids: [] }, allocation: otherAllocation,
      currentCheck: 'unavailable', assignmentStateCheck: 'unavailable' },
  ]);
  result.history[0].allocation.reason = 'caller mutation';
  result.history[0].capture.file = 'changed.md';
  assert.equal(inspectAssignmentHistory(value).history[0].allocation.reason, allocation.reason);
  assert.equal(terminalCapture.file, 'knowledge/one.md');
});

test('matching assignments never claims authentication of other payload fields or supplied locator hashes', () => {
  const value = input();
  value.capturedRecords = [{ ref, capture: terminalCapture,
    entry: { record: { id: ref.id, subjects: ['S-000002'], edition: 999, body: 'Not compared here.' } } }];
  const result = inspectAssignmentHistory(value);
  assert.equal(result.status, 'complete');
  assert.equal(result.history[0].assignmentStateCheck, 'matched');
  assert.equal(result.captureVerification, 'not-performed');
  assert.equal(Object.hasOwn(result.history[0], 'payloadCheck'), false);
});

test('cancelled allocation remains occupied under retired lookup rather than disappearing', () => {
  const value = input();
  const cancelled = { ...allocation, state: 'cancelled', reason: 'Publication cancelled.' };
  value.identityIndex = index([cancelled]);
  const result = inspectAssignmentHistory(value);
  assert.equal(result.status, 'complete');
  assert.equal(result.history[0].currentCheck, 'retired');
  assert.deepEqual(result.history[0].allocation, cancelled);
});
