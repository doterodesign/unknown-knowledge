import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareSubjectReplays, compareAssignmentReplays } from '../payload/engine/lib/subject-replay-impact.js';
import { querySubjects } from '../payload/engine/lib/subject-query.js';
import { subjectQueryDiskFixture } from './helpers/subject-query-disk-fixture.js';
import { subjectQuery, queryBudgets, subjectQueryFixture } from './helpers/subject-query-fixture.js';
import { canonicalJsonBytes, canonicalSha256 } from '../payload/engine/lib/canonical-json.js';
import { indexSubjects } from '../payload/engine/lib/subjects.js';
import { evaluateSubjectGovernance } from '../payload/engine/lib/subject-governance.js';

const limits = { version: 1, maxSubjects: 3, maxEligibilityRedirects: 0, maxCases: 72, maxInventoryBytes: 100000 };
const paired = (context) => ({ version: 1, before: { capturedInputRef: 'before', context },
  after: { capturedInputRef: 'after', context } });

function setup(t) {
  const f = subjectQueryDiskFixture(t);
  const after = { ...f.context, model: { ...f.context.model,
    leaves: new Map([...f.context.model.leaves].map(([id, entry]) => [id, structuredClone(entry)])) } };
  after.model.leaves.get('K-000005').record.subjects = [];
  const sides = { version: 1, before: { capturedInputRef: 'before', context: f.context },
    after: { capturedInputRef: 'after', context: after } };
  return { ...f, after, sides };
}

test('actual replay retains both raw outputs and unknown-to-empty possible membership changes', (t) => {
  const f = setup(t);
  const query = subjectQuery({ op: 'assigned', subject: 'S-000003' }, { possibleMatches: true });
  const result = compareSubjectReplays({ ...f.sides,
    inventory: { version: 1, coverage: 'complete', cases: [{ id: 'unrelated', query }] },
    limits: { version: 1, maxCases: 1, maxInventoryBytes: 10000 } });
  assert.equal(result.status, 'complete');
  assert.deepEqual(result.cases[0].before, querySubjects(f.context, query, { collect: 'results' }));
  assert.deepEqual(result.cases[0].after, querySubjects(f.after, query, { collect: 'results' }));
  assert.deepEqual(result.cases[0].candidates.possible.removed.map(({ ref }) => ref.id), ['K-000005']);
});

test('whole supplied inventory count and exact canonical byte admission execute no prefix', (t) => {
  const f = setup(t);
  const inventory = { version: 1, coverage: 'complete', cases: [
    { id: 'a', query: subjectQuery({ op: 'all' }, { possibleMatches: true }) },
    { id: 'b', query: subjectQuery({ op: 'none' }, { possibleMatches: true }) },
  ] };
  const bytes = canonicalJsonBytes(inventory).length;
  for (const caps of [{ maxCases: 1, maxInventoryBytes: bytes }, { maxCases: 2, maxInventoryBytes: bytes - 1 }]) {
    const result = compareSubjectReplays({ ...f.sides, inventory, limits: { version: 1, ...caps } });
    assert.equal(result.status, 'incomplete');
    assert.equal(result.resources.queries.calls, 0);
    assert.deepEqual(result.cases, []);
    assert.deepEqual(result.coverage.unassessedCaseIds, ['a', 'b']);
    assert.equal(result.coverage.candidateDeltasComplete, false);
    assert.equal(result.input.inventoryDigest, canonicalSha256(inventory));
    assert.deepEqual(result.input.replays, []);
  }
  assert.equal(compareSubjectReplays({ ...f.sides, inventory,
    limits: { version: 1, maxCases: 2, maxInventoryBytes: bytes } }).status, 'complete');
});

test('null, empty and partial inventory coverage remain distinct', (t) => {
  const f = setup(t); const caps = { version: 1, maxCases: 1, maxInventoryBytes: 10000 };
  for (const inventory of [undefined, null]) {
    const result = compareSubjectReplays({ ...f.sides, inventory, limits: caps });
    assert.equal(result.status, 'not-assessed'); assert.equal(result.input, null);
  }
  const empty = { version: 1, coverage: 'complete', cases: [] };
  assert.equal(compareSubjectReplays({ ...f.sides, inventory: empty, limits: caps }).status, 'complete');
  assert.equal(compareSubjectReplays({ ...f.sides, inventory: { ...empty, coverage: 'partial' }, limits: caps }).status, 'incomplete');
});

test('empty and over-limit inventory still require both authentic model bindings', (t) => {
  const f = setup(t);
  for (const cases of [[], [{ id: 'all', query: subjectQuery({ op: 'all' }) }]]) for (const side of ['before', 'after']) {
    const input = { ...f.sides, inventory: { version: 1, coverage: 'complete', cases },
      limits: { version: 1, maxCases: 0, maxInventoryBytes: 0 } };
    input[side] = { ...input[side], context: { ...input[side].context,
      model: { ...input[side].context.model, identityIndex: {} } } };
    const result = compareSubjectReplays(input);
    assert.equal(result.status, 'refused');
    assert.equal(result.diagnostics[0].side, side);
  }
});

test('query scan, page and explanation shortfalls keep unavailable deltas and unchanged responses', (t) => {
  const f = setup(t);
  for (const short of [{ maxRecords: 1 }, { maxResultsPerStore: 1 }, { maxExplanationNodes: 0 }]) {
    const query = subjectQuery({ op: 'all' }, { possibleMatches: true, budgets: { ...queryBudgets, ...short } });
    const result = compareSubjectReplays({ ...f.sides,
      inventory: { version: 1, coverage: 'complete', cases: [{ id: 'short', query }] },
      limits: { version: 1, maxCases: 1, maxInventoryBytes: 10000 } });
    assert.equal(result.status, 'incomplete');
    assert.equal(result.cases[0].candidates.strict.added, null);
    assert.equal(result.cases[0].candidates.possible.removed, null);
    assert.deepEqual(result.cases[0].before, querySubjects(f.context, query, { collect: 'results' }));
  }
});

test('case ordering uses existing UTF-16 convention and preserves authored AST order', (t) => {
  const f = setup(t);
  const query = subjectQuery({ op: 'or', args: [{ op: 'none' }, { op: 'all' }] });
  const inventory = { version: 1, coverage: 'complete', cases: [{ id: '\ue000', query }, { id: '😀', query }] };
  const snapshot = structuredClone(inventory);
  const input = { ...f.sides, inventory, limits: { version: 1, maxCases: 2, maxInventoryBytes: 10000 } };
  const a = compareSubjectReplays(input);
  const b = compareSubjectReplays({ ...input, inventory: { ...inventory, cases: [...inventory.cases].reverse() } });
  assert.equal(a.status, 'complete');
  assert.deepEqual(a.cases.map(({ id }) => id), ['😀', '\ue000']);
  assert.equal(a.input.fingerprint, b.input.fingerprint);
  const { fingerprint, ...metadata } = a.input;
  assert.equal(fingerprint, canonicalSha256(metadata));
  assert.deepEqual(inventory, snapshot);
  assert.deepEqual(a.cases[0].specification.query.where.args, query.where.args);
});

test('fixed recipe reserves full Subject universe, case count and byte inventory before queries', (t) => {
  const f = setup(t);
  for (const short of [{ maxSubjects: 2 }, { maxCases: 71 }, { maxInventoryBytes: 1 }]) {
    const result = compareAssignmentReplays({ ...f.sides, limits: { ...limits, ...short }, queryBudgets });
    assert.equal(result.status, 'incomplete');
    assert.equal(result.comparison?.resources.queries.calls ?? 0, 0);
    if (short.maxSubjects) assert.equal(result.resources.eligibility.calls, 0);
    else assert.equal(result.resources.eligibility.returnedCalls, 6);
    if (short.maxCases) { assert.equal(result.inventory, null); assert.equal(result.resources.inventory.requiredCases, 72); }
    if (short.maxInventoryBytes) {
      assert.equal(result.inventory.cases.length, 72);
      assert.equal(result.comparison.coverage.unassessedCaseIds.length, 72);
      assert.equal(result.comparison.coverage.candidateDeltasComplete, false);
    }
  }
});

test('actual unavailable governance cannot shrink the replay universe', () => {
  const context = subjectQueryFixture({ unavailable: true });
  const result = compareAssignmentReplays({ ...paired(context), limits, queryBudgets });
  assert.equal(result.status, 'incomplete');
  assert.equal(result.subjects.length, 3);
  assert.ok(result.subjects.every((row) => row.disposition === 'blocked' && row.before.eligible === null));
  assert.equal(result.inventory, null);
  assert.equal(result.resources.eligibility.returnedCalls, 6);
});

test('asymmetric actual governance and absent Subjects block without invented eligibility work', () => {
  const before = subjectQueryFixture();
  const unavailable = subjectQueryFixture({ unavailable: true });
  const asymmetric = compareAssignmentReplays({ ...paired(before),
    after: { capturedInputRef: 'after', context: unavailable }, limits, queryBudgets });
  assert.equal(asymmetric.status, 'incomplete');
  assert.ok(asymmetric.subjects.every(({ before, after, disposition }) =>
    before.eligible === true && after.eligible === null && disposition === 'blocked'));
  assert.equal(asymmetric.inventory, null);
  const doc = { ...before.model.subjectRegistry.document, subjects: [], history: [], revision: 0, hierarchyRevision: 0 };
  const indexed = indexSubjects(doc);
  const evaluated = evaluateSubjectGovernance({ registry: indexed.registry,
    identity: before.model.identity, identityIndex: before.model.identityIndex, decisionCaptures: [] });
  assert.equal(evaluated.ok, true);
  const absent = { model: { ...before.model, subjectRegistry: indexed.registry }, subjectGovernance: evaluated.governance };
  const result = compareAssignmentReplays({ ...paired(before), after: { capturedInputRef: 'after', context: absent }, limits, queryBudgets });
  assert.equal(result.status, 'incomplete');
  assert.equal(result.resources.eligibility.calls, 2);
  assert.equal(result.resources.eligibility.returnedCalls, 1);
  assert.equal(result.resources.eligibility.unreportedCalls, 1);
  assert.equal(result.subjects[0].after, null);
  assert.equal(result.subjects[0].diagnostics[0].code, 'unknown-subject');
  assert.equal(result.inventory, null);
});

test('closed supplied inventories refuse duplicate IDs and cyclic inputs without hiding unexpected bugs', (t) => {
  const f = setup(t); const query = subjectQuery();
  const input = { ...f.sides, limits: { version: 1, maxCases: 2, maxInventoryBytes: 10000 },
    inventory: { version: 1, coverage: 'complete', cases: [{ id: 'one', query }] } };
  assert.equal(compareSubjectReplays({ ...input, inventory: { ...input.inventory,
    cases: [...input.inventory.cases, ...input.inventory.cases] } }).status, 'refused');
  const cycle = { op: 'not' }; cycle.arg = cycle;
  const invalid = compareSubjectReplays({ ...input, inventory: { ...input.inventory,
    cases: [{ id: 'cyclic', query: { ...query, where: cycle } }] } });
  assert.equal(invalid.status, 'refused');
  assert.equal(invalid.diagnostics[0].code, 'invalid-captured-input');
  const broken = { ...f.context.model };
  Object.defineProperty(broken, 'identity', { get() { throw new Error('Unexpected accessor failure'); } });
  assert.throws(() => compareSubjectReplays({ ...input,
    before: { ...input.before, context: { ...f.context, model: broken } } }), /Unexpected accessor failure/);
});

test('stable current-policy retirement retains full outcomes outside the executable universe', () => {
  const context = subjectQueryFixture({ equivalent: true });
  const result = compareAssignmentReplays({ ...paired(context), limits, queryBudgets });
  // Retired query operands are excluded explicitly, but actual record assignments
  // still undergo P4 validation; their refusal cannot be waived by that exclusion.
  assert.equal(result.status, 'incomplete');
  const retired = result.subjects.find(({ id }) => id === 'S-000001');
  assert.equal(retired.disposition, 'outside-current-query-universe');
  assert.equal(retired.before.code, 'subject-retired');
  assert.deepEqual(retired.before, retired.after);
  assert.equal(result.resources.eligibility.used.redirects, 0);
  assert.equal(result.inventory.cases.length, 48);
});

test('empty canonical universe still requires all sixteen baseline cases', () => {
  const context = subjectQueryFixture();
  const doc = { ...context.model.subjectRegistry.document, subjects: [], history: [], revision: 0, hierarchyRevision: 0 };
  const indexed = indexSubjects(doc); assert.equal(indexed.ok, true);
  const evaluated = evaluateSubjectGovernance({ registry: indexed.registry,
    identity: context.model.identity, identityIndex: context.model.identityIndex, decisionCaptures: [] });
  assert.equal(evaluated.ok, true);
  const empty = { model: { ...context.model, subjectRegistry: indexed.registry }, subjectGovernance: evaluated.governance };
  const result = compareAssignmentReplays({ ...paired(empty), limits, queryBudgets });
  assert.equal(result.resources.inventory.requiredCases, 16);
  assert.equal(result.inventory.cases.length, 16);
  assert.equal(result.comparison.resources.queries.calls, 32);
  // Existing assigned records refer to absent Subjects: raw refusals remain incomplete.
  assert.equal(result.status, 'incomplete');
});

test('closed recipe transport rejects caller-selected cases, stores and missing budgets', (t) => {
  const f = setup(t); const input = { ...f.sides, limits, queryBudgets };
  for (const invalid of [{ ...input, stores: [] }, { ...input, inventory: [] },
    { ...input, limits: { ...limits, maxCases: undefined } }, { ...input, queryBudgets: {} }]) {
    assert.equal(compareAssignmentReplays(invalid).status, 'refused');
  }
});

test('fixed recipe includes every eligible canonical Subject and reserves all 72 cases', (t) => {
  const f = setup(t);
  const result = compareAssignmentReplays({ ...f.sides,
    limits: { version: 1, maxSubjects: 3, maxEligibilityRedirects: 0, maxCases: 72, maxInventoryBytes: 100000 },
    queryBudgets });
  assert.equal(result.status, 'complete');
  assert.equal(result.inventory.cases.length, 72);
  assert.equal(result.comparison.resources.queries.calls, 144);
  assert.equal(result.subjects.length, 3);
  const unrelated = result.comparison.cases.find(({ specification }) => specification.query.where.op === 'assigned'
    && specification.query.where.subject === 'S-000003' && specification.query.view === 'current'
    && specification.query.expansion === 'direct');
  assert.deepEqual(unrelated.candidates.possible.removed.map(({ ref }) => ref.id), ['K-000005']);
});
