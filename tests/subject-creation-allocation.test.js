import test from 'node:test';
import assert from 'node:assert/strict';
import { validateSubjectCreationAllocation } from '../payload/engine/lib/subject-allocation.js';
import { createSubjectValidationBudget } from '../payload/engine/lib/subject-validation-budget.js';
import { canonicalSha256 } from '../payload/engine/lib/canonical-json.js';

const namespace = '12345678-1234-4234-8234-123456789abc';
const oldPublication = { id: '22345678-1234-4234-8234-123456789abc', review: 'review:old' };
const publication = { id: '32345678-1234-4234-8234-123456789abc', review: 'review:creation' };
const governance = { maxCaptureBytes: 1000000, maxDocumentNodes: 100000,
  maxDocumentTextUnits: 1000000, maxSubjects: 10000, maxHistoryRows: 10000, maxValidationSteps: 100000 };
const row = (kind, id, state = 'allocated') => ({ kind, id, state, publication: { ...oldPublication },
  ...(state === 'allocated' ? {} : { reason: 'Retained occupied identity' }) });
const ledger = allocations => ({ 'schema-version': 1, 'identity-format': 1, namespace, allocations });
function fixture(empty = false) {
  const beforeIdentity = ledger(empty ? [] : [row('knowledge', 'K-000001'), row('ontology', 'O-000001'),
    row('decision', 'D-000001'), row('subject', 'S-000001'), row('subject', 'S-000002', 'cancelled'), row('subject', 'S-000004', 'retired')]);
  beforeIdentity.lineage = { namespace: '42345678-1234-4234-8234-123456789abc', review: 'review:lineage' };
  const subject = empty ? 'S-000001' : 'S-000003';
  const candidateIdentity = structuredClone(beforeIdentity);
  candidateIdentity.allocations.push({ kind: 'subject', id: subject, state: 'allocated', publication: { ...publication } });
  return { beforeIdentity, candidateIdentity, subject, publication: { ...publication } };
}
const run = (input, limits = { maxLedgerRows: 13 }, operationBudget = createSubjectValidationBudget(governance)) =>
  validateSubjectCreationAllocation(input, { limits, operationBudget });

test('one Subject creation proves literal first and lowest-free plans without changing occupied mixed identities', () => {
  for (const empty of [true, false]) {
    const input = fixture(empty); const retained = structuredClone(input);
    const result = run(input, { maxLedgerRows: empty ? 1 : 13 });
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.deepEqual(Object.keys(result), ['ok', 'publicationReady', 'allocation', 'resources', 'diagnostics']);
    assert.equal(result.publicationReady, false);
    assert.deepEqual(result.allocation, { publication, ids: [input.subject],
      beforeIdentityDigest: canonicalSha256(input.beforeIdentity), candidateIdentityDigest: canonicalSha256(input.candidateIdentity),
      occupied: empty ? 1 : 4, remaining: empty ? 999998 : 999995 });
    assert.deepEqual(result.resources, { accountingBasis: 'per-invocation-admitted-populations',
      limits: { maxLedgerRows: empty ? 1 : 13 }, used: { ledgerRows: empty ? 1 : 13, subjects: 1 }, failure: null });
    result.allocation.ids.push('S-999999'); result.allocation.publication.review = 'changed output';
    assert.deepEqual(input, retained);
  }
});

test('creation refuses all non-plan deltas and canonical spelling changes', async t => {
  for (const [name, mutate] of [
    ['occupied cancelled target', input => { input.subject = 'S-000002'; }],
    ['wrong kind', input => { input.subject = 'K-000003'; }],
    ['zero', input => { input.subject = 'S-000000'; }],
    ['wrong width', input => { input.subject = 'S-3'; }],
    ['newline', input => { input.subject += '\n'; }],
    ['prior row reorder', input => { input.candidateIdentity.allocations.reverse(); }],
    ['prior row removed', input => { input.candidateIdentity.allocations.shift(); }],
    ['unrelated retirement', input => { Object.assign(input.candidateIdentity.allocations[0], { state: 'retired', reason: 'Unrelated change' }); }],
    ['prior publication changed', input => { input.candidateIdentity.allocations[0].publication.review += ':changed'; }],
    ['extra K row', input => { input.candidateIdentity.allocations.push({ ...row('knowledge', 'K-000002'), publication }); }],
    ['extra O row', input => { input.candidateIdentity.allocations.push({ ...row('ontology', 'O-000002'), publication }); }],
    ['extra D row', input => { input.candidateIdentity.allocations.push({ ...row('decision', 'D-000002'), publication }); }],
    ['extra S row', input => { input.candidateIdentity.allocations.push({ ...row('subject', 'S-000005'), publication }); }],
    ['namespace changed', input => { input.candidateIdentity.namespace = publication.id; }],
    ['lineage changed', input => { input.candidateIdentity.lineage.review += ':changed'; }],
    ['new row publication changed', input => { input.candidateIdentity.allocations.at(-1).publication.review += ':changed'; }],
  ]) await t.test(name, () => {
    const input = fixture(); mutate(input); const result = run(input, { maxLedgerRows: 100 });
    assert.equal(result.ok, false); assert.equal(result.allocation, null);
    assert.ok(['subject-creation-allocation-mismatch', 'invalid-subject-creation-allocation-input'].includes(result.diagnostics[0].code));
  });
});

test('exact row admission succeeds and one-short refuses before guards or native publication reuse', () => {
  const input = fixture(); const budget = createSubjectValidationBudget(governance);
  input.publication = oldPublication;
  const short = run(input, { maxLedgerRows: 12 }, budget);
  assert.deepEqual(short.resources, { accountingBasis: 'per-invocation-admitted-populations', limits: { maxLedgerRows: 12 },
    used: { ledgerRows: 0, subjects: 0 }, failure: { code: 'subject-creation-allocation-budget', limit: 'maxLedgerRows', used: 0, requested: 13 } });
  assert.equal(short.diagnostics[0].code, 'subject-creation-allocation-budget');
  assert.equal(budget.used.documentNodes, 0);
  const admitted = run(input, { maxLedgerRows: 13 }, budget);
  assert.equal(admitted.diagnostics[0].code, 'publication-already-used');
  assert.equal(admitted.allocation, null);
  assert.deepEqual(admitted.resources.used, { ledgerRows: 13, subjects: 1 }, 'admission is not a successful native plan');
  assert.equal(admitted.resources.failure, null);
});

test('native failures and exhausted document allowance preserve admitted populations without proof', () => {
  for (const [mutate, code] of [
    [input => { input.beforeIdentity['identity-format'] = 2; }, 'invalid-ledger'],
    [input => { input.publication.id = 'invalid'; }, 'invalid-allocation-request'],
  ]) {
    const input = fixture(); mutate(input); const result = run(input);
    assert.equal(result.diagnostics[0].code, code); assert.equal(result.allocation, null);
    assert.deepEqual(result.resources.used, { ledgerRows: 13, subjects: 1 });
  }
  const budget = createSubjectValidationBudget({ ...governance, maxDocumentNodes: 0 });
  const first = run(fixture(), undefined, budget);
  assert.equal(first.diagnostics[0].code, 'subject-validation-budget');
  assert.match(first.diagnostics[0].message, /subject-creation-before-identity/);
  assert.deepEqual(first.resources.used, { ledgerRows: 13, subjects: 1 });
  const second = run(fixture(), undefined, budget);
  assert.equal(second.ok, false); assert.equal(second.allocation, null);
  assert.deepEqual(second.resources.used, { ledgerRows: 0, subjects: 0 }, 'exhausted authentic allowance rejects before readmission');
});

test('missing forged and exhausted budgets never inspect nested ledger accessors', () => {
  const exhausted = createSubjectValidationBudget({ ...governance, maxDocumentNodes: 0 });
  assert.throws(() => exhausted.guard(null, 'earlier-work'));
  for (const operationBudget of [undefined, null, {}, exhausted, createSubjectValidationBudget(governance)]) {
    for (const side of ['beforeIdentity', 'candidateIdentity']) {
      let reads = 0; const input = fixture();
      Object.defineProperty(input[side], 'allocations', { enumerable: true, get() { reads++; throw new Error('nested getter ran'); } });
      const result = validateSubjectCreationAllocation(input, { limits: { maxLedgerRows: 13 }, operationBudget });
      assert.equal(result.ok, false); assert.equal(result.allocation, null); assert.equal(reads, 0);
      assert.equal(result.diagnostics[0].code, operationBudget === exhausted ? 'subject-validation-budget'
        : operationBudget && operationBudget !== exhausted && Object.hasOwn(operationBudget, 'guard')
          ? 'invalid-subject-creation-allocation-input' : 'invalid-subject-validation-budget-handle');
    }
  }
});

test('closed own-data admission excludes getters, inherited arrays, hidden arrays and caller profiles', () => {
  for (const options of [undefined, {}, { limits: { maxLedgerRows: 13 } },
    { limits: { maxLedgerRows: 13, maxSuccessors: 1 }, operationBudget: createSubjectValidationBudget(governance) },
    { limits: { maxLedgerRows: -1 }, operationBudget: createSubjectValidationBudget(governance) },
    { limits: { maxLedgerRows: 13 }, operationBudget: createSubjectValidationBudget(governance), profile: 'split' }]) {
    assert.equal(validateSubjectCreationAllocation(fixture(), options).diagnostics[0].code, 'invalid-subject-creation-allocation-input');
  }
  for (const kind of ['getter', 'nonenumerable', 'inherited', 'symbol']) {
    const input = fixture(); let reads = 0;
    if (kind === 'getter') Object.defineProperty(input, 'subject', { enumerable: true, get() { reads++; throw new Error('top getter'); } });
    if (kind === 'nonenumerable') Object.defineProperty(input.beforeIdentity, 'allocations', { enumerable: false });
    if (kind === 'inherited') {
      const rows = input.beforeIdentity.allocations; delete input.beforeIdentity.allocations;
      Object.setPrototypeOf(input.beforeIdentity, { allocations: rows });
    }
    if (kind === 'symbol') input[Symbol('profile')] = 'creation';
    const result = run(input);
    assert.equal(result.diagnostics[0].code, 'invalid-subject-creation-allocation-input');
    assert.equal(result.allocation, null); assert.equal(reads, 0);
  }
});

test('split compatibility entrypoint keeps its identity, phases, minimum and cumulative allowance', async () => {
  const { validateSubjectSplitAllocation: legacy } = await import('../payload/engine/lib/subject-split-allocation.js');
  const { validateSubjectSplitAllocation: shared } = await import('../payload/engine/lib/subject-allocation.js');
  assert.equal(legacy, shared);
  const base = fixture(); const input = { beforeIdentity: base.beforeIdentity, candidateIdentity: base.candidateIdentity,
    successors: [base.subject], publication: base.publication };
  const options = { limits: { maxLedgerRows: 14, maxSuccessors: 2 }, operationBudget: createSubjectValidationBudget(governance) };
  assert.deepEqual(legacy(input, options).diagnostics, [{ code: 'invalid-split-allocation-input',
    message: 'Supply two ledgers, at least two successors and both explicit population limits.' }]);
  input.successors.push('S-000005');
  input.candidateIdentity.allocations.push({ ...row('subject', 'S-000005'), publication });
  const budget = createSubjectValidationBudget({ ...governance, maxDocumentNodes: 0 });
  const split = legacy(input, { ...options, operationBudget: budget });
  assert.match(split.diagnostics[0].message, /split-before-identity/);
  assert.deepEqual(split.resources.used, { ledgerRows: 14, successors: 2 });
  const creation = run(fixture(), undefined, budget);
  assert.equal(creation.diagnostics[0].code, 'subject-validation-budget');
  assert.deepEqual(creation.resources.used, { ledgerRows: 0, subjects: 0 });
});

test('real last Subject slot succeeds and the next one-Subject request forwards full native exhaustion', () => {
  // Actual valid occupancy, not a fake length, fabricated planner result or planner-generated oracle.
  const beforeIdentity = ledger(Array.from({ length: 999998 }, (_, i) => row('subject', `S-${String(i + 1).padStart(6, '0')}`)));
  const candidateIdentity = { ...beforeIdentity, allocations: [...beforeIdentity.allocations,
    { kind: 'subject', id: 'S-999999', state: 'allocated', publication: { ...publication } }] };
  const allowance = () => createSubjectValidationBudget({ ...governance, maxDocumentNodes: 30000000, maxDocumentTextUnits: 500000000 });
  const result = run({ beforeIdentity, candidateIdentity, subject: 'S-999999', publication }, { maxLedgerRows: 1999997 }, allowance());
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  assert.deepEqual(result.allocation.ids, ['S-999999']);
  assert.equal(result.allocation.occupied, 999999); assert.equal(result.allocation.remaining, 0);
  assert.deepEqual(result.resources.used, { ledgerRows: 1999997, subjects: 1 });
  assert.equal(beforeIdentity.allocations.length, 999998); assert.equal(candidateIdentity.allocations.length, 999999);
  const exhausted = run({ beforeIdentity: candidateIdentity, candidateIdentity, subject: 'S-999999',
    publication: { id: '52345678-1234-4234-8234-123456789abc', review: 'review:exhaustion' } },
  { maxLedgerRows: 1999998 }, allowance());
  assert.equal(exhausted.ok, false); assert.equal(exhausted.allocation, null);
  assert.deepEqual(exhausted.diagnostics, [{ code: 'id-space-exhausted',
    message: 'The authoritative Subject allocator refused the requested allocation.', occupied: 999999, remaining: 0 }]);
  assert.deepEqual(exhausted.resources.used, { ledgerRows: 1999998, subjects: 1 });
});
