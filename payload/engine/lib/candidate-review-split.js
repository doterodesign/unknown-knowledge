import { lifecycleMaterialPresent } from './subject-lifecycle-input.js';
/** Fixed internal split review. Serialized owner reports are evidence, never authority. */
import { isDeepStrictEqual as same } from 'node:util';
import { load, YAMLException } from 'js-yaml';
import { canonicalJsonBytes, canonicalSha256, CapturedInputError } from './canonical-json.js';
import { EngineRefusal } from './engine-refusal.js';
import { SubjectError } from './subject-error.js';
import { captureCommittedFile } from './captured-source.js';
import { createSubjectValidationBudget } from './subject-validation-budget.js';
import { validateSubjectSplitAllocation } from './subject-split-allocation.js';
import { validateStoreFile } from './validate-record.js';
import { assignmentEventDigest } from './assignment-event.js';
import { artifactCapture } from './prepared-evidence.js';
import { decodePreparedSubjectSplit, isPreparedSubjectSplitReport } from './prepared-subject-split.js';
import { runFinalPreparedSubjectSplitGate } from './final-prepared-subject-split.js';

const closed = (v, keys) => v !== null && typeof v === 'object' && !Array.isArray(v)
  && Reflect.ownKeys(v).length === keys.length && keys.every(key => Object.hasOwn(v, key));
const refuse = (code, detail = '') => { throw Object.assign(new EngineRefusal(`${code}${detail ? `: ${detail}` : ''}`), { code }); };
const requireThat = (ok, code) => { if (!ok) refuse(`review-split-${code}`); };
const path = (descriptor, file) => descriptor.kitPath === '.' ? file : `${descriptor.kitPath}/${file}`;
const tuple = event => ({ ref: event.decision, reference: event.review.reference,
  acceptedStatus: event.review['accepted-status'], decisionDigest: event.review['decision-digest'], decisionCapture: event.review['decision-capture'] });
function utf8(bytes) {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch (error) { if (!(error instanceof TypeError)) throw error; refuse('review-split-encoding'); }
}
function json(bytes, canonical = true) {
  let value;
  try { value = JSON.parse(utf8(bytes)); }
  catch (error) { if (!(error instanceof SyntaxError)) throw error; refuse('review-split-json'); }
  if (canonical) {
    let encoded;
    try { encoded = canonicalJsonBytes(value); }
    catch (error) {
      if (!(error instanceof CapturedInputError || error instanceof RangeError)) throw error;
      refuse('review-split-json-depth');
    }
    requireThat(encoded.equals(bytes), 'json-canonical');
  }
  return value;
}
function yaml(bytes) {
  try { return load(utf8(bytes)); }
  catch (error) {
    if (!(error instanceof YAMLException || error instanceof RangeError)) throw error;
    refuse('review-split-yaml');
  }
}
function capture(repoRoot, commit, file, budget) {
  let actual;
  try { actual = captureCommittedFile({ repoRoot, commit, file }); }
  catch (error) {
    if (error?.constructor !== Error && !Number.isInteger(error?.errno)) throw error;
    refuse('review-split-source-unavailable', error.message);
  }
  budget.admitCapture(actual); return actual;
}

/** Only the fixed review dispatcher supplies resolved retained artifacts here. */
export async function verifySubjectSplitReviewEvidence(input) {
  requireThat(closed(input, ['repoRoot', 'request', 'artifacts', 'validationInput', 'approvedRuntimeProfile', 'executionLimits'])
    && closed(input.artifacts, ['registry', 'identity', 'input', 'report', 'event']), 'adapter-input');
  const { repoRoot, request, artifacts, validationInput, approvedRuntimeProfile, executionLimits } = input;
  const proof = request.operationEvidence;
  requireThat(request.operation === 'subject-split' && validationInput.expected.operation === 'subject-split'
    && same(validationInput.expected, { source: { commit: request.source.expectedCommit, tree: request.source.tree, kitPath: request.source.kitPath },
      candidate: request.candidate, operation: 'subject-split', runtimeDigest: request.runtimeDigest, reportDigest: request.evidence.reportDigest })
    && validationInput.bundleDigest === request.evidence.bundleDigest, 'validation-binding');
  const expectedArtifacts = { registry: ['registry.yaml', proof.registryCapture], identity: ['identity.yaml', proof.identityCapture],
    input: ['input.json', proof.validation.inputCapture], report: ['result', proof.validation.reportCapture],
    ...(proof.assignmentEvent === null ? {} : { event: ['event.yaml', proof.assignmentEvent.eventCapture] }) };
  requireThat(proof.assignmentEvent !== null || artifacts.event === null, 'unexpected-event');
  for (const [name, [file, descriptor]] of Object.entries(expectedArtifacts)) {
    const row = artifacts[name];
    requireThat(row && Buffer.isBuffer(row.bytes) && row.file === `checks/operation/${file}`
      && same(artifactCapture(row.file, row.bytes), descriptor)
      && row.size === row.bytes.length && row.sha256 === descriptor.sha256, 'artifact-binding');
  }
  const wire = json(artifacts.input.bytes);
  const continued = lifecycleMaterialPresent(wire);
  const admitted = continued ? wire : decodePreparedSubjectSplit(repoRoot, wire);
  const gate = json(artifacts.report.bytes, false);
  const expected = { source: validationInput.expected.source, candidate: request.candidate };
  requireThat(isPreparedSubjectSplitReport(gate, expected, wire) && gate.ok
    && gate.inputDigest === proof.validation.inputDigest && canonicalSha256(gate) === proof.validation.reportDigest
    && gate.operation.id === proof.operationId && same(gate.sources.registryEvents, proof.registryEvents)
    && same(gate.decision, proof.decision) && gate.decision.ref.namespace === request.namespace
    && same(gate.sources.assignmentEvent === null ? null : { eventId: gate.sources.assignmentEvent.eventId,
      eventDigest: gate.sources.assignmentEvent.eventDigest, eventCapture: proof.assignmentEvent?.eventCapture }, proof.assignmentEvent), 'owner-binding');
  const budget = createSubjectValidationBudget(admitted.limits.governance);
  try {
    const original = [];
    for (const pair of admitted.evidence.assessmentCaptures) {
      budget.charge('validationSteps', 1, 'split-review-original-pair');
      if (continued) {
        requireThat(pair && pair.registry?.capture && pair.identity?.capture, 'original-pair-shape');
        budget.guard({registry:pair.registry.capture,identity:pair.identity.capture},'split-review-wire-pair');
      }
      if (pair.registry.capture.file === path(admitted.before, 'subjects/registry.yaml')
        && same(pair.registry.capture.source, { commit: admitted.before.commit, tree: admitted.before.tree })) original.push(pair);
    }
    requireThat(original.length === 1, 'original-pair');
    const pair = original[0]; const actual = {};
    for (const side of ['before', 'candidate']) {
      const descriptor = admitted[side]; actual[side] = {};
      for (const name of ['identity', 'registry']) {
        const file = path(descriptor, name === 'identity' ? '_identity.yaml' : 'subjects/registry.yaml');
        const source = capture(repoRoot, descriptor.commit, file, budget); actual[side][name] = source;
        const locator = name === 'identity' ? gate.allocation[side].capture : gate.inventory.inputs[side].registryCapture;
        requireThat(source.objectFormat === request.objectFormat && same(source.locator, locator)
          && same(source.locator.source, { commit: descriptor.commit, tree: descriptor.tree }), 'source-binding');
        if (name === 'identity') requireThat(source.mode === gate.allocation[side].mode, 'identity-mode');
        if (side === 'before') requireThat(same(source.locator, pair[name].capture)
          && source.objectFormat === pair[name].objectFormat && (continued ? source.bytes.toString('base64') === pair[name].bytesBase64 : source.bytes.equals(pair[name].bytes)), 'original-bytes');
        else requireThat(source.bytes.equals(artifacts[name].bytes), 'candidate-bytes');
      }
    }
    for (const name of ['identity', 'registry']) requireThat(actual.before[name].mode === actual.candidate[name].mode, 'authority-mode');
    const documents = {};
    for (const side of ['before', 'candidate']) {
      const doc = yaml(actual[side].registry.bytes); budget.guard(doc, `split-review-${side}-registry`);
      requireThat(validateStoreFile('subject-registry', doc).ok && doc.namespace === request.namespace, 'registry-schema');
      documents[side] = doc;
    }
    const old = documents.before.history; const next = documents.candidate.history;
    requireThat(next.length === old.length + 2, 'registry-suffix');
    for (let index = 0; index < next.length; index++) {
      budget.charge('validationSteps', 1, 'split-review-history');
      if (index < old.length) requireThat(same(next[index], old[index]), 'registry-prefix');
    }
    const selected = next.slice(-2); const [activation, split] = selected;
    requireThat(same(selected.map(row => ({ id: row.id, changeDigest: row.review['change-digest'] })), proof.registryEvents)
      && same(selected.map(row => row.action), ['activate', 'split'])
      && new Set(next.map(row => row.id)).size === next.length, 'registry-suffix');
    for (const event of selected) {
      budget.charge('validationSteps', 1, 'split-review-registry-tuple');
      requireThat(same(tuple(event), proof.decision), 'registry-tuple');
    }
    requireThat(same(activation.rows.map(row => row.id), admitted.operation.successors)
      && split.rows.length === 1 && split.rows[0].id === admitted.operation.subject
      && same(split.rows[0].after.retirement?.successors, admitted.operation.successors), 'registry-rows');
    const scope = activation['refusal-assessment']?.scope;
    requireThat(same(scope?.['before-registry']?.capture, pair.registry.capture)
      && scope?.['before-registry']?.['document-digest'] === gate.inventory.inputs.before.registryDigest
      && scope?.['identity-digest'] === gate.inventory.inputs.before.identityDigest, 'assessment');
    // No model/parser/index path: this helper alone owns ledger guards, populations and planning.
    const allocation = validateSubjectSplitAllocation({ beforeIdentity: yaml(actual.before.identity.bytes),
      candidateIdentity: yaml(actual.candidate.identity.bytes), successors: admitted.operation.successors,
      publication: { id: admitted.operation.id, review: activation.review.reference } },
    { limits: admitted.limits.allocation, operationBudget: budget });
    if (!allocation.ok) refuse('review-split-allocation', JSON.stringify(allocation.diagnostics));
    const observation = allocation.allocation;
    requireThat(same(observation.ids, gate.allocation.allocatedIds) && same(observation.publication, gate.allocation.publication)
      && observation.occupied === gate.allocation.occupied && observation.remaining === gate.allocation.remaining
      && observation.beforeIdentityDigest === gate.inventory.inputs.before.identityDigest
      && observation.candidateIdentityDigest === gate.inventory.inputs.candidate.identityDigest
      && same(allocation.resources, gate.resources.allocation), 'allocation-proof');
    let event = null;
    if (admitted.operation.assignmentEvent !== null) {
      requireThat(artifacts.event !== null && proof.assignmentEvent !== null, 'missing-event');
      const source = capture(repoRoot, admitted.candidate.commit,
        path(admitted.candidate, `subjects/_assignments/${admitted.operation.assignmentEvent.id}.yaml`), budget);
      requireThat(source.objectFormat === request.objectFormat && same(source.locator, gate.sources.assignmentEvent.eventCapture)
        && source.bytes.equals(artifacts.event.bytes), 'event-source');
      event = yaml(source.bytes); budget.guard(event, 'split-review-assignment-event');
      requireThat(validateStoreFile('assignment-split-event', event).ok && event.namespace === request.namespace
        && event.event === proof.assignmentEvent.eventId && assignmentEventDigest(event) === proof.assignmentEvent.eventDigest
        && same(tuple(event), proof.decision), 'event-tuple');
      const op = admitted.operation;
      requireThat(same(event.scope, { kind: 'subject-use-transition', operation: op.id, action: 'split', subject: op.subject,
        successors: op.successors, 'registry-events': op.registryEvents.map(row => row.id) })
        && same(event['before-input'], { commit: admitted.before.commit, tree: admitted.before.tree, 'kit-path': admitted.before.kitPath })
        && event.rows.length === op.mappings.length, 'event-scope');
      for (const [index, row] of event.rows.entries()) {
        budget.charge('validationSteps', 1, 'split-review-assignment-row');
        const mapping = op.mappings[index]; const eligibility = gate.assignments.rows[index].eligibility;
        requireThat(same(row.ref, mapping.ref) && row.reason === mapping.reason && row.disposition === 'changed'
          && row['after-revision'] === row['before-revision'] + 1
          && same(row.before, eligibility.before) && same(row.after, eligibility.candidate), 'event-row');
      }
    } else requireThat(artifacts.event === null && proof.assignmentEvent === null, 'unexpected-event');
    // Full historical/current Decision provenance and normalized registry semantics belong to this fresh owner.
    // Preserve source-less tuples; the local four/five captures make no independent Decision-source claim.
    const final = await runFinalPreparedSubjectSplitGate({ repoRoot, evidenceDirectory: validationInput.evidenceDirectory,
      validationBundleDigest: validationInput.bundleDigest, expected: validationInput.expected, approvedRuntimeProfile,
      limits: { evidence: validationInput.limits, runtime: executionLimits } });
    requireThat(final.status === 'passed' && same(final.gate.decision, proof.decision)
      && canonicalSha256(final) === proof.finalGate.resultDigest && same(final, proof.finalGate.result), 'fresh-final');
    return { operationReport: final, event, decision: final.gate.decision };
  } catch (error) {
    if (!(error instanceof SubjectError || error instanceof CapturedInputError)) throw error;
    refuse(`review-split-${error.code}`, error.message);
  }
}
