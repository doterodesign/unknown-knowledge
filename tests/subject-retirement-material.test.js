import test from 'node:test';
import assert from 'node:assert/strict';
import { subjectRetirementMaterialFixture } from './helpers/subject-retirement-material-fixture.js';
import { runPreparedSubjectRetirementGate } from '../payload/engine/lib/subject-retirement-gate.js';

test('actual prior-reconsidered Subject can retire with retained material', async t => {
  const f = await subjectRetirementMaterialFixture(t);
  assert.equal(f.reconsideration.ok, true);
  t.diagnostic('Actual original reconsideration gate passed before retirement entrypoint.');
  const result = await runPreparedSubjectRetirementGate(f.input);
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  assert.equal(result.version, 2);
  assert.equal(result.assignments, null);
});

test('positive withdrawal uses actual continued row ownership', async t => {
  const f = await subjectRetirementMaterialFixture(t, { zero: false });
  const result = await runPreparedSubjectRetirementGate(f.input);
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  assert.equal(result.version, 2);
  assert.equal(result.assignments.ok, true);
  assert.equal(result.authoredReferenceClosure.affectedRefs.length, 1);
});

test('continued retirement wire decoder preserves the original material selector', async t => {
  const f = await subjectRetirementMaterialFixture(t);
  const { subjectRetirementInputWire } = await import('../payload/engine/lib/subject-retirement-input.js');
  const { decodePreparedSubjectRetirement } = await import('../payload/engine/lib/prepared-subject-retirement.js');
  const wire = subjectRetirementInputWire(f.input);
  const decoded = decodePreparedSubjectRetirement(f.root, wire);
  assert.deepEqual(subjectRetirementInputWire(decoded), wire);
  assert.notEqual(decoded.evidence.materialCaptures[0].bytes, f.input.evidence.materialCaptures[0].bytes);
});

test('complete retirement continuation reaches actual final review and isolated publication', async t => {
  const { reviewSubjectRetirementMaterialFixture } = await import('./helpers/subject-retirement-material-fixture.js');
  const { recordApprovedCandidateReview } = await import('../payload/engine/lib/candidate-review.js');
  const { publishPreparedCandidate } = await import('../payload/engine/lib/publish-prepared-candidate.js');
  const f = await reviewSubjectRetirementMaterialFixture(t);
  assert.equal(f.gate.version, 2);
  assert.equal(f.final.status, 'passed');
  assert.deepEqual(f.final.gate, f.gate);
  const { capturePreparedSubjectRetirement } = await import('../payload/engine/lib/prepared-subject-retirement.js');
  const raw = f.retained.artifacts.find(row => row.file === 'checks/operation/registry.yaml');
  const captureInput = { root: f.root, source: f.source, candidate: f.candidate, gate: f.gate,
    gateInput: f.operationInputs.gateInput, captureLimits: { maxRegistryBytes: raw.size, maxEventBytes: 1 } };
  assert.deepEqual(capturePreparedSubjectRetirement(captureInput), { registry: raw.bytes, event: null });
  assert.throws(() => capturePreparedSubjectRetirement({ ...captureInput,
    captureLimits: { ...captureInput.captureLimits, maxRegistryBytes: raw.size - 1 } }), /capture|capacity|limit/i);
  const { runFinalPreparedSubjectRetirementGate } = await import('../payload/engine/lib/final-prepared-subject-retirement.js');
  const { retirementMaterialEvidenceVariant } = await import('./helpers/subject-retirement-material-fixture.js');
  for (const edit of [
    rows => { rows.splice(rows.findIndex(row => row.file === 'checks/operation/registry.yaml'), 1); },
    rows => { rows.push({ file: 'checks/operation/event.yaml', bytes: Buffer.from('unexpected event') }); },
    rows => {
      const row = rows.find(row => row.file === 'checks/operation/input.json');
      const wire = JSON.parse(row.bytes); delete wire.evidence.materialCaptures;
      row.bytes = Buffer.from(JSON.stringify(wire));
    },
  ]) assert.equal((await runFinalPreparedSubjectRetirementGate(retirementMaterialEvidenceVariant(f, edit))).status, 'failed');
  const saved = await recordApprovedCandidateReview(f.writer());
  assert.equal(saved.status, 'retained', JSON.stringify(saved));
  const result = await publishPreparedCandidate(f.publisher(saved));
  assert.equal(result.status, 'published', JSON.stringify(result));
  assert.equal(f.git('rev-parse', f.request.publish.outputRef), f.candidate.commit);
});

test('continued admission refuses malformed capacities without inspecting captures', async t => {
  const f = await subjectRetirementMaterialFixture(t);
  const { admitSubjectRetirementInput } = await import('../payload/engine/lib/subject-retirement-input.js');
  const input = { ...f.input, limits: { ...f.input.limits, governance: null } };
  let reads = 0;
  Object.defineProperty(input, 'evidence', { enumerable: true, value: {
    decisionCaptures: [], assessmentCaptures: [], get materialCaptures() { reads++; throw Error('unadmitted material'); },
  } });
  const result = admitSubjectRetirementInput(input);
  assert.equal(result.ok, false);
  assert.equal(reads, 0);
  assert.equal(result.diagnostics[0].code, 'invalid-lifecycle-continuation');
});

test('continued owned admission closes selectors and reserves each actual capture once', async t => {
  const f = await subjectRetirementMaterialFixture(t);
  const { admitSubjectRetirementInput, subjectRetirementInputWire } = await import('../payload/engine/lib/subject-retirement-input.js');
  const { admitContinuedRetirementWire } = await import('../payload/engine/lib/subject-lifecycle-input.js');
  const copies = () => ({ ...f.input, evidence: { ...f.input.evidence,
    decisionCaptures: f.input.evidence.decisionCaptures.map(row => ({ ...row, capture: structuredClone(row.capture), bytes: Buffer.from(row.bytes) })),
    assessmentCaptures: f.input.evidence.assessmentCaptures.map(pair => Object.fromEntries(Object.entries(pair)
      .map(([key, row]) => [key, { ...row, capture: structuredClone(row.capture), bytes: Buffer.from(row.bytes) }]))),
    materialCaptures: f.input.evidence.materialCaptures.map(row => ({ ...row, capture: structuredClone(row.capture), bytes: Buffer.from(row.bytes) })) } });
  const rows = evidence => [...evidence.decisionCaptures, ...evidence.assessmentCaptures.flatMap(pair => [pair.registry, pair.identity]), ...evidence.materialCaptures];
  const clone = copies(); const originalWire = subjectRetirementInputWire(clone);
  const total = rows(clone.evidence).reduce((sum, row) => sum + row.bytes.length, 0);
  clone.limits = { ...clone.limits, governance: { ...clone.limits.governance, maxCaptureBytes: total } };
  const admitted = admitSubjectRetirementInput(clone);
  assert.equal(admitted.ok, true, JSON.stringify(admitted.diagnostics));
  assert.equal(admitted.continuation.operationBudget.used.captureBytes, total);
  for (const row of rows(admitted.input.evidence)) admitted.continuation.operationBudget.admitCapture(row);
  assert.equal(admitted.continuation.operationBudget.used.captureBytes, total);
  const digest = admitted.inputDigest;
  clone.evidence.materialCaptures[0].bytes.fill(0); clone.evidence.materialCaptures[0].capture.file = 'mutated.txt';
  assert.equal(admitted.inputDigest, digest);
  assert.deepEqual(subjectRetirementInputWire(admitted.input).evidence, originalWire.evidence);
  const short = copies(); short.limits = { ...short.limits, governance: { ...short.limits.governance, maxCaptureBytes: total - 1 } };
  const refused = admitSubjectRetirementInput(short);
  assert.equal(refused.ok, false);
  assert.equal(refused.continuation.operationBudget.failure.phase, 'lifecycle-continuation-owned-copy');
  const wire = subjectRetirementInputWire(admitted.input);
  const wireAdmitted = admitContinuedRetirementWire(f.root, wire);
  assert.equal(wireAdmitted.ok, true);
  assert.equal(wireAdmitted.inputDigest, admitted.inputDigest);
  assert.equal(wireAdmitted.continuation.operationBudget.used.captureBytes, total);
  wire.limits.governance.maxCaptureBytes--;
  const wireShort = admitContinuedRetirementWire(f.root, wire);
  assert.equal(wireShort.ok, false);
  assert.equal(wireShort.continuation.operationBudget.failure.phase, 'lifecycle-continuation-wire-decode');
  let getters = 0;
  const attacks = [
    evidence => { evidence.materialCaptures = undefined; }, evidence => { evidence.materialCaptures = null; },
    evidence => { evidence.materialCaptures = new Array(1); },
    evidence => { evidence.materialCaptures.extra = true; },
    evidence => { evidence.materialCaptures.push(evidence.materialCaptures[0]); },
    evidence => { Object.defineProperty(evidence, 'materialCaptures', { enumerable: true, get() { getters++; throw Error('selector getter'); } }); },
    evidence => { Object.setPrototypeOf(evidence, { materialCaptures: evidence.materialCaptures }); delete evidence.materialCaptures; },
    evidence => { Object.defineProperty(evidence.materialCaptures[0].bytes, 'length', { get() { getters++; return 0; } }); },
  ];
  for (const attack of attacks) {
    const input = copies(); attack(input.evidence);
    const result = admitSubjectRetirementInput(input);
    assert.equal(result.ok, false, attack.toString());
    assert.equal(result.diagnostics[0].code, 'invalid-lifecycle-continuation');
  }
  assert.equal(getters, 0);
  const omitted = copies(); delete omitted.evidence.materialCaptures;
  const legacy = admitSubjectRetirementInput(omitted);
  assert.equal(legacy.ok, true); assert.equal(Object.hasOwn(legacy, 'continuation'), false);
  const empty = copies(); empty.evidence.materialCaptures = [];
  assert.equal(admitSubjectRetirementInput(empty).ok, true);
  const missing = await runPreparedSubjectRetirementGate(empty);
  assert.equal(missing.ok, false); assert.equal(missing.version, 2);
  assert.ok(missing.diagnostics.some(row => row.code === 'retirement-scope-refused'));
});

test('new capture property work is admitted before Buffer inspection under the authentic budget', async t => {
  const f = await subjectRetirementMaterialFixture(t);
  const { admitLifecycleCaptureEvidence } = await import('../payload/engine/lib/subject-capture-admission.js');
  const { createSubjectValidationBudget } = await import('../payload/engine/lib/subject-validation-budget.js');
  const row = f.input.evidence.decisionCaptures[0];
  const evidence = { decisionCaptures: [row], assessmentCaptures: [], materialCaptures: [] };
  const limits = { ...f.input.limits.governance, maxCaptureBytes: row.bytes.length, maxValidationSteps: row.bytes.length + 3 };
  const exact = createSubjectValidationBudget(limits);
  const owned = admitLifecycleCaptureEvidence(evidence, exact);
  assert.deepEqual(owned.decisionCaptures[0].bytes, row.bytes);
  assert.notEqual(owned.decisionCaptures[0].bytes, row.bytes);
  assert.equal(exact.used.validationSteps, limits.maxValidationSteps);
  const short = createSubjectValidationBudget({ ...limits, maxValidationSteps: limits.maxValidationSteps - 1 });
  assert.throws(() => admitLifecycleCaptureEvidence(evidence, short), error => error.code === 'subject-validation-budget');
  assert.equal(short.failure.phase, 'lifecycle-continuation-buffer-properties');
  assert.equal(short.used.captureBytes, row.bytes.length);
  let reads = 0; const trapped = { get decisionCaptures() { reads++; throw Error('too early'); } };
  assert.throws(() => admitLifecycleCaptureEvidence(trapped, {}), error => error.code === 'invalid-subject-validation-budget-handle');
  assert.throws(() => admitLifecycleCaptureEvidence(trapped, short), error => error.code === 'subject-validation-budget');
  assert.equal(reads, 0);
});

test('source-less material keeps exact actual-side correspondence', async t => {
  const f = await subjectRetirementMaterialFixture(t, { sourceLessMaterial: true });
  assert.equal(Object.hasOwn(f.input.evidence.materialCaptures[0].capture, 'source'), false);
  const result = await runPreparedSubjectRetirementGate(f.input);
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  const { isPreparedSubjectRetirementReport } = await import('../payload/engine/lib/prepared-subject-retirement.js');
  const { subjectRetirementInputWire } = await import('../payload/engine/lib/subject-retirement-input.js');
  const wire = subjectRetirementInputWire(f.input), expected = { source: f.input.before, candidate: f.input.candidate };
  assert.equal(isPreparedSubjectRetirementReport(result, expected, wire), true);
  assert.equal(isPreparedSubjectRetirementReport({ ...result, version: 1 }, expected, wire), false);
  const omitted = structuredClone(wire); delete omitted.evidence.materialCaptures;
  assert.equal(isPreparedSubjectRetirementReport(result, expected, omitted), false);
});
