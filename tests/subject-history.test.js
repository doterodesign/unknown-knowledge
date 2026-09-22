import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateAssignmentHistory, validateBaselineTransition } from '../payload/engine/lib/subject-history.js';
import { iterateCurrentRecords } from '../payload/engine/lib/record-identity.js';

const namespace = '12345678-1234-4123-8123-123456789abc';
const ref = { namespace, kind: 'knowledge', id: 'K-000001' };
const otherRef = { namespace, kind: 'ontology', id: 'O-000001' };
const unknown = { state: 'unknown' };
const empty = { state: 'known', ids: [] };
const one = { state: 'known', ids: ['S-000001'] };
const two = { state: 'known', ids: ['S-000001', 'S-000002'] };
const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const capture = (file = 'knowledge/one.md') => ({
  file, blob: '1'.repeat(40), sha256: '2'.repeat(64),
  source: { commit: '3'.repeat(40), tree: '4'.repeat(40) },
});
const baseline = (recordRef = ref, state = unknown, location = capture()) => ({
  ref: recordRef, state, capture: location,
});
const row = (before, after, beforeRevision = 0, afterRevision = beforeRevision + 1) => ({
  ref, before, after, beforeRevision, afterRevision,
  disposition: afterRevision === beforeRevision ? 'unchanged' : 'changed', reason: 'Reviewed classification.',
});
const event = (n, rows) => ({
  'schema-version': 1, event: uuid(n), namespace,
  beforeInputRef: `captured:before-${n}`, candidateInputRef: `captured:after-${n}`, rows,
});
function input(events = [], state = unknown, currentState = state) {
  return {
    namespace, baselines: [baseline(ref, state)], events,
    currentRecords: [{ ref, entry: { record: currentState.state === 'known'
      ? { id: ref.id, subjects: currentState.ids } : { id: ref.id } } }],
  };
}
function rejects(value, code) {
  const result = validateAssignmentHistory(value);
  assert.equal(result.ok, false);
  assert.ok(result.diagnostics.some((d) => d.code === code), JSON.stringify(result.diagnostics));
  assert.deepEqual(result.revisions, [], 'a broken history must not return a usable partial revision set');
}

test('captured adoption starts at revision zero without inventing earlier history', () => {
  assert.deepEqual(validateAssignmentHistory(input([], two)), {
    ok: true, diagnostics: [], revisions: [{ ref, revision: 0, state: two }],
  });
});

test('unknown to empty changes once; unchanged review and reordered sets never increment', () => {
  const events = [
    event(1, [row(unknown, empty)]), event(2, [row(empty, one, 1)]),
    event(3, [row(one, two, 2)]),
    event(4, [row(two, { state: 'known', ids: ['S-000002', 'S-000001'] }, 3, 3)]),
  ];
  const value = input(events, unknown, two);
  const before = structuredClone(value);
  assert.deepEqual(validateAssignmentHistory(value), {
    ok: true, diagnostics: [], revisions: [{ ref, revision: 3, state: two }],
  });
  assert.deepEqual(value, before, 'validation cannot mutate authored lists or event history');
});

test('revision assertions order history independently of event UUID and input order', () => {
  const first = event(9, [row(unknown, one)]);
  const second = event(1, [row(one, two, 1)]);
  assert.deepEqual(validateAssignmentHistory(input([second, first], unknown, two)).revisions,
    [{ ref, revision: 2, state: two }]);
});

test('gaps, forks, duplicate events and duplicate rows refuse', () => {
  rejects(input([event(1, [row(one, two, 1)])], unknown, two), 'history-gap');
  rejects(input([event(1, [row(unknown, one)]), event(2, [row(unknown, two)])], unknown, two), 'history-fork');
  const repeated = event(1, [row(unknown, one)]);
  rejects(input([repeated, repeated], unknown, one), 'duplicate-event');
  rejects(input([event(1, [row(unknown, one), row(unknown, one)])], unknown, one), 'duplicate-row');
});

test('stale before states and current assignment mismatch refuse', () => {
  rejects(input([event(1, [row(empty, one)])], unknown, one), 'stale-before');
  rejects(input([event(1, [row(unknown, one)])], unknown, two), 'current-state-mismatch');
  rejects(input([event(1, [row(one, one, 0, 0)])]), 'stale-before');
});

test('semantic changes and revision increments must agree', () => {
  rejects(input([event(1, [row(unknown, empty, 0, 0)])], unknown, empty), 'invalid-revision');
  rejects(input([event(1, [row(one, one)])], one), 'invalid-revision');
  const wrong = row(unknown, one); wrong.disposition = 'unchanged';
  rejects(input([event(1, [wrong])], unknown, one), 'invalid-disposition');
});

test('every disposition requires a reason, including unchanged review', () => {
  for (const r of [row(unknown, one), row(one, one, 0, 0)]) {
    r.reason = '  ';
    rejects(input([event(1, [r])], r.before, r.after), 'missing-reason');
  }
});

test('canonical typed refs, namespace and exact event IDs are required', () => {
  for (const replacement of [
    { ...ref, id: 'L-000001' }, { ...ref, kind: 'ontology' },
    { ...ref, namespace: uuid(8) }, { ...ref, kind: 'subject', id: 'S-000001' },
  ]) {
    const r = row(unknown, one); r.ref = replacement;
    rejects(input([event(1, [r])], unknown, one), 'invalid-reference');
  }
  const invalid = event(1, [row(unknown, one)]); invalid.event += '\n';
  rejects(input([invalid], unknown, one), 'invalid-event');
});

test('invalid snapshots and current records never become empty or unknown assignments', () => {
  for (const after of [
    { state: 'known', ids: ['S-000001', 'S-000001'] },
    { state: 'known', ids: ['S-000000'] }, { state: 'known' },
    { state: 'unknown', ids: [] }, { state: 'invalid' },
  ]) rejects(input([event(1, [row(unknown, after)])]), 'invalid-state');
  const value = input(); value.currentRecords[0].entry.record.subjects = null;
  rejects(value, 'invalid-current-record');
});

test('every event target needs captured baseline and current record; duplicate claims refuse', () => {
  const value = input([event(1, [{ ...row(unknown, one), ref: otherRef }])]);
  rejects(value, 'missing-baseline');
  const absent = input(); absent.currentRecords = [];
  rejects(absent, 'missing-current-record');
  const duplicate = input(); duplicate.baselines.push(duplicate.baselines[0]);
  rejects(duplicate, 'duplicate-baseline');
});

test('malformed input and missing captured baseline are explicit failures', () => {
  for (const value of [null, {}, { ...input(), baselines: null }]) {
    rejects(value, 'invalid-input');
  }
});

test('an unchanged review checks the historical revision even after a later change', () => {
  assert.deepEqual(validateAssignmentHistory(input([
    event(2, [row(one, two)]), event(1, [row(one, one, 0, 0)]),
  ], one, two)).revisions, [{ ref, revision: 1, state: two }]);
  rejects(input([event(1, [row(two, two, 4, 4)])], one), 'history-gap');
});

test('interleaved three-store histories use the real current-record interface and independent revisions', () => {
  const decisionRef = { namespace, kind: 'decision', id: 'D-000001' };
  const knowledge = { record: { id: ref.id, subjects: one.ids, edition: 3, verified: '2026-07-01' } };
  const ontology = { record: { id: otherRef.id, subjects: [], 'source-of-truth': 'src/unchanged.js' } };
  const decision = { record: { id: decisionRef.id, subjects: two.ids, status: 'accepted', decision: 'Unchanged reasoning.' } };
  const model = {
    ok: true, identity: { 'identity-format': 1, namespace },
    stores: { knowledge: { present: true }, ontology: { present: true }, decisions: { present: true } },
    leaves: new Map([[ref.id, knowledge]]), concepts: new Map([[otherRef.id, ontology]]),
    decisions: new Map([[decisionRef.id, decision]]),
  };
  const value = {
    namespace,
    baselines: [baseline(), baseline(otherRef, unknown, capture('ontology/classes/one.yaml')),
      baseline(decisionRef, two, capture('decisions/entries/one.yaml'))],
    events: [event(1, [row(unknown, one), { ...row(unknown, empty), ref: otherRef },
      { ...row(two, two, 0, 0), ref: decisionRef }])],
    currentRecords: iterateCurrentRecords(model, { kinds: ['knowledge', 'ontology', 'decision'] }),
  };
  const before = structuredClone(model);
  assert.deepEqual(validateAssignmentHistory(value), {
    ok: true, diagnostics: [], revisions: [
      { ref: decisionRef, revision: 0, state: two },
      { ref, revision: 1, state: one }, { ref: otherRef, revision: 1, state: empty },
    ],
  });
  assert.deepEqual(model, before, 'Phoenix edition, evidence date, source pointer and Decision reasoning stay untouched');
});

test('current identity ambiguity and incomplete iterables return no usable history', () => {
  const duplicate = input(); duplicate.currentRecords.push(duplicate.currentRecords[0]);
  rejects(duplicate, 'duplicate-current-record');
  const mismatch = input(); mismatch.currentRecords[0].entry.record.id = 'K-000002';
  rejects(mismatch, 'invalid-reference');
  const incomplete = input();
  incomplete.currentRecords = (function* () { yield input().currentRecords[0]; throw new Error('incomplete'); })();
  rejects(incomplete, 'invalid-input');
});

test('event format, captured input references and safe revision integers are required', () => {
  for (const patch of [
    { 'schema-version': 2 }, { namespace: uuid(8) }, { beforeInputRef: '' },
    { candidateInputRef: null }, { rows: [] },
  ]) rejects(input([{ ...event(1, [row(unknown, one)]), ...patch }], unknown, one), 'invalid-event');
  for (const invalid of [-1, 0.5, Number.MAX_SAFE_INTEGER + 1, '0']) {
    const r = row(unknown, one); r.beforeRevision = invalid;
    rejects(input([event(1, [r])], unknown, one), 'invalid-revision');
  }
});

test('later records start at zero with independent capture refs without resetting the first chain', () => {
  const first = baseline();
  const later = baseline(otherRef, one, {
    file: 'ontology/classes/later.yaml', blob: 'a'.repeat(64), sha256: 'b'.repeat(64),
  });
  const before = structuredClone([first]);
  assert.deepEqual(validateBaselineTransition({ namespace, before, after: [first, later] }), {
    ok: true, diagnostics: [],
  });
  const value = input([event(1, [row(unknown, two)])], unknown, two);
  value.baselines.push(later);
  value.currentRecords.push({ ref: otherRef, entry: { record: { id: otherRef.id, subjects: one.ids } } });
  assert.deepEqual(validateAssignmentHistory(value).revisions, [
    { ref, revision: 1, state: two }, { ref: otherRef, revision: 0, state: one },
  ]);
  assert.deepEqual(before, [first], 'prior capture remains unchanged');
});

test('published baseline removal, replacement or reset refuses even with the same assignments', () => {
  const first = baseline();
  for (const after of [[], [{ ...first, state: empty }],
    [{ ...first, capture: { ...first.capture, blob: 'a'.repeat(40) } }],
    [{ ...first, capture: { ...first.capture, source: { ...first.capture.source, commit: 'a'.repeat(40) } } }],
  ]) {
    const out = validateBaselineTransition({ namespace, before: [first], after });
    assert.equal(out.ok, false);
    assert.ok(out.diagnostics.some((d) => ['removed-baseline', 'changed-baseline'].includes(d.code)));
  }
});

test('capture locator is exact and cannot silently accept missing or escaping source references', () => {
  for (const location of [
    undefined, 'captured:old-shape', { ...capture(), hash: '2'.repeat(64) },
    { ...capture(), file: '../knowledge/one.md' }, { ...capture(), file: '/knowledge/one.md' },
    { ...capture(), file: 'knowledge//one.md' }, { ...capture(), file: 'knowledge/./one.md' },
    { ...capture(), blob: 'A'.repeat(40) }, { ...capture(), sha256: '2'.repeat(40) },
    { ...capture(), source: { commit: '3'.repeat(40) } },
  ]) {
    const value = input(); value.baselines[0].capture = location;
    rejects(value, 'invalid-capture');
  }
  const old = input(); delete old.baselines;
  old.baseline = { capturedInputRef: 'old', records: [{ ref, state: unknown }] };
  rejects(old, 'invalid-input');
});

test('baseline transition detects duplicate claims and malformed baseline declarations', () => {
  for (const [before, after, code] of [
    [[], [baseline(), baseline()], 'duplicate-baseline'],
    [[baseline(), baseline()], [baseline()], 'duplicate-baseline'],
    [[], [{ ...baseline(), state: { state: 'known', ids: ['S-000000'] } }], 'invalid-state'],
    [[], [{ ...baseline(), ref: { ...ref, namespace: uuid(9) } }], 'invalid-reference'],
  ]) {
    const out = validateBaselineTransition({ namespace, before, after });
    assert.equal(out.ok, false);
    assert.ok(out.diagnostics.some((d) => d.code === code), JSON.stringify(out));
  }
});

test('capture hashes reject newline-terminated strings at otherwise valid lengths', () => {
  for (const patch of [{ blob: '1'.repeat(39) + '\n' }, { sha256: '2'.repeat(63) + '\n' }]) {
    const value = input(); Object.assign(value.baselines[0].capture, patch);
    rejects(value, 'invalid-capture');
  }
});

test('baseline immutability preserves authored order but ignores object property serialization order', () => {
  const first = baseline(ref, two);
  const reorderedIds = { ...first, state: { state: 'known', ids: ['S-000002', 'S-000001'] } };
  assert.equal(validateBaselineTransition({ namespace, before: [first], after: [reorderedIds] }).ok, false);
  const reorderedKeys = { capture: first.capture, state: two, ref };
  assert.deepEqual(validateBaselineTransition({ namespace, before: [first], after: [reorderedKeys] }), {
    ok: true, diagnostics: [],
  });
});
