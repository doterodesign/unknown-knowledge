/** Real before/candidate captures for assessed canonical creation, including empty bootstrap. */
import { readFileSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { fixture, authored, stateOf, digestEvent, ref } from './subject-suppression-fixture.js';
import { promotionLimits } from './subject-promotion-fixture.js';
import { loadStores } from '../../payload/engine/lib/load-stores.js';
import { describeCandidateBytes } from '../../payload/engine/lib/captured-source.js';
import { canonicalSha256 } from '../../payload/engine/lib/canonical-json.js';
import { planAllocations } from '../../payload/engine/lib/identity-ledger.js';

export function subjectActivationFixture(t, { refusal = false, count = 2 } = {}) {
  const f = fixture(t);
  const before = refusal ? structuredClone(f.candidate)
    : { ...structuredClone(f.before), subjects: [], history: [] };
  f.put('subjects/registry.yaml', authored(before));
  const beforeModel = loadStores(f.root);
  const capture = (file) => {
    const bytes = readFileSync(join(f.root, file));
    return { capture: describeCandidateBytes({ file, bytes, objectFormat: 'sha1' }), bytes, objectFormat: 'sha1' };
  };
  const beforeCaptures = { registry: capture('subjects/registry.yaml'), identity: capture('_identity.yaml') };
  const eventId = '83456789-1234-4234-8234-123456789abc';
  const allocation = planAllocations(beforeModel.identity, { kind: 'subject', count,
    publication: { id: eventId, review: 'review:creation-fixture' } });
  if (!allocation.ok) throw new Error(JSON.stringify(allocation));
  const rows = allocation.ids.map((id, index) => ({ id, before: null,
    after: { ...structuredClone(stateOf(f.before.subjects[0])), status: 'active', originDecision: ref('D-000002'),
      ...(index ? { parent: allocation.ids[0] } : {}) } }));
  const event = { id: eventId, action: 'activate', decision: ref('D-000002'), rows,
    reason: 'Create reviewed meanings against the complete captured scope',
    refusalAssessment: { version: 1, scope: {
      beforeRegistry: { capture: beforeCaptures.registry.capture, documentDigest: canonicalSha256(before) },
      identityDigest: canonicalSha256(beforeModel.identity) }, coverage: 'complete-registry',
    attestation: 'all-current-suppressed-meanings-assessed', relevantRefusals: [] } };
  event.review = { ...f.candidate.history[0].review, changeDigest: digestEvent(event) };
  const candidate = { ...structuredClone(before), revision: before.revision + 1,
    hierarchyRevision: before.hierarchyRevision + Number(count > 1),
    subjects: [...structuredClone(before.subjects), ...rows.map(({ id, after }) => ({ id, ...after, changes: [eventId] }))],
    history: [...structuredClone(before.history), event] };
  const result = { root: f.root, beforeModel, beforeCaptures, candidate, event,
    identity: allocation.ledger, decisionCaptures: f.decisionCaptures, budget: { ...promotionLimits }, put: f.put,
    reload() {
      this.event.review.changeDigest = digestEvent(this.event);
      f.put('_identity.yaml', this.identity);
      f.put('subjects/registry.yaml', authored(this.candidate));
      this.candidateModel = loadStores(f.root);
    },
    replaceBefore(document, identity) {
      f.put('_identity.yaml', identity);
      f.put('subjects/registry.yaml', authored(document));
      this.beforeModel = loadStores(f.root);
      this.beforeCaptures = { registry: capture('subjects/registry.yaml'), identity: capture('_identity.yaml') };
      this.event.refusalAssessment.scope = {
        beforeRegistry: { capture: this.beforeCaptures.registry.capture, documentDigest: canonicalSha256(document) },
        identityDigest: canonicalSha256(identity) };
      this.reload();
    } };
  result.reload();
  return result;
}

/** Append another assessed creation after an actual creation or promotion fixture. */
export function nextActivationFixture(f, { promotion = false } = {}) {
  let beforeModel = loadStores(f.root);
  let draft;
  if (promotion) {
    const document = structuredClone(beforeModel.subjectRegistry.document);
    draft = { ...stateOf(document.subjects.find((subject) => subject.status === 'active')),
      id: `proposal:subject:${randomUUID()}`, status: 'proposed', changes: [] };
    document.subjects.push(draft);
    writeFileSync(join(f.root, 'subjects/registry.yaml'), JSON.stringify(authored(document)));
    beforeModel = loadStores(f.root);
  }
  const before = beforeModel.subjectRegistry.document;
  const capture = (file) => {
    const bytes = readFileSync(join(f.root, file));
    return { capture: describeCandidateBytes({ file, bytes, objectFormat: 'sha1' }), bytes, objectFormat: 'sha1' };
  };
  const beforeCaptures = { registry: capture('subjects/registry.yaml'), identity: capture('_identity.yaml') };
  const id = randomUUID();
  const allocation = planAllocations(beforeModel.identity, { kind: 'subject', count: 1,
    publication: { id, review: 'review:next-creation' } });
  if (!allocation.ok) throw new Error(JSON.stringify(allocation));
  const state = structuredClone(stateOf(before.subjects.find((subject) => subject.status === 'active')));
  const event = { id, action: 'activate', decision: ref('D-000002'),
    ...(draft ? { promotes: { key: draft.id, before: draft } } : {}),
    rows: [{ id: allocation.ids[0], before: null, after: state }],
    refusalAssessment: { version: 1, scope: {
      beforeRegistry: { capture: beforeCaptures.registry.capture, documentDigest: canonicalSha256(before) },
      identityDigest: canonicalSha256(beforeModel.identity) }, coverage: 'complete-registry',
    attestation: 'all-current-suppressed-meanings-assessed', relevantRefusals: [] } };
  event.review = { ...f.event.review, changeDigest: digestEvent(event) };
  const candidate = { ...structuredClone(before), revision: before.revision + 1,
    hierarchyRevision: before.hierarchyRevision + Number(Boolean(state.parent)),
    subjects: [...structuredClone(before.subjects).filter((subject) => subject.id !== draft?.id),
      { id: allocation.ids[0], ...state, changes: [id] }],
    history: [...structuredClone(before.history), event] };
  writeFileSync(join(f.root, '_identity.yaml'), JSON.stringify(allocation.ledger));
  writeFileSync(join(f.root, 'subjects/registry.yaml'), JSON.stringify(authored(candidate)));
  return { beforeModel, beforeCaptures, candidateModel: loadStores(f.root), candidate, event,
    decisionCaptures: f.decisionCaptures, assessmentCaptures: [...(f.assessmentCaptures ?? []), f.beforeCaptures],
    budget: { ...promotionLimits } };
}
