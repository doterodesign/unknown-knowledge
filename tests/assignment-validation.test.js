import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateAssignments } from '../payload/engine/lib/assignment-validation.js';
import { indexSubjects } from '../payload/engine/lib/subjects.js';
import { evaluateSubjectGovernance, subjectEligibility } from '../payload/engine/lib/subject-governance.js';
import { subjectGovernanceFixture } from './helpers/subject-governance-fixture.js';
import { canonicalSha256 } from '../payload/engine/lib/canonical-json.js';
import { buildIdentityIndex } from '../payload/engine/lib/record-identity-index.js';

const S = 'S-000001';
const namespace = '12345678-1234-4234-8234-123456789abc';
const proposalKey = 'proposal:knowledge:34567890-1234-4234-8234-123456789abc';

function row(metadata = { subjects: [S] }, kind = 'knowledge', id = 'K-000001') {
  return { ref: { namespace, kind, id }, entry: { id, file: `${kind}/${id}.yaml`, record: { id, ...metadata } } };
}

function proposal(metadata = { subjects: [S] }) {
  return { proposalRef: { namespace, kind: 'knowledge', key: proposalKey },
    entry: { id: proposalKey, file: 'knowledge/draft.md', record: { id: proposalKey, ...metadata } } };
}

function evaluated(data = subjectGovernanceFixture()) {
  const result = evaluateSubjectGovernance({ registry: indexSubjects(data.document).registry,
    identity: data.identityInput.identity, identityIndex: data.identityIndex, decisionCaptures: data.decisionCaptures });
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  return result.governance;
}

function retiredFixture(equivalent = false) {
  const data = subjectGovernanceFixture();
  const creation = data.document.history[0];
  const before = structuredClone(creation.rows[0].after);
  if (equivalent) {
    creation.rows.push({ id: 'S-000002', before: null, after: structuredClone(before) });
    const { review, ...event } = creation;
    creation.review.changeDigest = canonicalSha256(event);
  }
  const after = { ...structuredClone(before), status: 'retired',
    retirement: equivalent ? { kind: 'equivalent-merge', redirect: 'S-000002' } : { kind: 'retire' } };
  const event = { id: '34567890-1234-4234-8234-123456789abc',
    action: equivalent ? 'merge-equivalent' : 'retire', decision: creation.decision,
    rows: [{ id: S, before, after }], reason: 'Keep the reviewed original meaning available historically' };
  if (equivalent) event.rows.push({ id: 'S-000002', before: structuredClone(before),
    after: structuredClone(before), reason: 'Retain reviewed equivalent survivor' });
  event.review = { ...creation.review, changeDigest: canonicalSha256(event) };
  data.document.history.push(event);
  data.document.subjects = [{ id: S, ...after, changes: [creation.id, event.id] }];
  if (equivalent) data.document.subjects.push({ id: 'S-000002', ...before, changes: [creation.id, event.id] });
  data.document.revision = 2;
  return data;
}

test('real evaluated eligibility is retained for canonical and explicitly separate proposal owners', () => {
  const context = evaluated();
  for (const input of [row(), row({ subjects: [S] }, 'ontology', 'O-000001'),
    row({ subjects: [S] }, 'decision', 'D-000001'), proposal()]) {
    const result = validateAssignments(input, context, { purpose: 'new-assignment' });
    assert.equal(result.ok, true);
    assert.deepEqual(result.assignments, { state: 'known', ids: [S] });
    assert.equal(result.subjects.length, 1);
    assert.deepEqual(result.subjects[0], { originalId: S, index: 0, path: 'subjects[0]',
      outcome: subjectEligibility(context, S, { purpose: 'new-assignment' }) });
    assert.equal(result.subjects[0].outcome.eligible, true);
    assert.equal(result.subjects[0].outcome.verification, 'verified');
    assert.deepEqual(result.diagnostics, []);
  }
});

test('absent and empty authored lists remain distinct without requiring a registry', () => {
  for (const purpose of ['inspect', 'query', 'new-assignment']) {
    for (const input of [row({}), proposal({})]) {
      assert.deepEqual(validateAssignments(input, undefined, { purpose }), {
        ok: true, assignments: { state: 'unknown', reason: 'absent' }, subjects: [], diagnostics: [], used: { redirects: 0 },
      });
    }
    assert.deepEqual(validateAssignments(row({ subjects: [] }), null, { purpose }), {
      ok: true, assignments: { state: 'known', ids: [] }, subjects: [], diagnostics: [], used: { redirects: 0 },
    });
  }
});

test('shape failures remain invalid metadata, with original authored positions in diagnostics', () => {
  for (const subjects of [[S, S], null, ['S-1'], ['proposal:subject:34567890-1234-4234-8234-123456789abc']]) {
    const input = proposal({ subjects });
    const result = validateAssignments(input, evaluated(), { purpose: 'query' });
    assert.equal(result.ok, false);
    assert.equal(result.assignments.state, 'invalid');
    assert.deepEqual(result.subjects, []);
    assert.ok(result.diagnostics.length > 0);
    assert.deepEqual(result.diagnostics[0].proposalRef, input.proposalRef);
    assert.equal(Object.hasOwn(result.diagnostics[0], 'ref'), false);
  }
});

test('raw structural registry permits inspection but cannot authorize queries or new assignments', () => {
  const registry = indexSubjects(subjectGovernanceFixture().document).registry;
  const inspect = validateAssignments(row(), registry, { purpose: 'inspect' });
  assert.equal(inspect.ok, true);
  assert.equal(inspect.subjects[0].outcome.verification, 'not-required');
  for (const purpose of ['query', 'new-assignment']) {
    const result = validateAssignments(row(), registry, { purpose });
    assert.equal(result.ok, false);
    assert.equal(result.diagnostics[0].code, 'governance-unavailable');
    assert.equal(result.diagnostics[0].path, 'subjects[0]');
    assert.deepEqual(result.subjects, []);
  }
});

test('missing historical evidence is an unavailable verification outcome, never false membership', () => {
  const data = subjectGovernanceFixture('archived');
  assert.equal(validateAssignments(row(), evaluated(data), { purpose: 'query' }).ok, true);
  data.decisionCaptures = [];
  const result = validateAssignments(row(), evaluated(data), { purpose: 'query' });
  assert.equal(result.ok, false);
  assert.equal(result.subjects[0].outcome.eligible, null);
  assert.equal(result.subjects[0].outcome.verification, 'unavailable');
  assert.equal(result.subjects[0].outcome.resolution.id, S);
  assert.equal(result.diagnostics[0].code, 'governance-unavailable');
});

test('corrupt evidence never becomes a usable context or inferred approval', () => {
  const data = subjectGovernanceFixture();
  data.decisionCaptures[0].bytes[0] = 0;
  const failed = evaluateSubjectGovernance({ registry: indexSubjects(data.document).registry,
    identity: data.identityInput.identity, identityIndex: data.identityIndex, decisionCaptures: data.decisionCaptures });
  assert.equal(failed.ok, false);
  assert.equal(failed.governance, null);
  const result = validateAssignments(row(), failed.governance, { purpose: 'new-assignment' });
  assert.equal(result.ok, false);
  assert.equal(result.diagnostics[0].code, 'governance-unavailable');
  assert.deepEqual(result.subjects, []);
});

test('retired history and equivalence retain original IDs and witnesses without authoring permission', () => {
  for (const equivalent of [false, true]) {
    const context = evaluated(retiredFixture(equivalent));
    const policy = equivalent ? 'equivalent' : 'historical';
    const input = row();
    const result = validateAssignments(input, context, { purpose: 'query', policy });
    assert.equal(result.ok, true);
    assert.deepEqual(result.assignments, { state: 'known', ids: [S] });
    assert.equal(result.subjects[0].originalId, S);
    assert.equal(result.subjects[0].outcome.resolution.id, equivalent ? 'S-000002' : S);
    assert.deepEqual(result.subjects[0].outcome.resolution.redirects,
      equivalent ? [{ from: S, to: 'S-000002' }] : []);
    const denied = validateAssignments(input, context, { purpose: 'new-assignment', policy });
    assert.equal(denied.ok, false);
    assert.equal(denied.subjects[0].outcome.eligible, false);
    assert.equal(denied.diagnostics[0].code, 'subject-retired');
    assert.deepEqual(input.entry.record.subjects, [S]);
  }
});

test('one explicit redirect allowance is shared across all authored subject IDs', () => {
  const data = subjectGovernanceFixture();
  const creation = data.document.history[0];
  const state = structuredClone(creation.rows[0].after);
  creation.rows.push({ id: 'S-000002', before: null, after: structuredClone(state) },
    { id: 'S-000003', before: null, after: structuredClone(state) });
  const { review, ...creationBody } = creation;
  creation.review.changeDigest = canonicalSha256(creationBody);
  const retired = { ...structuredClone(state), status: 'retired',
    retirement: { kind: 'equivalent-merge', redirect: 'S-000003' } };
  const merger = { id: '34567890-1234-4234-8234-123456789abc', action: 'merge-equivalent',
    decision: creation.decision, rows: [
      { id: S, before: structuredClone(state), after: structuredClone(retired) },
      { id: 'S-000002', before: structuredClone(state), after: structuredClone(retired) },
      { id: 'S-000003', before: structuredClone(state), after: structuredClone(state), reason: 'Retain survivor' },
    ], reason: 'Two independently reviewed equivalent predecessors' };
  merger.review = { ...creation.review, changeDigest: canonicalSha256(merger) };
  data.document.history.push(merger);
  data.document.subjects = [
    { id: S, ...structuredClone(retired), changes: [creation.id, merger.id] },
    { id: 'S-000002', ...structuredClone(retired), changes: [creation.id, merger.id] },
    { id: 'S-000003', ...structuredClone(state), changes: [creation.id, merger.id] },
  ];
  data.document.revision = 2;
  data.identityInput.identity.allocations.push({ ...structuredClone(data.identityInput.identity.allocations[1]), id: 'S-000003' });
  data.identityIndex = buildIdentityIndex(data.identityInput);
  const context = evaluated(data);
  const input = row({ subjects: [S, 'S-000002'] });
  const limited = validateAssignments(input, context, { purpose: 'query', policy: 'equivalent', budget: { redirects: 1 } });
  assert.equal(limited.ok, false);
  assert.deepEqual(limited.used, { redirects: 1 });
  assert.deepEqual(limited.subjects.map(({ outcome }) => outcome.eligible), [true, false]);
  assert.equal(limited.subjects[1].outcome.code, 'redirect-budget');
  assert.equal(limited.diagnostics[0].path, 'subjects[1]');
  const complete = validateAssignments(input, context, { purpose: 'query', policy: 'equivalent', budget: { redirects: 2 } });
  assert.equal(complete.ok, true);
  assert.deepEqual(complete.used, { redirects: 2 });
  assert.deepEqual(complete.subjects.map(({ outcome }) => outcome.resolution.id), ['S-000003', 'S-000003']);
  assert.deepEqual(input.entry.record.subjects, [S, 'S-000002']);
});

test('typed errors preserve earlier outcomes and stop before evaluating later targets', () => {
  const result = validateAssignments(row({ subjects: [S, 'S-999999', 'S-000002'] }), evaluated(), { purpose: 'query' });
  assert.equal(result.ok, false);
  assert.equal(result.diagnostics[0].code, 'unknown-subject');
  assert.equal(result.diagnostics[0].path, 'subjects[1]');
  assert.deepEqual(result.subjects.map(({ originalId, index, path }) => ({ originalId, index, path })), [
    { originalId: S, index: 0, path: 'subjects[0]' },
  ]);
});

test('namespace mismatch refuses both owner identity variants before looking up assignments', () => {
  for (const input of [row({ subjects: ['S-999999'] }), proposal({ subjects: ['S-999999'] })]) {
    const reference = input.ref ?? input.proposalRef;
    reference.namespace = 'e8ba2f20-1d77-4f95-a30c-8f447acc1dc3';
    const result = validateAssignments(input, evaluated(), { purpose: 'query' });
    assert.equal(result.ok, false);
    assert.equal(result.diagnostics[0].code, 'namespace-mismatch');
    assert.deepEqual(result.subjects, []);
  }
});

test('invalid row unions and inconsistent owner identities never reach subject eligibility', () => {
  const both = { ...row(), proposalRef: proposal().proposalRef };
  const wrongAlias = row(); wrongAlias.entry.identity = 'K-000002';
  const wrongProposalAlias = proposal(); wrongProposalAlias.entry.id = 'K-000001';
  const wrongKind = proposal(); wrongKind.proposalRef.kind = 'ontology';
  const extraRef = row(); extraRef.ref.previousId = 'K-1';
  for (const input of [null, { entry: row().entry }, both, wrongAlias, wrongProposalAlias, wrongKind, extraRef]) {
    const result = validateAssignments(input, evaluated(), { purpose: 'query' });
    assert.equal(result.ok, false);
    assert.equal(result.diagnostics[0].code, 'invalid-record-ref');
    assert.deepEqual(result.subjects, []);
  }
});

test('invalid options refuse even absent or empty assignments without probing a fabricated subject', () => {
  for (const options of [undefined, null, {}, { purpose: 'trust' }, { purpose: 'query', bypass: true },
    { purpose: 'query', policy: 'latest' }, { purpose: 'inspect', budget: { redirects: -1 } },
    { purpose: 'inspect', budget: null }]) {
    for (const input of [row({}), row({ subjects: [] })]) {
      const result = validateAssignments(input, undefined, options);
      assert.equal(result.ok, false);
      assert.ok(['invalid-options', 'invalid-budget'].includes(result.diagnostics[0].code));
      assert.equal(result.diagnostics[0].path, 'options');
      assert.deepEqual(result.subjects, []);
    }
  }
});

test('read-only validation preserves frozen authored state and repeats deterministic outcomes', () => {
  const input = row({ subjects: [S], verified: '2026-09-01', applies: { jurisdictions: ['fixture'] } });
  Object.freeze(input.entry.record.subjects);
  Object.freeze(input.entry.record);
  Object.freeze(input.entry);
  Object.freeze(input.ref);
  Object.freeze(input);
  const before = JSON.stringify(input);
  const context = evaluated();
  const first = validateAssignments(input, context, { purpose: 'query' });
  assert.equal(first.ok, true);
  first.assignments.ids.push('S-999999');
  const again = validateAssignments(input, context, { purpose: 'query' });
  assert.deepEqual(again.assignments.ids, [S]);
  assert.equal(JSON.stringify(input), before);
});
