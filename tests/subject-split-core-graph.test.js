import test from 'node:test';
import assert from 'node:assert/strict';
import { subjectSplitCoreFixture } from './helpers/subject-split-core-fixture.js';
import { inspectSubjectSplitAssignmentScope as inspect } from '../payload/engine/lib/subject-split-core.js';
import { canonicalSha256 } from '../payload/engine/lib/canonical-json.js';
import { registryWire } from './helpers/equivalent-merge-fixture.js';

const state=({id,changes,...row})=>structuredClone(row);
const digest=({review,...event})=>canonicalSha256(event);
function originalRegistry(f,change) {
  const doc=structuredClone(f.beforeModel.subjectRegistry.document);change(doc);
  for(const event of doc.history) event.review.changeDigest=digest(event);
  f.put('subjects/registry.yaml',registryWire(doc));
  const source=doc.subjects.find(row=>row.id==='S-000001');
  f.split.rows[0].before=state(source);
  f.split.rows[0].after={...state(source),status:'retired',retirement:{kind:'split',successors:f.ids}};
}
const refused=(b,code)=>{
  assert.equal(b.core.ok,false,JSON.stringify(b.core.diagnostics));assert.equal(b.candidateGovernance,null);
  if(code) assert.equal(b.core.diagnostics[0]?.code,code,JSON.stringify(b.core.diagnostics));
};

for(const [name,parents] of [['existing active parent',['S-000003']],['fresh parent activated in the same pair',['S-000005']]]) {
  test(`actual split permits ${name} with complete explicit choices`,async t=>{
    const f=subjectSplitCoreFixture(t,{candidateChange({activation,operation,rebuild}){
      activation.rows[0].after.parent=parents[0];operation.successorParents[0].parent=parents[0];rebuild();
    }});
    const b=await f.withCoreInput(inspect);assert.equal(b.core.ok,true,JSON.stringify(b.core.diagnostics));
    const row=b.core.authoredReferenceClosure.successorParents[0];assert.equal(row.parent,parents[0]);assert.equal(row.candidateWitness.target,parents[0]);
    assert.equal(b.core.authoredReferenceClosure.successorParents[1].candidateWitness,null);
  });
}

for(const [name,parents] of [['source',['S-000001']],['self',['S-000004']],['missing',['S-000009']],['cycle',['S-000005','S-000004']]]) {
  test(`actual ${name} successor parent refuses without an invented chain`,async t=>{
    const f=subjectSplitCoreFixture(t,{candidateChange({activation,operation,rebuild}){
      parents.forEach((parent,index)=>{activation.rows[index].after.parent=parent;operation.successorParents[index].parent=parent;});rebuild();
    }});refused(await f.withCoreInput(inspect));
  });
}

test('a parent retired before the pair cannot authorize a fresh successor edge',async t=>{
  const f=subjectSplitCoreFixture(t,{beforeChange(f){originalRegistry(f,doc=>{
    const subject=doc.subjects.find(row=>row.id==='S-000003');
    const after={...state(subject),status:'retired',retirement:{kind:'retire'}};
    const event={id:'66666666-6666-4666-8666-666666666666',action:'retire',decision:doc.history[0].decision,
      reason:'Retire before the split pair',rows:[{id:subject.id,before:state(subject),after}]};
    event.review={...doc.history[0].review,changeDigest:digest(event)};
    doc.history.push(event);doc.revision++;Object.assign(subject,after);subject.changes.push(event.id);
  });},candidateChange({activation,operation,rebuild}){
    activation.rows[0].after.parent='S-000003';operation.successorParents[0].parent='S-000003';rebuild();
  }});refused(await f.withCoreInput(inspect));
});

test('existing incident association is retained literally and explicitly unsupported',async t=>{
  const f=subjectSplitCoreFixture(t,{beforeChange(f){originalRegistry(f,doc=>{
    const related=[{type:'association',target:'S-000003'}];
    doc.subjects.find(row=>row.id==='S-000001').related=related;
    doc.history[0].rows.find(row=>row.id==='S-000001').after.related=structuredClone(related);
  });}});
  refused(await f.withCoreInput(inspect),'split-graph-use-unsupported');
});

test('an actual earlier equivalent redirect into the source is explicitly unsupported',async t=>{
  const f=subjectSplitCoreFixture(t,{beforeChange(f){originalRegistry(f,doc=>{
    const absorbed=doc.subjects.find(row=>row.id==='S-000003');const source=doc.subjects.find(row=>row.id==='S-000001');
    const event={id:'66666666-6666-4666-8666-666666666666',action:'merge-equivalent',decision:doc.history[0].decision,
      reason:'Historical equivalent meaning',rows:[{id:absorbed.id,before:state(absorbed),
        after:{...state(absorbed),status:'retired',retirement:{kind:'equivalent-merge',redirect:source.id}}},
      {id:source.id,before:state(source),after:state(source),reason:'Preserve survivor'}]};
    event.review={...doc.history[0].review,changeDigest:digest(event)};
    for(const row of event.rows) {const subject=doc.subjects.find(item=>item.id===row.id);Object.assign(subject,row.after);subject.changes.push(event.id);}
    doc.history.push(event);doc.revision++;
  });}});refused(await f.withCoreInput(inspect),'split-graph-use-unsupported');
});

for(const [name,edit] of [
  ['disappearing retained witness',record=>{record.subjects=[];}],
  ['unreviewed new successor use',record=>{record.subjects=['S-000004'];}],
]) test(`actual ${name} refuses`,async t=>{
  const f=subjectSplitCoreFixture(t,{inherited:'introduced',candidateChange({editKnowledge}){editKnowledge('knowledge/K-000006.md',edit);}});
  refused(await f.withCoreInput(inspect),'split-unselected-assignment-changed');
});

test('a source-centric request cannot assert a root successor has an inherited source path',async t=>{
  const f=subjectSplitCoreFixture(t,{inherited:'introduced'});
  const b=await f.withCoreInput(input=>{input.operation=structuredClone(input.operation);
    input.operation.retainedInheritedUses.find(row=>row.assignedSubject==='S-000004').assignedSubject='S-000005';return inspect(input);
  });refused(b,'split-inherited-scope');
});
