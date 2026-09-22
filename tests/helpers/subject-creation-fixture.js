/** Literal one-Subject candidates over real commits; the native allocator is never fixture truth. */
import assert from 'node:assert/strict';
import { subjectReconsiderationCoreFixture } from './subject-reconsideration-core-fixture.js';
import { wire, digestEvent } from './subject-reconsideration-fixture.js';
import { canonicalSha256 } from '../../payload/engine/lib/canonical-json.js';
import { loadStores } from '../../payload/engine/lib/load-stores.js';

export function subjectCreationFixture(t, { action = 'activate', objectFormat = 'sha1', nested = false,
  union = false, bootstrap = false, stores = 'all' } = {}) {
  const base = subjectReconsiderationCoreFixture(t, { objectFormat, nested, stores });
  const beforeDocument = structuredClone(base.beforeDocument);
  const suppressed = beforeDocument.subjects.find(row => row.status === 'suppressed');
  const proposal = { ...suppressed, status: 'proposed', changes: [] }; delete proposal.refusal;
  beforeDocument.subjects = action === 'promote-proposal' ? [proposal] : [];
  beforeDocument.history = []; beforeDocument.revision = 0; beforeDocument.hierarchyRevision = 0;
  const beforeIdentity = structuredClone(base.beforeIdentity);
  const selectedEvent = structuredClone(base.candidateDocument.history.at(-1));
  const { id: proposalId, changes, ...meaning } = proposal;
  const active = { ...meaning, status: 'active', originDecision: selectedEvent.decision };
  if (union) {
    for (const [index, label] of ['Road transport', 'Rail transport'].entries()) {
      const id = `S-00000${index + 1}`;
      const state = { ...structuredClone(active), label, aliases: [],
        definition: { text: label, includes: [label], excludes: ['The other transport mode'] } };
      const event = { id: `b3000000-0000-4000-8000-00000000000${index + 1}`, action: 'activate',
        decision: structuredClone(selectedEvent.decision), rows: [{ id, before: null, after: state }] };
      event.review = { ...structuredClone(selectedEvent.review), changeDigest: digestEvent(event) };
      beforeDocument.subjects.push({ id, ...state, changes: [event.id] });
      beforeDocument.history.push(event);
      beforeIdentity.allocations.push({ kind: 'subject', id, state: 'allocated',
        publication: { id: event.id, review: event.review.reference } });
    }
    beforeDocument.revision = 2;
  }
  if (bootstrap) assert.equal(beforeDocument.subjects.length, 0);
  base.put('_identity.yaml', beforeIdentity); base.put('subjects/registry.yaml', wire(beforeDocument));
  const before = base.commit('ordinary Subject creation original');
  const beforeModel = loadStores(base.kitRoot);
  assert.equal(beforeModel.ok, true, JSON.stringify(beforeModel.diagnostics));
  const beforeCaptures = { registry: base.capture(before, 'subjects/registry.yaml'), identity: base.capture(before, '_identity.yaml') };
  const subject = union ? 'S-000003' : 'S-000001';
  if (union) {
    active.label = 'Ground transport'; active.aliases = [];
    active.definition = { text: 'Movement by road or rail', includes: ['Road transport', 'Rail transport'], excludes: ['Air transport'] };
  }
  const event = { id: selectedEvent.id, action: 'activate', decision: selectedEvent.decision,
    reason: union ? 'Review a distinct broader meaning while preserving both originals' : 'Activate the warranted reviewed meaning',
    ...(action === 'promote-proposal' ? { promotes: { key: proposalId, before: structuredClone(proposal) } } : {}),
    refusalAssessment: { version: 1,
      scope: { beforeRegistry: { capture: beforeCaptures.registry.capture, documentDigest: canonicalSha256(beforeDocument) },
        identityDigest: canonicalSha256(beforeIdentity) }, coverage: 'complete-registry',
      attestation: 'all-current-suppressed-meanings-assessed', relevantRefusals: [] },
    rows: [{ id: subject, before: null, after: active }] };
  event.review = { ...selectedEvent.review, changeDigest: digestEvent(event) };
  const operation = { version: 1, id: base.operation.id, action, proposal: action === 'promote-proposal' ? proposalId : null,
    subject, registryEvent: { id: event.id, changeDigest: event.review.changeDigest }, assignmentEvent: null };
  const candidateDocument = { ...structuredClone(beforeDocument), revision: beforeDocument.revision + 1,
    subjects: [...structuredClone(beforeDocument.subjects.filter(row => row.id !== operation.proposal)), { id: subject, ...active, changes: [event.id] }],
    history: [...structuredClone(beforeDocument.history), event] };
  const candidateIdentity = { ...structuredClone(beforeIdentity), allocations: [...structuredClone(beforeIdentity.allocations),
    { kind: 'subject', id: subject, state: 'allocated', publication: { id: operation.id, review: event.review.reference } }] };
  const evidence = { decisionCaptures: base.evidence.decisionCaptures, assessmentCaptures: [beforeCaptures], materialCaptures: [] };
  const f = { ...base, before, beforeDocument, beforeIdentity, beforeModel, beforeCaptures, originalPair: beforeCaptures,
    candidateDocument, candidateIdentity, event, operation, evidence,
    reload(message = 'ordinary Subject creation candidate') {
      event.review.changeDigest = digestEvent(event); operation.registryEvent.changeDigest = event.review.changeDigest;
      base.put('_identity.yaml', candidateIdentity); base.put('subjects/registry.yaml', wire(candidateDocument));
      this.candidate = base.commit(message); this.candidateModel = loadStores(base.kitRoot);
      assert.equal(this.candidateModel.ok, true, JSON.stringify(this.candidateModel.diagnostics));
      return this.candidate;
    },
    modelInput() { return { beforeModel, candidateModel: this.candidateModel, beforeCaptures,
      decisionCaptures: evidence.decisionCaptures, assessmentCaptures: [], budget: { ...base.limits.governance } }; },
    input(overrides = {}) { return { repoRoot: base.repoRoot, before, candidate: this.candidate, operation, evidence,
      limits: structuredClone(base.limits), ...overrides }; } };
  f.reload(); return f;
}
