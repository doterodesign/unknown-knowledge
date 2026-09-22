import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { subjectSplitCoreFixture } from './helpers/subject-split-core-fixture.js';
import { inspectSubjectSplitAssignmentScope as inspect } from '../payload/engine/lib/subject-split-core.js';
import { captureCommittedFile } from '../payload/engine/lib/captured-source.js';

function refused(bundle,code) {
  assert.equal(bundle.core.ok,false,JSON.stringify(bundle.core.diagnostics));
  assert.equal(bundle.candidateGovernance,null);
  assert.notEqual(bundle.core.authoredReferenceClosure.status,'complete');
  if(code) assert.equal(bundle.core.diagnostics[0]?.code,code,JSON.stringify(bundle.core.diagnostics));
}

test('actual scope independently refuses incomplete reviewed sets and wrong event intent',async t=>{
  const f=subjectSplitCoreFixture(t,{historical:true,inherited:'introduced'});
  for(const [name,mutate,code] of [
    ['missing effective owner',op=>op.mappings.pop(),'split-mapping-scope'],
    ['extra effective owner',op=>op.mappings.push({ref:f.ref('K-000004'),successors:[],reason:'extra'}),'split-mapping-scope'],
    ['duplicate effective owner',op=>op.mappings.push(op.mappings[0]),'split-mapping-scope'],
    ['null intent with actual use',op=>{op.assignmentEvent=null;},'split-assignment-event-intent'],
    ['permuted successor subset',op=>op.mappings[2].successors.reverse(),'split-mapping-order'],
    ['missing unknown',op=>op.retainedUnknowns.pop(),'split-unknown-scope'],
    ['known state is not unknown',op=>op.retainedUnknowns.push({ref:f.ref('K-000006'),reason:'not absent'}),'split-unknown-scope'],
    ['missing historical',op=>{op.retainedHistoricalUses=[];},'split-historical-scope'],
    ['missing parent',op=>{op.retainedParents=[];},'split-parent-scope'],
    ['missing inherited',op=>op.retainedInheritedUses.pop(),'split-inherited-scope'],
    ['duplicate inherited',op=>op.retainedInheritedUses.push(op.retainedInheritedUses[0]),'split-inherited-scope'],
    ['extra inherited',op=>op.retainedInheritedUses.push({ref:f.ref('K-000001'),assignedSubject:'S-000002',reason:'absent'}),'split-inherited-scope'],
    ['missing successor parent',op=>op.successorParents.pop(),'split-successor-parent-scope'],
    ['wrong successor parent',op=>{op.successorParents[0].parent=null;},'split-successor-parent-mismatch'],
  ]) await t.test(name,async()=>{
    const b=await f.withCoreInput(input=>{input.operation=structuredClone(input.operation);mutate(input.operation);return inspect(input);});
    refused(b,code);
  });
});

test('zero scope refuses nonnull event intent even with an empty mapping request',async t=>{
  const f=subjectSplitCoreFixture(t,{zero:true});
  const b=await f.withCoreInput(input=>{input.operation={...input.operation,assignmentEvent:{id:'c2000000-0000-4000-8000-000000000001',changeDigest:'a'.repeat(64)}};return inspect(input);});
  refused(b,'split-assignment-event-intent');
});

test('original actual before pair is mandatory once and cannot borrow another source or path',async t=>{
  const f=subjectSplitCoreFixture(t);
  for(const [name,mutate] of [
    ['missing',e=>{e.assessmentCaptures=[];}],
    ['duplicate',e=>e.assessmentCaptures.push(e.assessmentCaptures[0])],
    ['false registry tree',e=>{e.assessmentCaptures[0].registry.capture.source.tree=f.input.candidate.tree;}],
    ['false identity tree',e=>{e.assessmentCaptures[0].identity.capture.source.tree=f.input.candidate.tree;}],
    ['other registry path',e=>{e.assessmentCaptures[0].registry.capture.file='subjects/other.yaml';}],
    ['other identity path',e=>{e.assessmentCaptures[0].identity.capture.file='other-identity.yaml';}],
  ]) await t.test(name,async()=>{
    const b=await f.withCoreInput(input=>{
      input.evidence={...input.evidence,assessmentCaptures:input.evidence.assessmentCaptures.map(pair=>({
        registry:{...pair.registry,capture:structuredClone(pair.registry.capture)},identity:{...pair.identity,capture:structuredClone(pair.identity.capture)}}))};
      mutate(input.evidence);return inspect(input);
    });
    refused(b,'split-original-before-pair'); assert.equal(b.core.resources.allocation,null);
  });
});

for(const valid of [false,true]) test(`actual zero review ${valid?'verifies':'refuses false'} source tree despite matching evidence bytes`,async t=>{
  let actual;
  const f=subjectSplitCoreFixture(t,{zero:true,nested:true,candidateChange({root,git,input,activation,split,rebuild}){
    actual=captureCommittedFile({repoRoot:root,commit:git('rev-parse','HEAD'),file:split.review.decisionCapture.file});
    const capture=structuredClone(actual.locator); if(!valid) capture.source.tree=git('rev-parse','HEAD:unknown-knowledge/decisions');
    for(const event of [activation,split]) event.review.decisionCapture=structuredClone(capture);
    input.evidence.decisionCaptures.push({capture,bytes:actual.bytes,objectFormat:actual.objectFormat});rebuild();
  }});
  const b=await f.withCoreInput(inspect);
  if(valid) {assert.equal(b.core.ok,true,JSON.stringify(b.core.diagnostics));assert.deepEqual(b.core.decision.decisionCapture,actual.locator);}
  else {refused(b,'split-authorizer-source');assert.equal(b.core.inventory,null);assert.equal(b.core.decision,null);assert.ok(b.core.allocation);}
});

for(const [name,options,code] of [
  ['unknown whole file',{candidateChange({put,read}){put('knowledge/K-000005.md',`${read('knowledge/K-000005.md')}\nAdditional text\n`);}},'split-retained-owner-changed'],
  ['historical whole file',{historical:true,candidateChange({put,read}){put('knowledge/K-000004.md',`${read('knowledge/K-000004.md')}\nAdditional text\n`);}},'split-retained-owner-changed'],
  ['unselected known assignment',{candidateChange({editKnowledge}){editKnowledge('knowledge/K-000006.md',record=>{record.subjects=['S-000003'];});}},'split-unselected-assignment-changed'],
  ['selected raw order',{candidateChange({editKnowledge}){editKnowledge('knowledge/K-000003.md',record=>{record.subjects=['S-000004','S-000005','S-000002','S-000003'];});}},'split-assignment-substitution'],
  ['proposal direct source',{beforeChange({editKnowledge}){editKnowledge('knowledge/draft.md',record=>{record.subjects=['S-000001'];});}},'split-source-use-unsupported'],
  ['proposal inherited source',{inherited:'retained',beforeChange({editKnowledge}){editKnowledge('knowledge/draft.md',record=>{record.subjects=['S-000002'];});}},'split-inherited-use-unsupported'],
  ['authorizer whole file',{candidateChange({put,read}){put('decisions/entries/split-review.yaml',`${read('decisions/entries/split-review.yaml')}\n`);}},'split-authorizer-changed'],
  ['registry mode',{candidateChange({kitRoot}){chmodSync(join(kitRoot,'subjects/registry.yaml'),0o755);}},'split-file-mode-changed'],
  ['identity mode',{candidateChange({kitRoot}){chmodSync(join(kitRoot,'_identity.yaml'),0o755);}},'split-file-mode-changed'],
]) test(`actual split refuses changed ${name}`,async t=>{
  const f=subjectSplitCoreFixture(t,options);refused(await f.withCoreInput(inspect),code);
});

test('actual descriptor and materialization mismatch cannot retain a candidate handle',async t=>{
  const f=subjectSplitCoreFixture(t);
  await t.test('false committed tree',async()=>refused(await f.withCoreInput(input=>{
    input.candidate.descriptor={...input.candidate.descriptor,tree:input.before.descriptor.tree};return inspect(input);
  }),'split-tree-mismatch'));
  await t.test('materialized registry bytes',async()=>refused(await f.withCoreInput(input=>{
    appendFileSync(join(input.candidate.root,'subjects/registry.yaml'),'\n');return inspect(input);
  }),'split-file-membership'));
});

for(const [name,change] of [
  ['original definition',({split,rebuild})=>{split.rows[0].after.definition.text='A different original meaning';rebuild();}],
  ['prior registry history',({document,rebuild})=>{document.history[0].reason='Rewritten original reason';rebuild();}],
  ['extra allocation',({identity,rebuild})=>{identity.allocations.push({id:'S-000006',kind:'subject',state:'allocated',publication:{id:'a1000000-0000-4000-8000-000000000003',review:'review:split'}});rebuild();}],
  ['allocation publication',({identity,rebuild})=>{identity.allocations.at(-1).publication.review='review:other';rebuild();}],
  ['selected authorizer lifecycle',({read,put})=>{const doc=JSON.parse(read('decisions/entries/split-review.yaml'));doc.entries[0].status='archived';put('decisions/entries/split-review.yaml',doc);}],
  ['mapped owner lifecycle',({editKnowledge})=>editKnowledge('knowledge/K-000001.md',record=>{record.facets.stage='draft';})],
]) test(`actual split core refuses changed ${name} through fixed model and scope checks`,async t=>{
  const f=subjectSplitCoreFixture(t,{candidateChange:change});refused(await f.withCoreInput(inspect));
});
