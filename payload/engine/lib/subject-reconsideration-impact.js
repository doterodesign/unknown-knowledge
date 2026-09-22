/** Fixed mandatory impacts over freshly bound actual reconsideration contexts. */
import { isDeepStrictEqual as same } from 'node:util';
import { canonicalSha256 } from './canonical-json.js';
import { iterateCurrentRecords } from './record-identity.js';
import { reportSubjectReach } from './subject-reach.js';
import { compareSubjectTreeViews } from './subject-view-impact.js';
import { compareSubjectReconsiderationReplays, compareSubjectCreationReplays } from './subject-reconsideration-replay.js';

const stores = { knowledge: 'knowledge', ontology: 'ontology', decision: 'decisions' };
const keys = refs => refs.map(canonicalSha256).sort();

/** Internal call site only; the core argument is not a branded public authority. */
export function assessSubjectReconsiderationImpacts(input) { return assessImpacts(input, false); }
export function assessSubjectCreationImpacts(input) { return assessImpacts(input, true); }
function assessImpacts({ before, after, core, limits }, ordinary) {
  const result = { ok: false, reach: null, subjectTree: null, replays: null,
    checks: { reach: false, subjectTree: false, replays: false }, diagnostics: [] };
  const fail = (code, message) => { result.diagnostics.push({ code, message }); return result; };
  if (!core.ok || core.ownerPreservation.status !== 'passed' || core.assignments !== null)
    return fail('reconsideration-impact-core', 'The actual eventless owner proof must pass.');
  const kinds = Object.keys(stores).filter(kind => before.context.model.stores[stores[kind]]?.present);
  if (!kinds.length || Object.keys(stores).some(kind => Boolean(before.context.model.stores[stores[kind]]?.present)
    !== Boolean(after.context.model.stores[stores[kind]]?.present)))
    return fail('reconsideration-impact-stores', 'Actual present stores must match.');
  const snapshot = side => ({ capturedInputRef: side.capturedInputRef, registry: side.context.model.subjectRegistry,
    records: iterateCurrentRecords(side.context.model, { kinds }), coverage: kinds.map(kind => ({ kind, status: 'complete' })) });
  const reach = reportSubjectReach({ before: snapshot(before), after: snapshot(after), kinds, limits: limits.reach });
  result.reach = reach;
  const unknown = core.ownerPreservation.unknownAssignments.filter(row => row.ref).map(row => row.ref);
  if (!['complete', 'incomplete'].includes(reach.status) || ['before', 'after'].some(side => !reach[side]
    || !['coverage', 'records', 'hierarchy'].every(key => reach[side].completeness[key])
    || reach[side].unvalidatedRecords !== 0 || !same(keys(reach[side].unknownAssignments), keys(unknown)))
    || !same(keys(reach.unknownImpact.map(row => row.ref)), keys(unknown))
    || reach.records.some(row => !same(row.before.direct, row.after.direct)
      || !same(row.before.inherited, row.after.inherited)))
    return fail('reconsideration-reach-incomplete', 'Known reach must remain equal and only the exact preserved absent fields may remain unknown.');
  const fresh = reach.subjects.find(row => row.id === core.operation.subject);
  if (!fresh || fresh.before !== null || fresh.directUsers.after.length || fresh.inheritedUsers.after.length)
    return fail('reconsideration-fresh-reach', 'Fresh Subject must have no known direct or inherited users.');
  result.checks.reach = true;
  const side = ({ capturedInputRef, context }) => ({ capturedInputRef, context });
  const tree = compareSubjectTreeViews({ version: 1, before: side(before), after: side(after), limits: limits.views,
    inventory: { version: 1, coverage: 'complete', views: [{ id: 'whole-registry', kind: 'subject-tree', options: limits.tree }] } });
  result.subjectTree = tree;
  const paths = ['subjects/derived/metadata.json', 'subjects/derived/tree.md'];
  if (tree.status !== 'complete' || tree.coverage.assessedViews !== 1 || tree.resources.derivations.calls !== 2
    || tree.views.length !== 1 || tree.views[0].delta.status !== 'exact'
    || ['before', 'after'].some(side => tree.views[0][side].status !== 'complete'
      || !same(tree.views[0][side].artifacts.map(row => row.path).sort(), paths)))
    return fail('reconsideration-tree-incomplete', 'The fixed whole-registry artifact pair must complete.');
  result.checks.subjectTree = true;
  result.replays = (ordinary ? compareSubjectCreationReplays : compareSubjectReconsiderationReplays)({ version: 1, before, after, core, limits: limits.replays, queryBudgets: limits.query });
  result.checks.replays = result.replays.status === 'complete';
  if (!result.checks.replays) return fail('reconsideration-replays-incomplete', 'The fixed finite recipe must be assessed completely.');
  result.ok = true; return result;
}
