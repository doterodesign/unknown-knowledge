/** Shared mandatory reach/tree impacts behind fixed lifecycle compositions. */
import { isDeepStrictEqual as same } from 'node:util';
import { canonicalSha256 } from './canonical-json.js';
import { iterateCurrentRecords } from './record-identity.js';
import { reportSubjectReach } from './subject-reach.js';
import { compareSubjectTreeViews } from './subject-view-impact.js';
import { compareEquivalentMergeReplays } from './subject-equivalent-merge-replay.js';
import { compareRetirementReplays } from './subject-retirement-replay.js';
import { compareSubjectSplitReplays } from './subject-split-replay.js';

const stores = { knowledge: 'knowledge', ontology: 'ontology', decision: 'decisions' };
const key = (ref) => canonicalSha256(ref);
const refSet = (refs) => refs.map(key).sort();

/** Internal composition only; core comes from the fixed P8 actual-pair adapter. */
export function assessEquivalentMergeImpacts(input) { return assessLifecycleImpacts(input, 'merge'); }
export function assessSubjectRetirementImpacts(input) { return assessLifecycleImpacts(input, 'retirement'); }
export function assessSubjectSplitImpacts(input) { return assessLifecycleImpacts(input, 'split'); }
function assessLifecycleImpacts({ before, after, core, limits }, action) {
  const result = { ok: false, reach: null, subjectTree: null, representativeReplays: null, diagnostics: [] };
  const fail = (code, message) => { result.diagnostics.push({ code: code.replace(/^merge-/, `${action}-`), message }); return result; };
  if (core.ok !== true || core.authoredReferenceClosure.status !== 'complete') {
    return fail('merge-impact-scope-unavailable', 'Mandatory impacts require the actual authored-reference closure.');
  }
  const kinds = Object.keys(stores).filter((kind) => [before, after].some(({ context }) => context.model.stores[stores[kind]]?.present === true));
  if (!kinds.length || kinds.some((kind) => [before, after].some(({ context }) => context.model.stores[stores[kind]]?.present !== true))) {
    return fail('merge-impact-store-unavailable', 'All actual present record stores must remain available on both sides.');
  }
  const snapshot = ({ context, capturedInputRef }) => ({ capturedInputRef, registry: context.model.subjectRegistry,
    records: iterateCurrentRecords(context.model, { kinds }), coverage: kinds.map((kind) => ({ kind, status: 'complete' })) });
  const reach = reportSubjectReach({ before: snapshot(before), after: snapshot(after), kinds, limits: limits.reach });
  result.reach = reach;
  const retained = core.authoredReferenceClosure.retainedUnknowns.filter(({ ref }) => ref).map(({ ref }) => ref);
  if (!['complete', 'incomplete'].includes(reach.status) || ['before', 'after'].some((side) => {
    const report = reach[side];
    return !report || !['coverage', 'records', 'hierarchy'].every((key) => report.completeness[key] === true)
      || report.unvalidatedRecords !== 0 || !same(refSet(report.unknownAssignments), refSet(retained));
  }) || !same(refSet(reach.unknownImpact.map(({ ref }) => ref)), refSet(retained))
    || reach.records.some((row) => retained.some((ref) => same(ref, row.ref)) && ['before', 'after'].some((side) =>
      row[side].presence !== 'present' || !same(row[side].direct, { state: 'unknown', reason: 'absent' })))) {
    return fail('merge-reach-incomplete', 'Only the exact retained absent-field owners may remain unknown; all record and hierarchy work must finish.');
  }
  // Build the mandatory inventory here. A caller cannot waive it with [].
  const tree = compareSubjectTreeViews({ version: 1, before, after, limits: limits.views,
    inventory: { version: 1, coverage: 'complete', views: [{ id: 'whole-registry', kind: 'subject-tree', options: limits.tree }] } });
  result.subjectTree = tree;
  const paths = ['subjects/derived/tree.md', 'subjects/derived/metadata.json'];
  if (tree.status !== 'complete' || tree.coverage.assessedViews !== 1 || tree.resources.derivations.calls !== 2
    || tree.views.length !== 1 || tree.views[0].delta.status !== 'exact'
    || ['before', 'after'].some((side) => tree.views[0][side].status !== 'complete'
      || !same(tree.views[0][side].artifacts.map(({ path }) => path).sort(), [...paths].sort()))) {
    return fail('merge-tree-incomplete', 'One complete whole-registry artifact pair is mandatory with the same explicit options.');
  }
  result.representativeReplays = action === 'split'
    ? compareSubjectSplitReplays({ version: 1, before, after, core, limits: limits.replays, queryBudgets: limits.query })
    : action === 'retirement'
    ? compareRetirementReplays({ version: 1, before, after, source: core.operation.subject, limits: limits.replays, queryBudgets: limits.query })
    : compareEquivalentMergeReplays({ version: 1, before, after,
      source: core.operation.absorbed[0], survivor: core.operation.survivor, limits: limits.replays, queryBudgets: limits.query });
  if (result.representativeReplays.status !== 'complete') return fail('merge-replays-incomplete', 'The complete fixed lifecycle recipe must be assessed.');
  result.ok = true; return result;
}
