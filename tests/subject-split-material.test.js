import test from 'node:test';
import assert from 'node:assert/strict';
import { subjectSplitMaterialFixture } from './helpers/subject-split-material-fixture.js';
import { runPreparedSubjectSplitGate } from '../payload/engine/lib/subject-split-gate.js';
test('actual reconsidered source splits with original before pair and fresh native allocation',async t=>{
  const f=await subjectSplitMaterialFixture(t);
  assert.equal(f.reconsideration.ok,true);
  const result=await runPreparedSubjectSplitGate(f.input);
  assert.equal(result.ok,true,JSON.stringify(result.diagnostics));assert.equal(result.version,2);
  assert.deepEqual(result.allocation.allocatedIds,['S-000002','S-000003']);
});

test('continued split reaches real prepared final review and publication',async t=>{
  const { reviewSubjectSplitMaterialFixture }=await import('./helpers/subject-split-material-fixture.js');
  const { recordApprovedCandidateReview }=await import('../payload/engine/lib/candidate-review.js');
  const { publishPreparedCandidate }=await import('../payload/engine/lib/publish-prepared-candidate.js');
  const f=await reviewSubjectSplitMaterialFixture(t);
  const saved=await recordApprovedCandidateReview(f.writer());assert.equal(saved.status,'retained');
  const result=await publishPreparedCandidate(f.publisher(saved));
  assert.equal(result.status,'published',JSON.stringify(result));
  assert.equal(f.git('rev-parse',f.request.publish.outputRef),f.candidate.commit);
});

for (const allEmpty of [false,true]) test(`continued split positive mapping allEmpty=${allEmpty}`,async t=>{
  const f=await subjectSplitMaterialFixture(t,{zero:false,allEmpty});
  const result=await runPreparedSubjectSplitGate(f.input);
  assert.equal(result.ok,true,JSON.stringify(result.diagnostics));
  assert.equal(result.assignments.ok,true);assert.equal(result.authoredReferenceClosure.affectedRefs.length,1);
  assert.deepEqual(f.input.operation.mappings[0].successors,allEmpty?[]:['S-000002','S-000003']);
});

test('continued split final refuses null impact without an exception',async t=>{
  const {finalSubjectSplitMaterialFixture,splitMaterialEvidenceVariant}=await import('./helpers/subject-split-material-fixture.js');
  const {runFinalPreparedSubjectSplitGate}=await import('../payload/engine/lib/final-prepared-subject-split.js');
  const {canonicalJsonBytes}=await import('../payload/engine/lib/canonical-json.js');
  const f=await finalSubjectSplitMaterialFixture(t,{zero:false,allEmpty:true});
  const control=await runFinalPreparedSubjectSplitGate(f.finalInput);
  assert.equal(control.status,'passed',JSON.stringify(control));
  assert.ok(f.gate.sources.assignmentEvent);assert.equal(f.gate.assignments.ok,true);
  const variant=splitMaterialEvidenceVariant(f,rows=>{
    const row=rows.find(row=>row.file==='checks/operation/input.json');const wire=JSON.parse(row.bytes);
    wire.impact=null;row.bytes=canonicalJsonBytes(wire);
  });
  assert.equal((await runFinalPreparedSubjectSplitGate(variant)).status,'failed');
});

test('split raw and wire admission preserve one owned original pair and explicit selection', async t => {
  const f = await subjectSplitMaterialFixture(t);
  const { admitSubjectSplitInput, subjectSplitInputWire } = await import('../payload/engine/lib/subject-split-input.js');
  const { admitContinuedSplitWire } = await import('../payload/engine/lib/subject-lifecycle-input.js');
  const rows = evidence => [...evidence.decisionCaptures,
    ...evidence.assessmentCaptures.flatMap(pair => [pair.registry, pair.identity]), ...evidence.materialCaptures];
  const total = rows(f.input.evidence).reduce((sum, row) => sum + row.bytes.length, 0);
  const raw = { ...f.input, limits: { ...f.input.limits,
    governance: { ...f.input.limits.governance, maxCaptureBytes: total } } };
  const admitted = admitSubjectSplitInput(raw);
  assert.equal(admitted.ok, true, JSON.stringify(admitted.diagnostics));
  const wire = subjectSplitInputWire(admitted.input);
  const decoded = admitContinuedSplitWire(f.root, wire);
  assert.equal(decoded.ok, true, JSON.stringify(decoded.diagnostics));
  assert.equal(decoded.inputDigest, admitted.inputDigest);
  for (const result of [admitted, decoded]) {
    for (const row of rows(result.input.evidence)) result.continuation.operationBudget.admitCapture(row);
    assert.equal(result.continuation.operationBudget.used.captureBytes, total);
    assert.notEqual(result.input.evidence.materialCaptures[0].bytes, f.input.evidence.materialCaptures[0].bytes);
  }
  raw.limits.governance.maxCaptureBytes--;
  assert.equal(admitSubjectSplitInput(raw).continuation.operationBudget.failure.phase, 'lifecycle-continuation-owned-copy');
  wire.limits.governance.maxCaptureBytes--;
  assert.equal(admitContinuedSplitWire(f.root, wire).continuation.operationBudget.failure.phase, 'lifecycle-continuation-wire-decode');
  const original = f.input.evidence.assessmentCaptures.find(pair => pair.registry.capture.source?.commit === f.input.before.commit);
  assert.ok(original);
  const missing = await runPreparedSubjectSplitGate({ ...f.input, evidence: { ...f.input.evidence,
    assessmentCaptures: f.input.evidence.assessmentCaptures.filter(pair => pair !== original) } });
  assert.equal(missing.ok, false);
  assert.ok(JSON.stringify(missing.diagnostics).includes('split-original-before-pair'));
  assert.equal(admitSubjectSplitInput({ ...f.input, evidence: { ...f.input.evidence,
    assessmentCaptures: [...f.input.evidence.assessmentCaptures, original] } }).ok, false);
  for (const materialCaptures of [undefined, null, new Array(1)]) {
    assert.equal(admitSubjectSplitInput({ ...f.input, evidence: { ...f.input.evidence, materialCaptures } }).ok, false);
  }
  const omitted = { ...f.input, evidence: { ...f.input.evidence } };
  delete omitted.evidence.materialCaptures;
  const legacy = admitSubjectSplitInput(omitted);
  assert.equal(legacy.ok, true); assert.equal(Object.hasOwn(legacy, 'continuation'), false);
});
