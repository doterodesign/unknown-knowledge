/** Actual two reconsidered meanings, followed by the fixed positive equivalent merge. */
import assert from 'node:assert/strict';
import { priorReconsideredLifecycleFixture, lifecycleKnowledgeFile as leaf } from './subject-lifecycle-material-fixture.js';
import { mergeInput } from './equivalent-merge-input-fixture.js';
import { stateOf, wire, digestEvent } from './subject-reconsideration-fixture.js';
import { loadStores } from '../../payload/engine/lib/load-stores.js';
import { iterateCurrentRecords, iterateProposalRecords } from '../../payload/engine/lib/record-identity.js';
import { readAssignments } from '../../payload/engine/lib/subject-assignments.js';
import { describeCandidateBytes } from '../../payload/engine/lib/captured-source.js';
import { sealAssignmentEvent } from './assignment-event-fixture.js';
import { assignmentEventDigest } from '../../payload/engine/lib/assignment-event.js';

export async function subjectMergeMaterialFixture(t, { objectFormat = 'sha1', nested = false } = {}) {
  const f = await priorReconsideredLifecycleFixture(t, { objectFormat, nested, priorReconsideration: true });
  const input = mergeInput(); input.repoRoot = f.root;
  input.operation.absorbed = ['S-000002']; input.operation.survivor = 'S-000001';
  input.evidence = f.evidence; input.limits.governance = { ...f.limits.governance };
  const file = 'knowledge/K-000001.md', body = 'Original body K-000001.\n';
  const record = JSON.parse(f.read(file).split('---')[1]); record.subjects = ['S-000002'];
  f.put(file, leaf(record, body)); input.before = f.commit('actual reconsidered meanings before equivalent merge');
  const before = loadStores(f.kitRoot); assert.equal(before.ok, true, JSON.stringify(before.diagnostics));
  input.operation.retainedUnknowns = [...iterateCurrentRecords(before, { kinds: ['knowledge','ontology','decision'] }),
    ...iterateProposalRecords(before, { kinds: ['knowledge','ontology','decision'] })]
    .filter(row => readAssignments(row.entry).state === 'unknown')
    .map(row => ({ ...(row.ref ? { ref: row.ref } : { proposalRef: row.proposalRef }), reason: 'Preserve absent classification' }));
  const document = structuredClone(before.subjectRegistry.document), authorizer = document.history.at(-1);
  const source = document.subjects.find(row => row.id === 'S-000002'), survivor = document.subjects.find(row => row.id === 'S-000001');
  const event = { id: input.operation.registryEvents[0].id, action: 'merge-equivalent', decision: authorizer.decision,
    reason: 'Reviewed equivalent meaning', rows: [
      { id: source.id, before: stateOf(source), after: { ...stateOf(source), status: 'retired', retirement: { kind: 'equivalent-merge', redirect: survivor.id } }, reason: 'Use the survivor' },
      { id: survivor.id, before: stateOf(survivor), after: stateOf(survivor), reason: 'Preserve the survivor meaning' }] };
  event.review = { ...authorizer.review, reference: 'review:material-merge', changeDigest: digestEvent(event) };
  for (const row of event.rows) {
    const subject = document.subjects.find(item => item.id === row.id); Object.assign(subject, row.after); subject.changes.push(event.id);
  }
  document.history.push(event); document.revision++; f.put('subjects/registry.yaml', wire(document));
  input.operation.registryEvents[0].changeDigest = event.review.changeDigest;
  const captured = f.capture(input.before, file), ref = { namespace: before.identity.namespace, kind: 'knowledge', id: record.id };
  f.put(file, leaf({ ...record, subjects: [survivor.id] }, body, { type: 'revision', date: input.reviewNote.date,
    text: `Classification review by ${input.reviewNote.author} using ${input.reviewNote.skill}: subjects ${survivor.id}. Existing evidence metadata retained.` }));
  const row = { ref, before: { state: 'known', ids: record.subjects }, after: { state: 'known', ids: [survivor.id] },
    'before-revision': 0, 'after-revision': 1, disposition: 'changed', reason: 'Apply equivalent meaning',
    'before-capture': captured.capture, 'after-capture': describeCandidateBytes({file:captured.capture.file,bytes:Buffer.from(f.read(file)),objectFormat}) };
  const assignmentEvent = sealAssignmentEvent({ 'schema-version':2,event:input.operation.assignmentEvent.id,namespace:before.identity.namespace,
    operation:'subject-use-transition',scope:{kind:'subject-use-transition',operation:input.operation.id,action:'merge-equivalent',
      survivor:survivor.id,absorbed:[source.id],'registry-events':[event.id]},
    'before-input':{commit:input.before.commit,tree:input.before.tree,'kit-path':input.before.kitPath},decision:event.decision,
    review:{reference:event.review.reference,'accepted-status':event.review.acceptedStatus,'decision-capture':event.review.decisionCapture,'decision-digest':event.review.decisionDigest},rows:[row] });
  f.put('subjects/_assignments/_baselines.yaml',{'schema-version':1,namespace:before.identity.namespace,baselines:[{ref,state:row.before,capture:row['before-capture']}]});
  f.put(`subjects/_assignments/${assignmentEvent.event}.yaml`,assignmentEvent);
  input.operation.assignmentEvent.changeDigest=assignmentEventDigest(assignmentEvent);
  input.candidate=f.commit('actual equivalent merge of reconsidered meanings');
  return {...f,input,document,event,assignmentEvent,zero:false};
}

import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { equivalentMergeInputWire } from '../../payload/engine/lib/subject-equivalent-merge-input.js';
import { runPreparedCandidateChecks } from '../../payload/engine/lib/prepared-validation.js';
import { readRetainedPreparedEvidence, retainPreparedEvidence, artifactCapture } from '../../payload/engine/lib/prepared-evidence.js';
import { canonicalSha256 } from '../../payload/engine/lib/canonical-json.js';
import { runFinalPreparedEquivalentMergeGate } from '../../payload/engine/lib/final-prepared-equivalent-merge.js';
import { verifyRetainedRuntimeCapability } from '../../payload/engine/lib/runtime-capability.js';

export const runtimeLimits = { maxRuntimeFiles: 3000, maxRuntimeBytes: 30000000, maxOutputBytesPerCheck: 20000000, maxCheckMilliseconds: 60000 };
export const evidenceLimits = { maxManifestBytes: 2000000, maxArtifacts: 4000, maxArtifactBytes: 30000000, maxTotalArtifactBytes: 200000000 };
export const reviewLimits = { ...evidenceLimits, maxRequestBytes: 20000000, maxAuthorizationBytes: 10000, maxReceiptBytes: 100000 };

/** Actual prepared worker/readback only; the final owner is a separate explicit call. */
export async function finalSubjectMergeMaterialFixture(t, options = {}, factory = subjectMergeMaterialFixture) {
  const f = await factory(t, options);
  const evidenceDirectory = mkdtempSync(join(f.root, '..', 'merge-material-evidence-'));
  t.after(() => rmSync(evidenceDirectory, { recursive: true, force: true }));
  const operationInputs = { gateInput: equivalentMergeInputWire(f.input), captureLimits: { maxRegistryBytes: 1000000, maxEventBytes: 1000000 } };
  const source = f.input.before, candidate = f.input.candidate;
  const validation = await runPreparedCandidateChecks({ repoRoot: f.root, source, candidate, operation: 'subject-equivalent-merge',
    operationInputs, evidenceDirectory, limits: runtimeLimits });
  assert.equal(validation.retention?.status, 'retained', JSON.stringify(validation));
  const expected = { source, candidate, operation: 'subject-equivalent-merge', runtimeDigest: validation.runtimeDigest, reportDigest: validation.reportDigest };
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
export async function reviewSubjectMergeMaterialFixture(t, options = {}, factory = subjectMergeMaterialFixture) {
  const f = await finalSubjectMergeMaterialFixture(t, options, factory);
  const final = await runFinalPreparedEquivalentMergeGate(f.finalInput);
  assert.equal(final.status, 'passed', JSON.stringify(final));
  const capability = verifyRetainedRuntimeCapability(f.validationInput, f.approvedRuntimeProfile);
  assert.equal(capability.status, 'established', JSON.stringify(capability));
  assert.equal(final.capability.resultDigest, canonicalSha256(capability));
  const capture = file => {
    const row = f.retained.artifacts.find(row => row.file === `checks/operation/${file}`);
    return artifactCapture(row.file, row.bytes);
  };
  const request = { version: 1, operation: 'subject-equivalent-merge', namespace: final.gate.decision.ref.namespace,
    objectFormat: f.source.commit.length === 40 ? 'sha1' : 'sha256',
    source: { ref: 'refs/heads/source', expectedCommit: f.source.commit, tree: f.source.tree, kitPath: f.source.kitPath },
    candidate: f.candidate, runtimeDigest: f.validation.runtimeDigest, policy: { id: final.policy.id, digest: final.policy.digest },
    evidence: { bundleDigest: f.validationInput.bundleDigest, reportDigest: f.validation.reportDigest },
    runtimeCapability: { profileDigest: f.approvedRuntimeProfile.digest, resultDigest: canonicalSha256(capability), result: capability },
    operationEvidence: { kind: 'subject-equivalent-merge', operationId: final.gate.operation.id,
      registryEvents: structuredClone(final.gate.sources.registryEvents), registryCapture: capture('registry.yaml'),
      assignmentEvent: f.zero ? null : { eventId: final.gate.sources.assignmentEvent.eventId,
        eventDigest: final.gate.sources.assignmentEvent.eventDigest, eventCapture: capture('event.yaml') },
      validation: { inputDigest: final.gate.inputDigest,
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

export function mergeMaterialEvidenceVariant(f, edit) {
  const artifacts = f.retained.artifacts.map(({ file, bytes }) => ({ file, bytes: Buffer.from(bytes) }));
  edit(artifacts);
  const retained = retainPreparedEvidence({ evidenceDirectory: f.evidenceDirectory, repoRoot: f.root,
    runtimeRoot: f.root, binding: f.finalInput.expected, artifacts });
  assert.equal(retained.status, 'retained', JSON.stringify(retained));
  return { ...f.finalInput, validationBundleDigest: retained.bundleDigest };
}
