/** Fixed representative merge recipe; generic query and delta rules stay unchanged. */
import { canonicalJsonBytes, canonicalSha256, CapturedInputError } from './canonical-json.js';
import { validateSubjectGovernanceCapture, getGovernedSubjectRegistry, subjectEligibility } from './subject-governance.js';
import { parseCanonicalId } from './record-identity.js';
import { SubjectError } from './subjects.js';
import { compareSubjectReplays } from './subject-replay-impact.js';

const closed = (value, keys) => value !== null && typeof value === 'object' && !Array.isArray(value)
  && Reflect.ownKeys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const order = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const policy = { id: 'equivalent-merge-replay-v1', version: 1, subjectPolicy: 'equivalent',
  views: ['current', 'all'], expansions: ['direct', 'self-and-descendants'], ranking: { profile: 'id-v1' }, possibleMatches: true,
  baseline: ['all', 'none', 'subjects-present', 'not-subjects-present'], unary: ['assigned', 'not-assigned'],
  pairs: { selection: 'adjacent-original-ids-plus-source-survivor', forms: ['and', 'or', 'and-not-right', 'and-not-left'] },
  scope: 'finite-representative-equivalent-queries-not-exhaustive-use-discovery' };
const recipeKeys = ['version', 'maxSubjects', 'maxEligibilityRedirects', 'maxCases', 'maxInventoryBytes'];
const queryKeys = ['version', 'maxAstNodes', 'maxAstDepth', 'maxHierarchyNodes', 'maxHierarchyEdges', 'maxRedirects',
  'maxRecords', 'maxPredicateSteps', 'maxResultsPerStore', 'maxExplanationNodes'];
const limits = (value, fields) => closed(value, fields) && value.version === 1
  && fields.every((key) => Number.isSafeInteger(value[key]) && value[key] >= 0);
const verified = (id, outcome) => outcome?.eligible === true && outcome.verification === 'verified'
  && outcome.resolution.status === 'resolved' && outcome.resolution.policy === 'equivalent' && outcome.resolution.requestedId === id;

function stableIneligible(id, before, after, declarations) {
  if (canonicalSha256(declarations.before) !== canonicalSha256(declarations.after)
    || canonicalSha256(before) !== canonicalSha256(after)) return false;
  const r = before?.resolution; const s = r?.subject;
  return before?.eligible === false && before.verification === 'not-required' && r?.status === 'unresolved'
    && r.policy === 'equivalent' && r.requestedId === id && r.redirects.length === 0 && before.code === r.code
    && ((r.code === 'subject-suppressed' && s.status === 'suppressed')
      || (r.code === 'subject-retired' && s.status === 'retired' && s.retirement?.kind !== 'equivalent-merge' && s.retirement?.kind !== 'split')
      || (r.code === 'subject-split' && s.status === 'retired' && s.retirement?.kind === 'split'));
}

function buildCases(stores, ids, pairs, budgets) {
  const assigned = (subject) => ({ op: 'assigned', subject }); const not = (arg) => ({ op: 'not', arg });
  const predicates = [['all', { op: 'all' }], ['none', { op: 'none' }],
    ['subjects-present', { op: 'subjects-present' }], ['not-subjects-present', not({ op: 'subjects-present' })]];
  for (const id of ids) predicates.push([`assigned/${id}`, assigned(id)], [`not-assigned/${id}`, not(assigned(id))]);
  for (const [a, b] of pairs) {
    const pair = `${a}/${b}`;
    predicates.push([`and/${pair}`, { op: 'and', args: [assigned(a), assigned(b)] }],
      [`or/${pair}`, { op: 'or', args: [assigned(a), assigned(b)] }],
      [`and-not-right/${pair}`, { op: 'and', args: [assigned(a), not(assigned(b))] }],
      [`and-not-left/${pair}`, { op: 'and', args: [assigned(b), not(assigned(a))] }]);
  }
  const cases = [];
  for (const store of stores) for (const view of policy.views) for (const expansion of policy.expansions) {
    for (const [name, where] of predicates) cases.push({ id: `${store}/${view}/${expansion}/${name}`, query: {
      version: 1, stores: [store], view, expansion, subjectPolicy: policy.subjectPolicy,
      ranking: { ...policy.ranking }, possibleMatches: true, where: structuredClone(where), budgets: { ...budgets },
    } });
  }
  return cases.sort((a, b) => order(a.id, b.id));
}

export function compareEquivalentMergeReplays(input) {
  const result = { version: 1, status: 'refused', policy: { id: policy.id, version: 1, digest: canonicalSha256(policy) },
    scope: { basis: policy.scope, stores: [], canonicalSubjects: [], outsideCanonical: null },
    subjects: [], inventory: null, inventoryDigest: null, comparison: null,
    coverage: { subjectsComplete: false, unassessedSubjectIds: [], reservationComplete: false },
    resources: { limits: null, queryBudgets: null, eligibility: { calls: 0, returnedCalls: 0, unreportedCalls: 0, used: { redirects: 0 } },
      inventory: { requiredCases: null, requiredQueryCalls: null, bytes: null } }, diagnostics: [] };
  const fail = (code, message, details = {}) => { result.diagnostics.push({ code, message, ...details }); return result; };
  if (!closed(input, ['version', 'before', 'after', 'source', 'survivor', 'limits', 'queryBudgets']) || input.version !== 1
    || !['before', 'after'].every((side) => closed(input[side], ['capturedInputRef', 'context'])
      && typeof input[side].capturedInputRef === 'string' && input[side].capturedInputRef.trim() && input[side].context)
    || ![input.source, input.survivor].every((id) => parseCanonicalId('subject', id).ok) || input.source === input.survivor
    || !limits(input.limits, recipeKeys) || !limits(input.queryBudgets, queryKeys)
    || input.queryBudgets.maxAstNodes < 1 || input.queryBudgets.maxAstDepth < 1) {
    return fail('invalid-merge-replay-input', 'Supply both actual contexts, distinct participants and explicit recipe/query capacities.');
  }
  try {
    const registries = {};
    for (const side of ['before', 'after']) {
      const { context } = input[side];
      const binding = validateSubjectGovernanceCapture(context.subjectGovernance, { model: context.model });
      if (!binding.ok) return fail('merge-replay-context-mismatch', 'Each context must retain its actual governance binding.', { side, diagnostics: binding.diagnostics });
      registries[side] = getGovernedSubjectRegistry(context.subjectGovernance);
    }
    if (registries.before.namespace !== registries.after.namespace) return fail('namespace-mismatch', 'Both replay captures must share one namespace.');
    result.status = 'incomplete'; result.resources.limits = { ...input.limits }; result.resources.queryBudgets = { ...input.queryBudgets };
    const ids = [...new Set([...registries.before.subjects.keys(), ...registries.after.subjects.keys()])].sort(order);
    result.scope.canonicalSubjects = ids; result.coverage.unassessedSubjectIds = [...ids];
    result.scope.outsideCanonical = Object.fromEntries(['before', 'after'].map((side) => [side, [...registries[side].proposals.keys()].sort(order)]));
    const stores = ['knowledge', 'ontology', 'decisions'].filter((name) => ['before', 'after'].some((side) => input[side].context.model.stores[name]?.present === true));
    result.scope.stores = stores;
    if (!stores.length || stores.some((name) => ['before', 'after'].some((side) => input[side].context.model.stores[name]?.present !== true))) {
      return fail('merge-replay-store-unavailable', 'Every store present on either side is required on both sides.');
    }
    if (ids.length > input.limits.maxSubjects) return fail('merge-replay-subject-budget', 'Reserve the complete actual canonical Subject union before eligibility.');
    const eligible = []; const usage = result.resources.eligibility;
    for (const id of ids) {
      const row = { id, before: null, after: null, disposition: 'blocked' };
      for (const side of ['before', 'after']) {
        usage.calls += 1;
        try {
          row[side] = subjectEligibility(input[side].context.subjectGovernance, id, { purpose: 'query', policy: 'equivalent',
            budget: { redirects: input.limits.maxEligibilityRedirects - usage.used.redirects } });
          usage.returnedCalls += 1; usage.used.redirects += row[side].resolution.redirects.length;
        } catch (error) {
          if (!(error instanceof SubjectError)) throw error;
          usage.unreportedCalls += 1; result.subjects.push(row);
          result.coverage.unassessedSubjectIds = ids.slice(result.subjects.length);
          return fail('merge-replay-eligibility-unavailable', 'No failed eligibility call may shrink the operand inventory.', { id, side, ownerCode: error.code });
        }
      }
      const mandatory = id === input.source || id === input.survivor;
      if (verified(id, row.before) && verified(id, row.after)
        && (!mandatory || (row.before.resolution.id === id && row.before.resolution.redirects.length === 0
          && row.after.resolution.id === input.survivor && (id === input.survivor ? row.after.resolution.redirects.length === 0
            : canonicalSha256(row.after.resolution.redirects) === canonicalSha256([{ from: input.source, to: input.survivor }]))))) {
        row.disposition = 'queryable'; eligible.push(id);
      } else if (!mandatory && stableIneligible(id, row.before, row.after,
        { before: registries.before.subjects.get(id), after: registries.after.subjects.get(id) })) row.disposition = 'stable-ineligible';
      result.subjects.push(row);
    }
    result.coverage.subjectsComplete = true; result.coverage.unassessedSubjectIds = [];
    if (![input.source, input.survivor].every((id) => eligible.includes(id)) || result.subjects.some(({ disposition }) => disposition === 'blocked')) {
      return fail('merge-replay-eligibility-unavailable', 'Mandatory mappings and all other actual outcomes must satisfy the fixed recipe policy.');
    }
    const pairs = eligible.slice(1).map((id, i) => [eligible[i], id]); const mandatoryPair = [input.source, input.survivor].sort(order);
    if (!pairs.some((pair) => pair[0] === mandatoryPair[0] && pair[1] === mandatoryPair[1])) pairs.push(mandatoryPair);
    pairs.sort((a, b) => order(a[0], b[0]) || order(a[1], b[1]));
    const count = BigInt(stores.length) * 4n * (4n + 2n * BigInt(eligible.length) + 4n * BigInt(pairs.length));
    if (count * 2n > BigInt(Number.MAX_SAFE_INTEGER)) return fail('merge-replay-case-budget', 'The full paired workload exceeds safe representation.');
    result.resources.inventory.requiredCases = Number(count); result.resources.inventory.requiredQueryCalls = Number(count * 2n);
    if (count > BigInt(input.limits.maxCases)) return fail('merge-replay-case-budget', 'The full paired recipe must fit before queries run.');
    result.inventory = { version: 1, coverage: 'complete', cases: buildCases(stores, eligible, pairs, input.queryBudgets) };
    result.inventoryDigest = canonicalSha256(result.inventory); result.resources.inventory.bytes = canonicalJsonBytes(result.inventory).length;
    result.comparison = compareSubjectReplays({ version: 1, before: input.before, after: input.after, inventory: result.inventory,
      limits: { version: 1, maxCases: input.limits.maxCases, maxInventoryBytes: input.limits.maxInventoryBytes } });
    result.coverage.reservationComplete = result.comparison.coverage?.reservationComplete === true;
    result.status = result.comparison.status === 'complete' ? 'complete' : 'incomplete'; return result;
  } catch (error) {
    if (!(error instanceof CapturedInputError)) throw error;
    result.status = 'refused'; return fail(error.code, error.message);
  }
}
