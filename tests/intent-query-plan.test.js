import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateIntentQueryPlan } from '../payload/engine/lib/intent-query-plan.js';
import { subjectQueryFixture, subjectQuery, assigned } from './helpers/subject-query-fixture.js';

function plan() {
  const query = subjectQuery({ op: 'and', args: [assigned('S-000001'), assigned('S-000002')] });
  const paths = ['/where', '/where/args/0', '/where/args/1', '/stores', '/view'];
  return {
    version: 1, inputRef: 'request:color-and-shape', inventoryStatus: 'declared-complete',
    units: [{ key: 'color', sourceRef: 'request:color', disposition: 'mapped' },
      { key: 'shape', sourceRef: 'request:shape', disposition: 'mapped' }],
    bindings: [], constraints: paths.map((path, i) => ({ key: `constraint-${i}`, unitKeys: ['color', 'shape'],
      origin: i === 4 ? 'inferred' : 'explicit', bindingKeys: [],
      queryRefs: [{ branch: 'strict', path }], requirementKeys: ['source'] })),
    requirements: [{ key: 'source', unitKeys: ['color', 'shape'], description: 'Read evidence for both requested meanings.' }],
    branches: [{ key: 'strict', unitKeys: ['color', 'shape'], kind: 'strict', query, assumptions: [], relaxes: [] }],
    clarifications: [],
  };
}

test('actual full validator supplies every path, generated defaults and captured query inputs', () => {
  const p = plan(); const before = structuredClone(p);
  const result = validateIntentQueryPlan(p, subjectQueryFixture());
  assert.equal(result.valid, true);
  assert.equal(result.validationScope, 'declared-inventory-and-query-provenance');
  assert.equal(result.queryValidation, 'passed');
  assert.equal(result.execution, 'not-run');
  assert.equal(result.bindingValidation, 'not-run');
  assert.equal(result.evidenceReview, 'not-run');
  assert.equal(result.readiness, 'query-validated');
  const branch = result.branches[0];
  assert.deepEqual(branch.authoredQuery, before.branches[0].query);
  assert.equal(branch.validation.query.expansion, 'direct');
  assert.equal(branch.validation.requirements.subjectResolutions.length, 2);
  assert.equal(branch.validation.input.versions.query, 1);
  assert.deepEqual(branch.provenance.map(p => p.path),
    ['/where', '/where/args/0', '/where/args/1', '/stores', '/view', '/expansion', '/subjectPolicy']);
  const defaults = branch.provenance.filter(p => p.queryOrigin === 'default');
  assert.deepEqual(defaults.map(p => p.generated), [
    { origin: 'default', validator: 'subject-query', queryVersion: 1, path: '/expansion', value: 'direct' },
    { origin: 'default', validator: 'subject-query', queryVersion: 1, path: '/subjectPolicy', value: 'current' },
  ]);
  assert.deepEqual(defaults.map(p => p.constraints), [[], []]);
  assert.equal(branch.provenance.find(p => p.path === '/view').constraints[0].origin, 'inferred');
  assert.deepEqual(result.handoff.requirements, before.requirements);
  assert.deepEqual(result.handoff.branches[0].query, before.branches[0].query);
  assert.deepEqual(result.handoff.branches[0].effectiveQuery, branch.validation.query);
  result.handoff.requirements[0].description = 'changed';
  branch.authoredQuery.where.args[0].subject = 'changed';
  assert.deepEqual(p, before);
});

test('parent coverage never hides an uncovered child, including inferred children', () => {
  const p = plan();
  p.constraints = p.constraints.filter(c => c.queryRefs[0].path !== '/where/args/1');
  const result = validateIntentQueryPlan(p, subjectQueryFixture());
  assert.equal(result.valid, false);
  assert.equal(result.handoff, null);
  assert.ok(result.diagnostics.some(d => d.code === 'uncovered-query-constraint'
    && d.path === '/branches/0/query/where/args/1'));
  assert.equal(result.queryValidation, 'passed', 'query validity and intent coverage are separate');
});

test('authored selectors require their own coverage even when equal to defaults', () => {
  for (const path of ['/stores', '/view']) {
    const p = plan(); p.constraints = p.constraints.filter(c => c.queryRefs[0].path !== path);
    assert.ok(validateIntentQueryPlan(p, subjectQueryFixture()).diagnostics
      .some(d => d.code === 'uncovered-query-constraint' && d.path.endsWith(`/query${path}`)));
  }
  const p = plan(); p.branches[0].query.expansion = 'direct';
  const result = validateIntentQueryPlan(p, subjectQueryFixture());
  assert.equal(result.valid, false);
  assert.equal(result.branches[0].provenance.find(p => p.path === '/expansion').queryOrigin, 'explicit');
  assert.ok(result.diagnostics.some(d => d.path === '/branches/0/query/expansion'));
});

test('inferred references resolve against effective defaults without rewriting authored query', () => {
  const p = plan();
  p.constraints.push({ key: 'direct-discovery', unitKeys: ['color'], origin: 'inferred', bindingKeys: [],
    queryRefs: [{ branch: 'strict', path: '/expansion' }], requirementKeys: [] });
  const result = validateIntentQueryPlan(p, subjectQueryFixture());
  assert.equal(result.valid, true, JSON.stringify(result.diagnostics));
  assert.equal(Object.hasOwn(result.handoff.branches[0].query, 'expansion'), false);
  assert.equal(result.handoff.branches[0].effectiveQuery.expansion, 'direct');
  assert.equal(result.branches[0].provenance.find(p => p.path === '/expansion').constraints[0].origin, 'inferred');
  p.constraints.at(-1).origin = 'explicit';
  const invalid = validateIntentQueryPlan(p, subjectQueryFixture());
  assert.equal(invalid.valid, false);
  assert.ok(invalid.diagnostics.some(d => d.code === 'explicit-default-claim'));
});

test('only semantic paths supplied by P4 can discharge query constraints', () => {
  for (const path of ['/where/args/0/subject', '/budgets/maxRecords', '/ranking', '/nonexistent', '']) {
    const p = plan(); p.constraints[0].queryRefs.push({ branch: 'strict', path });
    const result = validateIntentQueryPlan(p, subjectQueryFixture());
    assert.equal(result.valid, false, path);
    assert.equal(result.handoff, null);
    assert.ok(result.diagnostics.some(d => ['unrecognized-constraint-path', 'invalid-query-reference'].includes(d.code)), path);
  }
});

test('every branch validates, including unsupported applicability and invalid dead predicates', () => {
  const p = plan();
  p.branches.push({ key: 'alternate', kind: 'alternative', unitKeys: ['color'], assumptions: ['Try a different interpretation.'],
    relaxes: [], query: subjectQuery({ op: 'or', args: [{ op: 'all' }, { op: 'bogus' }] }) });
  p.branches[0].query.applicability = { jurisdictions: ['somewhere'] };
  const result = validateIntentQueryPlan(p, subjectQueryFixture());
  assert.equal(result.valid, false);
  assert.equal(result.queryValidation, 'failed');
  assert.equal(result.handoff, null);
  assert.equal(result.branches.length, 2);
  assert.ok(result.diagnostics.some(d => d.code === 'unsupported-applicability' && d.path === '/branches/0/query/applicability'));
  assert.ok(result.diagnostics.some(d => d.path.startsWith('/branches/1/query/where/args/1')));
});

test('actual governance refusal stays a query failure, and unexpected failures propagate', () => {
  const result = validateIntentQueryPlan(plan(), subjectQueryFixture({ unavailable: true }));
  assert.equal(result.valid, false);
  assert.equal(result.queryValidation, 'failed');
  assert.equal(result.handoff, null);
  assert.throws(() => validateIntentQueryPlan(plan(), { get model() { throw new Error('unexpected model failure'); } }),
    /unexpected model failure/);
});

test('invalid inventory stops before query work; open and unresolved evidence stay visible', () => {
  const context = { get model() { throw new Error('must not inspect'); } };
  assert.equal(validateIntentQueryPlan({}, context).queryValidation, 'not-run');
  const p = plan(); p.inventoryStatus = 'open';
  let result = validateIntentQueryPlan(p, subjectQueryFixture());
  assert.equal(result.valid, true);
  assert.equal(result.readiness, 'inventory-open');
  p.inventoryStatus = 'declared-complete'; p.units[1].disposition = 'unresolved';
  result = validateIntentQueryPlan(p, subjectQueryFixture());
  assert.equal(result.valid, true);
  assert.equal(result.readiness, 'unresolved-intent');
  assert.deepEqual(result.handoff.requirements, p.requirements);
});

test('recovery keeps separate provenance and cannot borrow coverage from its strict base', () => {
  const p = plan();
  p.branches.push({ key: 'recovery', kind: 'recovery', unitKeys: ['color', 'shape'], baseBranch: 'strict',
    assumptions: ['Relax shape for discovery; source must still address the original request.'],
    relaxes: ['constraint-2'], query: subjectQuery(assigned('S-000001')) });
  let result = validateIntentQueryPlan(p, subjectQueryFixture());
  assert.equal(result.valid, false);
  assert.ok(result.diagnostics.some(d => d.path === '/branches/1/query/where'));
  for (const path of ['/where', '/stores', '/view']) p.constraints.push({
    key: `recovery-${path}`, unitKeys: ['color', 'shape'], origin: 'inferred', bindingKeys: [],
    queryRefs: [{ branch: 'recovery', path }], requirementKeys: ['source'] });
  result = validateIntentQueryPlan(p, subjectQueryFixture());
  assert.equal(result.valid, true, JSON.stringify(result.diagnostics));
  assert.deepEqual(result.handoff.branches[1].relaxes, ['constraint-2']);
  assert.deepEqual(result.handoff.requirements, p.requirements);
  assert.deepEqual(result.handoff.branches[0].query, p.branches[0].query);
});
