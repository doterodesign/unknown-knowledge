/** Subject-query domain primitives and opt-in captured-operation composition. */
import { isDeepStrictEqual } from 'node:util';
import { assertSubjectOperation, assertSubjectOperationContext, getSubjectOperationResources,
  guardSubjectOperationDocument, admitSubjectOperationCorpus } from './subject-operation.js';
import { UsageError } from './usage-error.js';
import { readSubjectQueryJson, decodeDecisionCaptures, decodeAssessmentCaptures, decodeMaterialCaptures,
  loadSubjectQueryContext, SubjectQueryContextError } from './subject-query-context.js';
import { IdentityOperationError, iterateCurrentRecords, iterateProposalRecords, parseCanonicalId } from './record-identity.js';
import { readAssignments } from './subject-assignments.js';
import { validateAssignments } from './assignment-validation.js';
import { SubjectError, subjectDescendants, SUBJECT_SCHEMA_VERSION, SUBJECT_NORMALIZER_VERSION } from './subjects.js';
import { leafStage, recordLifecycleState } from './record-lifecycle.js';
import { getGovernedSubjectRegistry, getSubjectGovernanceDescriptor, subjectEligibility,
  validateSubjectGovernanceCapture } from './subject-governance.js';
import { canonicalSha256, CapturedInputError } from './canonical-json.js';
import { fingerprintMetadata, fingerprintQueryInputs } from './captured-input.js';
import { readLegacyJurisdictions, matchesLegacyJurisdictions } from './legacy-jurisdictions.js';
import { indexRegistryValues } from './registry-values.js';

export const SUBJECT_QUERY_OUTPUT_VERSION = 2;

/** A typed domain refusal, distinct from a successful zero-match result. */
export class SubjectQueryError extends UsageError {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

/**
 * Compose recorded-membership truth. Unknown is metadata uncertainty, never
 * evidence that a subject is absent. The complete query envelope is validated
 * separately before these primitives are used for record evaluation.
 * @param {'not'|'and'|'or'} operator
 * @param {Array<'T'|'F'|'U'>} operands
 * @returns {'T'|'F'|'U'}
 */
export function composeSubjectTruth(operator, operands) {
  if (!['not', 'and', 'or'].includes(operator)
    || !Array.isArray(operands) || operands.length === 0
    || (operator === 'not' && operands.length !== 1)) {
    throw new SubjectQueryError('invalid-truth-expression', 'Expected NOT with one operand or nonempty AND/OR.');
  }
  // Validate every value before composition: a decisive T/F cannot hide an
  // unsupported value in another branch. Iteration also rejects sparse arrays.
  for (const value of operands) {
    if (!['T', 'F', 'U'].includes(value)) {
      throw new SubjectQueryError('invalid-truth-expression', 'Truth operands must be T, F or U.');
    }
  }
  if (operator === 'not') return { T: 'F', F: 'T', U: 'U' }[operands[0]];
  if (operator === 'and') {
    return operands.includes('F') ? 'F' : operands.includes('U') ? 'U' : 'T';
  }
  return operands.includes('T') ? 'T' : operands.includes('U') ? 'U' : 'F';
}

const PREDICATE_FIELDS = Object.freeze({
  all: ['op'], none: ['op'], 'subjects-present': ['op'],
  assigned: ['op', 'subject'], and: ['op', 'args'], or: ['op', 'args'], not: ['op', 'arg'],
});
const plainObject = (value) => value !== null && typeof value === 'object'
  && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
const pointerPart = (key) => key.replaceAll('~', '~0').replaceAll('/', '~1');

/**
 * Validate the whole predicate before evaluation, including dead branches.
 * Iterative traversal bounds deep/wide input without relying on the JS stack.
 * This checks syntax only: returned subject requirements still need the real
 * registry's existence/lifecycle checks before any query is executable.
 * @param {unknown} where
 * @param {{maxAstNodes:number, maxAstDepth:number}} budgets explicit operation limits
 * @returns {object} syntax-only result, diagnostics or required subject IDs
 */
export function validateSubjectPredicate(where, budgets) {
  return validatePredicate(where, budgets);
}

function validatePredicate(where, budgets, visit) {
  const used = { astNodes: 0, astDepth: 0 };
  const refuse = (code, path, message) => ({
    ok: false, validationScope: 'syntax-only', diagnostics: [{ code, path, message }], used,
  });
  for (const name of ['maxAstNodes', 'maxAstDepth']) {
    if (!Number.isSafeInteger(budgets?.[name]) || budgets[name] < 1) {
      return refuse('invalid-query-budget', `/budgets/${name}`, 'Expected a positive safe integer limit.');
    }
  }
  const subjects = new Set();
  const active = new Set();
  const pending = [{ node: where, path: '/where', depth: 1 }];
  let scheduled = 1;
  while (pending.length) {
    const { node, path, depth, leaving } = pending.pop();
    if (leaving) {
      active.delete(node);
      continue;
    }
    if (depth > budgets.maxAstDepth) {
      return refuse('ast-budget-exceeded', path, 'Predicate exceeds maxAstDepth.');
    }
    used.astNodes += 1;
    used.astDepth = Math.max(used.astDepth, depth);
    if (!plainObject(node) || !Object.hasOwn(node, 'op')) {
      return refuse('invalid-predicate', path, 'Expected a predicate object with an op.');
    }
    if (active.has(node)) return refuse('invalid-predicate', path, 'Predicate contains a cycle.');
    if (typeof node.op !== 'string' || !Object.hasOwn(PREDICATE_FIELDS, node.op)) {
      return refuse('unsupported-operator', `${path}/op`, 'Predicate operator is not supported.');
    }
    const fields = PREDICATE_FIELDS[node.op];
    for (const key of Object.keys(node)) {
      if (!fields.includes(key)) {
        return refuse('invalid-predicate', `${path}/${pointerPart(key)}`, 'Unexpected predicate field.');
      }
    }
    for (const key of fields) {
      if (!Object.hasOwn(node, key)) {
        return refuse('invalid-predicate', `${path}/${key}`, 'Required predicate field is missing.');
      }
    }
    if (node.op === 'assigned') {
      if (!parseCanonicalId('subject', node.subject).ok) {
        return refuse('invalid-subject', `${path}/subject`, 'Expected an exact canonical subject ID.');
      }
      subjects.add(node.subject);
    }
    const compound = node.op === 'and' || node.op === 'or';
    if (compound && (!Array.isArray(node.args) || node.args.length === 0)) {
      return refuse('invalid-predicate', `${path}/args`, 'AND/OR require a nonempty operand array.');
    }
    const childCount = compound ? node.args.length : node.op === 'not' ? 1 : 0;
    if (visit) visit(node, path);
    if (scheduled + childCount > budgets.maxAstNodes) {
      return refuse('ast-budget-exceeded', path, 'Predicate exceeds maxAstNodes.');
    }
    scheduled += childCount;
    if (childCount) {
      active.add(node);
      pending.push({ node, leaving: true });
      if (compound) {
        for (let i = childCount - 1; i >= 0; i -= 1) {
          pending.push({ node: node.args[i], path: `${path}/args/${i}`, depth: depth + 1 });
        }
      } else pending.push({ node: node.arg, path: `${path}/arg`, depth: depth + 1 });
    }
  }
  return { ok: true, validationScope: 'syntax-only', requirements: { subjects: [...subjects].sort() }, used };
}

/**
 * Inspect one record against a declared subject forest. This internal primitive
 * does not certify lifecycle/approval, store coverage, or evidence. The complete
 * query layer must compose the real registry lifecycle gate before execution.
 * Missing recorded metadata and unfinished computation stay distinct in output.
 * @param {object} where predicate AST
 * @param {object} entry original loader entry (P3 reads assignment state)
 * @param {object} registry successfully indexed captured P2 registry
 * @param {object} options direct/descendant expansion and explicit budgets
 * @returns {object} structural-only truth, witnesses and independent completion
 */
export function evaluateRecordedSubjectPredicate(where, entry, registry, options = {}) {
  const used = { predicateSteps: 0, hierarchyNodes: 0, hierarchyEdges: 0 };
  const refused = (diagnostics) => ({ status: 'refused', validationScope: 'structural-only', diagnostics, used });
  const fail = (code, path, message) => refused([{ code, path, message }]);
  if (!plainObject(options) || Object.keys(options).some((key) => !['expansion', 'budgets'].includes(key))) {
    return fail('invalid-query-options', '', 'Structural inspection accepts expansion and budgets only.');
  }
  const { expansion = 'direct', budgets } = options;
  if (!['direct', 'self-and-descendants'].includes(expansion)) {
    return fail('unsupported-expansion', '/expansion', 'Unsupported subject expansion mode.');
  }
  const syntax = validateSubjectPredicate(where, budgets);
  if (!syntax.ok) return refused(syntax.diagnostics);
  for (const name of ['maxPredicateSteps', 'maxHierarchyNodes', 'maxHierarchyEdges']) {
    if (!Number.isSafeInteger(budgets[name]) || budgets[name] < 0) {
      return fail('invalid-query-budget', `/budgets/${name}`, 'Expected a nonnegative safe integer limit.');
    }
  }
  if (!registry) return fail('subjects-unavailable', '/where', 'Subject inspection requires a captured registry.');
  if (registry.schemaVersion !== SUBJECT_SCHEMA_VERSION || registry.normalizerVersion !== SUBJECT_NORMALIZER_VERSION
    || !['subjects', 'parents', 'children'].every((key) => registry[key] instanceof Map)) {
    return fail('invalid-subject-registry', '/where', 'Use a successfully indexed subject registry.');
  }
  const assignments = readAssignments(entry);
  if (assignments.state === 'invalid') return refused(assignments.diagnostics);
  // Existence is checked for the whole predicate and authored list before any
  // truth is computed. Lifecycle eligibility is intentionally not inferred here.
  const required = [...new Set([...syntax.requirements.subjects,
    ...(assignments.state === 'known' ? assignments.ids : [])])].sort();
  for (const subject of required) {
    if (!registry.subjects.has(subject)) {
      return fail('unknown-subject', '/where', `Subject ${subject} is absent from the captured registry.`);
    }
  }
  const expansions = new Map();
  const diagnostics = [];
  let complete = true;
  for (const subject of syntax.requirements.subjects) {
    let result = { status: 'complete', ids: [subject], used: { nodes: 0, edges: 0 } };
    if (expansion === 'self-and-descendants') {
      try {
        result = subjectDescendants(registry, subject, { includeSelf: true, budget: {
          nodes: budgets.maxHierarchyNodes - used.hierarchyNodes,
          edges: budgets.maxHierarchyEdges - used.hierarchyEdges,
        } });
      } catch (error) {
        if (!(error instanceof SubjectError)) throw error;
        return fail(error.code, '/where', error.message);
      }
    }
    used.hierarchyNodes += result.used.nodes;
    used.hierarchyEdges += result.used.edges;
    expansions.set(subject, { ...result, ids: new Set(result.ids) });
    if (result.status !== 'complete') {
      complete = false;
      diagnostics.push({ code: 'incomplete-hierarchy', subject, reason: result.reason });
    }
  }

  const evaluated = evaluatePreparedPredicate(where, assignments, expansions, expansion, budgets.maxPredicateSteps);
  return { ...evaluated, status: complete && evaluated.status === 'complete' ? 'complete' : 'incomplete',
    validationScope: 'structural-only', used: { ...used, predicateSteps: evaluated.used.predicateSteps }, diagnostics };
}

function evaluatePreparedPredicate(where, assignments, expansions, expansion, maxPredicateSteps, effectiveAssignments) {
  const used = { predicateSteps: 0 };
  let complete = true;
  const witness = [];
  const unknowns = [];
  const root = {};
  const pending = [{ node: where, path: '/where', slot: root }];
  const unknown = (slot, path, reason) => {
    slot.truth = 'U';
    slot.reason = reason;
    unknowns.push({ path, reason });
  };
  while (pending.length) {
    const { node, path, slot, children } = pending.pop();
    if (children) {
      slot.truth = composeSubjectTruth(node.op, children.map((child) => child.truth));
      continue;
    }
    Object.assign(slot, { path, op: node.op });
    witness.push(slot);
    if (used.predicateSteps === maxPredicateSteps) {
      complete = false;
      unknown(slot, path, 'predicate-budget');
      continue;
    }
    used.predicateSteps += 1;
    if (node.op === 'all' || node.op === 'none') {
      slot.truth = node.op === 'all' ? 'T' : 'F';
    } else if (node.op === 'subjects-present') {
      slot.truth = assignments.state === 'known' ? 'T' : 'F';
      slot.assignmentState = assignments.state;
    } else if (node.op === 'assigned') {
      Object.assign(slot, { subject: node.subject, expansion, matchedSubjects: [], assignmentState: assignments.state });
      if (assignments.state === 'unknown') {
        unknown(slot, path, 'missing-assignments');
        continue;
      }
      const expanded = expansions.get(node.subject);
      if (expanded.resolvedSubject) Object.assign(slot, { resolvedSubject: expanded.resolvedSubject,
        redirects: expanded.redirects, expansionComplete: expanded.status === 'complete' });
      slot.matchedSubjects = effectiveAssignments
        ? effectiveAssignments.filter(({ outcome }) => expanded.ids.has(outcome.resolution.id)).map(({ originalId }) => originalId).sort()
        : assignments.ids.filter((id) => expanded.ids.has(id)).sort();
      if (slot.matchedSubjects.length) slot.truth = 'T';
      else if (expanded.status === 'complete' || assignments.ids.length === 0) slot.truth = 'F';
      else unknown(slot, path, 'incomplete-hierarchy');
    } else {
      const operands = node.op === 'not' ? [node.arg] : node.args;
      const slots = operands.map(() => ({}));
      pending.push({ node, path, slot, children: slots });
      for (let i = operands.length - 1; i >= 0; i -= 1) {
        pending.push({ node: operands[i], path: node.op === 'not' ? `${path}/arg` : `${path}/args/${i}`, slot: slots[i] });
      }
    }
  }
  return { status: complete ? 'complete' : 'incomplete', truth: root.truth, witness, unknowns, used };
}

const STORE_KINDS = Object.freeze({ knowledge: 'knowledge', ontology: 'ontology', decisions: 'decision' });
function currentRecord(row) {
  const { state } = recordLifecycleState(row);
  if (state === 'unknown') {
    throw new SubjectQueryError('unsupported-current-lifecycle',
      `Current view has no lifecycle rule for ${row.ref.kind} ${row.ref.id}.`);
  }
  return state === 'effective';
}

/**
 * Select actual captured identity universes; no lexical prefilter or preflight.
 * Current is explicitly lifecycle-only. All requires proposal coverage instead
 * of assuming that a missing authoring collection means zero unpublished work.
 * Original kind-specific entries stay intact for assignment/evidence gates.
 * @param {object} model real structurally healthy captured current-format model
 * @param {{stores:string[], view?:'all'|'current'}} options
 * @returns {{records:object[], proposals:object[], view:string, coverage:object[]}}
 */
export function selectSubjectQueryRecords(model, options) {
  if (!plainObject(options) || Object.keys(options).some((key) => !['stores', 'view'].includes(key))) {
    throw new SubjectQueryError('invalid-store-selection', 'Selection requires stores and an optional view.');
  }
  const { stores, view = 'all' } = options;
  if (!Array.isArray(stores) || stores.length === 0 || new Set(stores).size !== stores.length
    || Array.from(stores).some((store) => typeof store !== 'string' || !Object.hasOwn(STORE_KINDS, store))) {
    throw new SubjectQueryError('invalid-store-selection', 'Select nonempty unique known stores.');
  }
  if (!['all', 'current'].includes(view)) throw new SubjectQueryError('unsupported-view', 'Supported views are all and current.');
  const selectedStores = [...stores].sort();
  const kinds = selectedStores.map((store) => STORE_KINDS[store]);
  const captured = iterateCurrentRecords(model, { kinds });
  const proposals = view === 'all' ? iterateProposalRecords(model, { kinds }) : [];
  const records = view === 'current' ? captured.filter(currentRecord) : captured;
  const coverage = selectedStores.map((store) => ({
    store,
    basis: view === 'current' ? 'lifecycle-only' : 'all-valid-lifecycle',
    canonicalAvailable: captured.filter(({ ref }) => ref.kind === STORE_KINDS[store]).length,
    canonicalSelected: records.filter(({ ref }) => ref.kind === STORE_KINDS[store]).length,
    proposalScope: view === 'current' ? 'excluded' : 'included',
    proposalsSelected: proposals.filter(({ proposalRef }) => proposalRef.kind === STORE_KINDS[store]).length,
  }));
  return { records, proposals, view, coverage };
}

const QUERY_FIELDS = ['version', 'stores', 'view', 'where', 'expansion', 'subjectPolicy', 'ranking',
  'possibleMatches', 'budgets', 'applicability'];
const QUERY_LIMITS = ['maxAstNodes', 'maxAstDepth', 'maxHierarchyNodes', 'maxHierarchyEdges',
  'maxRedirects', 'maxRecords', 'maxPredicateSteps', 'maxResultsPerStore', 'maxExplanationNodes'];

/** Prepare once per invocation; the private plan is never accepted as caller proof. */
function prepareSubjectQuery(authored, context, operation, initialUnexposed = false) {
  assertSubjectOperationContext(operation, context);
  const operationBudget = operation === undefined ? undefined : getSubjectOperationResources(operation).subjectOperationBudget;
  if (operation !== undefined) {
    guardSubjectOperationDocument(operation, authored, 'query-grammar');
    if (!initialUnexposed) admitSubjectOperationCorpus(operation, context.model);
  }
  const reject = (code, path, message) => ({ validation: { ok: false, diagnostics: [{ code, path, message }] } });
  if (!plainObject(authored)) return reject('invalid-query', '', 'Expected a query object.');
  if (Object.hasOwn(authored, 'cursor')) return reject('unsupported-cursor', '/cursor', 'Cross-run cursors are not supported.');
  if (Object.keys(authored).some((key) => !QUERY_FIELDS.includes(key))) {
    return reject('invalid-query', '', 'Unexpected query field.');
  }
  if (authored.version !== 1) return reject('unsupported-query-version', '/version', 'Query version must be 1.');
  const query = { view: 'all', expansion: 'direct', subjectPolicy: 'current',
    ranking: { profile: 'id-v1' }, possibleMatches: false, ...authored };
  if (!['direct', 'self-and-descendants'].includes(query.expansion)) {
    return reject('unsupported-expansion', '/expansion', 'Unsupported subject expansion.');
  }
  if (!['current', 'historical', 'equivalent'].includes(query.subjectPolicy)) {
    return reject('unsupported-subject-policy', '/subjectPolicy', 'Unsupported subject lifecycle policy.');
  }
  if (!plainObject(query.ranking) || Object.keys(query.ranking).length !== 1 || query.ranking.profile !== 'id-v1') {
    return reject('unsupported-ranking', '/ranking', 'Only deterministic identity rank id-v1 is supported.');
  }
  if (typeof query.possibleMatches !== 'boolean') return reject('invalid-query', '/possibleMatches', 'Expected a boolean.');
  if (Object.hasOwn(query, 'applicability')) {
    const scope = query.applicability;
    if (!plainObject(scope) || Object.keys(scope).some((key) => !['profile', 'mode', 'jurisdictions'].includes(key))
      || scope.profile !== 'legacy-jurisdictions-v1' || scope.mode !== 'any'
      || !Array.isArray(query.stores) || query.stores.length !== 1 || query.stores[0] !== 'knowledge'
      || !Array.isArray(scope.jurisdictions) || scope.jurisdictions.length === 0
      || new Set(scope.jurisdictions).size !== scope.jurisdictions.length
      || Array.from(scope.jurisdictions).some((value) => typeof value !== 'string' || value.length === 0)) {
      return reject('unsupported-applicability', '/applicability',
        'Use Knowledge-only legacy-jurisdictions-v1 with any overlap and nonempty unique exact jurisdictions.');
    }
  }
  if (!plainObject(query.budgets) || query.budgets.version !== 1
    || Object.keys(query.budgets).some((key) => !['version', ...QUERY_LIMITS].includes(key))) {
    return reject('invalid-query-budget', '/budgets', 'Supply explicit version 1 query limits.');
  }
  for (const name of QUERY_LIMITS) {
    const minimum = ['maxAstNodes', 'maxAstDepth'].includes(name) ? 1 : 0;
    if (!Number.isSafeInteger(query.budgets[name]) || query.budgets[name] < minimum) {
      return reject('invalid-query-budget', `/budgets/${name}`, `Expected a safe integer at least ${minimum}.`);
    }
  }
  const nodes = [];
  const syntax = validatePredicate(query.where, query.budgets, (node, path) => nodes.push({ node, path }));
  if (!syntax.ok) return { validation: syntax };
  const constraintPaths = nodes.map(({ node, path }) => ({ path, kind: 'predicate', origin: 'explicit', op: node.op }));
  for (const name of ['stores', 'view', 'expansion', 'subjectPolicy']) {
    constraintPaths.push({ path: `/${name}`, kind: 'selector', origin: Object.hasOwn(authored, name) ? 'explicit' : 'default' });
  }
  if (query.applicability) constraintPaths.push({ path: '/applicability', kind: 'selector', origin: 'explicit' });
  let errorPath = '';
  try {
    if (!plainObject(context)) return reject('invalid-query-context', '', 'Expected captured model and governance context.');
    errorPath = '/stores';
    const selection = selectSubjectQueryRecords(context.model, { stores: query.stores, view: query.view });
    let scopeCapture = null;
    if (query.applicability) {
      const captured = context.model.registries instanceof Map ? context.model.registries.get('knowledge/jurisdictions') : null;
      if (!captured?.document || typeof captured.file !== 'string') {
        return reject('unavailable-jurisdiction-registry', '/applicability', 'Scoped queries require the captured Knowledge jurisdiction document.');
      }
      if (operation !== undefined) guardSubjectOperationDocument(operation, captured.document, 'query-jurisdictions');
      const indexed = indexRegistryValues(captured.document);
      if (!indexed.ok || captured.document.store !== 'knowledge' || captured.document.registry !== 'jurisdictions') {
        return reject('invalid-jurisdiction-registry', '/applicability', 'The captured Knowledge jurisdiction document is invalid.');
      }
      for (const [index, value] of query.applicability.jurisdictions.entries()) {
        const code = indexed.suppressed.has(value) ? 'suppressed-jurisdiction'
          : !indexed.minted.has(value) ? 'unknown-jurisdiction' : null;
        if (code) return reject(code, `/applicability/jurisdictions/${index}`, 'Requested jurisdiction is not currently minted in the captured registry.');
      }
      scopeCapture = { file: captured.file, document: captured.document };
    }
    errorPath = '';
    const binding = validateSubjectGovernanceCapture(context.subjectGovernance, { model: context.model }, { operationBudget });
    if (!binding.ok) return { validation: { ok: false, diagnostics: binding.diagnostics } };
    const registry = getGovernedSubjectRegistry(context.subjectGovernance, { operationBudget });
    const descriptor = getSubjectGovernanceDescriptor(context.subjectGovernance, { operationBudget });
    const namespace = context.model.identity.namespace;
    const subjectResolutions = [];
    const used = { ...syntax.used, redirects: 0 };
    for (const subject of syntax.requirements.subjects) {
      errorPath = `${nodes.find(({ node }) => node.op === 'assigned' && node.subject === subject).path}/subject`;
      const outcome = subjectEligibility(context.subjectGovernance, subject, { purpose: 'query', policy: query.subjectPolicy,
        budget: { redirects: query.budgets.maxRedirects - used.redirects }, ...(operationBudget ? { operationBudget } : {}) });
      used.redirects += outcome.resolution.redirects.length;
      if (outcome.eligible !== true) {
        return reject(outcome.code ?? 'ineligible-subject', errorPath, 'Requested subject lacks eligible verified meaning for this policy.');
      }
      subjectResolutions.push({ subject, outcome });
    }
    errorPath = '';
    const capture = fingerprintQueryInputs({ namespace, records: selection.records, proposals: selection.proposals,
      registry: registry.document });
    const metadata = { ...capture, inputs: { ...capture.inputs, governance: canonicalSha256(descriptor),
      ...(scopeCapture ? { jurisdictions: canonicalSha256(scopeCapture) } : {}) },
      versions: { query: 1, evaluator: 2, subjectSchema: registry.schemaVersion, subjectNormalizer: registry.normalizerVersion },
      revisions: { registry: registry.revision, hierarchy: registry.hierarchyRevision }, options: query };
    const input = { ...metadata, fingerprint: fingerprintMetadata(metadata) };
    const validation = { ok: true, query, requirements: { ...syntax.requirements, constraintPaths, subjectResolutions },
      input, used, coverage: selection.coverage };
    return { validation, selection, registry, nodes };
  } catch (error) {
    if (!(error instanceof IdentityOperationError || error instanceof SubjectError
      || error instanceof SubjectQueryError || error instanceof CapturedInputError)) throw error;
    return reject(error.code, errorPath, error.message);
  }
}

/**
 * Validate request support and captured query-subject governance, not record
 * eligibility, evaluation completion, evidence adequacy or intent fidelity.
 * No returned object can substitute for a real governance handle on execution.
 */
export function validateSubjectQuery(query, context, { operation } = {}) {
  try { return prepareSubjectQuery(query, context, operation).validation; }
  finally { if (operation !== undefined) assertSubjectOperation(operation); }
}

/** Capture only primitive options before the private model can exist. */
function captureQueryFileOptions(options) {
  const invalid = () => { throw new SubjectQueryContextError('invalid-query-file-options',
    'Supply an explicit root and queryFile, optional capture file paths, and results or counts collection.'); };
  if (!plainObject(options)) invalid();
  const captured = Object.create(null);
  const paths = ['root', 'queryFile', 'decisionCapturesFile', 'assessmentCapturesFile', 'materialCapturesFile'];
  const fields = [...paths, 'collect'];
  for (const key of Reflect.ownKeys(options)) {
    const property = Object.getOwnPropertyDescriptor(options, key);
    if (!fields.includes(key) || !property.enumerable || !Object.hasOwn(property, 'value')) invalid();
    captured[key] = property.value;
  }
  for (const key of paths) {
    if ((key === 'root' || key === 'queryFile' || Object.hasOwn(captured, key))
      && (typeof captured[key] !== 'string' || captured[key].length === 0)) invalid();
  }
  if (Object.hasOwn(captured, 'collect') && !['results', 'counts'].includes(captured.collect)) invalid();
  return { ...captured, collect: captured.collect ?? 'results' };
}

/**
 * Fixed synchronous file-to-query composition, with one authentic operation.
 * Inputs become private before loading; no caller model, executor or skip flag.
 * The initial corpus remains unchanged/unexposed through this exact sequence.
 * Future payload mutation, callback, await or exposure requires full re-admission.
 * Terminal return transfers result subgraphs (including citations), not a deep
 * clone. No context/model/proof or mutable alias survives for later internal work.
 */
export function querySubjectFiles(operation, options) {
  assertSubjectOperation(operation);
  try {
    const files = captureQueryFileOptions(options);
    const query = readSubjectQueryJson(files.queryFile, 'query', operation);
    const decisionCaptures = files.decisionCapturesFile
      ? decodeDecisionCaptures(readSubjectQueryJson(files.decisionCapturesFile, 'decision-captures', operation), { operation }) : [];
    const assessmentCaptures = files.assessmentCapturesFile
      ? decodeAssessmentCaptures(readSubjectQueryJson(files.assessmentCapturesFile, 'assessment-captures', operation), { operation }) : [];
    const materialCaptures = files.materialCapturesFile
      ? decodeMaterialCaptures(readSubjectQueryJson(files.materialCapturesFile, 'material-captures', operation), { operation }) : [];
    const loaded = loadSubjectQueryContext({ root: files.root, decisionCaptures, assessmentCaptures, materialCaptures, operation });
    if (!loaded.ok) return { outputVersion: SUBJECT_QUERY_OUTPUT_VERSION,
      status: 'refused', groups: null, counts: null, diagnostics: loaded.diagnostics };
    // Only this lexical fixed-loader call can omit the redundant second corpus
    // pass. All binding, fingerprints, P3 checks and other query work still run.
    const result = runSubjectQuery(loaded.context, query, { collect: files.collect, operation }, true);
    return loaded.diagnostics.length ? { ...result, contextDiagnostics: loaded.diagnostics } : result;
  } finally { assertSubjectOperation(operation); }
}

/** Execute over one captured model; result and count modes share one scan. */
export function querySubjects(context, authored, options = {}) {
  try { return runSubjectQuery(context, authored, options); }
  finally { if (options?.operation !== undefined) assertSubjectOperation(options.operation); }
}

function runSubjectQuery(context, authored, options, initialUnexposed = false) {
  const refused = (diagnostics, extra = {}) => ({ outputVersion: SUBJECT_QUERY_OUTPUT_VERSION,
    status: 'refused', groups: null, counts: null, diagnostics, ...extra });
  if (!plainObject(options) || Object.keys(options).some((key) => !['collect', 'operation'].includes(key))
    || !['results', 'counts'].includes(options.collect ?? 'results')) {
    return refused([{ code: 'invalid-query-options', path: '', message: 'Choose results or counts collection.' }]);
  }
  const collect = options.collect ?? 'results';
  const operation = options.operation;
  const operationBudget = operation === undefined ? undefined : getSubjectOperationResources(operation).subjectOperationBudget;
  const prepared = prepareSubjectQuery(authored, context, operation, initialUnexposed);
  const { validation, selection, registry } = prepared;
  if (!validation.ok) {
    const bounded = validation.diagnostics.every(({ code }) => code === 'redirect-budget');
    return { ...refused(validation.diagnostics), ...(bounded ? { status: 'incomplete',
      coverage: { evaluationComplete: false, rankComplete: false, reason: 'query-preparation-budget' } } : {}) };
  }
  const { query, input } = validation;
  const limits = query.budgets;
  const used = { ...validation.used, hierarchyNodes: 0, hierarchyEdges: 0,
    recordsStarted: 0, recordsCompleted: 0, predicateSteps: 0, explanationNodes: 0 };
  const resources = { limits, used };
  const diagnostics = [];
  const expansions = new Map();
  const resolvedExpansions = new Map();
  let hierarchyComplete = true;
  for (const { subject, outcome } of validation.requirements.subjectResolutions) {
    const resolvedSubject = outcome.resolution.id;
    let expanded = resolvedExpansions.get(resolvedSubject);
    if (!expanded) {
      expanded = { status: 'complete', ids: [resolvedSubject], used: { nodes: 0, edges: 0 } };
      if (query.expansion === 'self-and-descendants') {
        expanded = subjectDescendants(registry, resolvedSubject, { includeSelf: true, budget: {
          nodes: limits.maxHierarchyNodes - used.hierarchyNodes,
          edges: limits.maxHierarchyEdges - used.hierarchyEdges,
        } });
      }
      used.hierarchyNodes += expanded.used.nodes;
      used.hierarchyEdges += expanded.used.edges;
      resolvedExpansions.set(resolvedSubject, expanded);
    }
    expansions.set(subject, { ...expanded, ids: new Set(expanded.ids), resolvedSubject, redirects: outcome.resolution.redirects });
    if (expanded.status !== 'complete') {
      hierarchyComplete = false;
      diagnostics.push({ code: 'incomplete-hierarchy', subject, reason: expanded.reason });
    }
  }
  const rows = [
    ...selection.records.map((row) => ({ row, identityType: 'record', identity: row.ref })),
    ...selection.proposals.map((row) => ({ row, identityType: 'proposal', identity: row.proposalRef })),
  ].sort((a, b) => compareIdentityRows(a, b));
  const groups = collect === 'results' ? {} : null;
  const candidates = {};
  const counts = {};
  const stores = selection.coverage.map((coverage) => ({ ...coverage, status: 'loaded' }));
  for (const { store, canonicalSelected, proposalsSelected } of stores) {
    if (groups) {
      groups[store] = { strict: [], possible: [] };
      candidates[store] = { strict: [], possible: [] };
    }
    counts[store] = { strict: 0, possible: 0, excluded: 0, evaluated: 0,
      unevaluated: canonicalSelected + proposalsSelected, basis: 'exact' };
    if (query.applicability) counts[store].scopeExcluded = 0;
  }
  let assignmentsValidated = 0;
  let predicateComplete = true;
  let pageTruncated = false;
  let explanationsComplete = true;
  let assignmentEvidence;
  let predicateUnknownCount = 0;
  for (const item of rows) {
    if (used.recordsStarted === limits.maxRecords) break;
    used.recordsStarted += 1;
    const checked = validateAssignments(item.row, context.subjectGovernance, {
      purpose: 'query', policy: query.subjectPolicy, budget: { redirects: limits.maxRedirects - used.redirects },
      ...(operationBudget ? { operationBudget } : {}),
    });
    used.redirects += checked.used.redirects;
    if (!checked.ok) {
      if (checked.diagnostics.every(({ code }) => code === 'redirect-budget')) {
        diagnostics.push(...checked.diagnostics);
        break;
      }
      return refused(checked.diagnostics, { query, input, resources,
        coverage: { evaluationComplete: false, rankComplete: false, stores, invalidRecordEncountered: true } });
    }
    assignmentsValidated += 1;
    const store = item.identity.kind === 'decision' ? 'decisions' : item.identity.kind;
    const tally = counts[store];
    const applicability = query.applicability ? evaluateLegacyScope(item.row.entry.record, query.applicability) : null;
    if (applicability?.eligible === false) {
      tally.scopeExcluded += 1;
      tally.evaluated += 1;
      tally.unevaluated -= 1;
      used.recordsCompleted += 1;
      continue;
    }
    const result = evaluatePreparedPredicate(query.where, checked.assignments, expansions, query.expansion,
      limits.maxPredicateSteps - used.predicateSteps, checked.subjects);
    used.predicateSteps += result.used.predicateSteps;
    if (result.status === 'complete') used.recordsCompleted += 1;
    else predicateComplete = false;
    const category = { T: 'strict', F: 'excluded', U: 'possible' }[result.truth];
    tally[category] += 1;
    tally.evaluated += 1;
    tally.unevaluated -= 1;
    if (result.unknowns.length) predicateUnknownCount += 1;
    if (!groups || category === 'excluded' || (category === 'possible' && !query.possibleMatches)) continue;
    if (candidates[store][category].length < limits.maxResultsPerStore) {
      candidates[store][category].push({ item, checked, result, applicability, position: tally[category] });
    }
  }
  // Select pages only after the full bounded eligibility scan. Optional U rows
  // cannot crowd out a later strict match in the stable per-store identity rank.
  if (groups) for (const { store } of stores) {
    const desired = [...candidates[store].strict, ...candidates[store].possible];
    pageTruncated ||= counts[store].strict + (query.possibleMatches ? counts[store].possible : 0) > limits.maxResultsPerStore;
    for (const { item, checked, result, applicability, position } of desired.slice(0, limits.maxResultsPerStore)) {
      const explanation = { witness: result.witness, unknowns: result.unknowns,
        assignments: checked.assignments,
        ...(applicability ? { applicability } : {}) };
      const remaining = limits.maxExplanationNodes - used.explanationNodes;
      const localCost = explanationSize(explanation, remaining);
      const addition = localCost === null ? null
        : stageAssignmentEvidence(checked, assignmentEvidence, input.namespace, query.subjectPolicy, remaining - localCost);
      if (addition === null) {
        explanationsComplete = false;
        continue;
      }
      // Commit the complete row and its new evidence together. Failed candidates
      // cannot expose orphan evidence or spend emitted-explanation capacity.
      if (addition.evidence) {
        assignmentEvidence ??= addition.evidence;
        Object.assign(assignmentEvidence.outcomes, addition.evidence.outcomes);
      }
      used.explanationNodes += localCost + addition.cost;
      const entry = item.row.entry;
      const identity = item.identityType === 'record' ? { ref: item.row.ref } : { proposalRef: item.row.proposalRef };
      const category = result.truth === 'T' ? 'strict' : 'possible';
      groups[store][category].push({ identityType: item.identityType, ...identity,
        label: entry.record.title ?? entry.record.term ?? entry.record.heading ?? entry.record.id,
        file: entry.file, sourcePointers: { sourceOfTruth: entry.record['source-of-truth'] ?? null,
          citations: entry.record.citations ?? null },
        lifecycle: { basis: query.view === 'current' ? 'lifecycle-only' : 'all-valid-lifecycle',
          value: item.identity.kind === 'knowledge' ? leafStage(entry.record) ?? null : entry.record.status ?? null },
        truth: result.truth, ...explanation, rank: { profile: 'id-v1', signals: [], position } });
    }
  }
  const evaluationComplete = hierarchyComplete && predicateComplete && assignmentsValidated === rows.length;
  if (!evaluationComplete) for (const tally of Object.values(counts)) {
    tally.basis = 'lower-bound';
    tally.possibleBasis = 'provisional';
  }
  if (assignmentsValidated < rows.length && used.recordsStarted === limits.maxRecords) diagnostics.push({ code: 'record-budget' });
  if (!predicateComplete) diagnostics.push({ code: 'predicate-budget' });
  if (assignmentEvidence) assignmentEvidence.outcomes = Object.fromEntries(Object.entries(assignmentEvidence.outcomes)
    .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0));
  return { outputVersion: SUBJECT_QUERY_OUTPUT_VERSION,
    status: evaluationComplete ? 'complete' : 'incomplete', query, input, groups, counts, resources, diagnostics,
    ...(assignmentEvidence ? { assignmentEvidence } : {}),
    coverage: { evaluationComplete, stores, predicateUnknownCount, rankComplete: evaluationComplete,
      pageTruncated, explanationsComplete, unvalidatedRecords: rows.length - assignmentsValidated } };
}

/** Output factoring only: every P3/P2 call has already executed with its real allowance. */
function stageAssignmentEvidence(checked, retained, namespace, policy, maximum) {
  const ids = checked.assignments.state === 'known' ? checked.assignments.ids : [];
  if (checked.subjects.length !== ids.length) throw new TypeError('Assignment evidence does not cover the authored list.');
  const evidence = { namespace, kind: 'subject', purpose: 'query', policy, outcomes: Object.create(null) };
  let cost = 0;
  for (const [index, target] of checked.subjects.entries()) {
    const { originalId, path, outcome } = target;
    // These omitted wrappers must remain exactly reconstructible. Future P3
    // fields or record-specific outcome variation require a new output contract.
    if (Reflect.ownKeys(target).length !== 4 || target.index !== index || originalId !== ids[index]
      || path !== `subjects[${index}]` || outcome.eligible !== true || outcome.verification !== 'verified'
      || outcome.resolution.status !== 'resolved' || outcome.resolution.requestedId !== originalId
      || outcome.resolution.policy !== policy || outcome.resolution.id !== outcome.resolution.subject.id) {
      throw new TypeError('Unexpected successful assignment evidence contract.');
    }
    const prior = retained?.outcomes[originalId];
    if (prior) {
      if (!isDeepStrictEqual(prior, outcome)) throw new TypeError('Inconsistent query-local assignment outcome.');
      continue;
    }
    const size = explanationSize(outcome, maximum - cost);
    if (size === null) return null;
    cost += size;
    evidence.outcomes[originalId] = outcome;
  }
  if (!Object.keys(evidence.outcomes).length) return { cost: 0 };
  if (!retained) {
    // Charge the actual envelope and outcomes container once, including all
    // qualifier scalars. Object keys are not values in this named metric.
    const envelopeCost = explanationSize({ ...evidence, outcomes: {} }, maximum - cost);
    if (envelopeCost === null) return null;
    cost += envelopeCost;
  }
  return { cost, evidence };
}

function compareIdentityRows(a, b) {
  const compare = (left, right) => left < right ? -1 : left > right ? 1 : 0;
  return compare(a.identity.namespace, b.identity.namespace) || compare(a.identity.kind, b.identity.kind)
    || compare(a.identityType, b.identityType) || compare(a.identity.id ?? a.identity.key, b.identity.id ?? b.identity.key);
}

function evaluateLegacyScope(record, scope) {
  const declared = readLegacyJurisdictions(record);
  return { profile: scope.profile, mode: scope.mode, asked: [...scope.jurisdictions], declared,
    scopeBasis: declared.length ? 'declared-jurisdictions' : 'legacy-unrestricted-default',
    eligible: matchesLegacyJurisdictions(declared, scope.jurisdictions) };
}

/** Count every JSON value/container retained in explanation, stopping at cap. */
function explanationSize(value, maximum) {
  const pending = [value];
  let used = 0;
  while (pending.length) {
    if (used === maximum) return null;
    const current = pending.pop();
    used += 1;
    if (current !== null && typeof current === 'object') {
      for (const child of Object.values(current)) {
        if (used + pending.length === maximum) return null;
        pending.push(child);
      }
    }
  }
  return used;
}
