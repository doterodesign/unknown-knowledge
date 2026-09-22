import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { authored, digestEvent, eventId, proposal } from './helpers/subject-suppression-fixture.js';
import { loadStores } from '../payload/engine/lib/load-stores.js';
import { describeCandidateBytes } from '../payload/engine/lib/captured-source.js';
import { canonicalSha256 } from '../payload/engine/lib/canonical-json.js';
import { validateSubjectPromotion, subjectEligibility, evaluateSubjectGovernance, validateSubjectTransition, getSubjectGovernanceDescriptor } from '../payload/engine/lib/subject-governance.js';

import { subjectPromotionFixture as promotion, promotionLimits as limits } from './helpers/subject-promotion-fixture.js';
const promotionId = '43456789-1234-4234-8234-123456789abc';

test('promotion binds real before bytes and distinct candidate model, consumes one draft and grants no publication readiness', (t) => {
  const f = promotion(t);
  assert.equal(f.candidateModel.ok, true, JSON.stringify(f.candidateModel.diagnostics));
  const result = validateSubjectPromotion(f);
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  assert.equal(result.publicationReady, false);
  assert.equal(subjectEligibility(result.governance, 'S-000001', { purpose: 'new-assignment' }).eligible, true);
  assert.ok(result.used.captureBytes > 0);
  assert.ok(result.used.validationSteps > 0);
  assert.equal(f.candidateModel.subjectRegistry.proposals.has(proposal), false);
});

function evaluate(f, assessmentCaptures = [f.beforeCaptures]) {
  return evaluateSubjectGovernance({ registry: f.candidateModel.subjectRegistry, identity: f.candidateModel.identity,
    identityIndex: f.candidateModel.identityIndex, decisionCaptures: f.decisionCaptures, assessmentCaptures });
}

test('historical promotion requires captured proposal provenance, not only a matching reviewed digest', (t) => {
  const f = promotion(t);
  f.event.promotes.before.label = 'A different prior meaning';
  f.reload();
  assert.equal(f.candidateModel.ok, true);
  const result = evaluate(f);
  assert.equal(result.ok, false);
  assert.equal(result.diagnostics[0].code, 'invalid-refusal-assessment');
});

test('historical proof is unavailable when either retained before document is missing', (t) => {
  const f = promotion(t);
  for (const captures of [[], [{ registry: f.beforeCaptures.registry }], [{ identity: f.beforeCaptures.identity }]]) {
    const result = evaluate(f, captures);
    assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
    assert.equal(subjectEligibility(result.governance, 'S-000001', { purpose: 'query' }).eligible, null);
    assert.equal(getSubjectGovernanceDescriptor(result.governance).events[0].assessmentVerification, 'unavailable');
  }
  assert.equal(subjectEligibility(evaluate(f).governance, 'S-000001', { purpose: 'query' }).eligible, true);
});

test('nonempty refusal universe supports explicit empty relevance claim and exact listed current refusal', (t) => {
  const f = promotion(t, { refusal: true });
  let result = validateSubjectPromotion(f);
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  assert.equal(result.assessment.semanticCompleteness, 'asserted-in-reviewed-evidence');
  f.event.refusalAssessment.relevantRefusals = [{ subject: proposal, refusal: eventId,
    disposition: 'distinct-meaning', reason: 'The refused proposal concerned a distinct local use.' }];
  f.reload();
  result = validateSubjectPromotion(f);
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  assert.equal(result.used.relevantRefusalRows, 2, 'each actual verification pass pays for its listed rows');
});

test('relevant refusal rows reject duplicates, wrong current event, unknown identity and unsupported dispositions', (t) => {
  const f = promotion(t, { refusal: true });
  const row = { subject: proposal, refusal: eventId, disposition: 'distinct-meaning', reason: 'Different meaning' };
  for (const rows of [[row, row], [{ ...row, refusal: promotionId }], [{ ...row, subject: f.event.promotes.key }],
    [{ ...row, disposition: 'same-meaning' }], [{ ...row, reason: ' ' }]]) {
    f.event.refusalAssessment.relevantRefusals = rows;
    f.reload();
    if (!f.candidateModel.ok) continue; // Closed schema can reject unsupported disposition before governance.
    const result = validateSubjectPromotion(f);
    assert.equal(result.ok, false);
    assert.equal(result.diagnostics[0].code, 'invalid-refusal-assessment');
  }
});

test('one operation shares exact limits across captures, documents, history replay and repeated forests', (t) => {
  const f = promotion(t, { refusal: true });
  const baseline = validateSubjectPromotion(f);
  assert.equal(baseline.ok, true, JSON.stringify(baseline.diagnostics));
  const fields = { captureBytes: 'maxCaptureBytes', documentNodes: 'maxDocumentNodes', documentTextUnits: 'maxDocumentTextUnits',
    subjects: 'maxSubjects', historyRows: 'maxHistoryRows', validationSteps: 'maxValidationSteps' };
  const exact = Object.fromEntries(Object.entries(fields).map(([counter, limit]) => [limit, baseline.used[counter]]));
  assert.equal(validateSubjectPromotion({ ...f, budget: exact }).ok, true);
  for (const [counter, limit] of Object.entries(fields)) {
    const result = validateSubjectPromotion({ ...f, budget: { ...exact, [limit]: exact[limit] - 1 } });
    assert.equal(result.ok, false, counter);
    assert.equal(result.governance, null);
    assert.equal(result.diagnostics[0].code, 'subject-validation-budget');
    assert.equal(result.diagnostics[0].counter, counter);
    assert.ok(result.used[counter] <= exact[limit] - 1);
    assert.ok(result.diagnostics[0].phase);
  }
  assert.ok(baseline.used.historyRows > f.candidate.history.flatMap((event) => event.rows).length);
  const largestCapture = Math.max(...[f.beforeCaptures.registry, f.beforeCaptures.identity, ...f.decisionCaptures].map(({ bytes }) => bytes.length));
  const refused = validateSubjectPromotion({ ...f, budget: { ...limits, maxCaptureBytes: largestCapture } });
  assert.equal(refused.ok, false);
  assert.equal(refused.used.documentNodes, 0, 'aggregate bytes are checked before any model/parsed document traversal');
});

test('regular transition API cannot bypass bounded promotion validation', (t) => {
  const f = promotion(t);
  const result = validateSubjectTransition({ before: f.beforeModel.subjectRegistry.document, candidate: f.candidate,
    model: f.candidateModel, identityIndex: f.candidateModel.identityIndex, decisionCaptures: f.decisionCaptures });
  assert.equal(result.ok, false);
  assert.equal(result.diagnostics[0].code, 'unsupported-action');
});

test('missing, duplicate and altered raw captures cannot become approval', (t) => {
  const f = promotion(t);
  for (const part of ['registry', 'identity']) {
    const absent = validateSubjectPromotion({ ...f, beforeCaptures: { ...f.beforeCaptures, [part]: undefined } });
    assert.equal(absent.diagnostics[0].code, 'assessment-evidence-unavailable');
    const corrupted = { ...f.beforeCaptures[part], bytes: Buffer.from('altered bytes') };
    const result = validateSubjectPromotion({ ...f, beforeCaptures: { ...f.beforeCaptures, [part]: corrupted } });
    assert.equal(result.ok, false);
    assert.equal(result.diagnostics[0].code, 'invalid-refusal-assessment');
  }
  const duplicate = validateSubjectPromotion({ ...f, decisionCaptures: [...f.decisionCaptures, ...f.decisionCaptures] });
  assert.equal(duplicate.ok, false);
  assert.equal(duplicate.diagnostics[0].code, 'ambiguous-evidence');
  const historicalDuplicate = evaluate(f, [f.beforeCaptures, f.beforeCaptures]);
  assert.equal(historicalDuplicate.ok, false);
  assert.equal(historicalDuplicate.diagnostics[0].code, 'invalid-refusal-assessment');
});

test('matching raw hashes still reject invalid UTF-8, YAML, schema and cyclic retained documents', (t) => {
  const f = promotion(t);
  for (const part of ['registry', 'identity']) for (const bytes of [Buffer.from([0xff]), Buffer.from('a: ['), Buffer.from('{}'), Buffer.from('a: &a [*a]')]) {
    const original = f.beforeCaptures[part];
    f.beforeCaptures[part] = { ...original, bytes,
      capture: describeCandidateBytes({ file: original.capture.file, bytes, objectFormat: 'sha1' }) };
    if (part === 'registry') f.event.refusalAssessment.scope.beforeRegistry.capture = f.beforeCaptures.registry.capture;
    f.reload();
    const result = validateSubjectPromotion(f);
    assert.equal(result.ok, false);
    assert.equal(result.governance, null);
    assert.ok(['invalid-refusal-assessment', 'cyclic-subject-input'].includes(result.diagnostics[0].code), JSON.stringify(result.diagnostics));
    f.beforeCaptures[part] = original;
    f.event.refusalAssessment.scope.beforeRegistry.capture = f.beforeCaptures.registry.capture;
  }
});

test('before evidence cannot be replaced by a changed registry with identical IDs and revision', (t) => {
  const f = promotion(t);
  const before = structuredClone(f.beforeModel.subjectRegistry.document);
  before.subjects[0].label = 'Changed captured label';
  const bytes = Buffer.from(JSON.stringify(authored(before)));
  f.beforeCaptures.registry = { bytes, objectFormat: 'sha1',
    capture: describeCandidateBytes({ file: 'subjects/registry.yaml', bytes, objectFormat: 'sha1' }) };
  f.event.refusalAssessment.scope.beforeRegistry = { capture: f.beforeCaptures.registry.capture, documentDigest: canonicalSha256(before) };
  f.reload();
  assert.equal(validateSubjectPromotion(f).ok, false);
});

test('promotion preserves nonparticipants and current refusal universe', (t) => {
  const f = promotion(t, { refusal: true });
  f.candidate.subjects = f.candidate.subjects.filter((subject) => subject.id !== proposal);
  f.reload();
  assert.equal(f.candidateModel.ok, false, 'complete historical subjects cannot disappear');
  assert.equal(validateSubjectPromotion(f).ok, false);
});

test('new canonical identity cannot already be occupied in before ledger', (t) => {
  const f = promotion(t);
  const identity = structuredClone(f.beforeModel.identity);
  identity.allocations.push(f.identity.allocations.at(-1));
  // The before loader is independently rebuilt with an occupied but unused subject ID.
  const beforeRoot = mkdtempSync(join(tmpdir(), 'subject-promotion-occupied-'));
  t.after(() => rmSync(beforeRoot, { recursive: true, force: true }));
  cpSync(f.root, beforeRoot, { recursive: true });
  writeFileSync(join(beforeRoot, 'subjects/registry.yaml'), f.beforeCaptures.registry.bytes);
  writeFileSync(join(beforeRoot, '_identity.yaml'), JSON.stringify(identity));
  f.beforeModel = loadStores(beforeRoot);
  assert.equal(f.beforeModel.ok, true);
  assert.equal(validateSubjectPromotion(f).diagnostics[0].code, 'invalid-promotion');
});

test('budget refusal precedes reading an oversized or cyclic mutable current Decision', (t) => {
  const f = promotion(t);
  const record = f.candidateModel.decisions.get('D-000002').record;
  record.extra = {}; record.extra.self = record.extra;
  assert.equal(validateSubjectPromotion(f).diagnostics[0].code, 'cyclic-subject-input');
});


test('new effective child requires an active parent while historical parent retirement remains structurally valid', (t) => {
  const active = promotion(t, { parentStatus: 'active' });
  assert.equal(active.candidateModel.ok, true, JSON.stringify(active.candidateModel.diagnostics));
  assert.equal(validateSubjectPromotion(active).ok, true);
  const retired = promotion(t, { parentStatus: 'retired' });
  assert.equal(retired.candidateModel.ok, true, JSON.stringify(retired.candidateModel.diagnostics));
  const result = validateSubjectPromotion(retired);
  assert.equal(result.ok, false);
  assert.equal(result.diagnostics[0].code, 'invalid-promotion');
});

test('suppressed proposals and repeated consumed keys cannot be promoted through history', (t) => {
  const f = promotion(t, { refusal: true });
  f.event.promotes = { key: proposal, before: structuredClone(f.beforeModel.subjectRegistry.document.subjects[0]) };
  f.reload();
  assert.equal(f.candidateModel.ok, false);
  const repeat = promotion(t);
  const event = structuredClone(repeat.event);
  event.id = '83456789-1234-4234-8234-123456789abc'; event.rows[0].id = 'S-000002';
  event.review.changeDigest = digestEvent(event);
  repeat.candidate.history.push(event); repeat.candidate.revision++;
  repeat.candidate.subjects.push({ id: 'S-000002', ...event.rows[0].after, changes: [event.id] });
  repeat.identity.allocations.push({ ...repeat.identity.allocations.at(-1), id: 'S-000002' });
  repeat.reload();
  assert.equal(repeat.candidateModel.ok, false);
  assert.ok(repeat.candidateModel.diagnostics.some(({ code }) => code === 'invalid-history'));
});

test('promotion debits actual private Decision before copying even after public record replacement', (t) => {
  const f = promotion(t);
  const baseline = validateSubjectPromotion(f);
  const path = join(f.root, 'decisions/entries/review.yaml');
  const document = JSON.parse(readFileSync(path));
  document.entries[1].context = 'private-promotion-capture:' + 'x'.repeat(1000000);
  writeFileSync(path, JSON.stringify(document));
  f.candidateModel = loadStores(f.root);
  assert.equal(f.candidateModel.ok, true);
  f.candidateModel.decisions.get('D-000002').record.context = 'Captured proposal review';
  const clone = globalThis.structuredClone;
  let privateCopies = 0;
  t.mock.method(globalThis, 'structuredClone', (value, ...args) => {
    if (value?.entry?.record?.context?.startsWith('private-promotion-capture:')) privateCopies++;
    return clone(value, ...args);
  });
  const result = validateSubjectPromotion({ ...f, budget: { ...limits, maxDocumentTextUnits: baseline.used.documentTextUnits + 1000 } });
  assert.equal(result.ok, false);
  assert.equal(result.diagnostics[0].code, 'subject-validation-budget');
  assert.equal(privateCopies, 0);
  assert.equal(result.diagnostics[0].phase, 'promotion-authorizer');
});
