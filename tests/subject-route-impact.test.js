import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareSubjectRoutes } from '../payload/engine/lib/subject-route-impact.js';
import { subjectQueryDiskFixture } from './helpers/subject-query-disk-fixture.js';
import { subjectQuery, queryBudgets } from './helpers/subject-query-fixture.js';
import { indexSubjects } from '../payload/engine/lib/subjects.js';
import { evaluateSubjectGovernance } from '../payload/engine/lib/subject-governance.js';
import { canonicalSha256 } from '../payload/engine/lib/canonical-json.js';
import { loadSubjectQueryContext } from '../payload/engine/lib/subject-query-context.js';

const limits = { version: 1, maxRoutes: 10, maxPathNodes: 20, maxPathEdges: 20 };
const intersection = (id = 'color', query = {}) => {
  const { where, ...queryOptions } = subjectQuery(undefined, query);
  return { id, route: { version: 1, kind: 'intersection', subjects: ['S-000001'] }, queryOptions };
};
const path = (subjects = ['S-000002']) => ({ id: 'shape-path', route: { version: 1, kind: 'semantic-path', subjects } });
function setup(t) {
  const fixture = subjectQueryDiskFixture(t);
  const before = fixture.context;
  const afterModel = { ...before.model, leaves: new Map([...before.model.leaves].map(([id, entry]) => [id, structuredClone(entry)])),
    proposals: { ...before.model.proposals, knowledge: new Map([...before.model.proposals.knowledge]
      .map(([id, entry]) => [id, structuredClone(entry)])) } };
  const after = { ...before, model: afterModel };
  const input = { version: 1, before: { capturedInputRef: 'before', context: before },
    after: { capturedInputRef: 'after', context: after },
    inventory: { version: 1, coverage: 'complete', routes: [intersection()] }, limits: { ...limits } };
  const change = (action, id, fields) => {
    const document = structuredClone(before.model.subjectRegistry.document);
    const subject = document.subjects.find((row) => row.id === id);
    const { id: ignored, changes, ...oldState } = subject;
    const newState = { ...structuredClone(oldState), ...fields };
    const event = { id: '34567890-1234-4234-8234-123456789abc', action,
      decision: document.history[0].decision, rows: [{ id, before: oldState, after: newState }],
      reason: 'Reviewed fixture change', ...(['rename', 'clarify'].includes(action) ? { unchangedMeaning: true } : {}) };
    event.review = { ...document.history[0].review, changeDigest: canonicalSha256(event) };
    document.history.push(event);
    document.subjects[document.subjects.indexOf(subject)] = { id, ...newState, changes: [...changes, event.id] };
    document.revision += 1;
    if (action === 'reparent') document.hierarchyRevision += 1;
    const indexed = indexSubjects(document);
    assert.equal(indexed.ok, true, JSON.stringify(indexed.diagnostics));
    afterModel.subjectRegistry = indexed.registry;
    const evaluated = evaluateSubjectGovernance({ registry: indexed.registry, identity: afterModel.identity,
      identityIndex: afterModel.identityIndex, decisionCaptures: fixture.decisionCaptures });
    assert.equal(evaluated.ok, true, JSON.stringify(evaluated.diagnostics));
    after.subjectGovernance = evaluated.governance;
  };
  return { fixture, before, after, input, change };
}

test('label-only change is separate from exact candidate membership and rank', (t) => {
  const f = setup(t); f.change('rename', 'S-000001', { label: 'Colour' });
  const result = compareSubjectRoutes(f.input);
  assert.equal(result.status, 'complete');
  const route = result.routes[0];
  assert.equal(route.candidates.strict.status, 'exact');
  assert.deepEqual(route.candidates.strict.added, []);
  assert.deepEqual(route.candidates.strict.removed, []);
  assert.deepEqual(route.candidates.strict.retained.map(({ ref }) => ref.id), ['K-000001', 'K-000002']);
  assert.deepEqual(route.candidates.strict.rankChanges, []);
  assert.deepEqual(route.display.labels.changes, [{ subject: 'S-000001', before: 'Color', after: 'Colour' }]);
  assert.notEqual(route.before.execution.input.fingerprint, route.after.execution.input.fingerprint);
  assert.equal(result.resources.queries.calls, 2);
  assert.equal(result.resources.queries.used.recordsStarted, 12);
  assert.equal(result.regeneratedViews.status, 'not-assessed');
});

test('reparented actual paths and descendant membership are independently compared', (t) => {
  const f = setup(t); f.change('reparent', 'S-000002', { parent: 'S-000001' });
  f.input.inventory.routes = [path(), intersection('color', { expansion: 'self-and-descendants' })];
  const result = compareSubjectRoutes(f.input);
  assert.equal(result.status, 'complete');
  const query = result.routes.find(({ id }) => id === 'color');
  assert.deepEqual(query.candidates.strict.added.map(({ ref }) => ref.id), ['K-000003']);
  const semantic = result.routes.find(({ id }) => id === 'shape-path');
  assert.equal(semantic.before.status, 'valid');
  assert.equal(semantic.after.status, 'invalid');
  assert.deepEqual(semantic.after.actualPath, ['S-000001', 'S-000002']);
  assert.equal(semantic.display.path.changed, true);
  assert.equal(semantic.candidates.status, 'not-applicable');
});

test('missing, explicit empty and partial supplied inventories remain distinct', (t) => {
  const f = setup(t);
  for (const inventory of [undefined, null]) {
    const result = compareSubjectRoutes({ ...f.input, inventory });
    assert.equal(result.status, 'not-assessed');
    assert.equal(result.routes, null);
  }
  f.input.inventory.routes = [];
  const empty = compareSubjectRoutes(f.input);
  assert.equal(empty.status, 'complete');
  assert.equal(empty.scope.inventoryBasis, 'caller-supplied');
  f.input.inventory.coverage = 'partial';
  assert.equal(compareSubjectRoutes(f.input).status, 'incomplete');
});

test('both genuine model bindings are mandatory for empty and semantic-only inventories', (t) => {
  for (const routes of [[], [path()]]) for (const side of ['before', 'after']) {
    const f = setup(t); f.input.inventory.routes = routes;
    f.input[side].context.model = { ...f.input[side].context.model, identityIndex: {} };
    const invalid = compareSubjectRoutes(f.input);
    assert.equal(invalid.status, 'refused');
    assert.equal(invalid.routes, null);
    assert.equal(invalid.diagnostics[0].side, side);
    assert.equal(invalid.diagnostics[0].code, 'input-mismatch');
  }
});

test('page, explanation and scan limits never produce exact prefix deltas', (t) => {
  for (const budget of [{ maxResultsPerStore: 1 }, { maxExplanationNodes: 0 }, { maxRecords: 1 }]) {
    const f = setup(t);
    f.input.inventory.routes = [intersection('limited', { budgets: { ...queryBudgets, ...budget } })];
    const result = compareSubjectRoutes(f.input);
    assert.equal(result.status, 'incomplete');
    assert.equal(result.routes[0].candidates.strict.status, 'unavailable');
    assert.equal(result.routes[0].candidates.strict.added, null);
    assert.ok(result.routes[0].before.execution.counts);
  }
});

test('record and proposal changes retain discriminated identities and requested possible deltas', (t) => {
  const f = setup(t);
  f.input.inventory.routes = [intersection('all', { view: 'all', possibleMatches: true })];
  f.after.model.leaves.get('K-000005').record.subjects = [];
  const proposal = [...f.after.model.proposals.knowledge.values()][0];
  proposal.record.subjects = [];
  const result = compareSubjectRoutes(f.input);
  assert.equal(result.status, 'complete');
  const delta = result.routes[0].candidates;
  assert.equal(delta.strict.removed.length, 1);
  assert.equal(delta.strict.removed[0].proposalRef.key, proposal.record.id);
  assert.equal(Object.hasOwn(delta.strict.removed[0], 'ref'), false);
  assert.deepEqual(delta.possible.removed.map(({ ref }) => ref.id), ['K-000005']);
});

test('unrequested possible groups and unknown path targets never masquerade as empty matches', (t) => {
  const f = setup(t); f.input.inventory.routes.push(path(['S-999999']));
  const result = compareSubjectRoutes(f.input);
  assert.equal(result.status, 'complete');
  assert.equal(result.routes[0].candidates.possible.status, 'not-requested');
  const semantic = result.routes[1];
  assert.equal(semantic.before.status, 'invalid');
  assert.equal(semantic.before.reason, 'unknown-subject');
  assert.equal(semantic.before.actualPath, null);
  assert.equal(semantic.candidates.status, 'not-applicable');
});

test('unavailable evidence is retained as a refused query side, never zero candidates', (t) => {
  const f = setup(t);
  const checked = evaluateSubjectGovernance({ registry: f.after.model.subjectRegistry, identity: f.after.model.identity,
    identityIndex: f.after.model.identityIndex, decisionCaptures: [] });
  assert.equal(checked.ok, true);
  f.after.subjectGovernance = checked.governance;
  const result = compareSubjectRoutes(f.input);
  assert.equal(result.status, 'incomplete');
  assert.equal(result.routes[0].after.execution.status, 'refused');
  assert.equal(result.routes[0].after.execution.counts, null);
  assert.equal(result.routes[0].candidates.strict.removed, null);
  assert.equal(result.resources.queries.unreportedCalls, 1);
});

test('route pair and shared ancestry limits expose unassessed IDs and partial path comparison', (t) => {
  const f = setup(t); f.change('reparent', 'S-000002', { parent: 'S-000001' });
  f.input.inventory.routes = [path(), intersection()];
  const pairs = compareSubjectRoutes({ ...f.input, limits: { ...limits, maxRoutes: 1 } });
  assert.equal(pairs.status, 'incomplete');
  assert.deepEqual(pairs.coverage.unassessedRouteIds, ['shape-path']);
  const paths = compareSubjectRoutes({ ...f.input, limits: { ...limits, maxPathNodes: 2 } });
  const semantic = paths.routes.find(({ id }) => id === 'shape-path');
  assert.equal(paths.status, 'incomplete');
  assert.equal(semantic.after.status, 'incomplete');
  assert.equal(semantic.display.path.status, 'unavailable');
  assert.equal(semantic.display.path.changed, null);
  assert.equal(paths.resources.paths.used.nodes, 2);
});

test('closed input, unique caller IDs and typed route grammar are checked before execution', (t) => {
  const f = setup(t);
  for (const change of [{ version: 2 }, { extra: true }, { limits: { ...limits, maxRoutes: -1 } },
    { inventory: { ...f.input.inventory, routes: [intersection(), intersection()] } },
    { inventory: { ...f.input.inventory, routes: [{ id: 'bad', route: 'color/shape' }] } },
    { inventory: { ...f.input.inventory, routes: [{ ...path(), queryOptions: {} }] } }]) {
    const result = compareSubjectRoutes({ ...f.input, ...change });
    assert.equal(result.status, 'refused');
    assert.equal(result.routes, null);
  }
});

test('caller order does not change comparison fingerprints or mutate captured inputs', (t) => {
  const f = setup(t); f.input.inventory.routes = [path(), intersection()];
  const snapshot = JSON.stringify([f.before.model.identity, f.before.model.subjectRegistry.document, [...f.before.model.leaves]]);
  const first = compareSubjectRoutes(f.input);
  f.input.inventory.routes.reverse();
  assert.deepEqual(compareSubjectRoutes(f.input), first);
  assert.equal(JSON.stringify([f.before.model.identity, f.before.model.subjectRegistry.document, [...f.before.model.leaves]]), snapshot);
});

test('authentic independently namespaced installations cannot be compared as one history', (t) => {
  const f = setup(t);
  const foreign = subjectQueryDiskFixture(t);
  const oldNamespace = foreign.context.model.identity.namespace;
  const namespace = '87654321-1234-4234-8234-123456789abc';
  const document = JSON.parse(JSON.stringify(foreign.context.model.subjectRegistry.document).replaceAll(oldNamespace, namespace));
  for (const event of document.history) {
    const { review, ...data } = event;
    event.review.changeDigest = canonicalSha256(data);
  }
  const keys = { schemaVersion: 'schema-version', hierarchyRevision: 'hierarchy-revision', originDecision: 'origin-decision',
    acceptedStatus: 'accepted-status', decisionCapture: 'decision-capture', decisionDigest: 'decision-digest', changeDigest: 'change-digest' };
  const wire = (value) => Array.isArray(value) ? value.map(wire) : value !== null && typeof value === 'object'
    ? Object.fromEntries(Object.entries(value).map(([key, item]) => [keys[key] ?? key, wire(item)])) : value;
  foreign.put('_identity.yaml', { ...foreign.context.model.identity, namespace });
  foreign.put('subjects/registry.yaml', wire(document));
  const loaded = loadSubjectQueryContext({ root: foreign.root, decisionCaptures: foreign.decisionCaptures });
  assert.equal(loaded.ok, true, JSON.stringify(loaded.diagnostics));
  f.input.after.context = loaded.context;
  const result = compareSubjectRoutes(f.input);
  assert.equal(result.status, 'refused');
  assert.equal(result.diagnostics[0].code, 'namespace-mismatch');
});

test('retained candidate rank changes remain separate from membership deltas', (t) => {
  const f = setup(t);
  f.after.model.leaves.get('K-000001').record.subjects = [];
  const result = compareSubjectRoutes(f.input);
  const delta = result.routes[0].candidates.strict;
  assert.equal(delta.status, 'exact');
  assert.deepEqual(delta.removed.map(({ ref }) => ref.id), ['K-000001']);
  assert.deepEqual(delta.rankChanges.map(({ ref, before, after }) => [ref.id, before.position, after.position]), [['K-000002', 2, 1]]);
});

test('semantic inspection can retain a proposed Subject path without granting query eligibility', (t) => {
  const f = setup(t);
  const id = 'proposal:subject:11111111-1111-4111-8111-111111111111';
  const document = structuredClone(f.before.model.subjectRegistry.document);
  document.subjects.push({ id, label: 'Draft color context', status: 'proposed', parent: 'S-000001',
    definition: { text: 'Proposed narrower context', includes: [], excludes: [] }, aliases: [], related: [], changes: [] });
  const indexed = indexSubjects(document);
  assert.equal(indexed.ok, true);
  const evaluated = evaluateSubjectGovernance({ registry: indexed.registry, identity: f.before.model.identity,
    identityIndex: f.before.model.identityIndex, decisionCaptures: f.fixture.decisionCaptures });
  assert.equal(evaluated.ok, true, JSON.stringify(evaluated.diagnostics));
  const context = { model: { ...f.before.model, subjectRegistry: indexed.registry }, subjectGovernance: evaluated.governance };
  f.input.before.context = context; f.input.after.context = context;
  f.input.inventory.routes = [path(['S-000001', id])];
  const result = compareSubjectRoutes(f.input);
  assert.equal(result.status, 'complete');
  assert.equal(result.routes[0].before.status, 'valid');
  assert.equal(result.routes[0].before.labels[1].declaredStatus, 'proposed');
  assert.equal(result.routes[0].candidates.status, 'not-applicable');
});

test('unexpected capture-access bugs propagate instead of becoming ordinary comparison refusals', (t) => {
  const f = setup(t);
  const bug = new TypeError('unexpected model access failure');
  f.input.before.context = { subjectGovernance: f.before.subjectGovernance, get model() { throw bug; } };
  assert.throws(() => compareSubjectRoutes(f.input), (error) => error === bug);
});

test('comparison fingerprint binds executed record content even when membership does not change', (t) => {
  const f = setup(t);
  const first = compareSubjectRoutes(f.input);
  f.after.model.leaves.get('K-000001').body = 'Changed captured evidence, same assignments';
  const second = compareSubjectRoutes(f.input);
  assert.equal(second.status, 'complete');
  assert.deepEqual(second.routes[0].candidates, first.routes[0].candidates);
  assert.notEqual(second.input.fingerprint, first.input.fingerprint);
  assert.equal(second.input.after.registryDigest, first.input.after.registryDigest);
  assert.notEqual(second.input.replays[0].after, first.input.replays[0].after);
});
