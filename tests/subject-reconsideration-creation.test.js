import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as governance from '../payload/engine/lib/subject-governance.js';
import { subjectReconsiderationFixture } from './helpers/subject-reconsideration-fixture.js';
import { createSubjectValidationBudget } from '../payload/engine/lib/subject-validation-budget.js';
import { describeCandidateBytes, captureCommittedFile } from '../payload/engine/lib/captured-source.js';
import { canonicalSha256 } from '../payload/engine/lib/canonical-json.js';
import { writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadStores } from '../payload/engine/lib/load-stores.js';
import { wire, limits, stateOf, digestEvent } from './helpers/subject-reconsideration-fixture.js';
import { spawnSync } from 'node:child_process';

const run=(f,extra={},options)=>governance.validateSubjectReconsiderationCreation(f.input(extra),options);

test('actual suppressed before capture remains healthy and historically evaluable', t => {
  const f=subjectReconsiderationFixture(t);
  assert.equal(f.beforeModel.ok,true,JSON.stringify(f.beforeModel.diagnostics));
  const evaluated=governance.evaluateSubjectGovernance({registry:f.beforeModel.subjectRegistry,identity:f.beforeModel.identity,
    identityIndex:f.beforeModel.identityIndex,decisionCaptures:f.decisionCaptures});
  assert.equal(evaluated.ok,true,JSON.stringify(evaluated.diagnostics));
});

test('actual reconsideration candidate loads but ordinary promotion still refuses', t => {
  const f=subjectReconsiderationFixture(t);
  assert.equal(f.candidateModel.ok,true,JSON.stringify(f.candidateModel.diagnostics));
  const result=governance.validateSubjectPromotion(f.input());
  assert.equal(result.ok,false);
});

test('fixed reconsideration creates one actual fresh Subject from exact suppressed history', t => {
  const f=subjectReconsiderationFixture(t);
  assert.equal(typeof governance.validateSubjectReconsiderationCreation,'function');
  const result=governance.validateSubjectReconsiderationCreation(f.input());
  assert.equal(result.ok,true,JSON.stringify(result.diagnostics));
  assert.equal(result.publicationReady,false);
  assert.deepEqual(result.allocation.ids,['S-000001']);
  assert.equal(governance.subjectEligibility(result.governance,'S-000001',{purpose:'new-assignment'}).eligible,true);
});

for(const options of [{objectFormat:'sha256',nested:true},{parent:true,related:true},{archivedPrior:true},{sourceMaterial:true}]){
  test(`actual fixed model creation ${JSON.stringify(options)}`,t=>{
    const f=subjectReconsiderationFixture(t,options);const result=run(f);
    assert.equal(result.ok,true,JSON.stringify(result.diagnostics));
    assert.equal(result.resources.allocation.used.subjects,1);
    assert.equal(result.resources.allocation.used.ledgerRows,f.beforeModel.identity.allocations.length+f.identity.allocations.length);
  });
}

test('unrelated material, duplicate locators and explicit null evidence lists refuse',t=>{
  const f=subjectReconsiderationFixture(t);assert.equal(run(f).ok,true);
  for(const extra of [{materialCaptures:[...f.materialCaptures,f.beforeCaptures.identity]},
    {materialCaptures:[...f.materialCaptures,...f.materialCaptures]},{materialCaptures:null},{assessmentCaptures:null},{decisionCaptures:null}]){
    const result=run(f,extra);assert.equal(result.ok,false);assert.equal(result.governance,null);
  }
});

test('native population admission occurs before any nested identity getter',t=>{
  const f=subjectReconsiderationFixture(t);assert.equal(run(f).ok,true);let calls=0;
  const allocations=[];Object.defineProperty(allocations,'0',{enumerable:true,get(){calls++;throw new Error('must not traverse');}});
  const result=run(f,{beforeModel:{...f.beforeModel,identity:{...f.beforeModel.identity,allocations}},allocationLimits:{maxLedgerRows:0}});
  assert.equal(result.ok,false);assert.equal(result.diagnostics[0].code,'subject-creation-allocation-budget');assert.equal(calls,0);
  assert.deepEqual(result.resources.allocation.used,{ledgerRows:0,subjects:0});
});

test('forged or exhausted allowance refuses before model access',t=>{
  const f=subjectReconsiderationFixture(t);let calls=0;
  const beforeModel={};Object.defineProperty(beforeModel,'ok',{enumerable:true,get(){calls++;throw new Error('model read');}});
  const input=f.input({beforeModel});delete input.budget;
  const forged=governance.validateSubjectReconsiderationCreation(input,{operationBudget:{}});
  assert.equal(forged.ok,false);assert.equal(calls,0);
  const budget=createSubjectValidationBudget({...limits,maxValidationSteps:0});
  assert.throws(()=>budget.charge('validationSteps',1,'test-exhausted'));
  const exhausted=governance.validateSubjectReconsiderationCreation(input,{operationBudget:budget});
  assert.equal(exhausted.ok,false);assert.equal(exhausted.diagnostics[0].phase,'test-exhausted');assert.equal(calls,0);
});

test('allocation proof does not replace independent original raw pair correspondence',t=>{
  const f=subjectReconsiderationFixture(t);assert.equal(run(f).ok,true);
  const duplicate=run(f,{assessmentCaptures:[f.beforeCaptures]});assert.equal(duplicate.ok,false);assert.ok(duplicate.allocation);assert.equal(duplicate.governance,null);
  const changed=structuredClone(f.beforeDocument);
  const unrelated={...structuredClone(changed.subjects[0]),id:'proposal:subject:a2000000-0000-4000-8000-000000000099',status:'proposed',changes:[]};
  delete unrelated.refusal;changed.subjects.push(unrelated);
  const bytes=Buffer.from(JSON.stringify(wire(changed)));
  const capture=describeCandidateBytes({file:f.beforeCaptures.registry.capture.file,bytes,objectFormat:'sha1'});
  const pair={registry:{capture,bytes,objectFormat:'sha1'},identity:{...f.beforeCaptures.identity,capture:{...f.beforeCaptures.identity.capture}}};
  delete pair.identity.capture.source;
  f.event.reconsiderationAssessment.scope.beforeRegistry={capture,documentDigest:canonicalSha256(changed)};f.reload();
  const mismatch=run(f,{beforeCaptures:pair});assert.equal(mismatch.ok,false);assert.ok(mismatch.allocation);assert.equal(mismatch.governance,null);
  assert.equal(mismatch.diagnostics[0].code,'input-mismatch');
  assert.match(mismatch.diagnostics[0].message,/Original assessed bytes differ/);
});

test('missing material after native success retains only partial allocation observation',t=>{
  const f=subjectReconsiderationFixture(t);const result=run(f,{materialCaptures:[]});
  assert.equal(result.ok,false);assert.ok(result.allocation);assert.equal(result.governance,null);
  assert.equal(result.diagnostics[0].code,'assessment-evidence-unavailable');
});

test('source-less exact material proves supplied bytes without inventing Git provenance',t=>{
  const f=subjectReconsiderationFixture(t,{sourceMaterial:true});
  const capture={...f.materialCaptures[0].capture};delete capture.source;
  f.materialCaptures=[{...f.materialCaptures[0],capture}];f.event.reconsideration.sources[0].capture=capture;f.reload();
  const result=run(f);assert.equal(result.ok,true,JSON.stringify(result.diagnostics));
  assert.equal(result.assessment.evidence,'captured-scope-and-material-bindings-only');
  assert.equal(Object.hasOwn(f.event.reconsideration.sources[0].capture,'source'),false);
});

test('material record references follow declared warrant bindings without a new selected-record parser',t=>{
  const f=subjectReconsiderationFixture(t);
  const citation={ref:{namespace:f.beforeModel.identity.namespace,kind:'knowledge',id:'K-000009'},capture:f.materialCaptures[0].capture};
  // The bytes remain a Decision file: no claim is made that this declared K citation was independently parsed/resolved.
  f.event.reconsideration.records=[citation];f.event.rows[0].after.warrant.records=[citation];
  f.candidateDocument.subjects.find(row=>row.id==='S-000001').warrant.records=[citation];f.reload();
  const result=run(f);assert.equal(result.ok,true,JSON.stringify(result.diagnostics));
  assert.equal(result.assessment.semanticCompleteness,'asserted-in-reviewed-evidence');
});

test('current new Decision must be independently effective on both actual sides',t=>{
  const f=subjectReconsiderationFixture(t);assert.equal(run(f).ok,true);
  const file=join(f.kitRoot,'decisions/entries/review.yaml');const document=JSON.parse(readFileSync(file));
  document.entries.find(row=>row.id==='D-000003').status='proposed';writeFileSync(file,JSON.stringify(document));
  const beforeModel=loadStores(f.kitRoot);assert.equal(beforeModel.ok,true);
  const result=run(f,{beforeModel});assert.equal(result.ok,false);assert.equal(result.governance,null);
  assert.equal(result.diagnostics[0].code,'ineffective-authorizer');
});

test('public historical and selected authorizer accessors never execute',t=>{
  const f=subjectReconsiderationFixture(t);assert.equal(run(f).ok,true);
  for(const side of ['beforeModel','candidateModel'])for(const id of ['D-000002','D-000003'])for(const key of ['record','id','identity']){
    let calls=0;const decisions=new Map(f[side].decisions);const entry={...decisions.get(id)};
    Object.defineProperty(entry,key,{enumerable:true,get(){calls++;throw new RangeError('must not invoke');}});decisions.set(id,entry);
    const result=run(f,{[side]:{...f[side],decisions}});assert.equal(result.ok,false);assert.equal(calls,0);
  }
});

test('unrelated Decision map entries and irrelevant stores are never traversed',t=>{
  const f=subjectReconsiderationFixture(t);let calls=0;const decisions=new Map(f.beforeModel.decisions);
  const unused={};Object.defineProperty(unused,'record',{get(){calls++;throw new Error('unrelated');}});decisions.set('D-000999',unused);
  const stores={...f.candidateModel.stores};Object.defineProperty(stores,'knowledge',{enumerable:true,get(){calls++;throw new Error('unused store');}});
  const result=run(f,{beforeModel:{...f.beforeModel,decisions},candidateModel:{...f.candidateModel,stores}});
  assert.equal(result.ok,true,JSON.stringify(result.diagnostics));assert.equal(calls,0);
});

test('all shared logical counters have exact-fit success and one-short refusal',t=>{
  const f=subjectReconsiderationFixture(t,{parent:true,related:true});const baseline=run(f);assert.equal(baseline.ok,true);
  const names={captureBytes:'maxCaptureBytes',documentNodes:'maxDocumentNodes',documentTextUnits:'maxDocumentTextUnits',
    subjects:'maxSubjects',historyRows:'maxHistoryRows',validationSteps:'maxValidationSteps'};
  const budget=Object.fromEntries(Object.entries(names).map(([used,limit])=>[limit,baseline.used[used]]));
  assert.equal(run(f,{budget}).ok,true);
  for(const [counter,limit] of Object.entries(names)){
    const result=run(f,{budget:{...budget,[limit]:budget[limit]-1}});assert.equal(result.ok,false,counter);assert.equal(result.governance,null);
    assert.equal(result.diagnostics[0].counter,counter);assert.ok(result.used[counter]<=budget[limit]-1);
  }
});

test('retained raw byte accounting independently sums distinct actual evidence objects',t=>{
  const f=subjectReconsiderationFixture(t);const result=run(f);assert.equal(result.ok,true);
  const captures=new Set([...f.decisionCaptures,...f.materialCaptures,f.beforeCaptures.registry,f.beforeCaptures.identity]);
  const expected=[...captures].reduce((sum,item)=>sum+item.bytes.length,0);
  assert.equal(result.used.captureBytes,expected);
});

test('malformed own shapes and Decision map access overrides refuse without invocation',t=>{
  const f=subjectReconsiderationFixture(t);assert.equal(run(f).ok,true);let calls=0;
  const decisions=new Map(f.beforeModel.decisions);
  Object.defineProperty(decisions,'get',{get(){calls++;throw new Error('map access');}});
  const malformed=[{operation:{...f.operation,registryEvent:null}},
    {beforeModel:{...f.beforeModel,subjectRegistry:{...f.beforeModel.subjectRegistry,document:null}}},
    {beforeModel:{...f.beforeModel,subjectRegistry:{...f.beforeModel.subjectRegistry,document:{...f.beforeDocument,subjects:[null]}}}},
    {beforeModel:{...f.beforeModel,decisions}}];
  for(const extra of malformed){const result=run(f,extra);assert.equal(result.ok,false);assert.equal(result.governance,null);}
  const captureList=[];Object.defineProperty(captureList,'0',{enumerable:true,get(){calls++;throw new Error('capture access');}});
  assert.equal(run(f,{materialCaptures:captureList}).ok,false);assert.equal(calls,0);
});

test('guarded deep retained history and public Decision captures refuse as typed input failures',t=>{
  const f=subjectReconsiderationFixture(t);assert.equal(run(f).ok,true);
  let deep={};for(let i=0;i<10000;i++)deep={child:deep};
  const document={...f.candidateModel.subjectRegistry.document,history:f.candidateModel.subjectRegistry.document.history.map((event,i)=>i===0?{...event,extra:deep}:event)};
  const history=run(f,{candidateModel:{...f.candidateModel,subjectRegistry:{...f.candidateModel.subjectRegistry,document}}});
  assert.equal(history.ok,false);assert.equal(history.governance,null);
  for(const id of ['D-000002','D-000003']){
    const decisions=new Map(f.beforeModel.decisions);const entry=decisions.get(id);
    decisions.set(id,{...entry,record:{...entry.record,extra:deep}});
    const result=run(f,{beforeModel:{...f.beforeModel,decisions}});assert.equal(result.ok,false);assert.equal(result.governance,null);
  }
});

test('a second actual reconsideration retains earlier material and projects only before-history evidence',t=>{
  const f=subjectReconsiderationFixture(t,{sourceMaterial:true});assert.equal(run(f).ok,true);
  const priorPair=f.beforeCaptures;
  const nextProposal='proposal:subject:a2000000-0000-4000-8000-000000000091';
  const nextRefusal='a2000000-0000-4000-8000-000000000092';
  const nextActivation='a2000000-0000-4000-8000-000000000093';
  const nextOperation='a2000000-0000-4000-8000-000000000094';
  const citation={ref:{namespace:f.beforeModel.identity.namespace,kind:'decision',id:'D-000001'},capture:f.decisionCaptures[0].capture};
  const draft={...structuredClone(f.event.promotes.before),id:nextProposal,status:'proposed',changes:[],warrant:{records:[citation],sources:[]}};
  delete draft.refusal;
  const suppressed={...stateOf(draft),status:'suppressed',refusal:{decision:f.refusal.decision,reason:'Review the second proposal separately'}};
  const refusal={id:nextRefusal,action:'suppress',decision:f.refusal.decision,reason:suppressed.refusal.reason,
    rows:[{id:nextProposal,before:stateOf(draft),after:suppressed}]};
  refusal.review={...f.refusal.review,changeDigest:digestEvent(refusal)};
  const beforeDocument=structuredClone(f.candidateDocument);beforeDocument.history.push(refusal);beforeDocument.revision++;
  beforeDocument.subjects.push({id:nextProposal,...suppressed,changes:[nextRefusal]});
  writeFileSync(join(f.candidateRoot,'subjects/registry.yaml'),JSON.stringify(wire(beforeDocument)));
  const git=(...args)=>{const result=spawnSync('/usr/bin/git',['-c','user.name=Fixture','-c','user.email=fixture@example.invalid','-C',f.candidateRoot,...args],{encoding:'utf8'});
    assert.equal(result.status,0,result.stderr);return result.stdout.trim();};
  git('add','.');git('commit','-qm','actual before second reconsideration');const commit=git('rev-parse','HEAD');
  const capture=file=>{const actual=captureCommittedFile({repoRoot:f.candidateRoot,commit,file});return {capture:actual.locator,bytes:actual.bytes,objectFormat:actual.objectFormat};};
  const beforeCaptures={registry:capture('subjects/registry.yaml'),identity:capture('_identity.yaml')};
  const beforeModel=loadStores(f.candidateRoot);assert.equal(beforeModel.ok,true,JSON.stringify(beforeModel.diagnostics));
  const material={reason:'New assessment of already captured second material',records:[citation],sources:[]};
  const active={...suppressed,status:'active',originDecision:f.event.decision};delete active.refusal;
  const event={id:nextActivation,action:'activate',decision:f.event.decision,promotes:{key:nextProposal,before:structuredClone(beforeDocument.subjects.at(-1))},
    priorRefusal:nextRefusal,reconsideration:material,reconsiderationAssessment:{version:1,
      scope:{beforeRegistry:{capture:beforeCaptures.registry.capture,documentDigest:canonicalSha256(beforeDocument)},identityDigest:canonicalSha256(beforeModel.identity)},
      coverage:'complete-registry',attestation:'all-current-suppressed-meanings-assessed',
      relevantRefusals:[{subject:nextProposal,refusal:nextRefusal,disposition:'same-meaning-reconsidered',reason:material.reason}]},
    rows:[{id:'S-000002',before:null,after:active}]};
  event.review={...f.event.review,reference:'review:second-reconsideration',changeDigest:digestEvent(event)};
  const candidate={...structuredClone(beforeDocument),revision:beforeDocument.revision+1,
    history:[...beforeDocument.history,event],subjects:[...beforeDocument.subjects.filter(row=>row.id!==nextProposal),{id:'S-000002',...active,changes:[nextActivation]}]};
  const identity=structuredClone(beforeModel.identity);identity.allocations.push({kind:'subject',id:'S-000002',state:'allocated',publication:{id:nextOperation,review:event.review.reference}});
  writeFileSync(join(f.candidateRoot,'subjects/registry.yaml'),JSON.stringify(wire(candidate)));writeFileSync(join(f.candidateRoot,'_identity.yaml'),JSON.stringify(identity));
  const candidateModel=loadStores(f.candidateRoot);assert.equal(candidateModel.ok,true,JSON.stringify(candidateModel.diagnostics));
  const input={beforeModel,candidateModel,beforeCaptures,decisionCaptures:f.decisionCaptures,
    materialCaptures:[...f.materialCaptures,f.decisionCaptures[0]],assessmentCaptures:[priorPair],
    operation:{id:nextOperation,proposal:nextProposal,subject:'S-000002',registryEvent:{id:nextActivation,changeDigest:event.review.changeDigest}},
    allocationLimits:f.allocationLimits,budget:f.budget};
  const result=governance.validateSubjectReconsiderationCreation(input);assert.equal(result.ok,true,JSON.stringify(result.diagnostics));
  for(const id of ['S-000001','S-000002'])assert.equal(governance.subjectEligibility(result.governance,id,{purpose:'query'}).eligible,true);
  const missingPrior=governance.validateSubjectReconsiderationCreation({...input,materialCaptures:[f.decisionCaptures[0]]});
  assert.equal(missingPrior.ok,true,JSON.stringify(missingPrior.diagnostics));
  assert.equal(governance.subjectEligibility(missingPrior.governance,'S-000002',{purpose:'query'}).eligible,true);
  assert.equal(governance.subjectEligibility(missingPrior.governance,'S-000001',{purpose:'query'}).eligible,null);
});
