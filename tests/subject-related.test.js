import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as subjects from '../payload/engine/lib/subjects.js';
import { canonicalSha256 } from '../payload/engine/lib/canonical-json.js';
import { evaluateSubjectGovernance, validateSubjectPromotion } from '../payload/engine/lib/subject-governance.js';
import { subjectGovernanceFixture } from './helpers/subject-governance-fixture.js';
import { subjectPromotionFixture } from './helpers/subject-promotion-fixture.js';
import { SUBJECT_REGISTRY_DIAGNOSTIC_CODES } from '../payload/engine/lib/subject-registry-reader.js';

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

const digestEvent = ({ review, ...event }) => canonicalSha256(event);
function relatedHistory(firstEdges, secondEdges = []) {
  const f = subjectGovernanceFixture();
  const creation = f.document.history[0];
  const first = { ...structuredClone(creation.rows[0].after), related: firstEdges };
  const second = { ...structuredClone(first), label: 'Second meaning', related: secondEdges };
  creation.rows = [{ id: 'S-000001', before: null, after: first },
    { id: 'S-000002', before: null, after: second }];
  creation.review.changeDigest = digestEvent(creation);
  const event = { id: '34567890-1234-4234-8234-123456789abc', action: 'relate',
    decision: creation.decision, rows: [{ id: 'S-000001', before: first, after: { ...first, related: [] } }] };
  event.review = { ...creation.review, changeDigest: digestEvent(event) };
  f.document.history.push(event);
  f.document.revision = 2;
  f.document.subjects = [{ id: 'S-000001', ...event.rows[0].after, changes: [creation.id, event.id] },
    { id: 'S-000002', ...second, changes: [creation.id] }];
  return f;
}
function evaluate(f) {
  return evaluateSubjectGovernance({ registry: subjects.indexSubjects(f.document).registry,
    identity: f.identityInput.identity, identityIndex: f.identityIndex, decisionCaptures: f.decisionCaptures });
}

for (const [name, first, second] of [
  ['self', [edge('S-000001')], []],
  ['dangling', [edge('S-000099')], []],
  ['reciprocal', [edge('S-000002')], [edge('S-000001')]],
]) {
  test(`a later relation edit cannot conceal an invalid historical ${name} edge`, () => {
    const f = relatedHistory(first, second);
    assert.equal(subjects.indexSubjects(f.document).ok, true, 'final graph is valid');
    const result = evaluate(f);
    assert.equal(result.ok, false);
    assert.equal(result.diagnostics[0].code, 'invalid-history-forest');
  });
}

test('historical relation validation includes unchanged endpoints and preserves authored snapshots', () => {
  const f = relatedHistory([edge('S-000002')]);
  const before = structuredClone(f.document);
  assert.equal(evaluate(f).ok, true);
  assert.deepEqual(f.document, before);
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

test('actual loaded promotion rejects dangling and self links through registered diagnostics', (t) => {
  for (const [target, code] of [['S-000099', 'missing-related'], ['S-000001', 'self-related']]) {
    const f = subjectPromotionFixture(t);
    f.event.rows[0].after.related = [edge(target)];
    f.candidate.subjects.find(({ id }) => id === 'S-000001').related = [edge(target)];
    f.reload();
    assert.equal(f.candidateModel.ok, false);
    assert.ok(f.candidateModel.diagnostics.some((d) => d.code === code), JSON.stringify(f.candidateModel.diagnostics));
    assert.ok(SUBJECT_REGISTRY_DIAGNOSTIC_CODES.includes(code));
    assert.equal(validateSubjectPromotion(f).ok, false);
  }
});

test('actual promotion can relate to an unchanged canonical endpoint without rewriting its history', (t) => {
  const f = subjectPromotionFixture(t, { parentStatus: 'active' });
  const targetBefore = structuredClone(f.candidate.subjects.find(({ id }) => id === 'S-000002'));
  f.event.rows[0].after.related = [edge('S-000002')];
  f.candidate.subjects.find(({ id }) => id === 'S-000001').related = [edge('S-000002')];
  f.reload();
  assert.equal(f.candidateModel.ok, true, JSON.stringify(f.candidateModel.diagnostics));
  const result = validateSubjectPromotion(f);
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  assert.equal(result.publicationReady, false);
  assert.deepEqual(f.candidate.subjects.find(({ id }) => id === 'S-000002'), targetBefore);
  assert.equal(related(f.candidateModel.subjectRegistry, 'S-000002', 1).neighbors[0].witness.derivedInverse, true);
});
