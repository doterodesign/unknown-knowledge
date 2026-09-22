import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadStores } from '../payload/engine/lib/load-stores.js';
import { canonicalSha256 } from '../payload/engine/lib/canonical-json.js';
import { indexSubjects, lookupSubjects } from '../payload/engine/lib/subjects.js';
import { validateSubjectTransition, evaluateSubjectGovernance, subjectEligibility,
  getGovernedSubjectRegistry } from '../payload/engine/lib/subject-governance.js';

import { fixture, authored, eventId, proposal, ref, stateOf, digestEvent } from './helpers/subject-suppression-fixture.js';

const transition = (f) => validateSubjectTransition(f);
function refresh(f) {
  const event = f.candidate.history.at(-1);
  event.review.changeDigest = digestEvent(event);
  for (const row of event.rows) {
    const subject = f.candidate.subjects.find((item) => item.id === row.id);
    if (subject) Object.assign(subject, structuredClone(row.after));
  }
}

test('source-bound proposal suppression retains origin, meaning and refusal with no effective eligibility', (t) => {
  const f = fixture(t);
  const result = transition(f);
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  const registry = getGovernedSubjectRegistry(result.governance);
  const subject = registry.proposals.get(proposal);
  assert.deepEqual(subject.originDecision, ref('D-000001'));
  assert.deepEqual(subject.refusal, { decision: ref('D-000002'), reason: 'Not warranted for this scope' });
  assert.deepEqual(subject.definition, f.before.subjects[0].definition);
  assert.deepEqual(subject.changes, [eventId]);
  assert.equal(registry.hierarchyRevision, 0);
  assert.equal(lookupSubjects(registry, 'colour').matches[0].status, 'suppressed');
  for (const purpose of ['query', 'new-assignment']) {
    assert.equal(subjectEligibility(result.governance, proposal, { purpose }).eligible, false);
  }
  f.put('subjects/registry.yaml', authored(f.candidate));
  const loaded = loadStores(f.root);
  assert.equal(loaded.ok, true, JSON.stringify(loaded.diagnostics));
  assert.deepEqual(loaded.subjectRegistry.document, f.candidate);
});

test('a declared proposal baseline cannot invent a prior proposal or replace the actual model capture', (t) => {
  const missing = fixture(t);
  missing.before.subjects = [];
  missing.model.subjectRegistry = indexSubjects(missing.before).registry;
  assert.equal(transition(missing).ok, false, 'a new nonnull baseline is not a captured prior proposal');

  const changed = fixture(t);
  changed.before.subjects[0].label = 'Different captured meaning';
  changed.candidate.history[0].rows[0].before.label = 'Different captured meaning';
  changed.candidate.history[0].rows[0].after.label = 'Different captured meaning';
  refresh(changed);
  assert.equal(transition(changed).ok, false, 'matching caller documents cannot substitute for model.subjectRegistry');

  const unavailable = fixture(t);
  delete unavailable.model.subjectRegistry;
  assert.equal(transition(unavailable).ok, false, 'absence is not proof of a prior proposal');
});

test('suppression cannot smuggle changes to meaning, origin, aliases, hierarchy or refusal authorizer', (t) => {
  for (const mutate of [
    (row) => { row.after.label = 'New label'; },
    (row) => { row.after.definition.text = 'New meaning'; },
    (row) => { row.after.aliases = []; },
    (row) => { row.after.originDecision = ref('D-000002'); },
    (row) => { row.after.warrant = { records: [], sources: [] }; },
    (row) => { row.after.parent = 'S-000001'; },
    (row) => { row.after.refusal.decision = ref('D-000001'); },
    (row) => { row.after.refusal.reason = 'A different reason'; },
    (row) => { row.before = null; },
    (row) => { row.before.status = 'suppressed'; },
    (row) => { row.before.status = 'active'; },
  ]) {
    const f = fixture(t);
    mutate(f.candidate.history[0].rows[0]);
    refresh(f);
    assert.equal(transition(f).ok, false);
  }
});

test('suppression requires retained proposal, exact history and supplied accepted Decision evidence', (t) => {
  for (const mutate of [
    (f) => { f.candidate.subjects = []; },
    (f) => { f.candidate.subjects[0].changes = []; },
    (f) => { f.candidate.hierarchyRevision = 1; },
    (f) => { f.decisionCaptures = []; },
    (f) => { f.decisionCaptures[0].bytes[0] = 0; },
    (f) => { f.candidate.history[0].review.acceptedStatus = 'proposed'; },
    (f) => { f.candidate.history[0].reason = ''; refresh(f); },
  ]) {
    const f = fixture(t); mutate(f);
    assert.equal(transition(f).ok, false);
  }
  const f = fixture(t);
  const captured = evaluateSubjectGovernance({ registry: indexSubjects(f.candidate).registry,
    identity: f.model.identity, identityIndex: f.identityIndex });
  assert.equal(captured.ok, true, 'inspection can retain a declared baseline without original source possession');
  assert.equal(subjectEligibility(captured.governance, proposal, { purpose: 'query' }).eligible, false);
});

test('multiple proposals may be refused atomically with one registry revision', (t) => {
  const f = fixture(t);
  const second = `proposal:subject:${eventId}`;
  const draft = { ...structuredClone(f.before.subjects[0]), id: second, label: 'Other proposal' };
  f.before.subjects.push(draft);
  const event = f.candidate.history[0];
  const row = { id: second, before: stateOf(draft), after: { ...stateOf(draft), status: 'suppressed',
    refusal: { decision: event.decision, reason: event.reason } } };
  event.rows.push(row);
  f.candidate.subjects.push({ id: second, ...row.after, changes: [eventId] });
  refresh(f);
  f.put('subjects/registry.yaml', authored(f.before));
  f.model = loadStores(f.root); f.identityIndex = f.model.identityIndex;
  const checked = transition(f);
  assert.equal(checked.ok, true, JSON.stringify(checked.diagnostics));
  assert.equal(getGovernedSubjectRegistry(checked.governance).revision, 1);

});

test('suppression preserves a real parent forest but cannot include a canonical carry-forward row', (t) => {
  const f = fixture(t);
  const creationId = '34567890-1234-4234-8234-123456789abc';
  const rootState = { ...stateOf(f.before.subjects[0]), label: 'Parent meaning', status: 'active' };
  const creation = { id: creationId, action: 'activate', decision: ref('D-000001'),
    rows: [{ id: 'S-000001', before: null, after: rootState }] };
  creation.review = { ...f.candidate.history[0].review,
    decisionDigest: canonicalSha256(f.model.decisions.get('D-000001').record), changeDigest: digestEvent(creation) };
  const parent = { id: 'S-000001', ...rootState, changes: [creationId] };
  f.before.subjects[0].parent = parent.id;
  f.before.subjects.push(parent); f.before.history = [creation]; f.before.revision = 1;
  const suppression = f.candidate.history[0];
  suppression.rows[0].before.parent = parent.id;
  suppression.rows[0].after.parent = parent.id;
  f.candidate.subjects.push(structuredClone(parent));
  f.candidate.history.unshift(structuredClone(creation)); f.candidate.revision = 2;
  refresh(f);
  f.model.identity.allocations.push({ kind: 'subject', id: parent.id, state: 'allocated',
    publication: { id: creationId, review: 'review:identity' } });
  f.put('_identity.yaml', f.model.identity);
  f.put('subjects/registry.yaml', authored(f.before));
  f.model = loadStores(f.root); f.identityIndex = f.model.identityIndex;
  assert.equal(f.model.ok, true, JSON.stringify(f.model.diagnostics));
  const result = transition(f);
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  assert.equal(getGovernedSubjectRegistry(result.governance).hierarchyRevision, 0);
  suppression.rows.push({ id: parent.id, before: structuredClone(rootState), after: structuredClone(rootState),
    reason: 'Unchanged parent' });
  f.candidate.subjects.find((subject) => subject.id === parent.id).changes.push(eventId);
  refresh(f);
  const refused = transition(f);
  assert.equal(refused.ok, false);
  assert.ok(refused.diagnostics.some((item) => item.code === 'invalid-action'));
});

test('a current nonaccepted refusal authorizer blocks publication while retained archival remains inspectable', (t) => {
  for (const status of ['proposed', 'archived']) {
    const f = fixture(t);
    const entries = [...f.model.decisions.values()].map((entry) => structuredClone(entry.record));
    entries.find((entry) => entry.id === 'D-000002').status = status;
    f.put('decisions/entries/review.yaml', { 'schema-version': 2, entries });
    f.model = loadStores(f.root); f.identityIndex = f.model.identityIndex;
    const result = transition(f);
    assert.equal(result.ok, false);
    if (status === 'archived') {
      assert.ok(result.diagnostics.some((item) => item.code === 'ineffective-authorizer'));
      const historical = evaluateSubjectGovernance({ registry: indexSubjects(f.candidate).registry,
        identity: f.model.identity, identityIndex: f.identityIndex, decisionCaptures: f.decisionCaptures });
      assert.equal(historical.ok, true, JSON.stringify(historical.diagnostics));
      assert.equal(getGovernedSubjectRegistry(historical.governance).proposals.get(proposal).status, 'suppressed');
    }
  }
});
