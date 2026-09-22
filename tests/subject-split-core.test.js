import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalJsonBytes } from '../payload/engine/lib/canonical-json.js';
import { getSubjectValidationBudget } from '../payload/engine/lib/subject-validation-budget.js';
import { subjectSplitCoreFixture } from './helpers/subject-split-core-fixture.js';
import { validateSubjectSplitCreation, validateSubjectActivation } from '../payload/engine/lib/subject-governance.js';
const modelInput = input => ({beforeModel:input.before.model,candidateModel:input.candidate.model,
  beforeCaptures:input.evidence.assessmentCaptures[0],decisionCaptures:input.evidence.decisionCaptures,assessmentCaptures:[],
  operation:{id:input.operation.id,subject:input.operation.subject,successors:input.operation.successors,registryEvents:input.operation.registryEvents},
  allocationLimits:input.limits.allocation,budget:input.limits.governance});
import { inspectSubjectSplitAssignmentScope as inspect } from '../payload/engine/lib/subject-split-core.js';
for(const zero of [false,true]) test(`actual split ${zero?'zero':'positive'} core binds the native two-authority pair`, async t=>{
  const f=subjectSplitCoreFixture(t,{zero});
  const bundle=await f.withCoreInput(async input=>{
    const model=validateSubjectSplitCreation(modelInput(input)); assert.equal(model.ok,true,JSON.stringify(model.diagnostics));
    const legacy=validateSubjectActivation(modelInput(input)); assert.equal(legacy.ok,false); assert.equal(legacy.diagnostics[0].code,'invalid-promotion');
    return inspect(input);
  });
  assert.equal(bundle.core.ok,true,JSON.stringify(bundle.core.diagnostics));
  assert.ok(bundle.candidateGovernance); assert.ok(bundle.operationBudget);
  assert.deepEqual(bundle.core.allocation.allocatedIds,['S-000004','S-000005']);
  assert.equal(bundle.core.assignments.length,zero?0:3);
});

for (const [name,options] of [
  ['nested SHA256',{objectFormat:'sha256',nested:true}],
  ['Ontology only without Knowledge',{kinds:['ontology'],knowledgePresent:false}],
  ['Decision only without Knowledge',{kinds:['decision'],knowledgePresent:false}],
  ['Ontology and Decision without Knowledge',{kinds:['ontology','decision'],knowledgePresent:false}],
  ['all stores',{kinds:['knowledge','ontology','decision']}],
  ['zero Decision without Knowledge',{kinds:['decision'],knowledgePresent:false,zero:true}],
  ['zero Ontology and Decision without Knowledge',{kinds:['ontology','decision'],knowledgePresent:false,zero:true}],
  ['zero nested SHA256',{objectFormat:'sha256',nested:true,zero:true}],
  ['historical and retained inheritance',{historical:true,inherited:'retained'}],
  ['introduced successor below original child',{inherited:'introduced'}],
]) test(`actual split ${name} retains complete closure`,async t=>{
  const f=subjectSplitCoreFixture(t,options); const b=await f.withCoreInput(inspect); const c=b.core;
  assert.equal(c.ok,true,JSON.stringify(c.diagnostics)); assert.equal(getSubjectValidationBudget(b.operationBudget),b.operationBudget);
  assert.deepEqual(c.resources.governance.used,b.operationBudget.used);
  assert.deepEqual(c.operation,f.operation,'original mapping and retention reasons are retained literally');
  assert.equal(c.resources.governance.failure,null); assert.equal(c.resources.closure.failure,null);
  assert.deepEqual(c.assignments,f.operation.mappings.map(row=>{
    const original=f.owners.find(owner=>owner.ref.id===row.ref.id && owner.ref.kind===row.ref.kind);
    return {ref:row.ref,after:{state:'known',ids:original.before.flatMap(id=>id==='S-000001'?row.successors:[id])}};
  }));
  const rows=[c.allocation,c.assessment,...c.assignments,...c.authoredReferenceClosure.retainedUnknowns,
    ...c.authoredReferenceClosure.retainedHistoricalUses,...c.authoredReferenceClosure.retainedParents,
    ...c.authoredReferenceClosure.retainedInheritedUses,...c.authoredReferenceClosure.successorParents];
  assert.deepEqual(c.resources.closure.used,{rows:rows.length,bytes:rows.reduce((n,row)=>n+canonicalJsonBytes(row).length,0)});
  assert.equal(c.authoredReferenceClosure.semanticCompleteness,'unknown');
  assert.equal(c.authoredReferenceClosure.retainedUnknowns.length,options.knowledgePresent===false?2:3);
  if(options.objectFormat==='sha256') assert.equal(c.allocation.before.capture.blob.length,64);
  if(options.historical) assert.equal(c.authoredReferenceClosure.retainedHistoricalUses[0].ref.id,'K-000004');
  const dispositions=c.authoredReferenceClosure.retainedInheritedUses.map(row=>row.disposition);
  if(options.inherited) assert.ok(dispositions.includes('retained'));
  if(options.inherited==='introduced') assert.deepEqual(dispositions.filter(value=>value==='introduced-by-successor-assignment').length,2);
  if(!options.zero) assert.ok(dispositions.includes('exposed-by-direct-substitution'));
});

test('positive scope permits all explicitly empty successor subsets',async t=>{
  const f=subjectSplitCoreFixture(t,{candidateChange({operation,owners,editKnowledge}){
    for(const row of operation.mappings) row.successors=[];
    for(const owner of owners) editKnowledge(owner.file,record=>{record.subjects=owner.before.filter(id=>id!=='S-000001');});
  }});
  const b=await f.withCoreInput(inspect); assert.equal(b.core.ok,true,JSON.stringify(b.core.diagnostics));
  assert.deepEqual(b.core.assignments.map(row=>row.after.ids),[[],['S-000003'],['S-000002','S-000003']]);
  assert.ok(b.core.operation.assignmentEvent);
});
