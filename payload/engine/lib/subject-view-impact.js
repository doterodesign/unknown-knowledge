/** Compare actual generated Subject tree artifacts without writing files. */
import { createHash } from 'node:crypto';
import { deriveSubjectTreeArtifacts } from './subject-views.js';
import { getGovernedSubjectRegistry, getSubjectGovernanceDescriptor, validateSubjectGovernanceCapture } from './subject-governance.js';
import { canonicalSha256, CapturedInputError } from './canonical-json.js';

const object = (value) => value !== null && typeof value === 'object'
  && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const closed = (value, required, optional = []) => object(value)
  && required.every((key) => Object.hasOwn(value, key))
  && Reflect.ownKeys(value).every((key) => [...required, ...optional].includes(key));
const text = (value) => typeof value === 'string' && value.trim().length > 0;
const integer = (value) => Number.isSafeInteger(value) && value >= 0;
const order = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const problem = (code, message) => ({ code, message });
const refuse = (diagnostics) => ({ version: 1, status: 'refused', views: null, diagnostics });

function validView(entry) {
  return closed(entry, ['id', 'kind', 'options']) && text(entry.id) && entry.kind === 'subject-tree'
    && closed(entry.options, ['budget', 'maxBytes']) && integer(entry.options.maxBytes)
    && closed(entry.options.budget, ['nodes', 'edges', 'rows'])
    && ['nodes', 'edges', 'rows'].every((key) => integer(entry.options.budget[key]));
}

function complete(result) {
  return result.status === 'complete' && result.metadata.completion.projection === 'complete'
    && result.metadata.completion.render === 'complete'
    && result.metadata.coverage.rendered === result.metadata.coverage.total
    && result.metadata.resources.render.renderedRows === result.metadata.coverage.rendered;
}

function artifactDelta(before, after, coverage) {
  const reasons = [
    ...(coverage !== 'complete' ? [problem('partial-view-inventory', 'The supplied inventory is partial.')] : []),
    ...Object.entries({ before, after }).filter(([, result]) => !complete(result))
      .map(([side]) => ({ side, code: 'complete-view-output-unavailable' })),
  ];
  if (reasons.length) return { status: 'unavailable', basis: 'artifact-path-and-bytes',
    added: null, removed: null, changed: null, unchanged: null, reasons };
  const old = new Map(before.artifacts.map((artifact) => [artifact.path, artifact]));
  const next = new Map(after.artifacts.map((artifact) => [artifact.path, artifact]));
  const delta = { status: 'exact', basis: 'artifact-path-and-bytes', added: [], removed: [], changed: [], unchanged: [] };
  const summary = (artifact) => artifact ? { sha256: artifact.sha256, byteLength: artifact.byteLength } : null;
  for (const path of [...new Set([...old.keys(), ...next.keys()])].sort(order)) {
    const a = old.get(path); const b = next.get(path);
    // Compare UTF-8 bytes themselves; hashes describe those bytes for consumers.
    const category = !a ? 'added' : !b ? 'removed'
      : Buffer.from(a.text, 'utf8').equals(Buffer.from(b.text, 'utf8')) ? 'unchanged' : 'changed';
    delta[category].push({ path, before: summary(a), after: summary(b) });
  }
  return delta;
}

/** P8 embeds this result unchanged; inventory requirements remain external. */
export function compareSubjectTreeViews(input) {
  try { return compareViews(input); }
  catch (error) {
    if (!(error instanceof CapturedInputError)) throw error;
    return refuse([problem(error.code, error.message)]);
  }
}

function compareViews(input) {
  if (!closed(input, ['version', 'before', 'after', 'limits'], ['inventory']) || input.version !== 1
    || !['before', 'after'].every((side) => closed(input[side], ['capturedInputRef', 'context'])
      && text(input[side].capturedInputRef) && object(input[side].context))
    || !closed(input.limits, ['version', 'maxViews']) || input.limits.version !== 1 || !integer(input.limits.maxViews)) {
    return refuse([problem('invalid-view-impact-input', 'Supply the closed version 1 before/after capture and limits envelope.')]);
  }
  if (input.inventory == null) return { version: 1, status: 'not-assessed', views: null, input: null,
    scope: { inventoryBasis: 'caller-supplied', declaredCoverage: null, deltaBasis: 'artifact-path-and-bytes' },
    coverage: { declaredInventoryCoverage: null, suppliedViews: null, assessedViews: 0,
      unassessedViewIds: null, artifactDeltasComplete: false },
    diagnostics: [problem('view-inventory-absent', 'No supplied view inventory was assessed.')] };
  const { inventory, limits } = input;
  if (!closed(inventory, ['version', 'coverage', 'views']) || inventory.version !== 1
    || !['complete', 'partial'].includes(inventory.coverage) || !Array.isArray(inventory.views)
    || !Array.from(inventory.views).every(validView) || new Set(inventory.views.map(({ id }) => id)).size !== inventory.views.length) {
    return refuse([problem('invalid-view-inventory', 'Supply unique caller IDs and closed subject-tree entries with explicit budgets.')]);
  }
  const ordered = [...inventory.views].sort((a, b) => order(a.id, b.id));
  const inventoryDigest = canonicalSha256({ ...inventory, views: ordered });
  const registries = {}; const captures = {};
  for (const side of ['before', 'after']) {
    const { context, capturedInputRef } = input[side];
    const binding = validateSubjectGovernanceCapture(context.subjectGovernance, { model: context.model });
    if (!binding.ok) return refuse(binding.diagnostics.map((diagnostic) => ({ ...diagnostic, side })));
    const registry = getGovernedSubjectRegistry(context.subjectGovernance);
    registries[side] = registry;
    captures[side] = { capturedInputRef, namespace: registry.namespace, registryDigest: canonicalSha256(registry.document),
      governanceDigest: canonicalSha256(getSubjectGovernanceDescriptor(context.subjectGovernance)),
      versions: { schema: registry.schemaVersion, normalizer: registry.normalizerVersion },
      revisions: { registry: registry.revision, hierarchy: registry.hierarchyRevision } };
  }
  if (captures.before.namespace !== captures.after.namespace) return refuse([
    problem('namespace-mismatch', 'View impact cannot compare different installations.')]);
  const resources = { limits: { ...limits }, derivations: { budgetBasis: 'per-call',
    accountingBasis: 'returned-observed-counters', calls: 0, unreportedCalls: 0,
    used: { projectionNodes: 0, projectionEdges: 0, projectionRows: 0, renderBytes: 0, renderedRows: 0 } }, artifactBytes: 0 };
  const derive = (side, entry) => {
    const result = deriveSubjectTreeArtifacts(registries[side], entry.options);
    const returned = result.metadata?.resources;
    const counters = { projectionNodes: returned?.projection?.used?.nodes, projectionEdges: returned?.projection?.used?.edges,
      projectionRows: returned?.projection?.used?.rows, renderBytes: returned?.render?.usedBytes,
      renderedRows: returned?.render?.renderedRows };
    resources.derivations.calls += 1;
    if (Object.values(counters).some((value) => !integer(value))) resources.derivations.unreportedCalls += 1;
    for (const [key, amount] of Object.entries(counters)) {
      const previous = resources.derivations.used[key];
      resources.derivations.used[key] = previous === null || !integer(amount) ? null : previous + amount;
    }
    return { ...result, artifacts: result.artifacts.map((artifact) => {
      const byteLength = Buffer.byteLength(artifact.text, 'utf8');
      resources.artifactBytes += byteLength;
      return { ...artifact, sha256: createHash('sha256').update(artifact.text, 'utf8').digest('hex'), byteLength };
    }) };
  };
  const views = ordered.slice(0, limits.maxViews).map((entry) => {
    const before = derive('before', entry); const after = derive('after', entry);
    return { id: entry.id, kind: entry.kind, specification: structuredClone(entry), before, after,
      delta: artifactDelta(before, after, inventory.coverage) };
  });
  const unassessedViewIds = ordered.slice(views.length).map(({ id }) => id);
  const artifactDeltasComplete = inventory.coverage === 'complete' && unassessedViewIds.length === 0
    && views.every(({ delta }) => delta.status === 'exact');
  const metadata = { version: 1, generator: 'subject-view-impact-v1', consistency: 'captured-model',
    inputScope: 'registry-governance-and-generated-views', ...captures, inventoryDigest, limits: { ...limits },
    derivations: views.map(({ id, before, after }) => ({ id,
      before: before.metadata.fingerprint, after: after.metadata.fingerprint })) };
  return { version: 1, status: artifactDeltasComplete ? 'complete' : 'incomplete',
    scope: { inventoryBasis: 'caller-supplied', declaredCoverage: inventory.coverage, deltaBasis: 'artifact-path-and-bytes' },
    input: { ...metadata, fingerprint: canonicalSha256(metadata) },
    coverage: { declaredInventoryCoverage: inventory.coverage, suppliedViews: ordered.length, assessedViews: views.length,
      unassessedViewIds, artifactDeltasComplete }, resources, views, diagnostics: [
      ...(inventory.coverage === 'partial' ? [problem('partial-view-inventory', 'Only the supplied partial inventory was assessed.')] : []),
      ...(unassessedViewIds.length ? [problem('view-impact-budget', 'Some supplied view pairs were not assessed.')] : []),
    ] };
}
