/** Structural subject views consume shared ancestry; they do not certify approval. */
import { indexSubjects, subjectAncestors, SubjectError, SUBJECT_SCHEMA_VERSION, SUBJECT_NORMALIZER_VERSION } from './subjects.js';
import { compare } from './validate-record.js';
import { canonicalSha256 } from './canonical-json.js';

export const SUBJECT_VIEW_GENERATOR_VERSION = 1;
export const SUBJECT_VIEW_DIRECTORY = 'subjects/derived';

function pathOrder(a, b, subjects) {
  const left = a.route.subjects;
  const right = b.route.subjects;
  for (let i = 0; i < Math.min(left.length, right.length); i += 1) {
    const result = compare(subjects.get(left[i]).label, subjects.get(right[i]).label)
      || compare(left[i], right[i]);
    if (result) return result;
  }
  return left.length - right.length;
}

/** Renderable rows over a captured, indexed registry; lifecycle is declared only. */
export function projectSubjectTree(registry, options) {
  if (registry == null) throw new SubjectError('subjects-unavailable', 'The subject registry is unavailable.');
  if (registry.schemaVersion !== SUBJECT_SCHEMA_VERSION || registry.normalizerVersion !== SUBJECT_NORMALIZER_VERSION
    || !(registry.subjects instanceof Map) || !(registry.proposals instanceof Map)) {
    throw new SubjectError('invalid-subject-registry', 'Use a successfully indexed subject registry.');
  }
  const budget = options?.budget;
  if (!options || Object.keys(options).some((key) => key !== 'budget') || !budget
    || Object.keys(budget).some((key) => !['nodes', 'edges', 'rows'].includes(key))
    || !['nodes', 'edges', 'rows'].every((key) => Number.isSafeInteger(budget[key]) && budget[key] >= 0)) {
    throw new SubjectError('invalid-budget', 'Tree projection requires explicit nonnegative integer nodes, edges and rows budgets.');
  }
  const subjects = new Map([...registry.subjects, ...registry.proposals].sort(([a], [b]) => compare(a, b)));
  const used = { nodes: 0, edges: 0, rows: 0 };
  const rendered = new Map();
  const unresolved = [];
  let attempted = 0;
  for (const subject of subjects.values()) {
    if (rendered.size === budget.rows && !rendered.has(subject.id)) {
      unresolved.push({ id: subject.id, reason: 'row-budget' });
      break;
    }
    const ancestry = subjectAncestors(registry, subject.id, {
      budget: { nodes: budget.nodes - used.nodes, edges: budget.edges - used.edges },
    });
    attempted += 1;
    used.nodes += ancestry.used.nodes;
    used.edges += ancestry.used.edges;
    if (ancestry.status === 'incomplete') {
      unresolved.push({ id: subject.id, reason: ancestry.reason, partialSuffix: ancestry.ids });
      break;
    }
    // A complete path also warrants its ancestor prefixes. Emit those before a
    // child even when ID order visits that child first; never emit orphan rows.
    for (let i = 0; i < ancestry.ids.length; i += 1) {
      const id = ancestry.ids[i];
      if (rendered.has(id)) continue;
      if (rendered.size === budget.rows) {
        unresolved.push({ id: subject.id, reason: 'row-budget' });
        break;
      }
      const item = subjects.get(id);
      rendered.set(id, { id, label: item.label, definition: structuredClone(item.definition), status: item.status,
        route: { version: 1, kind: 'semantic-path', subjects: ancestry.ids.slice(0, i + 1) } });
    }
    if (unresolved.length) break;
  }
  const nodes = [...rendered.values()];
  used.rows = nodes.length;
  nodes.sort((a, b) => pathOrder(a, b, subjects));
  return {
    version: 1, kind: 'semantic-tree', status: unresolved.length ? 'incomplete' : 'complete',
    namespace: registry.namespace, lifecycleBasis: 'declared-all',
    versions: { generator: SUBJECT_VIEW_GENERATOR_VERSION, schema: registry.schemaVersion, normalizer: registry.normalizerVersion },
    revisions: { registry: registry.revision, hierarchy: registry.hierarchyRevision },
    nodes, unresolved,
    coverage: { total: subjects.size, attempted, rendered: nodes.length, unvisited: subjects.size - attempted },
    resources: { limits: { ...budget }, used },
  };
}

const markdownText = (value) => value.replace(/&/g, '&amp;')
  .replace(/[\\`*_{}\[\]<>()#|!]/g, '\\$&').replace(/[\r\n]+/g, ' ');

/** Output bytes and ancestry completion are separate, independently reported limits. */
export function renderSubjectTree(tree, options) {
  if (!options || Object.keys(options).some((key) => key !== 'maxBytes')
    || !Number.isSafeInteger(options.maxBytes) || options.maxBytes < 0) {
    throw new SubjectError('invalid-budget', 'Tree rendering requires an explicit nonnegative maxBytes budget.');
  }
  const result = { status: 'complete', projectionStatus: tree.status, text: '', renderedRows: 0, usedBytes: 0 };
  const append = (text) => {
    const bytes = Buffer.byteLength(text, 'utf8');
    if (result.usedBytes + bytes > options.maxBytes) {
      result.status = 'incomplete';
      result.reason = 'byte-budget';
      return false;
    }
    result.text += text;
    result.usedBytes += bytes;
    return true;
  };
  const header = '# Subject tree\n\nDerived structural view. Declared lifecycle; approval not checked.\n'
    + `Projection: ${tree.status}. Renderable subjects: ${tree.nodes.length}/${tree.coverage.total}.\n`
    + tree.unresolved.map(({ id, reason }) => `Unresolved: ${id} (${reason}).\n`).join('') + '\n';
  if (!append(header)) return result;
  for (const node of tree.nodes) {
    const line = `${'  '.repeat(node.route.subjects.length - 1)}- ${markdownText(node.label)} \`${node.id}\` [${node.status}]\n`;
    if (!append(line)) break;
    result.renderedRows += 1;
  }
  return result;
}

/**
 * Build files only for a complete registry-only view. This function performs no
 * filesystem writes; the eventual command must use the real authority reader.
 * maxBytes bounds tree.md including its fingerprint banner, not metadata.json.
 */
export function deriveSubjectTreeArtifacts(registry, options) {
  if (!options || Object.keys(options).some((key) => !['budget', 'maxBytes'].includes(key))) {
    throw new SubjectError('invalid-options', 'Tree artifacts accept explicit budget and maxBytes only.');
  }
  if (registry == null) throw new SubjectError('subjects-unavailable', 'The subject registry is unavailable.');
  // Public indexes are mutable Maps. Rebuild once from the authoritative captured
  // document through P2, then use that same fresh capture for projection and hash.
  const indexed = indexSubjects(registry.document);
  if (!indexed.ok) {
    const error = new SubjectError('invalid-subject-registry', 'The captured subject document cannot be indexed.');
    error.diagnostics = indexed.diagnostics;
    throw error;
  }
  const captured = indexed.registry;
  const tree = projectSubjectTree(captured, { budget: options.budget });
  // Validate the requested file budget before reserving the fingerprint banner.
  if (!Number.isSafeInteger(options.maxBytes) || options.maxBytes < 0) {
    throw new SubjectError('invalid-budget', 'Tree artifacts require a nonnegative maxBytes budget.');
  }
  const context = {
    version: 1, consistency: 'captured-model', namespace: captured.namespace, inputScope: 'registry-only',
    inputs: { registry: canonicalSha256(captured.document) },
    versions: { subjectSchema: captured.schemaVersion, normalizer: captured.normalizerVersion, generator: SUBJECT_VIEW_GENERATOR_VERSION },
    revisions: { registry: captured.revision, hierarchy: captured.hierarchyRevision },
    options: { budget: { ...options.budget }, maxBytes: options.maxBytes },
  };
  const fingerprint = canonicalSha256(context);
  const banner = `<!-- input-fingerprint: ${fingerprint} -->\n`;
  const bannerBytes = Buffer.byteLength(banner, 'utf8');
  const render = renderSubjectTree(tree, { maxBytes: Math.max(0, options.maxBytes - bannerBytes) });
  const complete = tree.status === 'complete' && render.status === 'complete' && bannerBytes <= options.maxBytes;
  const metadata = {
    ...context, fingerprint,
    completion: { projection: tree.status, render: render.status },
    coverage: tree.coverage,
    resources: { projection: tree.resources, render: { usedBytes: bannerBytes <= options.maxBytes ? bannerBytes + render.usedBytes : 0,
      renderedRows: render.renderedRows } },
    diagnostics: [...tree.unresolved, ...(render.reason ? [{ reason: render.reason }] : [])],
  };
  const artifacts = complete ? [
    { path: `${SUBJECT_VIEW_DIRECTORY}/tree.md`, text: banner + render.text },
    { path: `${SUBJECT_VIEW_DIRECTORY}/metadata.json`, text: `${JSON.stringify(metadata, null, 2)}\n` },
  ] : [];
  return { status: complete ? 'complete' : 'incomplete', metadata, artifacts };
}
