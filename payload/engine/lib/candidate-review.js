import { verifySubjectMetadataReviewEvidence, verifySubjectProposalSuppressionReviewEvidence } from './candidate-review-metadata.js';
import { verifySubjectCreationReviewEvidence } from './candidate-review-creation.js';
import { lifecycleMaterialPresent } from './subject-lifecycle-input.js';
/** Fixed retained review tuple. Approval authenticity belongs to trusted orchestration. */
import { readFileSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { join, resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { canonicalJsonBytes, canonicalSha256, CapturedInputError } from './canonical-json.js';
import { EngineRefusal } from './engine-refusal.js';
import { isIdentityUuid, parseCanonicalId } from './record-identity.js';
import { isCaptureLocator } from './capture-locator.js';
import { load as loadYaml, YAMLException } from 'js-yaml';
import { readBoundPreparedAssignmentInput } from './prepared-assignment-binding.js';
import { assignmentEventDigest, validateAssignmentEventMetadata } from './assignment-event.js';
import { validateStoreFile } from './validate-record.js';
import { runFinalPreparedAssignmentGate } from './final-prepared-assignment.js';
import { runFinalPreparedPromotionGate, runFinalPreparedRecordPromotionGate } from './final-prepared-promotion.js';
import { runFinalPreparedEquivalentMergeGate } from './final-prepared-equivalent-merge.js';
import { isPreparedEquivalentMergeReport } from './prepared-equivalent-merge.js';
import { runFinalPreparedSubjectRetirementGate } from './final-prepared-subject-retirement.js';
import { decodePreparedSubjectRetirement, isPreparedSubjectRetirementReport } from './prepared-subject-retirement.js';
import { runFinalPreparedMigrationGate } from './final-prepared-migration.js';
import { readRetainedPreparedEvidence, rawSha256, artifactCapture } from './prepared-evidence.js';
import { verifyRetainedRuntimeCapability } from './runtime-capability.js';
import { isPreparedMigrationReport } from './prepared-migration-report.js';
import { verifySubjectSplitReviewEvidence } from './candidate-review-split.js';
import { verifySubjectReconsiderationReviewEvidence } from './candidate-review-reconsideration.js';
import { directory, readOwnedFile, verifyFile, finalizedFile, install, syncDirectory } from './prepared-evidence-files.js';

const policyFile = 'engine/policies/candidate-publication.json';
const policyBytes = readFileSync(new URL('../policies/candidate-publication.json', import.meta.url));
const policies = JSON.parse(policyBytes);
const limitKeys = ['maxManifestBytes', 'maxArtifacts', 'maxArtifactBytes', 'maxTotalArtifactBytes',
  'maxRequestBytes', 'maxAuthorizationBytes', 'maxReceiptBytes'];
const names = ['authorization.txt', 'receipt.json', 'request.json'];
const classLimit = { 'authorization.txt': 'maxAuthorizationBytes', 'receipt.json': 'maxReceiptBytes', 'request.json': 'maxRequestBytes' };
const closed = (v, keys) => v !== null && typeof v === 'object'
  && [Object.prototype, null].includes(Object.getPrototypeOf(v))
  && Reflect.ownKeys(v).length === keys.length && keys.every((key) => Object.hasOwn(v, key));
const hash = (v) => typeof v === 'string' && /^[0-9a-f]{64}(?![\s\S])/.test(v);
const oid = (v, n) => typeof v === 'string' && new RegExp(`^[0-9a-f]{${n}}(?![\\s\\S])`).test(v);
const text = (v) => typeof v === 'string' && v.length > 0 && !v.includes('\0') && Buffer.from(v).toString('utf8') === v;
const sourceRef = (v) => text(v) && /^refs\/heads\/[A-Za-z0-9][A-Za-z0-9._-]*(?:\/[A-Za-z0-9][A-Za-z0-9._-]*)*(?![\s\S])/.test(v)
  && !v.includes('..') && v.split('/').every((part) => !part.endsWith('.') && !part.endsWith('.lock'));
const outputRef = (v) => text(v) && v.startsWith('refs/unknown-knowledge/candidates/')
  && isIdentityUuid(v.slice('refs/unknown-knowledge/candidates/'.length));
const within = (root, target) => { const rel = relative(root, target); return rel === '' || (!rel.startsWith('../') && rel !== '..' && !isAbsolute(rel)); };
class ReviewRefusal extends EngineRefusal { constructor(code) { super(code); this.code = code; } }
const refuse = (code) => { throw new ReviewRefusal(code); };
function validateLimits(limits) {
  if (!closed(limits, limitKeys) || !limitKeys.every((key) => Number.isSafeInteger(limits[key]) && limits[key] > 0)
    || limits.maxArtifacts < 3) refuse('invalid-review-limits');
}
function boundedJson(value, limit) {
  // Bound work before canonical encoding, including cyclic or deeply nested caller objects.
  let remaining = limit * 4 + 100; const pending = [{ value, depth: 0 }];
  while (pending.length) {
    const { value: item, depth } = pending.pop();
    if (--remaining < 0 || depth > 64) refuse('review-json-budget');
    if (typeof item === 'string') remaining -= Buffer.byteLength(item);
    else if (item !== null && typeof item === 'object') {
      const keys = Reflect.ownKeys(item);
      if (keys.length > remaining) refuse('review-json-budget');
      for (const key of keys) {
        if (typeof key !== 'string') refuse('review-json-shape');
        remaining -= Buffer.byteLength(key);
        if (remaining < 0) refuse('review-json-budget');
        pending.push({ value: item[key], depth: depth + 1 });
      }
    }
    if (remaining < 0) refuse('review-json-budget');
  }
  let bytes;
  try { bytes = canonicalJsonBytes(value); }
  catch (error) { if (!(error instanceof CapturedInputError)) throw error; refuse('review-json-shape'); }
  if (bytes.length > limit) refuse('review-json-budget');
  return bytes;
}
function document(bytes, canonical = true) {
  let value;
  try { value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { refuse('review-json-invalid'); }
  if (canonical && !boundedJson(value, bytes.length * 4 + 100).equals(bytes)) refuse('review-json-noncanonical');
  return value;
}
function requestShape(request) {
  if (!closed(request, ['version', 'operation', 'namespace', 'objectFormat', 'source', 'candidate',
    'runtimeDigest', 'policy', 'evidence', 'runtimeCapability', 'operationEvidence', 'publish'])
    || request.version !== 1 || !['identity-migration', 'subject-assignment', 'subject-equivalent-merge', 'subject-retirement', 'subject-split', 'subject-reconsideration', 'subject-metadata', 'subject-proposal-suppression', 'subject-creation', 'ordinary-promotion', 'typed-record-promotion'].includes(request.operation)
    || !isIdentityUuid(request.namespace) || !['sha1', 'sha256'].includes(request.objectFormat)
    || !closed(request.source, ['ref', 'expectedCommit', 'tree', 'kitPath']) || !sourceRef(request.source.ref)
    || !closed(request.candidate, ['commit', 'tree', 'kitPath'])
    || ![request.source.kitPath, request.candidate.kitPath].every((path) => ['.', 'unknown-knowledge'].includes(path))
    || !hash(request.runtimeDigest) || !closed(request.policy, ['id', 'digest'])
    || !text(request.policy.id) || !hash(request.policy.digest)
    || !closed(request.evidence, ['bundleDigest', 'reportDigest']) || !Object.values(request.evidence).every(hash)
    || !closed(request.runtimeCapability, ['profileDigest', 'resultDigest', 'result'])
    || (request.runtimeCapability.profileDigest !== null && !hash(request.runtimeCapability.profileDigest))
    || !hash(request.runtimeCapability.resultDigest) || !closed(request.publish, ['outputRef', 'expectedOldCommit'])
    || !outputRef(request.publish.outputRef)) refuse('invalid-review-request');
  if (canonicalSha256(request.runtimeCapability.result) !== request.runtimeCapability.resultDigest) refuse('review-capability-mismatch');
  const width = request.objectFormat === 'sha1' ? 40 : 64;
  if (![request.source.expectedCommit, request.source.tree, request.candidate.commit, request.candidate.tree].every((v) => oid(v, width))
    || (request.publish.expectedOldCommit !== null && !oid(request.publish.expectedOldCommit, width))) refuse('invalid-review-request');
  const operation = request.operationEvidence;
  if (request.operation === 'identity-migration') {
    const final = Object.hasOwn(operation ?? {}, 'finalGate');
    if (!closed(operation, ['kind', 'validationInputDigest', 'validationCapture', 'scopeCapture', ...(final ? ['finalGate'] : [])])
      || operation.kind !== request.operation || !hash(operation.validationInputDigest)) refuse('invalid-review-operation-evidence');
    if (final && (!closed(operation.finalGate, ['resultDigest', 'result']) || !hash(operation.finalGate.resultDigest)
      || canonicalSha256(operation.finalGate.result) !== operation.finalGate.resultDigest)) refuse('invalid-review-operation-evidence');
  } else if (request.operation === 'subject-split') {
    if (!closed(operation, ['kind', 'operationId', 'registryEvents', 'registryCapture', 'identityCapture', 'assignmentEvent', 'decision', 'validation', 'finalGate'])
      || operation.kind !== request.operation || !isIdentityUuid(operation.operationId)
      || !Array.isArray(operation.registryEvents) || operation.registryEvents.length !== 2
      || operation.registryEvents[0]?.id === operation.registryEvents[1]?.id
      || !operation.registryEvents.every(row => closed(row, ['id', 'changeDigest']) && isIdentityUuid(row.id) && hash(row.changeDigest))
      || (operation.assignmentEvent !== null && (!closed(operation.assignmentEvent, ['eventId', 'eventDigest', 'eventCapture'])
        || !isIdentityUuid(operation.assignmentEvent.eventId) || !hash(operation.assignmentEvent.eventDigest)))
      || !closed(operation.decision, ['ref', 'reference', 'acceptedStatus', 'decisionDigest', 'decisionCapture'])
      || !closed(operation.decision.ref, ['namespace', 'kind', 'id']) || operation.decision.ref.namespace !== request.namespace
      || operation.decision.ref.kind !== 'decision' || !parseCanonicalId('decision', operation.decision.ref.id).ok
      || !text(operation.decision.reference) || !['accepted', 'addressed'].includes(operation.decision.acceptedStatus)
      || !hash(operation.decision.decisionDigest) || !isCaptureLocator(operation.decision.decisionCapture)
      || !closed(operation.validation, ['inputDigest', 'inputCapture', 'reportDigest', 'reportCapture'])
      || !hash(operation.validation.inputDigest) || !hash(operation.validation.reportDigest)
      || !closed(operation.finalGate, ['resultDigest', 'result']) || !hash(operation.finalGate.resultDigest)
      || canonicalSha256(operation.finalGate.result) !== operation.finalGate.resultDigest) refuse('invalid-review-split-operation-evidence');
  } else if (['subject-metadata','subject-proposal-suppression'].includes(request.operation)) {
    if (!closed(operation, ['kind','operationId','registryEvent','registryCapture','validation','finalGate'])
      || operation.kind !== request.operation || !isIdentityUuid(operation.operationId)
      || !closed(operation.registryEvent,['id','changeDigest']) || !isIdentityUuid(operation.registryEvent.id) || !hash(operation.registryEvent.changeDigest)
      || !closed(operation.validation,['inputDigest','inputCapture','reportDigest','reportCapture'])
      || !hash(operation.validation.inputDigest) || !hash(operation.validation.reportDigest)
      || !closed(operation.finalGate,['resultDigest','result']) || !hash(operation.finalGate.resultDigest)
      || canonicalSha256(operation.finalGate.result) !== operation.finalGate.resultDigest) refuse('invalid-review-metadata-operation-evidence');
  } else if (['subject-reconsideration', 'subject-creation'].includes(request.operation)) {
    if (!closed(operation, ['kind', 'operationId', 'registryEvents', 'registryCapture', 'identityCapture', 'assignmentEvent', 'decision', 'validation', 'finalGate'])
      || operation.kind !== request.operation || !isIdentityUuid(operation.operationId)
      || !Array.isArray(operation.registryEvents) || operation.registryEvents.length !== 1
      || !operation.registryEvents.every(row => closed(row, ['id', 'changeDigest']) && isIdentityUuid(row.id) && hash(row.changeDigest))
      || operation.assignmentEvent !== null
      || !closed(operation.decision, ['ref', 'reference', 'acceptedStatus', 'decisionDigest', 'decisionCapture'])
      || !closed(operation.decision.ref, ['namespace', 'kind', 'id']) || operation.decision.ref.namespace !== request.namespace
      || operation.decision.ref.kind !== 'decision' || !parseCanonicalId('decision', operation.decision.ref.id).ok
      || !text(operation.decision.reference) || !['accepted', 'addressed'].includes(operation.decision.acceptedStatus)
      || !hash(operation.decision.decisionDigest) || !isCaptureLocator(operation.decision.decisionCapture)
      || !closed(operation.validation, ['inputDigest', 'inputCapture', 'reportDigest', 'reportCapture'])
      || !hash(operation.validation.inputDigest) || !hash(operation.validation.reportDigest)
      || !closed(operation.finalGate, ['resultDigest', 'result']) || !hash(operation.finalGate.resultDigest)
      || canonicalSha256(operation.finalGate.result) !== operation.finalGate.resultDigest) refuse('invalid-review-reconsideration-operation-evidence');
  } else if (request.operation === 'subject-retirement') {
    if (!closed(operation, ['kind', 'operationId', 'registryEvents', 'registryCapture', 'assignmentEvent', 'decision', 'validation', 'finalGate'])
      || operation.kind !== request.operation || !isIdentityUuid(operation.operationId)
      || !Array.isArray(operation.registryEvents) || operation.registryEvents.length !== 1
      || !operation.registryEvents.every(row => closed(row, ['id', 'changeDigest']) && isIdentityUuid(row.id) && hash(row.changeDigest))
      || (operation.assignmentEvent !== null && (!closed(operation.assignmentEvent, ['eventId', 'eventDigest', 'eventCapture'])
        || !isIdentityUuid(operation.assignmentEvent.eventId) || !hash(operation.assignmentEvent.eventDigest)))
      || !closed(operation.decision, ['ref', 'reference', 'acceptedStatus', 'decisionDigest', 'decisionCapture'])
      || !closed(operation.decision.ref, ['namespace', 'kind', 'id']) || operation.decision.ref.namespace !== request.namespace
      || operation.decision.ref.kind !== 'decision' || !parseCanonicalId('decision', operation.decision.ref.id).ok
      || !text(operation.decision.reference) || !['accepted', 'addressed'].includes(operation.decision.acceptedStatus)
      || !hash(operation.decision.decisionDigest) || !isCaptureLocator(operation.decision.decisionCapture)
      || !closed(operation.validation, ['inputDigest', 'inputCapture', 'reportDigest', 'reportCapture'])
      || !hash(operation.validation.inputDigest) || !hash(operation.validation.reportDigest)
      || !closed(operation.finalGate, ['resultDigest', 'result']) || !hash(operation.finalGate.resultDigest)
      || canonicalSha256(operation.finalGate.result) !== operation.finalGate.resultDigest) refuse('invalid-review-retirement-operation-evidence');
  } else if (request.operation === 'subject-equivalent-merge') {
    if (!closed(operation, ['kind', 'operationId', 'registryEvents', 'registryCapture', 'assignmentEvent', 'validation', 'finalGate'])
      || operation.kind !== request.operation || !isIdentityUuid(operation.operationId) || !Array.isArray(operation.registryEvents)
      || operation.registryEvents.length === 0 || !operation.registryEvents.every((row) => closed(row, ['id', 'changeDigest']) && isIdentityUuid(row.id) && hash(row.changeDigest))
      || (operation.assignmentEvent !== null && (!closed(operation.assignmentEvent, ['eventId', 'eventDigest', 'eventCapture']) || !isIdentityUuid(operation.assignmentEvent.eventId) || !hash(operation.assignmentEvent.eventDigest)))
      || !closed(operation.validation, ['inputDigest', 'inputCapture', 'reportDigest', 'reportCapture'])
      || !hash(operation.validation.inputDigest) || !hash(operation.validation.reportDigest)
      || !closed(operation.finalGate, ['resultDigest', 'result']) || !hash(operation.finalGate.resultDigest)
      || canonicalSha256(operation.finalGate.result) !== operation.finalGate.resultDigest) refuse('invalid-review-operation-evidence');
  } else if (['ordinary-promotion', 'typed-record-promotion'].includes(request.operation)) {
    if (!closed(operation, ['kind', 'publicationId', 'createdRefs', 'promotion', 'assignmentEvent', 'finalGate'])
      || operation.kind !== request.operation || !isIdentityUuid(operation.publicationId) || !Array.isArray(operation.createdRefs)
      || operation.createdRefs.length === 0 || !operation.createdRefs.every((ref) => closed(ref, ['namespace', 'kind', 'id'])
        && ref.namespace === request.namespace && (request.operation === 'ordinary-promotion'
          ? ref.kind === 'decision' && /^D-[0-9]{6}$/.test(ref.id)
          : ref.kind === operation.createdRefs[0].kind && ((ref.kind === 'ontology' && /^O-[0-9]{6}$/.test(ref.id))
            || (ref.kind === 'knowledge' && /^K-[0-9]{6}$/.test(ref.id))
            || (ref.kind === 'decision' && /^D-[0-9]{6}$/.test(ref.id)))))
      || !closed(operation.promotion, ['inputDigest', 'inputCapture', 'reportDigest', 'reportCapture'])
      || !hash(operation.promotion.inputDigest) || !hash(operation.promotion.reportDigest)
      || !closed(operation.assignmentEvent, ['eventId', 'eventDigest', 'eventCapture']) || !isIdentityUuid(operation.assignmentEvent.eventId)
      || !hash(operation.assignmentEvent.eventDigest) || !closed(operation.finalGate, ['resultDigest', 'result'])
      || !hash(operation.finalGate.resultDigest) || canonicalSha256(operation.finalGate.result) !== operation.finalGate.resultDigest) refuse('invalid-review-promotion-evidence');
  } else {
    if (!closed(operation, ['kind', 'event', 'eventCapture', 'eventDigest', 'finalGate']) || operation.kind !== request.operation
      || !isIdentityUuid(operation.event) || !hash(operation.eventDigest)
      || !closed(operation.finalGate, ['resultDigest', 'result']) || !hash(operation.finalGate.resultDigest)
      || canonicalSha256(operation.finalGate.result) !== operation.finalGate.resultDigest) refuse('invalid-review-operation-evidence');
  }
}
function member(capture, artifacts) {
  if (!closed(capture, ['kind', 'file', 'size', 'sha256']) || capture.kind !== 'detached-artifact') refuse('invalid-review-capture');
  const row = artifacts.find((entry) => entry.file === capture.file);
  if (!row || row.size !== capture.size || row.sha256 !== capture.sha256) refuse('review-capture-not-retained');
  return row;
}
const validationInput = (directory, request, limits) => ({ evidenceDirectory: directory,
  bundleDigest: request.evidence.bundleDigest, expected: {
    source: { commit: request.source.expectedCommit, tree: request.source.tree, kitPath: request.source.kitPath },
    candidate: request.candidate, operation: request.operation, runtimeDigest: request.runtimeDigest,
    reportDigest: request.evidence.reportDigest }, limits: Object.fromEntries(limitKeys.slice(0, 4).map((key) => [key, limits[key]])) });

/** Shared writer/publisher check: actual bundle readback and actual capability recomputation. */
export async function verifyCandidateReviewEvidence({ repoRoot, evidenceDirectory, request, approvedRuntimeProfile, limits, executionLimits, migration = null, approvedInstallationReview = null }) {
  validateLimits(limits); requestShape(request);
  const readInput = validationInput(evidenceDirectory, request, limits);
  const retained = readRetainedPreparedEvidence(readInput);
  if (retained.status !== 'verified') refuse('review-validation-retention-unavailable');
  const reviewOnly = request.operation === 'identity-migration' && !Object.hasOwn(request.operationEvidence, 'finalGate');
  const assignmentInput = request.operation === 'subject-assignment' ? readBoundPreparedAssignmentInput(retained, readInput.expected) : null;
  const typedAssignment = assignmentInput !== null && Object.hasOwn(assignmentInput.operationInputs, 'selection');
  const trustedPolicy = typedAssignment ? policies.typedSubjectAssignment : reviewOnly ? policies.reviewOnlyMigration
    : request.operation === 'identity-migration' && migration?.migrationInputs?.installation ? policies.installationCutover : policies.operations[request.operation];
  const artifact = retained.artifacts.find((row) => row.file === `runtime/files/${policyFile}`);
  if (!trustedPolicy || !artifact || !artifact.bytes.equals(policyBytes)
    || request.policy.id !== trustedPolicy.id || request.policy.digest !== canonicalSha256(trustedPolicy)) refuse('review-policy-mismatch');
  const capability = verifyRetainedRuntimeCapability(readInput, approvedRuntimeProfile);
  if (approvedRuntimeProfile !== null && (capability.diagnostics.some(({ code }) => code === 'runtime-profile-mismatch')
    || !closed(approvedRuntimeProfile, ['digest', 'profile']) || !hash(approvedRuntimeProfile.digest))) refuse('review-profile-invalid');
  if (capability.diagnostics.some(({ code }) => code === 'retained-evidence-unavailable')) refuse('review-validation-retention-unavailable');
  if (request.runtimeCapability.profileDigest !== (approvedRuntimeProfile === null ? null : approvedRuntimeProfile.digest)
    || request.runtimeCapability.resultDigest !== canonicalSha256(capability)
    || !isDeepStrictEqual(request.runtimeCapability.result, capability)) refuse('review-capability-mismatch');
  if (request.operation === 'subject-assignment') {
    const proof = request.operationEvidence;
    const artifact = member(proof.eventCapture, retained.artifacts);
    const eventSource = retained.report.eventSource;
    if (artifact.file !== 'checks/operation/event.yaml' || !eventSource
      || eventSource.eventId !== proof.event || eventSource.eventDigest !== proof.eventDigest
      || !isDeepStrictEqual(eventSource.candidate, request.candidate)
      || !isDeepStrictEqual(eventSource.capture, proof.eventCapture)) refuse('review-assignment-evidence-unavailable');
    let event;
    const eventText = artifact.bytes.toString('utf8');
    if (!Buffer.from(eventText).equals(artifact.bytes)) refuse('review-assignment-event-invalid');
    try { event = loadYaml(eventText); }
    catch (error) {
      if (!(error instanceof YAMLException)) throw error;
      refuse('review-assignment-event-invalid');
    }
    if (!validateAssignmentEventMetadata(event).ok || event.event !== proof.event || event.namespace !== request.namespace
      || assignmentEventDigest(event) !== proof.eventDigest
      || (typedAssignment ? event['schema-version'] !== 2 || event.operation !== 'existing-subjects'
        || !isDeepStrictEqual(event.scope, assignmentInput.operationInputs.selection) : event['schema-version'] !== 1)) refuse('review-assignment-event-invalid');
    const finalGate = await runFinalPreparedAssignmentGate({ repoRoot, evidenceDirectory,
      validationBundleDigest: readInput.bundleDigest, expected: readInput.expected, approvedRuntimeProfile,
      limits: { evidence: readInput.limits, runtime: executionLimits } });
    if (canonicalSha256(finalGate) !== proof.finalGate.resultDigest
      || !isDeepStrictEqual(finalGate, proof.finalGate.result)) refuse('review-final-gate-mismatch');
    return { retained, capability, operationReport: finalGate, event };
  }
  if (request.operation === 'subject-split') {
    const proof = request.operationEvidence;
    if (proof.assignmentEvent === null && retained.artifacts.some(row => row.file === 'checks/operation/event.yaml')) refuse('review-split-unexpected-event');
    const artifacts = { registry: member(proof.registryCapture, retained.artifacts), identity: member(proof.identityCapture, retained.artifacts),
      input: member(proof.validation.inputCapture, retained.artifacts), report: member(proof.validation.reportCapture, retained.artifacts),
      event: proof.assignmentEvent === null ? null : member(proof.assignmentEvent.eventCapture, retained.artifacts) };
    const checked = await verifySubjectSplitReviewEvidence({ repoRoot, request, artifacts, validationInput: readInput, approvedRuntimeProfile, executionLimits });
    return { retained, capability, ...checked };
  }
  if (['subject-metadata','subject-proposal-suppression'].includes(request.operation)) {
    const proof = request.operationEvidence;
    if (retained.artifacts.some(row => ['checks/operation/event.yaml','checks/operation/identity.yaml'].includes(row.file))) refuse('review-metadata-unexpected-artifact');
    const artifacts = { registry: member(proof.registryCapture,retained.artifacts),
      input: member(proof.validation.inputCapture,retained.artifacts), report: member(proof.validation.reportCapture,retained.artifacts) };
    const checked = await (request.operation === 'subject-proposal-suppression'?verifySubjectProposalSuppressionReviewEvidence:verifySubjectMetadataReviewEvidence)({repoRoot,request,artifacts,validationInput:readInput,approvedRuntimeProfile,executionLimits});
    return {retained,capability,...checked};
  }
  if (['subject-reconsideration', 'subject-creation'].includes(request.operation)) {
    const proof = request.operationEvidence;
    if (retained.artifacts.some(row => row.file === 'checks/operation/event.yaml')) refuse('review-reconsideration-unexpected-event');
    const artifacts = { registry: member(proof.registryCapture, retained.artifacts), identity: member(proof.identityCapture, retained.artifacts),
      input: member(proof.validation.inputCapture, retained.artifacts), report: member(proof.validation.reportCapture, retained.artifacts) };
    const checked = await (request.operation === 'subject-creation' ? verifySubjectCreationReviewEvidence : verifySubjectReconsiderationReviewEvidence)({ repoRoot, request, artifacts,
      validationInput: readInput, approvedRuntimeProfile, executionLimits });
    return { retained, capability, ...checked };
  }
  if (request.operation === 'subject-retirement') {
    const proof = request.operationEvidence;
    const registry = member(proof.registryCapture, retained.artifacts);
    const inputArtifact = member(proof.validation.inputCapture, retained.artifacts);
    const reportArtifact = member(proof.validation.reportCapture, retained.artifacts);
    if (registry.file !== 'checks/operation/registry.yaml' || inputArtifact.file !== 'checks/operation/input.json'
      || reportArtifact.file !== 'checks/operation/result') refuse('review-retirement-capture-mismatch');
    const wire = document(inputArtifact.bytes);
    const admitted = lifecycleMaterialPresent(wire) ? wire : decodePreparedSubjectRetirement(repoRoot, wire);
    const gate = document(reportArtifact.bytes, false);
    const expected = { source: readInput.expected.source, candidate: request.candidate };
    if (!isPreparedSubjectRetirementReport(gate, expected, wire) || !gate.ok
      || canonicalSha256(wire) !== proof.validation.inputDigest || gate.inputDigest !== proof.validation.inputDigest
      || canonicalSha256(gate) !== proof.validation.reportDigest || gate.operation.id !== proof.operationId
      || !isDeepStrictEqual(gate.sources.registryEvents, proof.registryEvents)
      || gate.sources.registryCapture.sha256 !== registry.sha256 || !isDeepStrictEqual(gate.decision, proof.decision)) {
      refuse('review-retirement-binding-mismatch');
    }
    let registryDocument;
    try { registryDocument = loadYaml(new TextDecoder('utf-8', { fatal: true }).decode(registry.bytes)); }
    catch (error) { if (!(error instanceof YAMLException || error instanceof TypeError)) throw error; refuse('review-retirement-registry-invalid'); }
    if (!validateStoreFile('subject-registry', registryDocument).ok || registryDocument.namespace !== request.namespace) {
      refuse('review-retirement-registry-invalid');
    }
    const selected = registryDocument.history.filter(row => row.id === proof.registryEvents[0].id);
    const registryEvent = selected[0];
    // The exact raw registry is bound to the retained and fresh owner. Its wire
    // event digest is owner-validated using the shared domain normalization.
    if (selected.length !== 1 || registryEvent !== registryDocument.history.at(-1)
      || registryEvent.action !== 'retire' || registryEvent.rows.length !== 1 || registryEvent.rows[0].id !== admitted.operation.subject
      || registryEvent.review['change-digest'] !== proof.registryEvents[0].changeDigest
      || !isDeepStrictEqual(proof.decision, { ref: registryEvent.decision, reference: registryEvent.review.reference,
        acceptedStatus: registryEvent.review['accepted-status'], decisionDigest: registryEvent.review['decision-digest'],
        decisionCapture: registryEvent.review['decision-capture'] })) refuse('review-retirement-registry-authorizer-mismatch');
    const zero = admitted.operation.assignmentEvent === null;
    let event = null;
    if (zero) {
      if (proof.assignmentEvent !== null || retained.artifacts.some(row => row.file === 'checks/operation/event.yaml')) {
        refuse('review-retirement-unexpected-event');
      }
    } else {
      if (proof.assignmentEvent === null) refuse('review-retirement-event-missing');
      const artifact = member(proof.assignmentEvent.eventCapture, retained.artifacts);
      if (artifact.file !== 'checks/operation/event.yaml' || gate.sources.assignmentEvent.eventCapture.sha256 !== artifact.sha256
        || gate.sources.assignmentEvent.eventId !== proof.assignmentEvent.eventId
        || gate.sources.assignmentEvent.eventDigest !== proof.assignmentEvent.eventDigest) refuse('review-retirement-event-mismatch');
      try { event = loadYaml(new TextDecoder('utf-8', { fatal: true }).decode(artifact.bytes)); }
      catch (error) { if (!(error instanceof YAMLException || error instanceof TypeError)) throw error; refuse('review-retirement-event-invalid'); }
      if (!validateAssignmentEventMetadata(event).ok || event.namespace !== request.namespace
        || event.event !== proof.assignmentEvent.eventId || assignmentEventDigest(event) !== proof.assignmentEvent.eventDigest
        || !isDeepStrictEqual(gate.decision, { ref: event.decision, reference: event.review.reference,
          acceptedStatus: event.review['accepted-status'], decisionDigest: event.review['decision-digest'],
          decisionCapture: event.review['decision-capture'] })) refuse('review-retirement-authorizer-mismatch');
    }
    const finalGate = await runFinalPreparedSubjectRetirementGate({ repoRoot, evidenceDirectory, validationBundleDigest: readInput.bundleDigest,
      expected: readInput.expected, approvedRuntimeProfile, limits: { evidence: readInput.limits, runtime: executionLimits } });
    if (finalGate.status !== 'passed' || canonicalSha256(finalGate) !== proof.finalGate.resultDigest
      || !isDeepStrictEqual(finalGate, proof.finalGate.result) || !isDeepStrictEqual(finalGate.gate.decision, proof.decision)) {
      refuse('review-final-retirement-mismatch');
    }
    return { retained, capability, operationReport: finalGate, event, decision: finalGate.gate.decision };
  }
  if (request.operation === 'subject-equivalent-merge') {
    const proof = request.operationEvidence;
    const registry = member(proof.registryCapture, retained.artifacts);
    const inputArtifact = member(proof.validation.inputCapture, retained.artifacts);
    const reportArtifact = member(proof.validation.reportCapture, retained.artifacts);
    const wire = document(inputArtifact.bytes);
    if (wire.operation?.assignmentEvent === null) {
      const gate = document(reportArtifact.bytes, false);
      if (registry.file !== 'checks/operation/registry.yaml' || inputArtifact.file !== 'checks/operation/input.json'
        || reportArtifact.file !== 'checks/operation/result' || !isPreparedEquivalentMergeReport(gate,
          { source: readInput.expected.source, candidate: request.candidate }, wire) || !gate.ok
        || canonicalSha256(wire) !== proof.validation.inputDigest || gate.inputDigest !== proof.validation.inputDigest
        || canonicalSha256(gate) !== proof.validation.reportDigest || gate.operation.id !== proof.operationId
        || !isDeepStrictEqual(gate.sources.registryEvents, proof.registryEvents)
        || gate.sources.registryCapture.sha256 !== registry.sha256) refuse('review-merge-binding-mismatch');
      if (proof.assignmentEvent !== null || retained.artifacts.some(row => row.file === 'checks/operation/event.yaml')) refuse('review-merge-unexpected-event');
      let raw;
      try { raw = loadYaml(new TextDecoder('utf-8', { fatal: true }).decode(registry.bytes)); }
      catch (error) { if (!(error instanceof YAMLException || error instanceof TypeError)) throw error; refuse('review-merge-registry-invalid'); }
      if (!validateStoreFile('subject-registry', raw).ok || raw.namespace !== request.namespace) refuse('review-merge-registry-invalid');
      const selected = raw.history.filter(row => row.id === proof.registryEvents[0].id), event = selected[0];
      if (selected.length !== 1 || event !== raw.history.at(-1) || event.action !== 'merge-equivalent'
        || event.rows.length !== 2 || !isDeepStrictEqual(event.rows.map(row => row.id).sort(), [wire.operation.survivor, ...wire.operation.absorbed].sort())
        || event.review['change-digest'] !== proof.registryEvents[0].changeDigest
        || !isDeepStrictEqual(gate.decision, { ref: event.decision, reference: event.review.reference,
          acceptedStatus: event.review['accepted-status'], decisionDigest: event.review['decision-digest'],
          decisionCapture: event.review['decision-capture'] })) refuse('review-merge-registry-authorizer-mismatch');
      const finalGate = await runFinalPreparedEquivalentMergeGate({ repoRoot, evidenceDirectory, validationBundleDigest: readInput.bundleDigest,
        expected: readInput.expected, approvedRuntimeProfile, limits: { evidence: readInput.limits, runtime: executionLimits } });
      if (finalGate.status !== 'passed' || canonicalSha256(finalGate) !== proof.finalGate.resultDigest
        || !isDeepStrictEqual(finalGate, proof.finalGate.result) || !isDeepStrictEqual(finalGate.gate.decision, gate.decision)) refuse('review-final-merge-mismatch');
      return { retained, capability, operationReport: finalGate, event: null, decision: finalGate.gate.decision };
    }
    if (proof.assignmentEvent === null) refuse('review-merge-event-missing');
    const artifact = member(proof.assignmentEvent.eventCapture, retained.artifacts);
    if (registry.file !== 'checks/operation/registry.yaml' || artifact.file !== 'checks/operation/event.yaml'
      || inputArtifact.file !== 'checks/operation/input.json' || reportArtifact.file !== 'checks/operation/result'
      || canonicalSha256(document(inputArtifact.bytes)) !== proof.validation.inputDigest) refuse('review-merge-capture-mismatch');
    const gate = document(reportArtifact.bytes, false);
    if (canonicalSha256(gate) !== proof.validation.reportDigest || gate.inputDigest !== proof.validation.inputDigest
      || gate.operation?.id !== proof.operationId || !isDeepStrictEqual(gate.sources?.registryEvents, proof.registryEvents)
      || gate.sources?.registryCapture?.sha256 !== registry.sha256
      || gate.sources?.assignmentEvent?.eventCapture?.sha256 !== artifact.sha256
      || gate.sources?.assignmentEvent?.eventId !== proof.assignmentEvent.eventId
      || gate.sources?.assignmentEvent?.eventDigest !== proof.assignmentEvent.eventDigest) refuse('review-merge-binding-mismatch');
    let event;
    try { event = loadYaml(new TextDecoder('utf-8', { fatal: true }).decode(artifact.bytes)); }
    catch (error) { if (!(error instanceof YAMLException || error instanceof TypeError)) throw error; refuse('review-merge-event-invalid'); }
    if (!validateAssignmentEventMetadata(event).ok || event.namespace !== request.namespace || event.event !== proof.assignmentEvent.eventId
      || assignmentEventDigest(event) !== proof.assignmentEvent.eventDigest
      || !isDeepStrictEqual(gate.decision, { ref: event.decision, reference: event.review.reference,
        acceptedStatus: event.review['accepted-status'], decisionDigest: event.review['decision-digest'], decisionCapture: event.review['decision-capture'] })) refuse('review-merge-authorizer-mismatch');
    const finalGate = await runFinalPreparedEquivalentMergeGate({ repoRoot, evidenceDirectory, validationBundleDigest: readInput.bundleDigest,
      expected: readInput.expected, approvedRuntimeProfile, limits: { evidence: readInput.limits, runtime: executionLimits } });
    if (canonicalSha256(finalGate) !== proof.finalGate.resultDigest || !isDeepStrictEqual(finalGate, proof.finalGate.result)) refuse('review-final-merge-mismatch');
    return { retained, capability, operationReport: finalGate, event };
  }
  if (['ordinary-promotion', 'typed-record-promotion'].includes(request.operation)) {
    const proof = request.operationEvidence;
    const inputArtifact = member(proof.promotion.inputCapture, retained.artifacts);
    const reportArtifact = member(proof.promotion.reportCapture, retained.artifacts);
    const eventArtifact = member(proof.assignmentEvent.eventCapture, retained.artifacts);
    if (inputArtifact.file !== 'checks/operation/input.json' || reportArtifact.file !== 'checks/operation/result'
      || eventArtifact.file !== 'checks/operation/event.yaml') refuse('review-promotion-capture-mismatch');
    const wire = document(inputArtifact.bytes); const gate = document(reportArtifact.bytes, false);
    const hint = gate.assignment?.eventSource;
    if (canonicalSha256(wire) !== proof.promotion.inputDigest || canonicalSha256(gate) !== proof.promotion.reportDigest
      || gate.inputDigest !== proof.promotion.inputDigest || wire.publication?.id !== proof.publicationId
      || wire.eventId !== proof.assignmentEvent.eventId || !isDeepStrictEqual(gate.promotion?.createdRefs, proof.createdRefs)
      || (request.operation === 'typed-record-promotion'
        && (wire.kind !== gate.recordKind || proof.createdRefs.some((ref) => ref.kind !== wire.kind)))
      || hint?.eventId !== proof.assignmentEvent.eventId || hint?.eventDigest !== proof.assignmentEvent.eventDigest
      || !isDeepStrictEqual(hint?.candidate, request.candidate)) refuse('review-promotion-binding-mismatch');
    let event;
    try { event = loadYaml(new TextDecoder('utf-8', { fatal: true }).decode(eventArtifact.bytes)); }
    catch (error) { if (!(error instanceof YAMLException || error instanceof TypeError)) throw error; refuse('review-promotion-event-invalid'); }
    if (!validateAssignmentEventMetadata(event).ok || event.namespace !== request.namespace || event.event !== proof.assignmentEvent.eventId
      || event.operation !== 'canonical-creation' || event.review.reference !== wire.publication.review
      || assignmentEventDigest(event) !== proof.assignmentEvent.eventDigest) refuse('review-promotion-event-invalid');
    const finalGate = await (request.operation === 'ordinary-promotion' ? runFinalPreparedPromotionGate : runFinalPreparedRecordPromotionGate)({ repoRoot, evidenceDirectory, validationBundleDigest: readInput.bundleDigest,
      expected: readInput.expected, approvedRuntimeProfile, limits: { evidence: readInput.limits, runtime: executionLimits } });
    if (canonicalSha256(finalGate) !== proof.finalGate.resultDigest || !isDeepStrictEqual(finalGate, proof.finalGate.result)) refuse('review-final-promotion-mismatch');
    return { retained, capability, operationReport: finalGate, event };
  }
  const proof = request.operationEvidence;
  const validation = member(proof.validationCapture, retained.artifacts);
  member(proof.scopeCapture, retained.artifacts);
  const operation = retained.report.checks.find((check) => check.id === 'operation');
  if (!isDeepStrictEqual(operation.result, proof.validationCapture)
    || !isDeepStrictEqual(proof.scopeCapture, proof.validationCapture)) refuse('review-operation-capture-mismatch');
  const gate = document(validation.bytes, false);
  if (!isPreparedMigrationReport(gate, readInput.expected) || gate.scope === null
    || gate.validationInputDigest !== proof.validationInputDigest || gate.objectFormat !== request.objectFormat) refuse('review-migration-binding-mismatch');
  if (!reviewOnly) {
    const finalGate = await runFinalPreparedMigrationGate({ repoRoot, evidenceDirectory, validationBundleDigest: readInput.bundleDigest,
      expected: readInput.expected, approvedRuntimeProfile, limits: { evidence: readInput.limits, runtime: executionLimits }, migration, approvedInstallationReview });
    if (finalGate.gate?.namespace !== request.namespace || canonicalSha256(finalGate) !== proof.finalGate.resultDigest
      || !isDeepStrictEqual(finalGate, proof.finalGate.result)) refuse('review-final-migration-mismatch');
    return { retained, capability, operationReport: finalGate };
  }
  return { retained, capability, operationReport: gate };
}

function receiptShape(receipt, request, rows, requestDigest) {
  const fields = ['subject-assignment', 'subject-equivalent-merge', 'subject-retirement', 'subject-split', 'subject-reconsideration', 'subject-metadata', 'subject-proposal-suppression', 'subject-creation', 'ordinary-promotion', 'typed-record-promotion'].includes(request.operation) ? ['decision', 'decisionCapture', 'decisionDigest'] : [];
  if (!closed(receipt, ['version', 'requestDigest', 'requestCapture', 'review']) || receipt.version !== 1
    || receipt.requestDigest !== requestDigest || !isDeepStrictEqual(receipt.requestCapture, { kind: 'detached-artifact', ...rows.find((row) => row.file === 'request.json') })
    || !closed(receipt.review, ['kind', 'reference', 'authorizationCapture', ...fields]) || receipt.review.kind !== request.operation
    || !text(receipt.review.reference) || !isDeepStrictEqual(receipt.review.authorizationCapture,
      { kind: 'detached-artifact', ...rows.find((row) => row.file === 'authorization.txt') })) refuse('invalid-review-receipt');
  if (fields.length && (!closed(receipt.review.decision, ['namespace', 'kind', 'id'])
    || receipt.review.decision.namespace !== request.namespace || receipt.review.decision.kind !== 'decision'
    || !/^D-[0-9]{6}(?![\s\S])/.test(receipt.review.decision.id) || !isCaptureLocator(receipt.review.decisionCapture)
    || !hash(receipt.review.decisionDigest))) refuse('invalid-review-receipt');
}
function rootForRead(evidenceDirectory) {
  if (!text(evidenceDirectory)) refuse('invalid-review-directory');
  const requested = resolve(evidenceDirectory); directory(requested);
  const root = realpathSync(requested);
  for (const part of ['blobs', 'blobs/sha256', 'bundles']) directory(join(root, part));
  return root;
}
function rowsWithinLimits(rows, limits) {
  let total = 0;
  if (!Array.isArray(rows) || rows.length !== 3) refuse('invalid-review-artifacts');
  for (const [i, row] of rows.entries()) {
    if (!closed(row, ['file', 'size', 'sha256']) || row.file !== names[i] || !hash(row.sha256)
      || !Number.isSafeInteger(row.size) || row.size <= 0
      || row.size > Math.min(limits.maxArtifactBytes, limits[classLimit[row.file]])) refuse('review-artifact-budget');
    total += row.size;
    if (!Number.isSafeInteger(total) || total > limits.maxTotalArtifactBytes) refuse('review-artifact-budget');
  }
}

/** Record only an actual trusted operator/platform approved outcome for this exact request. */
export async function recordApprovedCandidateReview(input) {
  if (!closed(input, ['repoRoot', 'evidenceDirectory', 'request', 'authorization', 'approvedRuntimeProfile', 'limits', 'executionLimits',
    ...(Object.hasOwn(input ?? {}, 'migration') ? ['migration'] : []),
    ...(Object.hasOwn(input ?? {}, 'approvedInstallationReview') ? ['approvedInstallationReview'] : [])])) refuse('invalid-review-input');
  validateLimits(input.limits);
  const limits = { ...input.limits };
  const requestBytes = boundedJson(input.request, limits.maxRequestBytes); const request = document(requestBytes);
  const requestDigest = rawSha256(requestBytes); requestShape(request);
  const auth = input.authorization;
  if (!closed(auth, ['outcome', 'requestDigest', 'reference', 'bytes']) || auth.outcome !== 'approved'
    || auth.requestDigest !== requestDigest || !text(auth.reference) || !Buffer.isBuffer(auth.bytes)
    || auth.bytes.length === 0 || auth.bytes.length > limits.maxAuthorizationBytes
    || Buffer.byteLength(auth.reference) > limits.maxReceiptBytes) refuse('review-authorization-mismatch');
  const authorizationBytes = Buffer.from(auth.bytes);
  const repoRoot = input.repoRoot; const evidenceDirectory = input.evidenceDirectory;
  const reference = auth.reference;
  const approvedRuntimeProfile = structuredClone(input.approvedRuntimeProfile);
  const executionLimits = structuredClone(input.executionLimits);
  const migration = input.migration === undefined ? null : structuredClone(input.migration);
  const approvedInstallationReview = structuredClone(input.approvedInstallationReview ?? null);
  const checked = await verifyCandidateReviewEvidence({ repoRoot, evidenceDirectory, request, approvedRuntimeProfile, limits, executionLimits, migration, approvedInstallationReview });
  const receipt = { version: 1, requestDigest, requestCapture: artifactCapture('request.json', requestBytes),
    review: { kind: request.operation, reference, authorizationCapture: artifactCapture('authorization.txt', authorizationBytes),
      ...(['subject-retirement', 'subject-split', 'subject-reconsideration', 'subject-metadata', 'subject-proposal-suppression', 'subject-creation'].includes(request.operation)
        || (request.operation === 'subject-equivalent-merge' && checked.event === null) ? { decision: checked.decision.ref, decisionCapture: checked.decision.decisionCapture,
        decisionDigest: checked.decision.decisionDigest } : checked.event ? { decision: checked.event.decision, decisionCapture: checked.event.review['decision-capture'],
        decisionDigest: checked.event.review['decision-digest'] } : {}) } };
  const receiptBytes = boundedJson(receipt, limits.maxReceiptBytes); const receiptDigest = rawSha256(receiptBytes);
  const artifacts = [{ file: 'authorization.txt', bytes: authorizationBytes }, { file: 'receipt.json', bytes: receiptBytes }, { file: 'request.json', bytes: requestBytes }];
  const rows = artifacts.map(({ file, bytes }) => { const { kind, ...row } = artifactCapture(file, bytes); return row; });
  rowsWithinLimits(rows, limits);
  const manifest = { version: 1, kind: 'candidate-review', validationBundleDigest: request.evidence.bundleDigest,
    requestDigest, receiptDigest, artifacts: rows };
  const manifestBytes = boundedJson(manifest, limits.maxManifestBytes); const reviewBundleDigest = rawSha256(manifestBytes);
  if (!text(repoRoot)) refuse('invalid-review-repository');
  const root = rootForRead(evidenceDirectory);
  const installed = realpathSync(fileURLToPath(new URL('../..', import.meta.url)));
  if (within(realpathSync(repoRoot), root) || within(installed, root)) refuse('review-directory-overlap');
  directory(join(root, '.staging'), true);
  syncDirectory(root); syncDirectory(join(root, 'blobs'));
  const stage = mkdtempSync(join(root, '.staging/review-'));
  let markerAttempted = false; let result; let failure;
  try {
    for (const [i, artifact] of artifacts.entries()) {
      const staged = join(stage, String(i)); finalizedFile(staged, artifact.bytes);
      install(staged, join(root, 'blobs/sha256', rows[i].sha256), artifact.bytes);
    }
    syncDirectory(join(root, 'blobs/sha256'));
    const staged = join(stage, 'manifest'); finalizedFile(staged, manifestBytes);
    for (const [i, artifact] of artifacts.entries()) verifyFile(join(root, 'blobs/sha256', rows[i].sha256), artifact.bytes);
    markerAttempted = true;
    const marker = join(root, 'bundles', `${reviewBundleDigest}.json`);
    install(staged, marker, manifestBytes); syncDirectory(join(root, 'bundles')); verifyFile(marker, manifestBytes);
    for (const [i, artifact] of artifacts.entries()) verifyFile(join(root, 'blobs/sha256', rows[i].sha256), artifact.bytes);
    return result = { status: 'retained', reviewBundleDigest, requestDigest, receiptDigest };
  } catch (error) {
    failure = error;
    if (markerAttempted) return result = { status: 'retention-unknown', reviewBundleDigest, requestDigest, receiptDigest, code: error.code ?? error.name };
    throw error;
  } finally {
    try { rmSync(stage, { recursive: true, force: true }); }
    catch (error) { (result ?? failure).cleanup = { status: 'failed', code: error.code ?? error.name }; }
  }
}

/** Verify fixed review bytes and bindings; does not authenticate the reviewer or run domain gates. */
export function readRetainedCandidateReview(input) {
  if (!closed(input, ['evidenceDirectory', 'reviewBundleDigest', 'expectedRequestDigest', 'validationBundleDigest', 'limits'])
    || ![input.reviewBundleDigest, input.expectedRequestDigest, input.validationBundleDigest].every(hash)) refuse('invalid-review-readback');
  validateLimits(input.limits); let durability = false;
  try {
    const root = rootForRead(input.evidenceDirectory); const marker = join(root, 'bundles', `${input.reviewBundleDigest}.json`);
    const bytes = readOwnedFile(marker, input.limits.maxManifestBytes);
    if (rawSha256(bytes) !== input.reviewBundleDigest) refuse('review-manifest-digest-mismatch');
    const manifest = document(bytes);
    if (!closed(manifest, ['version', 'kind', 'validationBundleDigest', 'requestDigest', 'receiptDigest', 'artifacts'])
      || manifest.version !== 1 || manifest.kind !== 'candidate-review' || !hash(manifest.receiptDigest)
      || manifest.requestDigest !== input.expectedRequestDigest || manifest.validationBundleDigest !== input.validationBundleDigest) refuse('review-manifest-binding-mismatch');
    rowsWithinLimits(manifest.artifacts, input.limits);
    const artifacts = manifest.artifacts.map((row) => {
      const bytes = readOwnedFile(join(root, 'blobs/sha256', row.sha256), row.size);
      if (bytes.length !== row.size || rawSha256(bytes) !== row.sha256) refuse('review-artifact-digest-mismatch');
      return { ...row, bytes };
    });
    const request = document(artifacts[2].bytes); const receipt = document(artifacts[1].bytes); requestShape(request);
    if (artifacts[2].sha256 !== manifest.requestDigest || artifacts[1].sha256 !== manifest.receiptDigest
      || request.evidence.bundleDigest !== input.validationBundleDigest) refuse('review-artifact-binding-mismatch');
    receiptShape(receipt, request, manifest.artifacts, manifest.requestDigest);
    durability = true;
    for (const artifact of artifacts) verifyFile(join(root, 'blobs/sha256', artifact.sha256), artifact.bytes, true);
    syncDirectory(join(root, 'blobs/sha256')); verifyFile(marker, bytes, true); syncDirectory(join(root, 'bundles'));
    return { status: 'verified', reviewBundleDigest: input.reviewBundleDigest, manifest, request, receipt, artifacts };
  } catch (error) {
    if (durability && Number.isInteger(error?.errno)) return { status: 'retention-unknown', reviewBundleDigest: input.reviewBundleDigest, code: error.code };
    if (Number.isInteger(error?.errno)) refuse('review-artifact-unavailable');
    throw error;
  }
}
