/** Pure subject lookup and semantic forest primitives (UCS-1235). */
import { compare } from './validate-record.js';
import { parentEdgeProblem, associationEdgeProblem, associationPair } from './subject-graph-rules.js';
import { parseCanonicalId, parseProposalKey } from './record-identity.js';
import { SubjectError } from './subject-error.js';
import { getSubjectValidationBudget } from './subject-validation-budget.js';
export { SubjectError } from './subject-error.js';

/** @typedef {{label: string, locale?: string, context?: string}} SubjectAlias */
/** @typedef {{text: string, includes: string[], excludes: string[]}} SubjectDefinition */
/**
 * @typedef {object} Subject
 * @property {string} id Canonical subject ID or unpublished subject proposal key.
 * @property {string} label
 * @property {SubjectDefinition} definition
 * @property {SubjectAlias[]} aliases
 * @property {string} [parent]
 * @property {Array<{type: 'association', target: string}>} related
 * @property {'proposed'|'active'|'suppressed'|'retired'} status Declared, not certified approval.
 */
/**
 * @typedef {{schemaVersion: number, namespace: string, revision: number,
 * hierarchyRevision: number, subjects: Subject[]}} SubjectRegistryInput
 */
/** @typedef {{code: string, path: string, message: string}} SubjectDiagnostic */
/**
 * @typedef {object} SubjectRegistry
 * @property {Readonly<SubjectRegistryInput>} document Complete immutable captured input, including governance fields.
 * @property {number} schemaVersion
 * @property {number} normalizerVersion
 * @property {string} namespace
 * @property {number} revision
 * @property {number} hierarchyRevision
 * @property {ReadonlyMap<string, Readonly<Subject>>} subjects
 * @property {ReadonlyMap<string, Readonly<Subject>>} proposals
 * @property {ReadonlyMap<string, string>} parents
 * @property {ReadonlyMap<string, string[]>} children
 * @property {ReadonlyMap<string, Array<{id: string, source: string, target: string}>>} related
 * @property {ReadonlyMap<string, Array<{id: string, match: SubjectAlias & {kind: 'label'|'alias'}}>>} labels
 */
/** @typedef {{includeSelf?: boolean, budget: {nodes: number, edges: number}}} SubjectTraversalOptions */
/** @typedef {{status: 'complete'|'incomplete', ids: string[], used: {nodes: number, edges: number}, reason?: string}} SubjectTraversal */

export const SUBJECT_NORMALIZER_VERSION = 1;
export const SUBJECT_SCHEMA_VERSION = 1;

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const hasText = (value) => typeof value === 'string' && normalizeSubjectLabel(value) !== '';


/**
 * Normalize labels only; exact subject identities never use this function.
 * @param {string} label
 * @returns {string}
 */
export function normalizeSubjectLabel(label) {
  if (typeof label !== 'string') throw new SubjectError('invalid-label', 'A subject label must be text.');
  return label.normalize('NFC').replace(/\p{White_Space}+/gu, ' ')
    .replace(/^ | $/g, '').toLowerCase();
}

function assertRegistry(registry) {
  if (registry == null) throw new SubjectError('subjects-unavailable', 'The subject registry is unavailable.');
  if (registry.schemaVersion !== SUBJECT_SCHEMA_VERSION || registry.normalizerVersion !== SUBJECT_NORMALIZER_VERSION
    || !['subjects', 'proposals', 'parents', 'children', 'labels', 'related'].every((key) => registry[key] instanceof Map)) {
    throw new SubjectError('invalid-subject-registry', 'Use a successfully indexed subject registry.');
  }
}

function shapeProblems(subject, path) {
  const definition = subject.definition;
  const definitionValid = isObject(definition) && hasText(definition.text)
    && ['includes', 'excludes'].every((key) => Array.isArray(definition[key]) && definition[key].every(hasText));
  const aliasesValid = Array.isArray(subject.aliases) && subject.aliases.every((alias) => isObject(alias)
    && hasText(alias.label) && Object.keys(alias).every((key) => ['label', 'locale', 'context'].includes(key))
    && ['locale', 'context'].every((key) => alias[key] === undefined || hasText(alias[key])));
  return [['label', hasText(subject.label)], ['definition', definitionValid], ['aliases', aliasesValid],
    ['related', Array.isArray(subject.related)]].filter(([, valid]) => !valid)
    .map(([field]) => ({ code: 'invalid-subject-shape', path: `${path}.${field}`,
      message: `Subject ${field} does not match the declared metadata shape.` }));
}

function captureDocument(input) {
  const document = structuredClone(input);
  const pending = [document];
  while (pending.length) {
    const value = pending.pop();
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) continue;
    for (const child of Object.values(value)) pending.push(child);
    Object.freeze(value);
  }
  return document;
}

function indexForest(subjects, paths, diagnostics) {
  const parents = new Map();
  const children = new Map([...subjects.keys()].map((id) => [id, []]));
  const report = (id, code, message) => diagnostics.push({ code, path: `${paths.get(id)}.parent`, message });
  for (const { id, parent } of subjects.values()) {
    if (parent === undefined) continue;
    const problem = parentEdgeProblem(id, parent, target => subjects.has(target));
    if (problem) report(id, ...problem);
    else {
      parents.set(id, parent);
      children.get(parent).push(id);
    }
  }
  const done = new Set();
  for (const start of subjects.keys()) {
    const path = [];
    const positions = new Map();
    let id = start;
    while (id !== undefined && !done.has(id)) {
      if (positions.has(id)) {
        const cycle = path.slice(positions.get(id));
        const first = [...cycle].sort(compare)[0];
        const pivot = cycle.indexOf(first);
        const ordered = [...cycle.slice(pivot), ...cycle.slice(0, pivot), first];
        report(first, 'parent-cycle', `Parent cycle: ${ordered.join(' -> ')}.`);
        break;
      }
      positions.set(id, path.length);
      path.push(id);
      id = parents.get(id);
    }
    for (const visited of path) done.add(visited);
  }
  return { parents, children };
}

function indexRelated(subjects, paths, diagnostics) {
  const related = new Map([...subjects.keys()].map((id) => [id, []]));
  const pairs = new Set();
  for (const { id: source, related: edges } of subjects.values()) {
    if (!Array.isArray(edges)) continue; // Metadata validation reports this shape.
    for (const [i, edge] of edges.entries()) {
      const report = (code, message) => diagnostics.push({ code,
        path: `${paths.get(source)}.related[${i}]`, message });
      const problem = associationEdgeProblem(source, edge, target => subjects.has(target));
      if (problem) { report(...problem); continue; }
      const { target } = edge;
      const pair = associationPair(source, target);
      if (pairs.has(pair)) {
        report('duplicate-related', 'An undirected association must have exactly one authored declaration.');
        continue;
      }
      pairs.add(pair);
      related.get(source).push({ id: target, source, target });
      related.get(target).push({ id: source, source, target });
    }
  }
  for (const neighbors of related.values()) neighbors.sort((a, b) => compare(a.id, b.id));
  return related;
}

/**
 * Index captured label metadata, the declared forest and one-hop associations.
 * This is neither full authority-file validation nor effective approval:
 * activation/history validation is composed separately before publication.
 * Namespace is supplied by the installation identity authority, never minted here.
 * @param {SubjectRegistryInput} input
 * @returns {{ok: boolean, registry: SubjectRegistry|null, diagnostics: SubjectDiagnostic[]}}
 */
export function indexSubjects(input) {
  if (!isObject(input) || input.schemaVersion !== SUBJECT_SCHEMA_VERSION || !hasText(input.namespace)
    || ![input.revision, input.hierarchyRevision].every((n) => Number.isSafeInteger(n) && n >= 0)
    || !Array.isArray(input.subjects)) {
    return { ok: false, registry: null, diagnostics: [{ code: 'invalid-subject-registry', path: '',
      message: 'A subject registry needs schemaVersion 1, namespace, nonnegative revisions and a subjects list.' }] };
  }
  const document = captureDocument(input);
  const entries = new Map();
  const paths = new Map();
  const diagnostics = [];
  for (const [i, subject] of document.subjects.entries()) {
    const canonical = parseCanonicalId('subject', subject?.id).ok;
    const proposal = parseProposalKey('subject', subject?.id).ok;
    const valid = subject?.status === 'proposed' ? proposal
      : subject?.status === 'suppressed' ? canonical || proposal
        : ['active', 'retired'].includes(subject?.status) && canonical;
    if (!valid) {
      diagnostics.push({ code: 'invalid-subject-id', path: `subjects[${i}].id`,
        message: 'Use an exact subject identity; unpublished proposals keep a subject proposal key.' });
      continue;
    }
    diagnostics.push(...shapeProblems(subject, `subjects[${i}]`));
    if (entries.has(subject.id)) {
      diagnostics.push({ code: 'duplicate-subject', path: `subjects[${i}].id`,
        message: `Subject ${subject.id} is declared more than once.` });
    } else {
      entries.set(subject.id, subject);
      paths.set(subject.id, `subjects[${i}]`);
    }
  }
  const ordered = new Map([...entries].sort(([a], [b]) => compare(a, b)));
  const subjects = new Map([...ordered].filter(([id]) => parseCanonicalId('subject', id).ok));
  const proposals = new Map([...ordered].filter(([id]) => parseProposalKey('subject', id).ok));
  const forest = indexForest(ordered, paths, diagnostics);
  const related = indexRelated(ordered, paths, diagnostics);
  if (diagnostics.length) {
    diagnostics.sort((a, b) => compare(a.path, b.path) || compare(a.code, b.code));
    return { ok: false, registry: null, diagnostics };
  }
  const labels = new Map();
  for (const subject of ordered.values()) {
    const names = [{ kind: 'label', label: subject.label },
      ...subject.aliases.map((alias) => ({ kind: 'alias', ...alias }))];
    for (const match of names) {
      const key = normalizeSubjectLabel(match.label);
      if (!labels.has(key)) labels.set(key, []);
      labels.get(key).push({ id: subject.id, match });
    }
  }
  return {
    ok: true,
    registry: { ...document, document, normalizerVersion: SUBJECT_NORMALIZER_VERSION,
      subjects, proposals, labels, related, ...forest },
    diagnostics: [],
  };
}

/**
 * Exact normalized lookup returns every meaning and its authored match.
 * All declared lifecycle states stay inspectable; no result grants approval.
 * @param {SubjectRegistry} registry
 * @param {string} text
 * @param {{locale?: string, context?: string}} [options]
 * @returns {{normalizerVersion: number, matches: Array<{id: string, label: string,
 * definition: SubjectDefinition, status: Subject['status'], matches: Array<SubjectAlias & {kind: 'label'|'alias'}>}>}}
 */
export function lookupSubjects(registry, text, options = {}) {
  assertRegistry(registry);
  const key = normalizeSubjectLabel(text);
  if (!key) throw new SubjectError('invalid-label', 'A lookup label must contain text.');
  if (!isObject(options) || Object.keys(options).some((scope) => !['locale', 'context'].includes(scope)
    || !hasText(options[scope]))) {
    throw new SubjectError('invalid-options', 'Lookup accepts optional nonblank locale and context only.');
  }
  const matches = new Map();
  for (const { id, match } of registry.labels.get(key) ?? []) {
    if (['locale', 'context'].some((scope) => options[scope] !== undefined
      && match[scope] !== undefined && options[scope] !== match[scope])) continue;
    if (!matches.has(id)) {
      const { label, definition, status } = registry.subjects.get(id) ?? registry.proposals.get(id);
      matches.set(id, { id, label, definition, status, matches: [] });
    }
    matches.get(id).matches.push({ ...match });
  }
  return { normalizerVersion: registry.normalizerVersion, matches: [...matches.values()] };
}

/**
 * Structural ancestry only; callers separately resolve lifecycle/approval.
 * IDs absent from an incomplete result have not been proven absent from the subtree.
 * @param {SubjectRegistry} registry
 * @param {string} id
 * @param {SubjectTraversalOptions} options
 * @returns {SubjectTraversal}
 */
export function subjectDescendants(registry, id, options) {
  return walkForest(registry, id, options, 'descendants');
}

/**
 * Return the root-to-self path only when complete; incomplete IDs are a suffix.
 * @param {SubjectRegistry} registry
 * @param {string} id
 * @param {SubjectTraversalOptions} options
 * @returns {SubjectTraversal}
 */
export function subjectAncestors(registry, id, options) {
  return walkForest(registry, id, options, 'ancestors');
}

/**
 * Inspect one-hop associations in this local capture, including proposal inverses.
 * Declared status is not approval. Associations transfer no ancestry or membership.
 * An incomplete neighbor prefix cannot establish absence of another association.
 * @param {SubjectRegistry} registry
 * @param {string} id Exact canonical subject ID or qualified subject proposal key.
 * @param {{budget: {edges: number}}} options Explicit adjacency visit allowance.
 */
export function subjectRelated(registry, id, options = {}) {
  assertRegistry(registry);
  if (!isObject(options) || Object.keys(options).some((key) => key !== 'budget')) {
    throw new SubjectError('invalid-options', 'Related navigation accepts an explicit edge budget only.');
  }
  if (!parseCanonicalId('subject', id).ok && !parseProposalKey('subject', id).ok) {
    throw new SubjectError('invalid-subject-id', 'Use an exact subject ID or proposal key.');
  }
  const subject = registry.subjects.get(id) ?? registry.proposals.get(id);
  if (!subject) throw new SubjectError('unknown-subject', `Subject ${id} is absent from the captured registry.`);
  const { budget } = options;
  if (!isObject(budget) || Object.keys(budget).length !== 1
    || !Number.isSafeInteger(budget.edges) || budget.edges < 0) {
    throw new SubjectError('invalid-budget', 'Related navigation requires a nonnegative integer edge budget.');
  }
  const describe = (entry) => ({ id: entry.id,
    identityKind: parseCanonicalId('subject', entry.id).ok ? 'canonical' : 'proposal', declaredStatus: entry.status });
  const neighbors = [];
  const ids = [];
  const used = { edges: 0 };
  const result = (reason) => ({ status: reason ? 'incomplete' : 'complete', requested: describe(subject),
    ids, neighbors, used, ...(reason ? { reason } : {}) });
  for (const edge of registry.related.get(id)) {
    if (used.edges === budget.edges) return result('edge-budget');
    used.edges += 1;
    const target = registry.subjects.get(edge.id) ?? registry.proposals.get(edge.id);
    ids.push(edge.id);
    neighbors.push({ ...describe(target), witness: { type: 'association', source: edge.source, target: edge.target,
      from: id, to: edge.id, derivedInverse: id !== edge.source } });
  }
  return result();
}

/** Normalize lifecycle policy and optional budgets without requiring a fabricated target. */
export function validateSubjectResolutionOptions(options = {}) {
  if (!isObject(options) || Object.keys(options).some((key) => !['policy', 'budget', 'operationBudget'].includes(key))
    || !['current', 'historical', 'equivalent'].includes(options.policy ?? 'current')) {
    throw new SubjectError('invalid-options', 'Choose current, historical or equivalent subject policy.');
  }
  if (Object.hasOwn(options, 'budget') && (!isObject(options.budget) || Object.keys(options.budget).length !== 1
    || !Number.isSafeInteger(options.budget.redirects) || options.budget.redirects < 0)) {
    throw new SubjectError('invalid-budget', 'Redirect traversal requires a nonnegative integer redirect budget.');
  }
  if (Object.hasOwn(options, 'operationBudget')) getSubjectValidationBudget(options.operationBudget).assertActive();
  return { policy: options.policy ?? 'current', ...(options.budget ? { budget: { ...options.budget } } : {}),
    ...(Object.hasOwn(options, 'operationBudget') ? { operationBudget: options.operationBudget } : {}) };
}

/** Resolve lifecycle in this captured registry; historical policy does not replay a past forest. */
export function resolveSubject(registry, id, options = {}) {
  assertRegistry(registry);
  const normalized = validateSubjectResolutionOptions(options);
  if (!parseCanonicalId('subject', id).ok && !parseProposalKey('subject', id).ok) {
    throw new SubjectError('invalid-subject-id', 'Use an exact subject ID or proposal key.');
  }
  const operationBudget = normalized.operationBudget;
  const visit = (subjectId) => {
    operationBudget?.charge('subjects', 1, 'resolution-subject');
    operationBudget?.charge('validationSteps', 1, 'resolution-subject');
    return registry.subjects.get(subjectId) ?? registry.proposals.get(subjectId);
  };
  const subject = visit(id);
  if (!subject) throw new SubjectError('unknown-subject', `Subject ${id} is absent from the captured registry.`);
  const { policy } = normalized;
  const budget = normalized.budget ?? { redirects: registry.subjects.size };
  const base = { requestedId: id, subject, policy, redirects: [] };
  if (policy === 'historical') return { status: 'resolved', ...base, id };
  const visited = new Set();
  let current = subject;
  while (true) {
    if (visited.has(current.id)) throw new SubjectError('redirect-cycle', 'Equivalent subject redirects contain a cycle.');
    visited.add(current.id);
    if (current.status === 'active') return { status: 'resolved', ...base, id: current.id, subject: current };
    const retirement = current.retirement;
    if (current.status === 'retired' && retirement?.kind === 'split') {
      if (!Array.isArray(retirement.successors) || retirement.successors.length === 0
        || retirement.successors.some((target) => !parseCanonicalId('subject', target).ok)
        || new Set(retirement.successors).size !== retirement.successors.length) {
        throw new SubjectError('invalid-retirement', 'A split requires distinct canonical successor IDs.');
      }
      for (const target of retirement.successors) {
        if (!visit(target)) throw new SubjectError('unknown-subject', `Split successor ${target} is absent.`);
      }
      return { status: 'unresolved', ...base, code: 'subject-split', alternatives: [...retirement.successors].sort(compare) };
    }
    if (current.status !== 'retired' || retirement?.kind !== 'equivalent-merge' || policy !== 'equivalent') {
      return { status: 'unresolved', ...base, code: `subject-${current.status}`, alternatives: [] };
    }
    if (!parseCanonicalId('subject', retirement.redirect).ok) {
      throw new SubjectError('invalid-retirement', 'An equivalent merge requires an exact canonical redirect.');
    }
    if (base.redirects.length === budget.redirects) {
      return { status: 'unresolved', ...base, code: 'redirect-budget', alternatives: [] };
    }
    const target = visit(retirement.redirect);
    if (!target) throw new SubjectError('unknown-subject', `Redirect ${retirement.redirect} is absent.`);
    base.redirects.push({ from: current.id, to: target.id });
    current = target;
  }
}

function walkForest(registry, root, options = {}, direction) {
  assertRegistry(registry);
  if (!isObject(options) || Object.keys(options).some((key) => !['includeSelf', 'budget'].includes(key))) {
    throw new SubjectError('invalid-options', 'Traversal accepts includeSelf and explicit budgets only.');
  }
  const { includeSelf = true, budget } = options;
  if (!parseCanonicalId('subject', root).ok && !parseProposalKey('subject', root).ok) {
    throw new SubjectError('invalid-subject-id', 'Use an exact subject ID or proposal key.');
  }
  if (!registry.subjects.has(root) && !registry.proposals.has(root)) {
    throw new SubjectError('unknown-subject', `Subject ${root} is absent from the captured registry.`);
  }
  if (typeof includeSelf !== 'boolean' || !budget
    || ![budget.nodes, budget.edges].every((n) => Number.isSafeInteger(n) && n >= 0)) {
    throw new SubjectError('invalid-budget', 'Traversal requires nonnegative integer node/edge budgets and boolean includeSelf.');
  }
  const ids = [];
  const used = { nodes: 0, edges: 0 };
  const queue = [root];
  const visited = new Set(queue);
  const result = (reason) => ({ status: reason ? 'incomplete' : 'complete',
    ids: direction === 'ancestors' ? [...ids].reverse() : [...ids].sort(compare),
    used, ...(reason ? { reason } : {}) });
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    if (used.nodes === budget.nodes) return result('node-budget');
    const id = queue[cursor];
    used.nodes += 1;
    if (includeSelf || id !== root) ids.push(id);
    const next = direction === 'descendants' ? registry.children.get(id)
      : registry.parents.has(id) ? [registry.parents.get(id)] : [];
    for (const target of next) {
      if (used.edges === budget.edges) return result('edge-budget');
      used.edges += 1;
      if (!visited.has(target)) {
        visited.add(target);
        queue.push(target);
      }
    }
  }
  return result();
}
