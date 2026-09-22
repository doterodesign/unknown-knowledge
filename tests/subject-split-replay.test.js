import test from 'node:test';
import assert from 'node:assert/strict';
import { subjectSplitReplayFixture } from './helpers/subject-split-replay-fixture.js';
import { querySubjects } from '../payload/engine/lib/subject-query.js';
import { canonicalJsonBytes, canonicalSha256 } from '../payload/engine/lib/canonical-json.js';
import { loadSubjectQueryContext } from '../payload/engine/lib/subject-query-context.js';

// Load after actual Git/core/context setup, including the pre-implementation RED.
const replay = async (input) => (await import('../payload/engine/lib/subject-split-replay.js')).compareSubjectSplitReplays(input);
const assigned = subject => ({ op: 'assigned', subject });
const not = arg => ({ op: 'not', arg });

test('real split captures establish source refusal and sorted-ID fresh-pair refusal before recipe implementation', async t => {
  const f = subjectSplitReplayFixture(t);
  await f.withInput(input => {
    const query = { version: 1, stores: ['knowledge'], view: 'current', expansion: 'direct', subjectPolicy: 'current',
      ranking: { profile: 'id-v1' }, possibleMatches: true, budgets: input.queryBudgets, where: assigned('S-000001') };
    assert.equal(querySubjects(input.before.context, query).status, 'complete');
    const after = querySubjects(input.after.context, query);
    assert.equal(after.outputVersion, 2);
    assert.equal(after.status, 'refused'); assert.equal(after.diagnostics[0].code, 'subject-split');
    const pair = { ...query, subjectPolicy: 'historical', where: { op: 'and', args: [assigned('S-000005'), not(assigned('S-000004'))] } };
    const before = querySubjects(input.before.context, pair);
    assert.equal(before.outputVersion, 2);
    assert.equal(before.status, 'refused'); assert.equal(before.diagnostics.length, 1);
    assert.equal(before.diagnostics[0].code, 'unknown-subject');
    assert.equal(before.diagnostics[0].path, '/where/args/1/arg/subject');
    assert.equal(querySubjects(input.after.context, pair).status, 'complete');
  });
});

for (const zero of [false, true]) test(`fixed split ${zero ? 'zero' : 'positive K/O/D'} recipe preserves raw comparisons and all four class counts`, async t => {
  const f = subjectSplitReplayFixture(t, { zero, kinds: ['knowledge', 'ontology', 'decision'], nested: zero, objectFormat: zero ? 'sha256' : 'sha1' });
  await f.withInput(async input => {
    const result = await replay(input);
    assert.equal(result.status, 'complete', JSON.stringify(result.diagnostics));
    assert.equal(result.kind, 'subject-split-replay'); assert.equal(result.policy.id, 'split-replay-v1');
    assert.deepEqual(result.scope.stores, ['knowledge', 'ontology', 'decisions']);
    assert.deepEqual(result.scope.originalSubjects, ['S-000001', 'S-000002', 'S-000003']);
    assert.deepEqual(result.scope.successors, ['S-000004', 'S-000005']);
    assert.deepEqual(result.scope.mappedRefs, input.core.authoredReferenceClosure.affectedRefs);
    assert.deepEqual(result.resources.inventory, { historicalCases: 216, sourceRefusalCases: 48, successorUnaryCases: 144,
      introducedPairCases: 144, requiredCases: 552, requiredQueryCalls: 1104, bytes: canonicalJsonBytes(result.inventory).length });
    assert.equal(result.inventoryDigest, canonicalSha256(result.inventory));
    assert.equal(result.comparison.resources.queries.calls, 1104);
    assert.equal(result.comparison.resources.queries.unreportedCalls, 336);
    assert.equal(result.comparison.status, 'incomplete');
    assert.equal(result.comparison.coverage.candidateDeltasComplete, false);
    assert.equal(result.assessments.length, 552); assert.ok(result.assessments.every(row => row.status === 'passed'));
    assert.ok(result.subjects.every(row => row.disposition === 'queryable'));
    assert.ok(['subjectsComplete', 'reservationComplete', 'historicalComplete', 'sourceRefusalsComplete',
      'successorUnaryComplete', 'introducedPairsComplete'].every(key => result.coverage[key] === true));
    const historical = result.comparison.cases.filter(row => row.id.startsWith('historical/'));
    for (const row of historical) for (const category of ['strict', 'possible']) {
      const delta = row.candidates[category]; assert.equal(delta.status, 'exact');
      if (zero || /\/(?:all|none|subjects-present|not-subjects-present)$/.test(row.id)) {
        assert.deepEqual(delta.added, []); assert.deepEqual(delta.removed, []);
      }
    }
    const direct = historical.find(row => row.id === 'historical/knowledge/current/direct/assigned/S-000001');
    assert.deepEqual(direct.candidates.strict.removed.map(({ ref }) => ref.id), zero ? [] : ['K-000001', 'K-000002', 'K-000003']);
    if (!zero) {
      const negated = historical.find(row => row.id === 'historical/knowledge/current/direct/not-assigned/S-000001');
      assert.ok(negated.candidates.strict.rankChanges.some(({ ref }) => !input.core.assignments.some(row => row.ref.id === ref.id)),
        'Unchanged owners retain real positional rank changes caused by preceding changed matches');
      assert.ok(direct.before.groups.knowledge.possible.some(({ ref }) => ref.id === 'K-000005'));
      assert.ok(direct.after.groups.knowledge.possible.some(({ ref }) => ref.id === 'K-000005'));
    }
    for (const row of result.comparison.cases.filter(row => !row.id.startsWith('historical/'))) {
      const side = row.id.startsWith('source-refusal/') ? 'after' : 'before';
      assert.equal(row[side].status, 'refused'); assert.equal(row[side].groups, null); assert.equal(row[side].counts, null);
      assert.equal(row[side === 'before' ? 'after' : 'before'].status, 'complete');
      assert.deepEqual(row.candidates.strict.reasons, [{ side, code: 'full-query-output-unavailable' }]);
      assert.equal(row.candidates.strict.added, null); assert.equal(row.candidates.possible.rankChanges, null);
    }
  });
});

test('every introduced pair uses the actual sorted-required-ID then first AST occurrence path', async t => {
  const f = subjectSplitReplayFixture(t, { inherited: 'introduced' });
  await f.withInput(async input => {
    const result = await replay(input); assert.equal(result.status, 'complete', JSON.stringify(result.diagnostics));
    const paths = {
      'and': ['/where/args/1/subject', '/where/args/0/subject'],
      'or': ['/where/args/1/subject', '/where/args/0/subject'],
      'and-not-right': ['/where/args/1/arg/subject', '/where/args/0/subject'],
      'and-not-left': ['/where/args/0/subject', '/where/args/1/arg/subject'],
    };
    for (const row of result.comparison.cases) {
      if (row.id.startsWith('introduced-pair/')) {
        const [, , , , form, a] = row.id.split('/');
        assert.equal(row.before.diagnostics[0].path, paths[form][a === input.core.operation.subject ? 0 : 1]);
      } else if (row.id.startsWith('successor-unary/')) {
        assert.equal(row.before.diagnostics[0].path, row.id.includes('/not-assigned/') ? '/where/arg/subject' : '/where/subject');
      } else if (row.id.startsWith('source-refusal/')) {
        assert.equal(row.after.diagnostics[0].path, row.id.includes('/not-assigned/') ? '/where/arg/subject' : '/where/subject');
      }
    }
    const source = result.subjects.find(row => row.id === input.core.operation.subject);
    for (const selected of ['current', 'equivalent']) assert.deepEqual(source.after[selected].resolution.alternatives, input.core.operation.successors);
  });
});

test('closed recipe inputs reject caller inventories, policy switches and invalid capacities', async t => {
  const f = subjectSplitReplayFixture(t);
  await f.withInput(async input => {
    for (const extra of [{ inventory: { version: 1, coverage: 'partial', cases: [] } }, { policy: 'caller' }, { mappedRefs: [] }, { execute: () => {} }]) {
      const result = await replay({ ...input, ...extra }); assert.equal(result.status, 'refused'); assert.equal(result.comparison, null);
    }
    for (const change of [{ maxCases: -1 }, { maxCases: Number.MAX_SAFE_INTEGER + 1 }, { maxSubjects: NaN }, { extra: 1 }]) {
      assert.equal((await replay({ ...input, limits: { ...input.limits, ...change } })).status, 'refused');
    }
    assert.equal((await replay({ ...input, queryBudgets: { ...input.queryBudgets, maxAstNodes: 0 } })).status, 'refused');
    const extra = { ...input }; Object.defineProperty(extra, 'policy', { value: 'caller', enumerable: false });
    assert.equal((await replay(extra)).status, 'refused');
  });
});

test('same-pair consistency refuses mismatched contexts, descriptors, digests and incomplete core scope', async t => {
  const f = subjectSplitReplayFixture(t);
  await f.withInput(async input => {
    for (const side of ['before', 'after']) {
      const result = await replay({ ...input, [side]: { ...input[side], capturedInputRef: 'different' } });
      assert.equal(result.status, 'refused'); assert.equal(result.diagnostics[0].code, 'split-replay-capture-mismatch');
    }
    const mismatched = await replay({ ...input, after: { ...input.after,
      context: { ...input.after.context, subjectGovernance: input.before.context.subjectGovernance } } });
    assert.equal(mismatched.status, 'refused'); assert.equal(mismatched.diagnostics[0].code, 'split-replay-context-mismatch');
    // Mutations test consistency only. Ordinary reports are NOT branded authority.
    for (const change of [
      core => { core.ok = false; }, core => { core.authoredReferenceClosure.status = 'incomplete'; },
      core => { core.inventory.inputs.before.registryDigest = '0'.repeat(64); },
      core => { core.inventory.inputs.candidate.identityDigest = '0'.repeat(64); },
      core => { core.inventory.inputs.candidate.commit = '0'.repeat(40); },
      core => { core.allocation.allocatedIds.reverse(); },
      core => { core.authoredReferenceClosure.affectedRefs.pop(); },
      core => { core.authoredReferenceClosure.affectedRefs.push({ ...core.authoredReferenceClosure.affectedRefs[0] }); },
      core => { core.authoredReferenceClosure.affectedRefs.push({ namespace: core.inventory.inputs.before.namespace, kind: 'knowledge', id: 'K-000006' }); },
      core => { core.assignments.pop(); }, core => { core.operation.mappings.pop(); },
      core => { core.operation.successors = ['S-000004']; core.allocation.allocatedIds = ['S-000004']; },
    ]) {
      const core = structuredClone(input.core); change(core);
      const result = await replay({ ...input, core }); assert.equal(result.status, 'refused', JSON.stringify(result.diagnostics));
      assert.equal(result.comparison, null);
    }
    for (const ids of [['S-000004', 'S-000006'], ['S-000003', 'S-000004'], ['S-000004', 'S-000005', 'S-000006']]) {
      const core = structuredClone(input.core); core.operation.successors = ids; core.allocation.allocatedIds = ids;
      const result = await replay({ ...input, core }); assert.equal(result.status, 'incomplete');
      assert.equal(result.diagnostics[0].code, 'split-replay-subject-set-mismatch'); assert.equal(result.resources.eligibility.calls, 0);
    }
  });
});

test('unavailable original historical eligibility cannot be pruned to produce a smaller inventory', async t => {
  const f = subjectSplitReplayFixture(t);
  await f.withInput(async (input, actual) => {
    const loaded = loadSubjectQueryContext({ root: actual.before.root });
    assert.equal(loaded.ok, true, JSON.stringify(loaded.diagnostics));
    const result = await replay({ ...input, before: { ...input.before, context: loaded.context } });
    assert.equal(result.status, 'incomplete'); assert.equal(result.comparison, null);
    assert.deepEqual(result.scope.originalSubjects, ['S-000001', 'S-000002', 'S-000003']);
    assert.equal(result.subjects.length, 5); assert.ok(result.subjects.some(row => row.kind === 'original' && row.disposition === 'blocked'));
  });
});

test('partial execution, truncated pages, missing explanations and wrong preparation refusals cannot pass', async t => {
  const f = subjectSplitReplayFixture(t);
  await f.withInput(async input => {
    for (const budgets of [{ maxRecords: 0 }, { maxResultsPerStore: 0 }, { maxExplanationNodes: 0 }, { maxAstNodes: 1 }]) {
      const result = await replay({ ...input, queryBudgets: { ...input.queryBudgets, ...budgets } });
      assert.equal(result.status, 'incomplete'); assert.equal(result.coverage.reservationComplete, true);
      assert.equal(result.comparison.resources.queries.calls, result.resources.inventory.requiredQueryCalls);
      assert.ok(result.assessments.some(row => row.status === 'failed'));
    }
  });
});

test('complete inventory exact-fit and one-short reservations never prune queries', async t => {
  const f = subjectSplitReplayFixture(t);
  await f.withInput(async input => {
    const complete = await replay(input);
    assert.equal(complete.status, 'complete', JSON.stringify(complete.diagnostics));
    const exact = { ...input, limits: { ...input.limits, maxSubjects: 5, maxCases: 368, maxInventoryBytes: complete.resources.inventory.bytes } };
    assert.equal((await replay(exact)).status, 'complete');
    for (const limits of [{ maxCases: 367 }, { maxCases: 144 }, { maxInventoryBytes: complete.resources.inventory.bytes - 1 }, { maxSubjects: 4 }]) {
      const result = await replay({ ...exact, limits: { ...exact.limits, ...limits } });
      assert.equal(result.status, 'incomplete'); assert.equal(result.coverage.reservationComplete, false);
      assert.equal(result.comparison?.resources.queries.calls ?? 0, 0);
      assert.ok(result.assessments.every(row => row.status === 'not-performed'));
      if (limits.maxSubjects) assert.equal(result.resources.eligibility.calls, 0);
    }
  });
});
