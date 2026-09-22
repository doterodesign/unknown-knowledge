/** Fixed historical comparisons and source-refusal probes; never retirement/publication authority. */
import { isDeepStrictEqual as same } from 'node:util';
import { canonicalJsonBytes, canonicalSha256, CapturedInputError } from './canonical-json.js';
import { validateSubjectGovernanceCapture, getGovernedSubjectRegistry, subjectEligibility } from './subject-governance.js';
import { parseCanonicalId } from './record-identity.js';
import { SubjectError } from './subjects.js';
import { compareSubjectReplays } from './subject-replay-impact.js';

const policy = {
  id: 'retirement-replay-v1', version: 1, historicalSubjectPolicy: 'historical',
  refusalPolicies: ['current', 'equivalent'], views: ['current', 'all'], expansions: ['direct', 'self-and-descendants'],
  ranking: { profile: 'id-v1' }, possibleMatches: true,
  baseline: ['all', 'none', 'subjects-present', 'not-subjects-present'], unary: ['assigned', 'not-assigned'],
  pairs: { selection: 'adjacent-original-ids-no-wrap', forms: ['and', 'or', 'and-not-right', 'and-not-left'] },
  scope: 'finite-historical-queries-and-expected-source-refusals-not-exhaustive-use-discovery',
};
const closed = (value, keys) => value !== null && typeof value === 'object'
  && [Object.prototype, null].includes(Object.getPrototypeOf(value)) && Reflect.ownKeys(value).length === keys.length
  && keys.every((key) => {
    const field = Object.getOwnPropertyDescriptor(value, key); return field?.enumerable && Object.hasOwn(field, 'value');
  });
const recipeKeys = ['version', 'maxSubjects', 'maxEligibilityRedirects', 'maxCases', 'maxInventoryBytes'];
const queryKeys = ['version', 'maxAstNodes', 'maxAstDepth', 'maxHierarchyNodes', 'maxHierarchyEdges', 'maxRedirects',
  'maxRecords', 'maxPredicateSteps', 'maxResultsPerStore', 'maxExplanationNodes'];
const validLimits = (value, keys) => closed(value, keys) && value.version === 1
  && keys.every((key) => Number.isSafeInteger(value[key]) && value[key] >= 0);
const order = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const assigned = (subject) => ({ op: 'assigned', subject });
const not = (arg) => ({ op: 'not', arg });
const verified = (id, outcome) => outcome?.eligible === true && outcome.verification === 'verified'
  && outcome.resolution?.status === 'resolved' && outcome.resolution.policy === policy.historicalSubjectPolicy
  && outcome.resolution.requestedId === id && outcome.resolution.id === id && outcome.resolution.redirects.length === 0;

function buildInventory(stores, ids, source, budgets) {
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
  for (const store of stores) for (const view of policy.views) for (const expansion of policy.expansions) {
    const add = (id, subjectPolicy, where) => cases.push({ id, query: {
      version: 1, stores: [store], view, expansion, subjectPolicy, ranking: { ...policy.ranking },
      possibleMatches: true, where: structuredClone(where), budgets: { ...budgets },
    } });
    for (const [name, where] of predicates) add(`historical/${store}/${view}/${expansion}/${name}`, policy.historicalSubjectPolicy, where);
    for (const subjectPolicy of policy.refusalPolicies) for (const [name, where] of [
      [`assigned/${source}`, assigned(source)], [`not-assigned/${source}`, not(assigned(source))],
    ]) add(`refusal/${store}/${view}/${expansion}/${subjectPolicy}/${name}`, subjectPolicy, where);
  }
  return { version: 1, coverage: 'complete', cases: cases.sort((a, b) => order(a.id, b.id)) };
}

function expectedRefusal(row) {
  const after = row.after;
  const path = row.specification.query.where.op === 'not' ? '/where/arg/subject' : '/where/subject';
  if (!closed(after, ['outputVersion', 'status', 'groups', 'counts', 'diagnostics']) || after.outputVersion !== 2 || after.status !== 'refused'
    || after.groups !== null || after.counts !== null || !Array.isArray(after.diagnostics) || after.diagnostics.length !== 1) return false;
  const diagnostic = after.diagnostics[0];
  if (!closed(diagnostic, ['code', 'path', 'message']) || diagnostic.code !== 'subject-retired' || diagnostic.path !== path
    || typeof diagnostic.message !== 'string' || !diagnostic.message.trim()) return false;
  // The unchanged comparator establishes complete before output; only after may be unavailable.
  const unavailable = { status: 'unavailable', added: null, removed: null, retained: null, rankChanges: null,
    reasons: [{ side: 'after', code: 'full-query-output-unavailable' }] };
  return same(row.candidates, { status: 'unavailable', strict: unavailable, possible: unavailable });
}

/** Fixed internal recipe over actual unbound contexts. No caller cases, callbacks or policy overrides. */
export function compareRetirementReplays(input) {
  const result = { version: 1, kind: 'subject-retirement-replay', status: 'refused',
    policy: { id: policy.id, version: 1, digest: canonicalSha256(policy) },
    scope: { stores: [], canonicalSubjects: [], outsideCanonical: null }, subjects: [], inventory: null,
    inventoryDigest: null, comparison: null, assessments: [],
    coverage: { subjectsComplete: false, unassessedSubjectIds: [], reservationComplete: false,
      historicalComplete: false, expectedRefusalsComplete: false },
    resources: { limits: null, queryBudgets: null,
      eligibility: { calls: 0, returnedCalls: 0, unreportedCalls: 0, used: { redirects: 0 } },
      inventory: { historicalCases: null, refusalCases: null, requiredCases: null, requiredQueryCalls: null, bytes: null } }, diagnostics: [] };
  const fail = (code, message, details = {}) => { result.diagnostics.push({ code, message, ...details }); return result; };
  if (!closed(input, ['version', 'before', 'after', 'source', 'limits', 'queryBudgets']) || input.version !== 1
    || !['before', 'after'].every((side) => closed(input[side], ['capturedInputRef', 'context'])
      && typeof input[side].capturedInputRef === 'string' && input[side].capturedInputRef.trim() && input[side].context)
    || !parseCanonicalId('subject', input.source).ok || !validLimits(input.limits, recipeKeys) || !validLimits(input.queryBudgets, queryKeys)
    || input.queryBudgets.maxAstNodes < 1 || input.queryBudgets.maxAstDepth < 1) {
    return fail('invalid-retirement-replay-input', 'Supply both actual contexts, the original source and explicit recipe/query capacities.');
  }
  try {
    const registries = {};
    for (const side of ['before', 'after']) {
      const { context } = input[side];
      const binding = validateSubjectGovernanceCapture(context.subjectGovernance, { model: context.model });
      if (!binding.ok) return fail('retirement-replay-context-mismatch', 'Replay requires each actual governance binding.', { side, diagnostics: binding.diagnostics });
      registries[side] = getGovernedSubjectRegistry(context.subjectGovernance);
    }
    if (registries.before.namespace !== registries.after.namespace) return fail('namespace-mismatch', 'Both captures must share one namespace.');
    result.status = 'incomplete'; result.resources.limits = { ...input.limits }; result.resources.queryBudgets = { ...input.queryBudgets };
    const ids = [...new Set([...registries.before.subjects.keys(), ...registries.after.subjects.keys()])].sort(order);
    result.scope.canonicalSubjects = ids; result.coverage.unassessedSubjectIds = [...ids];
    result.scope.outsideCanonical = Object.fromEntries(['before', 'after'].map((side) => [side, [...registries[side].proposals.keys()].sort(order)]));
    const stores = ['knowledge', 'ontology', 'decisions'].filter((name) => ['before', 'after'].some((side) => input[side].context.model.stores[name]?.present === true));
    result.scope.stores = stores;
    if (!stores.length || stores.some((name) => ['before', 'after'].some((side) => input[side].context.model.stores[name]?.present !== true))) {
      return fail('retirement-replay-store-unavailable', 'Every store present on either side is required on both sides.');
    }
    if (!ids.includes(input.source)) return fail('retirement-replay-source-unavailable', 'The original canonical source must be inventoried.');
    if (ids.length > input.limits.maxSubjects) return fail('retirement-replay-subject-budget', 'Reserve the complete canonical Subject union before eligibility.');
    const usage = result.resources.eligibility;
    for (const [index, id] of ids.entries()) {
      const row = { id, before: null, after: null, disposition: 'blocked' };
      result.subjects.push(row);
      for (const side of ['before', 'after']) {
        usage.calls += 1;
        try {
          row[side] = subjectEligibility(input[side].context.subjectGovernance, id, { purpose: 'query', policy: policy.historicalSubjectPolicy,
            budget: { redirects: input.limits.maxEligibilityRedirects - usage.used.redirects } });
          usage.returnedCalls += 1; usage.used.redirects += row[side].resolution.redirects.length;
        } catch (error) {
          if (!(error instanceof SubjectError)) throw error;
          usage.unreportedCalls += 1; result.coverage.unassessedSubjectIds = ids.slice(index);
          return fail('retirement-replay-eligibility-unavailable', 'Failed eligibility cannot shrink the operand universe.', { id, side, ownerCode: error.code });
        }
      }
      if (verified(id, row.before) && verified(id, row.after)) row.disposition = 'queryable';
      result.coverage.unassessedSubjectIds = ids.slice(index + 1);
    }
    result.coverage.subjectsComplete = true;
    if (result.subjects.some(({ disposition }) => disposition === 'blocked')) {
      return fail('retirement-replay-eligibility-unavailable', 'Every original canonical operand needs verified historical eligibility on both sides.');
    }
    const m = BigInt(stores.length); const n = BigInt(ids.length); const p = BigInt(Math.max(ids.length - 1, 0));
    const historical = 4n * m * (4n + 2n * n + 4n * p); const probes = 16n * m; const count = historical + probes;
    if (count * 2n > BigInt(Number.MAX_SAFE_INTEGER)) return fail('retirement-replay-case-budget', 'The complete paired workload exceeds safe representation.');
    Object.assign(result.resources.inventory, { historicalCases: Number(historical), refusalCases: Number(probes),
      requiredCases: Number(count), requiredQueryCalls: Number(count * 2n) });
    if (count > BigInt(input.limits.maxCases)) return fail('retirement-replay-case-budget', 'Both comparison and refusal cases must fit before any queries.');
    result.inventory = buildInventory(stores, ids, input.source, input.queryBudgets);
    result.inventoryDigest = canonicalSha256(result.inventory); result.resources.inventory.bytes = canonicalJsonBytes(result.inventory).length;
    result.assessments = result.inventory.cases.map(({ id }) => ({ id, kind: id.startsWith('historical/') ? 'historical' : 'expected-source-refusal',
      status: 'not-performed', diagnostics: [] }));
    // One combined reservation. Raw expected refusals intentionally keep this report incomplete.
    result.comparison = compareSubjectReplays({ version: 1, before: input.before, after: input.after, inventory: result.inventory,
      limits: { version: 1, maxCases: input.limits.maxCases, maxInventoryBytes: input.limits.maxInventoryBytes } });
    result.coverage.reservationComplete = result.comparison.coverage?.reservationComplete === true;
    if (!result.coverage.reservationComplete) return fail('retirement-replay-reservation-incomplete', 'The full combined inventory must fit before any query executes.');
    const actual = new Map((result.comparison.cases ?? []).map((row) => [row.id, row]));
    for (const assessment of result.assessments) {
      const row = actual.get(assessment.id);
      const passed = row && (assessment.kind === 'historical' ? row.candidates.status === 'exact' : expectedRefusal(row));
      assessment.status = passed ? 'passed' : 'failed';
      if (!passed) assessment.diagnostics.push({ code: assessment.kind === 'historical' ? 'historical-comparison-incomplete' : 'unexpected-source-refusal',
        message: 'The actual paired result did not establish this fixed retirement requirement.' });
    }
    result.coverage.historicalComplete = result.assessments.filter(({ kind }) => kind === 'historical').every(({ status }) => status === 'passed');
    result.coverage.expectedRefusalsComplete = result.assessments.filter(({ kind }) => kind === 'expected-source-refusal').every(({ status }) => status === 'passed');
    if (!result.coverage.historicalComplete || !result.coverage.expectedRefusalsComplete) {
      return fail('retirement-replay-assessment-incomplete', 'Historical deltas and source preparation refusals must each meet their own exact contract.');
    }
    result.status = 'complete'; return result;
  } catch (error) {
    if (!(error instanceof CapturedInputError)) throw error;
    result.status = 'refused'; return fail(error.code, error.message);
  }
}
