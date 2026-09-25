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
import { createSubjectOperation, guardSubjectOperationDocument, assertSubjectOperation,
  SubjectOperationError } from '../lib/subject-operation.js';
import { decodeDecisionCaptures, decodeAssessmentCaptures, decodeMaterialCaptures,
  loadSubjectQueryContext } from '../lib/subject-query-context.js';
import { querySubjects } from '../lib/subject-query.js';
import { validateIntentPlan } from '../lib/intent-plan.js';
import { inspectIntentBindings } from '../lib/intent-bindings.js';
import { validateIntentQueryPlan, executeIntentQueryPlan } from '../lib/intent-query-plan.js';
import { executeIntersectionRoute } from '../lib/subject-routes.js';
import { countSubjectContexts } from '../lib/subject-contexts.js';
import { deriveSubjectTreeArtifacts } from '../lib/subject-views.js';
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

function tree(root, input) {
  requireInput(closed(input, ['budget', 'maxBytes']) && closed(input.budget, ['nodes', 'edges', 'rows']));
  const model = loadStores(locateKitRoot(root));
  const health = storeHealth(model);
  if (!health.ok) throw new InterfaceRefusal('invalid-model', 'The captured installation failed validation.', health.errors);
  if (!model.subjectRegistry) throw new InterfaceRefusal('subject-registry-unavailable', 'subjects/registry.yaml is absent.');
  return deriveSubjectTreeArtifacts(model.subjectRegistry, input);
}

function governedContext(root, input, documents) {
  requireInput(closed(input.evidence, ['decisionCaptures', 'assessmentCaptures', 'materialCaptures']));
  const operation = createSubjectOperation(input.operationLimits);
  for (const key of documents) guardSubjectOperationDocument(operation, input[key], `interface-${key}`);
  const decisionCaptures = decodeDecisionCaptures(input.evidence.decisionCaptures, { operation });
  const assessmentCaptures = decodeAssessmentCaptures(input.evidence.assessmentCaptures, { operation });
  const materialCaptures = decodeMaterialCaptures(input.evidence.materialCaptures, { operation });
  const loaded = loadSubjectQueryContext({ root, decisionCaptures, assessmentCaptures, materialCaptures, operation });
  if (!loaded.ok) throw new InterfaceRefusal('query-context-unavailable', 'Cannot establish the query context.', loaded.diagnostics);
  return { operation, ...loaded };
}

function query(root, input) {
  requireInput(closed(input, ['query', 'collect', 'evidence', 'operationLimits']) && ['counts', 'results'].includes(input.collect));
  const loaded = governedContext(root, input, ['query']);
  const { operation } = loaded;
  let report = querySubjects(loaded.context, input.query, { operation, collect: input.collect });
  if (loaded.diagnostics.length) report = { ...report, contextDiagnostics: loaded.diagnostics };
  assertSubjectOperation(operation);
  return report;
}

function inspectBindings(root, input) {
  requireInput(closed(input, ['plan'], ['lookupRequests']));
  const model = loadStores(locateKitRoot(root));
  if (!model.ok) throw new InterfaceRefusal('invalid-model', 'The captured installation failed validation.', model.diagnostics);
  return { mode: 'inspect-bindings', result: inspectIntentBindings(input.plan, { identityIndex: model.identityIndex,
    subjectDocument: model.subjectRegistry?.document, lookupRequests: input.lookupRequests }), contextDiagnostics: model.diagnostics };
}

function intentQueries(root, input, execute) {
  const documents = ['plan', 'admission', ...(execute ? ['executionAdmission'] : [])];
  requireInput(closed(input, [...documents, 'evidence', 'operationLimits']));
  const loaded = governedContext(root, input, documents);
  const { operation } = loaded;
  const options = { admission: input.admission, operation,
    ...(execute ? { executionAdmission: input.executionAdmission } : {}) };
  // Execution owns its validation phase. Calling validation here too would duplicate work.
  const result = execute ? executeIntentQueryPlan(input.plan, loaded.context, options)
    : validateIntentQueryPlan(input.plan, loaded.context, options);
  assertSubjectOperation(operation);
  return { mode: execute ? 'execute-queries' : 'validate-queries', result, contextDiagnostics: loaded.diagnostics };
}

function subjectView(root, input, mode) {
  requireInput(closed(input, ['request', 'evidence', 'operationLimits']));
  const request = input.request;
  const route = mode === 'route';
  const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  requireInput((route ? closed(request, ['version', 'route', 'query'], ['collect'])
    : closed(request, ['version', 'query', 'contextBudgets'])) && request.version === 1
    && object(request.query) && (route ? object(request.route) && !Object.hasOwn(request.query, 'where')
      && (!Object.hasOwn(request, 'collect') || ['results', 'counts'].includes(request.collect))
      : object(request.contextBudgets)));
  const loaded = governedContext(root, input, ['request']);
  const { operation } = loaded;
  const result = route
    ? executeIntersectionRoute(loaded.context, request.route, request.query, { collect: request.collect ?? 'results', operation })
    : countSubjectContexts(loaded.context, request.query, { budgets: request.contextBudgets, operation });
  assertSubjectOperation(operation);
  return { mode, result, contextDiagnostics: loaded.diagnostics };
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
  ['subject.tree', { scope: 'declared-metadata', run: tree }],
  ['subject.query', { outputVersion: 2, scope: 'governed-retrieval', run: query }],
  ['subject.route', { outputVersion: 2, scope: 'governed-retrieval', run: (root, input) => subjectView(root, input, 'route') }],
  ['subject.contexts', { outputVersion: 2, scope: 'governed-retrieval', run: (root, input) => subjectView(root, input, 'contexts') }],
  ['record.preflight', { scope: 'record-verdicts', run: preflight }],
  ['record.ask', { scope: 'ranked-retrieval', run: recordAsk }],
  ['intent.validate', { scope: 'declared-inventory', run(root, input) {
    requireInput(closed(input, ['plan'])); return validateIntentPlan(input.plan);
  } }],
  ['intent.inspectBindings', { scope: 'declared-metadata', run: inspectBindings }],
  ['intent.validateQueries', { outputVersion: 2, scope: 'governed-retrieval', run: (root, input) => intentQueries(root, input, false) }],
  ['intent.executeQueries', { outputVersion: 2, scope: 'governed-retrieval', run: (root, input) => intentQueries(root, input, true) }],
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
    if (error instanceof EngineRefusal || error instanceof UsageError || error instanceof SubjectError
      || error instanceof SubjectOperationError) {
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
  if (result.operation === 'subject.tree') return result.data.status === 'complete';
  if (result.operation === 'subject.query') return result.data.status === 'complete';
  if (['subject.route', 'subject.contexts'].includes(result.operation)) return result.data.result.status === 'complete';
  if (result.operation === 'intent.validate') return result.data.valid;
  if (result.operation === 'intent.inspectBindings') return result.data.result.planValidation.valid;
  if (result.operation === 'intent.validateQueries') return result.data.result.valid;
  if (result.operation === 'intent.executeQueries') return result.data.result.status === 'complete';
  return true;
}
