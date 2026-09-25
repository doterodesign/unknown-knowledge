import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as subjects from '../payload/engine/lib/subjects.js';

const namespace = '12345678-1234-4234-8234-123456789abc';
const proposal = `proposal:subject:${namespace}`;
const subject = (id, extra = {}) => ({ id, label: id,
  definition: { text: `Meaning of ${id}`, includes: [], excludes: [] },
  aliases: [], related: [], status: 'active', ...extra });
const edge = (target) => ({ type: 'association', target });
const index = (records) => subjects.indexSubjects({ schemaVersion: 1, namespace,
  revision: 0, hierarchyRevision: 0, subjects: records });

for (const [name, related, code] of [
  ['unknown type', [{ type: 'hierarchy', target: 'S-000002' }], 'invalid-related'],
  ['authored direction', [{ ...edge('S-000002'), direction: 'inverse' }], 'invalid-related'],
  ['null edge', [null], 'invalid-related'],
  ['missing type', [{ target: 'S-000002' }], 'invalid-related'],
  ['noncanonical target', [edge(proposal)], 'invalid-related'],
  ['normalized target', [edge('s-000002')], 'invalid-related'],
  ['dangling target', [edge('S-000099')], 'missing-related'],
  ['self link', [edge('S-000001')], 'self-related'],
  ['duplicate declaration', [edge('S-000002'), edge('S-000002')], 'duplicate-related'],
]) {
  test(`related graph refuses ${name}`, () => {
    const result = index([subject('S-000001', { related }), subject('S-000002')]);
    assert.equal(result.ok, false);
    assert.equal(result.registry, null);
    assert.ok(result.diagnostics.some((d) => d.code === code), JSON.stringify(result.diagnostics));
  });
}

test('related graph refuses reciprocal authored declarations', () => {
  const result = index([subject('S-000001', { related: [edge('S-000002')] }),
    subject('S-000002', { related: [edge('S-000001')] })]);
  assert.equal(result.ok, false);
  assert.ok(result.diagnostics.some((d) => d.code === 'duplicate-related'));
});

const related = (registry, id, edges) => subjects.subjectRelated(registry, id, { budget: { edges } });
const identity = (id, declaredStatus = 'active') => ({ id,
  identityKind: id.startsWith('proposal:') ? 'proposal' : 'canonical', declaredStatus });

test('one authored association exposes both directions with exact provenance and no transitivity', () => {
  const records = [subject('S-000003', { related: [edge('S-000002')] }),
    subject('S-000002', { related: [edge('S-000001')] }), subject('S-000001')];
  const { registry } = index(records);
  const original = structuredClone(registry.document);
  assert.deepEqual(related(registry, 'S-000002', 2), {
    status: 'complete', requested: identity('S-000002'), ids: ['S-000001', 'S-000003'],
    neighbors: [
      { ...identity('S-000001'), witness: { type: 'association', source: 'S-000002', target: 'S-000001',
        from: 'S-000002', to: 'S-000001', derivedInverse: false } },
      { ...identity('S-000003'), witness: { type: 'association', source: 'S-000003', target: 'S-000002',
        from: 'S-000002', to: 'S-000003', derivedInverse: true } },
    ], used: { edges: 2 },
  });
  assert.deepEqual(related(registry, 'S-000001', 9).ids, ['S-000002']);
  assert.deepEqual(related(index([...records].reverse()).registry, 'S-000002', 2), related(registry, 'S-000002', 2));
  const changed = related(registry, 'S-000002', 2);
  changed.neighbors[0].witness.source = 'S-000099';
  assert.equal(related(registry, 'S-000002', 2).neighbors[0].witness.source, 'S-000002');
  assert.deepEqual(registry.document, original);
  assert.deepEqual(subjects.subjectDescendants(registry, 'S-000002', { budget: { nodes: 1, edges: 0 } }).ids, ['S-000002']);
});

test('draft and suppressed inverse inspection retains proposal identity and declared status', () => {
  for (const status of ['proposed', 'suppressed']) {
    const { registry } = index([subject(proposal, { status, related: [edge('S-000002')] }),
      subject('S-000002', { status: 'retired', retirement: { kind: 'equivalent-merge', redirect: 'S-000003' } }),
      subject('S-000003')]);
    const inverse = related(registry, 'S-000002', 1);
    assert.deepEqual(inverse.requested, identity('S-000002', 'retired'));
    assert.deepEqual(inverse.ids, [proposal]);
    assert.deepEqual(inverse.neighbors, [{ ...identity(proposal, status), witness: {
      type: 'association', source: proposal, target: 'S-000002', from: 'S-000002', to: proposal, derivedInverse: true } }]);
    assert.deepEqual(related(registry, proposal, 1).neighbors[0], { ...identity('S-000002', 'retired'), witness: {
      type: 'association', source: proposal, target: 'S-000002', from: proposal, to: 'S-000002', derivedInverse: false } });
    assert.deepEqual(related(registry, 'S-000003', 1).ids, [], 'inspection follows no retirement redirect');
  }
});

test('edge budgets return a deterministic prefix and explicit incomplete coverage', () => {
  const { registry } = index([subject('S-000001', { related: [edge('S-000003'), edge('S-000002')] }),
    subject('S-000002'), subject('S-000003'), subject('S-000004')]);
  for (const budget of [0, 1]) {
    const result = related(registry, 'S-000001', budget);
    assert.equal(result.status, 'incomplete');
    assert.equal(result.reason, 'edge-budget');
    assert.deepEqual(result.used, { edges: budget });
    assert.deepEqual(result.ids, ['S-000002', 'S-000003'].slice(0, budget));
    assert.deepEqual(result.neighbors.map(({ id }) => id), result.ids);
  }
  assert.equal(related(registry, 'S-000001', 2).status, 'complete');
  assert.deepEqual(related(registry, 'S-000004', 0), { status: 'complete', requested: identity('S-000004'),
    ids: [], neighbors: [], used: { edges: 0 } });
});

test('invalid selectors and options refuse with typed errors instead of empty navigation', () => {
  const { registry } = index([subject('S-000001')]);
  assert.throws(() => related(null, 'S-000001', 1), { code: 'subjects-unavailable' });
  assert.throws(() => related({}, 'S-000001', 1), { code: 'invalid-subject-registry' });
  for (const id of ['s-000001', ' S-000001', 'S-000001\n', 'D-000001', 'proposal:subject:bad']) {
    assert.throws(() => related(registry, id, 1), { code: 'invalid-subject-id' });
  }
  assert.throws(() => related(registry, 'S-000009', 1), { code: 'unknown-subject' });
  for (const options of [null, { includeSelf: true, budget: { edges: 1 } }, { policy: 'current' }]) {
    assert.throws(() => subjects.subjectRelated(registry, 'S-000001', options), { code: 'invalid-options' });
  }
  for (const budget of [undefined, null, {}, { edges: -1 }, { edges: 1.2 }, { edges: Infinity },
    { edges: Number.MAX_SAFE_INTEGER + 1 }, { edges: 1, nodes: 1 }]) {
    assert.throws(() => subjects.subjectRelated(registry, 'S-000001', { budget }), { code: 'invalid-budget' });
  }
});
