import test from 'node:test';
import assert from 'node:assert/strict';
import { subjectMergeMaterialFixture } from './helpers/subject-merge-material-fixture.js';
import { runPreparedEquivalentMergeGate } from '../payload/engine/lib/subject-equivalent-merge-gate.js';
test('actual prior reconsidered meanings merge through the fixed continued owner', async t => {
  const f=await subjectMergeMaterialFixture(t);
  assert.equal(f.reconsideration.ok,true);
  const result=await runPreparedEquivalentMergeGate(f.input);
  assert.equal(result.ok,true,JSON.stringify(result.diagnostics));
  assert.equal(result.version,2); assert.equal(result.assignments.ok,true);
});

test('continued merge reaches real prepared final review and publication', async t => {
  const { reviewSubjectMergeMaterialFixture }=await import('./helpers/subject-merge-material-fixture.js');
  const { recordApprovedCandidateReview }=await import('../payload/engine/lib/candidate-review.js');
  const { publishPreparedCandidate }=await import('../payload/engine/lib/publish-prepared-candidate.js');
  const f=await reviewSubjectMergeMaterialFixture(t);
  const saved=await recordApprovedCandidateReview(f.writer()); assert.equal(saved.status,'retained');
  const result=await publishPreparedCandidate(f.publisher(saved));
  assert.equal(result.status,'published',JSON.stringify(result));
  assert.equal(f.git('rev-parse',f.request.publish.outputRef),f.candidate.commit);
});

test('continued merge final refuses null impact without an exception',async t=>{
  const {finalSubjectMergeMaterialFixture,mergeMaterialEvidenceVariant}=await import('./helpers/subject-merge-material-fixture.js');
  const {runFinalPreparedEquivalentMergeGate}=await import('../payload/engine/lib/final-prepared-equivalent-merge.js');
  const {canonicalJsonBytes}=await import('../payload/engine/lib/canonical-json.js');
  const f=await finalSubjectMergeMaterialFixture(t);
  assert.equal((await runFinalPreparedEquivalentMergeGate(f.finalInput)).status,'passed');
  const variant=mergeMaterialEvidenceVariant(f,rows=>{
    const row=rows.find(row=>row.file==='checks/operation/input.json');const wire=JSON.parse(row.bytes);
    wire.impact=null;row.bytes=canonicalJsonBytes(wire);
  });
  assert.equal((await runFinalPreparedEquivalentMergeGate(variant)).status,'failed');
});

test('continued merge charges both actual unknown-owner recaptures', async t => {
  const f = await subjectMergeMaterialFixture(t);
  const { withTreeSnapshot } = await import('../payload/engine/lib/commit-snapshot.js');
  const { captureCommittedFile } = await import('../payload/engine/lib/captured-source.js');
  const { admitEquivalentMergeInput } = await import('../payload/engine/lib/subject-equivalent-merge-input.js');
  const { loadContinuedLifecycleContext } = await import('../payload/engine/lib/subject-lifecycle-context.js');
  const { inspectContinuedMergeAssignmentScope } = await import('../payload/engine/lib/subject-transition-core.js');
  await withTreeSnapshot(f.root, f.input.before.tree, before =>
    withTreeSnapshot(f.root, f.input.candidate.tree, async candidate => {
      const inspect = async (missingUnknowns, maxCaptureBytes) => {
        const raw = { ...f.input, operation: { ...f.input.operation,
          retainedUnknowns: missingUnknowns ? [] : f.input.operation.retainedUnknowns } };
        if (maxCaptureBytes !== undefined) raw.limits = { ...raw.limits,
          governance: { ...raw.limits.governance, maxCaptureBytes } };
        const admitted = admitEquivalentMergeInput(raw);
        assert.equal(admitted.ok, true, JSON.stringify(admitted.diagnostics));
        const operationBudget = admitted.continuation.operationBudget;
        const input = { ...admitted.input };
        for (const [side, snapshot] of [['before', before], ['candidate', candidate]]) {
          const loaded = loadContinuedLifecycleContext({ root: snapshot.root,
            evidence: admitted.input.evidence, operationBudget });
          assert.equal(loaded.ok, true, JSON.stringify(loaded.diagnostics));
          input[side] = { root: snapshot.root, descriptor: admitted.input[side], context: loaded.context };
        }
        return inspectContinuedMergeAssignmentScope(input, { operationBudget });
      };
      const refused = await inspect(true);
      assert.equal(refused.diagnostics[0]?.code, 'merge-retained-unknown-scope');
      const control = await inspect(false);
      assert.equal(control.ok, true, JSON.stringify(control.diagnostics));
      assert.ok(control.authoredReferenceClosure.retainedUnknowns.length > 0);
      const actualBytes = control.authoredReferenceClosure.retainedUnknowns.reduce((sum, row) => sum
        + ['before', 'candidate'].reduce((bytes, side) => bytes + captureCommittedFile({ repoRoot: f.root,
          commit: f.input[side].commit, file: row.before.capture.file }).bytes.length, 0), 0);
      assert.equal(control.resources.governance.used.captureBytes - refused.resources.governance.used.captureBytes,
        actualBytes, 'each independently recaptured full file is charged on both sides');
      const exact = control.resources.governance.used.captureBytes;
      assert.equal((await inspect(false, exact)).ok, true);
      const short = await inspect(false, exact - 1);
      assert.equal(short.ok, false);
      assert.equal(short.resources.governance.failure?.counter, 'captureBytes');
      assert.equal(short.resources.governance.failure?.phase, 'raw-captures');
      assert.equal(short.resources.governance.failure?.remaining,
        short.resources.governance.failure?.attempted - 1);
    }));
});

test('merge raw and wire admission own each capture once and preserve omitted selection', async t => {
  const f = await subjectMergeMaterialFixture(t);
  const { admitEquivalentMergeInput, equivalentMergeInputWire } = await import('../payload/engine/lib/subject-equivalent-merge-input.js');
  const { admitContinuedMergeWire } = await import('../payload/engine/lib/subject-lifecycle-input.js');
  const rows = evidence => [...evidence.decisionCaptures,
    ...evidence.assessmentCaptures.flatMap(pair => [pair.registry, pair.identity]), ...evidence.materialCaptures];
  const total = rows(f.input.evidence).reduce((sum, row) => sum + row.bytes.length, 0);
  const raw = { ...f.input, limits: { ...f.input.limits,
    governance: { ...f.input.limits.governance, maxCaptureBytes: total } } };
  const admitted = admitEquivalentMergeInput(raw);
  assert.equal(admitted.ok, true, JSON.stringify(admitted.diagnostics));
  const wire = equivalentMergeInputWire(admitted.input);
  const decoded = admitContinuedMergeWire(f.root, wire);
  assert.equal(decoded.ok, true, JSON.stringify(decoded.diagnostics));
  assert.equal(decoded.inputDigest, admitted.inputDigest);
  for (const result of [admitted, decoded]) {
    for (const row of rows(result.input.evidence)) result.continuation.operationBudget.admitCapture(row);
    assert.equal(result.continuation.operationBudget.used.captureBytes, total);
    assert.notEqual(result.input.evidence.materialCaptures[0].bytes, f.input.evidence.materialCaptures[0].bytes);
  }
  raw.limits.governance.maxCaptureBytes--;
  assert.equal(admitEquivalentMergeInput(raw).continuation.operationBudget.failure.phase, 'lifecycle-continuation-owned-copy');
  wire.limits.governance.maxCaptureBytes--;
  assert.equal(admitContinuedMergeWire(f.root, wire).continuation.operationBudget.failure.phase, 'lifecycle-continuation-wire-decode');
  for (const materialCaptures of [undefined, null, new Array(1)]) {
    assert.equal(admitEquivalentMergeInput({ ...f.input, evidence: { ...f.input.evidence, materialCaptures } }).ok, false);
  }
  const omitted = { ...f.input, evidence: { ...f.input.evidence } };
  delete omitted.evidence.materialCaptures;
  const legacy = admitEquivalentMergeInput(omitted);
  assert.equal(legacy.ok, true); assert.equal(Object.hasOwn(legacy, 'continuation'), false);
});
