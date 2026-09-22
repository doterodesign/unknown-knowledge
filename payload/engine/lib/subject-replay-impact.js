/** Actual query replay over authenticated contexts; no discovery or publication. */
import { canonicalJsonBytes, canonicalSha256, CapturedInputError } from './canonical-json.js';
import { getGovernedSubjectRegistry, getSubjectGovernanceDescriptor,
  validateSubjectGovernanceCapture, subjectEligibility } from './subject-governance.js';
import { SubjectError } from './subjects.js';
import { querySubjects } from './subject-query.js';
import { compareSubjectQueryCandidates } from './subject-query-delta.js';
import { assertSubjectOperationContext, getSubjectOperationResources, SubjectOperationError } from './subject-operation.js';

const object = (value) => value !== null && typeof value === 'object'
  && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const closed = (value, required, optional = []) => object(value)
  && required.every((key) => Object.hasOwn(value, key))
  && Reflect.ownKeys(value).every((key) => [...required, ...optional].includes(key));
const text = (value) => typeof value === 'string' && value.trim().length > 0;
const whole = (value) => Number.isSafeInteger(value) && value >= 0;
const order = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const problem = (code, message) => ({ code, message });
const refuse = (diagnostics) => ({ version: 1, status: 'refused', cases: null, diagnostics });
const validSides = (input, bounded = false) => ['before', 'after'].every((side) =>
  closed(input[side], bounded ? ['capturedInputRef', 'context', 'operation'] : ['capturedInputRef', 'context'])
  && text(input[side].capturedInputRef) && object(input[side].context));
const validLimits = (limits, fields) => closed(limits, ['version', ...fields]) && limits.version === 1
  && fields.every((key) => whole(limits[key]));
const queryResources = () => ({ budgetBasis: 'per-call', accountingBasis: 'returned-observed-counters',
  calls: 0, unreportedCalls: 0, used: {}, maxObservedAstDepth: 0 });

function bindSides(input, bounded = false) {
  const captured = {}; const registries = {};
  for (const side of ['before', 'after']) {
    const { capturedInputRef, context } = input[side];
    if (bounded) assertSubjectOperationContext(input[side].operation, context);
    const options = bounded ? { operationBudget: getSubjectOperationResources(input[side].operation).subjectOperationBudget } : undefined;
    const binding = validateSubjectGovernanceCapture(context.subjectGovernance, { model: context.model }, options);
    if (!binding.ok) return { diagnostics: binding.diagnostics.map((row) => ({ ...row, side })) };
    const registry = getGovernedSubjectRegistry(context.subjectGovernance, options);
    registries[side] = registry;
    captured[side] = { capturedInputRef, namespace: registry.namespace,
      registryDigest: canonicalSha256(registry.document),
      governanceDigest: canonicalSha256(getSubjectGovernanceDescriptor(context.subjectGovernance, options)),
      versions: { schema: registry.schemaVersion, normalizer: registry.normalizerVersion },
      revisions: { registry: registry.revision, hierarchy: registry.hierarchyRevision } };
  }
  if (captured.before.namespace !== captured.after.namespace) {
    return { diagnostics: [problem('namespace-mismatch', 'Replay requires one installation namespace.')] };
  }
  return { captured, registries };
}

/** Supplied-inventory coverage only; limits do not bound model memory or canonicalization. */
export function compareSubjectReplays(input) {
  try { return compareReplays(input); }
  catch (error) {
    if (!(error instanceof CapturedInputError)) throw error;
    return refuse([problem(error.code, error.message)]);
  }
}

/** Fixed host-bound entry; each actual context retains its original operation. */
export function compareOperationSubjectReplays(input) {
  const state = { cases: [], ordered: [], current: null, input: null,
    scope: { inventoryBasis: 'caller-supplied', declaredCoverage: null, candidateBasis: 'selected-stores-and-view' },
    coverage: { suppliedCases: null, reservedCases: 0, assessedCases: 0, unassessedCaseIds: null,
      reservationComplete: false, candidateDeltasComplete: false },
    resources: { limits: null, queries: { ...queryResources(), returnedCalls: 0,
      usageReportedCalls: 0, usageUnreportedCalls: 0 } } };
  const refused = diagnostics => ({ version: 1, status: 'refused', cases: state.cases, input: state.input,
    scope: state.scope, coverage: { ...state.coverage,
      unassessedCaseIds: state.coverage.suppliedCases === null ? null : state.ordered.slice(state.coverage.assessedCases).map(row => row.id) },
    resources: state.resources, diagnostics });
  try {
    const result = compareReplays(input, true, state);
    return result.status === 'refused' ? refused(result.diagnostics) : result;
  }
  catch (error) {
    if (!(error instanceof CapturedInputError || error instanceof SubjectError || error instanceof SubjectOperationError)) throw error;
    return refused([{ ...problem(error.code, error.message), ...(state.current ?? {}) }]);
  }
}

function compareReplays(input, bounded = false, state) {
  if (!closed(input, ['version', 'before', 'after', 'limits'], ['inventory']) || input.version !== 1
    || !validSides(input, bounded) || !validLimits(input.limits, ['maxCases', 'maxInventoryBytes'])) {
    return refuse([problem('invalid-replay-input', 'Supply closed version 1 captures and explicit inventory limits.')]);
  }
  const { inventory, limits } = input;
  if (bounded) {
    state.resources.limits = { ...limits };
    // Authenticate even an absent inventory before returning a no-work result.
    for (const side of ['before', 'after']) assertSubjectOperationContext(input[side].operation, input[side].context);
  }
  if (inventory == null) return { version: 1, status: 'not-assessed', cases: null, input: null,
    scope: { inventoryBasis: 'caller-supplied', declaredCoverage: null },
    coverage: { suppliedCases: null, reservedCases: 0, assessedCases: 0, unassessedCaseIds: null,
      reservationComplete: false, candidateDeltasComplete: false },
    resources: bounded ? state.resources : { limits: { ...limits }, queries: queryResources() },
    diagnostics: [problem('replay-inventory-absent', 'No supplied replay inventory was assessed.')] };
  if (!closed(inventory, ['version', 'coverage', 'cases']) || inventory.version !== 1
    || !['complete', 'partial'].includes(inventory.coverage) || !Array.isArray(inventory.cases)
    || !Array.from(inventory.cases).every((row) => closed(row, ['id', 'query']) && text(row.id) && object(row.query))
    || new Set(inventory.cases.map(({ id }) => id)).size !== inventory.cases.length) {
    return refuse([problem('invalid-replay-inventory', 'Supply unique case IDs and actual query specifications.')]);
  }
  const bound = bindSides(input, bounded);
  if (bound.diagnostics) return refuse(bound.diagnostics);
  const ordered = [...inventory.cases].sort((a, b) => order(a.id, b.id));
  if (bounded) {
    state.ordered = ordered; state.coverage.suppliedCases = ordered.length;
    state.scope.declaredCoverage = inventory.coverage;
  }
  const sorted = { ...inventory, cases: ordered };
  const inventoryBytes = canonicalJsonBytes(sorted).length;
  const inventoryDigest = canonicalSha256(sorted);
  const reservationComplete = ordered.length <= limits.maxCases && inventoryBytes <= limits.maxInventoryBytes;
  const resources = bounded ? state.resources : { limits: { ...limits }, inventoryBytes, queries: queryResources() };
  if (bounded) {
    resources.inventoryBytes = inventoryBytes;
    state.coverage.reservationComplete = reservationComplete;
    state.coverage.reservedCases = reservationComplete ? ordered.length : 0;
  }
  const execute = (side, query) => {
    let result;
    if (bounded) {
      resources.queries.calls++;
      try {
        result = querySubjects(input[side].context, query, { collect: 'results', operation: input[side].operation });
        resources.queries.returnedCalls++;
        if (result.resources?.used) resources.queries.usageReportedCalls++;
        else resources.queries.usageUnreportedCalls++;
      } finally { resources.queries.unreportedCalls = resources.queries.calls - resources.queries.returnedCalls; }
    } else {
      result = querySubjects(input[side].context, query, { collect: 'results' });
      resources.queries.calls += 1;
      if (!result.resources) resources.queries.unreportedCalls += 1;
    }
    for (const [key, amount] of Object.entries(result.resources?.used ?? {})) {
      if (key === 'astDepth') resources.queries.maxObservedAstDepth = Math.max(resources.queries.maxObservedAstDepth, amount);
      else resources.queries.used[key] = (resources.queries.used[key] ?? 0) + amount;
    }
    return result;
  };
  const cases = reservationComplete ? ordered.map((entry) => {
    if (bounded) {
      const row = { id: entry.id, specification: structuredClone(entry), before: null, after: null, candidates: null };
      state.cases.push(row);
      for (const side of ['before', 'after']) {
        state.current = { caseId: entry.id, side };
        row[side] = execute(side, entry.query);
      }
      row.candidates = compareSubjectQueryCandidates({ before: row.before, after: row.after, possibleMatches: entry.query.possibleMatches === true });
      state.coverage.assessedCases++; state.current = null;
      return row;
    }
    const before = execute('before', entry.query); const after = execute('after', entry.query);
    return { id: entry.id, specification: structuredClone(entry), before, after,
      candidates: compareSubjectQueryCandidates({ before, after, possibleMatches: entry.query.possibleMatches === true }) };
  }) : [];
  const candidateDeltasComplete = reservationComplete && cases.every(({ candidates }) => candidates.status === 'exact');
  const metadata = { version: 1, generator: 'subject-replay-impact-v1', consistency: 'captured-model',
    inputScope: 'registry-governance-and-executed-queries', ...bound.captured, inventoryDigest, limits: { ...limits },
    replays: cases.map(({ id, before, after }) => ({ id, before: before.input?.fingerprint ?? null, after: after.input?.fingerprint ?? null })) };
  return { version: 1, status: inventory.coverage === 'complete' && candidateDeltasComplete ? 'complete' : 'incomplete',
    cases, scope: { inventoryBasis: 'caller-supplied', declaredCoverage: inventory.coverage, candidateBasis: 'selected-stores-and-view' },
    input: { ...metadata, fingerprint: canonicalSha256(metadata) },
    coverage: { suppliedCases: ordered.length, reservedCases: reservationComplete ? ordered.length : 0,
      assessedCases: cases.length, unassessedCaseIds: reservationComplete ? [] : ordered.map(({ id }) => id),
      reservationComplete, candidateDeltasComplete }, resources,
    diagnostics: [
      ...(!reservationComplete ? [problem('replay-inventory-budget', 'The complete inventory must fit before any query runs.')] : []),
      ...(inventory.coverage === 'partial' ? [problem('partial-replay-inventory', 'Only the supplied partial inventory was assessed.')] : []),
    ] };
}

const policy = {
  id: 'assignment-replay-v1', version: 1, stores: ['knowledge'], subjectPolicy: 'current',
  views: ['current', 'all'], expansions: ['direct', 'self-and-descendants'],
  ranking: { profile: 'id-v1' }, possibleMatches: true, applicability: 'none',
  baseline: ['all', 'none', 'subjects-present', 'not-subjects-present'], unary: ['assigned', 'not-assigned'],
  pairs: { selection: 'adjacent-canonical-ids-no-wrap', forms: ['and', 'or', 'and-not-right', 'and-not-left'] },
  scope: 'finite-representative-queries-not-exhaustive-use-discovery',
};
const typedPolicy = { ...policy, id: 'typed-assignment-replay-v1', stores: 'actual-installed-stores-both-sides' };
const queryLimitKeys = ['maxAstNodes', 'maxAstDepth', 'maxHierarchyNodes', 'maxHierarchyEdges',
  'maxRedirects', 'maxRecords', 'maxPredicateSteps', 'maxResultsPerStore', 'maxExplanationNodes'];
const policyLimitKeys = ['maxSubjects', 'maxEligibilityRedirects', 'maxCases', 'maxInventoryBytes'];
const assigned = (subject) => ({ op: 'assigned', subject });
const not = (arg) => ({ op: 'not', arg });
const bothEligible = (id, outcomes) => outcomes.every((outcome) => outcome?.eligible === true
  && outcome.verification === 'verified' && outcome.resolution.status === 'resolved'
  && outcome.resolution.policy === 'current' && outcome.resolution.requestedId === id && outcome.resolution.id === id);

function stableIneligible(id, outcomes) {
  const allowed = (outcome) => {
    const resolution = outcome?.resolution;
    if (outcome?.eligible !== false || outcome.verification !== 'not-required'
      || resolution?.status !== 'unresolved' || resolution.policy !== 'current'
      || resolution.requestedId !== id || resolution.redirects.length !== 0 || outcome.code !== resolution.code) return false;
    const subject = resolution.subject;
    return (outcome.code === 'subject-proposed' && subject.status === 'proposed')
      || (outcome.code === 'subject-suppressed' && subject.status === 'suppressed')
      || (outcome.code === 'subject-retired' && subject.status === 'retired' && subject.retirement?.kind !== 'split')
      || (outcome.code === 'subject-split' && subject.status === 'retired' && subject.retirement?.kind === 'split');
  };
  return outcomes.every(allowed) && canonicalSha256(outcomes[0]) === canonicalSha256(outcomes[1]);
}

function buildCases(ids, queryBudgets, recipe = policy) {
  const predicates = [['all', { op: 'all' }], ['none', { op: 'none' }],
    ['subjects-present', { op: 'subjects-present' }], ['not-subjects-present', not({ op: 'subjects-present' })]];
  for (const id of ids) predicates.push([`assigned/${id}`, assigned(id)], [`not-assigned/${id}`, not(assigned(id))]);
  for (let i = 1; i < ids.length; i += 1) {
    const a = ids[i - 1]; const b = ids[i]; const pair = `${a}/${b}`;
    predicates.push([`and/${pair}`, { op: 'and', args: [assigned(a), assigned(b)] }],
      [`or/${pair}`, { op: 'or', args: [assigned(a), assigned(b)] }],
      [`and-not-right/${pair}`, { op: 'and', args: [assigned(a), not(assigned(b))] }],
      [`and-not-left/${pair}`, { op: 'and', args: [assigned(b), not(assigned(a))] }]);
  }
  const cases = [];
  for (const store of recipe.stores) for (const view of recipe.views) for (const expansion of recipe.expansions) {
    for (const [name, where] of predicates) cases.push({ id: `${store}/${view}/${expansion}/${name}`, query: {
      version: 1, stores: [store], view, expansion, subjectPolicy: recipe.subjectPolicy,
      ranking: { ...recipe.ranking }, possibleMatches: true, where: structuredClone(where), budgets: { ...queryBudgets },
    } });
  }
  return cases.sort((a, b) => order(a.id, b.id));
}

/** Fixed first-operation Knowledge recipe; no caller-selected cases, stores or exemptions. */
export function compareAssignmentReplays(input) {
  try { return assignmentReplays(input); }
  catch (error) {
    if (!(error instanceof CapturedInputError)) throw error;
    return refuse([problem(error.code, error.message)]);
  }
}

/** Fixed all-installed-store recipe; no caller-selected stores or cases. */
export function compareTypedAssignmentReplays(input) {
  try { return assignmentReplays(input, true); }
  catch (error) {
    if (!(error instanceof CapturedInputError)) throw error;
    return refuse([problem(error.code, error.message)]);
  }
}

function assignmentReplays(input, typed = false) {
  if (!closed(input, ['version', 'before', 'after', 'limits', 'queryBudgets']) || input.version !== 1
    || !validSides(input) || !validLimits(input.limits, policyLimitKeys)
    || !validLimits(input.queryBudgets, queryLimitKeys)
    || input.queryBudgets.maxAstNodes < 1 || input.queryBudgets.maxAstDepth < 1) {
    return refuse([problem('invalid-assignment-replay-input', 'Supply exact captures and all explicit recipe and query capacities.')]);
  }
  const bound = bindSides(input);
  if (bound.diagnostics) return refuse(bound.diagnostics);
  const stores = typed ? ['knowledge', 'ontology', 'decisions'].filter(name => ['before', 'after'].some(side => input[side].context.model.stores[name]?.present === true)) : policy.stores;
  if (typed && (!stores.length || stores.some(name => ['before', 'after'].some(side => input[side].context.model.stores[name]?.present !== true)))) {
    return refuse([problem('typed-assignment-store-unavailable', 'Every actual installed store is required on both sides.')]);
  }
  const recipe = typed ? { ...typedPolicy, stores } : policy;
  const descriptor = typed ? typedPolicy : policy;
  const ids = [...new Set([...bound.registries.before.subjects.keys(), ...bound.registries.after.subjects.keys()])].sort(order);
  const limits = { ...input.limits };
  const result = { version: 1, status: 'incomplete', policy: { id: descriptor.id, version: descriptor.version, digest: canonicalSha256(descriptor) },
    input: bound.captured, scope: { stores: [...stores], subjectPolicy: 'current',
      basis: policy.scope, canonicalSubjects: ids, outsideCanonical: Object.fromEntries(['before', 'after']
        .map((side) => [side, [...bound.registries[side].proposals.keys()].sort(order)])) },
    subjects: [], inventory: null, inventoryDigest: null, comparison: null,
    coverage: { subjectsComplete: false, unassessedSubjectIds: [...ids], reservationComplete: false },
    resources: { limits, queryBudgets: { ...input.queryBudgets },
      eligibility: { calls: 0, returnedCalls: 0, unreportedCalls: 0, used: { redirects: 0 } },
      inventory: { requiredCases: null, bytes: null } }, diagnostics: [] };
  const finish = () => ({ ...result, fingerprint: canonicalSha256(result) });
  const fail = (code, message) => { result.diagnostics.push(problem(code, message)); return finish(); };
  if (ids.length > limits.maxSubjects) return fail('replay-subject-budget', 'The complete canonical Subject union must fit before eligibility runs.');
  const eligible = [];
  const usage = result.resources.eligibility;
  for (const id of ids) {
    const row = { id, before: null, after: null, disposition: 'blocked', diagnostics: [] };
    for (const side of ['before', 'after']) {
      usage.calls += 1;
      try {
        row[side] = subjectEligibility(input[side].context.subjectGovernance, id, { purpose: 'query', policy: 'current',
          budget: { redirects: limits.maxEligibilityRedirects - usage.used.redirects } });
        usage.returnedCalls += 1;
        usage.used.redirects += row[side].resolution.redirects.length;
      } catch (error) {
        if (!(error instanceof SubjectError)) throw error;
        usage.unreportedCalls += 1;
        row.diagnostics.push({ side, code: error.code, message: error.message });
        result.subjects.push(row);
        result.coverage.unassessedSubjectIds = ids.slice(result.subjects.length);
        return fail('replay-eligibility-unavailable', 'A failed eligibility call leaves work unreported; no replay is admitted.');
      }
    }
    const outcomes = [row.before, row.after];
    if (bothEligible(id, outcomes)) { row.disposition = 'queryable'; eligible.push(id); }
    else if (stableIneligible(id, outcomes)) row.disposition = 'outside-current-query-universe';
    result.subjects.push(row);
  }
  result.coverage.unassessedSubjectIds = [];
  result.coverage.subjectsComplete = true;
  if (result.subjects.some(({ disposition }) => disposition === 'blocked')) {
    return fail('replay-eligibility-unavailable', 'Unavailable, unequal or unsupported Subject outcomes cannot shrink the required inventory.');
  }
  const count = BigInt(stores.length) * 4n * (4n + 2n * BigInt(eligible.length)
    + 4n * BigInt(Math.max(eligible.length - 1, 0)));
  if (count > BigInt(Number.MAX_SAFE_INTEGER)) return fail('replay-case-budget', 'The complete case count exceeds safe representation.');
  result.resources.inventory.requiredCases = Number(count);
  if (count > BigInt(limits.maxCases)) return fail('replay-case-budget', 'The complete fixed recipe must fit; no cases are pruned to fit a limit.');
  result.inventory = { version: 1, coverage: 'complete', cases: buildCases(eligible, input.queryBudgets, recipe) };
  result.resources.inventory.bytes = canonicalJsonBytes(result.inventory).length;
  result.inventoryDigest = canonicalSha256(result.inventory);
  result.comparison = compareSubjectReplays({ version: 1, before: input.before, after: input.after,
    inventory: result.inventory, limits: { version: 1, maxCases: limits.maxCases, maxInventoryBytes: limits.maxInventoryBytes } });
  result.coverage.reservationComplete = result.comparison.coverage?.reservationComplete === true;
  result.status = result.comparison.status === 'complete' ? 'complete' : 'incomplete';
  return finish();
}
