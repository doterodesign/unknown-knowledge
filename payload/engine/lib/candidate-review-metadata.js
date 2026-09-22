/** Fixed metadata review: actual registry pair, full raw Decision tuple, fresh final. */
import { isDeepStrictEqual as same } from 'node:util';
import { load, YAMLException } from 'js-yaml';
import { canonicalJsonBytes, canonicalSha256, CapturedInputError } from './canonical-json.js';
import { EngineRefusal } from './engine-refusal.js';
import { SubjectError } from './subject-error.js';
import { captureCommittedFile } from './captured-source.js';
import { createSubjectValidationBudget } from './subject-validation-budget.js';
import { validateStoreFile } from './validate-record.js';
import { artifactCapture } from './prepared-evidence.js';
import { isPreparedSubjectMetadataReport, isPreparedSubjectProposalSuppressionReport } from './prepared-subject-metadata.js';
import { runFinalPreparedSubjectMetadataGate, runFinalPreparedSubjectProposalSuppressionGate } from './final-prepared-subject-metadata.js';
const closed = (v, keys) => v !== null && typeof v === 'object' && !Array.isArray(v)
  && Reflect.ownKeys(v).length === keys.length && keys.every(key => Object.hasOwn(v, key));
const refuse = (code, detail = '') => { throw Object.assign(new EngineRefusal(`${code}${detail ? `: ${detail}` : ''}`), { code }); };
const need = (ok, code) => { if (!ok) refuse(`review-metadata-${code}`); };
const path = (descriptor, file) => descriptor.kitPath === '.' ? file : `${descriptor.kitPath}/${file}`;
const source = descriptor => ({ commit: descriptor.commit, tree: descriptor.tree });
const tuple = event => ({ ref: event.decision, reference: event.review.reference,
  acceptedStatus: event.review['accepted-status'], decisionDigest: event.review['decision-digest'], decisionCapture: event.review['decision-capture'] });
function utf8(bytes) {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch (error) { if (!(error instanceof TypeError)) throw error; refuse('review-metadata-encoding'); }
}
function json(bytes, canonical = true) {
  let value;
  try { value = JSON.parse(utf8(bytes)); }
  catch (error) { if (!(error instanceof SyntaxError)) throw error; refuse('review-metadata-json'); }
  if (canonical) {
    let encoded;
    try { encoded = canonicalJsonBytes(value); }
    catch (error) {
      if (!(error instanceof CapturedInputError || error instanceof RangeError)) throw error;
      refuse('review-metadata-json-depth');
    }
    need(encoded.equals(bytes), 'json-canonical');
  }
  return value;
}
function yaml(bytes) {
  try { return load(utf8(bytes)); }
  catch (error) {
    if (!(error instanceof YAMLException || error instanceof RangeError)) throw error;
    refuse('review-metadata-yaml');
  }
}
function capture(repoRoot, commit, file, budget) {
  let actual;
  try { actual = captureCommittedFile({ repoRoot, commit, file }); }
  catch (error) {
    if (error?.constructor !== Error && !Number.isInteger(error?.errno)) throw error;
    refuse('review-metadata-source-unavailable', error.message);
  }
  budget.admitCapture(actual); return actual;
}

/** Fixed internal dispatcher resolves artifacts before this adapter runs. */
export function verifySubjectMetadataReviewEvidence(input) { return verify(input,false); }
export function verifySubjectProposalSuppressionReviewEvidence(input) { return verify(input,true); }
async function verify(input,suppression) {
  const operationName=suppression?'subject-proposal-suppression':'subject-metadata';
  const validReport=suppression?isPreparedSubjectProposalSuppressionReport:isPreparedSubjectMetadataReport;
  const freshFinal=suppression?runFinalPreparedSubjectProposalSuppressionGate:runFinalPreparedSubjectMetadataGate;
  need(closed(input, ['repoRoot','request','artifacts','validationInput','approvedRuntimeProfile','executionLimits'])
    && closed(input.artifacts, ['registry','input','report']), 'adapter-input');
  const { repoRoot, request, artifacts, validationInput, approvedRuntimeProfile, executionLimits } = input;
  const proof = request.operationEvidence;
  need(request.operation === operationName && same(validationInput.expected, {
    source: { commit: request.source.expectedCommit, tree: request.source.tree, kitPath: request.source.kitPath },
    candidate: request.candidate, operation: request.operation, runtimeDigest: request.runtimeDigest, reportDigest: request.evidence.reportDigest })
    && validationInput.bundleDigest === request.evidence.bundleDigest, 'validation-binding');
  for (const [name,file,descriptor] of [['registry','registry.yaml',proof.registryCapture],
    ['input','input.json',proof.validation.inputCapture],['report','result',proof.validation.reportCapture]]) {
    const row = artifacts[name];
    need(row && Buffer.isBuffer(row.bytes) && row.file === `checks/operation/${file}`
      && same(artifactCapture(row.file,row.bytes),descriptor) && row.size === row.bytes.length && row.sha256 === descriptor.sha256, 'artifact-binding');
  }
  const wire = json(artifacts.input.bytes), gate = json(artifacts.report.bytes,false);
  need(validReport(gate,validationInput.expected,wire) && gate.ok
    && gate.inputDigest === proof.validation.inputDigest && canonicalSha256(gate) === proof.validation.reportDigest
    && gate.operation.id === proof.operationId && same(gate.sources.registryEvent,proof.registryEvent)
    && gate.decision.ref.namespace === request.namespace, 'owner-binding');
  const budget = createSubjectValidationBudget(wire.limits.governance);
  try {
    budget.guard(wire,'metadata-review-wire');
    const docs = {};
    for (const side of ['before','candidate']) {
      const actual = capture(repoRoot,wire[side].commit,path(wire[side],'subjects/registry.yaml'),budget);
      const locator = gate.preservation.proof[side === 'before' ? 'beforeCapture' : 'candidateCapture'];
      need(actual.objectFormat === request.objectFormat && same(actual.locator,locator)
        && same(actual.locator.source,source(wire[side])) && actual.mode === gate.preservation.proof.registryMode, 'source-binding');
      if (side === 'candidate') need(actual.bytes.equals(artifacts.registry.bytes),'candidate-bytes');
      const doc = yaml(actual.bytes); budget.guard(doc,`metadata-review-${side}-registry`);
      need(validateStoreFile('subject-registry',doc).ok && doc.namespace === request.namespace,'registry-schema');
      docs[side] = doc;
    }
    need(docs.candidate.history.length === docs.before.history.length + 1,'registry-suffix');
    for (let index=0;index<docs.before.history.length;index++) {
      budget.charge('validationSteps',1,'metadata-review-history');
      need(same(docs.before.history[index],docs.candidate.history[index]),'registry-prefix');
    }
    budget.charge('validationSteps',1,'metadata-review-selected-event');
    const event=docs.candidate.history.at(-1);
    need(event.action === wire.operation.action && event.id === proof.registryEvent.id
      && event.review['change-digest'] === proof.registryEvent.changeDigest && same(tuple(event),gate.decision),'registry-tuple');
    budget.assertActive();
    const final=await freshFinal({repoRoot,evidenceDirectory:validationInput.evidenceDirectory,
      validationBundleDigest:validationInput.bundleDigest,expected:validationInput.expected,approvedRuntimeProfile,
      limits:{evidence:validationInput.limits,runtime:executionLimits}});
    if(final.status !== 'passed' || !same(final.gate.decision,tuple(event))
      || canonicalSha256(final) !== proof.finalGate.resultDigest || !same(final,proof.finalGate.result)) refuse('review-final-metadata-mismatch');
    return {operationReport:final,event:null,decision:tuple(event)};
  } catch(error) {
    if(!(error instanceof SubjectError || error instanceof CapturedInputError))throw error;
    refuse(`review-metadata-${error.code}`,error.message);
  }
}
