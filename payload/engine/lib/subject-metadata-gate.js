/** Actual registry-only metadata publication preparation; no caller models or authority reports. */
import { isDeepStrictEqual as same } from 'node:util';
import { readFileSync, lstatSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { createSubjectMetadataBudget, admitSubjectMetadataInput, decodeSubjectMetadataInput, admitSubjectProposalSuppressionInput, decodeSubjectProposalSuppressionInput } from './subject-metadata-input.js';
import { readCommittedTree, withTreeSnapshot, changedTreePaths } from './commit-snapshot.js';
import { captureCommittedFile } from './captured-source.js';
import { loadContinuedLifecycleContext, verifyLifecycleEvidenceSources } from './subject-lifecycle-context.js';
import { locateKitRoot } from './kit-root.js';
import { validateSubjectMetadataTransition, validateSubjectProposalSuppressionTransition, validateSubjectGovernanceCapture } from './subject-governance.js';
import { inspectContinuedSubjectUses } from './subject-use-inventory.js';
import { iterateCurrentRecords, parseCanonicalId, parseProposalKey } from './record-identity.js';
import { runChecks } from '../commands/validate.js';
import { validateAssignmentHistoryChain } from './subject-history.js';
import { reportSubjectReach } from './subject-reach.js';
import { compareSubjectTreeViews } from './subject-view-impact.js';
import { compareSubjectMetadataReplays, compareSubjectProposalSuppressionReplays, compareSubjectMetadataLookups } from './subject-metadata-replay.js';
import { canonicalJsonBytes, canonicalSha256, CapturedInputError } from './canonical-json.js';
import { SubjectError } from './subject-error.js';
import { rethrowIfBug } from './engine-refusal.js';

const checks=['admission','models','registry','decision','preservation','inventory','impacts'];
const stores={knowledge:'knowledge',ontology:'ontology',decision:'decisions'};
const path=(kit,file)=>kit==='.'?file:`${kit}/${file}`;
const key=row=>canonicalSha256(row.ref??row.proposalRef);
export function runPreparedSubjectMetadataGate(input){return run(input,false);}
export function runPreparedSubjectMetadataGateFromWire({repoRoot,gateInput}){return run(gateInput,true,repoRoot);}
export function runPreparedSubjectProposalSuppressionGate(input){return run(input,false,undefined,true);}
export function runPreparedSubjectProposalSuppressionGateFromWire({repoRoot,gateInput}){return run(gateInput,true,repoRoot,true);}
async function run(input,wire,repoRoot,suppression=false){
  const result={version:1,kind:suppression?'subject-proposal-suppression-gate':'subject-metadata-gate',ok:false,publicationReady:false,inputDigest:null,inputs:null,operation:null,
    sources:{registryCapture:null,registryEvent:null,assignmentEvent:null},decision:null,
    assignments:null,assignmentAssessment:null,preservation:null,inventory:null,
    authoredReferenceClosure:{status:'not-performed',semanticCompleteness:'unknown',retainedUnknowns:[]},
    impacts:{reach:null,subjectTree:null,representativeReplays:null,lookup:null,
      routes:{status:'requires-final-capability',scope:'kit-managed-subject-route-persistence',externalInventory:'unknown'}},
    checks:Object.fromEntries(checks.map(name=>[name,{status:'not-performed'}])),resources:{limits:null,governance:null,closure:null},diagnostics:[]};
  const roots=[];
  const stable=value=>typeof value==='string'?roots.reduce((text,[root,label])=>text.replaceAll(root,label),value)
    .replace(/(?:\/[^\s"']*)?\/unknown-knowledge-(?:commit|tree)-[^/\s"']+/g,'<snapshot>')
    :Array.isArray(value)?value.map(stable):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([key,row])=>[key,stable(row)])):value;
  const fail=(check,code,message,details={})=>{result.ok=false;result.checks[check]={status:'failed'};result.diagnostics.push(stable({code,message,...details}));return result;};
  let budget,phase='admission';
  try{
    budget=createSubjectMetadataBudget(input);
    const admitted=wire?(suppression?decodeSubjectProposalSuppressionInput:decodeSubjectMetadataInput)(repoRoot,input,{operationBudget:budget})
      :(suppression?admitSubjectProposalSuppressionInput:admitSubjectMetadataInput)(input,{operationBudget:budget});
    if(!admitted.ok)return fail('admission','invalid-subject-metadata-input','Closed input admission refused.',{diagnostics:admitted.diagnostics});
    const request=admitted.input;
    roots.push([request.repoRoot,'<repository>']);
    result.inputDigest=admitted.inputDigest;result.inputs={before:request.before,candidate:request.candidate};result.operation=request.operation;
    result.resources.limits=request.limits;result.resources.closure={used:{rows:0,bytes:0},failure:null};
    const append=row=>{
      const usage=result.resources.closure, bytes=canonicalJsonBytes(row).length;
      if(usage.used.rows>=request.limits.closure.maxRows||bytes>request.limits.closure.maxBytes-usage.used.bytes){
        usage.failure={code:'metadata-closure-budget',requested:{rows:1,bytes}};
        throw new SubjectError('metadata-closure-budget','Retained proof rows must fit before attachment.');
      }
      usage.used.rows++;usage.used.bytes+=bytes;return row;
    };
    result.checks.admission.status='passed';phase='models';
    for(const side of ['before','candidate'])if(readCommittedTree(request.repoRoot,request[side].commit).tree!==request[side].tree)
      return fail(phase,'metadata-tree-mismatch','Each tree must match its actual commit.',{side});
    if(request.before.kitPath!==request.candidate.kitPath)return fail(phase,'metadata-kit-path-mismatch','Installation path must remain exact.');
    await withTreeSnapshot(request.repoRoot,request.before.tree,prior=>withTreeSnapshot(request.repoRoot,request.candidate.tree,async next=>{
      const sides={},captures={};
      for(const [side,snapshot] of [['before',prior],['candidate',next]]){
        roots.unshift([snapshot.root,`<${side}>`],[dirname(snapshot.root),`<${side}-snapshot>`]);
        if((relative(snapshot.root,locateKitRoot(snapshot.root))||'.')!==request[side].kitPath)return fail(phase,'metadata-kit-path-mismatch','Actual installation path differs.',{side});
        const loaded=loadContinuedLifecycleContext({root:snapshot.root,evidence:request.evidence,operationBudget:budget});
        if(!loaded.ok)return fail(phase,'metadata-model-unavailable','Actual context must load.',{side,diagnostics:loaded.diagnostics});
        const {context}=loaded,{model}=context;
        const bound=validateSubjectGovernanceCapture(context.subjectGovernance,{model},{operationBudget:budget});
        const errors=runChecks(model,snapshot.root).filter(row=>row.severity==='error');
        const chain=model.assignmentHistory?validateAssignmentHistoryChain({namespace:model.identity.namespace,
          baselines:model.assignmentHistory.baselines,events:model.assignmentHistory.events}):null;
        if(!bound.ok||errors.length||(chain&&!chain.ok))return fail(phase,'metadata-model-invalid','Native structure and history must validate.',{side,diagnostics:[...bound.diagnostics,...errors,...(chain?.diagnostics??[])]});
        sides[side]={descriptor:request[side],root:snapshot.root,context};
        const file=path(request[side].kitPath,'subjects/registry.yaml');
        const captured=captureCommittedFile({repoRoot:request.repoRoot,commit:request[side].commit,file});budget.admitCapture(captured);
        const raw={bytes:readFileSync(join(snapshot.root,file))};budget.admitCapture(raw);
        if(!['100644','100755'].includes(captured.mode)||!captured.bytes.equals(raw.bytes)
          ||(lstatSync(join(snapshot.root,file)).mode&0o777)!==(Number.parseInt(captured.mode,8)&0o777))
          return fail(phase,'metadata-registry-membership','Actual registry bytes and mode must match.');
        captures[side]=captured;
      }
      result.checks.models.status='passed';phase='registry';
      const before=sides.before.context.model,candidate=sides.candidate.context.model;
      const old=before.subjectRegistry.document,document=candidate.subjectRegistry.document,event=document.history.at(-1);
      if(!same(before.identity,candidate.identity)||captures.before.mode!==captures.candidate.mode
        ||document.history.length!==old.history.length+1||!same(document.history.slice(0,-1),old.history)
        ||event.action!==request.operation.action||!same({id:event.id,changeDigest:event.review.changeDigest},request.operation.registryEvent)
        ||event.rows.some(row=>suppression ? !parseProposalKey('subject',row.id).ok||row.before?.status!=='proposed'||row.after.status!=='suppressed'
          :!parseCanonicalId('subject',row.id).ok||row.before?.status!=='active'||row.after.status!=='active'))
        return fail(phase,'metadata-transition-shape','One exact existing-canonical active metadata event and unchanged ledger are required.');
      const transitionModel=suppression?before:candidate;
      const native=(suppression?validateSubjectProposalSuppressionTransition:validateSubjectMetadataTransition)({before:old,candidate:document,
        model:transitionModel,identityIndex:transitionModel.identityIndex,...request.evidence},{operationBudget:budget});
      if(!native.ok)return fail(phase,'metadata-transition-refused','Native metadata transition refused.',{diagnostics:native.diagnostics});
      result.sources.registryCapture=captures.candidate.locator;result.sources.registryEvent=request.operation.registryEvent;
      result.checks.registry.status='passed';phase='decision';
      verifyLifecycleEvidenceSources({repoRoot:request.repoRoot,...sides,evidence:request.evidence,operationBudget:budget});
      for(const side of ['before','candidate']){
        const model=sides[side].context.model;
        const row=iterateCurrentRecords(model,{kinds:['decision']}).find(row=>same(row.ref,event.decision));
        if(!row||!['accepted','addressed'].includes(row.entry.record.status)||row.entry.record.status!==event.review.acceptedStatus
          ||canonicalSha256(row.entry.record)!==event.review.decisionDigest)return fail(phase,'metadata-authorizer-mismatch','Current Decision must match the reviewed tuple.');
        const captured=captureCommittedFile({repoRoot:request.repoRoot,commit:request[side].commit,file:path(request[side].kitPath,row.entry.file)});budget.admitCapture(captured);
        const {source,...detached}=event.review.decisionCapture;
        const {source:actualSource,...actual}=captured.locator;
        if(!['100644','100755'].includes(captured.mode)||!same(detached,actual))return fail(phase,'metadata-authorizer-file','Current full authorizer file must match the reviewed locator.');
      }
      result.decision=append({ref:event.decision,reference:event.review.reference,acceptedStatus:event.review.acceptedStatus,
        decisionDigest:event.review.decisionDigest,decisionCapture:event.review.decisionCapture});result.checks.decision.status='passed';phase='preservation';
      const proof=append({inputs:result.inputs,operationDigest:canonicalSha256(request.operation),registryFile:captures.candidate.locator.file,registryMode:captures.candidate.mode,
        beforeCapture:captures.before.locator,candidateCapture:captures.candidate.locator,
        changedPaths:changedTreePaths(request.repoRoot,request.before.tree,request.candidate.tree)});
      result.preservation={status:'failed',proof,proofDigest:canonicalSha256(proof)};
      if(!same(proof.changedPaths,[proof.registryFile]))return fail(phase,'metadata-preservation-paths','Only the registry file may change.');
      result.preservation.status='passed';result.checks.preservation.status='passed';phase='inventory';
      const inventory=await inspectContinuedSubjectUses({repoRoot:request.repoRoot,...result.inputs,
        subjects:[...new Set([...old.subjects,...document.subjects].map(row=>row.id))].sort(),evidence:request.evidence,limits:request.limits.inventory,
        impactPolicy:{required:[],requiredExtensions:[]}},{operationBudget:budget});
      result.inventory=inventory;
      if(!['complete','incomplete'].includes(inventory.status)||['before','candidate'].some(side=>!inventory.coverage[side]
        ||['records','registry','hierarchy'].some(key=>inventory.coverage[side][key]!=='complete'))
        ||inventory.potentialUses.some(row=>row.reason!=='unknown-assignments'))return fail(phase,'metadata-inventory-incomplete','Complete stored owners and authored graph are required.');
      const priorRows=inventory.records.filter(row=>row.side==='before'),nextRows=new Map(inventory.records.filter(row=>row.side==='candidate').map(row=>[key(row),row]));
      for(const row of priorRows){
        const after=nextRows.get(key(row));
        if(!after||!same(row.assignments,after.assignments)||!same(row.lifecycle,after.lifecycle)||!same(row.locator,after.locator)
          ||row.resolution!==after.resolution||row.capture.sha256!==after.capture.sha256)return fail(phase,'metadata-owner-changed','All stored owner metadata remains exact.');
      }
      const unknown=priorRows.filter(row=>row.assignments.state==='unknown'),requests=new Map(request.operation.retainedUnknowns.map(row=>[key(row),row]));
      if(requests.size!==request.operation.retainedUnknowns.length||!same(unknown.map(key).sort(),[...requests.keys()].sort()))return fail(phase,'metadata-unknown-scope','Explicitly retain the exact absent-assignment owners.');
      for(const row of unknown)result.authoredReferenceClosure.retainedUnknowns.push(append({...requests.get(key(row)),before:row,after:nextRows.get(key(row))}));
      result.authoredReferenceClosure.status='complete';result.authoredReferenceClosure.semanticCompleteness='stored-owner-and-registry-only';
      result.assignmentAssessment=append({status:'not-applicable',reason:'registry-only-transition',inventoryDigest:canonicalSha256(inventory),preservationDigest:result.preservation.proofDigest});
      result.checks.inventory.status='passed';phase='impacts';
      const pairs={before:{capturedInputRef:canonicalSha256(request.before),context:sides.before.context},after:{capturedInputRef:canonicalSha256(request.candidate),context:sides.candidate.context}};
      const kinds=Object.keys(stores).filter(kind=>before.stores[stores[kind]]?.present);
      const reachSide=pair=>({capturedInputRef:pair.capturedInputRef,registry:pair.context.model.subjectRegistry,
        records:iterateCurrentRecords(pair.context.model,{kinds}),coverage:kinds.map(kind=>({kind,status:'complete'}))});
      result.impacts.reach=reportSubjectReach({before:reachSide(pairs.before),after:reachSide(pairs.after),kinds,limits:request.limits.reach});
      if(['before','after'].some(side=>{const row=result.impacts.reach[side];return !row||!['records','hierarchy','coverage'].every(key=>row.completeness[key])||row.unvalidatedRecords!==0;}))
        return fail(phase,'metadata-reach-incomplete','Actual reach work must finish with absent assignments retained.');
      result.impacts.subjectTree=compareSubjectTreeViews({version:1,...pairs,limits:request.limits.views,
        inventory:{version:1,coverage:'complete',views:[{id:'whole-registry',kind:'subject-tree',options:request.limits.tree}]}});
      if(result.impacts.subjectTree.status!=='complete')return fail(phase,'metadata-tree-incomplete','One actual whole-registry tree pair is mandatory.');
      result.impacts.representativeReplays=(suppression?compareSubjectProposalSuppressionReplays:compareSubjectMetadataReplays)({...pairs,event,inventory,limits:request.limits,closure:result.resources.closure});
      if(result.impacts.representativeReplays.status!=='complete')return fail(phase,'metadata-replays-incomplete','The fixed native recipe must complete.',{diagnostics:result.impacts.representativeReplays.diagnostics});
      result.impacts.lookup=compareSubjectMetadataLookups({before:before.subjectRegistry,after:candidate.subjectRegistry,event,limits:request.limits.lookup});
      if(result.impacts.lookup.status!=='complete')return fail(phase,'metadata-lookup-incomplete','Every affected label term requires both full native outputs.');
      result.checks.impacts.status='passed';result.ok=true;
    }));
    return result;
  }catch(error){
    if(!(error instanceof SubjectError||error instanceof CapturedInputError))rethrowIfBug(error);
    return fail(phase,error.code??'metadata-snapshot-unavailable',error.message);
  }finally{if(budget)result.resources.governance={used:budget.used,failure:budget.failure};}
}
