import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadStores } from '../payload/engine/lib/load-stores.js';
import { indexSubjects } from '../payload/engine/lib/subjects.js';
import { evaluateSubjectGovernance, validateSubjectGovernanceCapture } from '../payload/engine/lib/subject-governance.js';
import { fixture, authored } from './helpers/subject-suppression-fixture.js';

function captured(t, { events = true } = {}) {
  const f = fixture(t);
  if (events) f.put('subjects/registry.yaml', authored(f.candidate));
  const model = loadStores(f.root);
  assert.equal(model.ok, true, JSON.stringify(model.diagnostics));
  const checked = evaluateSubjectGovernance({ registry: model.subjectRegistry, identity: model.identity,
    identityIndex: model.identityIndex, decisionCaptures: f.decisionCaptures });
  assert.equal(checked.ok, true, JSON.stringify(checked.diagnostics));
  return { ...f, model, handle: checked.governance };
}

test('binding validates an actual model capture without changing approval or granting a new handle', (t) => {
  for (const events of [true, false]) {
    const f = captured(t, { events });
    assert.deepEqual(validateSubjectGovernanceCapture(f.handle, { model: f.model }), { ok: true, diagnostics: [] });
  }
});

test('binding requires a declared Decisions store only when history depends on authorizers', (t) => {
  for (const events of [true, false]) {
    const f = captured(t, { events });
    f.model.stores.decisions.present = false;
    const result = validateSubjectGovernanceCapture(f.handle, { model: f.model });
    assert.equal(result.ok, !events);
    if (events) assert.equal(result.diagnostics[0].code, 'input-mismatch');
  }
});

test('fake handles and unavailable or malformed candidate captures return only the closed binding diagnostics', (t) => {
  const f = captured(t);
  for (const handle of [null, undefined, {}, { ...f.handle }]) {
    assert.equal(validateSubjectGovernanceCapture(handle, { model: f.model }).diagnostics[0].code, 'governance-unavailable');
  }
  for (const model of [null, {}, { ...f.model, ok: false }, { ...f.model, identity: null },
    { ...f.model, subjectRegistry: undefined }, { ...f.model, identityIndex: undefined },
    { ...f.model, identityIndex: { ...f.model.identityIndex } }, { ...f.model, decisions: new Map() }]) {
    const result = validateSubjectGovernanceCapture(f.handle, { model });
    assert.equal(result.ok, false);
    assert.equal(result.diagnostics[0].code, 'input-mismatch');
  }
});

test('unchanged revisions do not authorize changed registry or ledger content', (t) => {
  const f = captured(t);
  const changed = structuredClone(f.model.subjectRegistry.document);
  changed.history[0].review.reference = 'review:another-capture';
  assert.equal(validateSubjectGovernanceCapture(f.handle, {
    model: { ...f.model, subjectRegistry: indexSubjects(changed).registry },
  }).ok, false);
  const identity = structuredClone(f.model.identity);
  identity.allocations[0].publication.review = 'review:different-allocation';
  assert.equal(validateSubjectGovernanceCapture(f.handle, { model: { ...f.model, identity } }).ok, false);
});

test('both mutable authorizer records and private index records must agree with the evaluated handle', (t) => {
  const f = captured(t);
  const oldPublicMap = f.model.decisions;
  const entries = [...oldPublicMap.values()].map((entry) => structuredClone(entry.record));
  entries.find((entry) => entry.id === 'D-000002').title = 'Changed after evaluation';
  f.put('decisions/entries/review.yaml', { 'schema-version': 2, entries });
  const newer = loadStores(f.root);
  assert.equal(newer.ok, true, JSON.stringify(newer.diagnostics));
  for (const model of [newer,
    { ...f.model, decisions: newer.decisions },
    { ...f.model, identityIndex: newer.identityIndex },
    { ...newer, decisions: oldPublicMap }]) {
    const result = validateSubjectGovernanceCapture(f.handle, { model });
    assert.equal(result.ok, false, 'neither a stale public map nor a stale private index can hide the changed authorizer');
    assert.equal(result.diagnostics[0].code, 'input-mismatch');
  }
});

test('an empty history still requires an authentic index and programmer errors propagate', (t) => {
  const f = captured(t, { events: false });
  const fake = { ...f.model, identityIndex: { ...f.model.identityIndex } };
  assert.equal(validateSubjectGovernanceCapture(f.handle, { model: fake }).diagnostics[0].code, 'input-mismatch');
  const bug = new TypeError('unexpected getter failure');
  const broken = { ...f.model, get identityIndex() { throw bug; } };
  assert.throws(() => validateSubjectGovernanceCapture(f.handle, { model: broken }), (error) => error === bug);
});

test('binding preserves unavailable evidence and accepts honestly recaptured archived authorizers', (t) => {
  const f = captured(t);
  const unavailable = evaluateSubjectGovernance({ registry: f.model.subjectRegistry,
    identity: f.model.identity, identityIndex: f.model.identityIndex });
  assert.equal(unavailable.ok, true);
  assert.deepEqual(validateSubjectGovernanceCapture(unavailable.governance, { model: f.model }),
    { ok: true, diagnostics: [] }, 'consistency does not claim verified historical source evidence');
  const entries = [...f.model.decisions.values()].map((entry) => structuredClone(entry.record));
  entries.find((entry) => entry.id === 'D-000002').status = 'archived';
  f.put('decisions/entries/review.yaml', { 'schema-version': 2, entries });
  const model = loadStores(f.root);
  const historical = evaluateSubjectGovernance({ registry: model.subjectRegistry, identity: model.identity,
    identityIndex: model.identityIndex, decisionCaptures: f.decisionCaptures });
  assert.equal(historical.ok, true, JSON.stringify(historical.diagnostics));
  assert.equal(validateSubjectGovernanceCapture(f.handle, { model }).ok, false, 'old handle does not bind changed current status');
  assert.equal(validateSubjectGovernanceCapture(historical.governance, { model }).ok, true,
    'a matching recapture does not retroactively revoke retained approval evidence');
});
