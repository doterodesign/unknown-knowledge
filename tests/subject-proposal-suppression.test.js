import test from 'node:test';
import assert from 'node:assert/strict';
import { subjectProposalSuppressionFixture } from './helpers/subject-proposal-suppression-fixture.js';
import { validateSubjectTransition } from '../payload/engine/lib/subject-governance.js';

for (const setup of [{ objectFormat:'sha1',nested:false },{objectFormat:'sha256',nested:true,material:true}]) {
  test(`actual ${setup.objectFormat} proposal suppression native before-model control and fixed owner`,async t=>{
    const f=await subjectProposalSuppressionFixture(t,setup);
    assert.equal(f.beforeModel.ok,true,JSON.stringify(f.beforeModel.diagnostics));
    assert.equal(f.candidateModel.ok,true,JSON.stringify(f.candidateModel.diagnostics));
    const control=f.native();assert.equal(control.ok,true,JSON.stringify(control.diagnostics));
    const substituted=validateSubjectTransition({before:f.beforeModel.subjectRegistry.document,candidate:f.candidateModel.subjectRegistry.document,
      model:f.candidateModel,identityIndex:f.candidateModel.identityIndex,...f.input.evidence});
    assert.equal(substituted.ok,false);assert.equal(substituted.diagnostics[0].code,'subject-capture-mismatch');
    const module=await import('../payload/engine/lib/subject-metadata-gate.js');
    assert.equal(typeof module.runPreparedSubjectProposalSuppressionGate,'function');
    const report=await module.runPreparedSubjectProposalSuppressionGate(f.input);
    assert.equal(report.ok,true,JSON.stringify(report.diagnostics));
    assert.equal(report.kind,'subject-proposal-suppression-gate');
    assert.equal(report.assignments,null);
    assert.equal(report.impacts.representativeReplays.subjects.find(row=>row.id===f.proposal).disposition,'selected-proposal-suppressed');
  });
}

import { runPreparedSubjectMetadataGate, runPreparedSubjectProposalSuppressionGate,
  runPreparedSubjectProposalSuppressionGateFromWire } from '../payload/engine/lib/subject-metadata-gate.js';
import { admitSubjectProposalSuppressionInput, subjectProposalSuppressionInputWire } from '../payload/engine/lib/subject-metadata-input.js';
import { createSubjectValidationBudget } from '../payload/engine/lib/subject-validation-budget.js';
import { canonicalSha256 } from '../payload/engine/lib/canonical-json.js';
import { wire, stateOf } from './helpers/subject-reconsideration-fixture.js';
import { loadStores } from '../payload/engine/lib/load-stores.js';
import { chmodSync } from 'node:fs';
import { join } from 'node:path';
const copy = input => ({ ...structuredClone({ ...input, evidence: null }), evidence: {
  decisionCaptures: input.evidence.decisionCaptures.map(row => ({ ...structuredClone({ ...row, bytes: null }), bytes: Buffer.from(row.bytes) })),
  materialCaptures: input.evidence.materialCaptures.map(row => ({ ...structuredClone({ ...row, bytes: null }), bytes: Buffer.from(row.bytes) })),
  assessmentCaptures: input.evidence.assessmentCaptures.map(pair => Object.fromEntries(Object.entries(pair).map(([name,row]) =>
    [name,{ ...structuredClone({ ...row, bytes:null }), bytes:Buffer.from(row.bytes) }]))),
} });

test('suppression fixed wire, authentic admission, owned bytes and closed profile', async t => {
  const f = await subjectProposalSuppressionFixture(t);
  const raw = copy(f.input), budget = createSubjectValidationBudget(raw.limits.governance);
  const admitted = admitSubjectProposalSuppressionInput(raw,{operationBudget:budget});
  assert.equal(admitted.ok,true,JSON.stringify(admitted.diagnostics));
  const bytes = Buffer.from(admitted.input.evidence.decisionCaptures[0].bytes), digest = admitted.inputDigest;
  raw.evidence.decisionCaptures[0].bytes.fill(0); raw.evidence.decisionCaptures[0].capture.file = 'caller-mutated';
  assert.deepEqual(admitted.input.evidence.decisionCaptures[0].bytes,bytes);
  assert.equal(canonicalSha256(subjectProposalSuppressionInputWire(admitted.input)),digest);
  const gateInput = subjectProposalSuppressionInputWire(f.input);
  const actual = await runPreparedSubjectProposalSuppressionGateFromWire({repoRoot:f.root,gateInput});
  assert.equal(actual.ok,true,JSON.stringify(actual.diagnostics)); assert.equal(actual.inputDigest,canonicalSha256(gateInput));
  assert.equal((await runPreparedSubjectMetadataGate(f.input)).checks.admission.status,'failed');
  let reads=0;
  assert.equal(admitSubjectProposalSuppressionInput({get before(){reads++;throw Error('unexpected input inspection');}},{operationBudget:{}}).ok,false);
  for (const attack of [x=>{x.operation.action='rename';},x=>{x.operation.extra=true;},x=>{x.impact.policy='subject-metadata-impact-v1';},
    x=>{x.evidence.materialCaptures=null;},x=>{x.operation.retainedUnknowns.length++;},
    x=>Object.defineProperty(x.evidence.decisionCaptures[0].bytes,'length',{get(){reads++;return 1;}})]) {
    const changed=copy(f.input);attack(changed);
    assert.equal(admitSubjectProposalSuppressionInput(changed,{operationBudget:createSubjectValidationBudget(f.input.limits.governance)}).ok,false);
  }
  assert.equal(reads,0);
  const total=f.input.evidence.decisionCaptures.reduce((sum,row)=>sum+row.bytes.length,0);
  for (const delta of [0,-1]) {
    const allowance=createSubjectValidationBudget({...f.input.limits.governance,maxCaptureBytes:total+delta});
    assert.equal(admitSubjectProposalSuppressionInput(copy(f.input),{operationBudget:allowance}).ok,delta===0);
    if(delta===0) assert.equal(allowance.used.captureBytes,total);
    else {assert.equal(allowance.failure.phase,'reconsideration-input-owned-copy');assert.equal(allowance.used.captureBytes,0);}
  }
});

test('one suppression event supports multiple proposed rows without canonical edits', async t => {
  const second='proposal:subject:a7000000-0000-4000-8000-000000000002';
  const f=await subjectProposalSuppressionFixture(t,{
    beforeChange(h){
      const doc=structuredClone(loadStores(h.kitRoot).subjectRegistry.document);
      doc.subjects.push({...structuredClone(doc.subjects.find(row=>row.id===h.proposal)),id:second,label:'Second unwarranted facet'});
      h.put('subjects/registry.yaml',wire(doc));
    },
    candidateChange({document,event}){
      const row=document.subjects.find(row=>row.id===second),before=stateOf(row);
      const after={...before,status:'suppressed',refusal:{decision:event.decision,reason:event.reason}};
      event.rows.push({id:second,before,after});Object.assign(row,after);row.changes.push(event.id);
    },
  });
  assert.equal(f.native().ok,true,JSON.stringify(f.native().diagnostics));
  const report=await runPreparedSubjectProposalSuppressionGate(f.input);assert.equal(report.ok,true,JSON.stringify(report.diagnostics));
  assert.equal(report.impacts.representativeReplays.subjects.filter(row=>row.disposition==='selected-proposal-suppressed').length,2);
  for(const row of report.impacts.representativeReplays.comparison.cases)for(const kind of ['strict','possible']){
    assert.deepEqual(row.candidates[kind].added,[]);assert.deepEqual(row.candidates[kind].removed,[]);
  }
});

for(const [name,change] of [
  ['changed proposal definition',({document,event,proposal})=>{event.rows[0].after.definition.text+=' different meaning';document.subjects.find(row=>row.id===proposal).definition.text=event.rows[0].after.definition.text;}],
  ['mismatched retained refusal',({document,proposal})=>{document.subjects.find(row=>row.id===proposal).refusal.reason='unreviewed reason';}],
  ['canonical participant',({document,event,beforeModel})=>{const prior=beforeModel.subjectRegistry.document.subjects.find(row=>row.id==='S-000001');event.rows=[{id:prior.id,before:stateOf(prior),after:{...stateOf(prior),status:'suppressed',refusal:{decision:event.decision,reason:event.reason}}}];Object.assign(document.subjects.find(row=>row.id===prior.id),event.rows[0].after);}],
  ['owner body change',h=>h.put('knowledge/K-000001.md',h.read('knowledge/K-000001.md')+'unreviewed body\n')],
  ['registry executable change',h=>chmodSync(join(h.kitRoot,'subjects/registry.yaml'),0o755)],
])test(`suppression refuses ${name}`,async t=>{
  const f=await subjectProposalSuppressionFixture(t,{candidateChange:change});
  const result=await runPreparedSubjectProposalSuppressionGate(f.input);
  assert.equal(result.ok,false,JSON.stringify(result));
  assert.ok(result.diagnostics.length>0);
});

test('suppression bounded closure/replay/lookup phases reject short capacity',async t=>{
  const f=await subjectProposalSuppressionFixture(t);
  for(const [group,key,code] of [['closure','maxRows','metadata-closure-budget'],['replays','maxSubjects','metadata-replays-incomplete'],
    ['replays','maxCases','metadata-replays-incomplete'],['lookup','maxTerms','metadata-lookup-incomplete']]){
    const input=copy(f.input);input.limits[group][key]=0;
    const result=await runPreparedSubjectProposalSuppressionGate(input);
    assert.equal(result.ok,false);assert.equal(result.diagnostics[0].code,code,JSON.stringify(result.diagnostics));
  }
});
