/** Parsed-report consistency and fixed candidate capture; fresh execution owns authority. */
import { isDeepStrictEqual as same } from 'node:util';
import { lstatSync } from 'node:fs';
import { join } from 'node:path';
import { canonicalSha256, canonicalJsonBytes, CapturedInputError } from './canonical-json.js';
import { isCaptureLocator } from './capture-locator.js';
import { isIdentityUuid, parseCanonicalId } from './record-identity.js';
import { readPreparedSubjectBytes } from './prepared-assignment-event.js';
import { verifyCapturedBytes } from './captured-source.js';
import { EngineRefusal } from './engine-refusal.js';
const closed=(value,keys)=>value!==null&&typeof value==='object'&&!Array.isArray(value)
  &&Reflect.ownKeys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const whole=value=>Number.isSafeInteger(value)&&value>=0;
const checkNames=['admission','models','registry','decision','preservation','inventory','impacts'];
export const validMetadataCaptureLimits=value=>closed(value,['maxRegistryBytes'])&&Number.isSafeInteger(value.maxRegistryBytes)&&value.maxRegistryBytes>0;
export function isPreparedSubjectMetadataReport(value,expected,wire){
  return preparedReport(value,expected,wire,false);
}
export function isPreparedSubjectProposalSuppressionReport(value,expected,wire){
  return preparedReport(value,expected,wire,true);
}
function preparedReport(value,expected,wire,suppression){
  try{return report(value,expected,wire,suppression);}
  catch(error){if(!(error instanceof CapturedInputError||error instanceof RangeError))throw error;return false;}
}
function report(value,expected,wire,suppression){
  if(!closed(value,['version','kind','ok','publicationReady','inputDigest','inputs','operation','sources','decision','assignments',
    'assignmentAssessment','preservation','inventory','authoredReferenceClosure','impacts','checks','resources','diagnostics'])
    ||value.version!==1||value.kind!==(suppression?'subject-proposal-suppression-gate':'subject-metadata-gate')||typeof value.ok!=='boolean'||value.publicationReady!==false
    ||!Array.isArray(value.diagnostics)||!closed(value.checks,checkNames)||checkNames.some(name=>!closed(value.checks[name],['status'])
      ||!['passed','failed','not-performed'].includes(value.checks[name].status)))return false;
  canonicalSha256(value);
  if(!value.ok)return true;
  const registryFile=`${expected.candidate.kitPath==='.'?'':`${expected.candidate.kitPath}/`}subjects/registry.yaml`;
  const proof=value.preservation?.proof,resources=value.resources,decision=value.decision;
  if(!closed(wire,['version','before','candidate','operation','evidence','limits','impact'])||wire.version!==1
    ||canonicalSha256(wire)!==value.inputDigest||!same(wire.before,expected.source)||!same(wire.candidate,expected.candidate)
    ||!same(value.inputs,{before:expected.source,candidate:expected.candidate})||!same(value.operation,wire.operation)
    ||!closed(wire.operation,['version','id','action','registryEvent','retainedUnknowns'])||wire.operation.version!==1
    ||!isIdentityUuid(wire.operation.id)||!(suppression?['suppress']:['rename','clarify','reparent','relate']).includes(wire.operation.action)
    ||!closed(wire.operation.registryEvent,['id','changeDigest'])||!isIdentityUuid(wire.operation.registryEvent.id)
    ||!/^[0-9a-f]{64}$/.test(wire.operation.registryEvent.changeDigest)
    ||!same(wire.impact,{version:1,policy:suppression?'subject-proposal-suppression-impact-v1':'subject-metadata-impact-v1',routes:{kind:'runtime-capability'}})
    ||value.diagnostics.length||value.assignments!==null||checkNames.some(name=>value.checks[name].status!=='passed')
    ||!closed(value.sources,['registryCapture','registryEvent','assignmentEvent'])||value.sources.assignmentEvent!==null
    ||!same(value.sources.registryEvent,wire.operation.registryEvent)||!isCaptureLocator(value.sources.registryCapture)
    ||value.sources.registryCapture.file!==registryFile||!same(value.sources.registryCapture.source,{commit:expected.candidate.commit,tree:expected.candidate.tree})
    ||!closed(value.preservation,['status','proof','proofDigest'])||value.preservation.status!=='passed'
    ||!closed(proof,['inputs','operationDigest','registryFile','registryMode','beforeCapture','candidateCapture','changedPaths'])
    ||!same(proof.inputs,value.inputs)||proof.operationDigest!==canonicalSha256(wire.operation)||proof.registryFile!==registryFile
    ||!['100644','100755'].includes(proof.registryMode)||!same(proof.changedPaths,[registryFile])
    ||!same(proof.candidateCapture,value.sources.registryCapture)||!isCaptureLocator(proof.beforeCapture)
    ||proof.beforeCapture.file!==registryFile||!same(proof.beforeCapture.source,{commit:expected.source.commit,tree:expected.source.tree})
    ||value.preservation.proofDigest!==canonicalSha256(proof)||value.authoredReferenceClosure?.status!=='complete'
    ||!Array.isArray(value.authoredReferenceClosure.retainedUnknowns)||!['complete','incomplete'].includes(value.inventory?.status)
    ||!closed(decision,['ref','reference','acceptedStatus','decisionDigest','decisionCapture'])||decision.ref?.kind!=='decision'
    ||!parseCanonicalId('decision',decision.ref.id).ok||!isIdentityUuid(decision.ref.namespace)
    ||!['accepted','addressed'].includes(decision.acceptedStatus)||typeof decision.reference!=='string'||!decision.reference.trim()
    ||!/^[0-9a-f]{64}$/.test(decision.decisionDigest)||!isCaptureLocator(decision.decisionCapture)
    ||!same(value.assignmentAssessment,{status:'not-applicable',reason:'registry-only-transition',inventoryDigest:canonicalSha256(value.inventory),preservationDigest:value.preservation.proofDigest})
    ||!closed(resources,['limits','governance','closure'])||!same(resources.limits,wire.limits)
    ||!closed(resources.governance,['used','failure'])||resources.governance.failure!==null
    ||!closed(resources.closure,['used','failure'])||resources.closure.failure!==null
    ||!closed(resources.closure.used,['rows','bytes']))return false;
  const counters=['captureBytes','documentNodes','documentTextUnits','subjects','historyRows','validationSteps'];
  if(!closed(resources.governance.used,[...counters,'relevantRefusalRows'])||!counters.every(key=>whole(resources.governance.used[key])
    &&whole(wire.limits.governance[`max${key[0].toUpperCase()}${key.slice(1)}`])
    &&resources.governance.used[key]<=wire.limits.governance[`max${key[0].toUpperCase()}${key.slice(1)}`])
    ||!whole(resources.governance.used.relevantRefusalRows)||resources.governance.used.relevantRefusalRows>resources.governance.used.validationSteps
    ||!['rows','bytes'].every(key=>whole(resources.closure.used[key])&&resources.closure.used[key]<=wire.limits.closure[key==='rows'?'maxRows':'maxBytes']))return false;
  if(!closed(value.impacts,['reach','subjectTree','representativeReplays','lookup','routes'])
    ||!['complete','incomplete'].includes(value.impacts.reach?.status)||value.impacts.subjectTree?.status!=='complete'
    ||value.impacts.representativeReplays?.status!=='complete'||value.impacts.representativeReplays.kind!==(suppression?'subject-proposal-suppression-replay':'subject-metadata-replay')
    ||value.impacts.representativeReplays.policy?.id!==(suppression?'subject-proposal-suppression-replay-v1':'subject-metadata-replay-v1')||value.impacts.representativeReplays.policy?.version!==1
    ||value.impacts.lookup?.status!=='complete'||value.impacts.lookup.resources?.calls!==2*value.impacts.lookup.terms?.length
    ||!same(value.impacts.routes,{status:'requires-final-capability',scope:'kit-managed-subject-route-persistence',externalInventory:'unknown'}))return false;
  const rows=[decision,proof,...value.authoredReferenceClosure.retainedUnknowns,value.assignmentAssessment,...value.impacts.representativeReplays.subjects];
  return resources.closure.used.rows===rows.length&&resources.closure.used.bytes===rows.reduce((sum,row)=>sum+canonicalJsonBytes(row).length,0);
}
export function capturePreparedSubjectMetadata(input){return capture(input,false);}
export function capturePreparedSubjectProposalSuppression(input){return capture(input,true);}
function capture({root,source,candidate,gate,gateInput,captureLimits},suppression){
  if(!validMetadataCaptureLimits(captureLimits)||!preparedReport(gate,{source,candidate},gateInput,suppression)||!gate.ok)
    throw new EngineRefusal('prepared metadata capture input unavailable');
  const file=gate.sources.registryCapture.file;
  const registry=readPreparedSubjectBytes({root,file,maxBytes:captureLimits.maxRegistryBytes});
  if(registry===null||!verifyCapturedBytes({locator:gate.sources.registryCapture,bytes:registry,objectFormat:candidate.commit.length===40?'sha1':'sha256'}).ok
    ||(lstatSync(join(root,file)).mode&0o777)!==(Number.parseInt(gate.preservation.proof.registryMode,8)&0o777))
    throw new EngineRefusal('prepared metadata candidate capture mismatch');
  return {registry};
}
