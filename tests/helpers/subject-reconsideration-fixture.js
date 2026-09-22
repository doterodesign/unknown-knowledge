/** Independently authored actual repositories; no planner-generated candidate truth. */
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, cpSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadStores } from '../../payload/engine/lib/load-stores.js';
import { captureCommittedFile } from '../../payload/engine/lib/captured-source.js';
import { canonicalSha256 } from '../../payload/engine/lib/canonical-json.js';

export const namespace = 'a2000000-0000-4000-8000-000000000001';
export const proposal = `proposal:subject:${namespace}`;
export const refusalId = 'a2000000-0000-4000-8000-000000000002';
export const activationId = 'a2000000-0000-4000-8000-000000000003';
export const operationId = 'a2000000-0000-4000-8000-000000000004';
export const ref = id => ({ namespace, kind: 'decision', id });
export const limits = { maxCaptureBytes: 2000000, maxDocumentNodes: 200000, maxDocumentTextUnits: 2000000,
  maxSubjects: 30000, maxHistoryRows: 30000, maxValidationSteps: 300000 };
export const stateOf = ({ id, changes, ...state }) => structuredClone(state);
export const digestEvent = ({ review, ...event }) => canonicalSha256(event);
const keys = { schemaVersion:'schema-version', hierarchyRevision:'hierarchy-revision', originDecision:'origin-decision',
  acceptedStatus:'accepted-status', decisionCapture:'decision-capture', decisionDigest:'decision-digest', changeDigest:'change-digest',
  priorRefusal:'prior-refusal', reconsiderationAssessment:'reconsideration-assessment', refusalAssessment:'refusal-assessment',
  beforeRegistry:'before-registry', documentDigest:'document-digest', identityDigest:'identity-digest', relevantRefusals:'relevant-refusals' };
export const wire = value => Array.isArray(value) ? value.map(wire) : value && typeof value === 'object'
  ? Object.fromEntries(Object.entries(value).map(([key, item]) => [keys[key] ?? key, wire(item)])) : value;

export function subjectReconsiderationFixture(t, { objectFormat = 'sha1', nested = false, parent = false, related = false,
  archivedPrior = false, sourceMaterial = false, retiredParent = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'subject-reconsideration-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const repoRoot = join(root, 'before'); mkdirSync(repoRoot);
  const kitPath = nested ? 'unknown-knowledge' : '.';
  const kitRoot = join(repoRoot, kitPath);
  const git = (...args) => {
    const result = spawnSync('/usr/bin/git', ['-c','user.name=Fixture','-c','user.email=fixture@example.invalid','-C',repoRoot,...args], { encoding:'utf8' });
    assert.equal(result.status, 0, result.stderr); return result.stdout.trim();
  };
  const putAt = (base, file, value) => { const path = join(base,file); mkdirSync(dirname(path),{recursive:true});
    writeFileSync(path, Buffer.isBuffer(value) || typeof value === 'string' ? value : JSON.stringify(value)); };
  const put = (file,value) => putAt(kitRoot,file,value);
  const commit = message => { git('add','.'); git('commit','-qm',message); return { commit:git('rev-parse','HEAD'),tree:git('rev-parse','HEAD^{tree}'),kitPath }; };
  const capture = (descriptor,file) => { const actual=captureCommittedFile({repoRoot,commit:descriptor.commit,
    file:kitPath === '.' ? file : `${kitPath}/${file}`}); return {capture:actual.locator,bytes:actual.bytes,objectFormat}; };
  const records = ['D-000001','D-000002','D-000003'].map(id => ({ id,title:id,status:'accepted',category:'architecture',
    date:'2026-09-20',deciders:['steward'],context:'Retained reviewed material',decision:'Reconsider the prior scope with this material' }));
  const identity = {'schema-version':1,'identity-format':1,namespace,allocations:records.map(({id}) => ({kind:'decision',id,state:'allocated',
    publication:{id:'a2000000-0000-4000-8000-000000000005',review:'review:bootstrap'}}))};
  put('_identity.yaml',identity);
  put('decisions/_catalog.yaml',{'schema-version':2,store:'decisions',entries:records.map(({id,title}) => ({id,title,file:'entries/review.yaml'}))});
  put('decisions/entries/review.yaml',{'schema-version':2,entries:records});
  put('material.txt','An already retained source reconsidered under a different assessment.\n');
  git('init','-q',`--object-format=${objectFormat}`);
  const authority = commit('original accepted authority and material');
  const decisionCapture = capture(authority,'decisions/entries/review.yaml');
  const sourceCapture = capture(authority,'material.txt');
  const material = sourceMaterial ? {reason:'Reconsider previously available material in its actual scope',records:[],
    sources:[{locator:'https://example.invalid/material',revision:'retained-1',capture:sourceCapture.capture}]}
    : {reason:'Reconsider previously available material in its actual scope',records:[{ref:ref('D-000001'),capture:decisionCapture.capture}],sources:[]};
  const warrant = {records:structuredClone(material.records),sources:material.sources.map(({locator,revision})=>({locator,revision}))};
  const draft = {id:proposal,label:'Color',definition:{text:'Visual perception',includes:['visible color'],excludes:['political affiliation']},
    aliases:[{label:'Colour',locale:'en'}],status:'proposed',changes:[],originDecision:ref('D-000001'),warrant,
    related:related ? [{type:'association',target:'S-000002'}] : [],...(parent ? {parent:'S-000002'} : {})};
  const history=[]; const subjects=[];
  const review = (event, id, reference) => ({reference,acceptedStatus:'accepted',decisionCapture:decisionCapture.capture,
    decisionDigest:canonicalSha256(records.find(row=>row.id===id)),changeDigest:digestEvent(event)});
  if (parent || related) {
    const parentState={...stateOf(draft),status:'active',related:[],originDecision:ref('D-000001')}; delete parentState.parent;
    const event={id:'a2000000-0000-4000-8000-000000000006',action:'activate',decision:ref('D-000001'),rows:[{id:'S-000002',before:null,after:parentState}]};
    event.review=review(event,'D-000001','review:parent'); history.push(event);
    subjects.push({id:'S-000002',...parentState,changes:[event.id]});
    identity.allocations.push({kind:'subject',id:'S-000002',state:'allocated',publication:{id:event.id,review:'review:parent'}});
  }
  if(retiredParent){
    const original=subjects[0];const after={...stateOf(original),status:'retired',retirement:{kind:'retire'}};
    const event={id:'a2000000-0000-4000-8000-000000000007',action:'retire',decision:ref('D-000001'),rows:[{id:original.id,before:stateOf(original),after}]};
    event.review=review(event,'D-000001','review:retired-parent');history.push(event);Object.assign(original,after);original.changes.push(event.id);
  }
  const refusal={id:refusalId,action:'suppress',decision:ref('D-000002'),reason:'No sufficient scope justification',
    rows:[{id:proposal,before:stateOf(draft),after:{...stateOf(draft),status:'suppressed',refusal:{decision:ref('D-000002'),reason:'No sufficient scope justification'}}}]};
  refusal.review=review(refusal,'D-000002','review:refusal'); history.push(refusal);
  const suppressed={id:proposal,...structuredClone(refusal.rows[0].after),changes:[refusalId]}; subjects.push(suppressed);
  const beforeDocument={schemaVersion:1,namespace,revision:history.length,hierarchyRevision:parent ? 1 : 0,subjects,history};
  if(archivedPrior) { const current=structuredClone(records); current[1].status='archived'; put('decisions/entries/review.yaml',{'schema-version':2,entries:current}); }
  put('_identity.yaml',identity); put('subjects/registry.yaml',wire(beforeDocument));
  const before=commit('actual suppressed proposal before reconsideration');
  const beforeCaptures={registry:capture(before,'subjects/registry.yaml'),identity:capture(before,'_identity.yaml')};
  const currentDecisionCapture=archivedPrior ? capture(before,'decisions/entries/review.yaml') : decisionCapture;
  const beforeModel=loadStores(kitRoot);
  const candidateRepo=join(root,'candidate'); cpSync(repoRoot,candidateRepo,{recursive:true});
  const candidateRoot=join(candidateRepo,kitPath);
  const active={...stateOf(suppressed),status:'active',originDecision:ref('D-000003')}; delete active.refusal;
  const event={id:activationId,action:'activate',decision:ref('D-000003'),promotes:{key:proposal,before:structuredClone(suppressed)},
    priorRefusal:refusalId,reconsideration:material,reconsiderationAssessment:{version:1,
      scope:{beforeRegistry:{capture:beforeCaptures.registry.capture,documentDigest:canonicalSha256(beforeDocument)},identityDigest:canonicalSha256(identity)},
      coverage:'complete-registry',attestation:'all-current-suppressed-meanings-assessed',
      relevantRefusals:[{subject:proposal,refusal:refusalId,disposition:'same-meaning-reconsidered',reason:material.reason}]},
    rows:[{id:'S-000001',before:null,after:active}]};
  event.review={...review(event,'D-000003','review:reconsideration'),decisionCapture:currentDecisionCapture.capture};
  const candidateDocument={...structuredClone(beforeDocument),revision:beforeDocument.revision+1,
    hierarchyRevision:beforeDocument.hierarchyRevision+(parent?1:0),subjects:[...subjects.filter(row=>row.id!==proposal),{id:'S-000001',...active,changes:[activationId]}],
    history:[...structuredClone(history),event]};
  const candidateIdentity=structuredClone(identity);
  candidateIdentity.allocations.push({kind:'subject',id:'S-000001',state:'allocated',publication:{id:operationId,review:event.review.reference}});
  const operation={id:operationId,proposal,subject:'S-000001',registryEvent:{id:activationId,changeDigest:event.review.changeDigest}};
  const f={root,repoRoot,kitRoot,candidateRoot,git,put,read:file=>readFileSync(join(kitRoot,file)),capture,before,beforeDocument,candidateDocument,
    identity:candidateIdentity,records,event,refusal,operation,beforeModel,beforeCaptures,
    decisionCaptures:archivedPrior ? [decisionCapture,currentDecisionCapture] : [decisionCapture],
    materialCaptures:[sourceMaterial ? sourceCapture : decisionCapture],budget:{...limits},allocationLimits:{maxLedgerRows:100},
    reload(){ event.review.changeDigest=digestEvent(event); operation.registryEvent.changeDigest=event.review.changeDigest;
      putAt(candidateRoot,'_identity.yaml',candidateIdentity); putAt(candidateRoot,'subjects/registry.yaml',wire(candidateDocument));
      this.candidateModel=loadStores(candidateRoot); },
    input(extra={}){return {beforeModel:this.beforeModel,candidateModel:this.candidateModel,beforeCaptures:this.beforeCaptures,
      decisionCaptures:this.decisionCaptures,materialCaptures:this.materialCaptures,operation:this.operation,allocationLimits:this.allocationLimits,budget:this.budget,...extra};}};
  f.reload(); return f;
}
