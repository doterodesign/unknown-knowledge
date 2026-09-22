import test from 'node:test';
import assert from 'node:assert/strict';
import { subjectSplitCoreFixture } from './helpers/subject-split-core-fixture.js';
import { inspectSubjectSplitAssignmentScope as inspect } from '../payload/engine/lib/subject-split-core.js';
import { canonicalSha256 } from '../payload/engine/lib/canonical-json.js';
import { registryWire } from './helpers/equivalent-merge-fixture.js';

test('actual core refuses false historical Decision source membership with intact captured bytes',async t=>{
  const f=subjectSplitCoreFixture(t,{zero:true,beforeChange({beforeModel,input,git,put}){
    const original=input.decisionCaptures[0];const capture=structuredClone(original.capture);
    capture.source.tree=git('rev-parse','HEAD:decisions');
    input.decisionCaptures.push({...original,capture});
    const document=structuredClone(beforeModel.subjectRegistry.document);
    document.history[0].review.decisionCapture=capture;
    const {review,...body}=document.history[0];review.changeDigest=canonicalSha256(body);
    put('subjects/registry.yaml',registryWire(document));
  }});
  const b=await f.withCoreInput(inspect);
  assert.equal(b.core.ok,false,'historical byte integrity cannot prove a false source tree');
  assert.equal(b.candidateGovernance,null);
  assert.equal(b.core.diagnostics[0]?.code,'split-evidence-source',JSON.stringify(b.core.diagnostics));
});

for(const part of ['registry','identity']) test(`retained historical assessment ${part} source is independently corroborated`,async t=>{
  const f=subjectSplitCoreFixture(t,{zero:true});
  const b=await f.withCoreInput(input=>{
    const pair=Object.fromEntries(Object.entries(f.beforeCaptures).map(([key,value])=>[key,{...value,capture:structuredClone(value.capture)}]));
    // This extra historical pair cannot masquerade as the required original.
    pair.registry.capture.source.tree=f.git('rev-parse','HEAD:decisions');
    if(part==='identity') {
      pair.registry=f.capture({commit:f.git('rev-parse',`${input.before.descriptor.commit}^`)},'subjects/registry.yaml');
      pair.identity.capture.source.tree=f.git('rev-parse','HEAD:decisions');
    }
    input.evidence={...input.evidence,assessmentCaptures:[...input.evidence.assessmentCaptures,pair]};return inspect(input);
  });
  assert.equal(b.core.ok,false);assert.equal(b.candidateGovernance,null);
  assert.equal(b.core.diagnostics[0]?.code,'split-evidence-source',JSON.stringify(b.core.diagnostics));
});

test('a valid historical source recapture is charged and one byte short cannot retain success',async t=>{
  const f=subjectSplitCoreFixture(t,{zero:true});const complete=await f.withCoreInput(inspect);
  assert.equal(complete.core.ok,true,JSON.stringify(complete.core.diagnostics));
  const used=complete.core.resources.governance.used.captureBytes;
  const bytes=(descriptor,file)=>f.capture(descriptor,file).bytes.length;
  const evidence=[...f.input.evidence.decisionCaptures,...Object.values(f.beforeCaptures)].reduce((sum,capture)=>sum+capture.bytes.length,0);
  const authorities=['before','candidate'].reduce((sum,side)=>sum+bytes(f.input[side],'subjects/registry.yaml')+bytes(f.input[side],'_identity.yaml'),0);
  const currentAuthorizer=['before','candidate'].reduce((sum,side)=>sum+bytes(f.input[side],'decisions/entries/split-review.yaml'),0);
  const retainedSources=f.input.evidence.decisionCaptures.reduce((sum,capture)=>sum+capture.bytes.length,0);
  const unknownFiles=['decisions/entries/approval.yaml','decisions/entries/split-review.yaml','knowledge/K-000005.md'];
  const protectedOwners=['before','candidate'].reduce((sum,side)=>sum+unknownFiles.reduce((n,file)=>n+bytes(f.input[side],file),0),0);
  const materializedRereads=authorities+currentAuthorizer+protectedOwners;
  assert.equal(used,evidence+authorities+currentAuthorizer+retainedSources+protectedOwners+materializedRereads,
    'each committed capture and materialized correspondence reread owns its actual byte cost independently');
  const fit=await f.withCoreInput(input=>{input.limits={...input.limits,governance:{...input.limits.governance,maxCaptureBytes:used}};return inspect(input);});
  assert.equal(fit.core.ok,true);
  const short=await f.withCoreInput(input=>{input.limits={...input.limits,governance:{...input.limits.governance,maxCaptureBytes:used-1}};return inspect(input);});
  assert.equal(short.core.ok,false);assert.equal(short.candidateGovernance,null);
  assert.equal(short.core.resources.governance.failure.counter,'captureBytes');
});
