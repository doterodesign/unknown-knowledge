import { test } from 'node:test';
import assert from 'node:assert/strict';
import { indexSubjects, lookupSubjects, normalizeSubjectLabel, SubjectError,
  subjectAncestors, subjectDescendants } from '../payload/engine/lib/subjects.js';

const namespace = '12345678-1234-4234-8234-123456789abc';
const subject = (id, label, text, extra = {}) => ({
  id, label, definition: { text, includes: ['Material in this meaning'], excludes: ['Other meanings'] },
  aliases: [], related: [], status: 'active', ...extra,
});
const index = (subjects) => indexSubjects({
  schemaVersion: 1, namespace, revision: 3, hierarchyRevision: 2, subjects,
});

test('subject normalization preserves Unicode meanings while unifying spelling and whitespace', () => {
  assert.equal(normalizeSubjectLabel('\u0085 CAFE\u0301\u00a0\u2003研究 \u0085'), 'café 研究');
  assert.equal(normalizeSubjectLabel('Straße'), 'straße');
  assert.notEqual(normalizeSubjectLabel('Straße'), normalizeSubjectLabel('STRASSE'));
  assert.notEqual(normalizeSubjectLabel('İ'), normalizeSubjectLabel('I'));
  assert.equal(normalizeSubjectLabel('色彩'), '色彩');
});

test('Unicode homonyms return all meanings in ID order with exact match provenance', () => {
  const records = [
    subject('S-000002', 'Café', 'A place serving coffee'),
    subject('S-000001', 'Coffee', 'A beverage', { aliases: [{ label: 'CAFE\u0301', locale: 'fr', context: 'drinks' }] }),
  ];
  const { ok, registry } = index(records);
  assert.equal(ok, true);
  assert.deepEqual(lookupSubjects(registry, ' café '), {
    normalizerVersion: 1,
    matches: [
      { id: 'S-000001', label: 'Coffee', definition: records[1].definition, status: 'active',
        matches: [{ kind: 'alias', label: 'CAFE\u0301', locale: 'fr', context: 'drinks' }] },
      { id: 'S-000002', label: 'Café', definition: records[0].definition, status: 'active',
        matches: [{ kind: 'label', label: 'Café' }] },
    ],
  });
});

test('alias scope includes exact and unscoped candidates without language or context inference', () => {
  const { registry } = index([
    subject('S-000003', 'Blue', 'General color', { aliases: [{ label: 'azul' }] }),
    subject('S-000002', 'Blue pigment', 'Physical pigment', { aliases: [{ label: 'azul', locale: 'es', context: 'paint' }] }),
    subject('S-000001', 'Sadness', 'A feeling', { aliases: [{ label: 'azul', locale: 'pt', context: 'mood' }] }),
  ]);
  assert.deepEqual(lookupSubjects(registry, 'azul').matches.map((s) => s.id), ['S-000001', 'S-000002', 'S-000003']);
  assert.deepEqual(lookupSubjects(registry, 'azul', { locale: 'es', context: 'paint' }).matches.map((s) => s.id),
    ['S-000002', 'S-000003']);
  assert.deepEqual(lookupSubjects(registry, 'azul', { locale: 'es-MX' }).matches.map((s) => s.id), ['S-000003']);
  assert.deepEqual(lookupSubjects(registry, 'azuls').matches, [], 'exact lookup has no plural heuristic');
});

test('lookup reads captured metadata and retains its schema, namespace and revisions', () => {
  const records = [subject('S-000001', 'Color', 'Color meaning', { aliases: [{ label: 'Hue' }] })];
  const { registry } = index(records);
  records[0].label = 'Changed';
  records[0].definition.text = 'Changed meaning';
  records[0].aliases[0].label = 'Changed alias';
  assert.equal(lookupSubjects(registry, 'hue').matches[0].label, 'Color');
  assert.equal(lookupSubjects(registry, 'hue').matches[0].definition.text, 'Color meaning');
  assert.equal(lookupSubjects(registry, 'hue').matches[0].matches[0].label, 'Hue');
  assert.deepEqual([registry.schemaVersion, registry.namespace, registry.revision, registry.hierarchyRevision, registry.normalizerVersion],
    [1, namespace, 3, 2, 1]);
  assert.equal(registry.document?.subjects[0].label, 'Color');
  assert.equal(Object.isFrozen(registry.document), true);
  assert.equal(Object.isFrozen(registry.document.subjects[0].definition), true);
});

test('editing a lookup response cannot corrupt the next match witness', () => {
  const { registry } = index([subject('S-000001', 'Color', 'Meaning', { aliases: [{ label: 'Hue' }] })]);
  lookupSubjects(registry, 'hue').matches[0].matches[0].label = 'Changed outside the index';
  assert.equal(lookupSubjects(registry, 'hue').matches[0].matches[0].label, 'Hue');
  assert.equal(registry.document.subjects[0].aliases[0].label, 'Hue');
});

test('the registry refuses duplicate exact IDs instead of selecting one meaning', () => {
  const result = index([
    subject('S-000001', 'Color', 'Visual perception'),
    subject('S-000001', 'Color', 'Political affiliation'),
  ]);
  assert.equal(result.ok, false);
  assert.equal(result.registry, null);
  assert.equal(result.diagnostics[0].code, 'duplicate-subject');
});

test('indexing uses exact shared subject identity and keeps proposals out of canonical subjects', () => {
  for (const id of ['S-000000', 'S-1', 's-000001', 'S-000001\n', 'D-000001']) {
    const result = index([subject(id, 'Invalid', 'Meaning')]);
    assert.equal(result.ok, false, id);
    assert.ok(result.diagnostics.some((d) => d.code === 'invalid-subject-id'), id);
  }
  const key = 'proposal:subject:12345678-1234-4234-8234-123456789abc';
  const { registry } = index([
    subject('S-000001', 'Color', 'Reviewed meaning'),
    subject(key, 'Color', 'Proposed meaning', { status: 'proposed' }),
  ]);
  assert.deepEqual([...registry.subjects.keys()], ['S-000001']);
  assert.deepEqual([...registry.proposals.keys()], [key]);
  assert.deepEqual(lookupSubjects(registry, 'Color').matches.map(({ id, status }) => ({ id, status })),
    [{ id: 'S-000001', status: 'active' }, { id: key, status: 'proposed' }]);
  assert.equal(index([subject(key, 'No promotion', 'Meaning')]).ok, false);
  assert.equal(index([subject('S-000001', 'Unpublished', 'Meaning', { status: 'proposed' })]).ok, false);
});

for (const [name, records, code] of [
  ['missing parent', [subject('S-000001', 'Child', 'Meaning', { parent: 'S-000009' })], 'missing-parent'],
  ['self parent', [subject('S-000001', 'Self', 'Meaning', { parent: 'S-000001' })], 'self-parent'],
  ['second parent', [subject('S-000001', 'Child', 'Meaning', { parent: ['S-000002', 'S-000003'] })], 'invalid-parent'],
  ['cycle', [subject('S-000001', 'One', 'Meaning', { parent: 'S-000002' }),
    subject('S-000002', 'Two', 'Meaning', { parent: 'S-000003' }),
    subject('S-000003', 'Three', 'Meaning', { parent: 'S-000001' })], 'parent-cycle'],
]) {
  test(`invalid forest refuses ${name}`, () => {
    const result = index(records);
    assert.equal(result.ok, false);
    assert.equal(result.registry, null);
    assert.ok(result.diagnostics.some((d) => d.code === code), JSON.stringify(result.diagnostics));
  });
}

test('disconnected semantic roots and a deep chain are valid, independent of input order', () => {
  const records = [subject('S-000001', 'Root', 'Meaning'), subject('S-000002', 'Other', 'Other meaning')];
  for (let n = 3; n <= 3000; n += 1) {
    records.push(subject(`S-${String(n).padStart(6, '0')}`, `Level ${n}`, 'Meaning',
      { parent: `S-${String(n - 1).padStart(6, '0')}` }));
  }
  const forward = index(records);
  const reverse = index([...records].reverse());
  assert.equal(forward.ok, true);
  assert.equal(reverse.ok, true);
  assert.deepEqual([...forward.registry.subjects.keys()], [...reverse.registry.subjects.keys()]);
});

const tree = () => index([
  subject('S-000001', 'Color', 'Meaning', { related: [{ type: 'association', target: 'S-000006' }] }),
  subject('S-000002', 'Red', 'Meaning', { parent: 'S-000001' }),
  subject('S-000003', 'Blue', 'Meaning', { parent: 'S-000001' }),
  subject('S-000004', 'Crimson', 'Meaning', { parent: 'S-000002' }),
  subject('S-000005', 'Policy', 'Meaning'),
  subject('S-000006', 'Culture', 'Meaning'),
]).registry;

test('parent traversal shares one forest and never transfers related membership', () => {
  const registry = tree();
  assert.deepEqual(subjectDescendants(registry, 'S-000001', { budget: { nodes: 4, edges: 3 } }), {
    status: 'complete', ids: ['S-000001', 'S-000002', 'S-000003', 'S-000004'], used: { nodes: 4, edges: 3 },
  });
  assert.deepEqual(subjectAncestors(registry, 'S-000004', { budget: { nodes: 3, edges: 2 } }), {
    status: 'complete', ids: ['S-000001', 'S-000002', 'S-000004'], used: { nodes: 3, edges: 2 },
  });
  assert.deepEqual(subjectAncestors(registry, 'S-000004', { includeSelf: false, budget: { nodes: 3, edges: 2 } }).ids,
    ['S-000001', 'S-000002']);
  assert.deepEqual(subjectDescendants(registry, 'S-000005', { includeSelf: false, budget: { nodes: 1, edges: 0 } }),
    { status: 'complete', ids: [], used: { nodes: 1, edges: 0 } });
});

test('node and edge budgets report partial positive witnesses, never complete negative sets', () => {
  const registry = tree();
  assert.deepEqual(subjectDescendants(registry, 'S-000001', { budget: { nodes: 2, edges: 4 } }), {
    status: 'incomplete', ids: ['S-000001', 'S-000002'], used: { nodes: 2, edges: 3 }, reason: 'node-budget',
  });
  assert.deepEqual(subjectDescendants(registry, 'S-000001', { budget: { nodes: 9, edges: 1 } }), {
    status: 'incomplete', ids: ['S-000001'], used: { nodes: 1, edges: 1 }, reason: 'edge-budget',
  });
  assert.deepEqual(subjectAncestors(registry, 'S-000004', { budget: { nodes: 2, edges: 1 } }), {
    status: 'incomplete', ids: ['S-000002', 'S-000004'], used: { nodes: 2, edges: 1 }, reason: 'edge-budget',
  });
  assert.deepEqual(subjectDescendants(registry, 'S-000001', { budget: { nodes: 0, edges: 0 } }), {
    status: 'incomplete', ids: [], used: { nodes: 0, edges: 0 }, reason: 'node-budget',
  });
});

test('invalid roots and budgets are typed failures instead of empty traversal', () => {
  const registry = tree();
  const options = { budget: { nodes: 9, edges: 9 } };
  for (const walk of [subjectDescendants, subjectAncestors]) {
    assert.throws(() => walk(registry, 'S-000009', options), { name: 'SubjectError', code: 'unknown-subject' });
    assert.throws(() => walk(registry, ' S-000001', options), { name: 'SubjectError', code: 'invalid-subject-id' });
    assert.throws(() => walk(null, 'S-000001', options), { name: 'SubjectError', code: 'subjects-unavailable' });
    assert.throws(() => walk(registry, 'S-000001', { budget: { nodes: -1, edges: 1 } }), SubjectError);
    assert.throws(() => walk(registry, 'S-000001', {}), { code: 'invalid-budget' });
  }
});

test('malformed lookup requests and unavailable registry remain typed operation failures', () => {
  const registry = tree();
  for (const value of ['', ' \u0085 ', 42, null]) {
    assert.throws(() => lookupSubjects(registry, value), { name: 'SubjectError', code: 'invalid-label' });
  }
  assert.throws(() => lookupSubjects(null, 'color'), { code: 'subjects-unavailable' });
  assert.throws(() => lookupSubjects({}, 'color'), { code: 'invalid-subject-registry' });
  assert.throws(() => lookupSubjects(registry, 'color', { language: 'en' }), { code: 'invalid-options' });
  assert.throws(() => lookupSubjects(registry, 'color', { context: ' ' }), { code: 'invalid-options' });
});

test('metadata shape errors cannot produce an apparently usable subject index', () => {
  for (const malformed of [
    subject('S-000001', ' \u0085 ', 'Meaning'),
    subject('S-000001', 'Name', 'Meaning', { aliases: [{ label: ' ' }] }),
    subject('S-000001', 'Name', 'Meaning', { aliases: [{ label: 'Alias', locale: '' }] }),
    subject('S-000001', 'Name', 'Meaning', { definition: { text: '', includes: [], excludes: [] } }),
  ]) {
    assert.equal(index([malformed]).ok, false);
  }
  assert.equal(indexSubjects({ schemaVersion: 2, namespace, revision: 0, hierarchyRevision: 0, subjects: [] }).ok, false);
  assert.equal(indexSubjects({ schemaVersion: 1, namespace: '', revision: 0, hierarchyRevision: 0, subjects: [] }).ok, false);
});
