/** Fixed eventless review: four actual captures, one independent allocation comparison, fresh final. */
import { isDeepStrictEqual as same } from 'node:util';
import { load, YAMLException } from 'js-yaml';
import { canonicalJsonBytes, canonicalSha256, CapturedInputError } from './canonical-json.js';
import { EngineRefusal } from './engine-refusal.js';
import { SubjectError } from './subject-error.js';
import { captureCommittedFile } from './captured-source.js';
import { createSubjectValidationBudget } from './subject-validation-budget.js';
import { validateSubjectCreationAllocation } from './subject-allocation.js';
import { validateStoreFile } from './validate-record.js';
import { artifactCapture } from './prepared-evidence.js';
import { isPreparedSubjectReconsiderationReport, isPreparedSubjectCreationReport } from './prepared-eventless-creation.js';
import { runFinalPreparedSubjectReconsiderationGate, runFinalPreparedSubjectCreationGate } from './final-prepared-eventless-creation.js';

const closed = (v, keys) => v !== null && typeof v === 'object' && !Array.isArray(v)
  && Reflect.ownKeys(v).length === keys.length && keys.every(key => Object.hasOwn(v, key));
const refuse = (code, detail = '') => { throw Object.assign(new EngineRefusal(`${code}${detail ? `: ${detail}` : ''}`), { code }); };
const need = (ok, code) => { if (!ok) refuse(`review-reconsideration-${code}`); };
const path = (descriptor, file) => descriptor.kitPath === '.' ? file : `${descriptor.kitPath}/${file}`;
const source = descriptor => ({ commit: descriptor.commit, tree: descriptor.tree });
const tuple = event => ({ ref: event.decision, reference: event.review.reference,
  acceptedStatus: event.review['accepted-status'], decisionDigest: event.review['decision-digest'], decisionCapture: event.review['decision-capture'] });
const decisionTuple = core => ({ ref: core.decision.ref, reference: core.decision.review.reference,
  acceptedStatus: core.decision.review.acceptedStatus, decisionDigest: core.decision.review.decisionDigest,
  decisionCapture: core.decision.review.decisionCapture });
function utf8(bytes) {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch (error) { if (!(error instanceof TypeError)) throw error; refuse('review-reconsideration-encoding'); }
}
function json(bytes, canonical = true) {
  let value;
  try { value = JSON.parse(utf8(bytes)); }
  catch (error) { if (!(error instanceof SyntaxError)) throw error; refuse('review-reconsideration-json'); }
  if (canonical) {
    let encoded;
    try { encoded = canonicalJsonBytes(value); }
    catch (error) {
      if (!(error instanceof CapturedInputError || error instanceof RangeError)) throw error;
      refuse('review-reconsideration-json-depth');
    }
    need(encoded.equals(bytes), 'json-canonical');
  }
  return value;
}
function yaml(bytes) {
  try { return load(utf8(bytes)); }
  catch (error) {
    if (!(error instanceof YAMLException || error instanceof RangeError)) throw error;
    refuse('review-reconsideration-yaml');
  }
}
function capture(repoRoot, commit, file, budget) {
  let actual;
  try { actual = captureCommittedFile({ repoRoot, commit, file }); }
  catch (error) {
    if (error?.constructor !== Error && !Number.isInteger(error?.errno)) throw error;
    refuse('review-reconsideration-source-unavailable', error.message);
  }
  budget.admitCapture(actual); return actual;
}

/** Fixed internal dispatcher supplies resolved artifacts, never a branded caller proof. */
export async function verifySubjectReconsiderationReviewEvidence(input) { return verifyReview(input, false); }
export async function verifySubjectCreationReviewEvidence(input) { return verifyReview(input, true); }
async function verifyReview(input, ordinary) {
  const operation = ordinary ? 'subject-creation' : 'subject-reconsideration';
  const need = (ok, code) => { if (!ok) refuse(`review-${ordinary ? 'creation' : 'reconsideration'}-${code}`); };
  const reportValid = ordinary ? isPreparedSubjectCreationReport : isPreparedSubjectReconsiderationReport;
  const finalGate = ordinary ? runFinalPreparedSubjectCreationGate : runFinalPreparedSubjectReconsiderationGate;
  need(closed(input, ['repoRoot', 'request', 'artifacts', 'validationInput', 'approvedRuntimeProfile', 'executionLimits'])
    && closed(input.artifacts, ['registry', 'identity', 'input', 'report']), 'adapter-input');
  const { repoRoot, request, artifacts, validationInput, approvedRuntimeProfile, executionLimits } = input;
  const proof = request.operationEvidence;
  need(request.operation === operation && proof.assignmentEvent === null
    && same(validationInput.expected, { source: { commit: request.source.expectedCommit, tree: request.source.tree, kitPath: request.source.kitPath },
      candidate: request.candidate, operation, runtimeDigest: request.runtimeDigest, reportDigest: request.evidence.reportDigest })
    && validationInput.bundleDigest === request.evidence.bundleDigest, 'validation-binding');
  const bindings = { registry: ['registry.yaml', proof.registryCapture], identity: ['identity.yaml', proof.identityCapture],
    input: ['input.json', proof.validation.inputCapture], report: ['result', proof.validation.reportCapture] };
  for (const [name, [file, descriptor]] of Object.entries(bindings)) {
    const row = artifacts[name];
    need(row && Buffer.isBuffer(row.bytes) && row.file === `checks/operation/${file}`
      && same(artifactCapture(row.file, row.bytes), descriptor) && row.size === row.bytes.length
      && row.sha256 === descriptor.sha256, 'artifact-binding');
  }
  const wire = json(artifacts.input.bytes), gate = json(artifacts.report.bytes, false);
  need(reportValid(gate, { source: validationInput.expected.source, candidate: request.candidate }, wire)
    && gate.ok && gate.inputDigest === proof.validation.inputDigest && canonicalSha256(gate) === proof.validation.reportDigest
    && gate.operation.id === proof.operationId && same(gate.sources.registryEvents, proof.registryEvents)
    && same(decisionTuple(gate.core), proof.decision) && proof.decision.ref.namespace === request.namespace, 'owner-binding');
  const budget = createSubjectValidationBudget(wire.limits.governance);
  try {
    // Original wire metadata is inspected without decoding its raw capture families.
    budget.guard(wire, 'reconsideration-review-wire-metadata');
    const originals = [];
    for (const pair of wire.evidence.assessmentCaptures) {
      budget.charge('validationSteps', 1, 'reconsideration-review-original-pair');
      if (pair.registry.capture.file === path(wire.before, 'subjects/registry.yaml')
        && same(pair.registry.capture.source, source(wire.before))) originals.push(pair);
    }
    need(originals.length === 1, 'original-pair');
    const original = originals[0], actual = {};
    for (const side of ['before', 'candidate']) {
      actual[side] = {};
      for (const name of ['registry', 'identity']) {
        const file = path(wire[side], name === 'registry' ? 'subjects/registry.yaml' : '_identity.yaml');
        const got = capture(repoRoot, wire[side].commit, file, budget); actual[side][name] = got;
        const observation = name === 'registry' ? gate.core.registry[side] : gate.core.allocation[side];
        need(got.objectFormat === request.objectFormat && same(got.locator, observation.capture)
          && same(got.locator.source, source(wire[side])) && got.mode === observation.mode, 'source-binding');
        if (side === 'before') need(same(got.locator, original[name].capture)
          && got.objectFormat === original[name].objectFormat && got.bytes.toString('base64') === original[name].bytesBase64, 'original-before');
        else need(got.bytes.equals(artifacts[name].bytes), 'candidate-bytes');
      }
    }
    const docs = {};
    for (const side of ['before', 'candidate']) {
      const doc = yaml(actual[side].registry.bytes);
      budget.guard(doc, `reconsideration-review-${side}-registry`);
      need(validateStoreFile('subject-registry', doc).ok && doc.namespace === request.namespace, 'registry-schema');
      docs[side] = doc;
    }
    const before = docs.before, candidate = docs.candidate, event = candidate.history.at(-1);
    need(candidate.history.length === before.history.length + 1, 'registry-suffix');
    for (let index = 0; index < before.history.length; index++) {
      budget.charge('validationSteps', 1, 'reconsideration-review-history');
      need(same(before.history[index], candidate.history[index]), 'registry-prefix');
    }
    budget.charge('validationSteps', 1, 'reconsideration-review-selected-event');
    need(event.action === 'activate' && event.id === wire.operation.registryEvent.id
      && event.review['change-digest'] === wire.operation.registryEvent.changeDigest
      && same(tuple(event), proof.decision) && event.rows.length === 1 && event.rows[0].id === wire.operation.subject
      && event.rows[0].before === null && event.rows[0].after.status === 'active'
      && (ordinary && wire.operation.action === 'activate' ? !Object.hasOwn(event, 'promotes') : event.promotes?.key === wire.operation.proposal), 'registry-tuple');
    let selected = null, prior = null;
    const preserved = [];
    for (const row of before.subjects) {
      budget.charge('validationSteps', 1, 'reconsideration-review-subjects');
      if (row.id === wire.operation.proposal) { need(selected === null, 'consumed-proposal'); selected = row; }
      else preserved.push(row);
    }
    if (ordinary) {
      need(!['prior-refusal', 'reconsideration', 'reconsideration-assessment'].some(key => Object.hasOwn(event, key)), 'ordinary-markers');
      need(wire.operation.action === 'activate' ? selected === null && wire.operation.proposal === null
        : selected?.status === 'proposed' && selected.changes.length === 0 && !Object.hasOwn(selected, 'refusal')
          && !Object.hasOwn(selected, 'retirement') && same(selected, event.promotes.before), 'ordinary-proposal');
    } else {
    for (const row of before.history) {
      budget.charge('validationSteps', 1, 'reconsideration-review-prior-refusal');
      if (row.id === event['prior-refusal']) { need(prior === null, 'prior-refusal'); prior = row; }
    }
    need(selected?.status === 'suppressed' && same(selected, event.promotes.before) && prior?.action === 'suppress'
      && prior.rows.some(row => row.id === wire.operation.proposal) && !same(prior.decision, event.decision), 'prior-refusal');
    }
    budget.charge('validationSteps', candidate.subjects.length, 'reconsideration-review-candidate-subjects');
    need(same(candidate.subjects, [...preserved, { id: wire.operation.subject, ...event.rows[0].after, changes: [event.id] }])
      && same(candidate, { ...before, subjects: candidate.subjects, history: [...before.history, event], revision: before.revision + 1,
        'hierarchy-revision': before['hierarchy-revision'] + (event.rows[0].after.parent === undefined ? 0 : 1) }), 'registry-delta');
    const scope = event[ordinary ? 'refusal-assessment' : 'reconsideration-assessment']?.scope;
    need(same(scope?.['before-registry']?.capture, original.registry.capture)
      && scope?.['identity-digest'] === gate.core.allocation.proof.beforeIdentityDigest, 'assessment');
    // The helper alone guards and hashes actual ledgers and invokes the native allocator.
    const allocation = validateSubjectCreationAllocation({ beforeIdentity: yaml(actual.before.identity.bytes),
      candidateIdentity: yaml(actual.candidate.identity.bytes), subject: wire.operation.subject,
      publication: { id: wire.operation.id, review: event.review.reference } },
    { limits: wire.limits.allocation, operationBudget: budget });
    if (!allocation.ok) refuse('review-reconsideration-allocation', JSON.stringify(allocation.diagnostics));
    need(same(allocation.allocation, gate.core.allocation.proof) && same(allocation.resources, gate.core.resources.allocation), 'allocation-proof');
    budget.assertActive();
    // No local Decision recapture: fresh owner proves all supplied provenance and current authority.
    const final = await finalGate({ repoRoot, evidenceDirectory: validationInput.evidenceDirectory,
      validationBundleDigest: validationInput.bundleDigest, expected: validationInput.expected, approvedRuntimeProfile,
      limits: { evidence: validationInput.limits, runtime: executionLimits } });
    need(final.status === 'passed' && same(decisionTuple(final.gate.core), proof.decision)
      && canonicalSha256(final) === proof.finalGate.resultDigest && same(final, proof.finalGate.result), 'fresh-final');
    return { operationReport: final, event: null, decision: decisionTuple(final.gate.core) };
  } catch (error) {
    if (!(error instanceof SubjectError || error instanceof CapturedInputError)) throw error;
    refuse(`review-${ordinary ? 'creation' : 'reconsideration'}-${error.code}`, error.message);
  }
}
