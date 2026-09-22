import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canonicalSha256 } from '../payload/engine/lib/canonical-json.js';
import { buildIdentityIndex } from '../payload/engine/lib/record-identity-index.js';
import { validateIdentityLedger } from '../payload/engine/lib/identity-ledger.js';
import { subjectGovernanceFixture as fixture } from './helpers/subject-governance-fixture.js';
import { indexSubjects } from '../payload/engine/lib/subjects.js';
import { evaluateSubjectGovernance, subjectEligibility, validateSubjectTransition,
  getGovernedSubjectRegistry, getSubjectGovernanceDescriptor,
  validateSubjectEligibilityOptions } from '../payload/engine/lib/subject-governance.js';

const namespace = '12345678-1234-4234-8234-123456789abc';
const eventId = '23456789-1234-4234-8234-123456789abc';
const ref = { namespace, kind: 'decision', id: 'D-000001' };
const digestEvent = ({ review, ...event }) => canonicalSha256(event);


function evaluate(data) {
  return evaluateSubjectGovernance({ registry: indexSubjects(data.document).registry,
    identity: data.identityInput.identity, identityIndex: data.identityIndex, decisionCaptures: data.decisionCaptures });
}

function transition(data, before = { schemaVersion: 1, namespace, revision: 0, hierarchyRevision: 0,
  subjects: [], history: [] }) {
  const entry = data.identityInput.records[0]?.entry;
  const model = { ok: true, identity: data.identityInput.identity,
    stores: { decisions: { present: true } }, decisions: new Map(entry ? [[entry.record.id, entry]] : []) };
  return validateSubjectTransition({ before, candidate: data.document, model,
    identityIndex: data.identityIndex, decisionCaptures: data.decisionCaptures });
}

test('source-bound activation authorizes an active canonical subject without authorizer subjects', () => {
  const checked = evaluate(fixture());
  assert.equal(checked.ok, true, JSON.stringify(checked.diagnostics));
  const result = subjectEligibility(checked.governance, 'S-000001', { purpose: 'new-assignment' });
  assert.equal(result.eligible, true);
  assert.equal(result.verification, 'verified');
  assert.equal(result.resolution.id, 'S-000001');
});

test('retained accepted evidence survives current archival while missing proof is explicitly unavailable', () => {
  const data = fixture('archived');
  assert.equal(subjectEligibility(evaluate(data).governance, 'S-000001', { purpose: 'new-assignment' }).eligible, true);
  data.decisionCaptures = [];
  const checked = evaluate(data);
  assert.equal(checked.ok, true);
  const unavailable = subjectEligibility(checked.governance, 'S-000001', { purpose: 'new-assignment' });
  assert.equal(unavailable.eligible, null);
  assert.equal(unavailable.verification, 'unavailable');
  assert.equal(unavailable.code, 'governance-unavailable');
  assert.equal(unavailable.resolution.subject.status, 'active');
});

test('structural registry and caller approval flags cannot authorize new assignments', () => {
  const captured = indexSubjects(fixture().document).registry;
  captured.verified = true;
  assert.throws(() => subjectEligibility(captured, 'S-000001', { purpose: 'new-assignment' }),
    { code: 'governance-unavailable' });
});

test('changed review material and incomplete history cannot mint an evaluated approval', () => {
  const cases = [
    ['change-digest-mismatch', (d) => { d.document.history[0].reason = 'Different review scope'; }],
    ['invalid-history', (d) => { d.document.subjects[0].label = 'Unreviewed current label'; }],
    ['invalid-history', (d) => { d.document.subjects[0].changes = []; }],
    ['duplicate-event', (d) => { d.document.history.push(structuredClone(d.document.history[0])); }],
    ['invalid-warrant', (d) => { d.document.history[0].rows[0].after.warrant = { records: [], sources: [] }; }],
    ['invalid-authorizer', (d) => { d.document.history[0].decision.kind = 'knowledge'; }],
    ['invalid-review', (d) => { d.document.history[0].review.acceptedStatus = 'proposed'; }],
    ['invalid-review', (d) => { d.document.history[0].review.reference = ''; }],
    ['invalid-history', (d) => { d.document.history[0].rows.push(structuredClone(d.document.history[0].rows[0])); }],
  ];
  for (const [code, mutate] of cases) {
    const data = fixture();
    mutate(data);
    if (code !== 'change-digest-mismatch') data.document.history[0].review.changeDigest = digestEvent(data.document.history[0]);
    const result = evaluate(data);
    assert.equal(result.ok, false, code);
    assert.equal(result.governance, null);
    assert.ok(result.diagnostics.some((d) => d.code === code), JSON.stringify(result.diagnostics));
  }
});

test('byte corruption, duplicate evidence and mismatched authorizer status fail explicitly', () => {
  for (const [code, mutate] of [
    ['evidence-digest-mismatch', (d) => { d.decisionCaptures[0].bytes[0] = 0; }],
    ['ambiguous-evidence', (d) => { d.decisionCaptures.push(d.decisionCaptures[0]); }],
    ['invalid-authorizer-evidence', (d) => { d.document.history[0].review.acceptedStatus = 'addressed'; }],
    ['invalid-authorizer-evidence', (d) => { d.document.history[0].review.decisionDigest = '0'.repeat(64); }],
  ]) {
    const data = fixture(); mutate(data);
    const result = evaluate(data);
    assert.equal(result.ok, false, code);
    assert.ok(result.diagnostics.some((d) => d.code === code), JSON.stringify(result.diagnostics));
  }
});

test('evaluated handle captures state and does not trust mutations of public index maps', () => {
  const data = fixture();
  const registry = indexSubjects(data.document).registry;
  const checked = evaluateSubjectGovernance({ registry, identityIndex: data.identityIndex,
    identity: data.identityInput.identity, decisionCaptures: data.decisionCaptures });
  registry.subjects.clear();
  data.document.subjects[0].status = 'retired';
  data.decisionCaptures[0].bytes.fill(0);
  assert.equal(Object.isFrozen(checked.governance), true);
  assert.equal(checked.governance.namespace, namespace);
  assert.equal(subjectEligibility(checked.governance, 'S-000001', { purpose: 'new-assignment' }).eligible, true);
});

test('ordinary metadata edits require a current effective authorizer and exact revision increment', () => {
  const valid = renameFixture();
  assert.equal(transition(valid.data, valid.before).ok, true);
  for (const status of ['archived', 'superseded', 'proposed', 'rejected']) {
    const changed = renameFixture(status);
    const result = transition(changed.data, changed.before);
    assert.equal(result.ok, false, status);
    assert.ok(result.diagnostics.some((d) => d.code === 'ineffective-authorizer'), JSON.stringify(result.diagnostics));
  }
  const missing = renameFixture(); missing.data.decisionCaptures = [];
  assert.equal(transition(missing.data, missing.before).ok, false);
  const stale = renameFixture(); stale.data.document.revision = 0;
  assert.ok(transition(stale.data, stale.before).diagnostics.some((d) => d.code === 'invalid-revision'));
});

function renameFixture(currentStatus) {
  const data = fixture(currentStatus);
  const before = structuredClone(data.document);
  const original = data.document.subjects[0];
  const { id, changes, ...state } = original;
  const after = { ...structuredClone(state), label: 'Colour' };
  const event = { id: '34567890-1234-4234-8234-123456789abc', action: 'rename', unchangedMeaning: true,
    decision: structuredClone(ref), rows: [{ id, before: state, after }], reason: 'Preferred spelling' };
  event.review = { ...structuredClone(data.document.history[0].review), changeDigest: digestEvent(event) };
  data.document.history.push(event);
  data.document.subjects[0] = { id, ...after, changes: [...changes, event.id] };
  data.document.revision += 1;
  return { data, before, event };
}

test('rename preserves append-only history and cannot smuggle changed meaning or hierarchy', () => {
  const valid = renameFixture();
  assert.equal(transition(valid.data, valid.before).ok, true);
  for (const mutate of [
    (x) => { delete x.event.unchangedMeaning; },
    (x) => { x.event.rows[0].after.definition.text = 'A different meaning'; },
    (x) => { x.data.document.history[0].reason = 'Rewritten old review';
      x.data.document.history[0].review.changeDigest = digestEvent(x.data.document.history[0]); },
  ]) {
    const changed = renameFixture(); mutate(changed);
    changed.event.review.changeDigest = digestEvent(changed.event);
    const { id, changes } = changed.data.document.subjects[0];
    changed.data.document.subjects[0] = { id, ...changed.event.rows[0].after, changes };
    assert.equal(transition(changed.data, changed.before).ok, false);
  }
});

test('a no-op publication cannot consume registry revisions', () => {
  const data = fixture();
  const result = transition(data, structuredClone(data.document));
  assert.equal(result.ok, false);
  assert.ok(result.diagnostics.some((d) => d.code === 'no-op'), JSON.stringify(result.diagnostics));
});

test('query requires real governance while registry accessor cannot mutate future evaluation', () => {
  const checked = evaluate(fixture());
  const view = getGovernedSubjectRegistry(checked.governance);
  view.subjects.clear();
  view.parents.set('S-000001', 'S-999999');
  const second = getGovernedSubjectRegistry(checked.governance);
  assert.equal(second.subjects.has('S-000001'), true);
  assert.equal(second.parents.size, 0);
  assert.equal(subjectEligibility(checked.governance, 'S-000001', { purpose: 'query' }).eligible, true);
  assert.throws(() => getGovernedSubjectRegistry({ ...checked.governance }), { code: 'governance-unavailable' });
});

test('historical query can use a reviewed retired meaning but cannot authorize a new assignment', () => {
  const data = fixture();
  const { id, changes, ...before } = data.document.subjects[0];
  const after = { ...structuredClone(before), status: 'retired', retirement: { kind: 'retire' } };
  const event = { id: '34567890-1234-4234-8234-123456789abc', action: 'retire', decision: structuredClone(ref),
    rows: [{ id, before, after }], reason: 'Retained historical meaning' };
  event.review = { ...data.document.history[0].review, changeDigest: digestEvent(event) };
  data.document.history.push(event);
  data.document.subjects[0] = { id, ...after, changes: [...changes, event.id] };
  data.document.revision += 1;
  const checked = evaluate(data);
  assert.equal(checked.ok, true);
  assert.equal(subjectEligibility(checked.governance, id, { purpose: 'query' }).eligible, false);
  assert.equal(subjectEligibility(checked.governance, id, { purpose: 'query', policy: 'historical' }).eligible, true);
  assert.equal(subjectEligibility(checked.governance, id, { purpose: 'new-assignment', policy: 'historical' }).eligible, false);
});

test('governance descriptor binds actual evidence availability and unselected authorizer state', () => {
  const data = fixture();
  const checked = evaluate(data);
  const descriptor = getSubjectGovernanceDescriptor(checked.governance);
  assert.equal(descriptor.registryDigest, canonicalSha256(data.document));
  assert.equal(descriptor.events[0].verification, 'verified');
  assert.equal(descriptor.events[0].decision.currentStatus, 'accepted');
  const without = { ...data, decisionCaptures: [] };
  assert.notEqual(canonicalSha256(descriptor), canonicalSha256(getSubjectGovernanceDescriptor(evaluate(without).governance)));
  assert.notEqual(canonicalSha256(descriptor), canonicalSha256(getSubjectGovernanceDescriptor(evaluate(fixture('archived')).governance)));
  descriptor.events[0].verification = 'unavailable';
  assert.equal(getSubjectGovernanceDescriptor(checked.governance).events[0].verification, 'verified');
});

test('historical labels cannot bypass action semantics and new claims must preserve baseline state', () => {
  const changed = renameFixture();
  changed.event.rows[0].after.definition.text = 'Unrelated meaning';
  changed.event.review.changeDigest = digestEvent(changed.event);
  changed.data.document.subjects[0].definition = changed.event.rows[0].after.definition;
  assert.equal(evaluate(changed.data).ok, false, 'standalone historical evaluation must also check rename semantics');
  const data = fixture();
  const before = { schemaVersion: 1, namespace, revision: 0, hierarchyRevision: 0, history: [],
    subjects: [{ id: `proposal:subject:${eventId}`, label: 'Draft', status: 'proposed',
      aliases: [], related: [], definition: { text: 'First draft meaning', includes: [], excludes: [] }, changes: [] }] };
  data.document.subjects.push({ ...before.subjects[0], label: 'Unreviewed replacement' });
  assert.equal(transition(data, before).ok, false, 'a reviewed event cannot conceal changes to nonparticipants');
});

test('unchanged participant rows need reasons and cannot create a no-op publication', () => {
  const changed = renameFixture();
  const row = changed.event.rows[0];
  row.after = structuredClone(row.before);
  changed.event.review.changeDigest = digestEvent(changed.event);
  changed.data.document.subjects[0].label = row.before.label;
  const result = transition(changed.data, changed.before);
  assert.equal(result.ok, false);
  assert.ok(result.diagnostics.some((d) => ['missing-row-reason', 'no-op'].includes(d.code)));
});

test('equivalent query verifies both meanings while an old authored ID is never assignment-eligible', () => {
  const data = fixture();
  const creation = data.document.history[0];
  const survivorState = structuredClone(creation.rows[0].after);
  creation.rows.push({ id: 'S-000002', before: null, after: survivorState });
  creation.review.changeDigest = digestEvent(creation);
  const original = structuredClone(creation.rows[0].after);
  const retired = { ...structuredClone(original), status: 'retired', retirement: { kind: 'equivalent-merge', redirect: 'S-000002' } };
  const merger = { id: '34567890-1234-4234-8234-123456789abc', action: 'merge-equivalent', decision: structuredClone(ref),
    rows: [{ id: 'S-000001', before: original, after: retired },
      { id: 'S-000002', before: survivorState, after: structuredClone(survivorState), reason: 'Equivalent survivor retained' }],
    reason: 'Reviewed equivalent meanings' };
  merger.review = { ...creation.review, changeDigest: digestEvent(merger) };
  data.document.history.push(merger);
  data.document.subjects = [{ id: 'S-000001', ...retired, changes: [creation.id, merger.id] },
    { id: 'S-000002', ...survivorState, changes: [creation.id, merger.id] }];
  data.document.revision += 1;
  const checked = evaluate(data);
  assert.equal(checked.ok, true, JSON.stringify(checked.diagnostics));
  const result = subjectEligibility(checked.governance, 'S-000001', { purpose: 'query', policy: 'equivalent' });
  assert.equal(result.eligible, true);
  assert.equal(result.resolution.id, 'S-000002');
  assert.equal(subjectEligibility(checked.governance, 'S-000001', { purpose: 'new-assignment', policy: 'equivalent' }).eligible, false);
  const exhausted = subjectEligibility(checked.governance, 'S-000001', {
    purpose: 'query', policy: 'equivalent', budget: { redirects: 0 },
  });
  assert.equal(exhausted.code, 'redirect-budget');
  assert.equal(exhausted.resolution.code, 'redirect-budget');
  assert.equal(subjectEligibility(checked.governance, 'S-000001', {
    purpose: 'new-assignment', policy: 'equivalent', budget: { redirects: 0 },
  }).code, 'subject-retired');
  const unavailable = evaluate({ ...data, decisionCaptures: [] });
  assert.equal(subjectEligibility(unavailable.governance, 'S-000001', { purpose: 'query', policy: 'equivalent' }).eligible, null);
});

test('governance corroborates subject occupancy against the actual shared identity ledger', () => {
  for (const [code, mutate] of [
    ['invalid-subject-allocation', (d) => { d.identityInput.identity.allocations = d.identityInput.identity.allocations.filter((r) => r.kind !== 'subject'); }],
    ['invalid-subject-allocation', (d) => { Object.assign(d.identityInput.identity.allocations[1], { state: 'cancelled', reason: 'Cancelled reservation' }); }],
    ['invalid-subject-allocation', (d) => { Object.assign(d.identityInput.identity.allocations[1], { state: 'retired', reason: 'Terminal identity' }); }],
    ['namespace-mismatch', (d) => { d.identityInput.identity.namespace = eventId; }],
    ['invalid-identity-ledger', (d) => { d.identityInput.identity.allocations[1].kind = 'knowledge'; }],
  ]) {
    const data = fixture(); mutate(data);
    if (validateIdentityLedger(data.identityInput.identity).ok) data.identityIndex = buildIdentityIndex(data.identityInput);
    const result = evaluate(data);
    assert.equal(result.ok, false, JSON.stringify(result));
    assert.equal(result.governance, null);
    assert.ok(result.diagnostics.some((d) => d.code === code), JSON.stringify(result.diagnostics));
  }
  const data = fixture();
  const checked = evaluate(data);
  assert.equal(getSubjectGovernanceDescriptor(checked.governance).identityDigest, canonicalSha256(data.identityInput.identity));
});

test('same namespace cannot disguise independently captured ledger revisions', () => {
  const data = fixture();
  data.identityInput.identity.allocations.push({ id: 'S-000003', kind: 'subject', state: 'allocated',
    publication: { id: eventId, review: 'review:identity' } });
  const result = evaluate(data);
  assert.equal(result.ok, false);
  assert.ok(result.diagnostics.some((d) => d.code === 'identity-capture-mismatch'), JSON.stringify(result.diagnostics));
});

test('empty-assignment consumers validate options without fabricated IDs or governance', () => {
  assert.deepEqual(validateSubjectEligibilityOptions({ purpose: 'query' }), { purpose: 'query', policy: 'current' });
  for (const options of [null, {}, { purpose: 'approve' }, { purpose: 'inspect', extra: true },
    { purpose: 'query', policy: 'latest' }]) {
    assert.throws(() => validateSubjectEligibilityOptions(options), { code: 'invalid-options' });
  }
  for (const budget of [null, {}, { redirects: -1 }, { redirects: 1, nodes: 1 }]) {
    assert.throws(() => validateSubjectEligibilityOptions({ purpose: 'query', budget }), { code: 'invalid-budget' });
  }
  const options = { purpose: 'query', policy: 'equivalent', budget: { redirects: 3 } };
  const normalized = validateSubjectEligibilityOptions(options);
  normalized.budget.redirects = 0;
  assert.equal(options.budget.redirects, 3);
});

test('new unreviewed identities cannot accompany another subjects valid metadata edit', () => {
  for (const status of ['suppressed', 'retired', 'proposed']) {
    const { data, before } = renameFixture();
    data.document.subjects.push({ ...structuredClone(data.document.subjects[0]),
      id: status === 'proposed' ? `proposal:subject:${eventId}` : 'S-000002', status, changes: [],
      ...(status === 'retired' ? { retirement: { kind: 'retire' } } : {}) });
    const result = transition(data, before);
    assert.equal(result.ok, false, status);
    assert.ok(result.diagnostics.some((d) => d.code === 'unreviewed-state-change'), JSON.stringify(result.diagnostics));
  }
});

test('a later reparent cannot conceal an invalid historical event forest', () => {
  const data = fixture();
  const creation = data.document.history[0];
  creation.rows[0].after.parent = 'S-000001';
  creation.review.changeDigest = digestEvent(creation);
  const invalidState = structuredClone(creation.rows[0].after);
  const after = structuredClone(invalidState); delete after.parent;
  const repair = { id: '34567890-1234-4234-8234-123456789abc', action: 'reparent', decision: structuredClone(ref),
    rows: [{ id: 'S-000001', before: invalidState, after }] };
  repair.review = { ...creation.review, changeDigest: digestEvent(repair) };
  data.document.history.push(repair);
  data.document.subjects = [{ id: 'S-000001', ...after, changes: [creation.id, repair.id] }];
  data.document.revision = 2;
  data.document.hierarchyRevision = 2;
  assert.equal(indexSubjects(data.document).ok, true, 'the final forest alone conceals the invalid prefix');
  assert.equal(evaluate(data).ok, false);
  assert.equal(transition(data).ok, false);
});

test('multi-participant reparenting validates the complete atomic event forest', () => {
  const data = fixture();
  const creation = data.document.history[0];
  const first = structuredClone(creation.rows[0].after);
  const second = { ...structuredClone(first), label: 'Child', parent: 'S-000001' };
  creation.rows.push({ id: 'S-000002', before: null, after: second });
  creation.review.changeDigest = digestEvent(creation);
  const before = { ...structuredClone(data.document), hierarchyRevision: 1,
    subjects: [{ id: 'S-000001', ...structuredClone(first), changes: [creation.id] },
      { id: 'S-000002', ...structuredClone(second), changes: [creation.id] }] };
  const afterFirst = { ...structuredClone(first), parent: 'S-000002' };
  const afterSecond = structuredClone(second); delete afterSecond.parent;
  const change = { id: '34567890-1234-4234-8234-123456789abc', action: 'reparent', decision: structuredClone(ref),
    rows: [{ id: 'S-000001', before: first, after: afterFirst }, { id: 'S-000002', before: second, after: afterSecond }] };
  change.review = { ...creation.review, changeDigest: digestEvent(change) };
  data.document.history.push(change);
  data.document.subjects = [{ id: 'S-000001', ...afterFirst, changes: [creation.id, change.id] },
    { id: 'S-000002', ...afterSecond, changes: [creation.id, change.id] }];
  data.document.revision = 2;
  data.document.hierarchyRevision = 2;
  const result = transition(data, before);
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  data.document.hierarchyRevision += 1;
  assert.equal(transition(data, before).ok, false, 'an atomic multirow parent change increments hierarchy revision once');
});
