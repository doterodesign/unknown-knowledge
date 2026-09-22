import { test } from 'node:test';
import assert from 'node:assert/strict';
import { subjectSplitHistoryFixture, splitHistoryState } from './helpers/subject-split-history-fixture.js';
import { subjectEligibility, validateSubjectTransition, getSubjectGovernanceDescriptor } from '../payload/engine/lib/subject-governance.js';
import { createSubjectValidationBudget } from '../payload/engine/lib/subject-validation-budget.js';
import { promotionLimits } from './helpers/subject-promotion-fixture.js';

const historical = governance => subjectEligibility(governance, 'S-000001', { purpose: 'query', policy: 'historical' });
const succeeds = f => {
  assert.equal(f.model.ok, true, JSON.stringify(f.model.diagnostics));
  const result = f.evaluate(); assert.equal(result.ok, true, JSON.stringify(result.diagnostics)); return result;
};

for (const objectFormat of ['sha1', 'sha256']) test(`actual ${objectFormat} committed split history preserves source and verified alternatives`, t => {
  const f = subjectSplitHistoryFixture(t, { objectFormat, nested: objectFormat === 'sha256', count: objectFormat === 'sha1' ? 2 : 3 });
  const { governance } = succeeds(f);
  assert.equal(historical(governance).verification, 'verified');
  assert.deepEqual(f.split.rows[0].before, splitHistoryState(f.beforeDocument.subjects[0]));
  for (const policy of ['current', 'equivalent']) {
    const outcome = subjectEligibility(governance, 'S-000001', { purpose: 'query', policy });
    assert.equal(outcome.code, 'subject-split'); assert.equal(outcome.eligible, false);
    assert.equal(outcome.verification, 'not-required'); assert.deepEqual(outcome.resolution.alternatives, f.ids);
  }
  for (const id of f.ids) assert.equal(subjectEligibility(governance, id, { purpose: 'new-assignment' }).eligible, true);
  assert.equal(f.decisionCaptures[0].capture.source.commit.length, objectFormat === 'sha1' ? 40 : 64);
  assert.deepEqual(f.beforeCaptures.registry.capture.source, { commit: f.before.commit, tree: f.before.tree });
});

test('missing activation assessment evidence cannot leave the split source historically verified', t => {
  const f = subjectSplitHistoryFixture(t); f.assessmentCaptures = [];
  const { governance } = succeeds(f);
  assert.equal(historical(governance).eligible, null);
  assert.equal(historical(governance).verification, 'unavailable');
  assert.equal(subjectEligibility(governance, f.ids[0], { purpose: 'new-assignment' }).eligible, null);
  assert.deepEqual(getSubjectGovernanceDescriptor(governance).events.slice(-2).map(row => row.verification), ['unavailable', 'unavailable']);
});

for (const [name, mutate] of [
  ['fewer than two successors', f => { f.activation.rows.pop(); f.activation.rows.pop(); f.split.rows[0].after.retirement.successors = [f.ids[0]]; }],
  ['permuted successor set', f => { f.split.rows[0].after.retirement.successors = [...f.ids].reverse(); }],
  ['missing successor', f => { f.split.rows[0].after.retirement.successors = f.ids.slice(0, 2); }],
  ['duplicate successor', f => { f.split.rows[0].after.retirement.successors = [f.ids[0], f.ids[0]]; }],
  ['source as successor', f => { f.split.rows[0].after.retirement.successors = ['S-000001', f.ids[0]]; }],
  ['existing successor', f => { f.split.rows[0].after.retirement.successors = ['S-000002', f.ids[0]]; }],
  ['source meaning rewrite', f => { f.split.rows[0].after.definition.text = 'Different meaning'; }],
  ['source parent rewrite', f => { f.split.rows[0].after.parent = 'S-000003'; }],
  ['source warrant rewrite', f => { f.split.rows[0].after.warrant.sources.push({ locator: 'different', revision: 'v1' }); }],
  ['extra source carry-forward', f => { const before = splitHistoryState(f.beforeDocument.subjects[2]); f.split.rows.push({ id: 'S-000003', before, after: structuredClone(before), reason: 'Extra participant' }); }],
  ['missing split reason', f => { delete f.split.reason; }],
  ['missing activation assessment', f => { delete f.activation.refusalAssessment; }],
  ['assessment on split', f => { f.split.refusalAssessment = structuredClone(f.activation.refusalAssessment); }],
  ['action-specific split field', f => { f.split.unchangedMeaning = true; }],
  ['action-specific activation field', f => { f.activation.unchangedMeaning = true; }],
  ['promotion activation', f => { f.activation.promotes = { key: 'proposal:subject:a1000000-0000-4000-8000-000000000008', before: {} }; }],
  ['duplicate activation row', f => { f.activation.rows.push(structuredClone(f.activation.rows[0])); }],
  ['non-null successor before', f => { f.activation.rows[0].before = structuredClone(f.activation.rows[0].after); }],
  ['reversed events', f => { f.document.history.splice(-2, 2, f.split, f.activation); }],
  ['nonadjacent events', f => { const before = splitHistoryState(f.beforeDocument.subjects[2]); f.document.history.splice(-1, 0, {
    id: 'a1000000-0000-4000-8000-000000000004', action: 'rename', unchangedMeaning: true,
    decision: f.split.decision, review: { ...f.split.review }, rows: [{ id: 'S-000003', before, after: { ...before, label: 'Renamed' } }] }); }],
]) test(`split history refuses ${name}`, t => {
  const f = subjectSplitHistoryFixture(t); mutate(f); f.reload();
  const result = f.evaluate(); assert.equal(result.ok, false, name); assert.equal(result.governance, null);
});

for (const [field, mutate] of [
  ['ref', f => { f.split.decision = { ...f.split.decision, id: 'D-000002' }; }],
  ['reference', f => { f.split.review.reference = 'review:other'; }],
  ['acceptedStatus', f => { f.split.review.acceptedStatus = 'addressed'; }],
  ['decisionDigest', f => { f.split.review.decisionDigest = 'a'.repeat(64); }],
  ['decisionCapture source', f => { f.split.review.decisionCapture.source.tree = 'a'.repeat(40); }],
]) test(`split history refuses a changed ${field} in the shared Decision tuple`, t => {
  const f = subjectSplitHistoryFixture(t); mutate(f); f.reload();
  const result = f.evaluate(); assert.equal(result.ok, false, field);
  assert.ok(result.diagnostics.some(row => row.code === 'invalid-split-history'), JSON.stringify(result.diagnostics));
});

for (const [name, parents, expected] of [
  ['fresh parent', [undefined, 'S-000004'], true],
  ['existing active parent', ['S-000003'], true],
  ['active descendant of source', ['S-000002'], true],
  ['retiring source parent', ['S-000001'], false],
  ['self parent', ['S-000004'], false],
  ['missing parent', ['S-999999'], false],
  ['cycle', ['S-000005', 'S-000004'], false],
]) test(`split history checks ${name} at pair completion`, t => {
  const f = subjectSplitHistoryFixture(t, { parents });
  const result = f.evaluate(); assert.equal(result.ok, expected, JSON.stringify(result.diagnostics));
});

test('an already retired existing parent refuses despite a structurally valid forest', t => {
  const f = subjectSplitHistoryFixture(t, { parents: ['S-000003'], retiredParent: true });
  assert.equal(f.model.ok, true, JSON.stringify(f.model.diagnostics));
  const result = f.evaluate(); assert.equal(result.ok, false);
  assert.ok(result.diagnostics.some(row => row.code === 'invalid-split-history'), JSON.stringify(result.diagnostics));
});

test('later parent/successor retirement and Decision archival do not rewrite historical pair eligibility', t => {
  const f = subjectSplitHistoryFixture(t, { parents: ['S-000003'] });
  for (const [i, id] of ['S-000003', f.ids[1]].entries()) {
    const before = splitHistoryState(f.document.subjects.find(row => row.id === id));
    f.document.history.push({ id: `a1000000-0000-4000-8000-00000000000${i + 4}`, action: 'retire',
      decision: structuredClone(f.split.decision), review: structuredClone(f.split.review), reason: 'Later reviewed retirement',
      rows: [{ id, before, after: { ...before, status: 'retired', retirement: { kind: 'retire' } } }] });
  }
  const decision = JSON.parse(f.read('decisions/entries/approval.yaml')); decision.entries[0].status = 'archived';
  f.put('decisions/entries/approval.yaml', decision); f.reload();
  const { governance } = succeeds(f); assert.equal(historical(governance).verification, 'verified');
  assert.equal(subjectEligibility(governance, f.ids[0], { purpose: 'query' }).eligible, true);
});

test('corrupt or ambiguous retained evidence refuses and absent Decision evidence is unavailable', t => {
  const f = subjectSplitHistoryFixture(t);
  const retained = f.decisionCaptures;
  f.decisionCaptures = []; assert.equal(historical(succeeds(f).governance).verification, 'unavailable');
  f.decisionCaptures = [retained[0], retained[0]]; assert.equal(f.evaluate().ok, false);
  f.decisionCaptures = [{ ...retained[0], bytes: Buffer.from('corrupt') }]; assert.equal(f.evaluate().ok, false);
  f.decisionCaptures = retained; f.assessmentCaptures = [f.beforeCaptures, f.beforeCaptures]; assert.equal(f.evaluate().ok, false);
  f.assessmentCaptures = [{ ...f.beforeCaptures, identity: { ...f.beforeCaptures.identity, bytes: Buffer.from('corrupt') } }];
  assert.equal(f.evaluate().ok, false);
});

test('ordinary new transition still refuses the complete split pair and standalone split', t => {
  const f = subjectSplitHistoryFixture(t);
  for (const before of [f.beforeDocument, { ...f.document, history: f.document.history.slice(0, -1),
    subjects: [...f.beforeDocument.subjects, ...f.activation.rows.map(row => ({ id: row.id, ...row.after, changes: [f.activation.id] }))],
    revision: f.document.revision - 1 }]) {
    const result = validateSubjectTransition({ before, candidate: f.document, model: f.model,
      identityIndex: f.model.identityIndex, decisionCaptures: f.decisionCaptures, assessmentCaptures: f.assessmentCaptures });
    assert.equal(result.ok, false); assert.ok(result.diagnostics.some(row => row.code === 'unsupported-action'), JSON.stringify(result.diagnostics));
  }
});

test('split history shares exact operation capacities and sticky failure through evidence dependency', t => {
  const f = subjectSplitHistoryFixture(t);
  const budget = createSubjectValidationBudget(promotionLimits);
  assert.equal(f.evaluate({ operationBudget: budget }).ok, true);
  const counters = { captureBytes: 'maxCaptureBytes', documentNodes: 'maxDocumentNodes', documentTextUnits: 'maxDocumentTextUnits',
    subjects: 'maxSubjects', historyRows: 'maxHistoryRows', validationSteps: 'maxValidationSteps' };
  const exact = Object.fromEntries(Object.entries(counters).map(([counter, limit]) => [limit, budget.used[counter]]));
  assert.equal(f.evaluate({ operationBudget: createSubjectValidationBudget(exact) }).ok, true);
  for (const [counter, limit] of Object.entries(counters)) {
    const short = createSubjectValidationBudget({ ...exact, [limit]: exact[limit] - 1 });
    assert.throws(() => f.evaluate({ operationBudget: short }), { code: 'subject-validation-budget' }, counter);
    const used = short.used; const failure = short.failure;
    if (counter === 'validationSteps') assert.equal(failure.phase, 'split-activation-verification');
    assert.throws(() => f.evaluate({ operationBudget: short }), { code: 'subject-validation-budget' });
    assert.deepEqual(short.used, used); assert.deepEqual(short.failure, failure);
  }
});
