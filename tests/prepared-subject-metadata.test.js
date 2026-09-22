import test from 'node:test';
import assert from 'node:assert/strict';
import { finalSubjectMetadataFixture } from './helpers/subject-metadata-fixture.js';
test('actual metadata prepared worker and fresh final registry-only proof',async t=>{
  const f=await finalSubjectMetadataFixture(t,{action:'rename'});
  assert.equal(f.gate.ok,true,JSON.stringify(f.gate.diagnostics));
  assert.equal(f.retained.artifacts.some(row=>row.file==='checks/operation/event.yaml'),false);
  const {runFinalPreparedSubjectMetadataGate}=await import('../payload/engine/lib/final-prepared-subject-metadata.js');
  const final=await runFinalPreparedSubjectMetadataGate(f.finalInput);
  assert.equal(final.status,'passed',JSON.stringify(final));
});

test('actual metadata review and candidate-ref publication',async t=>{
  const {subjectMetadataReviewFixture}=await import('./helpers/subject-metadata-fixture.js');
  const f=await subjectMetadataReviewFixture(t,{action:'relate'});
  const {recordApprovedCandidateReview}=await import('../payload/engine/lib/candidate-review.js');
  const {publishPreparedCandidate}=await import('../payload/engine/lib/publish-prepared-candidate.js');
  const saved=await recordApprovedCandidateReview(f.writer());
  assert.equal(saved.status,'retained',JSON.stringify(saved));
  const published=await publishPreparedCandidate(f.publisher(saved));
  assert.equal(published.status,'published',JSON.stringify(published));
  assert.equal(f.git('rev-parse',f.request.publish.outputRef),f.candidate.commit);
});

import { runFinalPreparedSubjectMetadataGate } from '../payload/engine/lib/final-prepared-subject-metadata.js';
import { isPreparedSubjectMetadataReport, capturePreparedSubjectMetadata } from '../payload/engine/lib/prepared-subject-metadata.js';
import { subjectMetadataEvidenceVariant } from './helpers/subject-metadata-fixture.js';
import { canonicalJsonBytes, canonicalSha256 } from '../payload/engine/lib/canonical-json.js';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';

test('actual SHA256 nested clarify retained controls and failed fresh cleanup',async t=>{
  const f=await finalSubjectMetadataFixture(t,{action:'clarify',objectFormat:'sha256',nested:true});
  const final=await runFinalPreparedSubjectMetadataGate(f.finalInput);assert.equal(final.status,'passed',JSON.stringify(final));
  const expected={source:f.source,candidate:f.candidate},wire=f.operationInputs.gateInput;
  assert.equal(isPreparedSubjectMetadataReport(f.gate,expected,wire),true);
  for(const attack of [gate=>{gate.impacts.representativeReplays.policy.id='retirement-replay-v1';},gate=>{gate.assignmentAssessment.reason='zero-effective-direct-use';},
    gate=>{gate.operation.action='retire';},gate=>{gate.preservation.proof.changedPaths=[];gate.preservation.proofDigest=canonicalSha256(gate.preservation.proof);},
    gate=>{gate.resources.governance.used.captureBytes=Number.MAX_SAFE_INTEGER;}]){
    const changed=structuredClone(f.gate);attack(changed);assert.equal(isPreparedSubjectMetadataReport(changed,expected,wire),false);
  }
  const captured=f.retained.artifacts.find(row=>row.file==='checks/operation/registry.yaml');
  const args={root:f.root,...expected,gate:f.gate,gateInput:wire,captureLimits:{maxRegistryBytes:captured.size}};
  assert.deepEqual(capturePreparedSubjectMetadata(args).registry,captured.bytes);
  assert.throws(()=>capturePreparedSubjectMetadata({...args,captureLimits:{maxRegistryBytes:captured.size-1}}));
  for(const file of ['input.json','capture-limits.json']){
    const deep=Buffer.from('{"extra":'+ '['.repeat(12000)+'0'+']'.repeat(12000)+'}');
    const variant=subjectMetadataEvidenceVariant(f,rows=>{rows.find(row=>row.file===`checks/operation/${file}`).bytes=deep;});
    const failed=await runFinalPreparedSubjectMetadataGate(variant);assert.equal(failed.status,'failed');
  }
  const remove=fs.rmSync;let injected=false;
  fs.rmSync=(path,options)=>{remove(path,options);if(!injected&&/\/final-subject-metadata-[^/]+$/.test(String(path))){injected=true;const error=new Error('one-shot final cleanup');error.errno=-13;throw error;}};
  syncBuiltinESMExports();let failed;
  try{failed=await runFinalPreparedSubjectMetadataGate(f.finalInput);}finally{fs.rmSync=remove;syncBuiltinESMExports();}
  assert.equal(injected,true);assert.equal(failed.gate.ok,true);assert.equal(failed.status,'failed');
  assert.ok(failed.diagnostics.some(row=>row.code==='metadata-cleanup-failed'));
});

test('actual failed owner retains exact exit1 diagnostic bytes and no authority artifacts',async t=>{
  const f=await finalSubjectMetadataFixture(t,{candidateChange:h=>{h.input.limits.replays.maxCases=0;}});
  assert.equal(f.gate.ok,false);
  const operation=f.retained.report.checks.find(row=>row.id==='operation');
  assert.equal(operation.exitCode,1);assert.equal(operation.completion,'complete');assert.equal(operation.status,'failed');
  const result=f.retained.artifacts.find(row=>row.file==='checks/operation/result');
  const stdout=f.retained.artifacts.find(row=>row.file==='checks/operation/stdout');
  assert.deepEqual(result.bytes,stdout.bytes);
  assert.equal(f.retained.artifacts.some(row=>['registry.yaml','identity.yaml','event.yaml'].some(name=>row.file===`checks/operation/${name}`)),false);
  assert.equal((await runFinalPreparedSubjectMetadataGate(f.finalInput)).status,'failed');
});
