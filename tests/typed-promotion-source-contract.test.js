/** Independent actual K/O/D source obligations beneath the complete typed gates. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { typedPromotionFixture } from './helpers/typed-promotion-fixture.js';
import { withTreeSnapshot } from '../payload/engine/lib/commit-snapshot.js';
import { loadStores } from '../payload/engine/lib/load-stores.js';
import { loadSubjectQueryContext } from '../payload/engine/lib/subject-query-context.js';
import { iterateCurrentRecords, iterateProposalRecords } from '../payload/engine/lib/record-identity.js';
import { validateAssignmentChange } from '../payload/engine/lib/assignment-validation.js';
import { readAssignments } from '../payload/engine/lib/subject-assignments.js';
import { captureCommittedFile } from '../payload/engine/lib/captured-source.js';
import { runPreflight } from '../payload/engine/lib/preflight.js';
import { planCapturedDecisionPromotion, planCapturedRecordPromotion } from '../payload/engine/lib/record-promotion.js';
import { runPreparedAssignmentGate } from '../payload/engine/lib/assignment-gate.js';

const snapshot = (f, descriptor, run) => withTreeSnapshot(f.root, descriptor.tree, ({ root }) =>
  run({ root, model: loadStores(descriptor.kitPath === '.' ? root : join(root, descriptor.kitPath)) }));

for (const kind of ['ontology', 'knowledge', 'decision']) for (const format of ['sha1', 'sha256']) {
  test(`actual ${format} ${kind} proposal and classified genesis preserve prior history`, async (t) => {
    const f = typedPromotionFixture(t, { kind, format, nested: format === 'sha256' });
    if (kind === 'ontology' && format === 'sha1') {
      const prior = await runPreparedAssignmentGate({ repoRoot: f.root, before: f.seed, candidate: f.before,
        eventId: f.priorEvent.event, selection: f.priorEvent.scope,
        reviewNote: { date: f.today, author: 'steward', skill: 'typed-classification' },
        decisionCaptures: f.evidence.decisionCaptures, limits: { maxRecords: 20, maxCaptureBytes: 2000000, maxRedirects: 20 },
        impact: { required: [] } });
      assert.equal(prior.ok, true, JSON.stringify(prior));
    }
    await snapshot(f, f.before, ({ model }) => {
      assert.equal(model.ok, true, JSON.stringify(model.diagnostics));
      const proposals = iterateProposalRecords(model, { kinds: [kind] });
      const canonical = iterateCurrentRecords(model, { kinds: [kind] });
      for (const row of f.rows) {
        assert.ok(proposals.some(({ proposalRef }) => proposalRef.key === row.proposalRef.key));
        assert.ok(!canonical.some(({ ref }) => ref.id === row.canonicalRef.id));
        assert.deepEqual(row.beforeCapture, captureCommittedFile({ repoRoot: f.root, commit: f.before.commit,
          file: row.beforeCapture.file }).locator);
      }
      assert.ok(model.assignmentHistory);
    });
    await snapshot(f, f.candidate, ({ root, model }) => {
      assert.equal(model.ok, true, JSON.stringify(model.diagnostics));
      const loaded = loadSubjectQueryContext({ root, ...f.evidence });
      assert.equal(loaded.ok, true, JSON.stringify(loaded.diagnostics));
      const canonical = iterateCurrentRecords(model, { kinds: [kind] });
      const proposals = iterateProposalRecords(model, { kinds: [kind] });
      for (const [index, row] of f.rows.entries()) {
        assert.ok(!proposals.some(({ proposalRef }) => proposalRef.key === row.proposalRef.key));
        const owner = canonical.find(({ ref }) => ref.id === row.canonicalRef.id);
        assert.ok(owner);
        const checked = validateAssignmentChange({ before: null, candidate: owner,
          governance: loaded.context.subjectGovernance }, { purpose: 'new-assignment', budget: { redirects: 20 } });
        assert.equal(checked.ok, true, JSON.stringify(checked));
        assert.deepEqual(readAssignments(owner.entry), f.event.rows[index].after);
        if (index === 2) assert.deepEqual(checked.changes.newEffective, ['S-000001', 'S-000002']);
        assert.equal(f.event.rows[index]['before-capture'], null);
        assert.equal(f.event.rows[index]['before-revision'], null);
        assert.equal(f.event.rows[index]['after-revision'], 0);
      }
      if (kind !== 'decision') {
        const result = runPreflight(model, { repoRoot: root, today: f.today, log: false,
          [kind === 'ontology' ? 'concepts' : 'leaves']: f.rows.map(({ canonicalRef }) => canonicalRef.id) });
        assert.equal(result.payload.ok, true, JSON.stringify(result));
        assert.equal(result.payload.mode, kind === 'ontology' ? 'concepts' : 'leaves');
        assert.equal(result.payload.counts.trusted, f.rows.length);
      }
      const baseline = model.assignmentHistory.baselines;
      assert.equal(baseline.length, 4);
      assert.deepEqual(baseline[0], f.baseline.baselines[0]);
      assert.deepEqual(baseline.slice(1).map(({ origin }) => origin),
        f.rows.map(() => ({ kind: 'creation', event: f.event.event })));
    });
    for (const file of ['subjects/registry.yaml', `subjects/_assignments/${f.priorEvent.event}.yaml`]) {
      const before = captureCommittedFile({ repoRoot: f.root, commit: f.before.commit, file: f.path(file) });
      const after = captureCommittedFile({ repoRoot: f.root, commit: f.candidate.commit, file: f.path(file) });
      assert.ok(before.bytes.equals(after.bytes)); assert.equal(before.mode, after.mode);
    }
    const { version, kind: ignoredKind, ...decisionInput } = f.plannerInput;
    const plan = kind === 'decision' ? await planCapturedDecisionPromotion(decisionInput)
      : await planCapturedRecordPromotion(f.plannerInput);
    assert.equal(plan.ok, true, JSON.stringify(plan));
    for (const change of plan.changes) {
      const actual = captureCommittedFile({ repoRoot: f.root, commit: f.candidate.commit, file: change.file });
      assert.ok(change.after.bytes.equals(actual.bytes), change.file);
      assert.equal(change.after.mode, actual.mode);
    }
  });
}

test('source proposal health cannot certify a newly active broken Ontology source pointer', async (t) => {
  const f = typedPromotionFixture(t, { sourcePath: 'src/missing.js', history: false });
  await snapshot(f, f.before, ({ root, model }) => {
    assert.equal(model.ok, true, JSON.stringify(model.diagnostics));
    assert.equal(runPreflight(model, { repoRoot: root, log: false }).payload.ok, true);
  });
  await snapshot(f, f.candidate, ({ root, model }) => {
    const result = runPreflight(model, { repoRoot: root, concepts: f.rows.map(({ canonicalRef }) => canonicalRef.id), log: false });
    assert.equal(result.payload.ok, false, JSON.stringify(result));
    assert.notEqual(result.exitCode, 0);
  });
});

test('selected verified Knowledge uses explicit date and refuses stale evidence preserved from a proposal', async (t) => {
  const f = typedPromotionFixture(t, { kind: 'knowledge', verified: '2020-01-01' });
  await snapshot(f, f.candidate, ({ root, model }) => {
    assert.equal(runPreflight(model, { repoRoot: root, log: false }).payload.ok, true);
    const options = { repoRoot: root, leaves: f.rows.map(({ canonicalRef }) => canonicalRef.id), log: false };
    const dated = runPreflight(model, { ...options, today: f.today });
    assert.equal(dated.payload.ok, false); assert.equal(dated.payload.counts.stale, f.rows.length);
    const undated = runPreflight(model, options);
    assert.equal(undated.payload.ok, false); assert.notEqual(undated.exitCode, 0);
    assert.ok(readFileSync(join(root, f.path(f.sources[0].file)), 'utf8').includes('2020-01-01'));
  });
});

test('verbatim proposal Subject IDs are strict new assignments and need actual governance evidence', async (t) => {
  const f = typedPromotionFixture(t);
  await snapshot(f, f.candidate, ({ root }) => {
    const loaded = loadSubjectQueryContext({ root, decisionCaptures: [], assessmentCaptures: [] });
    assert.equal(loaded.ok, true, JSON.stringify(loaded.diagnostics));
    const owner = iterateCurrentRecords(loaded.context.model, { kinds: ['ontology'] }).find(({ ref }) => ref.id === f.rows[2].canonicalRef.id);
    const checked = validateAssignmentChange({ before: null, candidate: owner,
      governance: loaded.context.subjectGovernance }, { purpose: 'new-assignment', budget: { redirects: 20 } });
    assert.equal(checked.ok, false);
    assert.deepEqual(readAssignments(owner.entry).ids, f.sources[2].record.subjects);
  });
});

test('healthy store and fresh date do not certify a leaf with an unloaded authority vocabulary', async (t) => {
  const f = typedPromotionFixture(t, { kind: 'knowledge', authorityRegistry: false });
  await snapshot(f, f.candidate, ({ root, model }) => {
    assert.equal(runPreflight(model, { repoRoot: root, log: false }).payload.ok, true);
    const result = runPreflight(model, { repoRoot: root, today: f.today, log: false,
      leaves: f.rows.map(({ canonicalRef }) => canonicalRef.id) });
    assert.equal(result.payload.ok, false);
    assert.equal(result.payload.counts.quarantined, f.rows.length);
    for (const row of result.payload['leaf-verdicts']) {
      assert.equal(row.time.verdict, 'trusted');
      assert.ok(row.evidence.some(({ code, path }) => code === 'missing-registry' && path === 'citations[0].authority'));
    }
  });
});
