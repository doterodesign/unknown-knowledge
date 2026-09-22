import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as assignments from '../payload/engine/lib/assignment-validation.js';
import { indexSubjects } from '../payload/engine/lib/subjects.js';
import { evaluateSubjectGovernance, subjectEligibility, validateSubjectGovernanceCapture } from '../payload/engine/lib/subject-governance.js';
import { subjectGovernanceFixture } from './helpers/subject-governance-fixture.js';
import { canonicalSha256 } from '../payload/engine/lib/canonical-json.js';

const namespace = '12345678-1234-4234-8234-123456789abc';
const S = 'S-000001';
const T = 'S-000002';
const options = { purpose: 'new-assignment', budget: { redirects: 0 } };
const row = (metadata = { subjects: [S] }, kind = 'knowledge', status = 'verified') => {
  const id = { knowledge: 'K-000001', ontology: 'O-000001', decision: 'D-000001' }[kind];
  return { ref: { namespace, kind, id }, entry: { id, file: `${kind}/record.yaml`,
    record: { id, ...(kind === 'knowledge' ? { facets: { stage: status } } : { status }), ...metadata } } };
};
const draft = () => {
  const entry = row().entry;
  entry.record.id = entry.id = 'proposal:knowledge:34567890-1234-4234-8234-123456789abc';
  entry.record.facets.stage = 'draft';
  return { proposalRef: { namespace, kind: 'knowledge', key: entry.id }, entry };
};
function fixture({ retired = false, missingEvidence = false, unreviewed = false } = {}) {
  const data = subjectGovernanceFixture();
  const first = data.document.history[0];
  const active = structuredClone(first.rows[0].after);
  first.rows.push({ id: T, before: null, after: structuredClone(active) });
  const { review, ...body } = first;
  first.review.changeDigest = canonicalSha256(body);
  data.document.subjects.push({ id: T, ...structuredClone(active), changes: [first.id] });
  if (retired) {
    const after = { ...structuredClone(active), status: 'retired', retirement: { kind: 'equivalent-merge', redirect: T } };
    const event = { id: '34567890-1234-4234-8234-123456789abc', action: 'merge-equivalent', decision: first.decision,
      rows: [{ id: S, before: structuredClone(active), after },
        { id: T, before: structuredClone(active), after: structuredClone(active), reason: 'Retain survivor' }], reason: 'Reviewed equivalent meaning' };
    event.review = { ...first.review, changeDigest: canonicalSha256(event) };
    data.document.history.push(event);
    data.document.subjects[0] = { id: S, ...after, changes: [first.id, event.id] };
    data.document.subjects[1].changes.push(event.id);
    data.document.revision = 2;
  }
  if (unreviewed) {
    data.document.subjects[0].changes = [];
    data.document.history = [];
    data.document.subjects[1].changes = [];
    data.document.revision = 0;
  }
  const registry = indexSubjects(data.document).registry;
  const evaluation = evaluateSubjectGovernance({ registry, identity: data.identityInput.identity,
    identityIndex: data.identityIndex, decisionCaptures: missingEvidence ? [] : data.decisionCaptures });
  assert.equal(evaluation.ok, !unreviewed, JSON.stringify(evaluation.diagnostics));
  const model = { ok: true, identity: data.identityInput.identity, identityIndex: data.identityIndex,
    stores: { decisions: { present: true } },
    subjectRegistry: registry, decisions: new Map(data.identityInput.records.map(({ entry }) => [entry.record.id, entry])) };
  return { governance: evaluation.governance, registry, model };
}
const check = (before, candidate, governance, opts = options) => assignments.validateAssignmentChange({ before, candidate, governance }, opts);
const identity = ({ originalId, index, path }) => ({ originalId, index, path });

test('effective same-owner change gates only added IDs at their original candidate positions', () => {
  const { governance } = fixture();
  const result = check(row({ subjects: [S] }), row({ subjects: [S, T] }), governance);
  assert.equal(result.ok, true);
  assert.equal(result.publicationReady, false);
  assert.equal(result.scope, 'row-local-assignment-eligibility');
  assert.deepEqual(result.ref, row().ref);
  assert.deepEqual(result.changes, { added: [T], retained: [S], removed: [], newEffective: [T] });
  assert.deepEqual(result.subjects.map(identity), [{ originalId: T, index: 1, path: 'subjects[1]' }]);
  assert.deepEqual(result.subjects[0].outcome, subjectEligibility(governance, T, { purpose: 'new-assignment', policy: 'current', budget: { redirects: 0 } }));
  assert.deepEqual(result.used, { redirects: 0 });
});

test('retained retired IDs survive additions and reordering without redirects or new approval', () => {
  const { governance } = fixture({ retired: true });
  const result = check(row({ subjects: [S] }), row({ subjects: [T, S] }), governance);
  assert.equal(result.ok, true);
  assert.deepEqual(result.changes.retained, [S]);
  assert.deepEqual(result.subjects.map(identity), [{ originalId: T, index: 0, path: 'subjects[0]' }]);
  const reordered = check(row({ subjects: [S, T] }), row({ subjects: [T, S] }), governance);
  assert.equal(reordered.ok, true);
  assert.deepEqual(reordered.changes, { added: [], retained: [T, S], removed: [], newEffective: [] });
  assert.deepEqual(reordered.subjects, []);
});

test('new retired IDs cannot inherit an equivalent survivor approval', () => {
  const result = check(row({ subjects: [T] }), row({ subjects: [T, S] }), fixture({ retired: true }).governance);
  assert.equal(result.ok, false);
  assert.equal(result.diagnostics[0].code, 'subject-retired');
  assert.equal(result.diagnostics[0].path, 'subjects[1]');
  assert.deepEqual(result.subjects[0].outcome.resolution.redirects, []);
});

test('first canonical publication and all three draft-to-effective transitions gate every ID', () => {
  const { governance } = fixture();
  for (const [kind, active, inactive] of [['knowledge', 'verified', 'draft'], ['ontology', 'active', 'draft'], ['decision', 'accepted', 'proposed']]) {
    const candidate = row({ subjects: [T, S] }, kind, active);
    for (const before of [null, row({ subjects: [T, S] }, kind, inactive)]) {
      const result = check(before, candidate, governance);
      assert.equal(result.ok, true);
      assert.deepEqual(result.changes.newEffective, [T, S]);
      assert.deepEqual(result.subjects.map(({ index }) => index), [0, 1]);
      assert.equal(result.publicationReady, false);
    }
  }
  assert.equal(check(row({}, 'knowledge', 'draft'), row({ subjects: [S] }), fixture({ retired: true }).governance).ok, false);
});

for (const [kind, priorEffective, effective, inactive] of [
  ['knowledge', 'verified', 'verified', 'draft'],
  ['ontology', 'active', 'active', 'draft'],
  ['decision', 'accepted', 'addressed', 'proposed'],
]) {
  test(`${kind}: continued effectiveness preserves retired assignments while gating additions`, () => {
    const { governance } = fixture({ retired: true });
    const candidate = row({ subjects: [T, S] }, kind, effective);
    const added = check(row({ subjects: [S] }, kind, priorEffective), candidate, governance);
    assert.equal(added.ok, true);
    assert.deepEqual(added.changes, { added: [T], retained: [S], removed: [], newEffective: [T] });
    assert.deepEqual(added.subjects.map(identity), [{ originalId: T, index: 0, path: 'subjects[0]' }]);
    assert.equal(added.subjects[0].outcome.eligible, true);
    assert.equal(added.lifecycle.before.state, 'effective');
    assert.equal(added.lifecycle.candidate.state, 'effective');
    assert.equal(added.publicationReady, false);

    const reordered = check(row({ subjects: [S, T] }, kind, priorEffective), candidate, governance);
    assert.equal(reordered.ok, true);
    assert.deepEqual(reordered.changes, { added: [], retained: [T, S], removed: [], newEffective: [] });
    assert.deepEqual(reordered.subjects, []);
    assert.deepEqual(reordered.used, { redirects: 0 });
    assert.equal(reordered.publicationReady, false);
  });

  test(`${kind}: first effectiveness cannot retain an unchanged retired assignment as approval`, () => {
    const { governance } = fixture({ retired: true });
    const candidate = row({ subjects: [S] }, kind, effective);
    for (const before of [row({ subjects: [S] }, kind, inactive), null]) {
      const result = check(before, candidate, governance);
      assert.equal(result.ok, false);
      assert.deepEqual(result.changes.newEffective, [S]);
      assert.deepEqual(result.changes.added, before === null ? [S] : []);
      assert.deepEqual(result.subjects.map(identity), [{ originalId: S, index: 0, path: 'subjects[0]' }]);
      assert.equal(result.diagnostics[0].code, 'subject-retired');
      assert.equal(result.diagnostics[0].path, 'subjects[0]');
      assert.deepEqual(result.subjects[0].outcome.resolution.redirects, []);
      assert.equal(result.publicationReady, false);
    }
  });

  test(`${kind}: proposal inspection preserves historical subjects despite an effective payload status`, () => {
    const { entry } = row({ subjects: [S] }, kind, effective);
    const key = `proposal:${kind}:34567890-1234-4234-8234-123456789abc`;
    entry.record.id = entry.id = key;
    const candidate = { proposalRef: { namespace, kind, key }, entry };
    const { registry, governance } = fixture({ retired: true });
    const inspected = check(null, candidate, registry, { purpose: 'inspect', budget: { redirects: 0 } });
    assert.equal(inspected.ok, true);
    assert.equal(inspected.lifecycle.candidate.state, 'unpublished');
    assert.equal(inspected.lifecycle.candidate.lifecycle, effective);
    assert.deepEqual(inspected.proposalRef, candidate.proposalRef);
    assert.equal(Object.hasOwn(inspected, 'ref'), false);
    assert.deepEqual(inspected.changes.newEffective, []);
    assert.equal(inspected.subjects[0].outcome.resolution.id, S);
    assert.equal(inspected.subjects[0].outcome.verification, 'not-required');
    assert.equal(inspected.publicationReady, false);

    const attempted = check(null, candidate, governance);
    assert.equal(attempted.ok, false);
    assert.equal(attempted.diagnostics[0].code, 'non-effective-candidate');
    assert.deepEqual(attempted.subjects, []);
    assert.equal(attempted.publicationReady, false);
  });
}

test('unknown assignment metadata cannot establish retention; absent and empty remain distinct', () => {
  const { governance } = fixture();
  const result = check(row({}), row({ subjects: [S] }), governance);
  assert.equal(result.ok, true);
  assert.deepEqual(result.before, { state: 'unknown', reason: 'absent' });
  assert.deepEqual(result.changes.newEffective, [S]);
  assert.deepEqual(result.changes.retained, []);
  const empty = check(row({}), row({ subjects: [] }), undefined);
  assert.equal(empty.ok, true);
  assert.deepEqual(empty.before, { state: 'unknown', reason: 'absent' });
  assert.deepEqual(empty.candidate, { state: 'known', ids: [] });
  assert.equal(empty.publicationReady, false);
  const removed = check(row({ subjects: [S] }), row({}), undefined);
  assert.deepEqual(removed.changes.removed, [S]);
  assert.deepEqual(removed.candidate, { state: 'unknown', reason: 'absent' });
});

test('unknown lifecycle never becomes a prior-effective or new-effective claim', () => {
  for (const beforeUnknown of [false, true]) {
    const prior = row(); const candidate = row({ subjects: [] });
    delete (beforeUnknown ? prior : candidate).entry.record.facets;
    const result = check(prior, candidate, undefined);
    assert.equal(result.ok, false);
    assert.equal(result.diagnostics[0].code, 'unknown-record-lifecycle');
    assert.equal(result.diagnostics[0].path, `${beforeUnknown ? 'before' : 'candidate'}.lifecycle`);
  }
});

test('non-effective and proposal candidates require explicit inspection', () => {
  for (const candidate of [row({}, 'knowledge', 'draft'), draft()]) {
    assert.equal(check(null, candidate, undefined).diagnostics[0].code, 'non-effective-candidate');
    const result = check(null, candidate, fixture({ retired: true }).registry, { purpose: 'inspect' });
    assert.equal(result.ok, true);
    assert.equal(result.publicationReady, false);
    assert.deepEqual(result.changes.newEffective, []);
  }
});

test('inspection preserves historical originals without granting publication eligibility', () => {
  const result = check(null, row(), fixture({ retired: true }).registry, { purpose: 'inspect', budget: { redirects: 0 } });
  assert.equal(result.ok, true);
  assert.equal(result.subjects[0].outcome.resolution.id, S);
  assert.equal(result.subjects[0].outcome.verification, 'not-required');
  assert.deepEqual(result.used, { redirects: 0 });
  assert.equal(result.publicationReady, false);
});

test('malformed or duplicate prior/candidate assignments fail instead of becoming empty metadata', () => {
  for (const malformed of [null, [S, S], ['S-1']]) for (const side of ['before', 'candidate']) {
    const before = row(); const candidate = row();
    (side === 'before' ? before : candidate).entry.record.subjects = malformed;
    const result = check(before, candidate, undefined);
    assert.equal(result.ok, false);
    assert.ok(result.diagnostics[0].path.startsWith(side === 'before' ? 'before.subjects' : 'subjects'));
    assert.deepEqual(result.subjects, []);
  }
});

test('prior-state diagnostics keep the original before-file when the candidate moved', () => {
  const before = row({ subjects: [S, S] });
  before.entry.file = 'knowledge/before.md';
  const result = check(before, row(), undefined);
  assert.equal(result.diagnostics[0].file, 'knowledge/before.md');
  assert.equal(result.diagnostics[0].path, 'before.subjects[1]');
});

test('typed rows and outer input are closed and require canonical same-owner continuity', () => {
  const extra = row(); extra.ref.previousId = 'K-1';
  const wrong = row(); wrong.entry.identity = 'K-000002';
  for (const candidate of [null, { ...row(), extra: true }, { ...row(), proposalRef: draft().proposalRef }, extra, wrong]) {
    assert.equal(check(null, candidate, undefined).diagnostics[0].code, 'invalid-record-ref');
  }
  for (const before of [draft(), row({}, 'ontology', 'active')]) {
    assert.equal(check(before, row(), undefined).ok, false);
  }
  assert.equal(check(row(), draft(), undefined, { purpose: 'inspect' }).diagnostics[0].code, 'owner-mismatch');
  const other = row(); other.ref.namespace = '23456789-1234-4234-8234-123456789abc';
  assert.equal(check(other, row(), undefined).diagnostics[0].code, 'owner-mismatch');
  assert.equal(assignments.validateAssignmentChange({ candidate: row(), governance: null }, options).ok, false);
  assert.equal(assignments.validateAssignmentChange({ before: null, candidate: row(), governance: null, approved: true }, options).ok, false);
});

test('options are explicit and validated before any zero-target bypass', () => {
  for (const opts of [undefined, null, {}, { purpose: 'query' }, { purpose: 'new-assignment', policy: 'equivalent' },
    { purpose: 'inspect', extra: true }, { purpose: 'inspect', budget: { redirects: -1 } },
    { purpose: 'inspect', budget: null }, { purpose: 'inspect', budget: { redirects: 1.5 } }]) {
    const result = assignments.validateAssignmentChange({ before: null, candidate: row({ subjects: [] }), governance: undefined }, opts);
    assert.equal(result.ok, false);
    assert.ok(['invalid-options', 'invalid-budget'].includes(result.diagnostics[0].code));
  }
});

test('actual unavailable governance and unreviewed subject outcomes refuse new effective IDs', () => {
  for (const governance of [undefined, {}, fixture().registry, fixture({ missingEvidence: true }).governance, fixture({ unreviewed: true }).governance]) {
    const result = check(null, row(), governance);
    assert.equal(result.ok, false);
    assert.equal(result.diagnostics[0].code, 'governance-unavailable');
  }
});

test('namespace mismatch refuses and typed target failures preserve original indices and stop', () => {
  const { governance } = fixture();
  const candidate = row(); candidate.ref.namespace = '23456789-1234-4234-8234-123456789abc';
  assert.equal(check(null, candidate, governance).diagnostics[0].code, 'namespace-mismatch');
  const result = check(row({ subjects: [S] }), row({ subjects: [S, T, 'S-999999', 'S-999998'] }), governance);
  assert.equal(result.ok, false);
  assert.equal(result.diagnostics[0].path, 'subjects[2]');
  assert.deepEqual(result.subjects.map(identity), [{ originalId: T, index: 1, path: 'subjects[1]' }]);
});

test('row-local empty success cannot replace real candidate context binding', () => {
  const { governance, model } = fixture();
  assert.equal(validateSubjectGovernanceCapture(governance, { model }).ok, true);
  assert.equal(check(null, row({ subjects: [] }), governance).ok, true);
  model.decisions.get('D-000001').record.title = 'Changed after evaluation';
  assert.equal(validateSubjectGovernanceCapture(governance, { model }).ok, false);
  const local = check(null, row({ subjects: [] }), governance);
  assert.equal(local.ok, true, 'the deliberately row-local DTO does not pretend to authenticate a model');
  assert.equal(local.publicationReady, false);
});

test('inputs and detached results retain authored order, dates, scope, citations and body', () => {
  const before = row({ subjects: [S], verified: '2026-09-01' });
  const candidate = row({ subjects: [T, S], verified: '2026-09-01', citations: [{ source: 'world' }], applies: { jurisdictions: ['fixture'] } });
  candidate.entry.body = 'Unchanged evidence.';
  const original = JSON.stringify({ before, candidate });
  const freeze = (value) => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } };
  freeze(before); freeze(candidate);
  const { governance } = fixture();
  const result = check(before, candidate, governance);
  assert.equal(result.ok, true);
  result.candidate.ids.push('S-999999'); result.changes.retained.push('S-999998');
  result.ref.id = 'K-999999';
  const again = check(before, candidate, governance);
  assert.deepEqual(again.candidate.ids, [T, S]);
  assert.deepEqual(again.changes.retained, [S]);
  assert.equal(JSON.stringify({ before, candidate }), original);
});

test('unexpected record access errors propagate rather than masquerading as eligibility diagnostics', () => {
  const candidate = row();
  Object.defineProperty(candidate.entry, 'record', { get() { throw new Error('broken capture accessor'); } });
  assert.throws(() => check(null, candidate, undefined), /broken capture accessor/);
});
