import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { subjectGovernanceFixture } from './helpers/subject-governance-fixture.js';
import { indexSubjects } from '../payload/engine/lib/subjects.js';
import { validateSubjectRegistryMetadata } from '../payload/engine/lib/subject-governance.js';
import { createSubjectValidationBudget } from '../payload/engine/lib/subject-validation-budget.js';
import { canonicalSha256 } from '../payload/engine/lib/canonical-json.js';

const limits = { maxCaptureBytes: 1000000, maxDocumentNodes: 1000000, maxDocumentTextUnits: 1000000,
  maxSubjects: 1000000, maxHistoryRows: 1000000, maxValidationSteps: 1000000 };
const id = n => `S-${String(n).padStart(6, '0')}`;
const edge = n => ({ type: 'association', target: id(n) });
const seal = event => { const { review, ...body } = event; event.review.changeDigest = canonicalSha256(body); };
function fixture(count = 4) {
  const f = subjectGovernanceFixture(); const event = f.document.history[0];
  const template = structuredClone(event.rows[0].after);
  event.rows = Array.from({ length: count }, (_, i) => ({ id: id(i + 1), before: null,
    after: { ...structuredClone(template), label: `Subject ${i + 1}` } }));
  f.identityInput.identity.allocations = [f.identityInput.identity.allocations[0], ...event.rows.map(row => ({
    ...f.identityInput.identity.allocations[1], id: row.id }))];
  seal(event); current(f); return f;
}
function current(f) {
  const states = new Map(), changes = new Map();
  for (const event of f.document.history) for (const row of event.rows) {
    states.set(row.id, structuredClone(row.after));
    changes.set(row.id, [...(changes.get(row.id) ?? []), event.id]);
  }
  f.document.subjects = [...states].map(([key, state]) => ({ id: key, ...state, changes: changes.get(key) }));
}
function append(f, updates) {
  const previous = new Map(f.document.subjects.map(({ id, changes, ...state }) => [id, state]));
  const event = { ...structuredClone(f.document.history[0]), id: `34567890-1234-4234-8234-${String(f.document.history.length).padStart(12, '0')}`,
    action: 'reparent', rows: updates.map(([key, after]) => ({ id: key, before: previous.get(key) ?? null, after })) };
  seal(event); f.document.history.push(event); current(f); return event;
}
const state = (f, n, patch = {}) => {
  const { id: ignoredId, changes, ...row } = f.document.subjects.find(row => row.id === id(n));
  return { ...structuredClone(row), ...patch };
};
function check(f, policy = limits) {
  const indexed = indexSubjects(f.document); assert.equal(indexed.ok, true, JSON.stringify(indexed.diagnostics));
  const budget = createSubjectValidationBudget(policy);
  const result = validateSubjectRegistryMetadata(indexed.registry, { identity: f.identityInput.identity, operationBudget: budget });
  return { result, used: budget.used };
}

test('many local reparent events fit touched graph visits instead of rebuilding every Subject', t => {
  const f = fixture(32);
  for (let i = 0; i < 12; i++) append(f, [[id(1), state(f, 1, { parent: id(i % 2 + 2) })]]);
  const { result, used } = check(f, { ...limits, maxSubjects: 160 });
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  assert.equal(used.subjects, 144, '32 metadata + 32 full forest + 32 seed + 12 × (one metadata, one endpoint, two chain visits)');
  t.diagnostic(`actual local reparent counters: ${JSON.stringify(used)}`);
});

test('association declaration ownership transfers atomically in either participant order', () => {
  for (const reverse of [false, true]) {
    const f = fixture(); f.document.history[0].rows[0].after.related = [edge(2)]; seal(f.document.history[0]); current(f);
    const updates = [[id(1), state(f, 1, { related: [] })], [id(2), state(f, 2, { related: [edge(1)] })]];
    append(f, reverse ? updates.reverse() : updates);
    assert.equal(check(f).result.ok, true);
  }
});

test('cycles through unchanged edges refuse at the intermediate event even when later repaired', () => {
  const f = fixture(); f.document.history[0].rows[0].after.parent = id(2);
  f.document.history[0].rows[1].after.parent = id(3); seal(f.document.history[0]); current(f);
  const original = state(f, 3); append(f, [[id(3), { ...original, parent: id(1) }]]);
  append(f, [[id(3), original]]);
  assert.equal(check(f).result.diagnostics[0].code, 'invalid-history-forest');
});

test('new parent, child and association target are visible in the same atomic event in either row order', () => {
  for (const reverse of [false, true]) {
    const f = fixture(2); const template = state(f, 1);
    const updates = [[id(3), { ...template, parent: id(4), related: [edge(4)] }],
      [id(4), { ...template, related: [] }]];
    append(f, reverse ? updates.reverse() : updates);
    for (const n of [3, 4]) f.identityInput.identity.allocations.push({ ...f.identityInput.identity.allocations[1], id: id(n) });
    assert.equal(check(f).result.ok, true);
  }
});

test('atomic reparent and explicit parent removal do not retain a stale ancestor proof', () => {
  for (const reverse of [false, true]) {
    const f = fixture(3); f.document.history[0].rows[0].after.parent = id(2); seal(f.document.history[0]); current(f);
    const noParent = state(f, 1); delete noParent.parent;
    const updates = [[id(1), noParent], [id(2), state(f, 2, { parent: id(1) })]];
    append(f, reverse ? updates.reverse() : updates);
    assert.equal(check(f).result.ok, true);
    const original = state(f, 1); append(f, [[id(1), { ...original, parent: id(2) }]]);
    append(f, [[id(1), original]]);
    assert.equal(check(f).result.diagnostics[0].code, 'invalid-history-forest');
  }
});

test('unchanged third-owner and duplicate-in-one-row associations reject before a later repair', () => {
  for (const duplicate of [false, true]) {
    const f = fixture(3);
    f.document.history[0].rows[2].after.related = [edge(1)]; seal(f.document.history[0]); current(f);
    const original = state(f, 1);
    append(f, [[id(1), { ...original, related: duplicate ? [edge(2), edge(2)] : [edge(3)] }]]);
    append(f, [[id(1), original]]);
    assert.equal(check(f).result.diagnostics[0].code, 'invalid-history-forest');
  }
});

test('exhaustive two-vertex atomic transitions agree with the global primitive at every prefix and row order', () => {
  const base = fixture(2);
  const documents = [];
  // 3 parent choices per vertex (root/self/other), 2 directions independently
  // present or absent for the one undirected pair: 36 complete graph states.
  for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) for (let bits = 0; bits < 4; bits++) {
    const subjects = [state(base, 1, { related: bits & 1 ? [edge(2)] : [] }),
      state(base, 2, { related: bits & 2 ? [edge(1)] : [] })];
    if (a) subjects[0].parent = id(a);
    if (b) subjects[1].parent = id(b);
    const document = { ...base.document, subjects: subjects.map((row, i) => ({ id: id(i + 1), ...row })) };
    documents.push({ subjects, ok: indexSubjects(document).ok });
  }
  let comparisons = 0;
  for (const before of documents.filter(row => row.ok)) for (const after of documents) for (const reverse of [false, true]) {
    const f = fixture(2);
    f.document.history[0].rows.forEach((row, i) => { row.after = structuredClone(before.subjects[i]); });
    seal(f.document.history[0]); current(f);
    const updates = after.subjects.map((row, i) => [id(i + 1), structuredClone(row)]);
    append(f, reverse ? updates.reverse() : updates);
    if (!after.ok) append(f, before.subjects.map((row, i) => [id(i + 1), structuredClone(row)]));
    const result = check(f).result;
    assert.equal(result.ok, after.ok, JSON.stringify({ before, after, reverse, result }));
    if (!after.ok) assert.equal(result.diagnostics[0].code, 'invalid-history-forest');
    comparisons += 1;
  }
  assert.equal(comparisons, 648);
});

test('every endpoint, cycle and association debit boundary fails with the first latch and never becomes a graph verdict', () => {
  const f = fixture(3);
  append(f, [[id(1), state(f, 1, { parent: id(2), related: [edge(3)] })]]);
  const indexed = indexSubjects(f.document).registry;
  const complete = check(f);
  for (let maxSubjects = 0; maxSubjects < complete.used.subjects; maxSubjects++) {
    const budget = createSubjectValidationBudget({ ...limits, maxSubjects });
    assert.throws(() => validateSubjectRegistryMetadata(indexed, { identity: f.identityInput.identity, operationBudget: budget }),
      { code: 'subject-validation-budget' });
    const failure = budget.failure, used = budget.used;
    assert.throws(() => validateSubjectRegistryMetadata(indexed, { identity: f.identityInput.identity, operationBudget: budget }),
      { code: 'subject-validation-budget', phase: failure.phase });
    assert.deepEqual(budget.failure, failure); assert.deepEqual(budget.used, used);
  }
});

test('structural fallback pays for the actual full reference without replacing an exhausted budget', () => {
  const f = fixture(3), original = state(f, 1);
  append(f, [[id(1), { ...original, parent: id(99) }]]); append(f, [[id(1), original]]);
  assert.throws(() => check(f, { ...limits, maxSubjects: 13 }), {
    code: 'subject-validation-budget', phase: 'history-forest', attempted: 3, remaining: 2,
  });
  const checked = check(f, { ...limits, maxSubjects: 14 });
  assert.equal(checked.result.diagnostics[0].code, 'invalid-history-forest');
  assert.equal(checked.used.subjects, 14);
});

test('a forced incremental/reference disagreement propagates as an implementation error', async () => {
  const url = new URL('../payload/engine/lib/subject-governance.js', import.meta.url);
  const source = readFileSync(url, 'utf8');
  const marker = 'const incremental = graph && updateHistoryTopology(graph, states, topologyRows, budget);';
  assert.ok(source.includes(marker));
  const injected = source.replace(marker, 'const incremental = graph && false;')
    .replace(/from '(\.[^']+)'/g, (_, specifier) => `from ${JSON.stringify(new URL(specifier, url).href)}`);
  const faulty = await import(`data:text/javascript;base64,${Buffer.from(injected).toString('base64')}`);
  const f = fixture(3); append(f, [[id(1), state(f, 1, { parent: id(2) })]]);
  assert.throws(() => faulty.validateSubjectRegistryMetadata(indexSubjects(f.document).registry,
    { identity: f.identityInput.identity, operationBudget: createSubjectValidationBudget(limits) }), {
    name: 'TypeError', message: 'Incremental historical topology disagrees with the full graph validator.',
  });
});
