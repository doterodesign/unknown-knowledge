import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readAssignments, buildAssignmentIndex } from '../payload/engine/lib/subject-assignments.js';

const namespace = 'e8ba2f20-1d77-4f95-a30c-8f447acc1dc3';
const otherNamespace = 'd14d3606-ea89-492d-b930-675fa8fc4f72';
const A = 'S-000001';
const B = 'S-000002';
const C = 'S-999999';

function current(kind, id, metadata = {}, ns = namespace) {
  return {
    ref: { namespace: ns, kind, id },
    entry: { id, file: `${kind}/${id}.yaml`, record: { id, ...metadata } },
  };
}

test('assignment presence distinguishes absent, known empty and multiple subjects in authored order', () => {
  for (const [kind, id] of [['knowledge', 'K-000001'], ['ontology', 'O-000001'], ['decision', 'D-000001']]) {
    assert.deepEqual(readAssignments(current(kind, id).entry), { state: 'unknown', reason: 'absent' });
    assert.deepEqual(readAssignments(current(kind, id, { subjects: [] }).entry), { state: 'known', ids: [] });
    assert.deepEqual(readAssignments(current(kind, id, { subjects: [B, A, C] }).entry), {
      state: 'known', ids: [B, A, C],
    });
  }
});

test('malformed lists and exact subject IDs produce invalid state rather than empty or unknown', () => {
  for (const subjects of [null, undefined, A, {}, 1, [null], [1], ['S-000000'], ['S-1'],
    ['s-000001'], ['S-1000000'], ['K-000001'], [`${A}\n`], [` ${A}`], [new String(A)], Array(1)]) {
    const result = readAssignments({ record: { subjects } });
    assert.equal(result.state, 'invalid');
    assert.ok(result.diagnostics.length > 0);
    assert.ok(result.diagnostics.every((d) => d.path.startsWith('subjects')));
    assert.equal(Object.hasOwn(result, 'ids'), false);
  }
});

test('duplicate subjects identify the repeated authored position without deduplicating the record', () => {
  const result = readAssignments({ record: { subjects: [A, B, A] } });
  assert.equal(result.state, 'invalid');
  assert.deepEqual(result.diagnostics.map(({ code, path }) => ({ code, path })), [
    { code: 'duplicate-subject', path: 'subjects[2]' },
  ]);
});

test('an unreadable record is invalid, while inherited subjects do not become authored metadata', () => {
  for (const entry of [null, {}, { record: null }, { record: [] }, { record: A }]) {
    assert.equal(readAssignments(entry).state, 'invalid');
  }
  assert.deepEqual(readAssignments({ record: Object.create({ subjects: [A] }) }), {
    state: 'unknown', reason: 'absent',
  });
});

test('assignment reads preserve frozen records and return an independent ID array', () => {
  const entry = Object.freeze({ record: Object.freeze({ subjects: Object.freeze([B, A]) }) });
  const result = readAssignments(entry);
  assert.deepEqual(result, { state: 'known', ids: [B, A] });
  result.ids.push(C);
  assert.deepEqual(entry.record.subjects, [B, A]);
});

test('direct postings retain distinct typed records, with unknown separate from known empty', () => {
  const k = current('knowledge', 'K-000001', { subjects: [C, A, B] });
  const o = current('ontology', 'O-000001', { subjects: [A] });
  const d = current('decision', 'D-000001', { subjects: [B, A] });
  const absent = current('knowledge', 'K-000002');
  const empty = current('ontology', 'O-000002', { subjects: [] });
  const rows = [o, empty, k, absent, d];
  const expected = {
    ok: true,
    postings: [
      { subjectId: A, records: [d.ref, k.ref, o.ref] },
      { subjectId: B, records: [d.ref, k.ref] },
      { subjectId: C, records: [k.ref] },
    ],
    unknown: [absent.ref], diagnostics: [],
  };
  assert.deepEqual(buildAssignmentIndex(rows), expected);
  assert.deepEqual(buildAssignmentIndex(rows.toReversed()), expected);
  assert.deepEqual(buildAssignmentIndex((function* () { yield* rows; })()), expected);
});

test('index does not join assignments across records or infer subjects from other metadata', () => {
  const k = current('knowledge', 'K-000001', { subjects: [A], related: [B] });
  const o = current('ontology', 'O-000001', { subjects: [B], primary: A, parent: A });
  assert.deepEqual(buildAssignmentIndex([k, o]).postings, [
    { subjectId: A, records: [k.ref] }, { subjectId: B, records: [o.ref] },
  ]);
});

test('invalid assignment data refuses the index with attributed diagnostics, not partial postings', () => {
  const valid = current('knowledge', 'K-000001', { subjects: [A] });
  const invalid = current('ontology', 'O-000001', { subjects: [A, A] });
  const result = buildAssignmentIndex([valid, invalid]);
  assert.equal(result.ok, false);
  assert.deepEqual(result.postings, []);
  assert.deepEqual(result.unknown, []);
  assert.deepEqual(result.diagnostics.map(({ ref, file, code, path }) => ({ ref, file, code, path })), [
    { ref: invalid.ref, file: invalid.entry.file, code: 'duplicate-subject', path: 'subjects[1]' },
  ]);
});

test('ambiguous duplicate current refs refuse regardless of row order or matching bodies', () => {
  const one = current('knowledge', 'K-000001', { subjects: [A] });
  const two = current('knowledge', 'K-000001', { subjects: [B] });
  two.entry.file = 'knowledge/another-file.md';
  const result = buildAssignmentIndex([one, two]);
  assert.equal(result.ok, false);
  assert.deepEqual(result.postings, []);
  assert.ok(result.diagnostics.some((d) => d.code === 'duplicate-record-ref'));
  assert.deepEqual(buildAssignmentIndex([two, one]), result);
  assert.equal(buildAssignmentIndex([one, one]).ok, false);
});

test('foreign namespaces are refused rather than silently joined by equal local IDs', () => {
  const one = current('knowledge', 'K-000001', { subjects: [A] });
  const other = current('knowledge', 'K-000001', { subjects: [A] }, otherNamespace);
  const result = buildAssignmentIndex([one, other]);
  assert.equal(result.ok, false);
  assert.deepEqual(result.postings, []);
  assert.ok(result.diagnostics.some((d) => d.code === 'mixed-namespace'));
  assert.deepEqual(buildAssignmentIndex([other, one]), result);
});

test('invalid qualified refs and ref-to-record mismatches are diagnostic failures', () => {
  for (const replacement of [null, {}, { namespace, kind: 'subject', id: A },
    { namespace, kind: 'knowledge', id: 'O-000001' }, { namespace: 'invalid', kind: 'knowledge', id: 'K-000001' },
    { namespace, kind: 'knowledge', id: 'K-000001\n' },
    { namespace, kind: 'knowledge', id: 'K-000002' }]) {
    const row = current('knowledge', 'K-000001', { subjects: [A] });
    row.ref = replacement;
    const result = buildAssignmentIndex([row]);
    assert.equal(result.ok, false);
    assert.deepEqual(result.postings, []);
    assert.ok(result.diagnostics.some((d) => d.code === 'invalid-record-ref'));
  }
});

test('loader entry identity aliases must agree with the exact qualified record', () => {
  for (const field of ['id', 'identity']) {
    const input = current('knowledge', 'K-000001', { subjects: [A] });
    input.entry[field] = 'K-000002';
    const result = buildAssignmentIndex([input]);
    assert.equal(result.ok, false);
    assert.deepEqual(result.postings, []);
    assert.equal(result.diagnostics[0].code, 'invalid-record-ref');
  }
});

test('index rebuild is disposable and does not mutate even frozen authored inputs', () => {
  const row = current('decision', 'D-000001', { subjects: [B, A], date: '2026-09-18', context: 'Preserve this reasoning.' });
  Object.freeze(row.entry.record.subjects);
  Object.freeze(row.entry.record);
  Object.freeze(row.entry);
  Object.freeze(row.ref);
  Object.freeze(row);
  const before = JSON.stringify(row);
  const first = buildAssignmentIndex([row]);
  assert.equal(first.ok, true);
  first.postings[0].records[0].id = 'D-999999';
  const rebuilt = buildAssignmentIndex([row]);
  assert.deepEqual(rebuilt.postings, [
    { subjectId: A, records: [row.ref] }, { subjectId: B, records: [row.ref] },
  ]);
  assert.equal(JSON.stringify(row), before);
  assert.deepEqual(buildAssignmentIndex([]), { ok: true, postings: [], unknown: [], diagnostics: [] });
});
