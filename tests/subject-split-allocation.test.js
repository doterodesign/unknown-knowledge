import test from 'node:test';
import assert from 'node:assert/strict';
import { validateSubjectSplitAllocation } from '../payload/engine/lib/subject-split-allocation.js';
import { createSubjectValidationBudget } from '../payload/engine/lib/subject-validation-budget.js';
import { canonicalSha256 } from '../payload/engine/lib/canonical-json.js';
import { validateIdentityTransition } from '../payload/engine/lib/identity-ledger.js';

const namespace = '12345678-1234-4234-8234-123456789abc';
const oldPublication = { id: '22345678-1234-4234-8234-123456789abc', review: 'review:before' };
const publication = { id: '32345678-1234-4234-8234-123456789abc', review: 'review:split' };
const governanceLimits = { maxCaptureBytes: 1000000, maxDocumentNodes: 100000,
  maxDocumentTextUnits: 1000000, maxSubjects: 10000, maxHistoryRows: 10000, maxValidationSteps: 100000 };
function fixture() {
  const allocation = (kind, id, state = 'allocated') => ({ kind, id, state, publication: { ...oldPublication },
    ...(state === 'allocated' ? {} : { reason: 'Retained occupied identity' }) });
  const beforeIdentity = { 'schema-version': 1, 'identity-format': 1, namespace,
    lineage: { namespace: '42345678-1234-4234-8234-123456789abc', review: 'review:lineage' },
    allocations: [allocation('knowledge', 'K-000001'), allocation('ontology', 'O-000001'),
      allocation('decision', 'D-000001'), allocation('subject', 'S-000001'),
      allocation('subject', 'S-000002', 'cancelled'), allocation('subject', 'S-000004', 'retired')] };
  // Literal expected candidate: no use of the planner to create its own oracle.
  const successors = ['S-000003', 'S-000005'];
  const candidateIdentity = structuredClone(beforeIdentity);
  candidateIdentity.allocations.push(...successors.map(id => ({ kind: 'subject', id, state: 'allocated', publication: { ...publication } })));
  return { beforeIdentity, candidateIdentity, successors, publication: { ...publication } };
}
const run = (input, limits = { maxLedgerRows: 14, maxSuccessors: 2 }, operationBudget = createSubjectValidationBudget(governanceLimits)) =>
  validateSubjectSplitAllocation(input, { limits, operationBudget });

test('split allocation proves literal lowest-free Subject-only delta with occupied tombstones and mixed stores', () => {
  const input = fixture(); const before = structuredClone(input);
  const result = run(input);
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.publicationReady, false);
  assert.deepEqual(result.allocation, { publication, ids: input.successors,
    beforeIdentityDigest: canonicalSha256(input.beforeIdentity), candidateIdentityDigest: canonicalSha256(input.candidateIdentity),
    occupied: 5, remaining: 999994 });
  assert.deepEqual(result.resources.used, { ledgerRows: 14, successors: 2 });
  assert.equal(result.resources.accountingBasis, 'per-invocation-admitted-populations');
  assert.equal(result.resources.failure, null);
  assert.deepEqual(input, before);
  result.allocation.ids.reverse(); result.allocation.publication.review = 'mutated output';
  assert.deepEqual(input, before, 'returned observations cannot mutate input');
});

test('split allocation requires the whole exact plan even when a broader identity transition is valid', () => {
  const input = fixture();
  input.candidateIdentity.allocations[0].state = 'retired';
  input.candidateIdentity.allocations[0].reason = 'Independently legal but unrelated';
  assert.equal(validateIdentityTransition(input.beforeIdentity, input.candidateIdentity).ok, true);
  const result = run(input);
  assert.equal(result.ok, false);
  assert.equal(result.allocation, null);
  assert.equal(result.diagnostics[0].code, 'split-allocation-mismatch');
});

test('split allocation rejects reordered or additional identities, occupied targets and unrelated metadata', async t => {
  const mutations = [
    ['successor permutation', x => x.successors.reverse()],
    ['duplicate successor', x => { x.successors[1] = x.successors[0]; }],
    ['occupied successor', x => { x.successors[0] = 'S-000002'; }],
    ['wrong kind successor', x => { x.successors[0] = 'K-000003'; }],
    ['old row reorder', x => { [x.candidateIdentity.allocations[0], x.candidateIdentity.allocations[1]] = [x.candidateIdentity.allocations[1], x.candidateIdentity.allocations[0]]; }],
    ['unrelated extra allocation', x => { x.candidateIdentity.allocations.push({ kind: 'knowledge', id: 'K-000002', state: 'allocated', publication }); }],
    ['lineage change', x => { x.candidateIdentity.lineage.review = 'review:changed'; }],
    ['namespace change', x => { x.candidateIdentity.namespace = publication.id; }],
    ['publication change', x => { x.candidateIdentity.allocations.at(-1).publication.review = 'review:other'; }],
    ['new row order', x => { x.candidateIdentity.allocations.reverse(); }],
  ];
  for (const [name, mutate] of mutations) await t.test(name, () => {
    const input = fixture(); mutate(input); const result = run(input, { maxLedgerRows: 100, maxSuccessors: 10 });
    assert.equal(result.ok, false); assert.equal(result.allocation, null);
  });
});

test('full allocation admission precedes planning and preserves an exhausted allowance', () => {
  for (const [limits, key] of [[{ maxLedgerRows: 13, maxSuccessors: 2 }, 'maxLedgerRows'],
    [{ maxLedgerRows: 14, maxSuccessors: 1 }, 'maxSuccessors']]) {
    const input = fixture(); input.publication = { ...oldPublication }; // planner would refuse reuse if reached
    const budget = createSubjectValidationBudget(governanceLimits);
    const result = run(input, limits, budget);
    assert.equal(result.ok, false); assert.equal(result.allocation, null);
    assert.equal(result.diagnostics[0].code, 'split-allocation-budget');
    assert.equal(result.resources.failure.limit, key);
    assert.deepEqual(result.resources.used, { ledgerRows: 0, successors: 0 }, 'whole reservation fails atomically');
    assert.equal(budget.used.documentNodes, 0, 'rejected populations do not enter expanded-document processing');
  }
});

test('native allocator refusals and authentic document-budget failures do not become allocation proof', () => {
  const input = fixture(); input.publication = { ...oldPublication };
  assert.equal(run(input).diagnostics[0].code, 'publication-already-used');
  const invalid = fixture(); invalid.beforeIdentity['identity-format'] = 2;
  assert.equal(run(invalid).diagnostics[0].code, 'invalid-ledger');
  const budget = createSubjectValidationBudget({ ...governanceLimits, maxDocumentNodes: 0 });
  const result = run(fixture(), undefined, budget);
  assert.equal(result.ok, false); assert.equal(result.allocation, null);
  assert.equal(result.diagnostics[0].code, 'subject-validation-budget');
  assert.equal(run(fixture(), undefined, budget).ok, false, 'failed shared allowance stays failed');
  assert.equal(run(fixture(), undefined, {}).ok, false, 'caller counters are not an authentic allowance');
});

test('closed split input refuses missing bounds and single-successor or non-data declarations', () => {
  for (const limits of [null, {}, { maxLedgerRows: -1, maxSuccessors: 2 }, { maxLedgerRows: 14, maxSuccessors: 2, maxSlots: 99 }]) {
    assert.equal(run(fixture(), limits).ok, false);
  }
  const single = fixture(); single.successors.pop(); assert.equal(run(single).ok, false);
  const extra = fixture(); extra.expected = true; assert.equal(run(extra).ok, false);
  const cyclic = fixture(); cyclic.beforeIdentity.extra = cyclic.beforeIdentity;
  assert.equal(run(cyclic).ok, false);
});

test('allocation length admission never invokes nested getters even with forged or exhausted budgets', () => {
  const exhausted = createSubjectValidationBudget({ ...governanceLimits, maxDocumentNodes: 0 });
  assert.throws(() => exhausted.guard(null, 'exhaust-fixture'));
  for (const side of ['beforeIdentity', 'candidateIdentity']) for (const budget of [
    createSubjectValidationBudget(governanceLimits), {}, exhausted,
  ]) {
    const input = fixture(); let calls = 0;
    Object.defineProperty(input[side], 'allocations', { enumerable: true, get() { calls++; throw new Error('accessor executed'); } });
    let result;
    assert.doesNotThrow(() => { result = run(input, undefined, budget); });
    assert.equal(result.ok, false); assert.equal(result.allocation, null); assert.equal(calls, 0);
  }
});

test('actual exhausted Subject-space request retains native occupancy counts without a successful plan', () => {
  const input = fixture();
  // The real full successor population exceeds the allocator's remaining space.
  // Keep the before ledger small; no fake counters or injected allocator.
  input.successors = Array.from({ length: 999999 }, (_, i) => `S-${String(i + 1).padStart(6, '0')}`);
  input.candidateIdentity = structuredClone(input.beforeIdentity);
  const budget = createSubjectValidationBudget({ ...governanceLimits,
    maxDocumentNodes: 1100000, maxDocumentTextUnits: 12000000 });
  const result = run(input, { maxLedgerRows: 12, maxSuccessors: 999999 }, budget);
  assert.equal(result.ok, false); assert.equal(result.allocation, null);
  assert.equal(result.diagnostics[0].code, 'id-space-exhausted');
  assert.equal(result.diagnostics[0].occupied, 3);
  assert.equal(result.diagnostics[0].remaining, 999996);
});
