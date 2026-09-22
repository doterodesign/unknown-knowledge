/** Bounded one-step context counts over actual captured query inputs. */
import { querySubjects, selectSubjectQueryRecords, validateSubjectPredicate } from './subject-query.js';
import { validateAssignments } from './assignment-validation.js';
import { getGovernedSubjectRegistry } from './subject-governance.js';
import { subjectAncestors } from './subjects.js';
import { canonicalSha256 } from './canonical-json.js';
import { assertSubjectOperationContext, assertSubjectOperation, getSubjectOperationResources,
  guardSubjectOperationDocument } from './subject-operation.js';

const fields = ['maxRecords', 'maxAssignments', 'maxHierarchyNodes', 'maxHierarchyEdges', 'maxRedirects', 'maxContexts'];
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const refuse = (diagnostics, extra = {}) => ({ status: 'refused', contexts: null, diagnostics, ...extra });
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const identityKey = (row) => {
  const ref = row.ref ?? row.proposalRef;
  return [ref.namespace, ref.kind, row.ref ? 'record' : 'proposal', ref.id ?? ref.key].join(':');
};

/**
 * Enumerate assigned IDs (plus real ancestors in descendant mode), then count
 * one extra assigned atom per candidate through P4. Query budgets apply to each
 * call; enumeration has separate limits. Report their observed sum separately
 * from the optional cumulative host-operation allowance.
 * Candidate IDs come from the selected assignment universe, not a result page.
 * A zero count is retained as zero; it does not assert observed co-assignment.
 */
export function countSubjectContexts(context, query, options) {
  const operation = options?.operation;
  assertSubjectOperationContext(operation, context);
  if (operation !== undefined) {
    guardSubjectOperationDocument(operation, query, 'context-query');
    guardSubjectOperationDocument(operation, options.budgets, 'context-limits');
  }
  try { return countContexts(context, query, options, operation); }
  finally { if (operation !== undefined) assertSubjectOperation(operation); }
}

function countContexts(context, query, options, operation) {
  const limits = options?.budgets;
  if (!object(options) || Object.keys(options).some((key) => !['budgets', 'operation'].includes(key))
    || !object(limits) || limits.version !== 1
    || Object.keys(limits).some((key) => !['version', ...fields].includes(key))
    || fields.some((key) => !Number.isSafeInteger(limits[key]) || limits[key] < 0)) {
    return refuse([{ code: 'invalid-context-options', path: '/budgets', message: 'Supply explicit version 1 context enumeration and count-call limits.' }]);
  }
  const operationBudget = operation === undefined ? undefined : getSubjectOperationResources(operation).subjectOperationBudget;
  const resources = { enumeration: { limits: { ...limits }, used: {
    records: 0, assignments: 0, hierarchyNodes: 0, hierarchyEdges: 0, redirects: 0,
  } }, queries: { budgetBasis: 'per-call', accountingBasis: 'returned-observed-counters',
    calls: 0, unreportedCalls: 0, used: {}, maxObservedAstDepth: 0 } };
  const count = (request) => {
    const result = querySubjects(context, request, { collect: 'counts', operation });
    resources.queries.calls += 1;
    if (!result.resources) resources.queries.unreportedCalls += 1;
    for (const [name, amount] of Object.entries(result.resources?.used ?? {})) {
      if (name === 'astDepth') resources.queries.maxObservedAstDepth = Math.max(resources.queries.maxObservedAstDepth, amount);
      else resources.queries.used[name] = (resources.queries.used[name] ?? 0) + amount;
    }
    return result;
  };
  const base = count(query);
  if (base.status === 'refused') return refuse(base.diagnostics, { base, resources });
  if (!base.query) return { status: 'incomplete', contexts: null, base, resources, diagnostics: base.diagnostics,
    coverage: { enumerationComplete: false, countsComplete: false, topContextsClaimed: false } };
  const effective = base.query;
  const registry = getGovernedSubjectRegistry(context.subjectGovernance, { operationBudget });
  const selection = selectSubjectQueryRecords(context.model, { stores: effective.stores, view: effective.view });
  const rows = [...selection.records, ...selection.proposals].sort((a, b) => compare(identityKey(a), identityKey(b)));
  const syntax = validateSubjectPredicate(effective.where, effective.budgets);
  const excluded = new Set(syntax.requirements.subjects);
  const candidates = new Set();
  const ancestry = new Map();
  const used = resources.enumeration.used;
  const diagnostics = [];
  let enumerationComplete = true;
  let unknownAssignments = 0;
  let validatedRecords = 0;
  const incomplete = (code) => {
    enumerationComplete = false;
    if (!diagnostics.some((item) => item.code === code)) diagnostics.push({ code });
  };
  for (const row of rows) {
    if (used.records === limits.maxRecords) { incomplete('context-record-budget'); break; }
    used.records += 1;
    if (operation !== undefined) guardSubjectOperationDocument(operation, row.entry.record, 'context-enumeration');
    const authored = row.entry.record.subjects;
    // Do not ask P3 to scan an array larger than the remaining enumeration cap.
    if (Array.isArray(authored) && authored.length > limits.maxAssignments - used.assignments) {
      incomplete('context-assignment-budget'); break;
    }
    used.assignments += Array.isArray(authored) ? authored.length : 0;
    const checked = validateAssignments(row, context.subjectGovernance, {
      purpose: 'query', policy: effective.subjectPolicy, ...(operationBudget ? { operationBudget } : {}), budget: { redirects: limits.maxRedirects - used.redirects },
    });
    used.redirects += checked.used.redirects;
    if (!checked.ok) {
      if (checked.diagnostics.every(({ code }) => code === 'redirect-budget')) {
        incomplete('context-redirect-budget'); break;
      }
      return refuse(checked.diagnostics, { base, resources });
    }
    validatedRecords += 1;
    if (checked.assignments.state === 'unknown') {
      unknownAssignments += 1;
      incomplete('context-unknown-assignments');
      continue;
    }
    for (const { originalId, outcome } of checked.subjects) {
      candidates.add(originalId);
      if (effective.expansion !== 'self-and-descendants') continue;
      const resolved = outcome.resolution.id;
      let path = ancestry.get(resolved);
      if (!path) {
        path = subjectAncestors(registry, resolved, { includeSelf: true, budget: {
          nodes: limits.maxHierarchyNodes - used.hierarchyNodes,
          edges: limits.maxHierarchyEdges - used.hierarchyEdges,
        } });
        used.hierarchyNodes += path.used.nodes;
        used.hierarchyEdges += path.used.edges;
        ancestry.set(resolved, path);
      }
      for (const id of path.ids) candidates.add(id);
      if (path.status !== 'complete') incomplete('context-hierarchy-budget');
    }
  }
  const subjects = [...candidates].filter((id) => !excluded.has(id)).sort(compare);
  const contexts = [];
  for (const subject of subjects.slice(0, limits.maxContexts)) {
    const result = count({ ...effective, where: { op: 'and', args: [effective.where, { op: 'assigned', subject }] } });
    if (result.status === 'refused') return refuse(result.diagnostics, { base, resources });
    contexts.push({ subject, ...result });
  }
  if (contexts.length < subjects.length) diagnostics.push({ code: 'context-count-budget' });
  const countsComplete = contexts.length === subjects.length && contexts.every(({ status }) => status === 'complete');
  const metadata = { version: 1, generator: 'subject-contexts-v1', baseFingerprint: base.input.fingerprint,
    options: { budgets: { ...limits } } };
  return { status: enumerationComplete && countsComplete && base.status === 'complete' ? 'complete' : 'incomplete',
    input: { ...metadata, fingerprint: canonicalSha256(metadata) }, base, contexts, resources, diagnostics,
    coverage: { enumerationComplete, countsComplete, unknownAssignments,
      selectedRecords: rows.length, unvisitedRecords: rows.length - used.records,
      validatedRecords, unvalidatedRecords: rows.length - validatedRecords,
      knownCandidates: subjects.length, countedCandidates: contexts.length,
      candidateBasis: 'selected-assignment-universe', candidateOrder: 'subject-id', topContextsClaimed: false } };
}
