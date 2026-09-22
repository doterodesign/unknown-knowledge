import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateSubjectGovernance, subjectEligibility, getSubjectGovernanceDescriptor } from '../payload/engine/lib/subject-governance.js';
import { validateReconsiderationEvent } from '../payload/engine/lib/subject-reconsideration-evidence.js';
import { createSubjectValidationBudget } from '../payload/engine/lib/subject-validation-budget.js';
import { subjectReconsiderationFixture, limits, namespace, proposal, stateOf, digestEvent } from './helpers/subject-reconsideration-fixture.js';

const evaluate=(f,extra={})=>evaluateSubjectGovernance({registry:f.candidateModel.subjectRegistry,identity:f.candidateModel.identity,
  identityIndex:f.candidateModel.identityIndex,decisionCaptures:f.decisionCaptures,assessmentCaptures:[f.beforeCaptures],materialCaptures:f.materialCaptures,...extra});
const eligible=result=>result.ok&&subjectEligibility(result.governance,'S-000001',{purpose:'query'}).eligible;

test('historical material universe refuses unrelated and duplicate unrelated actual captures',t=>{
  const f=subjectReconsiderationFixture(t);assert.equal(eligible(evaluate(f)),true);
  for(const extra of [[f.beforeCaptures.identity],[f.beforeCaptures.identity,f.beforeCaptures.identity]]){
    const result=evaluate(f,{materialCaptures:[...f.materialCaptures,...extra]});
    assert.equal(result.ok,false,'valid bytes outside the retained event material universe must refuse');
  }
});

test('fixed event material and warrant lookup visits debit the authentic allowance',t=>{
  const f=subjectReconsiderationFixture(t);assert.equal(eligible(evaluate(f)),true);
  const budget=createSubjectValidationBudget({...limits,maxValidationSteps:0});
  assert.throws(()=>validateReconsiderationEvent(f.event,namespace,budget),error=>error.code==='subject-validation-budget'
    &&error.phase==='reconsideration-material-row');
});

test('material union lookup charges inspected ordinary history events at its named phase',t=>{
  const f=subjectReconsiderationFixture(t);assert.equal(eligible(evaluate(f)),true);
  const ordinary={registry:f.beforeModel.subjectRegistry,identity:f.beforeModel.identity,identityIndex:f.beforeModel.identityIndex,
    decisionCaptures:f.decisionCaptures,materialCaptures:f.materialCaptures};
  let reached=false;
  for(let count=0;count<2000;count++){
    const operationBudget=createSubjectValidationBudget({...limits,maxValidationSteps:count});
    try{evaluateSubjectGovernance(ordinary,{operationBudget});break;}
    catch(error){assert.equal(error.code,'subject-validation-budget');
      if(error.phase==='reconsideration-material-history'){reached=true;assert.equal(operationBudget.used.validationSteps,count);break;}}
  }
  assert.equal(reached,true,'the one inspected non-reconsideration event must be charged before rejecting unrelated material');
});

for(const options of [{},{objectFormat:'sha256',nested:true},{parent:true,related:true},{archivedPrior:true},{sourceMaterial:true}]){
  test(`real historical reconsideration preserves exact history and material ${JSON.stringify(options)}`,t=>{
    const f=subjectReconsiderationFixture(t,options);
    assert.equal(f.candidateModel.ok,true,JSON.stringify(f.candidateModel.diagnostics));
    const result=evaluate(f);assert.equal(eligible(result),true,JSON.stringify(result.diagnostics));
    assert.equal(f.candidateModel.subjectRegistry.proposals.has(proposal),false);
    assert.deepEqual(f.candidateDocument.history.slice(0,-1),f.beforeDocument.history);
    assert.deepEqual(f.event.promotes.before,f.beforeDocument.subjects.find(row=>row.id===proposal));
    assert.equal(getSubjectGovernanceDescriptor(result.governance).events.at(-1).assessmentVerification,'verified');
  });
}

test('material omission leaves historical activation unavailable, corrupt material refuses',t=>{
  const f=subjectReconsiderationFixture(t);assert.equal(eligible(evaluate(f)),true);
  const missing=evaluate(f,{materialCaptures:[]});assert.equal(missing.ok,true);assert.equal(eligible(missing),null);
  const corrupted={...f.materialCaptures[0],bytes:Buffer.from('different bytes')};
  assert.equal(evaluate(f,{materialCaptures:[corrupted]}).ok,false);
  assert.equal(evaluate(f,{materialCaptures:null}).ok,false);
});

test('exact captured handle remains immutable while fresh corrupted material refuses',t=>{
  const f=subjectReconsiderationFixture(t);const result=evaluate(f);assert.equal(eligible(result),true);
  const before=getSubjectGovernanceDescriptor(result.governance);
  f.materialCaptures[0].bytes=Buffer.from('changed after evaluation');
  assert.deepEqual(getSubjectGovernanceDescriptor(result.governance),before);assert.equal(eligible(result),true);
  assert.equal(evaluate(f).ok,false);
});

test('missing original scope cannot be replaced by coherent current indexes',t=>{
  const f=subjectReconsiderationFixture(t);assert.equal(eligible(evaluate(f)),true);
  const result=evaluate(f,{assessmentCaptures:[]});assert.equal(result.ok,true);assert.equal(eligible(result),null);
});

test('prior refusal verification remains required when new Decision and material bytes are intact',t=>{
  const f=subjectReconsiderationFixture(t,{archivedPrior:true,sourceMaterial:true});assert.equal(eligible(evaluate(f)),true);
  const result=evaluate(f,{decisionCaptures:[f.decisionCaptures[1]]});
  assert.equal(result.ok,true,JSON.stringify(result.diagnostics));assert.equal(eligible(result),null);
  assert.equal(getSubjectGovernanceDescriptor(result.governance).events.at(-1).captureVerification,'integrity-checked');
});

test('ordinary empty material evidence preserves the pre-correction logical usage snapshot',t=>{
  const f=subjectReconsiderationFixture(t);
  for(const extra of [{},{materialCaptures:[]}]){
    const operationBudget=createSubjectValidationBudget(limits);
    const result=evaluateSubjectGovernance({registry:f.beforeModel.subjectRegistry,identity:f.beforeModel.identity,
      identityIndex:f.beforeModel.identityIndex,decisionCaptures:f.decisionCaptures,...extra},{operationBudget});
    assert.equal(result.ok,true);assert.equal(operationBudget.used.validationSteps,5);
    assert.equal(operationBudget.used.historyRows,1);
  }
  const extra=[];extra.unexpected=true;
  assert.equal(evaluateSubjectGovernance({registry:f.beforeModel.subjectRegistry,identity:f.beforeModel.identity,
    identityIndex:f.beforeModel.identityIndex,decisionCaptures:f.decisionCaptures,materialCaptures:extra}).ok,false);
});

test('a new active child cannot be reconsidered under a parent already retired at creation',t=>{
  const f=subjectReconsiderationFixture(t,{parent:true,retiredParent:true});
  assert.equal(f.beforeModel.ok,true,JSON.stringify(f.beforeModel.diagnostics));
  assert.equal(f.candidateModel.ok,false,'candidate history must reject the inactive parent at activation');
});

test('later parent retirement does not invalidate the captured activation-time parent proof',t=>{
  const f=subjectReconsiderationFixture(t,{parent:true});assert.equal(eligible(evaluate(f)),true);
  const parent=f.candidateDocument.subjects.find(row=>row.id==='S-000002');
  const after={...stateOf(parent),status:'retired',retirement:{kind:'retire'}};
  const event={id:'a2000000-0000-4000-8000-000000000009',action:'retire',decision:f.event.decision,rows:[{id:parent.id,before:stateOf(parent),after}]};
  event.review={...f.event.review,changeDigest:digestEvent(event)};
  Object.assign(parent,after);parent.changes.push(event.id);f.candidateDocument.history.push(event);f.candidateDocument.revision++;f.reload();
  assert.equal(f.candidateModel.ok,true,JSON.stringify(f.candidateModel.diagnostics));
  const result=evaluate(f);assert.equal(eligible(result),true,JSON.stringify(result.diagnostics));
});

test('an already consumed proposal cannot be consumed again under a new event and canonical ID',t=>{
  const f=subjectReconsiderationFixture(t);assert.equal(eligible(evaluate(f)),true);
  const repeat=structuredClone(f.event);repeat.id='a2000000-0000-4000-8000-000000000098';repeat.rows[0].id='S-000003';repeat.review.changeDigest=digestEvent(repeat);
  f.candidateDocument.history.push(repeat);f.candidateDocument.revision++;
  f.candidateDocument.subjects.push({id:'S-000003',...repeat.rows[0].after,changes:[repeat.id]});
  f.identity.allocations.push({kind:'subject',id:'S-000003',state:'allocated',publication:{id:repeat.id,review:'review:repeat'}});f.reload();
  assert.equal(f.candidateModel.ok,false);
  assert.ok(f.candidateModel.diagnostics.some(row=>row.code==='invalid-history'));
});

for(const [name,edit] of [
  ['wrong prior refusal',f=>{f.event.priorRefusal=f.event.id;}],
  ['old Decision reused',f=>{f.event.decision=f.refusal.decision;f.event.rows[0].after.originDecision=f.refusal.decision;}],
  ['changed prior meaning',f=>{f.event.promotes.before.definition.text='Different suppressed meaning';}],
  ['changed history chain',f=>{f.event.promotes.before.changes.unshift(f.event.id);}],
  ['proposal reappearance',f=>{f.candidateDocument.subjects.push(structuredClone(f.event.promotes.before));}],
  ['unrelated participant disappearance',f=>{f.candidateDocument.subjects=f.candidateDocument.subjects.filter(row=>row.id!=='S-000002');}],
  ['missing selected refusal row',f=>{f.event.reconsiderationAssessment.relevantRefusals=[];}],
  ['distinct-meaning bypass',f=>{f.event.reconsiderationAssessment.relevantRefusals[0].disposition='distinct-meaning';}],
  ['changed reason',f=>{f.event.reconsiderationAssessment.relevantRefusals[0].reason='Different reason';}],
  ['empty material',f=>{f.event.reconsideration.records=[];f.event.reconsideration.sources=[];}],
  ['material absent final warrant',f=>{f.event.rows[0].after.warrant.records=[];}],
  ['both assessment fields',f=>{f.event.refusalAssessment=structuredClone(f.event.reconsiderationAssessment);
    f.event.refusalAssessment.relevantRefusals[0].disposition='distinct-meaning';}],
  ['reconsideration markers on rename',f=>{f.event.action='rename';}],
]){
  test(`historical reconsideration refuses ${name}`,t=>{
    const f=subjectReconsiderationFixture(t,{parent:true,related:true});assert.equal(eligible(evaluate(f)),true);
    edit(f);f.reload();assert.equal(f.candidateModel.ok,false,JSON.stringify(f.candidateModel.diagnostics));
  });
}
