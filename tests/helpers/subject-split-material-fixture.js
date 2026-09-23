/** Literal activation+split of an actually reconsidered Subject, without planner-generated truth. */
import assert from 'node:assert/strict';
import { priorReconsideredLifecycleFixture, lifecycleKnowledgeFile as leaf } from './subject-lifecycle-material-fixture.js';
import { retirementInput } from './subject-retirement-input-fixture.js';
import { stateOf, wire, digestEvent } from './subject-reconsideration-fixture.js';
import { loadStores } from '../../payload/engine/lib/load-stores.js';
import { iterateCurrentRecords, iterateProposalRecords } from '../../payload/engine/lib/record-identity.js';
import { readAssignments } from '../../payload/engine/lib/subject-assignments.js';
import { canonicalSha256 } from '../../payload/engine/lib/canonical-json.js';
import { describeCandidateBytes } from '../../payload/engine/lib/captured-source.js';
import { sealAssignmentEvent } from './assignment-event-fixture.js';
import { assignmentEventDigest } from '../../payload/engine/lib/assignment-event.js';

export async function subjectSplitMaterialFixture(t, { objectFormat = 'sha1', nested = false, zero = true, allEmpty = false } = {}) {
  const f = await priorReconsideredLifecycleFixture(t, { objectFormat, nested });
  const input = retirementInput(); input.repoRoot = f.root; input.impact.policy = 'subject-split-impact-v1';
  input.limits.governance = { ...f.limits.governance }; input.limits.allocation = { maxLedgerRows: 1000, maxSuccessors: 10 };
  input.limits.closure = { maxRows:10000,maxBytes:10000000 };
  const file='knowledge/K-000001.md',body='Original body K-000001.\n';
  const record=JSON.parse(f.read(file).split('---')[1]); record.subjects=zero ? [] : ['S-000001'];
  f.put(file,leaf(record,body)); input.before=f.commit('actual reconsidered source before split');
  const before=loadStores(f.kitRoot); assert.equal(before.ok,true,JSON.stringify(before.diagnostics));
  const pair={registry:f.capture(input.before,'subjects/registry.yaml'),identity:f.capture(input.before,'_identity.yaml')};
  input.evidence={...f.evidence,assessmentCaptures:[...f.evidence.assessmentCaptures,pair]};
  const ids=['S-000002','S-000003'],subject=before.subjectRegistry.document.subjects.find(row=>row.id==='S-000001');
  const source=stateOf(subject),document=structuredClone(before.subjectRegistry.document),authorizer=document.history.at(-1);
  const activation={id:'d3000000-0000-4000-8000-000000000001',action:'activate',decision:authorizer.decision,
    reason:'Review two distinct successor meanings',rows:ids.map((id,index)=>({id,before:null,
      after:{...structuredClone(source),label:`Successor ${index+1}`,definition:{text:`Distinct successor meaning ${index+1}`,includes:[],excludes:[]}}})),
    refusalAssessment:{version:1,scope:{beforeRegistry:{capture:pair.registry.capture,documentDigest:canonicalSha256(before.subjectRegistry.document)},
      identityDigest:canonicalSha256(before.identity)},coverage:'complete-registry',attestation:'all-current-suppressed-meanings-assessed',relevantRefusals:[]}};
  activation.review={...authorizer.review,reference:'review:material-split',changeDigest:digestEvent(activation)};
  const split={id:'d3000000-0000-4000-8000-000000000002',action:'split',decision:authorizer.decision,
    reason:'Retain the source and offer distinct successors',rows:[{id:subject.id,before:source,
      after:{...structuredClone(source),status:'retired',retirement:{kind:'split',successors:ids}}}]};
  split.review={...activation.review,changeDigest:digestEvent(split)};
  Object.assign(document.subjects.find(row=>row.id===subject.id),split.rows[0].after);
  document.subjects.find(row=>row.id===subject.id).changes.push(split.id);
  document.subjects.push(...activation.rows.map(row=>({id:row.id,...row.after,changes:[activation.id]})));
  document.history.push(activation,split);document.revision+=2;
  const ref={namespace:before.identity.namespace,kind:'knowledge',id:record.id},successors=allEmpty ? [] : ids;
  input.operation={version:1,id:'d3000000-0000-4000-8000-000000000003',action:'split',subject:subject.id,successors:ids,
    registryEvents:[activation,split].map(event=>({id:event.id,changeDigest:event.review.changeDigest})),
    assignmentEvent:zero ? null : {id:'d3000000-0000-4000-8000-000000000004',changeDigest:'a'.repeat(64)},
    mappings:zero ? [] : [{ref,successors,reason:'Reviewed exact successor choice'}],
    retainedUnknowns:[...iterateCurrentRecords(before,{kinds:['knowledge','ontology','decision']}),...iterateProposalRecords(before,{kinds:['knowledge','ontology','decision']})]
      .filter(row=>readAssignments(row.entry).state==='unknown').map(row=>({...row.ref ? {ref:row.ref}:{proposalRef:row.proposalRef},reason:'Preserve absent classification'}))
      .sort((a,b)=>JSON.stringify(a.ref??a.proposalRef).localeCompare(JSON.stringify(b.ref??b.proposalRef))),
    retainedHistoricalUses:[],retainedParents:[],retainedInheritedUses:[],successorParents:ids.map(subject=>({subject,parent:null,reason:'Independent root meaning'}))};
  const identity={...structuredClone(before.identity),allocations:[...structuredClone(before.identity.allocations),
    ...ids.map(id=>({kind:'subject',id,state:'allocated',publication:{id:input.operation.id,review:activation.review.reference}}))]};
  f.put('subjects/registry.yaml',wire(document));f.put('_identity.yaml',identity);
  let assignmentEvent=null;
  if(!zero) {
    const capture=f.capture(input.before,file);
    f.put(file,leaf({...record,subjects:successors},body,{type:'revision',date:input.reviewNote.date,
      text:`Classification review by ${input.reviewNote.author} using ${input.reviewNote.skill}: subjects ${successors.length ? successors.join(', ') : 'explicit empty'}. Existing evidence metadata retained.`}));
    const row={ref,before:{state:'known',ids:record.subjects},after:{state:'known',ids:successors},'before-revision':0,'after-revision':1,
      disposition:'changed',reason:input.operation.mappings[0].reason,'before-capture':capture.capture,
      'after-capture':describeCandidateBytes({file:capture.capture.file,bytes:Buffer.from(f.read(file)),objectFormat})};
    assignmentEvent=sealAssignmentEvent({'schema-version':2,event:input.operation.assignmentEvent.id,namespace:before.identity.namespace,operation:'subject-use-transition',
      scope:{kind:'subject-use-transition',operation:input.operation.id,action:'split',subject:subject.id,successors:ids,'registry-events':[activation.id,split.id]},
      'before-input':{commit:input.before.commit,tree:input.before.tree,'kit-path':input.before.kitPath},decision:split.decision,
      review:{reference:split.review.reference,'accepted-status':split.review.acceptedStatus,'decision-capture':split.review.decisionCapture,'decision-digest':split.review.decisionDigest},rows:[row]});
    f.put('subjects/_assignments/_baselines.yaml',{'schema-version':1,namespace:before.identity.namespace,baselines:[{ref,state:row.before,capture:row['before-capture']}]});
    f.put(`subjects/_assignments/${assignmentEvent.event}.yaml`,assignmentEvent);input.operation.assignmentEvent.changeDigest=assignmentEventDigest(assignmentEvent);
  }
  input.candidate=f.commit('actual split of reconsidered source');
  return {...f,input,document,identity,activation,split,assignmentEvent,beforeCaptures:pair,zero,allEmpty};
}

import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { subjectSplitInputWire } from '../../payload/engine/lib/subject-split-input.js';
import { runPreparedCandidateChecks } from '../../payload/engine/lib/prepared-validation.js';
import { readRetainedPreparedEvidence, retainPreparedEvidence, artifactCapture } from '../../payload/engine/lib/prepared-evidence.js';
import { runFinalPreparedSubjectSplitGate } from '../../payload/engine/lib/final-prepared-subject-split.js';
import { verifyRetainedRuntimeCapability } from '../../payload/engine/lib/runtime-capability.js';

export const runtimeLimits = { maxRuntimeFiles: 3000, maxRuntimeBytes: 30000000, maxOutputBytesPerCheck: 20000000, maxCheckMilliseconds: 60000 };
export const evidenceLimits = { maxManifestBytes: 2000000, maxArtifacts: 4000, maxArtifactBytes: 30000000, maxTotalArtifactBytes: 200000000 };
export const reviewLimits = { ...evidenceLimits, maxRequestBytes: 20000000, maxAuthorizationBytes: 10000, maxReceiptBytes: 100000 };

/** Actual prepared worker/readback only; the final owner is a separate explicit call. */
export async function finalSubjectSplitMaterialFixture(t, options = {}) {
  const f = await subjectSplitMaterialFixture(t, options);
  const evidenceDirectory = mkdtempSync(join(f.root, '..', 'split-material-evidence-'));
  t.after(() => rmSync(evidenceDirectory, { recursive: true, force: true }));
  const operationInputs = { gateInput: subjectSplitInputWire(f.input), captureLimits: { maxRegistryBytes: 1000000, maxIdentityBytes: 1000000, maxEventBytes: 1000000 } };
  const source = f.input.before, candidate = f.input.candidate;
  const validation = await runPreparedCandidateChecks({ repoRoot: f.root, source, candidate, operation: 'subject-split',
    operationInputs, evidenceDirectory, limits: runtimeLimits });
  assert.equal(validation.retention?.status, 'retained', JSON.stringify(validation));
  const expected = { source, candidate, operation: 'subject-split', runtimeDigest: validation.runtimeDigest, reportDigest: validation.reportDigest };
  const validationInput = { evidenceDirectory, bundleDigest: validation.retention.bundleDigest, expected, limits: evidenceLimits };
  const retained = readRetainedPreparedEvidence(validationInput);
  assert.equal(retained.status, 'verified', JSON.stringify(retained.diagnostics));
  const profile = { version: 1, id: 'subject-route-persistence-unsupported-v1', scope: 'kit-managed-subject-route-persistence',
    persistence: 'unsupported', managedPaths: [], exclusions: ['caller-request-files', 'external-client-saved-routes', 'arbitrary-repository-json'],
    files: retained.runtimeManifest.files };
  const approvedRuntimeProfile = { digest: canonicalSha256(profile), profile };
  const finalInput = { repoRoot: f.root, evidenceDirectory, validationBundleDigest: validation.retention.bundleDigest,
    expected, approvedRuntimeProfile, limits: { evidence: evidenceLimits, runtime: runtimeLimits } };
  const gate = JSON.parse(retained.artifacts.find(({ file }) => file === 'checks/operation/result').bytes);
  return { ...f, source, candidate, operationInputs, validation, retained, gate, validationInput, finalInput, approvedRuntimeProfile, evidenceDirectory };
}

/** Real final, capability and receipt inputs; approval text applies solely to isolated test refs. */
export async function reviewSubjectSplitMaterialFixture(t, options = {}) {
  const f = await finalSubjectSplitMaterialFixture(t, options);
  const final = await runFinalPreparedSubjectSplitGate(f.finalInput);
  assert.equal(final.status, 'passed', JSON.stringify(final));
  const capability = verifyRetainedRuntimeCapability(f.validationInput, f.approvedRuntimeProfile);
  assert.equal(capability.status, 'established', JSON.stringify(capability));
  assert.equal(final.capability.resultDigest, canonicalSha256(capability));
  const capture = file => {
    const row = f.retained.artifacts.find(row => row.file === `checks/operation/${file}`);
    return artifactCapture(row.file, row.bytes);
  };
  const request = { version: 1, operation: 'subject-split', namespace: final.gate.decision.ref.namespace,
    objectFormat: f.source.commit.length === 40 ? 'sha1' : 'sha256',
    source: { ref: 'refs/heads/source', expectedCommit: f.source.commit, tree: f.source.tree, kitPath: f.source.kitPath },
    candidate: f.candidate, runtimeDigest: f.validation.runtimeDigest, policy: { id: final.policy.id, digest: final.policy.digest },
    evidence: { bundleDigest: f.validationInput.bundleDigest, reportDigest: f.validation.reportDigest },
    runtimeCapability: { profileDigest: f.approvedRuntimeProfile.digest, resultDigest: canonicalSha256(capability), result: capability },
    operationEvidence: { kind: 'subject-split', operationId: final.gate.operation.id,
      registryEvents: structuredClone(final.gate.sources.registryEvents), registryCapture: capture('registry.yaml'), identityCapture: capture('identity.yaml'),
      assignmentEvent: f.zero ? null : { eventId: final.gate.sources.assignmentEvent.eventId,
        eventDigest: final.gate.sources.assignmentEvent.eventDigest, eventCapture: capture('event.yaml') },
      decision: structuredClone(final.gate.decision), validation: { inputDigest: final.gate.inputDigest,
        inputCapture: capture('input.json'), reportDigest: canonicalSha256(final.gate), reportCapture: capture('result') },
      finalGate: { resultDigest: canonicalSha256(final), result: final } },
    publish: { outputRef: 'refs/unknown-knowledge/candidates/12345678-1234-4123-8123-123456789abc', expectedOldCommit: null } };
  f.git('update-ref', request.source.ref, f.source.commit);
  const writer = (value = request) => ({ repoRoot: f.root, evidenceDirectory: f.evidenceDirectory, request: value,
    approvedRuntimeProfile: f.approvedRuntimeProfile, limits: reviewLimits, executionLimits: runtimeLimits,
    authorization: { outcome: 'approved', requestDigest: canonicalSha256(value), reference: 'synthetic isolated test authorization',
      bytes: Buffer.from('Synthetic exact-request authorization for this isolated test only.') } });
  const publisher = saved => ({ repoRoot: f.root, evidenceDirectory: f.evidenceDirectory,
    validationBundleDigest: request.evidence.bundleDigest, reviewBundleDigest: saved.reviewBundleDigest,
    expectedRequestDigest: saved.requestDigest, approvedRuntimeProfile: f.approvedRuntimeProfile,
    limits: { review: reviewLimits, execution: runtimeLimits,
      transaction: { maxOutputBytes: 100000, maxCommandMilliseconds: 3000, maxTransactionMilliseconds: 15000, maxWorktrees: 10 } } });
  return { ...f, final, request, writer, publisher };
}

export function splitMaterialEvidenceVariant(f, edit) {
  const artifacts = f.retained.artifacts.map(({ file, bytes }) => ({ file, bytes: Buffer.from(bytes) }));
  edit(artifacts);
  const retained = retainPreparedEvidence({ evidenceDirectory: f.evidenceDirectory, repoRoot: f.root,
    runtimeRoot: f.root, binding: f.finalInput.expected, artifacts });
  assert.equal(retained.status, 'retained', JSON.stringify(retained));
  return { ...f.finalInput, validationBundleDigest: retained.bundleDigest };
}
