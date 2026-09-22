/** Literal committed core pair plus explicit fresh-phase capacities. */
import { subjectReconsiderationCoreFixture } from './subject-reconsideration-core-fixture.js';
import assert from 'node:assert/strict';
import { withTreeSnapshot } from '../../payload/engine/lib/commit-snapshot.js';
import { inspectSubjectReconsiderationCore } from '../../payload/engine/lib/subject-reconsideration-core.js';
import { createSubjectOperation, getSubjectOperationResources } from '../../payload/engine/lib/subject-operation.js';
import { loadSubjectQueryContext } from '../../payload/engine/lib/subject-query-context.js';
import { projectSubjectMaterialCaptures } from '../../payload/engine/lib/subject-governance.js';
import { canonicalSha256 } from '../../payload/engine/lib/canonical-json.js';
import { wire, stateOf, digestEvent } from './subject-reconsideration-fixture.js';

export function reconsiderationImpactLimits() {
  const operation = { version: 1, maxSourceBytes: 33554432, maxSingleCaptureBytes: 2097152, maxOutputBytes: 0,
    validation: { maxCaptureBytes: 33554432, maxDocumentNodes: 20000000, maxDocumentTextUnits: 1000000000,
      maxSubjects: 100000, maxHistoryRows: 1000000, maxValidationSteps: 50000000 },
    corpus: { maxCanonicalRecords: 1000, maxAuthoredRecords: 1200, maxSubjects: 256, maxHierarchyDepth: 16,
      maxHistoryEvents: 256, maxHistoryRows: 1000, maxAssignmentsPerRecord: 100,
      maxAssignments: 10000, maxBodyBytesPerRecord: 100000 } };
  return { version: 1, contexts: { before: structuredClone(operation), after: structuredClone(operation) },
    reach: { maxHierarchyNodes: 1000, maxHierarchyEdges: 1000, maxRecords: 1000 },
    views: { version: 1, maxViews: 1 },
    tree: { budget: { nodes: 1000, edges: 1000, rows: 1000 }, maxBytes: 1000000 },
    replays: { version: 1, maxSubjects: 100, maxEligibilityRedirects: 1000,
      maxQualificationRedirects: 100000, maxCases: 10000, maxInventoryBytes: 10000000 },
    query: { version: 1, maxAstNodes: 32, maxAstDepth: 8, maxHierarchyNodes: 1000,
      maxHierarchyEdges: 1000, maxRedirects: 16, maxRecords: 1000,
      maxPredicateSteps: 10000, maxResultsPerStore: 1000, maxExplanationNodes: 100000 },
    closure: { maxRows: 20, maxBytes: 50000000 } };
}

export function subjectReconsiderationGateFixture(t, options = {}) {
  let fixture = subjectReconsiderationCoreFixture(t, options);
  if (options.unavailableOriginal) fixture = withUnavailableOriginal(fixture, options.assignedUnavailable === true);
  if (options.priorReconsideration) fixture = withSecondReconsideration(fixture);
  const impact = reconsiderationImpactLimits();
  return { ...fixture, impact, gateInput: (overrides = {}) => ({ ...fixture.input(), impact, ...overrides }) };
}

function withSecondReconsideration(f) {
  const proposal = 'proposal:subject:a2000000-0000-4000-8000-000000000070';
  const refusalId = 'a2000000-0000-4000-8000-000000000071', activationId = 'a2000000-0000-4000-8000-000000000072';
  const operationId = 'a2000000-0000-4000-8000-000000000073';
  const originalRefusal = f.beforeDocument.history.at(-1), suppressed = structuredClone(f.beforeDocument.subjects.at(-1));
  suppressed.id = proposal; suppressed.changes = [refusalId];
  const refusal = { ...structuredClone(originalRefusal), id: refusalId,
    rows: [{ ...structuredClone(originalRefusal.rows[0]), id: proposal }] };
  refusal.review.changeDigest = digestEvent(refusal);
  const beforeDocument = structuredClone(f.candidateDocument);
  beforeDocument.history.push(refusal); beforeDocument.subjects.push(suppressed); beforeDocument.revision++;
  const beforeIdentity = structuredClone(f.candidateIdentity);
  f.put('subjects/registry.yaml', wire(beforeDocument));
  const before = f.commit('actual second suppressed proposal after first reconsideration');
  const pair = { registry: f.capture(before, 'subjects/registry.yaml'), identity: f.capture(before, '_identity.yaml') };
  const activation = structuredClone(f.candidateDocument.history.at(-1));
  activation.id = activationId; activation.priorRefusal = refusalId;
  activation.promotes = { key: proposal, before: suppressed }; activation.rows[0].id = 'S-000002';
  activation.reconsiderationAssessment.scope = { beforeRegistry: { capture: pair.registry.capture, documentDigest: canonicalSha256(beforeDocument) },
    identityDigest: canonicalSha256(beforeIdentity) };
  activation.reconsiderationAssessment.relevantRefusals[0].subject = proposal;
  activation.reconsiderationAssessment.relevantRefusals[0].refusal = refusalId;
  activation.review.changeDigest = digestEvent(activation);
  const candidateDocument = { ...beforeDocument, revision: beforeDocument.revision + 1,
    history: [...beforeDocument.history, activation], subjects: [...beforeDocument.subjects.filter(row => row.id !== proposal),
      { id: 'S-000002', ...activation.rows[0].after, changes: [activationId] }] };
  const candidateIdentity = { ...beforeIdentity, allocations: [...beforeIdentity.allocations,
    { kind: 'subject', id: 'S-000002', state: 'allocated', publication: { id: operationId, review: activation.review.reference } }] };
  f.put('_identity.yaml', candidateIdentity); f.put('subjects/registry.yaml', wire(candidateDocument));
  const candidate = f.commit('actual second reconsideration with retained first material');
  const operation = { ...f.operation, id: operationId, proposal, subject: 'S-000002', registryEvent: { id: activationId, changeDigest: activation.review.changeDigest } };
  const evidence = { ...f.evidence, assessmentCaptures: [...f.evidence.assessmentCaptures, pair] };
  const input = { ...f.input(), before, candidate, operation, evidence };
  return { ...f, before, candidate, operation, evidence, beforeDocument, candidateDocument, beforeIdentity, candidateIdentity,
    beforeCaptures: pair, input: (overrides = {}) => ({ ...input, ...overrides }) };
}

function withUnavailableOriginal(f, assignedUnavailable) {
  const namespace = f.beforeIdentity.namespace, beforeIdentity = structuredClone(f.beforeIdentity);
  const decision = { namespace, kind: 'decision', id: 'D-000004' };
  const record = { id: decision.id, title: 'Original independent Subject review', status: 'accepted', category: 'architecture',
    date: '2026-09-20', deciders: ['steward'], context: 'Independent material', decision: 'Activate the unrelated original Subject.' };
  f.put('_identity.yaml', beforeIdentity); f.put('subjects/registry.yaml', wire(f.beforeDocument));
  const catalog = JSON.parse(f.read('decisions/_catalog.yaml'));
  catalog.entries.push({ id: decision.id, title: record.title, file: 'entries/original.yaml' });
  f.put('decisions/_catalog.yaml', catalog);
  f.put('decisions/entries/original.yaml', { 'schema-version': 2, entries: [record] });
  const source = f.commit('actual retained original authorizer');
  const capture = f.capture(source, 'decisions/entries/original.yaml');
  const id = 'a2000000-0000-4000-8000-000000000060';
  const state = { ...stateOf(f.beforeDocument.subjects.at(-1)), status: 'active', originDecision: decision,
    label: 'Unrelated original', related: [] };
  delete state.refusal; delete state.parent;
  const event = { id, action: 'activate', decision, rows: [{ id: 'S-000002', before: null, after: state }] };
  event.review = { reference: 'review:independent-original', acceptedStatus: 'accepted', decisionCapture: capture.capture,
    decisionDigest: canonicalSha256(record), changeDigest: digestEvent(event) };
  beforeIdentity.allocations.push({ kind: 'decision', id: decision.id, state: 'allocated', publication: { id, review: event.review.reference } },
    { kind: 'subject', id: 'S-000002', state: 'allocated', publication: { id, review: event.review.reference } });
  const beforeDocument = structuredClone(f.beforeDocument);
  beforeDocument.history.unshift(event); beforeDocument.subjects.unshift({ id: 'S-000002', ...state, changes: [id] }); beforeDocument.revision++;
  f.put('_identity.yaml', beforeIdentity); f.put('subjects/registry.yaml', wire(beforeDocument));
  if (assignedUnavailable) {
    const text = f.read('knowledge/K-000001.md'), parts = text.split('---'), record = JSON.parse(parts[1]);
    record.subjects = ['S-000002']; parts[1] = '\n' + JSON.stringify(record) + '\n'; f.put('knowledge/K-000001.md', parts.join('---'));
  }
  const before = f.commit('actual original with retained unavailable independent history');
  const pair = { registry: f.capture(before, 'subjects/registry.yaml'), identity: f.capture(before, '_identity.yaml') };
  const candidateDocument = structuredClone(f.candidateDocument), activation = candidateDocument.history.at(-1);
  candidateDocument.history = [...beforeDocument.history, activation];
  candidateDocument.subjects.unshift({ id: 'S-000002', ...state, changes: [id] }); candidateDocument.revision++;
  activation.reconsiderationAssessment.scope = { beforeRegistry: { capture: pair.registry.capture, documentDigest: canonicalSha256(beforeDocument) },
    identityDigest: canonicalSha256(beforeIdentity) };
  activation.review.changeDigest = digestEvent(activation);
  const candidateIdentity = { ...beforeIdentity, allocations: [...beforeIdentity.allocations, f.candidateIdentity.allocations.at(-1)] };
  f.put('_identity.yaml', candidateIdentity); f.put('subjects/registry.yaml', wire(candidateDocument));
  const candidate = f.commit('candidate preserving the unrelated unavailable history');
  const operation = { ...f.operation, registryEvent: { id: activation.id, changeDigest: activation.review.changeDigest } };
  const evidence = { ...f.evidence, assessmentCaptures: [pair] };
  const input = { ...f.input(), before, candidate, operation, evidence };
  return { ...f, before, candidate, operation, evidence, beforeDocument, candidateDocument, beforeIdentity, candidateIdentity,
    beforeCaptures: pair, input: (overrides = {}) => ({ ...input, ...overrides }) };
}

export async function withReconsiderationReplayFixture(t, callback, options = {}) {
  const f = subjectReconsiderationGateFixture(t, options);
  const core = await inspectSubjectReconsiderationCore(f.input());
  assert.equal(core.ok, true, JSON.stringify(core.diagnostics));
  return withTreeSnapshot(f.repoRoot, f.before.tree, async before => withTreeSnapshot(f.repoRoot, f.candidate.tree, async after => {
    const sides = {};
    for (const [side, snapshot] of Object.entries({ before, after })) {
      const operation = createSubjectOperation(f.impact.contexts[side]);
      const materialCaptures = side === 'before' ? projectSubjectMaterialCaptures({ registryDocument: f.beforeDocument,
        materialCaptures: f.evidence.materialCaptures }, { operationBudget: getSubjectOperationResources(operation).subjectOperationBudget }).selected
        : f.evidence.materialCaptures;
      const loaded = loadSubjectQueryContext({ root: snapshot.root, ...f.evidence, materialCaptures, operation });
      assert.equal(loaded.ok, true, JSON.stringify(loaded.diagnostics));
      sides[side] = { context: loaded.context, operation, capturedInputRef: `${core.inputDigest}:${side}` };
    }
    return callback({ f, input: { version: 1, ...sides, core, limits: f.impact.replays, queryBudgets: f.impact.query } });
  }));
}
