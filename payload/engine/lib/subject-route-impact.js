/** Compare an explicit caller-owned route inventory; no persistence or discovery. */
import { compileIntersectionRoute, executeIntersectionRoute } from './subject-routes.js';
import { compareSubjectQueryCandidates } from './subject-query-delta.js';
import { parseCanonicalId, parseProposalKey } from './record-identity.js';
import { subjectAncestors, SubjectError } from './subjects.js';
import { getGovernedSubjectRegistry, getSubjectGovernanceDescriptor, validateSubjectGovernanceCapture } from './subject-governance.js';
import { canonicalSha256, CapturedInputError } from './canonical-json.js';

const object = (value) => value !== null && typeof value === 'object'
  && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const closed = (value, required, optional = []) => object(value)
  && required.every((key) => Object.hasOwn(value, key))
  && Reflect.ownKeys(value).every((key) => [...required, ...optional].includes(key));
const text = (value) => typeof value === 'string' && value.trim().length > 0;
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const refuse = (diagnostics) => ({ version: 1, status: 'refused', routes: null, diagnostics });
const problem = (code, message) => ({ code, message });

function validEntry(entry) {
  const route = entry?.route;
  if (!text(entry?.id)) return false;
  if (route?.kind === 'intersection') {
    return closed(entry, ['id', 'route', 'queryOptions']) && object(entry.queryOptions)
      && !Object.hasOwn(entry.queryOptions, 'where') && compileIntersectionRoute(route).ok;
  }
  return closed(entry, ['id', 'route']) && closed(route, ['version', 'kind', 'subjects'])
    && route.version === 1 && route.kind === 'semantic-path' && Array.isArray(route.subjects)
    && route.subjects.length > 0 && new Set(route.subjects).size === route.subjects.length
    && Array.from(route.subjects).every((id) => parseCanonicalId('subject', id).ok || parseProposalKey('subject', id).ok);
}

function labels(registry, ids) {
  return ids.map((id) => {
    const subject = registry.subjects.get(id) ?? registry.proposals.get(id);
    return { subject: id, label: subject?.label ?? null, declaredStatus: subject?.status ?? null };
  });
}

function inspectPath(registry, route, limits, used) {
  const display = labels(registry, route.subjects);
  let traversal;
  try {
    traversal = subjectAncestors(registry, route.subjects.at(-1), { includeSelf: true, budget: {
      nodes: limits.maxPathNodes - used.nodes, edges: limits.maxPathEdges - used.edges,
    } });
  } catch (error) {
    if (!(error instanceof SubjectError) || error.code !== 'unknown-subject') throw error;
    return { kind: 'semantic-path', status: 'invalid', reason: error.code,
      actualPath: null, traversal: null, labels: display };
  }
  used.nodes += traversal.used.nodes;
  used.edges += traversal.used.edges;
  if (traversal.status !== 'complete') return { kind: 'semantic-path', status: 'incomplete',
    reason: traversal.reason, actualPath: null, traversal, labels: display };
  const valid = traversal.ids.length === route.subjects.length && traversal.ids.every((id, index) => id === route.subjects[index]);
  return { kind: 'semantic-path', status: valid ? 'valid' : 'invalid',
    ...(valid ? {} : { reason: 'semantic-path-mismatch' }), actualPath: traversal.ids, traversal, labels: display };
}

function displayDelta(before, after, semantic) {
  const changes = before.labels.flatMap((row, index) => row.label === after.labels[index].label ? []
    : [{ subject: row.subject, before: row.label, after: after.labels[index].label }]);
  let path = { status: 'not-applicable' };
  if (semantic) {
    const complete = before.status !== 'incomplete' && after.status !== 'incomplete';
    path = { status: complete ? 'exact' : 'unavailable', before: before.actualPath, after: after.actualPath,
      changed: complete ? canonicalSha256(before.actualPath) !== canonicalSha256(after.actualPath) : null };
  }
  return { labels: { status: 'exact', changes }, path };
}

/**
 * P8 may embed this unchanged result; required-inventory policy stays external.
 * Limits bound route pairs and shared path work, not envelope parsing/indexing.
 * Query budgets are per invocation. Observed side results never imply exact
 * deltas unless both full-result coverage contracts pass.
 */
export function compareSubjectRoutes(input) {
  try { return compareRoutes(input); }
  catch (error) {
    if (!(error instanceof CapturedInputError)) throw error;
    return refuse([problem(error.code, error.message)]);
  }
}

function compareRoutes(input) {
  if (!closed(input, ['version', 'before', 'after', 'limits'], ['inventory']) || input.version !== 1
    || !['before', 'after'].every((side) => closed(input[side], ['capturedInputRef', 'context'])
      && text(input[side].capturedInputRef) && object(input[side].context))
    || !closed(input.limits, ['version', 'maxRoutes', 'maxPathNodes', 'maxPathEdges']) || input.limits.version !== 1
    || !['maxRoutes', 'maxPathNodes', 'maxPathEdges'].every((key) => Number.isSafeInteger(input.limits[key]) && input.limits[key] >= 0)) {
    return refuse([problem('invalid-route-impact-input', 'Supply the closed version 1 before/after capture and limits envelope.')]);
  }
  const { inventory, limits } = input;
  if (inventory == null) return { version: 1, status: 'not-assessed', routes: null,
    scope: { inventoryBasis: 'caller-supplied', declaredCoverage: null }, input: null,
    coverage: { declaredInventoryCoverage: null, suppliedRoutes: null, assessedRoutes: 0,
      unassessedRouteIds: null, semanticPathsComplete: false, candidateDeltasComplete: false },
    regeneratedViews: { status: 'not-assessed' },
    diagnostics: [problem('route-inventory-absent', 'No supplied route inventory was assessed.')] };
  if (!closed(inventory, ['version', 'coverage', 'routes']) || inventory.version !== 1
    || !['complete', 'partial'].includes(inventory.coverage) || !Array.isArray(inventory.routes)
    || !Array.from(inventory.routes).every(validEntry) || new Set(inventory.routes.map(({ id }) => id)).size !== inventory.routes.length) {
    return refuse([problem('invalid-route-inventory', 'Supply unique caller IDs and closed, explicitly typed route entries.')]);
  }
  const ordered = [...inventory.routes].sort((a, b) => compare(a.id, b.id));
  const inventoryDigest = canonicalSha256({ ...inventory, routes: ordered });
  const registries = {}; const captured = {};
  for (const side of ['before', 'after']) {
    const { context, capturedInputRef } = input[side];
    const binding = validateSubjectGovernanceCapture(context.subjectGovernance, { model: context.model });
    if (!binding.ok) return refuse(binding.diagnostics.map((diagnostic) => ({ ...diagnostic, side })));
    const registry = getGovernedSubjectRegistry(context.subjectGovernance);
    registries[side] = registry;
    captured[side] = { capturedInputRef, namespace: registry.namespace,
      registryDigest: canonicalSha256(registry.document), governanceDigest: canonicalSha256(getSubjectGovernanceDescriptor(context.subjectGovernance)),
      versions: { schema: registry.schemaVersion, normalizer: registry.normalizerVersion },
      revisions: { registry: registry.revision, hierarchy: registry.hierarchyRevision } };
  }
  if (captured.before.namespace !== captured.after.namespace) return refuse([problem('namespace-mismatch', 'Route impact cannot compare different installations.')]);
  const resources = { limits: { ...limits }, paths: { used: { nodes: 0, edges: 0 } },
    queries: { budgetBasis: 'per-call', accountingBasis: 'returned-observed-counters', calls: 0, unreportedCalls: 0,
      used: {}, maxObservedAstDepth: 0 } };
  const execute = (side, entry) => {
    const execution = executeIntersectionRoute(input[side].context, entry.route, entry.queryOptions, { collect: 'results' });
    resources.queries.calls += 1;
    if (!execution.resources) resources.queries.unreportedCalls += 1;
    for (const [key, amount] of Object.entries(execution.resources?.used ?? {})) {
      if (key === 'astDepth') resources.queries.maxObservedAstDepth = Math.max(resources.queries.maxObservedAstDepth, amount);
      else resources.queries.used[key] = (resources.queries.used[key] ?? 0) + amount;
    }
    return { kind: 'intersection', execution, labels: labels(registries[side], entry.route.subjects) };
  };
  const routes = [];
  for (const entry of ordered.slice(0, limits.maxRoutes)) {
    const semantic = entry.route.kind === 'semantic-path';
    const before = semantic ? inspectPath(registries.before, entry.route, limits, resources.paths.used) : execute('before', entry);
    const after = semantic ? inspectPath(registries.after, entry.route, limits, resources.paths.used) : execute('after', entry);
    routes.push({ id: entry.id, kind: entry.route.kind, specification: structuredClone(entry), before, after,
      display: displayDelta(before, after, semantic), candidates: semantic ? { status: 'not-applicable' }
        : compareSubjectQueryCandidates({ before: before.execution, after: after.execution,
          possibleMatches: entry.queryOptions.possibleMatches === true }) });
  }
  const unassessed = ordered.slice(routes.length);
  const semanticPathsComplete = !unassessed.some(({ route }) => route.kind === 'semantic-path')
    && routes.filter(({ kind }) => kind === 'semantic-path').every(({ before, after }) => before.status !== 'incomplete' && after.status !== 'incomplete');
  const candidateDeltasComplete = !unassessed.some(({ route }) => route.kind === 'intersection')
    && routes.filter(({ kind }) => kind === 'intersection').every(({ candidates }) => candidates.status === 'exact');
  const coverage = { declaredInventoryCoverage: inventory.coverage, suppliedRoutes: ordered.length, assessedRoutes: routes.length,
    unassessedRouteIds: unassessed.map(({ id }) => id), semanticPathsComplete, candidateDeltasComplete };
  const metadata = { version: 1, generator: 'subject-route-impact-v1', consistency: 'captured-model',
    inputScope: 'registry-governance-and-executed-queries', ...captured, inventoryDigest, limits: { ...limits },
    replays: routes.filter(({ kind }) => kind === 'intersection').map(({ id, before, after }) => ({ id,
      before: before.execution.input?.fingerprint ?? null, after: after.execution.input?.fingerprint ?? null })) };
  return { version: 1, status: inventory.coverage === 'complete' && semanticPathsComplete && candidateDeltasComplete ? 'complete' : 'incomplete',
    scope: { inventoryBasis: 'caller-supplied', declaredCoverage: inventory.coverage, candidateBasis: 'selected-stores-and-view' },
    input: { ...metadata, fingerprint: canonicalSha256(metadata) }, coverage, resources, routes,
    regeneratedViews: { status: 'not-assessed' }, diagnostics: [
      ...(inventory.coverage === 'partial' ? [problem('partial-route-inventory', 'Only the supplied partial inventory was assessed.')] : []),
      ...(unassessed.length ? [problem('route-impact-budget', 'Some supplied route pairs were not assessed.')] : []),
    ] };
}
