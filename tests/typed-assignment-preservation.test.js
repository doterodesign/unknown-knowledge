import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as preservation from '../payload/engine/lib/assignment-preservation.js';

const namespace = '12345678-1234-4123-8123-123456789abc';
const ref = (kind, id) => ({ namespace, kind, id });
const ontology = `schema-version: 2
entries:
  - id: O-000001
    term: First
    class: general
    summary: Meaning π
    status: active
    subjects: [S-000001]
    source-of-truth: [src/first.js]
    last-verified: '2026-09-19'
  - id: O-000002
    term: Second
    class: general
    summary: Meaning two
    status: active
    subjects: []
  # Sibling boundary stays exactly here.
  - id: O-000003
    term: Third
    class: general
    summary: 'Unselected wording'
    status: draft
# Final comment stays.
`;
const decision = `schema-version: 2
entries:
  - id: D-000002
    title: First
    category: architecture
    date: '2026-09-19'
    deciders: [steward]
    status: accepted
    context: Original reasoning
    decision: Retained decision
    subjects: [S-000001]
  - id: D-000003
    title: Second
    category: architecture
    date: '2026-09-19'
    deciders: [steward]
    status: addressed
    context: Other reasoning
    decision: Other decision
    subjects: []
  - id: D-000004
    title: Sibling
    category: architecture
    date: '2026-09-19'
    deciders: [steward]
    status: accepted
    context: 'Exact sibling reasoning'
    decision: Preserve me
`;
const check = (kind, before, candidate, ids) => preservation.validateTypedAssignmentPreservation({
  kind, file: `${kind}/shared.yaml`, beforeBytes: Buffer.from(before), candidateBytes: Buffer.from(candidate),
  rows: ids.map((id) => ({ ref: ref(kind, id), reviewNote: null })),
});

for (const [kind, before, ids] of [['ontology', ontology, ['O-000001', 'O-000002']], ['decision', decision, ['D-000002', 'D-000003']]]) {
  test(`${kind}: two selected edits share one immutable file/sibling boundary and withdrawal stays absent`, () => {
    const after = before.replace('    subjects: [S-000001]\n', '').replace('subjects: []', 'subjects: [S-000002]');
    assert.equal(check(kind, before, after, ids).ok, true);
    assert.equal(check(kind, before, after, [ids[0]]).ok, false);
    assert.equal(check(kind, before, after, [ids[1]]).ok, false);
    for (const changed of [after.replace('Original reasoning', 'Changed reasoning').replace('Meaning π', 'Meaning pi'),
      after.replace("'2026-09-19'", "'2026-09-18'"), after.replace(/'([^']*(?:sibling|Unselected)[^']*)'/i, '"$1"')]) {
      assert.notEqual(changed, after);
      assert.equal(check(kind, before, changed, ids).ok, false);
    }
  });
  test(`${kind}: BOM/CRLF and comments are retained across insertion, removal and explicit empty`, () => {
    const original = '\uFEFF' + before.replaceAll('\n', '\r\n');
    const after = original.replace('subjects: [S-000001]', 'subjects: []').replace('    subjects: []\r\n  -', '  -');
    assert.equal(check(kind, original, after, ids).ok, true);
    assert.equal(check(kind, original, after.replaceAll('\r\n', '\n'), ids).ok, false);
  });
}

test('missing/duplicate owners, flow record layout and comments inside an edited field refuse', () => {
  assert.equal(check('ontology', ontology, ontology, ['O-999999']).ok, false);
  assert.equal(check('ontology', ontology, ontology, ['O-000001', 'O-000001']).ok, false);
  const commented = ontology.replace('subjects: [S-000001]', 'subjects: [S-000001] # rationale');
  assert.equal(check('ontology', commented, commented.replace('S-000001', 'S-000002'), ['O-000001']).ok, false);
  const flow = 'schema-version: 2\nentries: [{id: O-000001, term: One, class: general, summary: Retained, status: draft, subjects: []}]\n';
  assert.equal(check('ontology', flow, flow.replace('subjects: []', 'subjects: [S-000001]'), ['O-000001']).ok, false);
});

test('O/D cannot acquire invented classification notes or altered provenance fields', () => {
  const after = ontology.replace('subjects: [S-000001]', 'subjects: [S-000002]');
  assert.equal(check('ontology', ontology, after.replace('summary: Meaning π', 'summary: Changed'), ['O-000001']).ok, false);
  assert.equal(check('ontology', ontology, after.replace('subjects: [S-000002]', 'subjects: [S-000002]\n    notes: []'), ['O-000001']).ok, false);
});
