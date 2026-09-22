import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('fixed split assessment rejects corrupted owner outputs without a production injection API', t => {
  // Isolated module mocks alter real returned results. Production has no caller
  // comparator/executor seam, and all contexts/core/query results originate in
  // the real committed fixture. Query-output mutations recompute actual deltas.
  const source = `
    import test, { mock } from 'node:test';
    import assert from 'node:assert/strict';
    import { subjectSplitReplayFixture } from './tests/helpers/subject-split-replay-fixture.js';
    import * as comparator from './payload/engine/lib/subject-replay-impact.js';
    import * as governance from './payload/engine/lib/subject-governance.js';
    import { SubjectError } from './payload/engine/lib/subjects.js';
    import { compareSubjectQueryCandidates } from './payload/engine/lib/subject-query-delta.js';
    let baseline, last, calls = 0, alter = () => {}, alterEligibility = outcome => outcome;
    mock.module('./payload/engine/lib/subject-replay-impact.js', { namedExports: {
      ...comparator, compareSubjectReplays(input) {
        calls++;
        baseline ??= comparator.compareSubjectReplays(input);
        last = structuredClone(baseline); alter(last); return last;
      }
    }});
    mock.module('./payload/engine/lib/subject-governance.js', { namedExports: {
      ...governance, subjectEligibility(...args) { return alterEligibility(governance.subjectEligibility(...args)); }
    }});
    const { compareSubjectSplitReplays: replay } = await import('./payload/engine/lib/subject-split-replay.js');
    test('actual core and paired outputs support isolated defensive assessments', async t => {
      const f = subjectSplitReplayFixture(t);
      await f.withInput(async input => {
        const good = replay(input); assert.equal(good.status, 'complete', JSON.stringify(good.diagnostics));
        assert.equal(calls, 1); assert.equal(good.comparison, last, 'Raw comparator object is retained without rewriting');
        const sourceRow = report => report.cases.find(row => row.id.startsWith('source-refusal/'));
        const freshRow = report => report.cases.find(row => row.id.startsWith('successor-unary/'));
        const pairRow = report => report.cases.find(row => row.id.startsWith('introduced-pair/') && row.id.includes('/and-not-left/S-000004/S-000005'));
        const historical = report => report.cases.find(row => row.id === 'historical/knowledge/current/direct/assigned/S-000001');
        const baselineRow = report => report.cases.find(row => row.id === 'historical/knowledge/current/direct/all');
        const recompute = row => { row.candidates = compareSubjectQueryCandidates({ before: row.before, after: row.after, possibleMatches: true }); };
        const outsider = { ref: f.ref('K-000006') };
        const changes = [
          ['source missing output version', report => { delete sourceRow(report).after.outputVersion; }],
          ['source old output version', report => { sourceRow(report).after.outputVersion = 1; }],
          ['fresh missing output version', report => { delete freshRow(report).before.outputVersion; }],
          ['fresh unknown output version', report => { freshRow(report).before.outputVersion = 3; }],
          ['source wrong code', report => { sourceRow(report).after.diagnostics[0].code = 'subject-retired'; }],
          ['source wrong path', report => { sourceRow(report).after.diagnostics[0].path = '/where/arg/subject'; }],
          ['source extra diagnostic', report => { sourceRow(report).after.diagnostics.push({ code: 'other', path: '', message: 'Other' }); }],
          ['source empty message', report => { sourceRow(report).after.diagnostics[0].message = ' '; }],
          ['source nonnull groups', report => { sourceRow(report).after.groups = {}; }],
          ['source nonnull counts', report => { sourceRow(report).after.counts = {}; }],
          ['source wrong reason side', report => { sourceRow(report).candidates.strict.reasons[0].side = 'before'; }],
          ['fresh wrong reason side', report => { freshRow(report).candidates.possible.reasons[0].side = 'after'; }],
          ['fresh invented empty delta', report => { freshRow(report).candidates.strict.added = []; }],
          ['fresh extra diagnostic field', report => { freshRow(report).before.diagnostics[0].extra = true; }],
          ['fresh wrong code', report => { freshRow(report).before.diagnostics[0].code = 'subject-split'; }],
          ['pair wrong AST-first path', report => { pairRow(report).before.diagnostics[0].path = '/where/args/0/subject'; }],
          ['fresh opposite side incomplete', report => { const row = freshRow(report); row.after.coverage.evaluationComplete = false; recompute(row); }],
          ['source opposite side incomplete', report => { const row = sourceRow(report); row.before.coverage.rankComplete = false; recompute(row); }],
          ['historical strict outsider', report => { historical(report).candidates.strict.added.push(outsider); }],
          ['historical possible outsider', report => { historical(report).candidates.possible.removed.push(outsider); }],
          ['historical proposal identity', report => { historical(report).candidates.strict.added.push({ proposalRef: {
            namespace: f.ref('K-000001').namespace, kind: 'knowledge', key: 'proposal:knowledge:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' } }); }],
          ['baseline changed even for mapped ref', report => { baselineRow(report).candidates.strict.removed.push({ ref: f.ref('K-000001') }); }],
          ['missing actual case', report => { report.cases.pop(); }],
          ['duplicate actual case', report => { report.cases.push(structuredClone(report.cases[0])); }],
          ['changed actual specification', report => { historical(report).specification.query.where.subject = 'S-000002'; }],
        ];
        for (const [label, mutation] of changes) await t.test(label, () => {
          alter = mutation; const prior = calls; const result = replay(input);
          assert.equal(calls, prior + 1, 'One complete combined comparator invocation');
          assert.equal(result.status, 'incomplete', label); assert.equal(result.comparison, last);
          assert.equal(result.diagnostics.at(-1).code, 'split-replay-assessment-incomplete');
        });
        alter = () => {};
        for (const [label, mutation] of [
          ['missing source alternative', outcome => { outcome.resolution.alternatives.pop(); }],
          ['reordered source alternatives', outcome => { outcome.resolution.alternatives.reverse(); }],
          ['wrong source refusal code', outcome => { outcome.code = 'subject-retired'; }],
        ]) await t.test(label, () => {
          alterEligibility = outcome => { if (outcome.code === 'subject-split') mutation(outcome); return outcome; };
          const prior = calls; const result = replay(input);
          assert.equal(calls, prior); assert.equal(result.status, 'incomplete'); assert.equal(result.comparison, null);
          assert.equal(result.diagnostics.at(-1).code, 'split-replay-eligibility-unavailable');
        });
        await t.test('native eligibility failure remains unreported work and prevents all queries', () => {
          alterEligibility = () => { throw new SubjectError('redirect-budget', 'Injected owner refusal'); };
          const prior = calls; const result = replay(input);
          assert.equal(calls, prior); assert.equal(result.status, 'incomplete');
          assert.deepEqual(result.resources.eligibility, { calls: 1, returnedCalls: 0, unreportedCalls: 1, used: { redirects: 0 } });
          assert.deepEqual(result.coverage.unassessedSubjectIds, ['S-000001','S-000002','S-000003','S-000004','S-000005']);
        });
      });
    });
  `;
  const env = { ...process.env }; delete env.NODE_TEST_CONTEXT;
  const child = spawnSync(process.execPath, ['--experimental-test-module-mocks', '--test-reporter=tap', '--input-type=module', '-e', source],
    { cwd: new URL('..', import.meta.url), env, encoding: 'utf8', timeout: 180000, maxBuffer: 8 * 1024 * 1024 });
  assert.equal(child.status, 0, `${child.stdout}\n${child.stderr}`);
  assert.match(child.stdout, /# tests 30/);
  assert.match(child.stdout, /# fail 0/);
  t.diagnostic('Isolated actual-output fault child: 30/30 TAP tests passed (29 adversarial subtests plus enclosing test).');
});
