/** Fixed internal split consistency recipe; neither a core authenticator nor publication authority. */
import { isDeepStrictEqual as same } from 'node:util';
import { canonicalJsonBytes, canonicalSha256, CapturedInputError } from './canonical-json.js';
import { validateSubjectGovernanceCapture, getGovernedSubjectRegistry, subjectEligibility } from './subject-governance.js';
import { parseCanonicalId } from './record-identity.js';
import { SubjectError } from './subjects.js';
import { compareSubjectReplays } from './subject-replay-impact.js';

const policy = {
  id: 'split-replay-v1', version: 1, historicalSubjectPolicy: 'historical',
  refusalPolicies: ['current', 'equivalent'], successorPolicies: ['historical', 'current', 'equivalent'],
  stores: ['knowledge', 'ontology', 'decisions'], views: ['current', 'all'], expansions: ['direct', 'self-and-descendants'],
  ranking: { profile: 'id-v1' }, possibleMatches: true,
  baseline: ['all', 'none', 'subjects-present', 'not-subjects-present'], unary: ['assigned', 'not-assigned'],
  pairs: { original: 'adjacent-original-ids-no-wrap', introduced: 'source-each-successor-and-adjacent-successors-no-wrap',
    forms: ['and', 'or', 'and-not-right', 'and-not-left'] },
  membership: 'baseline-unchanged-other-original-deltas-confined-to-proven-mapped-refs',
  scope: 'finite-consistency-conditional-on-independent-core-and-P8-preservation-not-an-independent-query-oracle',
};
const closed = (value, keys) => value !== null && typeof value === 'object'
  && [Object.prototype, null].includes(Object.getPrototypeOf(value)) && Reflect.ownKeys(value).length === keys.length
  && keys.every(key => { const field = Object.getOwnPropertyDescriptor(value, key); return field?.enumerable && Object.hasOwn(field, 'value'); });
const recipeKeys = ['version', 'maxSubjects', 'maxEligibilityRedirects', 'maxCases', 'maxInventoryBytes'];
const queryKeys = ['version', 'maxAstNodes', 'maxAstDepth', 'maxHierarchyNodes', 'maxHierarchyEdges', 'maxRedirects',
  'maxRecords', 'maxPredicateSteps', 'maxResultsPerStore', 'maxExplanationNodes'];
const validLimits = (value, keys) => closed(value, keys) && value.version === 1
  && keys.every(key => Number.isSafeInteger(value[key]) && value[key] >= 0);
const order = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const sid = id => parseCanonicalId('subject', id).ok;
const refKey = ref => JSON.stringify([ref.namespace, ref.kind, ref.id]);
const validRef = (ref, namespace) => closed(ref, ['namespace', 'kind', 'id']) && ref.namespace === namespace
  && ['knowledge', 'ontology', 'decision'].includes(ref.kind) && parseCanonicalId(ref.kind, ref.id).ok;
const uniqueRefs = (refs, namespace) => Array.isArray(refs) && refs.every(ref => validRef(ref, namespace))
  && new Set(refs.map(refKey)).size === refs.length;
const refSet = refs => refs.map(refKey).sort(order);
const assigned = subject => ({ op: 'assigned', subject });
const not = arg => ({ op: 'not', arg });
const unary = id => [[`assigned/${id}`, assigned(id)], [`not-assigned/${id}`, not(assigned(id))]];
const pairs = (a, b) => [
  [`and/${a}/${b}`, { op: 'and', args: [assigned(a), assigned(b)] }],
  [`or/${a}/${b}`, { op: 'or', args: [assigned(a), assigned(b)] }],
  [`and-not-right/${a}/${b}`, { op: 'and', args: [assigned(a), not(assigned(b))] }],
  [`and-not-left/${a}/${b}`, { op: 'and', args: [assigned(b), not(assigned(a))] }],
];
const verified = (id, outcome, subjectPolicy) => outcome?.eligible === true && outcome.verification === 'verified'
  && outcome.resolution?.status === 'resolved' && outcome.resolution.policy === subjectPolicy
  && outcome.resolution.requestedId === id && outcome.resolution.id === id && same(outcome.resolution.redirects, []);
const splitRefusal = (id, outcome, subjectPolicy, successors) => outcome?.eligible === false && outcome.verification === 'not-required'
  && outcome.code === 'subject-split' && outcome.resolution?.status === 'unresolved' && outcome.resolution.code === 'subject-split'
  && outcome.resolution.policy === subjectPolicy && outcome.resolution.requestedId === id
  && same(outcome.resolution.redirects, []) && same(outcome.resolution.alternatives, [...successors].sort(order));

function buildInventory(scope, budgets) {
  const historical = [['all', { op: 'all' }], ['none', { op: 'none' }],
    ['subjects-present', { op: 'subjects-present' }], ['not-subjects-present', not({ op: 'subjects-present' })]];
  for (const id of scope.originalSubjects) historical.push(...unary(id));
  for (let i = 1; i < scope.originalSubjects.length; i++) historical.push(...pairs(scope.originalSubjects[i - 1], scope.originalSubjects[i]));
  const introduced = scope.successors.flatMap(id => pairs(scope.source, id));
  for (let i = 1; i < scope.successors.length; i++) introduced.push(...pairs(scope.successors[i - 1], scope.successors[i]));
  const cases = [];
  for (const store of scope.stores) for (const view of policy.views) for (const expansion of policy.expansions) {
    const add = (kind, subjectPolicy, predicates, policyInId = false) => {
      for (const [name, where] of predicates) cases.push({ id: `${kind}/${store}/${view}/${expansion}/${policyInId ? `${subjectPolicy}/` : ''}${name}`,
        query: { version: 1, stores: [store], view, expansion, subjectPolicy, ranking: { ...policy.ranking },
          possibleMatches: true, where: structuredClone(where), budgets: { ...budgets } } });
    };
    add('historical', 'historical', historical);
    for (const selected of policy.refusalPolicies) add('source-refusal', selected, unary(scope.source), true);
    for (const selected of policy.successorPolicies) for (const id of scope.successors) add('successor-unary', selected, unary(id), true);
    add('introduced-pair', 'historical', introduced);
  }
  return { version: 1, coverage: 'complete', cases: cases.sort((a, b) => order(a.id, b.id)) };
}

// Preparation sorts required IDs, then selects that ID's first AST occurrence.
// This only locates operands in our fixed ASTs; it does not evaluate query truth.
function refusalPath(where, missing) {
  const nodes = [];
  const visit = (node, path) => {
    if (node.op === 'assigned') nodes.push({ id: node.subject, path: `${path}/subject` });
    else if (node.op === 'not') visit(node.arg, `${path}/arg`);
    else if (node.args) node.args.forEach((arg, index) => visit(arg, `${path}/args/${index}`));
  };
  visit(where, '/where');
  const id = nodes.map(node => node.id).filter(id => missing.has(id)).sort(order)[0];
  return nodes.find(node => node.id === id)?.path;
}

function expectedRefusal(row, side, code, path) {
  const output = row[side];
  if (!closed(output, ['outputVersion', 'status', 'groups', 'counts', 'diagnostics']) || output.outputVersion !== 2 || output.status !== 'refused'
    || output.groups !== null || output.counts !== null || !Array.isArray(output.diagnostics) || output.diagnostics.length !== 1) return false;
  const diagnostic = output.diagnostics[0];
  if (!closed(diagnostic, ['code', 'path', 'message']) || diagnostic.code !== code || diagnostic.path !== path
    || typeof diagnostic.message !== 'string' || !diagnostic.message.trim()) return false;
  // The comparator's exact side-only reason also requires complete opposite-side output.
  const unavailable = { status: 'unavailable', added: null, removed: null, retained: null, rankChanges: null,
    reasons: [{ side, code: 'full-query-output-unavailable' }] };
  return same(row.candidates, { status: 'unavailable', strict: unavailable, possible: unavailable });
}

function historicalMembership(row, baseline, mapped, namespace) {
  if (row.candidates?.status !== 'exact') return false;
  return ['strict', 'possible'].every(category => {
    const delta = row.candidates[category];
    if (delta?.status !== 'exact' || !Array.isArray(delta.added) || !Array.isArray(delta.removed)) return false;
    if (baseline) return delta.added.length === 0 && delta.removed.length === 0;
    return [...delta.added, ...delta.removed].every(wrapper => closed(wrapper, ['ref'])
      && validRef(wrapper.ref, namespace) && mapped.has(refKey(wrapper.ref)));
  });
}

/**
 * Fixed internal composition only: core is the fresh successful same-pair owner
 * result, never a decoded/retained/public caller report. These checks establish
 * consistency, not provenance of that ordinary mutable object. The final owner
 * independently requires P8 selected-file, sibling and assignment-event preservation.
 * Context construction/binding/hashing are separate replay-phase work; recipe
 * limits are not global memory/CPU limits or the earlier core governance budget.
 */
export function compareSubjectSplitReplays(input) {
  const result = { version: 1, kind: 'subject-split-replay', status: 'refused',
    policy: { id: policy.id, version: 1, digest: canonicalSha256(policy) },
    scope: { stores: [], originalSubjects: [], source: null, successors: [], mappedRefs: [], outsideCanonical: null },
    subjects: [], inventory: null, inventoryDigest: null, comparison: null, assessments: [],
    coverage: { subjectsComplete: false, unassessedSubjectIds: [], reservationComplete: false,
      historicalComplete: false, sourceRefusalsComplete: false, successorUnaryComplete: false, introducedPairsComplete: false },
    resources: { limits: null, queryBudgets: null,
      eligibility: { calls: 0, returnedCalls: 0, unreportedCalls: 0, used: { redirects: 0 } },
      inventory: { historicalCases: null, sourceRefusalCases: null, successorUnaryCases: null, introducedPairCases: null,
        requiredCases: null, requiredQueryCalls: null, bytes: null } }, diagnostics: [] };
  const fail = (code, message, details = {}) => { result.diagnostics.push({ code, message, ...details }); return result; };
  if (!closed(input, ['version', 'before', 'after', 'core', 'limits', 'queryBudgets']) || input.version !== 1
    || !['before', 'after'].every(side => closed(input[side], ['capturedInputRef', 'context'])
      && typeof input[side].capturedInputRef === 'string' && input[side].capturedInputRef.trim() && input[side].context)
    || !validLimits(input.limits, recipeKeys) || !validLimits(input.queryBudgets, queryKeys)
    || input.queryBudgets.maxAstNodes < 1 || input.queryBudgets.maxAstDepth < 1) {
    return fail('invalid-split-replay-input', 'Supply the fixed internal same-pair core, actual contexts and explicit recipe/query limits.');
  }
  try {
    const { core } = input;
    if (core?.ok !== true || core.operation?.action !== 'split' || core.authoredReferenceClosure?.status !== 'complete'
      || !core.inputs?.before || !core.inputs?.candidate || !core.inventory?.inputs || !core.allocation) {
      return fail('split-replay-core-unavailable', 'The fixed owner must supply its completed actual split core and inventory.');
    }
    const registries = {};
    for (const [side, name] of [['before', 'before'], ['after', 'candidate']]) {
      const { context } = input[side];
      const binding = validateSubjectGovernanceCapture(context.subjectGovernance, { model: context.model });
      if (!binding.ok) return fail('split-replay-context-mismatch', 'Replay requires actual governance/model binding.', { side, diagnostics: binding.diagnostics });
      const captured = core.inventory.inputs[name];
      if (input[side].capturedInputRef !== canonicalSha256(core.inputs[name]) || !captured
        || !['commit', 'tree', 'kitPath'].every(key => captured[key] === core.inputs[name][key])
        || captured.namespace !== context.model.identity.namespace
        || captured.registryDigest !== canonicalSha256(context.model.subjectRegistry.document)
        || captured.identityDigest !== canonicalSha256(context.model.identity)) {
        return fail('split-replay-capture-mismatch', 'Actual contexts must agree with the same core descriptors and inventory digests.', { side });
      }
      registries[side] = getGovernedSubjectRegistry(context.subjectGovernance);
    }
    const namespace = registries.before.namespace;
    if (namespace !== registries.after.namespace) return fail('namespace-mismatch', 'Both actual captures must share one namespace.');
    const { subject: source, successors } = core.operation;
    const refs = core.authoredReferenceClosure.affectedRefs;
    if (!sid(source) || !Array.isArray(successors) || successors.length < 2 || !successors.every(sid)
      || new Set(successors).size !== successors.length || successors.includes(source)
      || !same(successors, [...successors].sort(order)) || !same(core.allocation.allocatedIds, successors)
      || !uniqueRefs(refs, namespace) || !Array.isArray(core.assignments) || !Array.isArray(core.operation.mappings)) {
      return fail('split-replay-scope-mismatch', 'Source, native allocation order and complete canonical mapped scope must agree.');
    }
    const assignmentRefs = core.assignments.map(row => row?.ref); const mappingRefs = core.operation.mappings.map(row => row?.ref);
    if (!uniqueRefs(assignmentRefs, namespace) || !uniqueRefs(mappingRefs, namespace)
      || !same(refSet(refs), refSet(assignmentRefs)) || !same(refSet(refs), refSet(mappingRefs))) {
      return fail('split-replay-scope-mismatch', 'The independently proven affected set must exactly match assignments and submitted mapping references.');
    }
    result.status = 'incomplete'; result.resources.limits = { ...input.limits }; result.resources.queryBudgets = { ...input.queryBudgets };
    const originals = [...registries.before.subjects.keys()].sort(order);
    const ids = [...new Set([...originals, ...successors])].sort(order);
    Object.assign(result.scope, { source, originalSubjects: originals, successors: [...successors], mappedRefs: structuredClone(refs),
      outsideCanonical: Object.fromEntries(['before', 'after'].map(side => [side, [...registries[side].proposals.keys()].sort(order)])) });
    result.coverage.unassessedSubjectIds = [...ids];
    if (ids.length > input.limits.maxSubjects) return fail('split-replay-subject-budget', 'Reserve the entire original plus fresh Subject universe before eligibility.');
    if (!originals.includes(source) || successors.some(id => registries.before.subjects.has(id))
      || !same([...registries.after.subjects.keys()].sort(order), ids)) {
      return fail('split-replay-subject-set-mismatch', 'Candidate canonical Subjects must be exactly all originals plus the absent-before allocated successors.');
    }
    const stores = policy.stores.filter(name => ['before', 'after'].some(side => input[side].context.model.stores[name]?.present === true));
    result.scope.stores = stores;
    if (!stores.length || stores.some(name => ['before', 'after'].some(side => input[side].context.model.stores[name]?.present !== true))) {
      return fail('split-replay-store-unavailable', 'Every store present on either side must be present on both sides.');
    }
    const usage = result.resources.eligibility;
    const eligibility = (id, side, selected) => {
      usage.calls += 1;
      try {
        const outcome = subjectEligibility(input[side].context.subjectGovernance, id, { purpose: 'query', policy: selected,
          budget: { redirects: input.limits.maxEligibilityRedirects - usage.used.redirects } });
        usage.returnedCalls += 1; usage.used.redirects += outcome.resolution.redirects.length;
        return outcome;
      } catch (error) {
        if (!(error instanceof SubjectError)) throw error;
        usage.unreportedCalls += 1;
        fail('split-replay-eligibility-unavailable', 'An eligibility failure cannot shrink the required operand universe.', { id, side, ownerCode: error.code });
        return null;
      }
    };
    for (const id of ids) {
      const fresh = successors.includes(id);
      const row = { id, kind: fresh ? 'fresh' : 'original', before: fresh ? { status: 'absent' } : {}, after: {}, disposition: 'blocked' };
      result.subjects.push(row);
      const selectedPolicies = fresh ? policy.successorPolicies : ['historical', ...(id === source ? policy.refusalPolicies : [])];
      let passed = true;
      for (const selected of selectedPolicies) {
        if (!fresh) {
          row.before[selected] = eligibility(id, 'before', selected);
          if (!row.before[selected]) return result;
          passed = verified(id, row.before[selected], selected) && passed;
        }
        row.after[selected] = eligibility(id, 'after', selected);
        if (!row.after[selected]) return result;
        passed = (id === source && selected !== 'historical' ? splitRefusal(id, row.after[selected], selected, successors)
          : verified(id, row.after[selected], selected)) && passed;
      }
      if (passed) row.disposition = 'queryable';
      result.coverage.unassessedSubjectIds = ids.slice(result.subjects.length);
    }
    result.coverage.subjectsComplete = true;
    if (result.subjects.some(row => row.disposition === 'blocked')) {
      return fail('split-replay-eligibility-unavailable', 'All original/fresh operands and actual source alternatives must satisfy their separate contracts.');
    }
    const m = BigInt(stores.length); const n = BigInt(originals.length); const p = BigInt(Math.max(originals.length - 1, 0)); const s = BigInt(successors.length);
    const historical = 4n * m * (4n + 2n * n + 4n * p); const sourceCases = 16n * m;
    const unaryCases = 24n * m * s; const pairCases = 16n * m * (s + s - 1n); const count = historical + sourceCases + unaryCases + pairCases;
    if (count * 2n > BigInt(Number.MAX_SAFE_INTEGER)) return fail('split-replay-case-budget', 'The complete paired workload exceeds safe representation.');
    Object.assign(result.resources.inventory, { historicalCases: Number(historical), sourceRefusalCases: Number(sourceCases),
      successorUnaryCases: Number(unaryCases), introducedPairCases: Number(pairCases), requiredCases: Number(count), requiredQueryCalls: Number(count * 2n) });
    if (count > BigInt(input.limits.maxCases)) return fail('split-replay-case-budget', 'All four classes must fit before any query executes.');
    result.inventory = buildInventory(result.scope, input.queryBudgets);
    result.inventoryDigest = canonicalSha256(result.inventory); result.resources.inventory.bytes = canonicalJsonBytes(result.inventory).length;
    result.assessments = result.inventory.cases.map(({ id }) => ({ id, kind: id.split('/')[0], status: 'not-performed', diagnostics: [] }));
    result.comparison = compareSubjectReplays({ version: 1, before: input.before, after: input.after, inventory: result.inventory,
      limits: { version: 1, maxCases: input.limits.maxCases, maxInventoryBytes: input.limits.maxInventoryBytes } });
    result.coverage.reservationComplete = result.comparison.coverage?.reservationComplete === true;
    if (!result.coverage.reservationComplete) return fail('split-replay-reservation-incomplete', 'The one complete combined inventory must fit before queries execute.');
    const actual = new Map((result.comparison.cases ?? []).map(row => [row.id, row]));
    const mapped = new Set(refs.map(refKey));
    for (const [index, assessment] of result.assessments.entries()) {
      const row = actual.get(assessment.id); const entry = result.inventory.cases[index];
      let passed = false;
      if (row && same(row.specification, entry)) {
        if (assessment.kind === 'historical') passed = historicalMembership(row, policy.baseline.includes(assessment.id.split('/').at(-1)), mapped, namespace);
        else {
          const sourceProbe = assessment.kind === 'source-refusal';
          passed = expectedRefusal(row, sourceProbe ? 'after' : 'before', sourceProbe ? 'subject-split' : 'unknown-subject',
            refusalPath(entry.query.where, new Set(sourceProbe ? [source] : successors)));
        }
      }
      assessment.status = passed ? 'passed' : 'failed';
      if (!passed) assessment.diagnostics.push({ code: 'split-replay-case-failed', message: 'Actual paired output did not establish this fixed split requirement.' });
    }
    for (const [kind, field] of [['historical', 'historicalComplete'], ['source-refusal', 'sourceRefusalsComplete'],
      ['successor-unary', 'successorUnaryComplete'], ['introduced-pair', 'introducedPairsComplete']]) {
      result.coverage[field] = result.assessments.filter(row => row.kind === kind).every(row => row.status === 'passed');
    }
    if (actual.size !== result.inventory.cases.length || result.comparison.cases.length !== actual.size
      || result.assessments.some(row => row.status !== 'passed')) {
      return fail('split-replay-assessment-incomplete', 'Every historical membership comparison and expected preparation refusal must meet the fixed recipe.');
    }
    result.status = 'complete'; return result;
  } catch (error) {
    if (!(error instanceof CapturedInputError)) throw error;
    result.status = 'refused'; return fail(error.code, error.message);
  }
}
