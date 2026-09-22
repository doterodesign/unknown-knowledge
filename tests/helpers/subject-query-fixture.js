import assert from 'node:assert/strict';
import { subjectGovernanceFixture } from './subject-governance-fixture.js';
import { buildIdentityIndex } from '../../payload/engine/lib/record-identity-index.js';
import { indexSubjects } from '../../payload/engine/lib/subjects.js';
import { evaluateSubjectGovernance } from '../../payload/engine/lib/subject-governance.js';
import { canonicalSha256 } from '../../payload/engine/lib/canonical-json.js';

/** Actual captured identity, registry and retained approval bytes; no approval flags. */
export function subjectQueryFixture({ descendants = false, unavailable = false, equivalent = false } = {}) {
  const fixture = subjectGovernanceFixture();
  const event = fixture.document.history[0];
  const stateA = event.rows[0].after;
  const stateB = { ...structuredClone(stateA), label: 'Shape', ...(descendants ? { parent: 'S-000001' } : {}) };
  const stateC = { ...structuredClone(stateA), label: 'Size' };
  event.rows.push({ id: 'S-000002', before: null, after: stateB }, { id: 'S-000003', before: null, after: stateC });
  fixture.document.subjects.push({ id: 'S-000002', ...stateB, changes: [event.id] },
    { id: 'S-000003', ...stateC, changes: [event.id] });
  fixture.document.hierarchyRevision = descendants ? 1 : 0;
  const { review, ...eventData } = event;
  event.review.changeDigest = canonicalSha256(eventData);
  if (equivalent) {
    const retired = { ...structuredClone(stateA), status: 'retired',
      retirement: { kind: 'equivalent-merge', redirect: 'S-000002' } };
    const merged = { id: '34567890-1234-4234-8234-123456789abc', action: 'merge-equivalent', decision: event.decision,
      rows: [{ id: 'S-000001', before: structuredClone(stateA), after: retired },
        { id: 'S-000002', before: structuredClone(stateB), after: structuredClone(stateB), reason: 'Retain reviewed survivor' }],
      reason: 'Reviewed equivalent meaning' };
    merged.review = { ...review, changeDigest: canonicalSha256(merged) };
    fixture.document.history.push(merged);
    fixture.document.subjects[0] = { id: 'S-000001', ...retired, changes: [event.id, merged.id] };
    fixture.document.subjects[1].changes.push(merged.id);
    fixture.document.revision += 1;
  }
  const identity = fixture.identityInput.identity;
  const allocate = (kind, id) => ({ id, kind, state: 'allocated', publication: { id: event.id, review: 'review:identity' } });
  identity.allocations.push(allocate('subject', 'S-000003'));
  const sets = [['S-000001'], ['S-000001', 'S-000002', 'S-000003'], ['S-000002'], [], null, ['S-000003']];
  const leaves = new Map(sets.map((subjects, index) => {
    const id = `K-${String(index + 1).padStart(6, '0')}`;
    const entry = { id, file: `knowledge/${id}.md`, record: { id, title: id, facets: { stage: 'verified' },
      ...(subjects === null ? {} : { subjects }) }, body: `Captured body ${id}` };
    identity.allocations.push(allocate('knowledge', id));
    fixture.identityInput.records.push({ kind: 'knowledge', entry, locator: { file: entry.file, path: '' } });
    return [id, entry];
  }));
  const identityIndex = buildIdentityIndex(fixture.identityInput);
  const registry = indexSubjects(fixture.document);
  assert.equal(registry.ok, true);
  const result = evaluateSubjectGovernance({ registry: registry.registry, identity, identityIndex,
    decisionCaptures: unavailable ? [] : fixture.decisionCaptures });
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  const key = 'proposal:knowledge:11111111-1111-4111-8111-111111111111';
  const proposal = { file: 'knowledge/proposals/draft.md', record: { id: key, title: 'Draft proposal',
    subjects: ['S-000001'], facets: { stage: 'proposed' } } };
  return { subjectGovernance: result.governance, model: { ok: true, identity, identityIndex, subjectRegistry: registry.registry,
    stores: { knowledge: { present: true }, decisions: { present: true } }, leaves,
    decisions: new Map([['D-000001', fixture.identityInput.records[0].entry]]),
    proposals: { knowledge: new Map([[key, proposal]]), decision: new Map() } } };
}

export const queryBudgets = { version: 1, maxAstNodes: 32, maxAstDepth: 8, maxHierarchyNodes: 64,
  maxHierarchyEdges: 64, maxRedirects: 8, maxRecords: 100, maxPredicateSteps: 1000,
  maxResultsPerStore: 10, maxExplanationNodes: 10000 };
export const assigned = (subject) => ({ op: 'assigned', subject });
export const subjectQuery = (where = assigned('S-000001'), fields = {}) => ({
  version: 1, stores: ['knowledge'], view: 'current', where, budgets: { ...queryBudgets }, ...fields,
});
