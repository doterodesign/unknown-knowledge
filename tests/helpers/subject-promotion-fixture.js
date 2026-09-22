/** Actual two-installation promotion fixture with retained raw before and Decision evidence. */
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fixture, authored, stateOf, digestEvent, ref } from './subject-suppression-fixture.js';
import { loadStores } from '../../payload/engine/lib/load-stores.js';
import { describeCandidateBytes } from '../../payload/engine/lib/captured-source.js';
import { canonicalSha256 } from '../../payload/engine/lib/canonical-json.js';

export const promotionLimits = { maxCaptureBytes: 1000000, maxDocumentNodes: 100000, maxDocumentTextUnits: 1000000,
  maxSubjects: 10000, maxHistoryRows: 10000, maxValidationSteps: 100000 };
const promotionId = '43456789-1234-4234-8234-123456789abc';
export function subjectPromotionFixture(t, { refusal = false, parentStatus } = {}) {
  const f = fixture(t);
  const draft = structuredClone(f.before.subjects[0]);
  if (refusal) {
    draft.id = 'proposal:subject:53456789-1234-4234-8234-123456789abc';
    f.before = { ...structuredClone(f.candidate), subjects: [...structuredClone(f.candidate.subjects), draft] };
    f.put('subjects/registry.yaml', authored(f.before));
  }
  if (parentStatus) {
    const parentId = 'S-000002';
    const creationId = '63456789-1234-4234-8234-123456789abc';
    const retirementId = '73456789-1234-4234-8234-123456789abc';
    const active = { ...stateOf(draft), status: 'active', originDecision: ref('D-000002') };
    const creation = { id: creationId, action: 'activate', decision: ref('D-000002'), rows: [{ id: parentId, before: null, after: active }] };
    creation.review = { ...f.candidate.history[0].review, changeDigest: digestEvent(creation) };
    const retirement = { id: retirementId, action: 'retire', decision: ref('D-000002'),
      rows: [{ id: parentId, before: active, after: { ...active, status: 'retired', retirement: { kind: 'retire' } } }] };
    retirement.review = { ...creation.review, changeDigest: digestEvent(retirement) };
    const events = parentStatus === 'active' ? [creation] : [creation, retirement];
    f.before.history.push(...events); f.before.revision += events.length;
    f.before.subjects.push({ id: parentId, ...events.at(-1).rows[0].after, changes: events.map(({ id }) => id) });
    const ledger = structuredClone(f.model.identity);
    ledger.allocations.push({ kind: 'subject', id: parentId, state: 'allocated', publication: { id: creationId, review: 'review:parent' } });
    f.put('_identity.yaml', ledger);
    f.put('subjects/registry.yaml', authored(f.before));
  }
  const beforeModel = loadStores(f.root);
  const capture = (file) => {
    const bytes = readFileSync(join(f.root, file));
    return { capture: describeCandidateBytes({ file, bytes, objectFormat: 'sha1' }), bytes, objectFormat: 'sha1' };
  };
  const beforeCaptures = { registry: capture('subjects/registry.yaml'), identity: capture('_identity.yaml') };
  const root = mkdtempSync(join(tmpdir(), 'subject-promotion-candidate-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  cpSync(f.root, root, { recursive: true });
  const state = { ...structuredClone(stateOf(draft)), status: 'active', originDecision: ref('D-000002'), ...(parentStatus ? { parent: 'S-000002' } : {}) };
  const event = { id: promotionId, action: 'activate', decision: ref('D-000002'), reason: 'Publish reviewed local meaning',
    promotes: { key: draft.id, before: structuredClone(draft) },
    refusalAssessment: { version: 1,
      scope: { beforeRegistry: { capture: beforeCaptures.registry.capture, documentDigest: canonicalSha256(f.before) },
        identityDigest: canonicalSha256(beforeModel.identity) },
      coverage: 'complete-registry', attestation: 'all-current-suppressed-meanings-assessed', relevantRefusals: [] },
    rows: [{ id: 'S-000001', before: null, after: state }] };
  event.review = { ...f.candidate.history[0].review, changeDigest: digestEvent(event) };
  const candidate = { ...structuredClone(f.before), revision: f.before.revision + 1, hierarchyRevision: f.before.hierarchyRevision + (parentStatus ? 1 : 0),
    subjects: [...f.before.subjects.filter((subject) => subject.id !== draft.id), { id: 'S-000001', ...state, changes: [promotionId] }], history: [...f.before.history, event] };
  const identity = structuredClone(beforeModel.identity);
  identity.allocations.push({ kind: 'subject', id: 'S-000001', state: 'allocated', publication: { id: '33456789-1234-4234-8234-123456789abc', review: 'review:promotion' } });
  const put = () => {
    writeFileSync(join(root, '_identity.yaml'), JSON.stringify(identity));
    writeFileSync(join(root, 'subjects/registry.yaml'), JSON.stringify(authored(candidate)));
  };
  put();
  return { beforeModel, candidateModel: loadStores(root), beforeCaptures, decisionCaptures: f.decisionCaptures,
    budget: { ...promotionLimits }, root, candidate, identity, put, event,
    reload() { event.review.changeDigest = digestEvent(event); put(); this.candidateModel = loadStores(root); } };
}

