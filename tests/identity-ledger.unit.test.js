import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateIdentityLedger, planAllocations, validateIdentityTransition } from '../payload/engine/lib/identity-ledger.js';

const namespace = 'b4e15b6e-f1c9-4a3d-86fa-d05628402252';
const publication = { id: 'da6a05da-fbd3-4188-84df-6301458f3c53', review: 'review:cutover' };
const nextPublication = { id: '19e2f927-7130-442b-8bc2-83e51fd52c69', review: 'review:new-bundle' };
const row = (id, state = 'allocated') => ({
  id, kind: 'knowledge', state, publication,
  ...(state === 'allocated' ? {} : { reason: 'reviewed retirement' }),
});
const ledger = (allocations = []) => ({ 'schema-version': 1, 'identity-format': 1, namespace, allocations });

test('ledger validates exact closed new-system fields, namespace, provenance and tombstone reasons', () => {
  const valid = ledger([row('K-000001'), row('K-000002', 'retired'), row('K-000003', 'cancelled')]);
  assert.deepEqual(validateIdentityLedger(valid), { ok: true, diagnostics: [] });
  const mutations = [
    (l) => { l.previousIds = {}; },
    (l) => { l['schema-version'] = 2; },
    (l) => { l['identity-format'] = 0; },
    (l) => { l.namespace += '\n'; },
    (l) => { l.lineage = { namespace, review: 'review:fork' }; },
    (l) => { l.allocations[0].id = 'K-000000'; },
    (l) => { l.allocations[0].kind = 'ontology'; },
    (l) => { l.allocations[0].state = 'free'; },
    (l) => { l.allocations[0].publication.id = namespace.toUpperCase(); },
    (l) => { l.allocations[0].publication.review = '   '; },
    (l) => { l.allocations[0].publication.previousId = 'L-1'; },
    (l) => { delete l.allocations[1].reason; },
  ];
  for (const mutate of mutations) {
    const invalid = structuredClone(valid);
    mutate(invalid);
    const result = validateIdentityLedger(invalid);
    assert.equal(result.ok, false);
    assert.ok(result.diagnostics.every(({ code, path }) => typeof code === 'string' && typeof path === 'string'));
  }
});

test('independent duplicate claims and inconsistent publication evidence fail current ledger validation', () => {
  assert.equal(validateIdentityLedger(ledger([row('K-000001'), row('K-000001')])).ok, false);
  const conflicting = row('K-000002');
  conflicting.publication = { ...publication, review: 'another review' };
  assert.equal(validateIdentityLedger(ledger([row('K-000001'), conflicting])).ok, false);
});

test('allocation chooses smallest free slots and never frees retired or cancelled identities', () => {
  const before = ledger([row('K-000004'), row('K-000001', 'retired'), row('K-000002', 'cancelled')]);
  const captured = structuredClone(before);
  const planned = planAllocations(before, { kind: 'knowledge', count: 2, publication: nextPublication });
  assert.equal(planned.ok, true);
  assert.deepEqual(planned.ids, ['K-000003', 'K-000005']);
  assert.equal(planned.occupied, 5);
  assert.equal(planned.remaining, 999994);
  assert.deepEqual(before, captured, 'planning mutates no input');
  assert.deepEqual(planned.ledger.allocations.slice(-2), [
    { id: 'K-000003', kind: 'knowledge', state: 'allocated', publication: nextPublication },
    { id: 'K-000005', kind: 'knowledge', state: 'allocated', publication: nextPublication },
  ]);
  assert.equal(validateIdentityTransition(before, planned.ledger).ok, true);
});

test('all allocation kinds have independent capacity and unknown kinds never fall back', () => {
  for (const [kind, id] of [['knowledge', 'K-000001'], ['ontology', 'O-000001'],
    ['decision', 'D-000001'], ['subject', 'S-000001']]) {
    const plan = planAllocations(ledger(), { kind, count: 1, publication });
    assert.deepEqual(plan.ids, [id]);
  }
  for (const request of [null, {}, { kind: 'leaves', count: 1, publication },
    { kind: 'knowledge', count: 0, publication }, { kind: 'knowledge', count: 1.5, publication },
    { kind: 'knowledge', count: 1, publication: { ...publication, review: '' } }]) {
    assert.equal(planAllocations(ledger(), request).code, 'invalid-allocation-request');
  }
  assert.equal(planAllocations({ ...ledger(), previousIds: {} }, { kind: 'knowledge', count: 1, publication }).code, 'invalid-ledger');
  assert.deepEqual(planAllocations(ledger(), { kind: 'knowledge', count: 1000000, publication }),
    { ok: false, code: 'id-space-exhausted', occupied: 0, remaining: 999999 });
});

test('editing a proposed ledger cannot alter its authoritative before-state or publication input', () => {
  const before = ledger([row('K-000001')]);
  const captured = structuredClone(before);
  const requestPublication = { ...nextPublication };
  const planned = planAllocations(before, { kind: 'knowledge', count: 1, publication: requestPublication });
  planned.ledger.allocations[0].state = 'retired';
  planned.ledger.allocations[0].reason = 'candidate change';
  planned.ledger.allocations[0].publication.review = 'edited candidate provenance';
  planned.ledger.allocations[1].publication.review = 'edited new provenance';
  assert.deepEqual(before, captured);
  assert.deepEqual(requestPublication, nextPublication);
});

test('the real final slot succeeds and exhaustion refuses without mutation or another kind', () => {
  const before = ledger(Array.from({ length: 999998 }, (_, i) => row(`K-${String(i + 1).padStart(6, '0')}`)));
  const last = planAllocations(before, { kind: 'knowledge', count: 1, publication: nextPublication });
  assert.equal(last.ok, true);
  assert.deepEqual(last.ids, ['K-999999']);
  assert.equal(last.occupied, 999999);
  assert.equal(last.remaining, 0);
  assert.equal(before.allocations.length, 999998);
  const exhausted = planAllocations(last.ledger, {
    kind: 'knowledge', count: 1, publication: { id: namespace, review: 'review:exhaustion' },
  });
  assert.deepEqual(exhausted, { ok: false, code: 'id-space-exhausted', occupied: 999999, remaining: 0 });
  assert.equal(last.ledger.allocations.length, 999999);
  assert.equal(last.ledger.allocations.at(-1).id, 'K-999999');
});

test('published occupancy, namespace, lineage and bundle membership cannot be rewritten', () => {
  const before = ledger([row('K-000001'), row('K-000002', 'retired')]);
  const mutations = [
    (l) => { l.namespace = nextPublication.id; },
    (l) => { l.lineage = { namespace: nextPublication.id, review: 'review:fork' }; },
    (l) => { l.allocations.shift(); },
    (l) => { l.allocations[0].publication = nextPublication; },
    (l) => { l.allocations[0].reason = 'edited while still allocated'; },
    (l) => { l.allocations[1].state = 'allocated'; },
    (l) => { l.allocations[1].state = 'cancelled'; },
    (l) => { l.allocations[1].reason = 'rewritten retirement'; },
    (l) => { l.allocations.push(row('K-000003')); },
    (l) => { l.allocations.push({ ...row('K-000003', 'cancelled'), publication: nextPublication }); },
  ];
  for (const mutate of mutations) {
    const candidate = structuredClone(before);
    mutate(candidate);
    assert.equal(validateIdentityTransition(before, candidate).ok, false);
  }
  assert.equal(validateIdentityTransition(before, structuredClone(before)).ok, true);
  assert.equal(planAllocations(before, { kind: 'knowledge', count: 1, publication }).code, 'publication-already-used');
});

test('reviewed terminal transitions retain allocation and publication provenance', () => {
  for (const state of ['retired', 'cancelled']) {
    const before = ledger([row('K-000001')]);
    const candidate = structuredClone(before);
    candidate.allocations[0].state = state;
    candidate.allocations[0].reason = 'reviewed disposition';
    assert.equal(validateIdentityTransition(before, candidate).ok, true);
    assert.deepEqual(before, ledger([row('K-000001')]));
  }
});

test('merged independent candidates collide, while a multi-kind bundle can be planned from one before', () => {
  const before = ledger();
  const a = planAllocations(before, { kind: 'knowledge', count: 1, publication });
  const b = planAllocations(before, { kind: 'knowledge', count: 1, publication: nextPublication });
  assert.deepEqual(a.ids, b.ids, 'offline proposals are not distributed reservations');
  assert.equal(validateIdentityLedger(ledger([...a.ledger.allocations, ...b.ledger.allocations])).ok, false);
  const remint = planAllocations(a.ledger, { kind: 'knowledge', count: 1, publication: nextPublication });
  assert.deepEqual(remint.ids, ['K-000002']);
  const ontology = planAllocations(before, { kind: 'ontology', count: 1, publication });
  assert.equal(validateIdentityTransition(before, ledger([...a.ledger.allocations, ...ontology.ledger.allocations])).ok, true);
});
