import test from 'node:test';
import assert from 'node:assert/strict';
import { subjectMetadataFixture } from './helpers/subject-metadata-fixture.js';

for (const action of ['rename', 'clarify', 'reparent', 'relate']) {
  test(`actual ${action} native control and fixed registry-only gate`, async t => {
    const f = await subjectMetadataFixture(t, { action });
    assert.equal(f.candidateModel.ok, true, JSON.stringify(f.candidateModel.diagnostics));
    const control = f.native();
    assert.equal(control.ok, true, JSON.stringify(control.diagnostics));
    assert.deepEqual(f.git('diff', '--name-only', f.input.before.tree, f.input.candidate.tree).split('\n'), ['subjects/registry.yaml']);
    const { runPreparedSubjectMetadataGate } = await import('../payload/engine/lib/subject-metadata-gate.js');
    const report = await runPreparedSubjectMetadataGate(f.input);
    assert.equal(report.ok, true, JSON.stringify(report.diagnostics));
    assert.equal(report.assignments, null);
    assert.equal(report.assignmentAssessment.reason, 'registry-only-transition');
  });
}

import { runPreparedSubjectMetadataGate, runPreparedSubjectMetadataGateFromWire } from '../payload/engine/lib/subject-metadata-gate.js';
import { subjectMetadataInputWire, admitSubjectMetadataInput } from '../payload/engine/lib/subject-metadata-input.js';
import { createSubjectValidationBudget } from '../payload/engine/lib/subject-validation-budget.js';
import { canonicalSha256 } from '../payload/engine/lib/canonical-json.js';
import { describeCandidateBytes } from '../payload/engine/lib/captured-source.js';
import { wire as registryWire, stateOf, digestEvent } from './helpers/subject-reconsideration-fixture.js';
import { load as yaml } from 'js-yaml';
import { chmodSync } from 'node:fs';
import { join } from 'node:path';

const copy = input => ({ ...structuredClone({ ...input, evidence: null }), evidence: {
  decisionCaptures: input.evidence.decisionCaptures.map(row => ({ ...structuredClone({ ...row, bytes: null }), bytes: Buffer.from(row.bytes) })),
  materialCaptures: input.evidence.materialCaptures.map(row => ({ ...structuredClone({ ...row, bytes: null }), bytes: Buffer.from(row.bytes) })),
  assessmentCaptures: input.evidence.assessmentCaptures.map(pair => Object.fromEntries(Object.entries(pair).map(([name,row]) =>
    [name,{ ...structuredClone({ ...row, bytes:null }), bytes:Buffer.from(row.bytes) }]))),
} });

test('fixed wire reuse, authentic admission and owned detached buffers', async t => {
  const f=await subjectMetadataFixture(t);
  const input=copy(f.input), budget=createSubjectValidationBudget(input.limits.governance);
  const admitted=admitSubjectMetadataInput(input,{operationBudget:budget});
  assert.equal(admitted.ok,true,JSON.stringify(admitted.diagnostics));
  const bytes=Buffer.from(admitted.input.evidence.decisionCaptures[0].bytes), digest=admitted.inputDigest;
  input.evidence.decisionCaptures[0].bytes.fill(0); input.evidence.decisionCaptures[0].capture.file='changed';
  assert.deepEqual(admitted.input.evidence.decisionCaptures[0].bytes,bytes);
  assert.equal(canonicalSha256(subjectMetadataInputWire(admitted.input)),digest);
  const wire=subjectMetadataInputWire(f.input);
  const result=await runPreparedSubjectMetadataGateFromWire({repoRoot:f.root,gateInput:wire});
  assert.equal(result.ok,true,JSON.stringify(result.diagnostics));
  assert.equal(result.inputDigest,canonicalSha256(wire));
  let reads=0; const trapped={get before(){reads++;throw new Error('must not inspect');}};
  assert.equal(admitSubjectMetadataInput(trapped,{operationBudget:{}}).ok,false); assert.equal(reads,0);
  const invalid=copy(f.input); Object.defineProperty(invalid.evidence.decisionCaptures[0].bytes,'length',{get(){reads++;return 1;}});
  assert.equal(admitSubjectMetadataInput(invalid,{operationBudget:createSubjectValidationBudget(f.input.limits.governance)}).ok,false);
  assert.equal(reads,0);
});

test('closed dense input rejects precise metadata attacks after healthy copy',async t=>{
  const f=await subjectMetadataFixture(t);
  assert.equal(admitSubjectMetadataInput(copy(f.input),{operationBudget:createSubjectValidationBudget(f.input.limits.governance)}).ok,true);
  for(const attack of [x=>{x.operation.extra=true;},x=>{delete x.evidence.materialCaptures;},x=>{x.evidence.materialCaptures=null;},
    x=>{x.operation.retainedUnknowns.length++;},x=>{x.impact.policy='different';},x=>{x.before.commit+='\n';}]){
    const input=copy(f.input);attack(input);
    const result=admitSubjectMetadataInput(input,{operationBudget:createSubjectValidationBudget(f.input.limits.governance)});
    assert.equal(result.ok,false);
  }
});

test('logical capture, closure, recipe, lookup and hierarchy capacities refuse at their own phases',async t=>{
  const f=await subjectMetadataFixture(t,{action:'reparent'});
  for(const [group,key,limit,code] of [
    ['governance','maxCaptureBytes',0,'invalid-subject-metadata-input'],['closure','maxRows',0,'metadata-closure-budget'],
    ['replays','maxSubjects',0,'metadata-replays-incomplete'],['replays','maxCases',0,'metadata-replays-incomplete'],
    ['lookup','maxTerms',0,'metadata-lookup-incomplete'],['tree','maxBytes',0,'metadata-tree-incomplete'],
    ['reach','maxHierarchyNodes',0,'metadata-reach-incomplete']]){
    const input=copy(f.input);input.limits[group][key]=limit;
    const result=await runPreparedSubjectMetadataGate(input);
    assert.equal(result.ok,false,`${group}.${key}`);assert.equal(result.diagnostics[0].code,code,JSON.stringify(result.diagnostics));
  }
});

test('actual owner file edit and registry executable-mode change refuse',async t=>{
  for(const mode of [false,true]){
    const f=await subjectMetadataFixture(t,{candidateChange(h){
      if(mode)chmodSync(join(h.kitRoot,'subjects/registry.yaml'),0o755);
      else h.put('knowledge/K-000001.md',h.read('knowledge/K-000001.md')+'Unreviewed body change.\n');
    }});
    const result=await runPreparedSubjectMetadataGate(f.input);
    assert.equal(result.ok,false);assert.equal(result.diagnostics[0].code,mode?'metadata-transition-shape':'metadata-preservation-paths');
  }
});

function unavailableSetup({ assigned=false, ancestor=false, homonym=false }={}) {
  return h=>{
    const document=structuredClone(h.context.model.subjectRegistry.document), identity=JSON.parse(h.read('_identity.yaml'));
    const record={id:'D-000002',title:'Historical separate meaning review',status:'accepted',category:'architecture',date:'2026-09-19',
      deciders:['steward'],context:'Separate history',decision:'Approve separate meaning'};
    const bytes=Buffer.from(JSON.stringify({'schema-version':2,entries:[record]}));
    const file='decisions/entries/unavailable.yaml';h.put(file,bytes);
    const catalog=JSON.parse(h.read('decisions/_catalog.yaml'));catalog.entries.push({id:record.id,title:record.title,file:'entries/unavailable.yaml'});h.put('decisions/_catalog.yaml',catalog);
    const ref={namespace:document.namespace,kind:'decision',id:record.id};
    const capture=describeCandidateBytes({file,bytes,objectFormat:h.objectFormat});
    const state={...stateOf(document.subjects[0]),label:homonym?'Color':'Independent meaning',parent:undefined,related:[],originDecision:ref};delete state.parent;
    const event={id:'a6000000-0000-4000-8000-000000000004',action:'activate',decision:ref,rows:[{id:'S-000004',before:null,after:state}]};
    event.review={reference:'review:unavailable',acceptedStatus:'accepted',decisionCapture:capture,decisionDigest:canonicalSha256(record),changeDigest:digestEvent(event)};
    document.subjects.push({id:'S-000004',...state,changes:[event.id]});document.history.push(event);document.revision++;
    for(const [kind,id] of [['decision','D-000002'],['subject','S-000004']])identity.allocations.push({kind,id,state:'allocated',publication:{id:event.id,review:event.review.reference}});
    if(ancestor){
      const selected=document.subjects.find(row=>row.id==='S-000003');
      // An actual earlier reviewed parent event makes unchanged U an ancestor.
      const parent={id:'a6000000-0000-4000-8000-000000000005',action:'reparent',decision:document.history[0].decision,
        rows:[{id:selected.id,before:stateOf(selected),after:{...stateOf(selected),parent:'S-000004'}}]};
      parent.review={...document.history[0].review,changeDigest:digestEvent(parent)};
      Object.assign(selected,parent.rows[0].after);selected.changes.push(parent.id);document.history.push(parent);document.revision++;document.hierarchyRevision++;
    }
    h.put('_identity.yaml',identity);h.put('subjects/registry.yaml',registryWire(document));
    if(assigned){const parts=h.read('knowledge/K-000001.md').split('---'),row=yaml(parts[1]);row.subjects=['S-000004'];h.put('knowledge/K-000001.md',`---\n${JSON.stringify(row)}\n---${parts.slice(2).join('---')}`);}
  };
}
const originalAuthorizer=({document,event})=>{event.decision=document.history[0].decision;event.review={...document.history[0].review};};
for(const [name,action,setup,pass] of [
  ['unassigned unrelated U','rename',{},true],['assigned U baseline refusal','rename',{assigned:true},false],
  ['unrelated U permits reparent','reparent',{},true],['unchanged ancestor U blocks reparent','reparent',{ancestor:true},false],
])test(name,async t=>{
  const f=await subjectMetadataFixture(t,{action,beforeChange:unavailableSetup(setup),candidateChange:originalAuthorizer});
  assert.equal(f.native().ok,true,JSON.stringify(f.native().diagnostics));
  const result=await runPreparedSubjectMetadataGate(f.input);
  assert.equal(result.ok,pass,JSON.stringify(result.diagnostics));
  const qualification=result.impacts.representativeReplays;
  if(pass)assert.equal(qualification.subjects.find(row=>row.id==='S-000004').disposition,'stable-unavailable-unrelated');
  else assert.equal(result.diagnostics[0].code,'metadata-replays-incomplete');
});

test('lookup preserves homonyms without manufacturing automatic aliases',async t=>{
  const f=await subjectMetadataFixture(t,{beforeChange:unavailableSetup({homonym:true}),candidateChange:originalAuthorizer});
  const result=await runPreparedSubjectMetadataGate(f.input);assert.equal(result.ok,true,JSON.stringify(result.diagnostics));
  const lookup=result.impacts.lookup;
  assert.equal(lookup.resources.calls,2*lookup.terms.length);
  const color=lookup.rows.find(row=>row.term==='Color'&&row.side==='after');
  assert.deepEqual(color.output.matches.map(row=>row.id).sort(),['S-000001','S-000004']);
  const exact=copy(f.input);exact.limits.lookup={maxTerms:lookup.resources.terms,maxTermBytes:lookup.resources.termBytes,
    maxMatches:lookup.resources.reservedMatches,maxBytes:lookup.resources.bytes};
  assert.equal((await runPreparedSubjectMetadataGate(exact)).ok,true);
  exact.limits.lookup.maxBytes--;assert.equal((await runPreparedSubjectMetadataGate(exact)).ok,false);
});

test('one native event supports atomic multirow parent rotation and association ownership transfer',async t=>{
  for(const action of ['reparent','relate']){
    const f=await subjectMetadataFixture(t,{action,
      beforeChange:action==='relate'?h=>{
        const doc=structuredClone(h.context.model.subjectRegistry.document);
        doc.history[0].rows.find(row=>row.id==='S-000001').after.related=[{type:'association',target:'S-000002'}];
        doc.subjects.find(row=>row.id==='S-000001').related=[{type:'association',target:'S-000002'}];
        doc.history[0].review.changeDigest=digestEvent(doc.history[0]);h.put('subjects/registry.yaml',registryWire(doc));
      }:undefined,
      candidateChange:({beforeModel,document,event})=>{
        const prior=beforeModel.subjectRegistry.document;
        event.rows=['S-000001','S-000002'].map(id=>{
          const before=stateOf(prior.subjects.find(row=>row.id===id)),after=structuredClone(before);
          if(action==='reparent'){if(id==='S-000001')after.parent='S-000002';else delete after.parent;}
          else after.related=id==='S-000001'?[]:[{type:'association',target:'S-000001'}];
          const next=document.subjects.find(row=>row.id===id);for(const key of Object.keys(next))if(!['id','changes'].includes(key))delete next[key];
          Object.assign(next,after);if(!next.changes.includes(event.id))next.changes.push(event.id);
          return {id,before,after};
        });
      }});
    const native=f.native();assert.equal(native.ok,true,JSON.stringify(native.diagnostics));
    const result=await runPreparedSubjectMetadataGate(f.input);assert.equal(result.ok,true,JSON.stringify(result.diagnostics));
    assert.equal(f.event.rows.length,2);
  }
});

test('raw evidence reservation exact fit and one-short fail before owned copy',async t=>{
  const f=await subjectMetadataFixture(t);
  const total=f.input.evidence.decisionCaptures.reduce((n,row)=>n+row.bytes.length,0);
  for(const delta of [0,-1]){
    const limits={...f.input.limits.governance,maxCaptureBytes:total+delta},budget=createSubjectValidationBudget(limits);
    const result=admitSubjectMetadataInput(copy(f.input),{operationBudget:budget});
    assert.equal(result.ok,delta===0);
    if(delta===0)assert.equal(budget.used.captureBytes,total);
    else {assert.equal(budget.failure.phase,'reconsideration-input-owned-copy');assert.equal(budget.used.captureBytes,0);}
  }
});

import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
test('actual snapshot cleanup revokes completed metadata success',async t=>{
  const f=await subjectMetadataFixture(t);
  const create=fs.mkdtempSync,remove=fs.rmSync,roots=[];let injected=false;
  fs.mkdtempSync=(...args)=>{const root=create(...args);if(/unknown-knowledge-tree-/.test(String(args[0])))roots.push(root);return root;};
  fs.rmSync=(path,options)=>{remove(path,options);if(!injected&&roots.length>=4&&path===roots[1]){injected=true;throw new Error('one-shot metadata cleanup failure');}};
  syncBuiltinESMExports();let result;
  try{result=await runPreparedSubjectMetadataGate(f.input);}finally{fs.mkdtempSync=create;fs.rmSync=remove;syncBuiltinESMExports();}
  assert.equal(injected,true);assert.equal(result.ok,false);assert.equal(result.preservation.status,'passed');
  assert.ok(result.diagnostics.some(row=>row.message.includes('cleanup')));
});
