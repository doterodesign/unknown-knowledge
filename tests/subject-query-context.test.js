import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateSubjectQuery, querySubjects } from '../payload/engine/lib/subject-query.js';
import { indexSubjects } from '../payload/engine/lib/subjects.js';
import { evaluateSubjectGovernance } from '../payload/engine/lib/subject-governance.js';
import { subjectGovernanceFixture } from './helpers/subject-governance-fixture.js';

const limits = { version: 1, maxAstNodes: 32, maxAstDepth: 8, maxHierarchyNodes: 64,
  maxHierarchyEdges: 64, maxRedirects: 8, maxRecords: 100, maxPredicateSteps: 1000,
  maxResultsPerStore: 10, maxExplanationNodes: 1000 };
const atom = { op: 'assigned', subject: 'S-000001' };
const request = (where = atom) => ({ version: 1, stores: ['decisions'], where, budgets: { ...limits } });
function context({ unavailable = false } = {}) {
  const fixture = subjectGovernanceFixture();
  const indexed = indexSubjects(fixture.document);
  const checked = evaluateSubjectGovernance({ registry: indexed.registry, identity: fixture.identityInput.identity,
    identityIndex: fixture.identityIndex, decisionCaptures: unavailable ? [] : fixture.decisionCaptures });
  assert.equal(checked.ok, true);
  return { subjectGovernance: checked.governance, model: { ok: true, identity: fixture.identityInput.identity,
    identityIndex: fixture.identityIndex, subjectRegistry: indexed.registry,
    stores: { decisions: { present: true } },
    decisions: new Map([['D-000001', fixture.identityInput.records[0].entry]]),
    proposals: { decision: new Map() } } };
}

test('full validator checks real governance and exposes effective defaults with exact constraint paths', () => {
  const where = { op: 'or', args: [{ op: 'all' }, { op: 'not', arg: atom }] };
  const input = request(where);
  const checked = validateSubjectQuery(input, context());
  assert.equal(checked.ok, true);
  assert.equal(checked.query.where, where);
  assert.equal(checked.query.view, 'all');
  assert.equal(checked.query.expansion, 'direct');
  assert.equal(checked.query.subjectPolicy, 'current');
  assert.deepEqual(checked.requirements.constraintPaths, [
    { path: '/where', kind: 'predicate', origin: 'explicit', op: 'or' },
    { path: '/where/args/0', kind: 'predicate', origin: 'explicit', op: 'all' },
    { path: '/where/args/1', kind: 'predicate', origin: 'explicit', op: 'not' },
    { path: '/where/args/1/arg', kind: 'predicate', origin: 'explicit', op: 'assigned' },
    { path: '/stores', kind: 'selector', origin: 'explicit' },
    { path: '/view', kind: 'selector', origin: 'default' },
    { path: '/expansion', kind: 'selector', origin: 'default' },
    { path: '/subjectPolicy', kind: 'selector', origin: 'default' },
  ]);
  assert.equal(checked.requirements.subjectResolutions[0].outcome.verification, 'verified');
  assert.equal(Object.hasOwn(input, 'view'), false);
});

test('unknown subject in a decisive dead branch refuses at the original atom path', () => {
  const checked = validateSubjectQuery(request({ op: 'or', args: [{ op: 'all' },
    { op: 'assigned', subject: 'S-000002' }] }), context());
  assert.equal(checked.ok, false);
  assert.equal(checked.diagnostics[0].code, 'unknown-subject');
  assert.equal(checked.diagnostics[0].path, '/where/args/1/subject');
});

test('missing governance evidence and copied handles cannot certify query eligibility', () => {
  const unavailable = validateSubjectQuery(request(), context({ unavailable: true }));
  assert.equal(unavailable.ok, false);
  assert.equal(unavailable.diagnostics[0].code, 'governance-unavailable');
  const captured = context();
  captured.subjectGovernance = { ...captured.subjectGovernance };
  const copied = validateSubjectQuery(request({ op: 'all' }), captured);
  assert.equal(copied.ok, false);
  assert.equal(copied.diagnostics[0].code, 'governance-unavailable');
});

test('model ledger and current authorizer must match the real governance capture', () => {
  const changedIdentity = context();
  changedIdentity.model.identity = { ...changedIdentity.model.identity, allocations: [] };
  assert.equal(validateSubjectQuery(request(), changedIdentity).diagnostics[0].code, 'input-mismatch');
  const changedAuthorizer = context();
  changedAuthorizer.model.decisions.get('D-000001').record.title = 'Different captured approval';
  assert.equal(validateSubjectQuery(request(), changedAuthorizer).diagnostics[0].code, 'input-mismatch');
});

test('query preparation binds the full registry and authentic private authorizer index', () => {
  const mutations = [
    (model) => { delete model.identityIndex; },
    (model) => { model.identityIndex = { ...model.identityIndex }; },
    (model) => { model.identityIndex = subjectGovernanceFixture('archived').identityIndex; },
    (model) => {
      const document = structuredClone(model.subjectRegistry.document);
      document.subjects[0].label = 'Different captured meaning';
      model.subjectRegistry = { ...model.subjectRegistry, document };
    },
  ];
  for (const mutate of mutations) {
    const captured = context();
    mutate(captured.model);
    const checked = validateSubjectQuery(request({ op: 'all' }), captured);
    assert.equal(checked.ok, false);
    assert.equal(checked.diagnostics[0].code, 'input-mismatch');
    const executed = querySubjects(captured, request({ op: 'all' }));
    assert.equal(executed.status, 'refused');
    assert.equal(executed.groups, null);
    assert.equal(executed.counts, null);
  }
});

test('captured provenance binds effective options, input records, registry and actual evidence descriptor', () => {
  const first = validateSubjectQuery(request(), context());
  const second = validateSubjectQuery(request(), context());
  assert.equal(first.ok, true);
  assert.deepEqual(first.input, second.input);
  assert.equal(first.input.consistency, 'captured-model');
  assert.equal(first.input.inputScope, 'records-and-proposals');
  for (const name of ['records', 'registry', 'proposals', 'governance']) assert.match(first.input.inputs[name], /^[0-9a-f]{64}$/);
  assert.match(first.input.fingerprint, /^[0-9a-f]{64}$/);
  const changed = validateSubjectQuery({ ...request(), view: 'current' }, context());
  assert.notEqual(first.input.fingerprint, changed.input.fingerprint);
});

test('closed query and budget contracts refuse unsupported semantics instead of silently ignoring them', () => {
  const cases = [
    [{ version: 2 }, 'unsupported-query-version'], [{ cursor: 'old' }, 'unsupported-cursor'],
    [{ ranking: { profile: 'relevance' } }, 'unsupported-ranking'],
    [{ subjectPolicy: 'latest' }, 'unsupported-subject-policy'],
    [{ expansion: 'related' }, 'unsupported-expansion'],
    [{ possibleMatches: 'yes' }, 'invalid-query'],
    [{ applicability: { mode: 'all', jurisdictions: ['eu'] } }, 'unsupported-applicability'],
    [{ budgets: { ...limits, maxRecords: -1 } }, 'invalid-query-budget'],
    [{ budgets: { ...limits, surprise: 1 } }, 'invalid-query-budget'],
  ];
  for (const [fields, code] of cases) {
    const checked = validateSubjectQuery({ ...request(), ...fields }, context());
    assert.equal(checked.ok, false);
    assert.equal(checked.diagnostics[0].code, code);
  }
});

test('a healthy handle never masks missing selected proposal coverage or unhealthy model', () => {
  const captured = context();
  delete captured.model.proposals;
  assert.equal(validateSubjectQuery(request(), captured).diagnostics[0].code, 'unavailable-proposals');
  assert.equal(validateSubjectQuery({ ...request(), view: 'current' }, captured).ok, true);
  captured.model.ok = false;
  assert.equal(validateSubjectQuery(request(), captured).diagnostics[0].code, 'invalid-model');
});

test('unexpected implementation errors escape instead of masquerading as a query refusal', () => {
  const captured = context();
  const failure = new TypeError('simulated authorizer lookup implementation bug');
  captured.model.decisions.get = () => { throw failure; };
  assert.throws(() => validateSubjectQuery(request(), captured), (error) => error === failure);
});

test('intentionally rejected captured JSON remains a typed query diagnostic', () => {
  const captured = context();
  captured.model.decisions.get('D-000001').body = undefined;
  const checked = validateSubjectQuery(request(), captured);
  assert.equal(checked.ok, false);
  assert.equal(checked.diagnostics[0].code, 'invalid-captured-input');
});
