import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from 'js-yaml';
import { subjectSplitCoreFixture } from './helpers/subject-split-core-fixture.js';
import { validateTypedAssignmentPreservation } from '../payload/engine/lib/assignment-preservation.js';
import { inspectSubjectSplitAssignmentScope } from '../payload/engine/lib/subject-split-core.js';
import { changedTreePaths } from '../payload/engine/lib/commit-snapshot.js';
import { canonicalSha256 } from '../payload/engine/lib/canonical-json.js';

const oldNote={type:'revision',date:'2026-09-19',text:'Original retained note'};
const newNote={type:'revision',date:'2026-09-20',text:'Independently authored classification note'};
const body=text=>text.split('---\n').slice(2).join('---\n');

test('block split fixture provides supported actual K/O/D preservation spans',t=>{
  const f=subjectSplitCoreFixture(t,{recordFormat:'block',kinds:['knowledge','ontology','decision']});
  for(const file of new Set(f.owners.map(owner=>owner.file))) {
    const owners=f.owners.filter(owner=>owner.file===file);
    const checked=validateTypedAssignmentPreservation({kind:owners[0].ref.kind,file,
      beforeBytes:f.capture(f.input.before,file).bytes,candidateBytes:f.capture(f.input.candidate,file).bytes,
      rows:owners.map(owner=>({ref:owner.ref,reviewNote:null}))});
    assert.equal(checked.ok,true,`${file}: ${JSON.stringify(checked.diagnostics)}`);
  }
});

test('block hooks preserve Knowledge body and literal block-note prefix',t=>{
  let originalBody;
  const f=subjectSplitCoreFixture(t,{recordFormat:'block',beforeChange({read,put,editKnowledge}){
    assert.match(read('knowledge/K-000001.md'),/^---\nschema-version: 3\n/);
    put('knowledge/K-000001.md',`${read('knowledge/K-000001.md')}\nLiteral π body\n---\nTrailing section\n`);
    originalBody=body(read('knowledge/K-000001.md'));
    editKnowledge('knowledge/K-000001.md',record=>{record.notes=[oldNote];});
    assert.equal(body(read('knowledge/K-000001.md')),originalBody);
    assert.ok(read('knowledge/K-000001.md').includes(`notes:\n  - ${JSON.stringify(oldNote)}\n`));
  },candidateChange({editKnowledge}){
    editKnowledge('knowledge/K-000001.md',record=>{record.notes.push(newNote);});
  }});
  const before=f.capture(f.input.before,'knowledge/K-000001.md').bytes;
  const candidate=f.capture(f.input.candidate,'knowledge/K-000001.md').bytes;
  assert.equal(body(before.toString()),originalBody);assert.equal(body(candidate.toString()),originalBody);
  assert.ok(candidate.toString().includes(`notes:\n  - ${JSON.stringify(oldNote)}\n  - ${JSON.stringify(newNote)}\n`));
  const checked=validateTypedAssignmentPreservation({kind:'knowledge',file:'knowledge/K-000001.md',beforeBytes:before,candidateBytes:candidate,
    rows:[{ref:f.ref('K-000001'),reviewNote:newNote}]});
  assert.equal(checked.ok,true,JSON.stringify(checked.diagnostics));
});

for(const kind of ['ontology','decision']) test(`block editEntries preserves an unselected ${kind} sibling's exact bytes`,async t=>{
  let sibling;
  const f=subjectSplitCoreFixture(t,{recordFormat:'block',kinds:[kind],knowledgePresent:false,
    beforeChange({owners,read,editEntries}){
      sibling=owners.pop();assert.match(read(sibling.file),/^schema-version: 2\nentries:\n  - id:/);
      editEntries(sibling.file,entries=>{const row=entries.find(row=>row.id===sibling.ref.id);row.subjects=[];
        if(kind==='ontology') row.summary='Exact original sibling π';else row.context='Exact original sibling π';});
    },candidateChange({editEntries}){
      editEntries(sibling.file,entries=>{assert.deepEqual(entries.find(row=>row.id===sibling.ref.id).subjects,[]);});
    }});
  const before=f.capture(f.input.before,sibling.file).bytes;const candidate=f.capture(f.input.candidate,sibling.file).bytes;
  const needle=`  - id: ${JSON.stringify(sibling.ref.id)}\n`;
  assert.equal(before.toString().slice(before.toString().indexOf(needle)),candidate.toString().slice(candidate.toString().indexOf(needle)));
  const checked=validateTypedAssignmentPreservation({kind,file:sibling.file,beforeBytes:before,candidateBytes:candidate,
    rows:f.owners.map(owner=>({ref:owner.ref,reviewNote:null}))});
  assert.equal(checked.ok,true,JSON.stringify(checked.diagnostics));
  const b=await f.withCoreInput(inspectSubjectSplitAssignmentScope);assert.equal(b.core.ok,true,JSON.stringify(b.core.diagnostics));
  assert.equal(b.core.assignments.length,2);
});

for(const [objectFormat,nested,zero] of [['sha1',false,false],['sha256',true,false],['sha256',true,true]]) {
  test(`block ${objectFormat} ${nested?'nested':'root'} ${zero?'zero':'positive'} keeps one exact final before pair`,async t=>{
    const f=subjectSplitCoreFixture(t,{recordFormat:'block',objectFormat,nested,zero,kinds:['knowledge','ontology','decision']});
    assert.equal(f.input.evidence.assessmentCaptures.length,1);assert.equal(f.input.evidence.assessmentCaptures[0],f.beforeCaptures);
    const source={commit:f.input.before.commit,tree:f.input.before.tree};
    for(const [part,file] of [['registry','subjects/registry.yaml'],['identity','_identity.yaml']]) {
      assert.deepEqual(f.beforeCaptures[part].capture.source,source);
      const actual=f.capture(f.input.before,file);assert.deepEqual(f.beforeCaptures[part],actual);
      assert.equal(actual.capture.blob.length,objectFormat==='sha256'?64:40);
    }
    assert.deepEqual(f.activation.refusalAssessment.scope.beforeRegistry.capture,f.beforeCaptures.registry.capture);
    const result=await f.withCoreInput(input=>{
      assert.equal(f.activation.refusalAssessment.scope.beforeRegistry.documentDigest,canonicalSha256(input.before.model.subjectRegistry.document));
      assert.equal(f.activation.refusalAssessment.scope.identityDigest,canonicalSha256(input.before.model.identity));
      return inspectSubjectSplitAssignmentScope(input);
    });
    assert.equal(result.core.ok,true,JSON.stringify(result.core.diagnostics));
    for(const file of new Set(f.owners.map(owner=>owner.file))) {
      const owners=f.owners.filter(owner=>owner.file===file);const before=f.capture(f.input.before,file).bytes;const candidate=f.capture(f.input.candidate,file).bytes;
      const checked=validateTypedAssignmentPreservation({kind:owners[0].ref.kind,file,beforeBytes:before,candidateBytes:candidate,
        rows:owners.map(owner=>({ref:owner.ref,reviewNote:null}))});assert.equal(checked.ok,true,JSON.stringify(checked.diagnostics));
      if(zero) assert.deepEqual(candidate,before);
    }
    if(zero) {
      const prefix=nested?'unknown-knowledge/':'';
      assert.deepEqual(changedTreePaths(f.root,f.input.before.tree,f.input.candidate.tree),[`${prefix}_identity.yaml`,`${prefix}subjects/registry.yaml`]);
      assert.equal(f.operation.assignmentEvent,null);assert.deepEqual(result.core.assignments,[]);
    }
  });
}

test('default JSON owners remain byte-identical to explicit json mode',t=>{
  const defaultFixture=subjectSplitCoreFixture(t,{kinds:['knowledge','ontology','decision']});
  const explicitFixture=subjectSplitCoreFixture(t,{recordFormat:'json',kinds:['knowledge','ontology','decision']});
  for(const file of new Set(defaultFixture.owners.map(owner=>owner.file))) for(const side of ['before','candidate']) {
    const original=defaultFixture.capture(defaultFixture.input[side],file).bytes;
    assert.deepEqual(explicitFixture.capture(explicitFixture.input[side],file).bytes,original);
    const text=original.toString();assert.doesNotThrow(()=>JSON.parse(file.endsWith('.md')?text.split('---\n')[1]:text));
  }
});

test('JSON editEntries roundtrips the original formatter without changing unrelated fields',t=>{
  const f=subjectSplitCoreFixture(t,{kinds:['ontology'],beforeChange({owners,read,editEntries}){
    const file=owners[0].file;const before=read(file);editEntries(file,entries=>assert.equal(entries.length,3));
    assert.equal(read(file),before);
  }});
  assert.deepEqual(load(f.read(f.owners[0].file)).entries.map(row=>row.subjects),[[],['S-000003','S-000004'],['S-000002','S-000004','S-000005','S-000003']]);
});

test('fixture recordFormat rejects unknown modes before creating a repository',t=>{
  assert.throws(()=>subjectSplitCoreFixture(t,{recordFormat:'yaml'}),/recordFormat must be json or block/);
});
