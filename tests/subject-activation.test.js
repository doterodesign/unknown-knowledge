import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as governance from '../payload/engine/lib/subject-governance.js';
import { subjectActivationFixture, nextActivationFixture } from './helpers/subject-activation-fixture.js';
import { subjectPromotionFixture } from './helpers/subject-promotion-fixture.js';
import { stateOf, digestEvent } from './helpers/subject-suppression-fixture.js';
import { describeCandidateBytes } from '../payload/engine/lib/captured-source.js';

for (const refusal of [false, true]) {
  test(`detached activation cannot bypass captured scope with ${refusal ? 'suppressed meanings' : 'an empty bootstrap'}`, (t) => {
    const f = subjectActivationFixture(t, { refusal });
    delete f.event.refusalAssessment;
    f.reload();
    assert.equal(f.candidateModel.ok, true);
    const result = governance.validateSubjectTransition({ before: f.beforeModel.subjectRegistry.document,
      candidate: f.candidate, model: f.candidateModel, identityIndex: f.candidateModel.identityIndex,
      decisionCaptures: f.decisionCaptures });
    assert.equal(result.ok, false);
    assert.equal(result.diagnostics[0].code, 'unsupported-action');
  });
}

test('real empty bootstrap activates an atomic parent forest through captured before scope', (t) => {
  const f = subjectActivationFixture(t);
  assert.equal(f.beforeModel.subjectRegistry.subjects.size, 0);
  assert.equal(f.beforeModel.identity.allocations.some((row) => row.kind === 'subject'), false);
  const result = governance.validateSubjectActivation(f);
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  assert.equal(result.publicationReady, false);
  assert.ok(result.used.captureBytes > 0);
  assert.equal(result.assessment.verification, 'verified');
  for (const id of ['S-000001', 'S-000002']) {
    assert.equal(governance.subjectEligibility(result.governance, id, { purpose: 'new-assignment' }).eligible, true);
  }
});

test('fresh creation reviews a captured nonempty refusal universe without lexical equivalence inference', (t) => {
  const f = subjectActivationFixture(t, { refusal: true });
  const result = governance.validateSubjectActivation(f);
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  assert.equal(result.assessment.semanticCompleteness, 'asserted-in-reviewed-evidence');
  const refused = f.beforeModel.subjectRegistry.document.subjects[0];
  assert.deepEqual(f.event.rows[0].after.definition, refused.definition);
  assert.deepEqual(f.event.rows[0].after.aliases, refused.aliases);
});

test('absent authority, missing raw before proof and malformed own-promotes never become bootstrap', (t) => {
  for (const mutate of [
    (f) => { f.beforeModel = { ...f.beforeModel, subjectRegistry: undefined }; },
    (f) => { f.beforeCaptures = {}; },
    (f) => { f.event.promotes = null; f.reload(); },
    (f) => { delete f.event.refusalAssessment; f.reload(); },
  ]) {
    const f = subjectActivationFixture(t); mutate(f);
    const result = governance.validateSubjectActivation(f);
    assert.equal(result.ok, false);
    assert.equal(result.publicationReady, false);
  }
});

test('bootstrap cannot conceal an occupied unrelated subject allocation in an empty registry', (t) => {
  const f = subjectActivationFixture(t);
  const ledger = structuredClone(f.beforeModel.identity);
  ledger.allocations.push({ ...structuredClone(f.identity.allocations.find((row) => row.kind === 'subject')), id: 'S-000099' });
  f.identity.allocations.push(ledger.allocations.at(-1));
  f.replaceBefore(f.beforeModel.subjectRegistry.document, ledger);
  assert.equal(f.beforeModel.ok, true);
  assert.equal(f.candidateModel.ok, true);
  const result = governance.validateSubjectActivation(f);
  assert.equal(result.ok, false);
});

test('creation requires current effective Decision evidence and exact registry/hierarchy revisions', (t) => {
  for (const status of ['archived', 'superseded', 'proposed', 'rejected']) {
    const f = subjectActivationFixture(t);
    const path = 'decisions/entries/review.yaml';
    const file = JSON.parse(readFileSync(join(f.root, path)));
    file.entries.find(({ id }) => id === 'D-000002').status = status;
    f.put(path, file); f.reload();
    assert.equal(f.candidateModel.ok, true);
    const result = governance.validateSubjectActivation(f);
    assert.equal(result.ok, false, status);
    assert.equal(result.diagnostics[0].code, 'ineffective-authorizer');
  }
  for (const field of ['revision', 'hierarchyRevision']) {
    const f = subjectActivationFixture(t);
    f.candidate[field] += 1; f.reload();
    assert.equal(governance.validateSubjectActivation(f).ok, false, field);
  }
  const missing = subjectActivationFixture(t);
  assert.equal(governance.validateSubjectActivation({ ...missing, decisionCaptures: [] }).ok, false);
});

test('bounded activation and promotion refuse contradictory candidate authorizer-store presence', (t) => {
  for (const [fixture, validate] of [[subjectActivationFixture, governance.validateSubjectActivation],
    [subjectPromotionFixture, governance.validateSubjectPromotion]]) {
    for (const mutate of [
      (model) => { model.stores.decisions.present = false; },
      (model) => { delete model.stores; },
    ]) {
      const f = fixture(t); mutate(f.candidateModel);
      const result = validate(f);
      assert.equal(result.ok, false);
      assert.equal(result.diagnostics[0].code, 'input-mismatch');
    }
  }
});

test('freshness includes allocated, cancelled and retired IDs absent from loaded subject rows', (t) => {
  for (const state of ['allocated', 'cancelled', 'retired']) {
    const f = subjectActivationFixture(t, { refusal: true });
    const ledger = structuredClone(f.beforeModel.identity);
    ledger.allocations.push({ ...structuredClone(f.identity.allocations.find((row) => row.kind === 'subject')),
      state, ...(state === 'allocated' ? {} : { reason: 'Previously occupied identity' }) });
    f.replaceBefore(f.beforeModel.subjectRegistry.document, ledger);
    assert.equal(f.beforeModel.ok, true, JSON.stringify(f.beforeModel.diagnostics));
    assert.equal(governance.validateSubjectActivation(f).ok, false, state);
  }
});

test('all six limits apply cumulatively to multirow creation with exact-boundary success', (t) => {
  const f = subjectActivationFixture(t, { refusal: true });
  const baseline = governance.validateSubjectActivation(f);
  assert.equal(baseline.ok, true);
  const fields = { captureBytes: 'maxCaptureBytes', documentNodes: 'maxDocumentNodes', documentTextUnits: 'maxDocumentTextUnits',
    subjects: 'maxSubjects', historyRows: 'maxHistoryRows', validationSteps: 'maxValidationSteps' };
  const exact = Object.fromEntries(Object.entries(fields).map(([counter, limit]) => [limit, baseline.used[counter]]));
  assert.equal(governance.validateSubjectActivation({ ...f, budget: exact }).ok, true);
  for (const [counter, limit] of Object.entries(fields)) {
    const result = governance.validateSubjectActivation({ ...f, budget: { ...exact, [limit]: exact[limit] - 1 } });
    assert.equal(result.ok, false, counter);
    assert.equal(result.diagnostics[0].code, 'subject-validation-budget');
  }
});

test('new creation checks every new parent status without following retirement redirects', (t) => {
  for (const parentStatus of ['active', 'retired']) {
    const f = nextActivationFixture(subjectPromotionFixture(t, { parentStatus }));
    assert.equal(f.candidateModel.ok, true);
    const result = governance.validateSubjectActivation(f);
    assert.equal(result.ok, parentStatus === 'active', JSON.stringify(result.diagnostics));
  }
});

test('supplied unreferenced assessment pairs cannot hide duplicate or corrupt raw evidence', (t) => {
  const f = subjectActivationFixture(t);
  const pair = Object.fromEntries(['registry', 'identity'].map((part) => {
    const original = f.beforeCaptures[part];
    return [part, { ...original, capture: describeCandidateBytes({ file: `unreferenced/${original.capture.file}`,
      bytes: original.bytes, objectFormat: 'sha1' }) }];
  }));
  for (const assessmentCaptures of [[pair, pair], [{ ...pair, registry: { ...pair.registry, bytes: Buffer.from('corrupt') } }]]) {
    const result = governance.validateSubjectActivation({ ...f, assessmentCaptures });
    assert.equal(result.ok, false);
    assert.equal(result.diagnostics[0].code, 'invalid-refusal-assessment');
  }
});

test('sparse historical capture arrays return a structured refusal before traversal', (t) => {
  for (const [fixture, validate] of [[subjectActivationFixture, governance.validateSubjectActivation],
    [subjectPromotionFixture, governance.validateSubjectPromotion]]) {
    const f = fixture(t);
    const accessor = [];
    let reads = 0;
    Object.defineProperty(accessor, '0', { enumerable: true, get() { reads += 1; return f.beforeCaptures; } });
    for (const assessmentCaptures of [new Array(1), [null], [undefined], accessor]) {
      const result = validate({ ...f, assessmentCaptures });
      assert.equal(result.ok, false);
      assert.equal(result.diagnostics[0].code, 'invalid-promotion-input');
    }
    assert.equal(reads, 0, 'capture collection validation does not execute accessor entries');
  }
});

test('historical evidence cannot replace the designated current before pair', (t) => {
  for (const promotion of [false, true]) {
    const f = nextActivationFixture(subjectActivationFixture(t), { promotion });
    const validate = promotion ? governance.validateSubjectPromotion : governance.validateSubjectActivation;
    assert.equal(validate(f).ok, true);
    const result = validate({ ...f, beforeCaptures: f.assessmentCaptures[0], assessmentCaptures: [f.beforeCaptures] });
    assert.equal(result.ok, false);
    assert.equal(result.diagnostics[0].code, 'assessment-evidence-unavailable');
  }
});

for (const [name, fixture] of [['creation', subjectActivationFixture], ['promotion', subjectPromotionFixture]]) {
  test(`later promotion retains earlier assessed ${name} evidence using the same cumulative operation`, (t) => {
    const f = nextActivationFixture(fixture(t), { promotion: true });
    assert.equal(f.beforeModel.ok, true);
    assert.equal(f.candidateModel.ok, true);
    const result = governance.validateSubjectPromotion(f);
    assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
    assert.equal(governance.subjectEligibility(result.governance, 'S-000001', { purpose: 'query' }).eligible, true);
    const missing = governance.validateSubjectPromotion({ ...f, assessmentCaptures: [] });
    assert.equal(missing.ok, true);
    assert.equal(governance.subjectEligibility(missing.governance, 'S-000001', { purpose: 'query' }).eligible, null);
  });

  test(`later assessed creation retains prior ${name} proof and distinguishes missing/corrupt/duplicate captures`, (t) => {
    const prior = fixture(t);
    const f = nextActivationFixture(prior);
    assert.equal(f.candidateModel.ok, true);
    const valid = governance.validateSubjectActivation(f);
    assert.equal(valid.ok, true, JSON.stringify(valid.diagnostics));
    assert.equal(governance.subjectEligibility(valid.governance, 'S-000001', { purpose: 'query' }).eligible, true);
    const missing = governance.validateSubjectActivation({ ...f, assessmentCaptures: [] });
    assert.equal(missing.ok, true);
    assert.equal(governance.subjectEligibility(missing.governance, 'S-000001', { purpose: 'query' }).eligible, null);
    assert.equal(governance.getSubjectGovernanceDescriptor(missing.governance).events[0].assessmentVerification, 'unavailable');
    for (const pairs of [[...f.assessmentCaptures, f.beforeCaptures], [...f.assessmentCaptures, ...f.assessmentCaptures],
      [{ ...prior.beforeCaptures, registry: { ...prior.beforeCaptures.registry, bytes: Buffer.from('corrupt') } }]]) {
      const result = governance.validateSubjectActivation({ ...f, assessmentCaptures: pairs });
      assert.equal(result.ok, false);
      assert.equal(result.diagnostics[0].code, 'invalid-refusal-assessment');
    }
    const rawBytes = [f.beforeCaptures, ...f.assessmentCaptures].flatMap((pair) => [pair.registry, pair.identity])
      .concat(f.decisionCaptures).reduce((total, capture) => total + capture.bytes.length, 0);
    assert.equal(valid.used.captureBytes, rawBytes);
    const short = governance.validateSubjectActivation({ ...f, budget: { ...f.budget, maxCaptureBytes: rawBytes - 1 } });
    assert.equal(short.ok, false);
    assert.equal(short.diagnostics[0].phase, 'raw-captures');
  });

  test(`ordinary rename forwards retained ${name} assessment without pretending to bound its operation`, (t) => {
    const f = fixture(t);
    const before = f.candidateModel.subjectRegistry.document;
    const candidate = structuredClone(before);
    const subject = candidate.subjects.find(({ id }) => id === 'S-000001');
    const after = { ...stateOf(subject), label: 'Revised spelling' };
    const event = { id: '93456789-1234-4234-8234-123456789abc', action: 'rename', unchangedMeaning: true,
      decision: f.event.decision, rows: [{ id: subject.id, before: stateOf(subject), after }] };
    event.review = { ...f.event.review, changeDigest: digestEvent(event) };
    Object.assign(subject, after, { changes: [...subject.changes, event.id] });
    candidate.history.push(event); candidate.revision += 1;
    const input = { before, candidate, model: f.candidateModel, identityIndex: f.candidateModel.identityIndex,
      decisionCaptures: f.decisionCaptures, assessmentCaptures: [f.beforeCaptures] };
    const result = governance.validateSubjectTransition(input);
    assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
    assert.equal(governance.subjectEligibility(result.governance, subject.id, { purpose: 'query' }).eligible, true);
    const missing = governance.validateSubjectTransition({ ...input, assessmentCaptures: [] });
    assert.equal(missing.ok, true);
    assert.equal(governance.subjectEligibility(missing.governance, subject.id, { purpose: 'query' }).eligible, null);
  });
}
