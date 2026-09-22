/** Read-only subject uses over actual immutable snapshots; never action approval. */
import { getSubjectValidationBudget } from './subject-validation-budget.js';
import { loadContinuedLifecycleContext } from './subject-lifecycle-context.js';
import { SubjectError } from './subject-error.js';
import { dirname, relative } from 'node:path';
import { isDeepStrictEqual as same } from 'node:util';
import { readCommittedTree, withTreeSnapshot } from './commit-snapshot.js';
import { locateKitRoot } from './kit-root.js';
import { loadSubjectQueryContext } from './subject-query-context.js';
import { validateSubjectGovernanceCapture, getSubjectGovernanceDescriptor } from './subject-governance.js';
import { getIdentityIndexDescriptor, getRecordOccurrence, resolveRecord } from './record-identity-index.js';
import { iterateCurrentRecords, iterateProposalRecords, RECORD_KINDS, parseCanonicalId, parseProposalKey } from './record-identity.js';
import { parseRecordFile } from './record-file.js';
import { captureCommittedFile } from './captured-source.js';
import { subjectAncestors } from './subjects.js';
import { readAssignments } from './subject-assignments.js';
import { recordLifecycleState } from './record-lifecycle.js';
import { canonicalSha256 } from './canonical-json.js';
import { rethrowIfBug } from './engine-refusal.js';

const closed = (value, keys) => value !== null && typeof value === 'object' && !Array.isArray(value)
  && Reflect.ownKeys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const whole = (value) => Number.isSafeInteger(value) && value >= 0;
const stores = { knowledge: 'knowledge', ontology: 'ontology', decision: 'decisions' };
const limitFields = ['maxRecordVisits', 'maxRegistryReferenceVisits', 'maxHierarchyNodes', 'maxHierarchyEdges'];
const path = (kitPath, file) => kitPath === '.' ? file : `${kitPath}/${file}`;
const identity = (row) => row.ref ? { ref: row.ref } : { proposalRef: row.proposalRef };
const identityKey = (row) => JSON.stringify(row.ref ?? row.proposalRef);
// Source captures differ across commits even when the structural use is unchanged.
const useKey = ({ side, capture, locator, ...use }) => JSON.stringify(use);

function* registryReferences(document) {
  for (const [index, subject] of document.subjects.entries()) {
    const base = { source: subject.id, declaredStatus: subject.status };
    const emit = (type, target, field) => ({ ...base, type, target, locator: `subjects[${index}].${field}` });
    if (subject.parent) yield emit('parent', subject.parent, 'parent');
    for (const [edge, relation] of (subject.related ?? []).entries()) {
      yield emit('association', relation.target, `related[${edge}].target`);
    }
    if (subject.retirement?.redirect) yield emit('redirect', subject.retirement.redirect, 'retirement.redirect');
    for (const [edge, target] of (subject.retirement?.successors ?? []).entries()) {
      yield emit('successor', target, `retirement.successors[${edge}]`);
    }
  }
}

/** The report cannot be supplied back as proof to a lifecycle publication gate. */
export function inspectSubjectUses(input) { return inspectUses(input, null); }

/** Internal owned-evidence continuation; its governance charges belong to the enclosing owner. */
export function inspectContinuedSubjectUses(input, { operationBudget }) {
  const budget = getSubjectValidationBudget(operationBudget); budget.assertActive();
  return inspectUses(input, budget);
}

async function inspectUses(input, budget) {
  const diagnosticRoots = [];
  const stable = (value) => {
    if (typeof value === 'string') {
      for (const [root, label] of diagnosticRoots) value = value.replaceAll(root, label);
      // Match the fixed materializer's names only for failures before its callback.
      return value.replace(/(?:\/[^\s"']*)?\/unknown-knowledge-(?:commit|tree)-[^/\s"']+/g, '<snapshot>');
    }
    if (Array.isArray(value)) return value.map(stable);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, stable(item)]));
    return value;
  };
  const result = { version: 1, status: 'refused',
    scope: { records: 'all-present-canonical-and-proposal-records', registry: 'current-authored-subject-references',
      semantics: 'structural-inspection-only', evidence: 'referenced-historical-reviews', externalInventory: 'unknown',
      excluded: ['arbitrary-repository-files', 'external-client-saved-routes'],
      limitsExclude: ['git-materialization', 'loading-and-native-parsing', 'governance-evaluation', 'owner-enumeration', 'serialization'] },
    inputs: {}, coverage: {}, records: [], uses: [], potentialUses: [], deltas: null,
    impact: {}, limits: null, used: { recordVisits: 0, registryReferenceVisits: 0, hierarchyNodes: 0, hierarchyEdges: 0 }, diagnostics: [] };
  const fail = (code, message, details = {}) => {
    result.status = 'refused'; result.diagnostics.push(stable({ code, message, ...details })); return result;
  };
  if (!closed(input, ['repoRoot', 'before', 'candidate', 'subjects', 'evidence', 'limits', 'impactPolicy'])
    || typeof input.repoRoot !== 'string' || !input.repoRoot
    || !['before', 'candidate'].every((side) => closed(input[side], ['commit', 'tree', 'kitPath'])
      && Object.values(input[side]).every((value) => typeof value === 'string' && value.length))
    || !Array.isArray(input.subjects) || !input.subjects.length || new Set(input.subjects).size !== input.subjects.length
    || Array.from(input.subjects).some((id) => !parseCanonicalId('subject', id).ok && !parseProposalKey('subject', id).ok)
    || !closed(input.evidence, ['decisionCaptures', 'assessmentCaptures', ...(budget ? ['materialCaptures'] : [])]) || !Object.values(input.evidence).every(Array.isArray)
    || !closed(input.limits, limitFields) || !Object.values(input.limits).every(whole)
    || !closed(input.impactPolicy, ['required', 'requiredExtensions'])
    || !Array.isArray(input.impactPolicy.required) || !Array.isArray(input.impactPolicy.requiredExtensions)
    || new Set(input.impactPolicy.required).size !== input.impactPolicy.required.length
    || Array.from(input.impactPolicy.required).some((kind) => !['managedRoutes', 'subjectTreeViews', 'representativeReplays'].includes(kind))
    || new Set(input.impactPolicy.requiredExtensions).size !== input.impactPolicy.requiredExtensions.length
    || Array.from(input.impactPolicy.requiredExtensions).some((name) => typeof name !== 'string' || !name.trim())) {
    return fail('invalid-subject-use-input', 'Supply exact snapshot sides, subject identities, evidence, logical limits and impact policy.');
  }
  result.limits = { ...input.limits };
  result.scope.subjects = [...input.subjects].sort(compare);
  const selected = new Set(input.subjects);
  const observedSubjects = new Set();
  let complete = true;
  try {
    const snapshots = {};
    for (const side of ['before', 'candidate']) {
      const actual = readCommittedTree(input.repoRoot, input[side].commit);
      if (actual.tree !== input[side].tree) return fail('subject-use-tree-mismatch', 'Declared tree differs from its actual commit.', { side });
      snapshots[side] = actual;
    }
    await withTreeSnapshot(input.repoRoot, snapshots.before.tree, async (before) => {
      diagnosticRoots.push([before.root, '<before-snapshot>'], [dirname(before.root), '<before-snapshot>']);
      await withTreeSnapshot(input.repoRoot, snapshots.candidate.tree, async (candidate) => {
        diagnosticRoots.push([candidate.root, '<candidate-snapshot>'], [dirname(candidate.root), '<candidate-snapshot>']);
        const sides = [['before', before], ['candidate', candidate]];
        for (const [side, snapshot] of sides) {
          const kitPath = relative(snapshot.root, locateKitRoot(snapshot.root)) || '.';
          if (kitPath !== input[side].kitPath) { fail('subject-use-kit-path-mismatch', 'Declared kit path differs from the actual installation.', { side }); return; }
        }
        for (const [side, snapshot] of sides) {
          const kitPath = input[side].kitPath;
          const loaded = budget ? loadContinuedLifecycleContext({ root: snapshot.root, evidence: input.evidence, operationBudget: budget })
            : loadSubjectQueryContext({ root: snapshot.root, ...input.evidence });
          if (!loaded.ok) { fail('subject-use-model-unavailable', 'Actual snapshot is not a healthy subject context.', { side, diagnostics: loaded.diagnostics }); return; }
          const { model, subjectGovernance } = loaded.context;
          const binding = validateSubjectGovernanceCapture(subjectGovernance, { model }, budget ? { operationBudget: budget } : {});
          const descriptor = getIdentityIndexDescriptor(model.identityIndex);
          if (!binding.ok || descriptor.identityDigest !== canonicalSha256(model.identity)) {
            fail('subject-use-capture-mismatch', 'Actual model and authentic identity/governance capture differ.', { side }); return;
          }
          if (result.inputs.before && result.inputs.before.namespace !== model.identity.namespace) {
            fail('subject-use-namespace-mismatch', 'Both snapshots must describe the same installation.'); return;
          }
          const registryFile = captureCommittedFile({ repoRoot: input.repoRoot, commit: input[side].commit,
            file: path(kitPath, 'subjects/registry.yaml') });
          if (budget) budget.admitCapture(registryFile);
          const registryCapture = registryFile.locator;
          result.inputs[side] = { ...input[side], namespace: model.identity.namespace,
            registryDigest: canonicalSha256(model.subjectRegistry.document), identityDigest: descriptor.identityDigest,
            registryCapture, governance: getSubjectGovernanceDescriptor(subjectGovernance) };
          const kinds = RECORD_KINDS.filter((kind) => model.stores[stores[kind]]?.present === true);
          const rows = kinds.length ? [...iterateCurrentRecords(model, { kinds }), ...iterateProposalRecords(model, { kinds })] : [];
          const byId = new Map(rows.map((row) => [identityKey(row), row]));
          result.coverage[side] = { records: 'complete', assignments: 'complete', registry: 'complete', hierarchy: 'complete',
            stores: RECORD_KINDS.map((kind) => ({ kind, status: kinds.includes(kind) ? 'present' : 'absent',
              allocations: model.identity.allocations.filter((row) => row.kind === kind).length })) };
          const registry = model.subjectRegistry;
          for (const id of [...registry.subjects.keys(), ...registry.proposals.keys()]) observedSubjects.add(id);
          const walks = new Map();
          for (const reference of registryReferences(registry.document)) {
            if (result.used.registryReferenceVisits === input.limits.maxRegistryReferenceVisits) {
              complete = false; result.coverage[side].registry = 'incomplete';
              result.potentialUses.push({ side, reason: 'registry-reference-budget', unexamined: true }); break;
            }
            result.used.registryReferenceVisits += 1;
            const subjects = [...new Set([reference.source, reference.target].filter((id) => selected.has(id)))].sort(compare);
            if (subjects.length) result.uses.push({ side, kind: 'registry-reference', ...reference, subjects, capture: registryCapture });
          }
          const missing = model.identity.allocations.filter((allocation) => RECORD_KINDS.includes(allocation.kind))
            .map((allocation) => ({ namespace: model.identity.namespace, kind: allocation.kind, id: allocation.id }))
            .filter((ref) => !byId.has(JSON.stringify(ref)));
          for (const row of [...rows, ...missing.map((ref) => ({ ref }))]) {
            if (result.used.recordVisits === input.limits.maxRecordVisits) {
              complete = false; result.coverage[side].records = 'incomplete';
              result.potentialUses.push({ side, reason: 'record-budget', unexamined: true }); break;
            }
            result.used.recordVisits += 1;
            const resolution = row.ref ? resolveRecord(model.identityIndex, row.ref) : null;
            if (!row.entry) {
              complete = false; result.coverage[side].records = 'incomplete';
              result.potentialUses.push({ side, ...identity(row), reason: 'payload-unavailable', resolution: resolution.status }); continue;
            }
            const captured = captureCommittedFile({ repoRoot: input.repoRoot, commit: input[side].commit,
              file: path(kitPath, row.entry.file) });
            if (budget) budget.admitCapture(captured);
            let text;
            try { text = new TextDecoder('utf-8', { fatal: true }).decode(captured.bytes); }
            catch (error) {
              if (error.code !== 'ERR_ENCODING_INVALID_ENCODED_DATA') throw error;
              fail('subject-use-invalid-encoding', 'Captured record is not valid UTF-8.', { side, ...identity(row) }); return;
            }
            const owner = row.ref ?? row.proposalRef;
            const parsed = parseRecordFile({ kind: owner.kind, file: row.entry.file, text });
            const matches = parsed.occurrences.filter((item) => item.entry.record.id === (owner.id ?? owner.key));
            if (!parsed.ok || matches.length !== 1 || !same(matches[0].entry, row.entry)
              || (row.ref && !same(getRecordOccurrence(model.identityIndex, row.ref), matches[0]))) {
              fail('subject-use-occurrence-mismatch', 'Exact captured occurrence differs from its loaded owner.', { side, ...identity(row) }); return;
            }
            const assignments = readAssignments(row.entry);
            if (assignments.state === 'invalid') { fail('subject-use-invalid-assignments', 'Original assignment metadata is invalid.', { side, ...identity(row) }); return; }
            const record = { side, ...identity(row), locator: matches[0].locator, capture: captured.locator,
              lifecycle: recordLifecycleState(row), resolution: resolution?.status ?? 'proposal', assignments };
            result.records.push(record);
            if (assignments.state === 'unknown') {
              complete = false; result.coverage[side].assignments = 'incomplete';
              result.potentialUses.push({ side, ...identity(row), locator: record.locator, capture: record.capture, reason: 'unknown-assignments' });
            } else for (const id of assignments.ids) {
              const witness = { side, ...identity(row), locator: record.locator, capture: record.capture, lifecycle: record.lifecycle };
              if (selected.has(id)) result.uses.push({ ...witness, kind: 'direct-assignment', subject: id });
              if (!registry.subjects.has(id) && !registry.proposals.has(id)) {
                complete = false; result.coverage[side].hierarchy = 'incomplete';
                result.potentialUses.push({ ...witness, reason: 'assigned-subject-unavailable', assignedSubject: id }); continue;
              }
              if (!walks.has(id)) {
                const walk = subjectAncestors(registry, id, { includeSelf: true, budget: {
                  nodes: input.limits.maxHierarchyNodes - result.used.hierarchyNodes,
                  edges: input.limits.maxHierarchyEdges - result.used.hierarchyEdges } });
                result.used.hierarchyNodes += walk.used.nodes; result.used.hierarchyEdges += walk.used.edges;
                walks.set(id, walk);
              }
              const walk = walks.get(id);
              if (walk.status === 'incomplete') {
                complete = false; result.coverage[side].hierarchy = 'incomplete';
                result.potentialUses.push({ ...witness, reason: 'hierarchy-budget', assignedSubject: id });
              }
              for (const [offset, ancestor] of walk.ids.entries()) {
                if (ancestor !== id && selected.has(ancestor) && !assignments.ids.includes(ancestor)) {
                  result.uses.push({ ...witness, kind: 'inherited-assignment', subject: ancestor,
                    assignedSubject: id, path: walk.ids.slice(offset) });
                }
              }
            }
          }
        }
      });
    });
    if (result.diagnostics.length) return result;
    if (input.subjects.some((id) => !observedSubjects.has(id))) {
      return fail('subject-use-unknown-selector', 'Each selected subject must occur in at least one actual registry.');
    }
    for (const surface of [...input.impactPolicy.required, ...input.impactPolicy.requiredExtensions]) {
      complete = false;
      result.potentialUses.push({ reason: 'required-surface-unavailable', surface });
    }
    result.impact = { required: [...input.impactPolicy.required], requiredExtensions: [...input.impactPolicy.requiredExtensions],
      status: input.impactPolicy.required.length || input.impactPolicy.requiredExtensions.length ? 'unavailable' : 'not-required' };
    result.records.sort((a, b) => compare(a.side, b.side) || compare(identityKey(a), identityKey(b)));
    result.uses.sort((a, b) => compare(a.side, b.side) || compare(useKey(a), useKey(b)));
    result.potentialUses.sort((a, b) => compare(JSON.stringify(a), JSON.stringify(b)));
    const beforeUses = new Map(result.uses.filter((use) => use.side === 'before').map((use) => [useKey(use), use]));
    const candidateUses = new Map(result.uses.filter((use) => use.side === 'candidate').map((use) => [useKey(use), use]));
    result.deltas = complete ? { added: [...candidateUses].filter(([key]) => !beforeUses.has(key)).map(([, use]) => use),
      removed: [...beforeUses].filter(([key]) => !candidateUses.has(key)).map(([, use]) => use), complete } : { added: [], removed: [], complete: false };
    result.status = complete ? 'complete' : 'incomplete';
    return result;
  } catch (error) {
    if (!(error instanceof SubjectError)) rethrowIfBug(error);
    return fail(error instanceof SubjectError ? error.code : 'subject-use-capture-unavailable', error.message);
  }
}
