import { test } from 'node:test';
import assert from 'node:assert/strict';
import { indexSubjects, subjectAncestors } from '../payload/engine/lib/subjects.js';
import { reportSubjectReach } from '../payload/engine/lib/subject-reach.js';

const namespace = '12345678-1234-4234-8234-123456789abc';
const limits = { maxHierarchyNodes: 100, maxHierarchyEdges: 100, maxRecords: 100 };
const subject = (id, parent) => ({ id, label: id, status: 'active', aliases: [], related: [],
  definition: { text: id, includes: ['Included'], excludes: ['Excluded'] }, ...(parent ? { parent } : {}) });
const document = (parent = 'S-000001') => ({ schemaVersion: 1, namespace, revision: 1,
  hierarchyRevision: 1, subjects: [subject('S-000001'), subject('S-000002'),
    subject('S-000003', parent), subject('S-000004', 'S-000003')] });
const ref = (id = 'K-000001', kind = 'knowledge') => ({ namespace, kind, id });
const row = (ids = ['S-000004'], id = 'K-000001', kind = 'knowledge') => ({ ref: ref(id, kind),
  entry: { record: { id, subjects: ids, edition: 2, body: 'Unchanged body', status: 'archived' } } });
function snapshot(doc = document(), records = [row()], capturedInputRef = 'before') {
  const indexed = indexSubjects(doc);
  assert.equal(indexed.ok, true);
  return { registry: indexed.registry, records, capturedInputRef, coverage: [{ kind: 'knowledge', status: 'complete' }] };
}
function fixture() {
  return { before: snapshot(), after: snapshot(document('S-000002'), [row()], 'after'), kinds: ['knowledge'], limits };
}
const subjectRow = (report, id) => report.subjects.find((item) => item.id === id);

test('reparent reports inherited changes through real forests without changing record bytes or editions', () => {
  const input = fixture();
  const original = JSON.stringify([input.before.records, input.after.records]);
  const report = reportSubjectReach(input);
  assert.equal(report.status, 'complete');
  assert.deepEqual(report.records[0].directDelta, { added: [], removed: [] });
  assert.deepEqual(report.records[0].inheritedDelta, { added: ['S-000002'], removed: ['S-000001'] });
  assert.deepEqual(report.affectedRecords[0].causes, ['hierarchy', 'inherited-subject-metadata']);
  assert.deepEqual(report.affectedRecords[0].inheritedAffectedSubjects,
    [{ namespace, kind: 'subject', id: 'S-000003' }]);
  assert.deepEqual(subjectRow(report, 'S-000001').inheritedUsers.before, [ref()]);
  assert.deepEqual(subjectRow(report, 'S-000001').inheritedUsers.after, []);
  assert.deepEqual(subjectRow(report, 'S-000004').ancestorDelta, { added: ['S-000002'], removed: ['S-000001'] });
  assert.equal(JSON.stringify([input.before.records, input.after.records]), original);
});

test('rename retains identity and all memberships while exposing metadata changes', () => {
  const input = fixture();
  const doc = document();
  doc.subjects[3].label = 'Renamed';
  input.after = snapshot(doc, [row()], 'after');
  const report = reportSubjectReach(input);
  assert.equal(report.status, 'complete');
  assert.equal(subjectRow(report, 'S-000004').metadataChanged, true);
  assert.deepEqual(report.records[0].inheritedDelta, { added: [], removed: [] });
  assert.deepEqual(report.affectedRecords[0].causes, ['subject-metadata']);
  assert.deepEqual(report.records[0].affectedSubjects, [{ namespace, kind: 'subject', id: 'S-000004' }]);
});

test('lifecycle-only changes expose exact before direct users for adjudication', () => {
  const input = fixture();
  const doc = document();
  doc.subjects[3].status = 'retired';
  input.after = snapshot(doc, [row([])], 'after');
  const report = reportSubjectReach(input);
  assert.equal(report.status, 'complete');
  assert.deepEqual(subjectRow(report, 'S-000004').directUsers.before, [ref()]);
  assert.deepEqual(subjectRow(report, 'S-000004').directUsers.after, []);
  assert.equal(report.before.completeness.directUses, true);
  assert.deepEqual(report.records[0].directDelta, { added: [], removed: ['S-000004'] });
});

test('unknown assignments block before exhaustive use proof even with a complete after side', () => {
  const input = fixture();
  delete input.before.records[0].entry.record.subjects;
  const report = reportSubjectReach(input);
  assert.equal(report.status, 'incomplete');
  assert.equal(report.before.completeness.assignments, false);
  assert.equal(report.before.completeness.directUses, false);
  assert.equal(report.after.completeness.directUses, true);
  assert.equal(report.records[0].directDelta, null);
  assert.equal(report.records[0].inheritedDelta, null);
  assert.deepEqual(report.unknownImpact.map((item) => item.ref), [ref()]);
});

test('missing coverage is unavailable, and omitted kinds cannot masquerade as exhaustive inventory', () => {
  const input = fixture();
  input.before.coverage = [];
  input.kinds = ['knowledge', 'decision'];
  const report = reportSubjectReach(input);
  assert.equal(report.status, 'incomplete');
  assert.deepEqual(report.before.coverage, [
    { kind: 'decision', status: 'unavailable' }, { kind: 'knowledge', status: 'unavailable' },
  ]);
  assert.equal(report.before.completeness.directUses, false);
  assert.equal(report.after.completeness.coverage, false);
  assert.equal(report.scope.proposals, 'excluded');
  assert.equal(report.scope.lifecycle, 'all-captured');
  assert.equal(report.optionalImpact.status, 'unavailable');
});

test('global hierarchy budgets charge actual P2 costs and never turn partial paths into removals', () => {
  const input = fixture();
  input.limits = { ...limits, maxHierarchyNodes: 5, maxHierarchyEdges: 3 };
  const report = reportSubjectReach(input);
  assert.equal(report.status, 'incomplete');
  assert.ok(report.used.hierarchyNodes <= 5);
  assert.ok(report.used.hierarchyEdges <= 3);
  assert.equal(report.records[0].inheritedDelta, null);
  assert.equal(report.before.completeness.directUses, true);
  assert.equal(report.after.completeness.directUses, true);
  let nodes = 0;
  let edges = 0;
  for (const side of ['before', 'after']) {
    for (const id of [...input[side].registry.subjects.keys()].sort()) {
      const walk = subjectAncestors(input[side].registry, id,
        { includeSelf: false, budget: { nodes: 5 - nodes, edges: 3 - edges } });
      nodes += walk.used.nodes;
      edges += walk.used.edges;
    }
  }
  assert.deepEqual([report.used.hierarchyNodes, report.used.hierarchyEdges], [nodes, edges]);
});

test('record budget exposes unvalidated remainder and does not assert missing after records were deleted', () => {
  const input = fixture();
  input.limits = { ...limits, maxRecords: 1 };
  const report = reportSubjectReach(input);
  assert.equal(report.status, 'incomplete');
  assert.equal(report.used.recordsStarted, 1);
  assert.equal(report.used.recordsCompleted, 1);
  assert.equal(report.after.unvalidatedRecords, 1);
  assert.equal(report.after.completeness.directUses, false);
  assert.equal(report.records[0].after.presence, 'unavailable');
  assert.equal(report.records[0].directDelta, null);
});

test('known empty and absent records differ from unknown metadata with complete selected coverage', () => {
  const input = fixture();
  input.before.records = [];
  input.after.records = [row([])];
  const report = reportSubjectReach(input);
  assert.equal(report.status, 'complete');
  assert.equal(report.records[0].before.presence, 'absent');
  assert.equal(report.records[0].after.presence, 'present');
  assert.deepEqual(report.records[0].directDelta, { added: [], removed: [] });
});

test('invalid, duplicate, wrong-namespace and unknown subject records refuse usable impact output', () => {
  const mutations = [
    (x) => { x.before.records[0].entry.record.subjects = ['S-000099']; },
    (x) => { x.before.records.push(row()); },
    (x) => { x.before.records[0].ref.namespace = '87654321-1234-4234-8234-123456789abc'; },
    (x) => { x.before.records[0].ref.extra = 'alias'; },
    (x) => { x.before.records[0].entry.record.subjects = null; },
    (x) => { x.before.records[0].entry.record.id = 'K-000002'; },
  ];
  for (const mutate of mutations) {
    const input = fixture(); mutate(input);
    const report = reportSubjectReach(input);
    assert.equal(report.status, 'invalid');
    assert.ok(report.diagnostics.length > 0);
    assert.deepEqual(report.subjects, []);
    assert.deepEqual(report.affectedRecords, []);
  }
});

test('reindexing the captured document ignores corrupted mutable derived maps', () => {
  const input = fixture();
  input.before.registry.parents.clear();
  input.before.registry.subjects.clear();
  const report = reportSubjectReach(input);
  assert.equal(report.status, 'complete');
  assert.deepEqual(report.records[0].inheritedDelta, { added: ['S-000002'], removed: ['S-000001'] });
  assert.equal(report.before.capturedInputRef, 'before');
  assert.match(report.before.registryDigest, /^[a-f0-9]{64}$/);
});

test('all three typed stores participate, regardless of captured record lifecycle', () => {
  const input = fixture();
  input.kinds = ['knowledge', 'ontology', 'decision'];
  for (const side of ['before', 'after']) {
    input[side].records = [row(), row(['S-000004'], 'O-000001', 'ontology'), row(['S-000004'], 'D-000001', 'decision')];
    input[side].coverage = input.kinds.map((kind) => ({ kind, status: 'complete' }));
  }
  const report = reportSubjectReach(input);
  assert.equal(report.status, 'complete');
  assert.deepEqual(subjectRow(report, 'S-000004').directUsers.before.map((item) => item.kind),
    ['decision', 'knowledge', 'ontology']);
  assert.equal(report.affectedRecords.length, 3);
});

test('assignment edits alone do not claim graph changes, and authored order is not a change', () => {
  const input = fixture();
  input.after = snapshot(document(), [row(['S-000002'])], 'after');
  const report = reportSubjectReach(input);
  assert.deepEqual(report.affectedRecords[0].causes, ['direct-assignment']);
  assert.deepEqual(report.records[0].inheritedDelta, { added: [], removed: ['S-000001', 'S-000003'] });
  input.before.records = [row(['S-000004', 'S-000003'])];
  input.after.records = [row(['S-000003', 'S-000004'])];
  const reordered = reportSubjectReach(input);
  assert.equal(reordered.status, 'complete');
  assert.deepEqual(reordered.affectedRecords, []);
  assert.deepEqual(reordered.records[0].before.inherited.ids, ['S-000001']);
  assert.deepEqual(input.before.records[0].entry.record.subjects, ['S-000004', 'S-000003']);
});

test('related associations never enter ancestor reach', () => {
  const input = fixture();
  const doc = document();
  doc.subjects[3].related = [{ type: 'association', target: 'S-000002' }];
  input.after = snapshot(doc, [row()], 'after');
  const report = reportSubjectReach(input);
  assert.deepEqual(report.records[0].inheritedDelta, { added: [], removed: [] });
  assert.deepEqual(subjectRow(report, 'S-000002').inheritedUsers.after, []);
});

test('exhausted traversal returns witnessed ancestors but no fabricated membership difference', () => {
  const input = fixture();
  input.limits = { ...limits, maxHierarchyNodes: 6, maxHierarchyEdges: 3 };
  const report = reportSubjectReach(input);
  assert.equal(report.status, 'incomplete');
  assert.deepEqual(subjectRow(report, 'S-000004').ancestors.before.ids, ['S-000003']);
  assert.equal(subjectRow(report, 'S-000004').ancestorDelta, null);
  assert.deepEqual(report.records[0].before.inherited.ids, ['S-000003']);
  assert.equal(report.records[0].inheritedDelta, null);
});

test('invalid options, registries and coverage refuse before producing any scope evidence', () => {
  const mutations = [
    (x) => { x.kinds = []; },
    (x) => { x.kinds = ['knowledge', 'knowledge']; },
    (x) => { x.kinds = ['subject']; },
    (x) => { x.limits = { ...limits, maxRecords: -1 }; },
    (x) => { x.limits = { ...limits, maxHierarchyNodes: 0.5 }; },
    (x) => { x.before.capturedInputRef = ''; },
    (x) => { x.before.records = {}; },
    (x) => { x.before.coverage.push({ kind: 'knowledge', status: 'complete' }); },
    (x) => { x.before.coverage[0].status = 'empty'; },
    (x) => { x.before.registry = {}; },
    (x) => { x.before.registry = { document: { ...document(), namespace: 'wrong' } }; },
    (x) => { x.before.registry = { document: { ...document(), namespace: '87654321-1234-4234-8234-123456789abc' } }; },
    (x) => { x.before.records[0].ref.kind = 'decision'; },
    (x) => { x.before.records[0].entry.identity = 'K-000002'; },
  ];
  for (const mutate of mutations) {
    const input = fixture(); mutate(input);
    const report = reportSubjectReach(input);
    assert.equal(report.status, 'invalid');
    assert.deepEqual(report.records, []);
    assert.deepEqual(report.subjects, []);
  }
});

test('ancestor rename reports inherited metadata impact separately from exact direct targets', () => {
  const input = fixture();
  const doc = document();
  doc.subjects[0].label = 'Renamed ancestor';
  input.after = snapshot(doc, [row()], 'after');
  const report = reportSubjectReach(input);
  assert.equal(report.affectedRecords.length, 1);
  assert.deepEqual(report.affectedRecords[0].causes, ['inherited-subject-metadata']);
  assert.deepEqual(report.affectedRecords[0].affectedSubjects, []);
  assert.deepEqual(report.affectedRecords[0].inheritedAffectedSubjects,
    [{ namespace, kind: 'subject', id: 'S-000001' }]);
  assert.deepEqual(report.records[0].inheritedDelta, { added: [], removed: [] });
});

test('sparse kind selections fail as invalid instead of bypassing selection validation', () => {
  const input = fixture();
  input.kinds = new Array(1);
  // Empty inventory/coverage makes a skipped sparse selection observable.
  for (const side of ['before', 'after']) {
    input[side].records = [];
    input[side].coverage = [];
  }
  assert.equal(reportSubjectReach(input).status, 'invalid');
});

test('canonical reach refuses proposal parents accepted by the lower-level structural index', () => {
  const input = fixture();
  const doc = document();
  const proposal = { ...subject(`proposal:subject:${namespace}`), status: 'proposed' };
  doc.subjects.push(proposal);
  doc.subjects[0].parent = proposal.id;
  input.before = snapshot(doc);
  const report = reportSubjectReach(input);
  assert.equal(report.status, 'invalid');
  assert.ok(report.diagnostics.some((item) => item.code === 'noncanonical-reach-parent'));
  assert.deepEqual(report.subjects, []);
});
