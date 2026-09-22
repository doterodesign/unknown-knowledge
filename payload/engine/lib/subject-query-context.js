/** Query context input transport; retained bytes are verified by real governance. */
import { EngineRefusal, rethrowIfBug } from './engine-refusal.js';
import { isCaptureLocator } from './capture-locator.js';
import { locateKitRoot } from './kit-root.js';
import { loadStores } from './load-stores.js';
import { readSourceFileSync } from './source-budget.js';
import { evaluateSubjectGovernance } from './subject-governance.js';
import { SubjectError } from './subject-error.js';
import { assertSubjectOperation, getSubjectOperationResources, guardSubjectOperationDocument,
  reserveSubjectOperationCapture, admitSubjectOperationCapture, loadAndAdmitSubjectOperationModel,
  rethrowSubjectOperationFailure, SubjectOperationError } from './subject-operation.js';

const operations = new WeakMap();
const capturedOperations = new WeakSet();

/** Loaded contexts cannot switch to a fresh allowance or lose it between phases. */
export function assertSubjectOperationContext(operation, context) {
  const binding = operations.get(context);
  if (operation === undefined && !binding) return;
  if (operation !== undefined) assertSubjectOperation(operation);
  if (!binding || binding.operation !== operation || binding.model !== context.model || binding.governance !== context.subjectGovernance) {
    throw new SubjectOperationError('operation-context-mismatch', 'Use the original operation and its actual loaded context.');
  }
}

export class SubjectQueryContextError extends EngineRefusal {
  constructor(code, message) { super(message); this.code = code; }
}

/** Shared fixed file reader; expected input errors retain their typed boundary. */
export function readSubjectQueryJson(file, label, operation) {
  let source;
  try { source = readSourceFileSync(file, { ...(operation ? getSubjectOperationResources(operation) : {}), encoding: 'utf8' }); }
  catch (error) {
    if (!Number.isInteger(error.errno) || typeof error.code !== 'string') throw error;
    throw new SubjectQueryContextError('query-input-read-error', `Cannot read ${label}: ${error.message}`);
  }
  try {
    const document = JSON.parse(source);
    if (operation) guardSubjectOperationDocument(operation, document, `parsed-${label}`);
    return document;
  }
  catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    throw new SubjectQueryContextError(`invalid-${label}-json`,
      `${label} must contain valid JSON: ${error.message}`);
  }
}

const exactObject = (value, fields) => value !== null && typeof value === 'object' && !Array.isArray(value)
  && [Object.prototype, null].includes(Object.getPrototypeOf(value))
  && Reflect.ownKeys(value).length === fields.length && fields.every((field) => Object.hasOwn(value, field));

/** One byte-transport policy shared by Decision and assessment captures. */
function decodeCapture(row, fail, label, operation) {
  if (!exactObject(row, ['capture', 'bytesBase64', 'objectFormat'])
    || !isCaptureLocator(row.capture) || !['sha1', 'sha256'].includes(row.objectFormat)) {
    fail(`${label} requires exact capture, bytesBase64 and objectFormat fields.`);
  }
  // Exact decoded size is known from canonical transport length before allocation.
  if (typeof row.bytesBase64 !== 'string' || row.bytesBase64.length % 4 !== 0) {
    fail(`${label} requires canonical base64 bytes.`);
  }
  const padding = row.bytesBase64.endsWith('==') ? 2 : row.bytesBase64.endsWith('=') ? 1 : 0;
  const length = row.bytesBase64.length / 4 * 3 - padding;
  const reservation = operation ? reserveSubjectOperationCapture(operation, length) : undefined;
  if (/[^A-Za-z0-9+/]/.test(row.bytesBase64.slice(0, row.bytesBase64.length - padding))) {
    fail(`${label} requires canonical base64 bytes.`);
  }
  const bytes = Buffer.from(row.bytesBase64, 'base64');
  if (bytes.toString('base64') !== row.bytesBase64) fail(`${label} has noncanonical base64 padding bits.`);
  const capture = { capture: structuredClone(row.capture), bytes, objectFormat: row.objectFormat };
  if (operation) admitSubjectOperationCapture(operation, capture, reservation);
  return capture;
}

/** Decode exact JSON transport without granting integrity or approval. */
export function decodeDecisionCaptures(document, { operation } = {}) {
  if (operation !== undefined) guardSubjectOperationDocument(operation, document, 'decision-transport');
  const fail = (message) => { throw new SubjectQueryContextError('invalid-decision-captures', message); };
  if (!Array.isArray(document)) fail('Decision captures must be an explicit JSON array.');
  return Array.from(document, (row, index) => decodeCapture(row, fail, `Decision capture ${index}`, operation));
}

/** Decode retained before-registry/identity pairs; P2 owns evidence adjudication. */
export function decodeAssessmentCaptures(document, { operation } = {}) {
  if (operation !== undefined) guardSubjectOperationDocument(operation, document, 'assessment-transport');
  const fail = (message) => { throw new SubjectQueryContextError('invalid-assessment-captures', message); };
  if (!Array.isArray(document)) fail('Assessment captures must be an explicit JSON array.');
  return Array.from(document, (pair, index) => {
    if (!exactObject(pair, ['registry', 'identity'])) fail(`Assessment capture ${index} requires exact registry and identity fields.`);
    return {
      registry: decodeCapture(pair.registry, fail, `Assessment capture ${index} registry`, operation),
      identity: decodeCapture(pair.identity, fail, `Assessment capture ${index} identity`, operation),
    };
  });
}

// Material is a new own-data boundary. Older capture entrypoints retain their
// existing admission semantics; only the byte/base64 mechanics are shared.
const materialObject = (value, required, optional = []) => value !== null && typeof value === 'object'
  && [Object.prototype, null].includes(Object.getPrototypeOf(value))
  && required.every(key => Object.hasOwn(value, key))
  && Reflect.ownKeys(value).every(key => {
    const field = Object.getOwnPropertyDescriptor(value, key);
    return [...required, ...optional].includes(key) && field.enumerable && Object.hasOwn(field, 'value');
  });
const materialLocator = value => materialObject(value, ['file', 'blob', 'sha256'], ['source'])
  && ['file', 'blob', 'sha256'].every(key => typeof value[key] === 'string')
  && (!Object.hasOwn(value, 'source') || (materialObject(value.source, ['commit', 'tree'])
    && typeof value.source.commit === 'string' && typeof value.source.tree === 'string'))
  && isCaptureLocator(value);

function materialArray(value, fail) {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) fail('Material captures must be an ordinary dense array.');
}

function guardMaterial(operation, document, phase, fail) {
  try { guardSubjectOperationDocument(operation, document, phase); }
  catch (error) {
    if (!(error instanceof SubjectError) || !['invalid-subject-input', 'cyclic-subject-input'].includes(error.code)) throw error;
    fail(error.message);
  }
}

function materialRows(document, fail, raw, visit, operation) {
  materialArray(document, fail);
  if (raw && operation !== undefined) {
    // Admit the entire raw row population before its descriptor walk. This is
    // logical row admission, not a measurement of every later metadata visit.
    try { getSubjectOperationResources(operation).subjectOperationBudget.charge('validationSteps', document.length, 'material-context-rows'); }
    catch (error) { rethrowSubjectOperationFailure(operation, error); }
  }
  if (Reflect.ownKeys(document).length !== document.length + 1) fail('Material captures cannot carry extra or hidden properties.');
  for (let index = 0; index < document.length; index += 1) {
    const field = Object.getOwnPropertyDescriptor(document, String(index));
    if (!field?.enumerable || !Object.hasOwn(field, 'value')) fail('Material captures require own enumerable data rows.');
    const row = field.value;
    if (!materialObject(row, ['capture', raw ? 'bytes' : 'bytesBase64', 'objectFormat'])) {
      fail('Material captures require exact own data capture, bytes and objectFormat fields.');
    }
    if (raw && operation !== undefined) {
      guardMaterial(operation, { capture: row.capture, objectFormat: row.objectFormat }, 'material-context-metadata', fail);
    }
    if (!materialLocator(row.capture) || !['sha1', 'sha256'].includes(row.objectFormat)
      || (raw ? !Buffer.isBuffer(row.bytes) : typeof row.bytesBase64 !== 'string')) {
      fail('Material captures require exact own data capture, bytes and objectFormat fields.');
    }
    visit(row, index);
  }
}

/** Decode only material transport; integrity and historical eligibility remain governance work. */
export function decodeMaterialCaptures(document, options = {}) {
  const fail = message => { throw new SubjectQueryContextError('invalid-material-captures', message); };
  if (!materialObject(options, [], ['operation'])) fail('Material decoding accepts only an optional own data operation.');
  const supplied = Object.hasOwn(options, 'operation');
  const operation = options.operation;
  if (supplied) assertSubjectOperation(operation);
  materialArray(document, fail);
  // Authenticate and guard before the substantive row walk, not after an
  // unbounded descriptor pre-pass. Unbounded decoding still rejects accessors.
  if (supplied) guardMaterial(operation, document, 'material-transport', fail);
  const decoded = [];
  materialRows(document, fail, false, (row, index) => {
    decoded.push(decodeCapture(row, fail, `Material capture ${index}`, operation));
  });
  return decoded;
}

/**
 * Read one actual installation and evaluate its actual retained review bytes.
 * This does not reread current Decision files as historical evidence, fetch Git
 * objects or authenticate a human reviewer. Missing retained evidence remains
 * unavailable in P2's handle and relevant query eligibility will refuse.
 * @param {{root:string,decisionCaptures?:object[],assessmentCaptures?:object[],materialCaptures?:object[]}} options repository root and decoded captures
 */
export function loadSubjectQueryContext(options = {}) {
  const { root, decisionCaptures = [], assessmentCaptures = [], operation } = options;
  const failed = (code, message, diagnostics = []) => ({ ok: false, diagnostics: [{ code, path: '', message }, ...diagnostics] });
  const resources = operation === undefined ? {} : getSubjectOperationResources(operation);
  if (operation !== undefined) {
    if (capturedOperations.has(operation)) throw new SubjectOperationError('operation-context-already-loaded',
      'This host operation admits one captured context; repeated query phases reuse that context.');
    capturedOperations.add(operation);
  }
  if (typeof root !== 'string' || root.length === 0) return failed('invalid-context-options', 'Supply an explicit repository root.');
  const materialField = Object.getOwnPropertyDescriptor(options, 'materialCaptures');
  if (!materialField && 'materialCaptures' in options) {
    return failed('invalid-material-captures', 'Material captures cannot be inherited.');
  }
  if (materialField && (!materialField.enumerable || !Object.hasOwn(materialField, 'value'))) {
    return failed('invalid-material-captures', 'Material captures require an own enumerable data field.');
  }
  const materialCaptures = materialField ? materialField.value : [];
  try {
    materialRows(materialCaptures, message => { throw new SubjectQueryContextError('invalid-material-captures', message); }, true,
      capture => { if (operation !== undefined) admitSubjectOperationCapture(operation, capture); }, operation);
  } catch (error) {
    if (!(error instanceof SubjectQueryContextError)) throw error;
    return failed(error.code, error.message);
  }
  if (operation !== undefined) {
    for (const capture of decisionCaptures) admitSubjectOperationCapture(operation, capture);
    for (const pair of assessmentCaptures) {
      admitSubjectOperationCapture(operation, pair.registry);
      admitSubjectOperationCapture(operation, pair.identity);
    }
  }
  let model;
  try {
    const kitRoot = locateKitRoot(root, resources);
    model = operation === undefined ? loadStores(kitRoot, resources)
      : loadAndAdmitSubjectOperationModel(operation, kitRoot);
  }
  catch (error) {
    if (operation !== undefined) rethrowSubjectOperationFailure(operation, error);
    rethrowIfBug(error);
    return failed('query-context-unavailable', error.message);
  }
  if (!model.ok) return failed('invalid-model', 'The captured installation is not structurally healthy.', model.diagnostics);
  if (!model.subjectRegistry) return failed('unavailable-subjects', 'This installation has no captured subject authority.');
  const checked = evaluateSubjectGovernance({ registry: model.subjectRegistry, identity: model.identity,
    identityIndex: model.identityIndex, decisionCaptures, assessmentCaptures, materialCaptures },
    operation === undefined ? {} : { operationBudget: resources.subjectOperationBudget });
  if (operation !== undefined) assertSubjectOperation(operation);
  if (!checked.ok) return { ok: false, diagnostics: checked.diagnostics };
  const context = { model, subjectGovernance: checked.governance };
  if (operation !== undefined) operations.set(context, { operation, model, governance: checked.governance });
  return { ok: true, context, diagnostics: model.diagnostics };
}
