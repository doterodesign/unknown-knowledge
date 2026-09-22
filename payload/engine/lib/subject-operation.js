/** Opt-in host admission for one captured Subject query operation. */
import { writeSync } from 'node:fs';
import { loadStores } from './load-stores.js';
import { createSourceBudget, getSourceBudgetUsage, SourceBudgetError } from './source-budget.js';
import { DocumentBudgetError, guardCapturedDocument } from './document-budget.js';
import { createSubjectValidationBudget } from './subject-validation-budget.js';
import { SubjectError } from './subjects.js';

const operations = new WeakMap();
export const SUBJECT_OPERATION_BOOTSTRAP_BYTES = 16384;
const validationKeys = ['maxCaptureBytes', 'maxDocumentNodes', 'maxDocumentTextUnits', 'maxSubjects', 'maxHistoryRows', 'maxValidationSteps'];
const corpusKeys = ['maxCanonicalRecords', 'maxAuthoredRecords', 'maxSubjects', 'maxHierarchyDepth',
  'maxHistoryEvents', 'maxHistoryRows', 'maxAssignmentsPerRecord', 'maxAssignments', 'maxBodyBytesPerRecord'];
const rootKeys = ['version', 'maxSourceBytes', 'maxSingleCaptureBytes', 'maxOutputBytes', 'validation', 'corpus'];
const closed = (value, keys) => value !== null && typeof value === 'object'
  && [Object.prototype, null].includes(Object.getPrototypeOf(value))
  && Reflect.ownKeys(value).length === keys.length && keys.every((key) =>
    Object.hasOwn(Object.getOwnPropertyDescriptor(value, key) ?? {}, 'value'));
const whole = (value) => Number.isSafeInteger(value) && value >= 0;

export class SubjectOperationError extends Error {
  constructor(code, message, details = {}) {
    super(message); this.name = 'SubjectOperationError'; this.code = code;
    Object.assign(this, details);
  }
}

export function parseSubjectOperationLimitsJson(text) {
  if (typeof text !== 'string' || Buffer.byteLength(text, 'utf8') > SUBJECT_OPERATION_BOOTSTRAP_BYTES) {
    throw new SubjectOperationError('operation-bootstrap-budget', 'Operation policy exceeds the fixed bootstrap allowance.');
  }
  try { return JSON.parse(text); }
  catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    throw new SubjectOperationError('invalid-operation-limits', 'Operation limits must be valid JSON.');
  }
}

export function createSubjectOperation(limits) {
  if (!closed(limits, rootKeys) || limits.version !== 1
    || !['maxSourceBytes', 'maxSingleCaptureBytes', 'maxOutputBytes'].every((key) => whole(limits[key]))
    || !closed(limits.validation, validationKeys) || !validationKeys.every((key) => whole(limits.validation[key]))
    || !closed(limits.corpus, corpusKeys) || !corpusKeys.every((key) => whole(limits.corpus[key]))) {
    throw new SubjectOperationError('invalid-operation-limits', 'Supply every explicit version 1 operation capacity.');
  }
  const captured = structuredClone(limits);
  const budget = createSubjectValidationBudget(captured.validation);
  const sourceBudget = createSourceBudget({ maxSourceBytes: captured.maxSourceBytes });
  const handle = Object.freeze({});
  operations.set(handle, { limits: captured, budget, sourceBudget, failure: null,
    corpus: null, outputBytesAdmitted: 0, outputBytesWritten: 0, outputWriteUncertain: false,
    resources: Object.freeze({ sourceBudget, documentBudget: budget.documentBudget, subjectOperationBudget: budget }) });
  return handle;
}

function stateOf(operation) {
  const state = operations.get(operation);
  if (!state) throw new SubjectOperationError('invalid-subject-operation', 'An authentic Subject operation is required.');
  return state;
}

function latch(state, error) {
  const first = state.failure ?? getSourceBudgetUsage(state.sourceBudget).failure ?? state.budget.failure ?? error;
  state.failure ??= { code: first.code, phase: first.phase ?? null, counter: first.counter ?? null,
    attempted: first.attempted ?? first.attemptedBytes ?? null, remaining: first.remaining ?? null };
  return new SubjectOperationError(state.failure.code, 'The host operation cannot continue.', { ...state.failure });
}

export function assertSubjectOperation(operation) {
  const state = stateOf(operation);
  if (state.failure) throw latch(state, state.failure);
  const sourceFailure = getSourceBudgetUsage(state.sourceBudget).failure;
  if (sourceFailure) throw latch(state, sourceFailure);
  try { state.budget.assertActive(); }
  catch (error) {
    if (!(error instanceof SubjectError || error instanceof DocumentBudgetError)) throw error;
    throw latch(state, error);
  }
}

/** Convert only expected admission errors; implementation exceptions stay bugs. */
export function rethrowSubjectOperationFailure(operation, error) {
  if (error instanceof SubjectOperationError || error instanceof SourceBudgetError || error instanceof DocumentBudgetError
    || (error instanceof SubjectError && stateOf(operation).budget.failure)) throw latch(stateOf(operation), error);
  throw error;
}

export function getSubjectOperationResources(operation) {
  assertSubjectOperation(operation);
  return stateOf(operation).resources;
}

export function getSubjectOperationUsage(operation) {
  const state = stateOf(operation);
  const source = getSourceBudgetUsage(state.sourceBudget);
  const failure = state.failure ?? source.failure ?? state.budget.failure;
  return { limits: structuredClone(state.limits), sourceBytes: source.sourceBytes,
    validation: { ...state.budget.used }, corpus: state.corpus && { ...state.corpus },
    outputBytesAdmitted: state.outputBytesAdmitted, outputBytesWritten: state.outputBytesWritten,
    outputWriteUncertain: state.outputWriteUncertain, failure: failure && { ...failure } };
}

export function guardSubjectOperationDocument(operation, document, phase) {
  assertSubjectOperation(operation);
  try { stateOf(operation).budget.guard(document, phase); }
  catch (error) { rethrowSubjectOperationFailure(operation, error); }
}

function captureLength(state, length) {
  if (!whole(length) || length > state.limits.maxSingleCaptureBytes) {
    throw latch(state, { code: 'single-capture-budget', counter: 'singleCaptureBytes', phase: 'capture-admission',
      attempted: length, remaining: state.limits.maxSingleCaptureBytes });
  }
}

/** Reserve raw capture capacity before allocating the decoded Buffer. */
export function reserveSubjectOperationCapture(operation, length) {
  assertSubjectOperation(operation);
  const state = stateOf(operation); captureLength(state, length);
  try { return state.budget.reserveCaptureBytes(length, 'transport-capture'); }
  catch (error) { rethrowSubjectOperationFailure(operation, error); }
}

export function admitSubjectOperationCapture(operation, capture, reservation) {
  assertSubjectOperation(operation);
  const state = stateOf(operation);
  if (!(capture?.bytes instanceof Uint8Array)) {
    throw latch(state, { code: 'invalid-operation-capture', phase: 'capture-admission' });
  }
  captureLength(state, capture.bytes.byteLength);
  try { state.budget.admitCapture(capture, reservation); }
  catch (error) { rethrowSubjectOperationFailure(operation, error); }
}

export { assertSubjectOperationContext } from './subject-query-context.js';

/** Unique captured corpus, distinct from cumulative parse/validation visits. */
export function admitSubjectOperationCorpus(operation, model) {
  try { return admitCorpus(operation, model); }
  catch (error) { rethrowSubjectOperationFailure(operation, error); }
}

/**
 * Consume parse admission only inside the fixed synchronous loader's private
 * lifetime. Loader consumers must not mutate/replace record or body payloads,
 * expose model references, await, or call caller code before this admission.
 * Such a change requires re-guarding changed data or removing this optimization.
 * No proof survives return: public admission always guards the entire model.
 */
export function loadAndAdmitSubjectOperationModel(operation, root) {
  const resources = getSubjectOperationResources(operation);
  if (typeof root !== 'string') throw new TypeError('Supply a primitive kit-root string.');
  try {
    const model = loadStores(root, resources);
    if (model.ok && model.subjectRegistry) admitCorpus(operation, model, true);
    return model; // Unhealthy/authority-absent diagnostics remain with the caller.
  } catch (error) { rethrowSubjectOperationFailure(operation, error); }
}

function guardInitialEntry(operation, state, entry) {
  assertSubjectOperation(operation);
  state.budget.charge('validationSteps', 1, 'initial-corpus-wrapper');
  const keys = entry !== null && typeof entry === 'object' ? Reflect.ownKeys(entry) : [];
  const expected = keys.length === 3 ? ['id', 'file', 'record']
    : keys.length === 6 ? ['identity', 'id', 'notation', 'file', 'record', 'body'] : [];
  const descriptors = Object.create(null);
  const recognized = expected.length > 0 && [Object.prototype, null].includes(Object.getPrototypeOf(entry))
    && keys.every((key) => {
      if (!expected.includes(key)) return false;
      const descriptor = Object.getOwnPropertyDescriptor(entry, key);
      descriptors[key] = descriptor;
      return descriptor.enumerable && Object.hasOwn(descriptor, 'value');
    });
  if (!recognized) {
    guardCapturedDocument(entry, state.budget.documentBudget, { phase: 'corpus-entry', allowUndefined: true });
    return;
  }
  // This is an actual metadata shell, not a claimed traversal of its payloads.
  // Exact key/descriptor matching makes unfamiliar future wrappers fall back.
  const metadata = Object.create(null);
  for (const key of keys) metadata[key] = key === 'record' || key === 'body' ? null : descriptors[key].value;
  guardCapturedDocument(metadata, state.budget.documentBudget, { phase: 'initial-corpus-entry-metadata', allowUndefined: true });
}

function admitCorpus(operation, model, initialOwned = false) {
  assertSubjectOperation(operation);
  const state = stateOf(operation);
  const counts = { complete: false, canonicalRecords: null, authoredRecords: null, subjects: null, hierarchyDepth: null,
    historyEvents: null, historyRows: null, subjectHistoryEvents: null, subjectHistoryRows: null,
    assignmentEvents: null, assignmentRows: null, assignmentBaselines: null,
    assignments: null, assignmentsPerRecord: null, bodyBytesPerRecord: null };
  const check = (name, value, limit) => {
    counts[name] = value;
    if (value > state.limits.corpus[limit]) {
      state.corpus = { ...counts };
      throw latch(state, { code: 'operation-corpus-budget', counter: name, phase: 'corpus-admission',
        attempted: value, remaining: state.limits.corpus[limit] });
    }
  };
  const canonical = [model.leaves, model.concepts, model.decisions];
  check('canonicalRecords', canonical.reduce((sum, map) => sum + map.size, 0), 'maxCanonicalRecords');
  const sources = [...canonical, ...Object.values(model.proposals)];
  check('authoredRecords', sources.reduce((sum, map) => sum + map.size, 0), 'maxAuthoredRecords');
  counts.assignments = 0; counts.assignmentsPerRecord = 0; counts.bodyBytesPerRecord = 0;
  for (const source of sources) for (const entry of source.values()) {
    if (initialOwned) guardInitialEntry(operation, state, entry);
    else guardCapturedDocument(entry, state.budget.documentBudget, { phase: 'corpus-entry', allowUndefined: true });
    if (!entry.record || typeof entry.record !== 'object' || Array.isArray(entry.record)
      || (entry.body !== undefined && typeof entry.body !== 'string')) {
      throw latch(state, { code: 'invalid-operation-context', phase: 'corpus-entry' });
    }
    state.budget.charge('validationSteps', 1, 'corpus-record');
    const assignments = Array.isArray(entry.record.subjects) ? entry.record.subjects.length : 0;
    check('assignmentsPerRecord', Math.max(counts.assignmentsPerRecord, assignments), 'maxAssignmentsPerRecord');
    check('assignments', counts.assignments + assignments, 'maxAssignments');
    check('bodyBytesPerRecord', Math.max(counts.bodyBytesPerRecord, Buffer.byteLength(entry.body ?? '', 'utf8')), 'maxBodyBytesPerRecord');
  }
  const registry = model.subjectRegistry;
  guardSubjectOperationDocument(operation, registry.document, 'corpus-registry');
  check('subjects', registry.document.subjects.length, 'maxSubjects');
  const events = registry.document.history ?? [];
  const assignmentEvents = model.assignmentHistory?.events ?? [];
  counts.subjectHistoryEvents = events.length;
  counts.assignmentEvents = assignmentEvents.length;
  check('historyEvents', counts.subjectHistoryEvents + counts.assignmentEvents, 'maxHistoryEvents');
  counts.historyRows = 0; counts.subjectHistoryRows = 0; counts.assignmentRows = 0;
  for (const event of events) {
    counts.subjectHistoryRows += event.rows.length;
    check('historyRows', counts.historyRows + event.rows.length, 'maxHistoryRows');
  }
  for (const event of assignmentEvents) {
    counts.assignmentRows += event.rows.length;
    check('historyRows', counts.historyRows + event.rows.length, 'maxHistoryRows');
  }
  counts.assignmentBaselines = model.assignmentHistory?.baselines.length ?? 0;
  check('historyRows', counts.historyRows + counts.assignmentBaselines, 'maxHistoryRows');
  counts.hierarchyDepth = 0;
  for (const id of registry.subjects.keys()) {
    let cursor = id; let depth = 0;
    while (registry.parents.has(cursor)) {
      state.budget.charge('validationSteps', 1, 'corpus-hierarchy');
      depth += 1;
      check('hierarchyDepth', Math.max(counts.hierarchyDepth, depth), 'maxHierarchyDepth');
      cursor = registry.parents.get(cursor);
    }
  }
  counts.complete = true;
  state.corpus = counts;
}

/** Whole UTF-8 admission before any write; failed writes never refund capacity. */
export function writeSubjectOperationOutput(operation, text, { fd = 1 } = {}) {
  const state = stateOf(operation); // output admission is permitted after a work latch
  if (typeof text !== 'string' || ![1, 2].includes(fd)) throw new TypeError('Output requires text and fd 1 or 2.');
  const length = Buffer.byteLength(text, 'utf8');
  const remaining = state.limits.maxOutputBytes - state.outputBytesAdmitted;
  if (length > remaining) throw latch(state, { code: 'operation-output-budget', counter: 'outputBytes',
    phase: 'output-admission', attempted: length, remaining });
  state.outputBytesAdmitted += length;
  const bytes = Buffer.from(text, 'utf8');
  let offset = 0;
  try {
    while (offset < bytes.length) {
      const count = writeSync(fd, bytes, offset, bytes.length - offset);
      if (count === 0) throw new SubjectOperationError('operation-output-write', 'Output made no progress.');
      offset += count; state.outputBytesWritten += count;
    }
  } catch (error) {
    state.outputWriteUncertain = true;
    throw latch(state, { code: 'operation-output-write', phase: 'output-write' });
  }
}
