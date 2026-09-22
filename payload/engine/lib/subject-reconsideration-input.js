/** Closed reconsideration transport. Admission owns bytes, never Git or approval. */
import { canonicalSha256, CapturedInputError } from './canonical-json.js';
import { admitReconsiderationCaptureEvidence, decodeReconsiderationCaptureEvidence } from './subject-capture-admission.js';
import { isIdentityUuid, parseCanonicalId, parseProposalKey } from './record-identity.js';
import { getSubjectValidationBudget } from './subject-validation-budget.js';
import { SubjectError } from './subject-error.js';

const governanceKeys = ['maxCaptureBytes', 'maxDocumentNodes', 'maxDocumentTextUnits',
  'maxSubjects', 'maxHistoryRows', 'maxValidationSteps'];
const fail = () => { throw new SubjectError('invalid-subject-reconsideration-input', 'Supply the closed reconsideration request and explicit capacities.'); };
const plain = value => value !== null && typeof value === 'object'
  && [Object.prototype, null].includes(Object.getPrototypeOf(value));
function own(value, keys) {
  if (!plain(value) || Reflect.ownKeys(value).length !== keys.length) fail();
  for (const key of keys) {
    const field = Object.getOwnPropertyDescriptor(value, key);
    if (!field?.enumerable || !Object.hasOwn(field, 'value')) fail();
  }
  return value;
}
const hash = (value, length) => typeof value === 'string' && value.length === length && /^[0-9a-f]+$/.test(value);
const path = value => typeof value === 'string' && value.length > 0 && !/[\\\0]/.test(value)
  && !/^[A-Za-z]:/.test(value) && value.split('/').every(part => part && part !== '.' && part !== '..');
function snapshot(value) {
  own(value, ['commit', 'tree', 'kitPath']);
  if (typeof value.commit !== 'string' || ![40, 64].includes(value.commit.length) || !hash(value.commit, value.commit.length)
    || !hash(value.tree, value.commit.length) || !(value.kitPath === '.' || path(value.kitPath))) fail();
}
function capacities(value, keys) {
  own(value, keys);
  if (keys.some(key => !Number.isSafeInteger(value[key]) || value[key] < 0)) fail();
}
/** Canonical input identity excludes only the host checkout coordinate. */
export function subjectReconsiderationInputWire(input) {
  const capture = value => ({ capture: structuredClone(value.capture), bytesBase64: value.bytes.toString('base64'), objectFormat: value.objectFormat });
  return { version: 1, before: structuredClone(input.before), candidate: structuredClone(input.candidate),
    operation: structuredClone(input.operation), limits: structuredClone(input.limits), evidence: {
      decisionCaptures: input.evidence.decisionCaptures.map(capture),
      assessmentCaptures: input.evidence.assessmentCaptures.map(pair => ({ registry: capture(pair.registry), identity: capture(pair.identity) })),
      materialCaptures: input.evidence.materialCaptures.map(capture),
    } };
}

/** Authentic allowance is required even for invalid input; no caller callbacks. */
export function admitSubjectReconsiderationInput(input, options) {
  return admitInput(input, options, false);
}

/** Fixed wire admission; never decode and then route through the raw copy path. */
export function decodeSubjectReconsiderationInput(repoRoot, wire, options) {
  return admitInput(wire, options, true, repoRoot);
}

function admitInput(input, options, wire, repoRootFromHost, ordinary = false) {
  try {
    own(options, ['operationBudget']);
    const budget = getSubjectValidationBudget(options.operationBudget);
    budget.assertActive();
    budget.charge('validationSteps', 1, 'reconsideration-input');
    if (wire) {
      own(input, ['version', 'before', 'candidate', 'operation', 'evidence', 'limits']);
      if (input.version !== 1) fail();
      input = { repoRoot: repoRootFromHost, before: input.before, candidate: input.candidate,
        operation: input.operation, evidence: input.evidence, limits: input.limits };
    }
    own(input, ['repoRoot', 'before', 'candidate', 'operation', 'evidence', 'limits']);
    const { repoRoot, before, candidate, operation, evidence, limits } = input;
    // Buffers are admitted separately. The bounded visitor rejects accessors,
    // symbols and exotic metadata without invoking their values.
    budget.guard({ repoRoot, before, candidate, operation, limits }, 'reconsideration-input-metadata');
    if (typeof repoRoot !== 'string' || !repoRoot.trim() || repoRoot.includes('\0')) fail();
    snapshot(before); snapshot(candidate);
    own(operation, ['version', 'id', 'action', 'proposal', 'subject', 'registryEvent', 'assignmentEvent']);
    own(operation.registryEvent, ['id', 'changeDigest']);
    if (operation.version !== 1 || !isIdentityUuid(operation.id) || (ordinary ? !['activate', 'promote-proposal'].includes(operation.action) : operation.action !== 'reconsider-proposal')
      || (ordinary && operation.action === 'activate' ? operation.proposal !== null : !parseProposalKey('subject', operation.proposal).ok) || !parseCanonicalId('subject', operation.subject).ok
      || !isIdentityUuid(operation.registryEvent.id) || !hash(operation.registryEvent.changeDigest, 64)
      || operation.assignmentEvent !== null) fail();
    own(limits, ['governance', 'allocation', 'closure']);
    capacities(limits.governance, governanceKeys); capacities(limits.allocation, ['maxLedgerRows']);
    capacities(limits.closure, ['maxRows', 'maxBytes']);
    const owned = { repoRoot, before: structuredClone(before), candidate: structuredClone(candidate),
      operation: structuredClone(operation), limits: structuredClone(limits),
      evidence: wire ? decodeReconsiderationCaptureEvidence(evidence, budget) : admitReconsiderationCaptureEvidence(evidence, budget) };
    return { ok: true, input: owned, inputDigest: canonicalSha256(subjectReconsiderationInputWire(owned)), diagnostics: [] };
  } catch (error) {
    if (!(error instanceof SubjectError || error instanceof CapturedInputError)) throw error;
    return { ok: false, input: null, inputDigest: null, diagnostics: [{ code: error.code, path: '', message: error.message }] };
  }
}

/** Fixed ordinary creation entrypoints reuse metadata/capture admission only. */
export function admitSubjectCreationInput(input, options) { return admitInput(input, options, false, undefined, true); }
export function decodeSubjectCreationInput(repoRoot, wire, options) { return admitInput(wire, options, true, repoRoot, true); }
export const subjectCreationInputWire = subjectReconsiderationInputWire;
