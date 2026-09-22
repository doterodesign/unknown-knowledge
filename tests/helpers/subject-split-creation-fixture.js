/** Two real loaded models with an independently authored split and existing review Decision. */
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { subjectSplitHistoryFixture, splitHistoryDigest } from './subject-split-history-fixture.js';
import { promotionLimits } from './subject-promotion-fixture.js';
import { canonicalSha256 } from '../../payload/engine/lib/canonical-json.js';
import { loadStores } from '../../payload/engine/lib/load-stores.js';

export function subjectSplitCreationFixture(t, { objectFormat = 'sha1', nested = false, count = 3, parents = [],
  reviewStatus = 'accepted', beforeStatus = reviewStatus, candidateStatus = reviewStatus, unloadedBefore = false, beforeDecisionChange } = {}) {
  const f = subjectSplitHistoryFixture(t, { objectFormat, nested, count, parents });
  const decisionFile = 'decisions/entries/split-review.yaml';
  const decision = { id: 'D-000002', title: 'Review this split', category: 'architecture', status: reviewStatus,
    date: '2026-09-20', deciders: ['steward'], context: 'Two distinct meanings need separate warranted identities',
    decision: 'Approve the captured successor meanings and retained original definition' };
  const ref = { namespace: f.beforeModel.identity.namespace, kind: 'decision', id: decision.id };
  const ledger = structuredClone(f.beforeModel.identity);
  ledger.allocations.push({ id: decision.id, kind: 'decision', state: 'allocated',
    publication: { id: 'b1000000-0000-4000-8000-000000000001', review: 'review:existing-reviewer' } });
  const oldCatalog = JSON.parse(f.read('decisions/_catalog.yaml'));
  const catalog = { ...oldCatalog, entries: [...oldCatalog.entries, { id: decision.id, title: decision.title, file: 'entries/split-review.yaml' }] };
  f.put('subjects/registry.yaml', f.beforeCaptures.registry.bytes); f.put('_identity.yaml', ledger);
  f.put('decisions/_catalog.yaml', catalog); f.put(decisionFile, { 'schema-version': 2, entries: [decision] });
  const reviewSource = f.commit('existing accepted split review');
  const reviewCapture = f.capture(reviewSource, decisionFile);
  if (unloadedBefore) {
    f.put('decisions/_catalog.yaml', oldCatalog); rmSync(join(f.kitRoot, decisionFile));
  } else {
    const record = { ...decision, status: beforeStatus }; beforeDecisionChange?.(record);
    f.put(decisionFile, { 'schema-version': 2, entries: [record] });
  }
  const before = f.commit('actual before model for split creation');
  const beforeModel = loadStores(f.kitRoot);
  assert.equal(beforeModel.ok, true, JSON.stringify(beforeModel.diagnostics));
  const beforeCaptures = { registry: f.capture(before, 'subjects/registry.yaml'), identity: f.capture(before, '_identity.yaml') };
  f.put('decisions/_catalog.yaml', catalog);
  f.put(decisionFile, { 'schema-version': 2, entries: [{ ...decision, status: candidateStatus }] });
  f.activation.decision = ref; f.split.decision = structuredClone(ref);
  for (const row of f.activation.rows) row.after.originDecision = structuredClone(ref);
  f.activation.refusalAssessment.scope = {
    beforeRegistry: { capture: beforeCaptures.registry.capture, documentDigest: canonicalSha256(beforeModel.subjectRegistry.document) },
    identityDigest: canonicalSha256(beforeModel.identity),
  };
  f.activation.review = { reference: 'review:split', acceptedStatus: reviewStatus, decisionDigest: canonicalSha256(decision),
    decisionCapture: reviewCapture.capture, changeDigest: splitHistoryDigest(f.activation) };
  f.split.review = { ...structuredClone(f.activation.review), changeDigest: splitHistoryDigest(f.split) };
  const operation = { id: 'a1000000-0000-4000-8000-000000000003', subject: 'S-000001', successors: [...f.ids], registryEvents: [] };
  // Literal candidate allocation rows; the allocator under test does not generate fixture truth.
  f.identity.allocations = [...structuredClone(ledger.allocations), ...f.ids.map(id => ({ id, kind: 'subject', state: 'allocated',
    publication: { id: operation.id, review: 'review:split' } }))];
  const input = { beforeModel, candidateModel: null, beforeCaptures,
    decisionCaptures: [...f.decisionCaptures, reviewCapture], assessmentCaptures: [], operation,
    allocationLimits: { maxLedgerRows: ledger.allocations.length + f.identity.allocations.length, maxSuccessors: count },
    budget: { ...promotionLimits } };
  const result = { ...f, before, beforeModel, beforeCaptures, input, operation, ref, decision, decisionFile, reviewCapture,
    reload({ syncOperation = true, resign = true } = {}) {
      input.candidateModel = f.reload({ resign });
      this.model = input.candidateModel;
      if (syncOperation) operation.registryEvents = [f.activation, f.split].map(event => ({ id: event.id, changeDigest: event.review.changeDigest }));
      return input.candidateModel;
    },
  };
  result.reload(); result.candidate = f.commit('actual literal split creation candidate');
  return result;
}
