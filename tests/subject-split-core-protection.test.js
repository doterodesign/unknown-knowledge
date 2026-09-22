import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { subjectSplitCoreFixture } from './helpers/subject-split-core-fixture.js';
import { inspectSubjectSplitAssignmentScope as inspect } from '../payload/engine/lib/subject-split-core.js';
import { sealAssignmentEvent } from './helpers/assignment-event-fixture.js';
import { describeCandidateBytes } from '../payload/engine/lib/captured-source.js';

const refused=(b,code)=>{
  assert.equal(b.core.ok,false,JSON.stringify(b.core.diagnostics));assert.equal(b.candidateGovernance,null);
  if(code) assert.equal(b.core.diagnostics[0]?.code,code,JSON.stringify(b.core.diagnostics));
};
const order=(a,b)=>JSON.stringify([a.ref.namespace,a.ref.kind,a.ref.id])<JSON.stringify([b.ref.namespace,b.ref.kind,b.ref.id])?-1:1;

for(const kind of ['ontology','decision']) for(const disposition of ['unknown','historical','empty']) {
  test(`grouped ${kind} ${disposition} sibling retains its exact protection rule`,async t=>{
    let sibling;
    const f=subjectSplitCoreFixture(t,{kinds:[kind],knowledgePresent:false,beforeChange({owners,read,put,ledger,ref}){
      const file=owners[0].file;const doc=JSON.parse(read(file));
      const row={...doc.entries[0],id:kind==='ontology'?'O-000004':'D-000006',subjects:[]};
      if(disposition==='unknown') delete row.subjects;
      if(disposition==='historical') {row.subjects=['S-000001'];row.status=kind==='ontology'?'deprecated':'archived';}
      sibling={ref:ref(row.id,kind),reason:'Retain original sibling'};doc.entries.push(row);put(file,doc);
      ledger.allocations.push({id:row.id,kind,state:'allocated',publication:{id:'b2000000-0000-4000-8000-000000000001',review:'review:existing-owners'}});put('_identity.yaml',ledger);
      const catalogFile=`${kind==='ontology'?'ontology':'decisions'}/_catalog.yaml`;const catalog=JSON.parse(read(catalogFile));
      catalog.entries.push({id:row.id,title:row.term??row.title,file:kind==='ontology'?'classes/split-owners.yaml':'entries/split-owners.yaml'});put(catalogFile,catalog);
    },candidateChange({operation}){
      if(disposition==='unknown') operation.retainedUnknowns.push(sibling);
      if(disposition==='historical') operation.retainedHistoricalUses.push(sibling);
      operation.retainedUnknowns.sort(order);
    }});
    const b=await f.withCoreInput(inspect);
    if(disposition==='empty') {
      assert.equal(b.core.ok,true,JSON.stringify(b.core.diagnostics));
      const records=b.core.inventory.records.filter(row=>row.ref?.id===sibling.ref.id);
      assert.equal(records.length,2);assert.deepEqual(records.map(row=>row.assignments),[{state:'known',ids:[]},{state:'known',ids:[]}]);
    } else refused(b,'split-retained-owner-changed');
  });
}

for(const kind of ['ontology','decision']) test(`separate inactive ${kind} original retains literal source history`,async t=>{
  let retained;
  const f=subjectSplitCoreFixture(t,{kinds:[kind],knowledgePresent:false,beforeChange({owners,read,put,ledger,ref}){
    const original=JSON.parse(read(owners[0].file)).entries[0];const id=kind==='ontology'?'O-000004':'D-000006';
    const file=`${kind==='ontology'?'ontology/classes':'decisions/entries'}/old-history.yaml`;
    put(file,{'schema-version':2,entries:[{...original,id,subjects:['S-000001'],status:kind==='ontology'?'deprecated':'archived'}]});
    ledger.allocations.push({id,kind,state:'allocated',publication:{id:'b2000000-0000-4000-8000-000000000001',review:'review:existing-owners'}});put('_identity.yaml',ledger);
    const catalogFile=`${kind==='ontology'?'ontology':'decisions'}/_catalog.yaml`;const catalog=JSON.parse(read(catalogFile));
    catalog.entries.push({id,title:'Retained inactive history',file:kind==='ontology'?'classes/old-history.yaml':'entries/old-history.yaml'});put(catalogFile,catalog);
    retained={ref:ref(id,kind),reason:'Retain the inactive original use'};
  },candidateChange({operation}){operation.retainedHistoricalUses.push(retained);}});
  const b=await f.withCoreInput(inspect);assert.equal(b.core.ok,true,JSON.stringify(b.core.diagnostics));
  const row=b.core.authoredReferenceClosure.retainedHistoricalUses[0];assert.deepEqual(row.ref,retained.ref);
  assert.equal(row.beforeRecord.lifecycle.state,'non-effective');assert.equal(row.candidateRecord.capture.blob,row.beforeRecord.capture.blob);
  assert.deepEqual(row.candidateRecord.assignments,{state:'known',ids:['S-000001']});
});

test('the selected authorizer cannot share a file changed by a mapped Decision sibling',async t=>{
  const f=subjectSplitCoreFixture(t,{kinds:['decision'],knowledgePresent:false,beforeChange({owners,read,put}){
    const selected=JSON.parse(read('decisions/entries/split-review.yaml'));
    const ownerDoc=JSON.parse(read(owners[0].file));selected.entries.push(...ownerDoc.entries);put('decisions/entries/split-review.yaml',selected);
    // Leave the old physical file as an uncataloged empty document; no duplicate owners.
    put(owners[0].file,{'schema-version':2,entries:[]});
    const catalog=JSON.parse(read('decisions/_catalog.yaml'));
    for(const owner of owners) {catalog.entries.find(row=>row.id===owner.ref.id).file='entries/split-review.yaml';owner.file='decisions/entries/split-review.yaml';}
    put('decisions/_catalog.yaml',catalog);
  },candidateChange({input,capture,git,activation,split,rebuild}){
    const descriptor={commit:git('rev-parse','HEAD')};
    const actual=capture(descriptor,'decisions/entries/split-review.yaml');
    for(const event of [activation,split]) event.review.decisionCapture=structuredClone(actual.capture);
    input.evidence.decisionCaptures.push(actual);rebuild();
  }});
  refused(await f.withCoreInput(inspect),'split-authorizer-changed');
});

test('unknown proposal remains absent while known-empty canonical owners are not unknown',async t=>{
  let proposal;
  const f=subjectSplitCoreFixture(t,{zero:true,beforeChange({editKnowledge}){
    editKnowledge('knowledge/draft.md',record=>{delete record.subjects;proposal=record.id;});
  },candidateChange({operation,ref}){
    operation.retainedUnknowns.push({proposalRef:{namespace:ref('K-000001').namespace,kind:'knowledge',key:proposal},reason:'Keep the original unpublished unknown'});
  }});
  const b=await f.withCoreInput(inspect);assert.equal(b.core.ok,true,JSON.stringify(b.core.diagnostics));
  assert.ok(b.core.authoredReferenceClosure.retainedUnknowns.some(row=>row.proposalRef?.key===proposal));
  refused(await f.withCoreInput(input=>{input.operation=structuredClone(input.operation);input.operation.retainedUnknowns.push({ref:f.ref('K-000001'),reason:'Empty is not unknown'});return inspect(input);}),
    'split-unknown-scope');
});

for(const zero of [false,true]) test(`actual prior no-op classification history validates before split, zero=${zero}`,async t=>{
  let priorEvent;let baseline;let seed;
  const f=subjectSplitCoreFixture(t,{zero,beforeChange({owners,commit,capture,put,read,split}){
    seed=commit('original owners for prior assignment evidence');const owner=owners[0];const actual=capture(seed,owner.file);
    const row={ref:owner.ref,before:{state:'known',ids:owner.before},after:{state:'known',ids:owner.before},
      'before-revision':0,'after-revision':0,disposition:'unchanged',reason:'Retain existing authored classification',
      'before-capture':actual.capture,'after-capture':describeCandidateBytes({file:actual.capture.file,bytes:Buffer.from(read(owner.file)),objectFormat:actual.objectFormat})};
    priorEvent=sealAssignmentEvent({'schema-version':2,event:'44444444-4444-4444-8444-444444444444',namespace:owner.ref.namespace,
      operation:'existing-subjects',scope:{kind:'typed-records',refs:[owner.ref]},
      'before-input':{commit:seed.commit,tree:seed.tree,'kit-path':seed.kitPath},decision:split.decision,
      review:{reference:split.review.reference,'accepted-status':split.review.acceptedStatus,'decision-capture':split.review.decisionCapture,
        'decision-digest':split.review.decisionDigest},rows:[row]});
    baseline={'schema-version':1,namespace:owner.ref.namespace,baselines:[{ref:owner.ref,state:row.before,capture:actual.capture}]};
    put('subjects/_assignments/_baselines.yaml',baseline);put(`subjects/_assignments/${priorEvent.event}.yaml`,priorEvent);
  },candidateChange({input,owners,operation,split,read,put,capture}){
    if(zero) return;
    const rows=operation.mappings.map(mapping=>{
      const owner=owners.find(row=>row.ref.id===mapping.ref.id);const actual=capture(input.before,owner.file);
      return {ref:mapping.ref,before:{state:'known',ids:owner.before},
        after:{state:'known',ids:owner.before.flatMap(id=>id===operation.subject?mapping.successors:[id])},
        'before-revision':0,'after-revision':1,disposition:'changed',reason:mapping.reason,'before-capture':actual.capture,
        'after-capture':describeCandidateBytes({file:actual.capture.file,bytes:Buffer.from(read(owner.file)),objectFormat:actual.objectFormat})};
    });
    const baselineNext=structuredClone(baseline);
    baselineNext.baselines.push(...rows.slice(1).map(row=>({ref:row.ref,state:row.before,capture:row['before-capture']})));
    const event=sealAssignmentEvent({'schema-version':2,event:operation.assignmentEvent.id,namespace:split.decision.namespace,
      operation:'subject-use-transition',scope:{kind:'subject-use-transition',operation:operation.id,action:'split',subject:operation.subject,
        successors:operation.successors,'registry-events':operation.registryEvents.map(row=>row.id)},
      'before-input':{commit:input.before.commit,tree:input.before.tree,'kit-path':input.before.kitPath},decision:split.decision,
      review:{reference:split.review.reference,'accepted-status':split.review.acceptedStatus,
        'decision-capture':split.review.decisionCapture,'decision-digest':split.review.decisionDigest},rows});
    operation.assignmentEvent.changeDigest=event.review['change-digest'];
    put('subjects/_assignments/_baselines.yaml',baselineNext);put(`subjects/_assignments/${event.event}.yaml`,event);
  }});
  const b=await f.withCoreInput(inspect);assert.equal(b.core.ok,true,JSON.stringify(b.core.diagnostics));
  assert.notEqual(seed.tree,f.input.before.tree);
  for(const file of [...(zero?['subjects/_assignments/_baselines.yaml']:[]),`subjects/_assignments/${priorEvent.event}.yaml`]) {
    assert.deepEqual(f.capture(f.input.before,file).bytes,f.capture(f.input.candidate,file).bytes);
  }
  assert.deepEqual(b.core.registry.beforeCapture,f.beforeCaptures.registry.capture);
  assert.deepEqual(f.activation.refusalAssessment.scope.beforeRegistry.capture,f.beforeCaptures.registry.capture);
});

test('actual candidate history missing its required baseline refuses the core',async t=>{
  const f=subjectSplitCoreFixture(t,{zero:true,beforeChange({owners,commit,capture,put,split}){
    const seed=commit('actual original capture for broken chain');const owner=owners[0];const actual=capture(seed,owner.file);
    const event=sealAssignmentEvent({'schema-version':2,event:'44444444-4444-4444-8444-444444444444',namespace:owner.ref.namespace,
      operation:'existing-subjects',scope:{kind:'typed-records',refs:[owner.ref]},'before-input':{commit:seed.commit,tree:seed.tree,'kit-path':seed.kitPath},
      decision:split.decision,review:{reference:split.review.reference,'accepted-status':split.review.acceptedStatus,
        'decision-capture':split.review.decisionCapture,'decision-digest':split.review.decisionDigest},rows:[{
          ref:owner.ref,before:{state:'known',ids:owner.before},after:{state:'known',ids:owner.before},'before-revision':0,'after-revision':0,
          disposition:'unchanged',reason:'An event cannot substitute for its adoption baseline','before-capture':actual.capture,
          'after-capture':describeCandidateBytes({file:actual.capture.file,bytes:actual.bytes,objectFormat:actual.objectFormat})}]});
    put('subjects/_assignments/_baselines.yaml',{'schema-version':1,namespace:owner.ref.namespace,
      baselines:[{ref:owner.ref,state:{state:'known',ids:owner.before},capture:actual.capture}]});
    put(`subjects/_assignments/${event.event}.yaml`,event);
  },candidateChange({put,ref}){
    put('subjects/_assignments/_baselines.yaml',{'schema-version':1,namespace:ref('K-000001').namespace,baselines:[]});
  }});
  refused(await f.withCoreInput(input=>{
    assert.equal(input.before.model.ok,true);
    assert.ok(input.candidate.model.diagnostics.some(row=>row.code==='missing-baseline'));
    return inspect(input);
  }),'split-model-unavailable');
});

test('temporary actual snapshots are cleaned after both core success and refusal',async t=>{
  const f=subjectSplitCoreFixture(t);const roots=[];
  for(const fail of [false,true]) {
    const b=await f.withCoreInput(input=>{
      roots.push(input.before.root,input.candidate.root);
      if(fail) input.operation={...input.operation,assignmentEvent:null};
      return inspect(input);
    });
    assert.equal(b.core.ok,!fail);for(const root of roots) assert.equal(existsSync(root),false);
  }
});
