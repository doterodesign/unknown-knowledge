/** Shared operation limits; logical visits are not CPU or native YAML allocation measurements. */
import { createHash } from 'node:crypto';
import { SubjectError } from './subject-error.js';
import { createDocumentBudget, guardCapturedDocument, getDocumentBudgetUsage, getDocumentBudgetFailure, DocumentBudgetError } from './document-budget.js';

const budgets = new WeakSet();
const counters = { captureBytes: 'maxCaptureBytes', documentNodes: 'maxDocumentNodes',
  documentTextUnits: 'maxDocumentTextUnits', subjects: 'maxSubjects',
  historyRows: 'maxHistoryRows', validationSteps: 'maxValidationSteps' };

export function createSubjectValidationBudget(limits) {
  const keys = Object.values(counters);
  if (!limits || typeof limits !== 'object' || Array.isArray(limits)
    || Reflect.ownKeys(limits).length !== keys.length
    || keys.some((key) => !Object.hasOwn(limits, key) || !Number.isSafeInteger(limits[key]) || limits[key] < 0)) {
    throw new SubjectError('invalid-subject-validation-budget', 'Supply every explicit safe nonnegative operation limit.');
  }
  const captured = { ...limits };
  const used = { ...Object.fromEntries(Object.keys(counters).map((key) => [key, 0])), relevantRefusalRows: 0 };
  let failure = null;
  const documentBudget = createDocumentBudget({ maxDocumentNodes: limits.maxDocumentNodes,
    maxDocumentTextUnits: limits.maxDocumentTextUnits });
  function snapshotFailure() {
    const neutral = getDocumentBudgetFailure(documentBudget);
    if (!failure && neutral) failure = { ...neutral, code: 'subject-validation-budget' };
    return failure ? { ...failure } : null;
  }
  function assertActive() {
    const failed = snapshotFailure();
    if (failed) throw Object.assign(new SubjectError(failed.code, failed.message), failed);
  }
  function charge(counter, amount, phase) {
    assertActive();
    if (!Object.hasOwn(counters, counter) || ['documentNodes', 'documentTextUnits'].includes(counter)
      || !Number.isSafeInteger(amount) || amount < 0 || typeof phase !== 'string' || !phase.trim()) throw new TypeError('Invalid budget debit.');
    if (amount > captured[counters[counter]] - used[counter]) {
      failure = { code: 'subject-validation-budget', message: `Limit ${counters[counter]} exhausted during ${phase}.`,
        counter, phase, attempted: amount, remaining: captured[counters[counter]] - used[counter] };
      assertActive();
    }
    used[counter] += amount;
  }
  function guard(document, phase) {
    assertActive();
    try { guardCapturedDocument(document, documentBudget, { phase }); }
    catch (error) { throw adaptDocumentBudgetError(error); }
  }

  const admitted = new WeakMap();
  const reservations = new WeakMap();
  function reserveCaptureBytes(length, phase = 'raw-captures') {
    charge('captureBytes', length, phase);
    const reservation = Object.freeze({}); reservations.set(reservation, length); return reservation;
  }
  function admitCapture(capture, reservation) {
    assertActive();
    if (!capture || typeof capture !== 'object' || !Buffer.isBuffer(capture.bytes)) {
      throw new SubjectError('invalid-capture-admission', 'Capture admission requires actual raw Buffer bytes.');
    }
    const { bytes } = capture;
    let digest;
    if (reservation !== undefined) {
      if (!reservations.has(reservation) || reservations.get(reservation) !== bytes.length) {
        throw new SubjectError('invalid-capture-reservation', 'An unused exact-length reservation from this operation is required.');
      }
      reservations.delete(reservation);
    } else {
      const previous = admitted.get(capture);
      if (previous?.buffer === bytes && previous.length === bytes.length) {
        digest = createHash('sha256').update(bytes).digest('hex');
        if (previous.sha256 === digest) return;
      }
      charge('captureBytes', bytes.length, 'raw-captures');
    }
    admitted.set(capture, { buffer: bytes, length: bytes.length, sha256: digest ?? createHash('sha256').update(bytes).digest('hex') });
  }
  const handle = Object.freeze({ charge, guard, documentBudget, assertActive, reserveCaptureBytes, admitCapture,
    get used() { return { ...used, ...getDocumentBudgetUsage(documentBudget) }; },
    get failure() { return snapshotFailure(); },
    relevant() { charge('validationSteps', 1, 'relevant-refusal'); used.relevantRefusalRows += 1; } });
  budgets.add(handle); return handle;
}

/** Copying methods or fields never creates an operation allowance. */
export function getSubjectValidationBudget(handle) {
  if (!budgets.has(handle)) throw new SubjectError('invalid-subject-validation-budget-handle', 'An authentic Subject validation budget is required.');
  return handle;
}

/** Existing internal budgets and opt-in operation composition cannot both be specified. */
export function selectSubjectValidationBudget(budget, operationBudget) {
  if (budget !== undefined && operationBudget !== undefined) {
    throw new SubjectError('ambiguous-subject-validation-budget', 'Supply either the existing budget or an operation budget.');
  }
  const handle = operationBudget !== undefined ? operationBudget : budget;
  if (handle === undefined) return undefined;
  const authentic = getSubjectValidationBudget(handle); authentic.assertActive(); return authentic;
}

/** Keep the subject API diagnostics stable across the identity-neutral visitor. */
export function adaptDocumentBudgetError(error) {
  if (!(error instanceof DocumentBudgetError)) return error;
  const codes = { 'document-budget-exhausted': 'subject-validation-budget', 'cyclic-document': 'cyclic-subject-input',
    'invalid-document': 'invalid-subject-input' };
  const adapted = new SubjectError(codes[error.code] ?? error.code, error.message);
  if (error.counter) { adapted.counter = error.counter; adapted.phase = error.phase;
    adapted.attempted = error.attempted; adapted.remaining = error.remaining; }
  return adapted;
}
