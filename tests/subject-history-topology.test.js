import test from 'node:test';
import assert from 'node:assert/strict';
import { subjectGovernanceFixture } from './helpers/subject-governance-fixture.js';
import { indexSubjects } from '../payload/engine/lib/subjects.js';
import { validateSubjectRegistryMetadata, evaluateSubjectGovernance } from '../payload/engine/lib/subject-governance.js';
import { createSubjectValidationBudget } from '../payload/engine/lib/subject-validation-budget.js';
import { buildIdentityIndex } from '../payload/engine/lib/record-identity-index.js';
import { canonicalSha256 } from '../payload/engine/lib/canonical-json.js';

const limits = { maxCaptureBytes: 1000000, maxDocumentNodes: 1000000, maxDocumentTextUnits: 1000000,
  maxSubjects: 1000000, maxHistoryRows: 1000000, maxValidationSteps: 1000000 };
const edge = (target) => ({ type: 'association', target });
const seal = (event) => { const { review, ...body } = event; event.review.changeDigest = canonicalSha256(body); };
const state = ({ id, changes, ...value }) => structuredClone(value);

function fixture() {
  const f = subjectGovernanceFixture(); const creation = f.document.history[0];
  for (const id of ['S-000002', 'S-000003']) {
    const after = { ...structuredClone(creation.rows[0].after), label: id };
    creation.rows.push({ id, before: null, after });
    f.document.subjects.push({ id, ...structuredClone(after), changes: [creation.id] });
  }
  f.identityInput.identity.allocations.push({ ...f.identityInput.identity.allocations[1], id: 'S-000003' });
  seal(creation); return f;
}

function append(f, action, edits) {
  const count = f.document.history.length;
  const event = { id: `34567890-1234-4234-8234-${String(count).padStart(12, '0')}`,
    action, decision: f.document.history[0].decision, unchangedMeaning: true,
    reason: 'Reviewed atomic change', rows: [] };
  for (const [id, change] of edits) {
    const subject = f.document.subjects.find((row) => row.id === id);
    const before = subject ? state(subject) : null;
    const after = change(before && structuredClone(before));
    event.rows.push({ id, before, after, reason: 'Reviewed participant' });
    const next = { id, ...structuredClone(after), changes: [...(subject?.changes ?? []), event.id] };
    if (subject) f.document.subjects[f.document.subjects.indexOf(subject)] = next;
    else {
      f.document.subjects.push(next);
      f.identityInput.identity.allocations.push({ ...f.identityInput.identity.allocations[1], id });
    }
  }
  event.review = { ...f.document.history[0].review }; seal(event);
  f.document.history.push(event); f.document.revision += 1;
  return event;
}

function check(f, budget = createSubjectValidationBudget(limits)) {
  const indexed = indexSubjects(f.document);
  assert.equal(indexed.ok, true, JSON.stringify(indexed.diagnostics));
  return { result: validateSubjectRegistryMetadata(indexed.registry,
    { identity: f.identityInput.identity, operationBudget: budget }), budget };
}

test('metadata-only history fits actual row visits plus one complete forest, preserving evidence semantics', () => {
  const f = fixture(); append(f, 'rename', [['S-000001', (before) => ({ ...before, label: 'Renamed' })]]);
  const snapshot = structuredClone(f.document);
  const budget = createSubjectValidationBudget({ ...limits, maxSubjects: 10 });
  assert.equal(check(f, budget).result.ok, true);
  assert.equal(budget.used.subjects, 10, 'four metadata rows plus one three-node forest and its seeded local graph');
  assert.equal(budget.used.historyRows, 4);
  assert.deepEqual(f.document, snapshot);
  const evaluated = evaluateSubjectGovernance({ registry: indexSubjects(f.document).registry,
    identity: f.identityInput.identity, identityIndex: buildIdentityIndex(f.identityInput), decisionCaptures: f.decisionCaptures });
  assert.equal(evaluated.ok, true, JSON.stringify(evaluated.diagnostics));
});

test('a new vertex receives endpoint and cycle validation after metadata-only reuse', () => {
  const f = fixture(); append(f, 'rename', [['S-000001', (before) => ({ ...before, label: 'Renamed' })]]);
  append(f, 'activate', [['S-000004', () => ({ ...state(f.document.subjects[0]), label: 'Fourth', parent: 'S-000001' })]]);
  const budget = createSubjectValidationBudget({ ...limits, maxSubjects: 11 });
  assert.throws(() => check(f, budget), { code: 'subject-validation-budget', phase: 'history-topology-endpoint', attempted: 1, remaining: 0 });
  assert.equal(check(f).budget.used.subjects, 14);
});

test('dependency comparison consumes a validation step before graph proof reuse', () => {
  const f = fixture(); append(f, 'rename', [['S-000001', (row) => ({ ...row, label: 'Renamed' })]]);
  const budget = createSubjectValidationBudget({ ...limits, maxValidationSteps: 10 });
  assert.throws(() => check(f, budget), { code: 'subject-validation-budget',
    counter: 'validationSteps', phase: 'history-topology-comparison', attempted: 1, remaining: 0 });
});

for (const [name, edits] of [
  ['parent cycle', [['S-000001', (row) => ({ ...row, parent: 'S-000002' })], ['S-000002', (row) => ({ ...row, parent: 'S-000001' })]]],
  ['missing parent', [['S-000001', (row) => ({ ...row, parent: 'S-000099' })]]],
  ['self parent', [['S-000001', (row) => ({ ...row, parent: 'S-000001' })]]],
  ['duplicate undirected association', [['S-000001', (row) => ({ ...row, related: [edge('S-000002')] })], ['S-000002', (row) => ({ ...row, related: [edge('S-000001')] })]]],
  ['dangling association', [['S-000001', (row) => ({ ...row, related: [edge('S-000099')] })]]],
  ['self association', [['S-000001', (row) => ({ ...row, related: [edge('S-000001')] })]]],
  ['association extra field', [['S-000001', (row) => ({ ...row, related: [{ ...edge('S-000002'), extra: true }] })]]],
]) test(`invalid intermediate ${name} still refuses when later repaired`, () => {
  const f = fixture(); append(f, 'rename', [['S-000003', (row) => ({ ...row, label: 'Graph proof reused' })]]);
  const originals = new Map(f.document.subjects.map((row) => [row.id, state(row)]));
  append(f, 'reparent', edits);
  append(f, 'reparent', edits.map(([id]) => [id, () => originals.get(id)]));
  const { result } = check(f);
  assert.equal(result.ok, false);
  assert.equal(result.diagnostics[0].code, 'invalid-history-forest');
});

for (const [name, patch] of [['label', { label: '' }], ['lifecycle', { status: 'invented' }],
  ['alias', { aliases: [{ label: 'Alias', unexpected: true }] }]]) {
  test(`unchanged graph does not excuse invalid ${name} metadata later repaired`, () => {
    const f = fixture(); const original = state(f.document.subjects[0]);
    append(f, 'rename', [['S-000001', (row) => ({ ...row, ...patch })]]);
    append(f, 'rename', [['S-000001', () => original]]);
    const { result } = check(f);
    assert.equal(result.ok, false); assert.equal(result.diagnostics[0].code, 'invalid-history');
  });
}

test('association order changes revalidate all declared endpoints even when identities are identical', () => {
  const f = fixture(); const creation = f.document.history[0];
  creation.rows[0].after.related = [edge('S-000002'), edge('S-000003')];
  f.document.subjects[0].related = structuredClone(creation.rows[0].after.related); seal(creation);
  append(f, 'relate', [['S-000001', (row) => ({ ...row, related: [...row.related].reverse() })]]);
  assert.equal(check(f).budget.used.subjects, 12);
});

test('graph proof is local: repeated independent checks debit the same actual work', () => {
  const f = fixture(); append(f, 'clarify', [['S-000001', (row) => ({ ...row, definition: { ...row.definition, text: 'More precise text' } })]]);
  const budget = createSubjectValidationBudget(limits);
  assert.equal(check(f, budget).result.ok, true); const used = budget.used;
  assert.equal(check(f, budget).result.ok, true);
  assert.equal(budget.used.subjects, used.subjects * 2);
  assert.equal(budget.used.validationSteps, used.validationSteps * 2);
});

test('an unsuccessful history check cannot cache graph approval for a changed retry', () => {
  const f = fixture();
  const bad = append(f, 'rename', [['S-000001', (row) => ({ ...row, label: '' })]]);
  const original = state(f.document.subjects[1]);
  append(f, 'rename', [['S-000001', () => ({ ...original, label: 'Repaired' })]]);
  assert.equal(check(f).result.ok, false);
  bad.rows[0].after.label = 'Fixed metadata'; bad.rows[0].after.parent = 'S-000099'; seal(bad);
  f.document.history[2].rows[0].before = structuredClone(bad.rows[0].after); seal(f.document.history[2]);
  const retry = check(f).result;
  assert.equal(retry.ok, false); assert.equal(retry.diagnostics[0].code, 'invalid-history-forest');
});
