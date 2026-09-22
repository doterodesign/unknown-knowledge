/** Structural reach over two captured inventories; never an approval decision. */
import { indexSubjects, subjectAncestors } from './subjects.js';
import { buildAssignmentIndex, readAssignments } from './subject-assignments.js';
import { isIdentityUuid, parseCanonicalId, RECORD_KINDS, recordIdentityMatches } from './record-identity.js';
import { canonicalSha256 } from './canonical-json.js';

const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value) => typeof value === 'string' && value.trim().length > 0;
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const key = (ref) => JSON.stringify([ref.namespace, ref.kind, ref.id]);
const sorted = (values) => [...new Set(values)].sort(compare);
const refs = (values) => values.map((ref) => ({ ...ref })).sort((a, b) => compare(key(a), key(b)));
const delta = (before, after) => ({ added: after.filter((id) => !before.includes(id)),
  removed: before.filter((id) => !after.includes(id)) });
const changed = (difference) => difference !== null && (difference.added.length > 0 || difference.removed.length > 0);
const problem = (code, path, message) => ({ code, path, message });
const invalid = (diagnostics) => ({ status: 'invalid', diagnostics,
  subjects: [], records: [], affectedRecords: [], unknownImpact: [] });

function prepare(input, name, kinds, limits, used, diagnostics) {
  if (!object(input) || !text(input.capturedInputRef) || !Array.isArray(input.records)
    || !Array.isArray(input.coverage)) {
    diagnostics.push(problem('invalid-reach-snapshot', name, 'Supply a captured input reference, record array and explicit coverage array.'));
    return null;
  }
  let indexed;
  let registryDigest;
  try {
    indexed = indexSubjects(input.registry?.document);
    if (indexed.ok) registryDigest = canonicalSha256(indexed.registry.document);
  } catch {
    diagnostics.push(problem('invalid-reach-registry', `${name}.registry`, 'A captured JSON registry document is required.'));
    return null;
  }
  if (!indexed.ok) {
    diagnostics.push(...indexed.diagnostics.map((d) => ({ ...d, path: `${name}.registry.${d.path}` })));
    return null;
  }
  const registry = indexed.registry;
  if (!isIdentityUuid(registry.namespace)) {
    diagnostics.push(problem('invalid-namespace', `${name}.registry.namespace`, 'Use an exact installation namespace.'));
  }
  for (const subject of registry.subjects.values()) {
    if (subject.parent !== undefined && !parseCanonicalId('subject', subject.parent).ok) {
      diagnostics.push(problem('noncanonical-reach-parent', `${name}.registry.${subject.id}.parent`,
        'Canonical reach requires canonical subject parents, matching the authority-file boundary.'));
    }
  }
  const suppliedCoverage = new Map();
  for (const item of input.coverage) {
    if (!object(item) || Object.keys(item).some((field) => !['kind', 'status'].includes(field))
      || !kinds.includes(item.kind) || !['complete', 'incomplete', 'unavailable'].includes(item.status)
      || suppliedCoverage.has(item.kind)) {
      diagnostics.push(problem('invalid-reach-coverage', `${name}.coverage`, 'Coverage needs one unambiguous status per selected kind.'));
    } else suppliedCoverage.set(item.kind, item.status);
  }
  const coverage = kinds.map((kind) => ({ kind, status: suppliedCoverage.get(kind) ?? 'unavailable' }));
  const count = Math.min(input.records.length, limits.maxRecords - used.recordsStarted);
  const selected = input.records.slice(0, count);
  used.recordsStarted += count;
  for (const item of selected) {
    const ref = item?.ref;
    if (!object(ref) || Object.keys(ref).length !== 3
      || Object.keys(ref).some((field) => !['namespace', 'kind', 'id'].includes(field))
      || ref.namespace !== registry.namespace || !kinds.includes(ref.kind)
      || !recordIdentityMatches(ref.kind, ref.id, item?.entry)) {
      diagnostics.push(problem('invalid-record-ref', `${name}.records`, 'A selected canonical record must match its exact typed reference and installation namespace.'));
    }
  }
  const directIndex = buildAssignmentIndex(selected);
  if (!directIndex.ok) diagnostics.push(...directIndex.diagnostics.map((d) => ({ ...d, path: `${name}.records.${d.path}` })));
  const records = new Map();
  if (directIndex.ok) {
    for (const item of selected) {
      const state = readAssignments(item.entry);
      if (state.state === 'known') {
        for (const id of state.ids) {
          if (!registry.subjects.has(id)) diagnostics.push(problem('unknown-assigned-subject', `${name}.records`,
            `Assigned subject ${id} is absent from this captured forest.`));
        }
        state.ids.sort(compare);
      }
      records.set(key(item.ref), { ref: { ...item.ref }, presence: 'present', direct: state });
    }
    used.recordsCompleted += count;
  }
  return { registry, registryDigest, capturedInputRef: input.capturedInputRef, coverage, records,
    directIndex, unvalidatedRecords: input.records.length - count, ancestors: new Map(),
    completeness: { coverage: coverage.every((item) => item.status === 'complete'),
      records: count === input.records.length, assignments: directIndex.ok && directIndex.unknown.length === 0,
      hierarchy: true } };
}

function traverse(side, limits, used) {
  for (const id of [...side.registry.subjects.keys()].sort(compare)) {
    const walk = subjectAncestors(side.registry, id, { includeSelf: false,
      budget: { nodes: limits.maxHierarchyNodes - used.hierarchyNodes,
        edges: limits.maxHierarchyEdges - used.hierarchyEdges } });
    used.hierarchyNodes += walk.used.nodes;
    used.hierarchyEdges += walk.used.edges;
    side.ancestors.set(id, walk);
    if (walk.status !== 'complete') side.completeness.hierarchy = false;
  }
  for (const record of side.records.values()) {
    const ids = [];
    let complete = record.direct.state === 'known';
    if (complete) {
      for (const id of record.direct.ids) {
        const walk = side.ancestors.get(id);
        ids.push(...walk.ids);
        if (walk.status !== 'complete') complete = false;
      }
    }
    // Inherited users exclude direct assignments to the same subject.
    record.inherited = { status: complete ? 'complete' : 'incomplete',
      ids: sorted(ids).filter((id) => !record.direct.ids?.includes(id)) };
  }
  const c = side.completeness;
  c.directUses = c.coverage && c.records && c.assignments;
  c.inheritedUses = c.directUses && c.hierarchy;
}

function missingRecord(side, ref) {
  const available = side.completeness.records
    && side.coverage.find((item) => item.kind === ref.kind)?.status === 'complete';
  return { ref: { ...ref }, presence: available ? 'absent' : 'unavailable',
    direct: available ? { state: 'known', ids: [] } : { state: 'unknown', reason: 'inventory-unavailable' },
    inherited: { status: available ? 'complete' : 'incomplete', ids: [] } };
}

function describe(side) {
  return { capturedInputRef: side.capturedInputRef, registryDigest: side.registryDigest,
    namespace: side.registry.namespace, revision: side.registry.revision,
    hierarchyRevision: side.registry.hierarchyRevision, coverage: side.coverage,
    completeness: side.completeness, unvalidatedRecords: side.unvalidatedRecords,
    unknownAssignments: refs(side.directIndex.unknown) };
}

/**
 * Derive direct uses and structural ancestor membership from original captured
 * inputs. Coverage is the caller's explicit assertion about each selected kind;
 * this pure function neither reads sources nor authenticates capturedInputRef.
 * All captured lifecycle states participate. Proposals, routes, saved replays,
 * effective approval and query eligibility are outside this structural report.
 *
 * Budgets are global across before then after. Record limits bound validation
 * and assignment work; hierarchy limits charge actual P2 traversal cost. Input
 * shape validation/registry indexing and output size are not covered by these
 * limits. Partial ancestor IDs are witnesses only, never negative evidence.
 *
 * @param {{before:object, after:object, kinds:string[], limits:{maxHierarchyNodes:number,
 * maxHierarchyEdges:number, maxRecords:number}}} input
 * @returns {object} per-side completeness, typed uses and conservative deltas
 */
export function reportSubjectReach(input) {
  const diagnostics = [];
  const { before: beforeInput, after: afterInput, kinds, limits } = input ?? {};
  if (!Array.isArray(kinds) || kinds.length === 0 || new Set(kinds).size !== kinds.length
    || Array.from(kinds).some((kind) => !RECORD_KINDS.includes(kind)) || !object(limits)
    || Object.keys(limits).some((field) => !['maxHierarchyNodes', 'maxHierarchyEdges', 'maxRecords'].includes(field))
    || ![limits.maxHierarchyNodes, limits.maxHierarchyEdges, limits.maxRecords]
      .every((value) => Number.isSafeInteger(value) && value >= 0)) {
    return invalid([problem('invalid-reach-options', '', 'Supply selected semantic record kinds and explicit nonnegative integer budgets.')]);
  }
  const orderedKinds = [...kinds].sort(compare);
  const used = { hierarchyNodes: 0, hierarchyEdges: 0, recordsStarted: 0, recordsCompleted: 0 };
  const before = prepare(beforeInput, 'before', orderedKinds, limits, used, diagnostics);
  const after = prepare(afterInput, 'after', orderedKinds, limits, used, diagnostics);
  if (before && after && before.registry.namespace !== after.registry.namespace) {
    diagnostics.push(problem('mixed-namespace', '', 'Before and after must describe the same installation.'));
  }
  if (diagnostics.length) return invalid(diagnostics);
  traverse(before, limits, used);
  traverse(after, limits, used);
  const subjects = sorted([...before.registry.subjects.keys(), ...after.registry.subjects.keys()]).map((id) => {
    const old = before.registry.subjects.get(id) ?? null;
    const next = after.registry.subjects.get(id) ?? null;
    const oldAncestors = before.ancestors.get(id) ?? { status: 'complete', ids: [], used: { nodes: 0, edges: 0 } };
    const nextAncestors = after.ancestors.get(id) ?? { status: 'complete', ids: [], used: { nodes: 0, edges: 0 } };
    const users = (side, inherited) => inherited
      ? refs([...side.records.values()].filter((row) => row.inherited.ids.includes(id)).map((row) => row.ref))
      : refs(side.directIndex.postings.find((posting) => posting.subjectId === id)?.records ?? []);
    return { id, before: old, after: next, metadataChanged: canonicalSha256(old) !== canonicalSha256(next),
      ancestors: { before: oldAncestors, after: nextAncestors },
      ancestorDelta: oldAncestors.status === 'complete' && nextAncestors.status === 'complete'
        ? delta(sorted(oldAncestors.ids), sorted(nextAncestors.ids)) : null,
      directUsers: { before: users(before, false), after: users(after, false),
        complete: { before: before.completeness.directUses, after: after.completeness.directUses } },
      inheritedUsers: { before: users(before, true), after: users(after, true),
        complete: { before: before.completeness.inheritedUses, after: after.completeness.inheritedUses } } };
  });
  const changedSubjects = new Set(subjects.filter((subject) => subject.metadataChanged).map((subject) => subject.id));
  const hierarchyChanges = new Set(subjects.filter((subject) => changed(subject.ancestorDelta)).map((subject) => subject.id));
  const records = [];
  const unknownImpact = [];
  for (const recordKey of sorted([...before.records.keys(), ...after.records.keys()])) {
    const ref = (before.records.get(recordKey) ?? after.records.get(recordKey)).ref;
    const old = before.records.get(recordKey) ?? missingRecord(before, ref);
    const next = after.records.get(recordKey) ?? missingRecord(after, ref);
    const directKnown = old.direct.state === 'known' && next.direct.state === 'known';
    const inheritedKnown = old.inherited.status === 'complete' && next.inherited.status === 'complete';
    const directDelta = directKnown ? delta(old.direct.ids, next.direct.ids) : null;
    const inheritedDelta = inheritedKnown ? delta(old.inherited.ids, next.inherited.ids) : null;
    const affectedSubjects = sorted([...(old.direct.ids ?? []), ...(next.direct.ids ?? [])])
      .filter((id) => changedSubjects.has(id)).map((id) => ({ namespace: ref.namespace, kind: 'subject', id }));
    const inheritedAffectedSubjects = sorted([...old.inherited.ids, ...next.inherited.ids])
      .filter((id) => changedSubjects.has(id)).map((id) => ({ namespace: ref.namespace, kind: 'subject', id }));
    const causes = [];
    if (old.presence !== next.presence && old.presence !== 'unavailable' && next.presence !== 'unavailable') causes.push('record-presence');
    if (changed(directDelta)) causes.push('direct-assignment');
    if (directKnown && old.direct.ids.some((id) => next.direct.ids.includes(id) && hierarchyChanges.has(id))) causes.push('hierarchy');
    if (affectedSubjects.length) causes.push('subject-metadata');
    if (inheritedAffectedSubjects.length) causes.push('inherited-subject-metadata');
    const result = { ref: { ...ref }, before: old, after: next, directDelta, inheritedDelta,
      affectedSubjects, inheritedAffectedSubjects, causes };
    records.push(result);
    if (!directKnown || !inheritedKnown) unknownImpact.push({ ref: { ...ref },
      sides: ['before', 'after'].filter((side) => result[side].direct.state !== 'known'
        || result[side].inherited.status !== 'complete') });
  }
  return { status: before.completeness.inheritedUses && after.completeness.inheritedUses ? 'complete' : 'incomplete',
    scope: { kinds: orderedKinds, proposals: 'excluded', lifecycle: 'all-captured', semantics: 'structural-only' },
    optionalImpact: { status: 'unavailable', inventories: ['routes', 'replays', 'query-views'] },
    before: describe(before), after: describe(after), limits: { ...limits }, used, diagnostics: [],
    subjects, records, affectedRecords: records.filter((record) => record.causes.length > 0), unknownImpact };
}
