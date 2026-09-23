import test from 'node:test';
import assert from 'node:assert/strict';
import { repeatedEquivalentMergeFixture } from './helpers/repeated-equivalent-merge-fixture.js';
import { runPreparedEquivalentMergeGate } from '../payload/engine/lib/subject-equivalent-merge-gate.js';
for(const zero of [false,true])test(`actual repeated equivalence ${zero?'zero use':'K/O/D'} preserves prior redirect`,async t=>{
 const f=await repeatedEquivalentMergeFixture(t,{zero});
 assert.equal(f.firstGate.ok,true);
 const result=await runPreparedEquivalentMergeGate(f.input);
 assert.equal(result.ok,true,JSON.stringify(result.diagnostics));
 assert.deepEqual(f.document.subjects[0],f.beforeDocument.subjects[0]);
 assert.deepEqual(f.document.history.slice(0,-1),f.beforeDocument.history);
 assert.equal(result.publicationReady,false);
});

import { withTreeSnapshot } from '../payload/engine/lib/commit-snapshot.js';
import { loadSubjectQueryContext } from '../payload/engine/lib/subject-query-context.js';
import { subjectEligibility } from '../payload/engine/lib/subject-governance.js';
import { resolveSubject } from '../payload/engine/lib/subjects.js';
import { canonicalSha256 } from '../payload/engine/lib/canonical-json.js';

test('literal chain lookup, P8 continuity and bounded refusals over actual second candidate',async t=>{
 const f=await repeatedEquivalentMergeFixture(t,{nested:true});
 const report=await runPreparedEquivalentMergeGate(f.input);assert.equal(report.ok,true,JSON.stringify(report.diagnostics));
 assert.deepEqual(f.input.before,f.firstInput.candidate);
 assert.deepEqual([...new Set(report.assignments.rows.map(row=>row.ref.kind))].sort(),['decision','knowledge','ontology']);
 assert.equal(report.assignments.checks.history.status,'passed');
 for(const row of f.assignmentEvent.rows)assert.equal(row['before-revision'],row.ref.id==='K-000003'?0:1);
 const priorEvent=`subjects/_assignments/${f.firstInput.operation.assignmentEvent.id}.yaml`;
 assert.deepEqual(f.capture(f.input.before,priorEvent).bytes,f.capture(f.input.candidate,priorEvent).bytes);
 assert.deepEqual(f.capture(f.input.before,'_identity.yaml').bytes,f.capture(f.input.candidate,'_identity.yaml').bytes);
 await withTreeSnapshot(f.root,f.input.candidate.tree,async snapshot=>{
   const loaded=loadSubjectQueryContext({root:snapshot.root,...f.input.evidence});assert.equal(loaded.ok,true,JSON.stringify(loaded.diagnostics));
   const {subjectGovernance,model}=loaded.context;
   assert.equal(resolveSubject(model.subjectRegistry,'S-000001',{policy:'historical'}).id,'S-000001');
   for(const id of ['S-000001','S-000002']){
     assert.equal(resolveSubject(model.subjectRegistry,id,{policy:'current'}).code,'subject-retired');
     assert.equal(subjectEligibility(subjectGovernance,id,{purpose:'new-assignment',policy:'equivalent'}).eligible,false);
   }
   const exact=subjectEligibility(subjectGovernance,'S-000001',{purpose:'query',policy:'equivalent',budget:{redirects:2}});
   assert.equal(exact.eligible,true);assert.equal(exact.resolution.id,'S-000003');
   assert.deepEqual(exact.resolution.redirects,[{from:'S-000001',to:'S-000002'},{from:'S-000002',to:'S-000003'}]);
   assert.equal(subjectEligibility(subjectGovernance,'S-000001',{purpose:'query',policy:'equivalent',budget:{redirects:1}}).code,'redirect-budget');
 });
 const originalRows=structuredClone(f.assignmentEvent.rows);f.assignmentEvent.rows.pop();f.save();
 assert.equal((await runPreparedEquivalentMergeGate(f.input)).ok,false,'Omitting a real second-step owner cannot shrink P8 scope');
 f.assignmentEvent.rows=originalRows;f.save();
 const small={...f.input,limits:{...f.input.limits,replays:{...f.input.limits.replays,maxEligibilityRedirects:0}}};
 const bounded=await runPreparedEquivalentMergeGate(small);assert.equal(bounded.ok,false);assert.equal(bounded.impacts.representativeReplays.status,'incomplete');
});

test('resealed changes to prior redirects/history and non-equivalence substitutions refuse',async t=>{
 const f=await repeatedEquivalentMergeFixture(t,{zero:true});
 const original=structuredClone(f.document), originalEvent=structuredClone(f.event);
 const mutations=[
   ['flatten',()=>{f.document.subjects[0].retirement.redirect='S-000003';}],
   ['rewrite prior reviewed history',()=>{
     f.document.history[1].rows[0].after.retirement.redirect='S-000003';
     const {review,...body}=f.document.history[1];review.changeDigest=canonicalSha256(body);
     f.document.subjects[0].retirement.redirect='S-000003';
   }],
   ['split alternatives',()=>{f.document.subjects[0].retirement={kind:'split',successors:['S-000002','S-000003']};}],
   ['active redirect origin',()=>{f.document.subjects[0].status='active';}],
   ['redirect cycle',()=>{f.event.rows[0].after.retirement.redirect='S-000001';f.document.subjects[1].retirement.redirect='S-000001';}],
 ];
 for(const [name,mutate]of mutations)await t.test(name,async()=>{
   Object.assign(f.document,structuredClone(original));Object.assign(f.event,structuredClone(originalEvent));f.document.history[f.document.history.length-1]=f.event;
   mutate();f.save();const result=await runPreparedEquivalentMergeGate(f.input);assert.equal(result.ok,false,JSON.stringify(result));
 });
 Object.assign(f.document,structuredClone(original));Object.assign(f.event,structuredClone(originalEvent));f.document.history[f.document.history.length-1]=f.event;f.save();
 const withoutEvidence={...f.input,evidence:{...f.input.evidence,decisionCaptures:[]}};
 assert.equal((await runPreparedEquivalentMergeGate(withoutEvidence)).ok,false,'Missing actual historical authority still refuses');
});

for(const incident of ['parent','association'])test(`valid prior redirect does not waive ${incident} incidence`,async t=>{
 const f=await repeatedEquivalentMergeFixture(t,{zero:true,incident});assert.equal(f.firstGate.ok,true);
 const result=await runPreparedEquivalentMergeGate(f.input);assert.equal(result.ok,false);
 assert.equal(result.diagnostics[0].diagnostics[0].code,'merge-graph-use-unsupported');
});
