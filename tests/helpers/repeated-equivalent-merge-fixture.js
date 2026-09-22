/** Actual first merge and retained P8 history, then a literal second reviewed merge. */
import assert from 'node:assert/strict';
import { load as yaml } from 'js-yaml';
import { typedEquivalentMergeFixture } from './typed-equivalent-merge-fixture.js';
import { equivalentMergeZeroFixture } from './equivalent-merge-zero-fixture.js';
import { reviewSubjectMergeMaterialFixture } from './subject-merge-material-fixture.js';
import { registryWire } from './equivalent-merge-fixture.js';
import { loadStores } from '../../payload/engine/lib/load-stores.js';
import { iterateCurrentRecords } from '../../payload/engine/lib/record-identity.js';
import { readAssignments } from '../../payload/engine/lib/subject-assignments.js';
import { canonicalSha256 } from '../../payload/engine/lib/canonical-json.js';
import { captureCommittedFile, describeCandidateBytes } from '../../payload/engine/lib/captured-source.js';
import { runPreparedEquivalentMergeGate } from '../../payload/engine/lib/subject-equivalent-merge-gate.js';
import { sealAssignmentEvent } from './assignment-event-fixture.js';
import { assignmentEventDigest } from '../../payload/engine/lib/assignment-event.js';

const state = ({ id, changes, ...value }) => structuredClone(value);
const grouped = rows => 'schema-version: 2\nentries:\n' + rows.map(row => Object.entries(row)
  .map(([key,value],i) => `${i ? '    ' : '  - '}${key}: ${JSON.stringify(value)}\n`).join('')).join('');
export async function repeatedEquivalentMergeFixture(t, { zero = false, nested = false, incident = null } = {}) {
  const f = zero ? await equivalentMergeZeroFixture(t, { nested, beforeChange({read,put,context}) {
    for (const id of ['K-000001','K-000002','K-000003']) {
      const file=`knowledge/${id}.md`, parts=read(file).split('---'), record=yaml(parts[1]);
      record.subjects=[...new Set(record.subjects.map(id=>id==='S-000002'?'S-000003':id))];
      parts[1]=`\n${JSON.stringify(record)}\n`;put(file,parts.join('---'));
    }
    if(incident){
      assert.ok(['parent','association'].includes(incident));
      const document=structuredClone(context.model.subjectRegistry.document),subject=document.subjects.find(row=>row.id==='S-000003');
      if(incident==='parent'){subject.parent='S-000002';document.hierarchyRevision++;}
      else subject.related=[{type:'association',target:'S-000002'}];
      document.history[0].rows.find(row=>row.id===subject.id).after=state(subject);
      const {review,...body}=document.history[0];review.changeDigest=canonicalSha256(body);
      put('subjects/registry.yaml',registryWire(document));
    }
  } }) : typedEquivalentMergeFixture(t, { nested, beforeChange({put,read}) {
    const file='knowledge/K-000003.md', parts=read(file).split('---\n');
    parts[1]=Object.entries(JSON.parse(parts[1])).map(([key,value])=>`${key}: ${JSON.stringify(value)}\n`).join('');
    put(file,parts.join('---\n'));
  } });
  const firstInput={...structuredClone(f.input),evidence:f.input.evidence}, firstGate=await runPreparedEquivalentMergeGate(firstInput);
  assert.equal(firstGate.ok,true,JSON.stringify(firstGate.diagnostics));
  f.git('read-tree','--reset','-u',firstInput.candidate.commit);
  const before=loadStores(f.kitRoot);assert.equal(before.ok,true,JSON.stringify(before.diagnostics));
  const beforeDocument=structuredClone(before.subjectRegistry.document), document=structuredClone(beforeDocument);
  const input={...structuredClone(firstInput),evidence:firstInput.evidence};input.before=structuredClone(firstInput.candidate);
  Object.assign(input.operation,{id:'44444444-4444-4444-8444-444444444444',absorbed:['S-000002'],survivor:'S-000003',
    registryEvents:[{id:'55555555-5555-4555-8555-555555555555',changeDigest:'0'.repeat(64)}],
    assignmentEvent:zero?null:{id:'66666666-6666-4666-8666-666666666666',changeDigest:'0'.repeat(64)}});
  const source=document.subjects.find(row=>row.id==='S-000002'),survivor=document.subjects.find(row=>row.id==='S-000003');
  const event={id:input.operation.registryEvents[0].id,action:'merge-equivalent',decision:structuredClone(f.event.decision),
    reason:'Second reviewed equivalence preserves the exact earlier redirect',rows:[
      {id:source.id,before:state(source),after:{...state(source),status:'retired',retirement:{kind:'equivalent-merge',redirect:survivor.id}},reason:'Use the reviewed survivor'},
      {id:survivor.id,before:state(survivor),after:state(survivor),reason:'Retain survivor meaning'}]};
  event.review={...f.event.review,reference:'review:second-equivalent-merge',changeDigest:canonicalSha256(event)};
  for(const row of event.rows){const subject=document.subjects.find(s=>s.id===row.id);Object.assign(subject,row.after);subject.changes.push(event.id);}
  document.history.push(event);document.revision++;
  const path=file=>nested?`unknown-knowledge/${file}`:file;
  const capture=(descriptor,file)=>captureCommittedFile({repoRoot:f.root,commit:descriptor.commit,file:path(file)});
  const rows=[],baselineFile='subjects/_assignments/_baselines.yaml';
  const baseline=zero?null:yaml(f.read(baselineFile));
  const byFile=new Map();
  const kinds=[['knowledge','knowledge'],['ontology','ontology'],['decision','decisions']].filter(([,store])=>before.stores[store].present).map(([kind])=>kind);
  for(const row of iterateCurrentRecords(before,{kinds})) {
    const assignments=readAssignments(row.entry);if(assignments.state!=='known'||!assignments.ids.includes(source.id))continue;
    assert.equal(zero,false,'Zero source really has no direct users');
    // Iterator file paths are already relative to kit root; its actual entry is authoritative.
    const local=row.entry.file.startsWith(nested?'unknown-knowledge/':'\0')?row.entry.file.slice('unknown-knowledge/'.length):row.entry.file;
    const recordFile=local.startsWith(`${row.ref.kind==='decision'?'decisions':row.ref.kind}/`)?local:`${row.ref.kind==='decision'?'decisions':row.ref.kind}/${local}`;
    const prior=capture(input.before,recordFile);
    const after=assignments.ids.includes(survivor.id)?assignments.ids.filter(id=>id!==source.id):assignments.ids.map(id=>id===source.id?survivor.id:id);
    const old=f.assignmentEvent?.rows.find(item=>item.ref.id===row.ref.id),revision=old?old['after-revision']:0;
    if(!old)baseline.baselines.push({ref:row.ref,state:assignments,capture:prior.locator});
    rows.push({ref:row.ref,before:assignments,after:{state:'known',ids:after},'before-revision':revision,'after-revision':revision+1,
      disposition:'changed',reason:'Apply the second reviewed equivalence','before-capture':prior.locator,recordFile});
    const edits=byFile.get(recordFile)??[];edits.push({row,after});byFile.set(recordFile,edits);
  }
  for(const [file,edits]of byFile){
    if(edits[0].row.ref.kind==='knowledge'){
      const {after}=edits[0];let text=f.read(file).replace(/^subjects:.*$/m,`subjects: ${JSON.stringify(after)}`);
      const note={type:'revision',date:input.reviewNote.date,text:`Classification review by ${input.reviewNote.author} using ${input.reviewNote.skill}: subjects ${after.join(', ')}. Existing evidence metadata retained.`};
      const offset=text.indexOf('\n---',4);text=text.slice(0,offset)+`${/^notes:/m.test(text)?'':'\nnotes:'}\n  - ${JSON.stringify(note)}`+text.slice(offset);f.put(file,text);
    }else{
      const parsed=yaml(f.read(file));for(const {row,after}of edits)parsed.entries.find(r=>r.id===row.ref.id).subjects=after;
      f.put(file,grouped(parsed.entries));
    }
  }
  let assignmentEvent=null;
  if(!zero){
    assignmentEvent={...structuredClone(f.assignmentEvent),event:input.operation.assignmentEvent.id,
      scope:{...structuredClone(f.assignmentEvent.scope),operation:input.operation.id,survivor:survivor.id,absorbed:[source.id],'registry-events':[event.id]},
      'before-input':{commit:input.before.commit,tree:input.before.tree,'kit-path':input.before.kitPath},
      review:{...f.assignmentEvent.review,reference:event.review.reference},rows};
    f.put(baselineFile,`schema-version: 1\nnamespace: ${baseline.namespace}\nbaselines:\n`+baseline.baselines.map(row=>`  - ${JSON.stringify(row)}\n`).join(''));
  }
  const save=()=>{
    const {review,...body}=event;review.changeDigest=canonicalSha256(body);input.operation.registryEvents[0].changeDigest=review.changeDigest;
    f.put('subjects/registry.yaml',registryWire(document));
    if(assignmentEvent){
      const sealed=sealAssignmentEvent({...assignmentEvent,rows:assignmentEvent.rows.map(({recordFile,...row})=>({...row,
        'after-capture':describeCandidateBytes({file:path(recordFile),bytes:Buffer.from(f.read(recordFile)),objectFormat:'sha1'})}))});
      f.put(`subjects/_assignments/${sealed.event}.yaml`,sealed);input.operation.assignmentEvent.changeDigest=assignmentEventDigest(sealed);
    }
    f.git('add','.');const tree=f.git('write-tree');input.candidate={commit:f.git('commit-tree',tree,'-p',input.before.commit,'-m','second equivalent merge'),tree,kitPath:input.before.kitPath};return input;
  };
  save();return {...f,input,zero,firstInput,firstGate,beforeDocument,document,event,assignmentEvent,save,capture};
}
export function reviewRepeatedEquivalentMergeFixture(t,options={}){
  return reviewSubjectMergeMaterialFixture(t,options,repeatedEquivalentMergeFixture);
}
