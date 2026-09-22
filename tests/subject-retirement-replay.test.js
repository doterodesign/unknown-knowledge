import test from 'node:test';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { retirementReplayFixture } from './helpers/subject-retirement-replay-fixture.js';
import { querySubjects } from '../payload/engine/lib/subject-query.js';
import { canonicalJsonBytes, canonicalSha256 } from '../payload/engine/lib/canonical-json.js';

// Import only after actual captured contexts have loaded, including the pre-implementation RED run.
const replay = async (input) => (await import('../payload/engine/lib/subject-retirement-replay.js')).compareRetirementReplays(input);
const assigned = { op: 'assigned', subject: 'S-000001' };

test('actual P4 assigned and NOT probes return source preparation refusal with exact paths', async (t) => {
  const f = retirementReplayFixture(t);
  await f.withInput((input) => {
    for (const subjectPolicy of ['current', 'equivalent']) for (const [where, path] of [
      [assigned, '/where/subject'], [{ op: 'not', arg: assigned }, '/where/arg/subject'],
    ]) {
      const query = { version: 1, stores: ['knowledge'], view: 'current', expansion: 'direct', subjectPolicy,
        ranking: { profile: 'id-v1' }, possibleMatches: true, budgets: input.queryBudgets, where };
      assert.equal(querySubjects(input.before.context, query).status, 'complete');
      const result = querySubjects(input.after.context, query);
      assert.deepEqual(Object.keys(result).sort(), ['counts', 'diagnostics', 'groups', 'outputVersion', 'status']);
      assert.equal(result.outputVersion, 2);
      assert.equal(result.status, 'refused'); assert.equal(result.groups, null); assert.equal(result.counts, null);
      assert.equal(result.diagnostics.length, 1); assert.equal(result.diagnostics[0].code, 'subject-retired');
      assert.equal(result.diagnostics[0].path, path);
    }
  });
});

test('retirement expected-refusal decoder rejects absent, unsupported and mixed output versions', () => {
  const source = `
    import test, { mock } from 'node:test';
    import assert from 'node:assert/strict';
    import { retirementReplayFixture } from './tests/helpers/subject-retirement-replay-fixture.js';
    import * as comparator from './payload/engine/lib/subject-replay-impact.js';
    let baseline, alter = () => {};
    mock.module('./payload/engine/lib/subject-replay-impact.js', { namedExports: {
      ...comparator, compareSubjectReplays(input) {
        baseline ??= comparator.compareSubjectReplays(input);
        const result = structuredClone(baseline); alter(result); return result;
      }
    }});
    const { compareRetirementReplays: replay } = await import('./payload/engine/lib/subject-retirement-replay.js');
    test('actual paired results with isolated output corruptions', async t => {
      const fixture = retirementReplayFixture(t);
      await fixture.withInput(input => {
        assert.equal(replay(input).status, 'complete');
        for (const corrupt of [output => { delete output.outputVersion; },
          output => { output.outputVersion = 1; }, output => { output.outputVersion = 3; },
          output => { output.assignmentEvidence = {}; }]) {
          alter = result => corrupt(result.cases.find(row => row.id.startsWith('refusal/')).after);
          const result = replay(input);
          assert.equal(result.status, 'incomplete');
          assert.equal(result.coverage.historicalComplete, true);
          assert.equal(result.coverage.expectedRefusalsComplete, false);
        }
      });
    });
  `;
  const env = { ...process.env }; delete env.NODE_TEST_CONTEXT;
  const child = spawnSync(process.execPath, ['--experimental-test-module-mocks', '--input-type=module', '-e', source],
    { cwd: new URL('..', import.meta.url), env, encoding: 'utf8', timeout: 180000 });
  assert.equal(child.status, 0, `${child.stdout}\n${child.stderr}`);
});

for (const descendants of [false, true]) test(`fixed retirement recipe retains actual deltas, unknowns and ${descendants ? 'inherited exposure' : 'direct withdrawal'}`, async (t) => {
  const f = retirementReplayFixture(t, { descendants, nested: descendants });
  await f.withInput(async (input) => {
    const result = await replay(input);
    assert.equal(result.status, 'complete', JSON.stringify(result.diagnostics));
    assert.deepEqual(result.scope.stores, ['knowledge', 'decisions']);
    assert.equal(result.inventory.cases.length, 176);
    assert.equal(result.resources.inventory.historicalCases, 144); assert.equal(result.resources.inventory.refusalCases, 32);
    assert.equal(result.resources.inventory.requiredQueryCalls, 352);
    assert.equal(result.comparison.resources.queries.calls, 352);
    assert.equal(result.comparison.resources.queries.unreportedCalls, 32, 'Preparation refusal does not invent zero counters');
    assert.equal(result.comparison.status, 'incomplete');
    assert.equal(result.comparison.coverage.candidateDeltasComplete, false);
    assert.equal(result.inventoryDigest, canonicalSha256(result.inventory));
    assert.equal(result.resources.inventory.bytes, canonicalJsonBytes(result.inventory).length);
    assert.ok(result.subjects.every((row) => row.disposition === 'queryable' && row.before.verification === 'verified' && row.after.verification === 'verified'));
    assert.equal(result.assessments.length, 176); assert.ok(result.assessments.every((row) => row.status === 'passed'));
    const cases = result.comparison.cases;
    const direct = cases.find(({ id }) => id === 'historical/knowledge/current/direct/assigned/S-000001');
    assert.deepEqual(direct.candidates.strict.removed.map(({ ref }) => ref.id), ['K-000001', 'K-000002']);
    const negated = cases.find(({ id }) => id === 'historical/knowledge/current/direct/not-assigned/S-000001');
    assert.deepEqual(negated.candidates.strict.added.map(({ ref }) => ref.id), ['K-000001', 'K-000002']);
    assert.ok(direct.before.groups.knowledge.possible.some(({ ref }) => ref.id === 'K-000005'));
    assert.ok(direct.after.groups.knowledge.possible.some(({ ref }) => ref.id === 'K-000005'));
    if (descendants) {
      const expanded = cases.find(({ id }) => id === 'historical/knowledge/current/self-and-descendants/assigned/S-000001');
      assert.ok(expanded.candidates.strict.retained.some(({ ref }) => ref.id === 'K-000002'));
      assert.ok(expanded.candidates.strict.retained.some(({ ref }) => ref.id === 'K-000003'));
    }
    for (const row of cases.filter(({ id }) => id.startsWith('refusal/'))) {
      assert.equal(row.before.status, 'complete'); assert.equal(row.after.status, 'refused');
      assert.equal(row.after.input, undefined); assert.equal(row.candidates.status, 'unavailable');
      assert.equal(row.candidates.strict.added, null); assert.equal(row.candidates.possible.removed, null);
      assert.deepEqual(row.candidates.strict.reasons, [{ side: 'after', code: 'full-query-output-unavailable' }]);
    }
    assert.deepEqual(await replay(input), result, 'Same captures and limits produce the same complete report');
  });
});

test('combined case/byte reservation admits exact fit and refuses one short without queries', async (t) => {
  const f = retirementReplayFixture(t);
  await f.withInput(async (input) => {
    const complete = await replay(input);
    const exact = { ...input, limits: { ...input.limits, maxCases: 176, maxInventoryBytes: complete.resources.inventory.bytes } };
    assert.equal((await replay(exact)).status, 'complete');
    for (const limits of [
      { maxCases: 175 }, { maxCases: 144 }, { maxInventoryBytes: complete.resources.inventory.bytes - 1 }, { maxSubjects: 2 },
    ]) {
      const result = await replay({ ...exact, limits: { ...exact.limits, ...limits } });
      assert.equal(result.status, 'incomplete'); assert.equal(result.coverage.reservationComplete, false);
      assert.equal(result.comparison?.resources.queries.calls ?? 0, 0);
      assert.ok(result.assessments.every(({ status }) => status === 'not-performed'));
    }
  });
});

test('partial execution, truncated pages and missing explanations cannot pass expected probes', async (t) => {
  const f = retirementReplayFixture(t, { descendants: true });
  await f.withInput(async (input) => {
    for (const budgets of [{ maxRecords: 1 }, { maxResultsPerStore: 0 }, { maxExplanationNodes: 0 }, { maxHierarchyNodes: 0 }]) {
      const result = await replay({ ...input, queryBudgets: { ...input.queryBudgets, ...budgets } });
      assert.equal(result.status, 'incomplete', JSON.stringify(budgets));
      assert.equal(result.coverage.historicalComplete, false);
      assert.equal(result.coverage.expectedRefusalsComplete, false);
      assert.ok(result.assessments.some(({ status }) => status === 'failed'));
    }
  });
});

test('an unrelated retired record assignment refusal cannot stand in for a successful before probe', async (t) => {
  const f = retirementReplayFixture(t, { unrelatedRetired: true });
  const result = await f.withInput(replay);
  assert.equal(result.status, 'incomplete'); assert.equal(result.coverage.historicalComplete, true);
  assert.equal(result.coverage.expectedRefusalsComplete, false);
  assert.equal(result.subjects.length, 3, 'Original unrelated retired operands are not omitted');
  const row = result.comparison.cases.find(({ id }) => id === 'refusal/knowledge/current/direct/current/assigned/S-000001');
  assert.equal(row.before.status, 'refused'); assert.equal(row.before.coverage.invalidRecordEncountered, true);
  assert.ok(row.candidates.strict.reasons.some(({ side }) => side === 'before'));
});

test('unverified historical eligibility blocks the full inventory without operand omission', async (t) => {
  const f = retirementReplayFixture(t, { missingEvidence: true });
  const result = await f.withInput(replay);
  assert.equal(result.status, 'incomplete'); assert.equal(result.comparison, null);
  assert.equal(result.subjects.length, 3); assert.ok(result.subjects.some(({ disposition }) => disposition === 'blocked'));
});

test('caller partial inventories and policy overrides are refused; zero AST and subject caps cannot pass', async (t) => {
  const f = retirementReplayFixture(t);
  await f.withInput(async (input) => {
    for (const extra of [{ inventory: { version: 1, coverage: 'partial', cases: [] } }, { policy: 'caller-selected' }]) {
      const result = await replay({ ...input, ...extra }); assert.equal(result.status, 'refused'); assert.equal(result.comparison, null);
    }
    const result = await replay({ ...input, queryBudgets: { ...input.queryBudgets, maxAstNodes: 1 } });
    assert.equal(result.status, 'incomplete'); assert.equal(result.coverage.expectedRefusalsComplete, false);
    const invalid = await replay({ ...input, queryBudgets: { ...input.queryBudgets, maxAstNodes: 0 } });
    assert.equal(invalid.status, 'refused');
  });
});

test('still-active candidate never satisfies the retirement transition', async (t) => {
  const f = retirementReplayFixture(t, { candidateActive: true });
  const result = await f.withInput(replay);
  assert.notEqual(result.status, 'complete');
});
