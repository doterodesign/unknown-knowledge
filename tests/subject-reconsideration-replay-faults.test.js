import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('fixed replay checks actual-output asymmetry, partial failure and native qualification failure accounting', () => {
  const source = `
    import { test, mock } from 'node:test';
    import assert from 'node:assert/strict';
    import { withReconsiderationReplayFixture } from './tests/helpers/subject-reconsideration-gate-fixture.js';
    import * as comparator from './payload/engine/lib/subject-replay-impact.js';
    import * as query from './payload/engine/lib/subject-query.js';
    import { compareSubjectQueryCandidates } from './payload/engine/lib/subject-query-delta.js';
    import { SubjectError } from './payload/engine/lib/subject-error.js';
    let cache, alter = () => {}, throwPreparation = false;
    mock.module('./payload/engine/lib/subject-replay-impact.js', { namedExports: { ...comparator,
      compareOperationSubjectReplays(input) {
        cache ??= comparator.compareOperationSubjectReplays(input);
        const output = structuredClone(cache); alter(output); return output;
      }
    }});
    mock.module('./payload/engine/lib/subject-query.js', { namedExports: { ...query,
      validateSubjectQuery(...args) {
        const output = query.validateSubjectQuery(...args);
        if (throwPreparation) throw new SubjectError('subject-validation-budget', 'Injected native qualification failure');
        return output;
      }
    }});
    const { compareSubjectReconsiderationReplays: run } = await import('./payload/engine/lib/subject-reconsideration-replay.js');
    test('actual fixture control and isolated owner-result faults', async t => {
      await withReconsiderationReplayFixture(t, async ({ input }) => {
        assert.equal(run(input).status, 'complete');
        const changed = report => report.cases.find(row => row.id === 'knowledge/current/direct/current/all');
        const mutations = [
          ['fresh before invented complete', report => {
            const row = report.cases.find(row => row.id === 'knowledge/all/direct/current/assigned/S-000001');
            row.before = structuredClone(row.after);
            row.candidates = compareSubjectQueryCandidates({ before: row.before, after: row.after, possibleMatches: true });
          }, 'reconsideration-replay-fresh-before'],
          ['refused groups invented', report => { changed(report).before.groups = {}; }, 'reconsideration-replay-refusal-shape'],
          ['original asymmetry', report => {
            const row = changed(report);
            row.before = structuredClone(report.cases.find(row => row.id === 'knowledge/all/direct/current/all').before);
            row.before.query = structuredClone(row.specification.query);
            row.candidates = compareSubjectQueryCandidates({ before: row.before, after: row.after, possibleMatches: true });
          }, 'reconsideration-replay-refusal-delta'],
          ['last partial query', report => {
            const row = report.cases.at(-1); row.after = null; row.candidates = null;
            report.status = 'refused'; report.coverage.assessedCases--; report.coverage.candidateDeltasComplete = false;
          }, 'reconsideration-replay-execution'],
          ['mixed resource', report => { changed(report).before.diagnostics.push({ code: 'redirect-budget', path: '', message: 'exhausted' }); }, 'reconsideration-replay-resource'],
        ];
        for (const [name, mutation, code] of mutations) await t.test(name, () => {
          alter = mutation;
          const report = run(input);
          assert.equal(report.status, 'incomplete', name);
          assert.equal(report.diagnostics.at(-1).code, code);
        });
        alter = () => {}; throwPreparation = true;
        await t.test('native qualification throw retains attempt and reservation', () => {
          const report = run(input), preparation = report.resources.qualification.preparation;
          assert.equal(report.status, 'incomplete');
          assert.equal(preparation.attempted, 1); assert.equal(preparation.returned, 0);
          assert.equal(preparation.unreportedCalls, 1);
          assert.equal(preparation.reservedRedirects, input.queryBudgets.maxRedirects);
          assert.equal(preparation.usageReportedCalls + preparation.usageUnreportedCalls, 0);
          assert.equal(report.resources.qualification.rows.attempted, 0);
        });
      });
    });
  `;
  const env = { ...process.env }; delete env.NODE_TEST_CONTEXT;
  const child = spawnSync(process.execPath, ['--experimental-test-module-mocks', '--test-reporter=tap', '--input-type=module', '-e', source],
    { cwd: new URL('..', import.meta.url), env, encoding: 'utf8', timeout: 120000, maxBuffer: 8000000 });
  assert.equal(child.status, 0, `${child.stdout}\n${child.stderr}`);
  assert.match(child.stdout, /# fail 0/);
});
