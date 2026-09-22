import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fixture, file, namespace } from './record-promotion-fixture.js';
import { planCapturedDecisionPromotion } from '../../payload/engine/lib/record-promotion.js';
import { describeCandidateBytes } from '../../payload/engine/lib/captured-source.js';
import { canonicalSha256 } from '../../payload/engine/lib/canonical-json.js';
import { sealAssignmentEvent } from './assignment-event-fixture.js';

/** Layer actual genesis on P1's released actual committed proposal fixture. */
export async function decisionPromotionGateFixture(t, options = {}) {
  const f = fixture(t, options); const source = f.input();
  const plan = await planCapturedDecisionPromotion(source);
  assert.equal(plan.ok, true, JSON.stringify(plan));
  const put = (file, bytes) => { mkdirSync(dirname(join(f.root, file)), { recursive: true });
    writeFileSync(join(f.root, file), typeof bytes === 'string' || Buffer.isBuffer(bytes) ? bytes : JSON.stringify(bytes, null, 2) + '\n'); };
  const read = (file) => readFileSync(join(f.root, file), 'utf8');
  for (const change of plan.changes) put(change.file, change.after.bytes);
  const capture = () => describeCandidateBytes({ file, bytes: Buffer.from(read(file)), objectFormat: options.format ?? 'sha1' });
  const eventId = '77777777-7777-4777-8777-777777777777';
  const event = { 'schema-version': 2, event: eventId, namespace, operation: 'canonical-creation',
    scope: { kind: 'typed-records', refs: plan.createdRefs },
    'before-input': { commit: source.source.commit, tree: source.source.tree, 'kit-path': '.' },
    decision: { namespace, kind: 'decision', id: 'D-000001' },
    review: { reference: source.publication.review, 'accepted-status': 'accepted',
      'decision-capture': source.selected[0].beforeCapture, 'decision-digest': canonicalSha256(f.records.entries[0]) },
    rows: plan.createdRefs.map((ref) => ({ ref, before: null, 'before-capture': null, 'before-revision': null,
      after: ref.id === 'D-000002' ? { state: 'unknown', reason: 'absent' } : { state: 'known', ids: [] },
      'after-capture': capture(), 'after-revision': 0, disposition: 'created', reason: 'Review canonical Decision creation' })) };
  const baseline = { 'schema-version': 1, namespace, baselines: event.rows.map((row) => ({
    ref: row.ref, state: row.after, capture: row['after-capture'], origin: { kind: 'creation', event: eventId } })) };
  const input = { repoRoot: f.root, before: source.source, candidate: null, publication: source.publication,
    promotion: { version: 1, rows: source.selected }, eventId, reviewNote: { date: '2026-09-19', author: 'steward', skill: 'promote-decisions' },
    limits: { promotion: source.limits, assignments: { maxRecords: 10, maxCaptureBytes: 1000000, maxRedirects: 0 } } };
  const save = () => {
    for (const row of event.rows) row['after-capture'] = capture();
    for (const row of baseline.baselines) row.capture = capture();
    put('subjects/_assignments/_baselines.yaml', baseline);
    put(`subjects/_assignments/${eventId}.yaml`, sealAssignmentEvent(event));
    f.git('add', '.'); const tree = f.git('write-tree').toString().trim();
    const commit = f.git('commit-tree', tree, '-p', source.source.commit, '-m', 'actual Decision genesis candidate').toString().trim();
    input.candidate = { commit, tree, kitPath: '.' }; return input;
  };
  save(); return { ...f, input, plan, event, baseline, put, read, save, file };
}
