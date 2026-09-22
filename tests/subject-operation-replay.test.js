import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as replay from '../payload/engine/lib/subject-replay-impact.js';
import { createSubjectOperation, getSubjectOperationResources } from '../payload/engine/lib/subject-operation.js';
import { querySubjects } from '../payload/engine/lib/subject-query.js';
import { loadSubjectQueryContext } from '../payload/engine/lib/subject-query-context.js';
import { subjectReconsiderationGateFixture } from './helpers/subject-reconsideration-gate-fixture.js';

test('fixed comparator executes actual bounded contexts and refuses operation substitution', t => {
  const f = subjectReconsiderationGateFixture(t);
  const operation = createSubjectOperation(f.impact.contexts.after);
  const loaded = loadSubjectQueryContext({ root: f.repoRoot, ...f.evidence, operation });
  assert.equal(loaded.ok, true, JSON.stringify(loaded.diagnostics));
  const { context } = loaded;
  const side = { capturedInputRef: f.candidate.tree, context, operation };
  const input = { version: 1, before: side, after: side, limits: { version: 1, maxCases: 1, maxInventoryBytes: 10000 },
    inventory: { version: 1, coverage: 'complete', cases: [{ id: 'actual', query: {
      version: 1, stores: ['knowledge'], view: 'all', expansion: 'direct', subjectPolicy: 'current',
      ranking: { profile: 'id-v1' }, possibleMatches: true, where: { op: 'assigned', subject: f.operation.subject }, budgets: f.impact.query,
    } }] } };
  assert.equal(typeof replay.compareOperationSubjectReplays, 'function');
  const result = replay.compareOperationSubjectReplays(input);
  assert.equal(result.status, 'complete', JSON.stringify(result.diagnostics));
  assert.equal(result.resources.queries.calls, 2);
  const substituted = replay.compareOperationSubjectReplays({ ...input,
    after: { ...side, operation: createSubjectOperation(f.impact.contexts.after) } });
  assert.equal(substituted.status, 'refused');
  assert.equal(substituted.diagnostics[0].code, 'operation-context-mismatch');
  assert.equal(substituted.resources.queries.calls, 0);
  assert.deepEqual(substituted.cases, []);
  assert.equal(substituted.input, null);
  assert.equal(substituted.coverage.reservationComplete, false);
  const semantic = replay.compareOperationSubjectReplays({ ...input, inventory: { ...input.inventory,
    cases: [{ id: 'missing', query: { ...input.inventory.cases[0].query, where: { op: 'assigned', subject: 'S-999999' } } }] } });
  assert.equal(semantic.cases[0].before.status, 'refused');
  assert.equal(semantic.resources.queries.calls, 2);
  assert.equal(semantic.resources.queries.returnedCalls, 2);
  assert.equal(semantic.resources.queries.unreportedCalls, 0);
  assert.equal(semantic.resources.queries.usageReportedCalls, 0);
  assert.equal(semantic.resources.queries.usageUnreportedCalls, 2);
  const absent = replay.compareOperationSubjectReplays({ version: 1, before: side, after: side, limits: input.limits });
  assert.equal(absent.status, 'not-assessed');
  for (const key of ['calls', 'returnedCalls', 'unreportedCalls', 'usageReportedCalls', 'usageUnreportedCalls'])
    assert.equal(absent.resources.queries[key], 0, key);
});

for (const priorCases of [0, 1]) test(`bounded comparator retains native thrown-call accounting after ${priorCases} completed cases`, t => {
  const f = subjectReconsiderationGateFixture(t);
  const operation = createSubjectOperation(f.impact.contexts.after);
  const loaded = loadSubjectQueryContext({ root: f.repoRoot, ...f.evidence, operation });
  assert.equal(loaded.ok, true);
  const { context } = loaded, budget = getSubjectOperationResources(operation).subjectOperationBudget;
  const side = { capturedInputRef: f.candidate.tree, context, operation };
  const query = { version: 1, stores: ['knowledge'], view: 'all', expansion: 'direct', subjectPolicy: 'current',
    ranking: { profile: 'id-v1' }, possibleMatches: true, where: { op: 'all' }, budgets: f.impact.query };
  const base = { version: 1, before: side, after: side, limits: { version: 1, maxCases: 3, maxInventoryBytes: 10000 } };
  const start = budget.used.validationSteps;
  assert.equal(replay.compareOperationSubjectReplays({ ...base, inventory: { version: 1, coverage: 'complete', cases: [] } }).status, 'complete');
  const bindingSteps = budget.used.validationSteps - start;
  const beforeQuery = budget.used.validationSteps;
  assert.equal(querySubjects(context, query, { collect: 'results', operation }).status, 'complete');
  const querySteps = budget.used.validationSteps - beforeQuery;
  budget.charge('validationSteps', f.impact.contexts.after.validation.maxValidationSteps - budget.used.validationSteps
    - bindingSteps - priorCases * 2 * querySteps - 1, 'fixture-leave-native-query-failure');
  const report = replay.compareOperationSubjectReplays({ ...base, inventory: { version: 1, coverage: 'complete',
    cases: [0, 1, 2].map(index => ({ id: `case-${index}`, query })) } });
  assert.equal(report.status, 'refused');
  assert.equal(budget.failure.phase, 'corpus-record');
  assert.equal(report.resources?.queries.calls, priorCases * 2 + 1);
  assert.equal(report.resources.queries.returnedCalls, priorCases * 2);
  assert.equal(report.resources.queries.unreportedCalls, 1);
  assert.equal(report.coverage.assessedCases, priorCases);
  assert.equal(report.cases.length, priorCases + 1);
  assert.equal(report.cases.at(-1).before, null);
  assert.equal(report.cases.at(-1).after, null);
  assert.equal(report.cases.at(-1).candidates, null);
  if (priorCases) assert.equal(report.cases[0].before.status, 'complete');
  assert.equal(report.diagnostics.at(-1).caseId, `case-${priorCases}`);
  assert.equal(report.diagnostics.at(-1).side, 'before');
});
