/** Finite reconsideration recipe over actual operation-bound query outputs. */
import { isDeepStrictEqual as same } from 'node:util';
import { canonicalJsonBytes, canonicalSha256, CapturedInputError } from './canonical-json.js';
import { compareOperationSubjectReplays } from './subject-replay-impact.js';
import { compareSubjectQueryCandidates } from './subject-query-delta.js';
import { validateSubjectQuery } from './subject-query.js';
import { validateAssignments } from './assignment-validation.js';
import { readAssignments } from './subject-assignments.js';
import { recordLifecycleState } from './record-lifecycle.js';
import { subjectEligibility } from './subject-governance.js';
import { assertSubjectOperationContext, getSubjectOperationResources, SubjectOperationError } from './subject-operation.js';
import { SubjectError } from './subject-error.js';

const policy = { id: 'reconsideration-replay-v1', version: 1, views: ['current', 'all'],
  expansions: ['direct', 'self-and-descendants'], subjectPolicies: ['historical', 'current', 'equivalent'],
  ranking: { profile: 'id-v1' }, possibleMatches: true,
  baselines: ['all', 'none', 'subjects-present', 'not-subjects-present'],
  unary: ['assigned', 'not-assigned'], pairs: ['and', 'or', 'and-not-right', 'and-not-left'],
  originalPairs: 'adjacent-sorted-no-wrap', freshPairs: 'every-original',
  scope: 'finite-representative-queries-not-exhaustive-use-discovery' };
const storeKinds = { knowledge: 'knowledge', ontology: 'ontology', decisions: 'decision' };
const maps = { knowledge: 'leaves', ontology: 'concepts', decision: 'decisions' };
const fail = (code, message) => { throw new SubjectError(code, message); };
const need = (value, code, message) => { if (!value) fail(code, message); };
const assigned = subject => ({ op: 'assigned', subject });
const not = arg => ({ op: 'not', arg });
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const identity = row => canonicalSha256(row.ref ? { ref: row.ref } : { proposalRef: row.proposalRef });
const sets = (output, category) => Object.values(output.groups).flatMap(group => group[category]).map(identity).sort();
const complete = output => compareSubjectQueryCandidates({ before: output, after: output, possibleMatches: true }).status === 'exact';
const method = () => ({ attempted: 0, returned: 0, unreportedCalls: 0, usageReportedCalls: 0,
  usageUnreportedCalls: 0, reservedRedirects: 0, reportedUsedRedirects: 0 });
const resourceFailure = diagnostics => diagnostics.some(({ code }) => typeof code !== 'string'
  || /budget|exhaust|incomplete|truncat|limit|operation-|input-mismatch|unreported/.test(code));

function predicates(ids, fresh) {
  const rows = policy.baselines.map(name => ({ name, kind: 'original', where: name === 'not-subjects-present'
    ? not({ op: 'subjects-present' }) : { op: name } }));
  const unary = (id, kind) => {
    rows.push({ name: `assigned/${id}`, kind, where: assigned(id) },
      { name: `not-assigned/${id}`, kind, where: not(assigned(id)) });
  };
  const pair = (a, b, kind) => {
    const forms = [{ op: 'and', args: [assigned(a), assigned(b)] }, { op: 'or', args: [assigned(a), assigned(b)] },
      { op: 'and', args: [assigned(a), not(assigned(b))] }, { op: 'and', args: [assigned(b), not(assigned(a))] }];
    policy.pairs.forEach((form, index) => rows.push({ name: `${form}/${a}/${b}`, kind, original: b, form, where: forms[index] }));
  };
  for (const id of ids) unary(id, 'original');
  for (let index = 1; index < ids.length; index++) pair(ids[index - 1], ids[index], 'original');
  unary(fresh, 'fresh');
  for (const id of ids) pair(fresh, id, 'fresh-pair');
  return rows;
}

function buildInventory(ids, fresh, stores, queryBudgets) {
  const cases = [], definitions = new Map();
  for (const store of stores) for (const view of policy.views) for (const expansion of policy.expansions)
    for (const subjectPolicy of policy.subjectPolicies) {
      const cell = `${store}/${view}/${expansion}/${subjectPolicy}`;
      for (const predicate of predicates(ids, fresh)) {
        const id = `${cell}/${predicate.name}`;
        cases.push({ id, query: { version: 1, stores: [store], view, expansion, subjectPolicy,
          ranking: { ...policy.ranking }, possibleMatches: true, where: predicate.where, budgets: { ...queryBudgets } } });
        definitions.set(id, { ...predicate, cell });
      }
    }
  cases.sort((a, b) => compare(a.id, b.id));
  return { inventory: { version: 1, coverage: 'complete', cases }, definitions };
}

/** Native validation only. Reservations are not an observation of actual work. */
function qualificationCall(result, name, redirects, invoke) {
  const groups = result.resources.qualification, row = groups[name];
  const reserved = groups.preparation.reservedRedirects + groups.rows.reservedRedirects;
  need(redirects <= result.resources.limits.maxQualificationRedirects - reserved,
    'reconsideration-qualification-budget', 'The next qualification call must reserve its complete redirect cap.');
  row.reservedRedirects += redirects;
  row.attempted++;
  try {
    const returned = invoke(); row.returned++;
    if (Number.isSafeInteger(returned.used?.redirects) && returned.used.redirects >= 0) {
      row.usageReportedCalls++; row.reportedUsedRedirects += returned.used.redirects;
    } else row.usageUnreportedCalls++;
    return returned;
  } finally { row.unreportedCalls = row.attempted - row.returned; }
}

function querySubjectAt(query, path) {
  if (typeof path !== 'string' || !path.startsWith('/where/') || !path.endsWith('/subject')) return null;
  let node = query;
  for (const key of path.slice(1).split('/')) node = node?.[key];
  return typeof node === 'string' ? node : null;
}

function qualify(raw, query, side, input, result, outcomes, owners, unknownLifecycles) {
  need(raw.groups === null && raw.counts === null, 'reconsideration-replay-refusal-shape',
    'A semantic refusal retains unavailable groups and counts, never invented empty results.');
  need(raw.diagnostics?.length > 0 && !resourceFailure(raw.diagnostics),
    'reconsideration-replay-resource', 'No resource or mixed resource refusal is an expected semantic result.');
  const { context, operation } = input[side];
  const budget = getSubjectOperationResources(operation).subjectOperationBudget;
  const prepared = qualificationCall(result, 'preparation', query.budgets.maxRedirects,
    () => validateSubjectQuery(query, context, { operation }));
  if (!prepared.ok) {
    need(!resourceFailure(prepared.diagnostics) && same(prepared.diagnostics, raw.diagnostics),
      'reconsideration-preparation-mismatch', 'Native preparation must reproduce the complete semantic refusal.');
    for (const diagnostic of prepared.diagnostics) {
      budget.charge('validationSteps', 1, 'reconsideration-preparation-qualification');
      if (diagnostic.code === 'unsupported-current-lifecycle') {
        need(query.view === 'current' && unknownLifecycles.get(diagnostic.message) === storeKinds[query.stores[0]],
        'reconsideration-lifecycle-qualification', 'The native refusal must name an actual preserved unknown lifecycle.');
      } else {
        const id = querySubjectAt(query, diagnostic.path);
        if (diagnostic.code === 'unknown-subject') {
          need(side === 'before' && id === input.core.operation.subject && !context.model.subjectRegistry.subjects.has(id),
            'reconsideration-unknown-qualification', 'Only actual fresh-before absence qualifies as the unknown operand.');
        } else {
          const outcome = outcomes.get(`${side}/${query.subjectPolicy}/${id}`);
          need(outcome && outcome.eligible !== true && outcome.code === diagnostic.code,
            'reconsideration-eligibility-qualification', 'The exact native operand must have the observed semantic outcome.');
        }
      }
    }
    return { phase: 'preparation', diagnostics: raw.diagnostics };
  }
  const first = raw.diagnostics[0], ref = first.ref ?? first.proposalRef;
  need(ref && raw.diagnostics.every(row => same(row.ref ?? row.proposalRef, ref) && row.file === first.file),
    'reconsideration-row-qualification', 'A post-preparation refusal must name exactly one qualified original owner.');
  budget.charge('validationSteps', 1, 'reconsideration-row-qualification-lookup');
  const protectedRow = owners.get(identity(first));
  need(protectedRow && ref.kind === storeKinds[query.stores[0]],
    'reconsideration-row-qualification', 'The refusing owner must belong to the actual preserved query store.');
  const entries = first.ref ? context.model[maps[ref.kind]] : context.model.proposals[ref.kind];
  const entry = entries.get(ref.id ?? ref.key);
  need(entry && entry.file === first.file, 'reconsideration-row-qualification', 'Native refusal file must equal the actual context owner.');
  const row = first.ref ? { ref, entry } : { proposalRef: ref, entry };
  // The native row API does not guard raw rows; this new owner guards its actual lookup.
  budget.guard(entry.record, 'reconsideration-row-qualification-record');
  budget.guard(ref, 'reconsideration-row-qualification-reference');
  need(same(readAssignments(entry), protectedRow.assignments) && same(recordLifecycleState(row), protectedRow.lifecycle),
    'reconsideration-row-qualification', 'Actual metadata must equal the core-preserved owner.');
  const checked = qualificationCall(result, 'rows', query.budgets.maxRedirects, () => validateAssignments(row, context.subjectGovernance,
    { purpose: 'query', policy: query.subjectPolicy, budget: { redirects: query.budgets.maxRedirects }, operationBudget: budget }));
  need(!checked.ok && !resourceFailure(checked.diagnostics) && same(checked.diagnostics, raw.diagnostics)
    && checked.diagnostics.every(diagnostic => checked.subjects.some(item => item.path === diagnostic.path
      && item.outcome.eligible !== true && item.outcome.code === diagnostic.code)),
  'reconsideration-row-qualification', 'Native row validation must reproduce every semantic diagnostic with actual outcomes.');
  return { phase: 'row', diagnostics: checked.diagnostics };
}

function compareMembership(a, b) {
  return complete(a) && complete(b) && ['strict', 'possible'].every(category => same(sets(a, category), sets(b, category)));
}

/** Fixed internal call site; actual context binding, not a serialized-report authority API. */
export function compareSubjectReconsiderationReplays(input) { return compareReplays(input, false); }
export function compareSubjectCreationReplays(input) { return compareReplays(input, true); }
function compareReplays(input, ordinary) {
  const activePolicy = ordinary ? { ...policy, id: 'subject-creation-replay-v1' } : policy;
  const result = { version: 1, status: 'incomplete', policy: { id: activePolicy.id, version: 1, digest: canonicalSha256(activePolicy) },
    scope: null, subjects: [], inventory: null, inventoryDigest: null, comparison: null, cases: [],
    coverage: { assessmentComplete: false, membershipComplete: false, expectedRefusalsComplete: false },
    metamorphic: { requiredPairs: null, comparedPairs: 0, expectedRefusedPairs: 0, incompletePairs: 0 },
    resources: { limits: input.limits, queryBudgets: input.queryBudgets,
      eligibility: { attempted: 0, returned: 0, unreportedCalls: 0, reportedUsedRedirects: 0 },
      inventory: { requiredCases: null, bytes: null, maximumNativeCalls: null },
      qualification: { preparation: method(), rows: method() } }, diagnostics: [] };
  const finish = () => ({ ...result, fingerprint: canonicalSha256(result) });
  try {
    const { core, limits, queryBudgets } = input;
    for (const side of ['before', 'after']) assertSubjectOperationContext(input[side].operation, input[side].context);
    need(input.version === 1 && core.ok && core.assignments === null && core.ownerPreservation.status === 'passed',
      'reconsideration-replay-core', 'The actual zero-assignment core proof is required.');
    const before = input.before.context.model, after = input.after.context.model, fresh = core.operation.subject;
    for (const [side, model, digest] of [['before', before, core.allocation.proof.beforeIdentityDigest],
      ['after', after, core.allocation.proof.candidateIdentityDigest]]) {
      const budget = getSubjectOperationResources(input[side].operation).subjectOperationBudget;
      budget.guard(model.identity, 'reconsideration-replay-identity-binding');
      need(canonicalSha256(model.identity) === digest, 'reconsideration-replay-identity', 'Actual context identity must match the one native allocation proof.');
    }
    const ids = [...before.subjectRegistry.subjects.keys()].sort(), next = [...after.subjectRegistry.subjects.keys()].sort();
    need(!ids.includes(fresh) && same(next, [...ids, fresh].sort()), 'reconsideration-replay-subjects', 'The exact canonical population gains only the fresh Subject.');
    const stores = Object.keys(storeKinds).filter(store => before.stores[store]?.present);
    need(stores.length > 0 && Object.keys(storeKinds).every(store => Boolean(before.stores[store]?.present) === Boolean(after.stores[store]?.present)),
      'reconsideration-replay-stores', 'Every actual present store must participate on both sides.');
    result.scope = { stores, canonicalSubjects: ids, freshSubject: fresh, basis: policy.scope,
      outsideCanonical: { before: [...before.subjectRegistry.proposals.keys()].sort(), after: [...after.subjectRegistry.proposals.keys()].sort() } };
    need(ids.length + 1 <= limits.maxSubjects, 'reconsideration-replay-subject-budget', 'All original operands and the fresh operand must fit before eligibility.');
    const n = BigInt(ids.length), m = BigInt(stores.length), count = 12n * m * (6n + 6n * n + 4n * (n > 0n ? n - 1n : 0n));
    const maximumNativeCalls = 6n * count + 6n * n + 3n;
    need(maximumNativeCalls <= BigInt(Number.MAX_SAFE_INTEGER), 'reconsideration-replay-case-budget', 'All derived call counts require safe representation.');
    result.resources.inventory.requiredCases = Number(count);
    result.resources.inventory.maximumNativeCalls = Number(maximumNativeCalls);
    result.metamorphic.requiredPairs = 48 * stores.length * ids.length;
    result.metamorphic.incompletePairs = result.metamorphic.requiredPairs;
    need(count <= BigInt(limits.maxCases), 'reconsideration-replay-case-budget', 'The entire fixed inventory must fit; no pruning.');
    const { inventory, definitions } = buildInventory(ids, fresh, stores, queryBudgets);
    result.resources.inventory.bytes = canonicalJsonBytes(inventory).length;
    need(result.resources.inventory.bytes <= limits.maxInventoryBytes, 'reconsideration-replay-inventory-budget', 'The complete inventory bytes must fit.');
    result.inventory = inventory; result.inventoryDigest = canonicalSha256(inventory);
    const outcomes = new Map(), usage = result.resources.eligibility;
    for (const id of [...ids, fresh]) for (const side of id === fresh ? ['after'] : ['before', 'after']) {
      for (const subjectPolicy of policy.subjectPolicies) {
        const operationBudget = getSubjectOperationResources(input[side].operation).subjectOperationBudget;
        usage.attempted++;
        let outcome;
        try {
          outcome = subjectEligibility(input[side].context.subjectGovernance, id, { purpose: 'query', policy: subjectPolicy,
            budget: { redirects: limits.maxEligibilityRedirects - usage.reportedUsedRedirects }, operationBudget });
          usage.returned++; usage.reportedUsedRedirects += outcome.resolution.redirects.length;
        } finally { usage.unreportedCalls = usage.attempted - usage.returned; }
        need(!resourceFailure([{ code: outcome.code ?? 'eligible' }]), 'reconsideration-replay-eligibility-resource', 'Eligibility resource refusal cannot qualify semantics.');
        need(id !== fresh || (outcome.eligible === true && outcome.verification === 'verified'),
          'reconsideration-replay-fresh-eligibility', 'The fresh Subject must be verified eligible under every policy.');
        outcomes.set(`${side}/${subjectPolicy}/${id}`, outcome);
        result.subjects.push({ id, side, policy: subjectPolicy, outcome });
      }
    }
    const owners = new Map(), unknownLifecycles = new Map();
    const ownerBudget = getSubjectOperationResources(input.before.operation).subjectOperationBudget;
    ownerBudget.charge('validationSteps', core.ownerPreservation.records.length, 'reconsideration-replay-owner-inventory');
    for (const row of core.ownerPreservation.records) {
      ownerBudget.guard({ reference: row.ref ?? row.proposalRef, assignments: row.assignments, lifecycle: row.lifecycle },
        'reconsideration-replay-owner-metadata');
      owners.set(identity(row), row);
      if (row.ref && row.lifecycle.state === 'unknown')
        unknownLifecycles.set(`Current view has no lifecycle rule for ${row.ref.kind} ${row.ref.id}.`, row.ref.kind);
    }
    result.comparison = compareOperationSubjectReplays({ version: 1, before: input.before, after: input.after, inventory,
      limits: { version: 1, maxCases: limits.maxCases, maxInventoryBytes: limits.maxInventoryBytes } });
    need(result.comparison.coverage?.reservationComplete
      && result.comparison.coverage.assessedCases === inventory.cases.length
      && Array.isArray(result.comparison.cases) && result.comparison.cases.length === inventory.cases.length
      && result.comparison.cases.every((row, index) => row && row.before && row.after
        && row.id === inventory.cases[index].id && same(row.specification, inventory.cases[index])),
      'reconsideration-replay-execution', 'All actual raw query pairs must be returned.');
    const returned = new Map(result.comparison.cases.map(row => [row.id, row]));
    for (const row of result.comparison.cases) {
      const definition = definitions.get(row.id), query = row.specification.query, qualification = {};
      for (const side of ['before', 'after']) {
        const raw = row[side];
        if (raw.status === 'refused') qualification[side] = qualify(raw, query, side, input, result, outcomes, owners, unknownLifecycles);
        else need(complete(raw) && !resourceFailure(raw.diagnostics ?? []),
          'reconsideration-replay-incomplete', 'A truncated or incomplete query never proves a negative.');
      }
      if (definition.kind === 'original' && complete(row.before) && complete(row.after)) {
        need(row.candidates.status === 'exact' && ['strict', 'possible'].every(category => !row.candidates[category].added.length && !row.candidates[category].removed.length),
          'reconsideration-replay-original-delta', 'Original predicates must preserve canonical and proposal membership; raw ranks remain retained.');
      }
      if (definition.kind === 'original') need((complete(row.before) && complete(row.after))
        || (row.before.status === 'refused' && row.after.status === 'refused'),
      'reconsideration-replay-refusal-delta', 'Original predicate availability must remain symmetric.');
      if (definition.kind !== 'original') need(row.before.status === 'refused',
        'reconsideration-replay-fresh-before', 'Every fresh operand must retain its actual before-side preparation refusal, including negation.');
      if (definition.kind === 'original' && row.before.status === 'refused' && row.after.status === 'refused')
        need(same(row.before.diagnostics, row.after.diagnostics), 'reconsideration-replay-refusal-delta', 'Unchanged original semantics must retain exact refusals.');
      const cellOutput = name => returned.get(`${definition.cell}/${name}`)?.after;
      if (definition.kind !== 'original' && complete(row.after)) {
        const f = cellOutput(`assigned/${fresh}`), nf = cellOutput(`not-assigned/${fresh}`), present = cellOutput('subjects-present'), absent = cellOutput('not-subjects-present');
        need([f, nf, present, absent].every(output => output && complete(output))
          && !sets(present, 'possible').length && !sets(absent, 'possible').length
          && !sets(f, 'strict').length && same(sets(f, 'possible'), sets(absent, 'strict'))
          && same(sets(nf, 'strict'), sets(present, 'strict')) && same(sets(nf, 'possible'), sets(absent, 'strict')),
        'reconsideration-replay-fresh-metadata', 'Native fresh unary membership must preserve known versus absent assignment metadata.');
        if (definition.kind === 'fresh-pair') {
          const expected = ['and', 'and-not-right'].includes(definition.form) ? f : cellOutput(`assigned/${definition.original}`);
          need(expected && compareMembership(row.after, expected), 'reconsideration-replay-metamorphic', 'Fresh Boolean membership must equal its already generated native unary baseline.');
          result.metamorphic.comparedPairs++; result.metamorphic.incompletePairs--;
        }
      } else if (definition.kind === 'fresh-pair' && row.after.status === 'refused') {
        result.metamorphic.expectedRefusedPairs++; result.metamorphic.incompletePairs--;
      }
      result.cases.push({ id: row.id, disposition: Object.keys(qualification).length ? 'expected-semantic-refusal' : 'exact-membership', qualification });
    }
    result.coverage = { assessmentComplete: true, membershipComplete: result.cases.every(row => row.disposition === 'exact-membership'), expectedRefusalsComplete: true };
    result.status = 'complete';
  } catch (error) {
    if (!(error instanceof SubjectError || error instanceof SubjectOperationError || error instanceof CapturedInputError)) throw error;
    result.diagnostics.push({ code: error.code, message: error.message });
  }
  return finish();
}
