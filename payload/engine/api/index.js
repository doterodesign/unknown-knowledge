/** Versioned, transport-independent engine operations. No caller callbacks or model handles. */
import { isAbsolute } from 'node:path';
import { EngineRefusal } from '../lib/engine-refusal.js';
import { UsageError } from '../lib/usage-error.js';
import { locateKitRoot } from '../lib/kit-root.js';
import { loadStores, storeHealth, normalizeConceptIds } from '../lib/load-stores.js';
import { runPreflight } from '../lib/preflight.js';
import { isCalendarDate } from '../lib/iso-date.js';
import { SubjectError } from '../lib/subjects.js';
import { subjectLookupReport } from '../lib/subject-lookup.js';
import { askPayload, createIndexCache } from '../lib/ask-service.js';
import { UnknownFieldError } from '../lib/aggregate.js';

export const ENGINE_INTERFACE_VERSION = 1;

function closed(value, required, optional = []) {
  if (!value || typeof value !== 'object' || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) return false;
  const keys = Reflect.ownKeys(value);
  return required.every(key => Object.hasOwn(value, key)) && keys.every(key => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return [...required, ...optional].includes(key) && descriptor.enumerable && Object.hasOwn(descriptor, 'value');
  });
}

class InterfaceRefusal extends EngineRefusal {
  constructor(code, message, diagnostics) { super(message); this.code = code; this.diagnostics = diagnostics; }
}
const requireInput = condition => {
  if (!condition) throw new InterfaceRefusal('invalid-interface-input', 'Supply the documented operation input fields.');
};

function selection(value) {
  requireInput(Array.isArray(value) && Object.getPrototypeOf(value) === Array.prototype
    && Reflect.ownKeys(value).length === value.length + 1);
  for (let index = 0; index < value.length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    requireInput(descriptor?.enumerable && Object.hasOwn(descriptor, 'value') && typeof descriptor.value === 'string');
  }
  return normalizeConceptIds(value);
}

function preflight(root, input) {
  requireInput(closed(input, ['concepts', 'leaves', 'today'])
    && (input.today === null || isCalendarDate(input.today)));
  const concepts = selection(input.concepts), leaves = selection(input.leaves);
  const model = loadStores(locateKitRoot(root));
  // The native owner reports degraded store health; do not discard its conduct.
  return runPreflight(model, { repoRoot: root, concepts, leaves, today: input.today, log: false }).payload;
}

function lookup(root, input) {
  requireInput(closed(input, ['text'], ['options']) && typeof input.text === 'string'
    && (!Object.hasOwn(input, 'options') || (closed(input.options, [], ['locale', 'context'])
      && Object.values(input.options).every(value => typeof value === 'string'))));
  const model = loadStores(locateKitRoot(root));
  const health = storeHealth(model);
  if (!health.ok) throw new InterfaceRefusal('invalid-model', 'The captured installation failed validation.', health.errors);
  const registry = model.subjectRegistry;
  if (!registry) throw new InterfaceRefusal('subject-registry-unavailable', 'subjects/registry.yaml is absent.');
  return subjectLookupReport(model, input.text, input.options ?? {});
}

// One index per root for the life of the process; a store change evicts it.
const askIndexes = createIndexCache();

function recordAsk(root, input) {
  requireInput(closed(input, [], ['question', 'mode', 'where', 'countBy', 'under', 'limit', 'top']));
  const mode = input.mode ?? 'search';
  const text = input.question ?? '';
  const where = input.where ?? [];
  const integer = (value, fallback, max) => (value === undefined ? fallback : value);
  requireInput(['search', 'count', 'fields'].includes(mode) && typeof text === 'string'
    && (mode !== 'search' || text.trim()) && (mode !== 'count' || typeof input.countBy === 'string')
    && Array.isArray(where) && where.every((c) => closed(c, ['field', 'value']) && typeof c.field === 'string' && typeof c.value === 'string')
    && (input.under === undefined || typeof input.under === 'string')
    && [[input.limit, 50], [input.top, 100]].every(([v, max]) => v === undefined || (Number.isInteger(v) && v >= 1 && v <= max)));
  try {
    return askPayload(askIndexes.get([root]), {
      mode, text: text.trim(), where, countBy: input.countBy ?? null, under: input.under ?? null,
      limit: integer(input.limit, 8), top: integer(input.top, 10),
    });
  } catch (error) {
    if (error instanceof UnknownFieldError) throw new InterfaceRefusal('unknown-field', error.message);
    throw error;
  }
}

// Discovery comes from real registrations; registration does not establish local authority.
const operations = new Map([
  ['engine.capabilities', { scope: 'interface-metadata', run(root, input) {
    requireInput(closed(input, []));
    return { operations: [...operations].map(([operation, row]) => ({ operation, inputVersion: 1,
      outputVersion: row.outputVersion ?? 1, scope: row.scope })), authority: 'evaluated-on-invocation',
    outputAccounting: 'invoke returns objects; operationLimits.maxOutputBytes is not charged; transports bound serialization separately' };
  } }],
  ['subject.lookup', { scope: 'declared-metadata', run: lookup }],
  ['record.preflight', { scope: 'record-verdicts', run: preflight }],
  ['record.ask', { scope: 'ranked-retrieval', run: recordAsk }],
]);

/** Completion means an owner returned a report. Inspect data for its native outcome. */
export async function invoke(request) {
  let operation = null;
  let outputVersion = null;
  const envelope = (status, diagnostics, data) => ({ interfaceVersion: ENGINE_INTERFACE_VERSION,
    operation, outputVersion, status, diagnostics, ...(data === undefined ? {} : { data }) });
  try {
    if (!closed(request, ['interfaceVersion', 'operation', 'inputVersion', 'root', 'input'])
      || request.interfaceVersion !== ENGINE_INTERFACE_VERSION || request.inputVersion !== 1
      || typeof request.operation !== 'string' || typeof request.root !== 'string' || !isAbsolute(request.root)) {
      throw new InterfaceRefusal('invalid-interface-request', 'Supply the version 1 request and an absolute repository root.');
    }
    operation = request.operation;
    const selected = operations.get(operation);
    if (!selected) throw new InterfaceRefusal('unsupported-operation', 'This engine does not register the requested operation.');
    outputVersion = selected.outputVersion ?? 1;
    return envelope('completed', [], await selected.run(request.root, request.input));
  } catch (error) {
    if (error instanceof EngineRefusal || error instanceof UsageError || error instanceof SubjectError) {
      return envelope('refused', error.diagnostics ?? [{ code: error.code ?? 'engine-refusal', path: '', message: error.message }]);
    }
    if (Number.isInteger(error?.errno) && typeof error.code === 'string') {
      return envelope('failed', [{ code: error.code, path: '', message: error.message }]);
    }
    throw error;
  }
}

/** Transport exit/error mapping, separate from completion of an engine invocation. */
export function interfaceResultSucceeded(result) {
  if (result.status !== 'completed') return false;
  if (result.operation === 'record.preflight') return result.data.ok === true;
  // A search over stores that did not load cleanly is reported, never graded.
  if (result.operation === 'record.ask') return result.data['store-health'].ok === true;
  return true;
}
