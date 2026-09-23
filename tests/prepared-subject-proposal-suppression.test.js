import test from 'node:test';
import assert from 'node:assert/strict';
import { finalSubjectProposalSuppressionFixture, subjectProposalSuppressionReviewFixture } from './helpers/subject-proposal-suppression-fixture.js';
import { recordApprovedCandidateReview } from '../payload/engine/lib/candidate-review.js';
import { publishPreparedCandidate } from '../payload/engine/lib/publish-prepared-candidate.js';

test('actual proposal suppression complete retained/final/review/publication path',async t=>{
  const f=await subjectProposalSuppressionReviewFixture(t);
  assert.equal(f.final.status,'passed',JSON.stringify(f.final));
  assert.equal(f.final.policy.id,'subject-proposal-suppression-publication-v1');
  assert.equal(f.gate.kind,'subject-proposal-suppression-gate');
  const saved=await recordApprovedCandidateReview(f.writer());assert.equal(saved.status,'retained',JSON.stringify(saved));
  const result=await publishPreparedCandidate(f.publisher(saved));assert.equal(result.status,'published',JSON.stringify(result));
  assert.equal(f.git('rev-parse',f.request.publish.outputRef),f.candidate.commit);
});

import { runFinalPreparedSubjectProposalSuppressionGate } from '../payload/engine/lib/final-prepared-subject-metadata.js';
import { isPreparedSubjectMetadataReport, isPreparedSubjectProposalSuppressionReport,
  capturePreparedSubjectProposalSuppression } from '../payload/engine/lib/prepared-subject-metadata.js';
import { subjectProposalSuppressionEvidenceVariant } from './helpers/subject-proposal-suppression-fixture.js';
import { canonicalJsonBytes, canonicalSha256 } from '../payload/engine/lib/canonical-json.js';
import { artifactCapture } from '../payload/engine/lib/prepared-evidence.js';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';

test('actual SHA256 nested suppression retained caps, reseals and final cleanup',async t=>{
  const f=await finalSubjectProposalSuppressionFixture(t,{objectFormat:'sha256',nested:true});
  const final=await runFinalPreparedSubjectProposalSuppressionGate(f.finalInput);
  assert.equal(final.status,'passed',JSON.stringify(final));
  const expected={source:f.source,candidate:f.candidate},wire=f.operationInputs.gateInput;
  assert.equal(isPreparedSubjectProposalSuppressionReport(f.gate,expected,wire),true);
  assert.equal(isPreparedSubjectMetadataReport(f.gate,expected,wire),false);
  for(const attack of [gate=>{gate.kind='subject-metadata-gate';},gate=>{gate.impacts.representativeReplays.policy.id='subject-metadata-replay-v1';},
    gate=>{gate.operation.action='rename';},gate=>{gate.assignments={};},gate=>{gate.resources.governance.used.captureBytes=Number.MAX_SAFE_INTEGER;}]){
    const changed=structuredClone(f.gate);attack(changed);assert.equal(isPreparedSubjectProposalSuppressionReport(changed,expected,wire),false);
  }
  const row=f.retained.artifacts.find(row=>row.file==='checks/operation/registry.yaml');
  const input={root:f.root,...expected,gate:f.gate,gateInput:wire,captureLimits:{maxRegistryBytes:row.size}};
  assert.deepEqual(capturePreparedSubjectProposalSuppression(input).registry,row.bytes);
  assert.throws(()=>capturePreparedSubjectProposalSuppression({...input,captureLimits:{maxRegistryBytes:row.size-1}}));
  const deep=Buffer.from('{"extra":'+'['.repeat(12000)+'0'+']'.repeat(12000)+'}');
  for(const file of ['input.json','capture-limits.json']){
    const altered=subjectProposalSuppressionEvidenceVariant(f,rows=>{rows.find(row=>row.file===`checks/operation/${file}`).bytes=deep;});
    assert.equal((await runFinalPreparedSubjectProposalSuppressionGate(altered)).status,'failed');
  }
  const report=structuredClone(f.gate);report.impacts.representativeReplays.policy.digest='0'.repeat(64);
  assert.equal(isPreparedSubjectProposalSuppressionReport(report,expected,wire),true,'pure shape is not fresh authority');
  const bytes=Buffer.from(JSON.stringify(report)+'\n');
  const retainedReport=structuredClone(f.retained.report);
  const operation=retainedReport.checks.find(row=>row.id==='operation');
  for(const field of ['stdout','result'])operation[field]=artifactCapture(`checks/operation/${field}`,bytes);
  const rebound={...f,finalInput:{...f.finalInput,expected:{...f.finalInput.expected,reportDigest:canonicalSha256(retainedReport)}}};
  const altered=subjectProposalSuppressionEvidenceVariant(rebound,rows=>{
    for(const row of rows)if(['checks/operation/result','checks/operation/stdout'].includes(row.file))row.bytes=bytes;
    rows.find(row=>row.file==='report.json').bytes=canonicalJsonBytes(retainedReport);
  });
  const drift=await runFinalPreparedSubjectProposalSuppressionGate(altered);
  assert.equal(drift.status,'failed');assert.ok(drift.diagnostics.some(row=>row.code==='metadata-fresh-proof-mismatch'),JSON.stringify(drift));
  const remove=fs.rmSync;let injected=false;
  fs.rmSync=(path,options)=>{remove(path,options);if(!injected&&/\/final-subject-metadata-[^/]+$/.test(String(path))){injected=true;const error=new Error('one-shot suppression cleanup');error.errno=-13;throw error;}};
  syncBuiltinESMExports();let failed;
  try{failed=await runFinalPreparedSubjectProposalSuppressionGate(f.finalInput);}finally{fs.rmSync=remove;syncBuiltinESMExports();}
  assert.equal(injected,true);assert.equal(failed.gate.ok,true);assert.equal(failed.status,'failed');
  assert.ok(failed.diagnostics.some(row=>row.code==='metadata-cleanup-failed'));
});

test('suppression valid failed owner retains exact diagnostic bytes and no authority captures',async t=>{
  const f=await finalSubjectProposalSuppressionFixture(t,{candidateChange:h=>{h.input.limits.replays.maxCases=0;}});
  assert.equal(f.gate.ok,false);
  const operation=f.retained.report.checks.find(row=>row.id==='operation');
  assert.equal(operation.exitCode,1);assert.equal(operation.completion,'complete');assert.equal(operation.status,'failed');
  assert.deepEqual(f.retained.artifacts.find(row=>row.file==='checks/operation/result').bytes,
    f.retained.artifacts.find(row=>row.file==='checks/operation/stdout').bytes);
  assert.equal(f.retained.artifacts.some(row=>['registry.yaml','identity.yaml','event.yaml'].some(name=>row.file===`checks/operation/${name}`)),false);
  assert.equal((await runFinalPreparedSubjectProposalSuppressionGate(f.finalInput)).status,'failed');
});
