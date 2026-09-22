import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withReconsiderationReplayFixture } from './helpers/subject-reconsideration-gate-fixture.js';
import { querySubjects } from '../payload/engine/lib/subject-query.js';

test('fixed actual replay preserves unknown-before refusal and unknown-assignment possible matches', async t => {
  await withReconsiderationReplayFixture(t, async ({ f, input }) => {
    const query = { version: 1, stores: ['knowledge'], view: 'all', expansion: 'direct', subjectPolicy: 'current',
      ranking: { profile: 'id-v1' }, possibleMatches: true, where: { op: 'assigned', subject: f.operation.subject }, budgets: input.queryBudgets };
    const before = querySubjects(input.before.context, query, { collect: 'results', operation: input.before.operation });
    const after = querySubjects(input.after.context, query, { collect: 'results', operation: input.after.operation });
    assert.equal(before.status, 'refused');
    assert.equal(before.diagnostics[0].code, 'unknown-subject');
    assert.equal(after.status, 'complete');
    assert.equal(after.groups.knowledge.strict.length, 0);
    assert.deepEqual(after.groups.knowledge.possible.map(row => row.ref.id), ['K-000002']);
    const { compareSubjectReconsiderationReplays } = await import('../payload/engine/lib/subject-reconsideration-replay.js');
    const result = compareSubjectReconsiderationReplays(input);
    assert.equal(result.status, 'complete', JSON.stringify(result.diagnostics));
    assert.equal(result.coverage.assessmentComplete, true);
    assert.equal(result.coverage.membershipComplete, false);
    assert.equal(result.comparison.resources.queries.calls, 2 * result.inventory.cases.length);
    assert.equal(result.inventory.cases.length, 216);
    assert.equal(result.resources.eligibility.attempted, 3);
    const prep = result.resources.qualification.preparation;
    assert.ok(prep.attempted > 0);
    assert.equal(prep.reservedRedirects, prep.attempted * input.queryBudgets.maxRedirects);
    assert.ok(prep.usageUnreportedCalls > 0);
  });
});

test('nonroot fresh pairs retain all four native metamorphisms without pruning original operands', async t => {
  await withReconsiderationReplayFixture(t, async ({ input }) => {
    const { compareSubjectReconsiderationReplays: run } = await import('../payload/engine/lib/subject-reconsideration-replay.js');
    const report = run(input);
    assert.equal(report.status, 'complete', JSON.stringify(report.diagnostics));
    assert.equal(report.inventory.cases.length, 432);
    assert.equal(report.resources.eligibility.attempted, 9);
    assert.equal(report.metamorphic.requiredPairs, 144);
    assert.equal(report.metamorphic.comparedPairs + report.metamorphic.expectedRefusedPairs, 144);
    assert.equal(report.metamorphic.incompletePairs, 0);
    assert.ok(report.metamorphic.comparedPairs > 0);
    const counts = report.resources.qualification;
    assert.equal(counts.preparation.attempted, report.comparison.cases.reduce((n, row) => n
      + Number(row.before.status === 'refused') + Number(row.after.status === 'refused'), 0));
    assert.ok(counts.rows.attempted <= counts.preparation.attempted);
    for (const [key, cap] of [['maxSubjects', 1], ['maxCases', 431], ['maxInventoryBytes', report.resources.inventory.bytes - 1]]) {
      const short = run({ ...input, limits: { ...input.limits, [key]: cap } });
      assert.equal(short.status, 'incomplete');
      assert.equal(short.comparison, null);
      assert.equal(short.resources.eligibility.attempted, 0);
    }
    const exact = run({ ...input, limits: { ...input.limits, maxCases: 432,
      maxInventoryBytes: report.resources.inventory.bytes, maxSubjects: 2 } });
    assert.equal(exact.status, 'complete');
    for (const [key, cap] of [['maxRecords', 0], ['maxResultsPerStore', 0], ['maxExplanationNodes', 0]]) {
      const short = run({ ...input, queryBudgets: { ...input.queryBudgets, [key]: cap } });
      assert.equal(short.status, 'incomplete');
      assert.equal(short.coverage.assessmentComplete, false);
    }
  }, { parent: true, related: true });
});

test('unavailable unrelated original and coassigned owner use native qualification without global history approval', async t => {
  await withReconsiderationReplayFixture(t, async ({ input }) => {
    const { compareSubjectReconsiderationReplays } = await import('../payload/engine/lib/subject-reconsideration-replay.js');
    const report = compareSubjectReconsiderationReplays(input);
    assert.equal(report.status, 'complete', JSON.stringify(report.diagnostics));
    assert.ok(report.subjects.some(row => row.id === 'S-000002' && row.outcome.eligible === null));
    const rows = report.resources.qualification.rows;
    assert.ok(rows.attempted > 0);
    assert.equal(rows.reservedRedirects, rows.attempted * input.queryBudgets.maxRedirects);
    assert.equal(rows.returned, rows.attempted);
    assert.equal(rows.usageUnreportedCalls, 0);
    assert.equal(report.metamorphic.incompletePairs, 0);
  }, { unavailableOriginal: true, assignedUnavailable: true });
});

test('qualification reservation exact fit, one short, and zero native redirect caps', async t => {
  await withReconsiderationReplayFixture(t, async ({ input }) => {
    const { compareSubjectReconsiderationReplays: run } = await import('../payload/engine/lib/subject-reconsideration-replay.js');
    const positive = run(input);
    assert.equal(positive.status, 'complete');
    const q = positive.resources.qualification;
    const reservation = q.preparation.reservedRedirects + q.rows.reservedRedirects;
    assert.ok(reservation > 0);
    const exact = run({ ...input, limits: { ...input.limits, maxQualificationRedirects: reservation } });
    assert.equal(exact.status, 'complete');
    const short = run({ ...input, limits: { ...input.limits, maxQualificationRedirects: reservation - 1 } });
    assert.equal(short.status, 'incomplete');
    assert.equal(short.diagnostics.at(-1).code, 'reconsideration-qualification-budget');
    assert.equal(short.resources.qualification.preparation.attempted, q.preparation.attempted - 1);
    const zero = run({ ...input, limits: { ...input.limits, maxQualificationRedirects: 0 }, queryBudgets: { ...input.queryBudgets, maxRedirects: 0 } });
    assert.equal(zero.status, 'complete', JSON.stringify(zero.diagnostics));
    assert.equal(zero.resources.qualification.preparation.reservedRedirects, 0);
    assert.ok(zero.resources.qualification.preparation.attempted > 0);
  });
});
