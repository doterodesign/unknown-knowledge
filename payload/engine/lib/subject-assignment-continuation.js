/** Fixed ordinary continuation admission; owned bundles are internal, not proof. */
import { canonicalSha256, CapturedInputError } from './canonical-json.js';
import { SubjectError } from './subject-error.js';
import { createSubjectValidationBudget } from './subject-validation-budget.js';
import { admitAssignmentCaptureEvidence, decodeAssignmentCaptureEvidence } from './subject-capture-admission.js';

const capacities = ['maxCaptureBytes', 'maxDocumentNodes', 'maxDocumentTextUnits',
  'maxSubjects', 'maxHistoryRows', 'maxValidationSteps'];
const fail = () => { throw new SubjectError('invalid-assignment-continuation',
  'Supply the closed assignment continuation and explicit governance capacities.'); };
const plain = value => value !== null && typeof value === 'object'
  && [Object.prototype, null].includes(Object.getPrototypeOf(value));
function field(value, key) {
  if (!plain(value)) fail();
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) fail();
  return descriptor.value;
}
function own(value, keys) {
  if (!plain(value) || Reflect.ownKeys(value).length !== keys.length) fail();
  for (const key of keys) field(value, key);
}

/** Genuine omission performs no evidence admission or budget creation. */
export function admitSubjectAssignmentContinuation(input) {
  return admit(input, false);
}

/** Wire evidence is reserved and decoded once under the owned allowance. */
export function decodeSubjectAssignmentContinuation(input) {
  return admit(input, true);
}

function admit(input, wire) {
  let present = false, bundle = null;
  try {
    if (input === null || typeof input !== 'object') fail();
    const descriptor = Object.getOwnPropertyDescriptor(input, 'continuation');
    present = descriptor !== undefined || 'continuation' in input;
    if (!present) return { ok: true, present: false, bundle: null, diagnostics: [] };
    const continuation = field(input, 'continuation');
    // Safely obtain only the explicit capacities before any evidence traversal.
    const limits = field(field(continuation, 'limits'), 'governance');
    own(limits, capacities);
    const copiedLimits = Object.fromEntries(capacities.map(key => [key, field(limits, key)]));
    if (Object.values(copiedLimits).some(value => !Number.isSafeInteger(value) || value < 0)) fail();
    const operationBudget = createSubjectValidationBudget(copiedLimits);
    bundle = { evidence: null, limits: copiedLimits, inputDigest: null, operationBudget };
    operationBudget.assertActive();
    operationBudget.charge('validationSteps', 1, 'assignment-continuation-input');
    own(continuation, ['version', 'assessmentCaptures', 'materialCaptures', 'limits']);
    own(continuation.limits, ['governance']);
    operationBudget.guard({ version: continuation.version, limits: continuation.limits }, 'assignment-continuation-metadata');
    if (continuation.version !== 1) fail();
    const evidence = { decisionCaptures: field(input, 'decisionCaptures'),
      assessmentCaptures: continuation.assessmentCaptures, materialCaptures: continuation.materialCaptures };
    const owned = wire ? decodeAssignmentCaptureEvidence(evidence, operationBudget)
      : admitAssignmentCaptureEvidence(evidence, operationBudget);
    const capture = ({ capture, bytes, objectFormat }) => ({ capture, bytesBase64: bytes.toString('base64'), objectFormat });
    const encoded = { version: 1, decisionCaptures: owned.decisionCaptures.map(capture), continuation: {
      version: 1, assessmentCaptures: owned.assessmentCaptures.map(pair => ({ registry: capture(pair.registry), identity: capture(pair.identity) })),
      materialCaptures: owned.materialCaptures.map(capture), limits: { governance: copiedLimits } } };
    const inputDigest = canonicalSha256(encoded);
    operationBudget.assertActive();
    bundle.evidence = owned;
    bundle.inputDigest = inputDigest;
    return { ok: true, present: true, bundle, diagnostics: [] };
  } catch (error) {
    if (!(error instanceof SubjectError || error instanceof CapturedInputError)) throw error;
    return { ok: false, present, bundle, diagnostics: [{ code: error.code, path: 'continuation', message: error.message }] };
  }
}
