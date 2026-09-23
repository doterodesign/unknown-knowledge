import test from 'node:test';
import assert from 'node:assert/strict';
import { recordPromotionMaterialFixture } from './helpers/record-promotion-material-fixture.js';
import { runPreparedRecordPromotionGate } from '../payload/engine/lib/assignment-gate.js';
for (const kind of ['knowledge', 'ontology', 'decision']) test(`actual reconsidered Subject supports ${kind} canonical genesis`, async t => {
  const f = await recordPromotionMaterialFixture(t, { kind });
  assert.equal(f.reconsideration.ok, true);
  const result = await runPreparedRecordPromotionGate(f.input);
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.version, 3);
  assert.deepEqual(result.promotion.createdRefs, f.rows.map(row => row.canonicalRef));
});

for (const kind of ['knowledge', 'ontology', 'decision']) test(`continued ${kind} completes retained final review and publication`, async t => {
  const { reviewRecordPromotionMaterialFixture } = await import('./helpers/record-promotion-material-fixture.js');
  const { recordApprovedCandidateReview } = await import('../payload/engine/lib/candidate-review.js');
  const { publishPreparedCandidate } = await import('../payload/engine/lib/publish-prepared-candidate.js');
  const f = await reviewRecordPromotionMaterialFixture(t, { kind });
  assert.equal(f.gate.version, 3);
  assert.deepEqual(f.final.gate, f.gate);
  const saved = await recordApprovedCandidateReview(f.writer());
  assert.equal(saved.status, 'retained');
  const published = await publishPreparedCandidate(f.publisher(saved));
  assert.equal(published.status, 'published', JSON.stringify(published));
  assert.equal(f.git('rev-parse', f.request.publish.outputRef), f.candidate.commit);
});

test('continued typed raw and wire ownership has exact capture admission and strict original selector', async t => {
  const f = await recordPromotionMaterialFixture(t);
  const { admitRecordPromotionInput, admitContinuedRecordPromotionWire, recordPromotionInputWire } = await import('../payload/engine/lib/record-promotion-input.js');
  const rows = evidence => [...evidence.decisionCaptures,
    ...evidence.assessmentCaptures.flatMap(pair => [pair.registry, pair.identity]), ...evidence.materialCaptures];
  const copies = () => ({ ...f.input, evidence: { decisionCaptures: f.input.evidence.decisionCaptures.map(copy),
    assessmentCaptures: f.input.evidence.assessmentCaptures.map(pair => ({ registry: copy(pair.registry), identity: copy(pair.identity) })),
    materialCaptures: f.input.evidence.materialCaptures.map(copy) } });
  const copy = row => ({ ...row, capture: structuredClone(row.capture), bytes: Buffer.from(row.bytes) });
  const total = rows(f.input.evidence).reduce((sum, row) => sum + row.bytes.length, 0);
  const raw = copies();
  raw.limits = { ...raw.limits, governance: { ...raw.limits.governance, maxCaptureBytes: total } };
  const admitted = admitRecordPromotionInput(raw);
  assert.equal(admitted.ok, true, JSON.stringify(admitted.diagnostics));
  const wire = recordPromotionInputWire(admitted.input);
  const decoded = admitContinuedRecordPromotionWire(f.root, wire);
  assert.equal(decoded.ok, true, JSON.stringify(decoded.diagnostics));
  assert.equal(decoded.inputDigest, admitted.inputDigest);
  for (const result of [admitted, decoded]) {
    for (const row of rows(result.input.evidence)) result.continuation.operationBudget.admitCapture(row);
    assert.equal(result.continuation.operationBudget.used.captureBytes, total);
    assert.notEqual(result.input.evidence.materialCaptures[0].bytes, raw.evidence.materialCaptures[0].bytes);
  }
  raw.evidence.materialCaptures[0].bytes.fill(0); raw.evidence.materialCaptures[0].capture.file = 'mutated.txt';
  assert.deepEqual(recordPromotionInputWire(admitted.input), wire);
  const short = copies(); short.limits = { ...short.limits,
    governance: { ...short.limits.governance, maxCaptureBytes: total - 1 } };
  assert.equal(admitRecordPromotionInput(short).continuation.operationBudget.failure.phase, 'lifecycle-continuation-owned-copy');
  wire.limits.governance.maxCaptureBytes--;
  assert.equal(admitContinuedRecordPromotionWire(f.root, wire).continuation.operationBudget.failure.phase, 'lifecycle-continuation-wire-decode');
  let reads = 0;
  for (const attack of [
    evidence => { evidence.materialCaptures = undefined; }, evidence => { evidence.materialCaptures = null; },
    evidence => { evidence.materialCaptures = new Array(1); }, evidence => { evidence.materialCaptures.extra = true; },
    evidence => { evidence.materialCaptures.push(evidence.materialCaptures[0]); },
    evidence => { Object.defineProperty(evidence, 'materialCaptures', { enumerable: true, get() { reads++; throw Error('unadmitted selector'); } }); },
    evidence => { Object.defineProperty(evidence.materialCaptures[0].bytes, 'length', { get() { reads++; return 0; } }); },
  ]) {
    const input = copies(); attack(input.evidence); assert.equal(admitRecordPromotionInput(input).ok, false);
  }
  assert.equal(reads, 0);
  const omitted = copies(); delete omitted.evidence.materialCaptures;
  assert.equal(Object.hasOwn(admitRecordPromotionInput(omitted), 'continuation'), false);
  const missing = copies(); missing.evidence.materialCaptures = [];
  const refused = await runPreparedRecordPromotionGate(missing);
  assert.equal(refused.ok, false); assert.equal(refused.version, 3);
  assert.equal(refused.assignment.checks.eligibility.status, 'failed');
});

test('absent-registry genesis debits its actual row phase without a fabricated handle', async t => {
  const f = await recordPromotionMaterialFixture(t, { kind: 'decision', subjectAuthority: false, companionStores: [] });
  const control = await runPreparedRecordPromotionGate(f.input);
  assert.equal(control.ok, true, JSON.stringify(control.diagnostics));
  assert.equal(control.capabilities.before.subjectRegistry, false);
  assert.equal(control.version, 3);
  const used = control.resources.governance.used.validationSteps;
  const input = { ...f.input, limits: { ...f.input.limits,
    governance: { ...f.input.limits.governance, maxValidationSteps: used } } };
  assert.equal((await runPreparedRecordPromotionGate(input)).ok, true);
  input.limits.governance.maxValidationSteps--;
  const short = await runPreparedRecordPromotionGate(input);
  assert.equal(short.ok, false);
  assert.equal(short.resources.governance.failure.counter, 'validationSteps');
  assert.equal(short.resources.governance.failure.phase, 'record-promotion-genesis-row');
  assert.equal(short.resources.governance.failure.remaining, 0);
  assert.equal(short.assignment.rows.length, 2, 'completed earlier native genesis rows remain actual evidence');
});

test('continued typed governance charges committed and materialized registry bytes', async t => {
  const f = await recordPromotionMaterialFixture(t);
  const { withTreeSnapshot } = await import('../payload/engine/lib/commit-snapshot.js');
  const { loadStores } = await import('../payload/engine/lib/load-stores.js');
  const { locateKitRoot } = await import('../payload/engine/lib/kit-root.js');
  const { readFileSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { admitRecordPromotionInput } = await import('../payload/engine/lib/record-promotion-input.js');
  const { typedPromotionGovernance } = await import('../payload/engine/lib/typed-promotion-checks.js');
  await withTreeSnapshot(f.root, f.input.before.tree, async snapshot => {
    const kit = locateKitRoot(snapshot.root), model = loadStores(kit);
    assert.equal(model.ok, true);
    const bytes = readFileSync(join(kit, 'subjects/registry.yaml')).length;
    const inspect = maxCaptureBytes => {
      const raw = { ...f.input, limits: { ...f.input.limits, governance: { ...f.input.limits.governance,
        ...(maxCaptureBytes === undefined ? {} : { maxCaptureBytes }) } } };
      const admitted = admitRecordPromotionInput(raw); assert.equal(admitted.ok, true);
      const budget = admitted.continuation.operationBudget;
      const initial = budget.used.captureBytes;
      const outcome = typedPromotionGovernance({ continued: true, request: admitted.input, budget, registry: {} }, 'before', model, snapshot.root);
      return { outcome, budget, initial };
    };
    const control = inspect(); assert.equal(control.outcome.ok, true);
    assert.equal(control.budget.used.captureBytes - control.initial, bytes * 2);
    const exact = control.initial + bytes * 2;
    assert.equal(inspect(exact).outcome.ok, true);
    const short = inspect(exact - 1);
    assert.equal(short.outcome.ok, false);
    assert.equal(short.budget.failure.counter, 'captureBytes');
    assert.equal(short.budget.failure.attempted, bytes);
    assert.equal(short.budget.failure.remaining, bytes - 1);
  });
});

test('actual typed source verification accepts source-less material matching before only', async t => {
  const f = await recordPromotionMaterialFixture(t);
  const { withTreeSnapshot } = await import('../payload/engine/lib/commit-snapshot.js');
  const { captureCommittedFile } = await import('../payload/engine/lib/captured-source.js');
  const { verifyLifecycleEvidenceSources } = await import('../payload/engine/lib/subject-lifecycle-context.js');
  const { createSubjectValidationBudget } = await import('../payload/engine/lib/subject-validation-budget.js');
  const { admitLifecycleCaptureEvidence } = await import('../payload/engine/lib/subject-capture-admission.js');
  const actual = captureCommittedFile({ repoRoot: f.root, commit: f.input.before.commit, file: f.path(f.sources[0].file) });
  const after = captureCommittedFile({ repoRoot: f.root, commit: f.input.candidate.commit, file: actual.locator.file });
  assert.equal(actual.bytes.equals(after.bytes), false);
  const { source, ...capture } = actual.locator;
  const budget = createSubjectValidationBudget(f.input.limits.governance);
  const evidence = admitLifecycleCaptureEvidence({ decisionCaptures: [], assessmentCaptures: [],
    materialCaptures: [{ capture, bytes: actual.bytes, objectFormat: actual.objectFormat }] }, budget);
  await withTreeSnapshot(f.root, f.input.before.tree, before =>
    withTreeSnapshot(f.root, f.input.candidate.tree, candidate => {
      assert.doesNotThrow(() => verifyLifecycleEvidenceSources({ repoRoot: f.root,
        before: { root: before.root, descriptor: f.input.before }, candidate: { root: candidate.root, descriptor: f.input.candidate },
        evidence, operationBudget: budget }));
    }));
  assert.equal(budget.failure, null);
  assert.ok(budget.used.captureBytes >= actual.bytes.length * 3 + after.bytes.length * 2);
  // This is source-helper provenance evidence, not a synthetic model declaration
  // or an assertion that this extra material belongs to the selected history.
});
