import { test } from 'node:test';
import assert from 'node:assert/strict';
import { admitDecisionPromotionInput, decisionPromotionInputWire } from '../payload/engine/lib/decision-promotion-input.js';
import { canonicalSha256 } from '../payload/engine/lib/canonical-json.js';

export function promotionInput() {
  const namespace = '11111111-1111-4111-8111-111111111111';
  const before = { commit: 'a'.repeat(40), tree: 'b'.repeat(40), kitPath: '.' };
  return { repoRoot: '/actual/repository', before, candidate: { commit: 'c'.repeat(40), tree: 'd'.repeat(40), kitPath: '.' },
    publication: { id: '22222222-2222-4222-8222-222222222222', review: 'review:promotion' },
    promotion: { version: 1, rows: [{ proposalRef: { namespace, kind: 'decision', key: 'proposal:decision:33333333-3333-4333-8333-333333333333' },
      canonicalRef: { namespace, kind: 'decision', id: 'D-000002' }, targetLifecycle: 'accepted',
      beforeCapture: { file: 'decisions/entries/one.yaml', blob: 'e'.repeat(40), sha256: 'f'.repeat(64),
        source: { commit: before.commit, tree: before.tree } } }] },
    eventId: '44444444-4444-4444-8444-444444444444', reviewNote: { date: '2026-09-19', author: 'steward', skill: 'promote' },
    limits: { promotion: { maxFiles: 100, maxFileBytes: 100000, maxSourceBytes: 1000000, maxPromotions: 10 },
      assignments: { maxRecords: 10, maxCaptureBytes: 1000000, maxRedirects: 0 } } };
}

test('closed promotion admission detaches and hashes the exact authored operation excluding checkout', () => {
  const input = promotionInput(); const result = admitDecisionPromotionInput(input);
  assert.equal(result.ok, true);
  assert.equal(result.inputDigest, canonicalSha256(decisionPromotionInputWire(input)));
  assert.equal(admitDecisionPromotionInput({ ...input, repoRoot: '/other/checkout' }).inputDigest, result.inputDigest);
  input.promotion.rows[0].canonicalRef.id = 'D-000003';
  assert.equal(result.input.promotion.rows[0].canonicalRef.id, 'D-000002');
});

test('admission rejects getters before execution and every unrecognized or duplicate identity field', () => {
  let invoked = false; const input = promotionInput();
  Object.defineProperty(input.promotion.rows[0], 'targetLifecycle', { get() { invoked = true; return 'accepted'; } });
  assert.equal(admitDecisionPromotionInput(input).ok, false); assert.equal(invoked, false);
  for (const change of [
    (x) => { x.approval = true; },
    (x) => { x.promotion.rows.push(x.promotion.rows[0]); },
    (x) => { x.promotion.rows[0].canonicalRef.kind = 'knowledge'; },
    (x) => { x.promotion.rows[0].beforeCapture.source.tree += '\n'; },
    (x) => { x.limits.promotion.maxFiles = 0; },
    (x) => { x.promotion.rows.length = 2; },
    (x) => { Object.defineProperty(x.promotion.rows, '0', { enumerable: false }); },
    (x) => { x.before.kitPath = '../outside'; },
  ]) { const value = promotionInput(); change(value); assert.equal(admitDecisionPromotionInput(value).ok, false); }
});

test('digest preserves authored promotion order and every source/limit/review field', () => {
  const input = promotionInput(); const other = structuredClone(input.promotion.rows[0]);
  other.proposalRef.key = 'proposal:decision:55555555-5555-4555-8555-555555555555'; other.canonicalRef.id = 'D-000003';
  input.promotion.rows.push(other); const digest = admitDecisionPromotionInput(input).inputDigest;
  for (const change of [
    (x) => x.promotion.rows.reverse(),
    (x) => { x.publication.review = 'review:different'; },
    (x) => { x.reviewNote.skill = 'another-skill'; },
    (x) => { x.limits.assignments.maxRecords += 1; },
    (x) => { x.candidate.commit = 'e'.repeat(40); },
  ]) { const value = structuredClone(input); change(value); const next = admitDecisionPromotionInput(value);
    assert.equal(next.ok, true); assert.notEqual(next.inputDigest, digest); }
});
