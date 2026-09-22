import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { subjectGovernanceFixture } from './helpers/subject-governance-fixture.js';
import { subjectQueryDiskFixture } from './helpers/subject-query-disk-fixture.js';
import { subjectQuery } from './helpers/subject-query-fixture.js';
import { canonicalSha256 } from '../payload/engine/lib/canonical-json.js';
import { buildIdentityIndex } from '../payload/engine/lib/record-identity-index.js';
import { validateAssignments } from '../payload/engine/lib/assignment-validation.js';
import { createSubjectOperation, getSubjectOperationResources } from '../payload/engine/lib/subject-operation.js';
import { loadSubjectQueryContext } from '../payload/engine/lib/subject-query-context.js';
import { querySubjects, validateSubjectQuery } from '../payload/engine/lib/subject-query.js';
import { indexSubjects } from '../payload/engine/lib/subjects.js';
import { evaluateSubjectGovernance, subjectEligibility } from '../payload/engine/lib/subject-governance.js';
import { createSubjectValidationBudget } from '../payload/engine/lib/subject-validation-budget.js';

const limits = { maxCaptureBytes: 1000000, maxDocumentNodes: 1000000, maxDocumentTextUnits: 1000000,
  maxSubjects: 1000000, maxHistoryRows: 1000000, maxValidationSteps: 1000000 };
function fixture(policy = limits, { second = false, retired = false, equivalent = false, evidence = true, api = { evaluateSubjectGovernance } } = {}) {
  const f = subjectGovernanceFixture();
  const seal = event => { const { review, ...body } = event; review.changeDigest = canonicalSha256(body); };
  if (second) {
    const state = structuredClone(f.document.history[0].rows[0].after);
    f.document.history[0].rows.push({ id: 'S-000002', before: null, after: state });
    seal(f.document.history[0]);
    f.document.subjects.push({ id: 'S-000002', ...state, changes: [f.document.history[0].id] });
  }
  if (retired) {
    const before = structuredClone(f.document.history[0].rows[0].after);
    const after = { ...before, status: 'retired', retirement: equivalent
      ? { kind: 'equivalent-merge', redirect: 'S-000002' } : { kind: 'retire' } };
    const event = { ...structuredClone(f.document.history[0]), id: '23456789-1234-4234-8234-123456789abd',
      action: equivalent ? 'merge-equivalent' : 'retire', rows: [{ id: 'S-000001', before, after }] };
    seal(event); f.document.history.push(event); f.document.revision++;
    f.document.subjects[0] = { id: 'S-000001', ...after, changes: f.document.history.map(row => row.id) };
  }
  const operationBudget = createSubjectValidationBudget(policy);
  const checked = api.evaluateSubjectGovernance({ ...f, decisionCaptures: evidence ? f.decisionCaptures : [], identity: f.identityInput.identity,
    registry: indexSubjects(f.document).registry }, { operationBudget });
  assert.equal(checked.ok, true, JSON.stringify(checked.diagnostics));
  return { ...f, handle: checked.governance, operationBudget };
}
const options = f => ({ purpose: 'query', policy: 'current', budget: { redirects: 0 }, operationBudget: f.operationBudget });
const ask = f => subjectEligibility(f.handle, 'S-000001', options(f));

test('repeated current query eligibility removes only immutable resolution/history work', () => {
  const f = fixture(), before = f.operationBudget.used;
  const first = ask(f), miss = f.operationBudget.used;
  const second = ask(f), hit = f.operationBudget.used;
  assert.equal(first.eligible, true);
  assert.deepEqual(second, first);
  assert.equal(miss.subjects - before.subjects, 3);
  assert.equal(hit.subjects - miss.subjects, 0, 'a hit does no registry resolution or history Subject visits');
  assert.equal(miss.validationSteps - before.validationSteps, 6, 'eligibility + lookup + two resolutions + Subject + one event');
  assert.equal(hit.validationSteps - miss.validationSteps, 2, 'eligibility admission and actual private lookup');
  assert.equal(hit.documentTextUnits, before.documentTextUnits);
});

test('fresh result containers and deeply frozen Subject data cannot poison later hits', () => {
  const f = fixture(), first = ask(f), expected = structuredClone(first);
  first.eligible = false; first.verification = 'unavailable';
  first.resolution.id = 'S-999999'; first.resolution.redirects.push({ from: 'bad', to: 'bad' });
  assert.throws(() => { first.resolution.subject.definition.text = 'changed'; }, TypeError);
  assert.throws(() => first.resolution.subject.changes.push('changed'), TypeError);
  const next = ask(f), later = ask(f);
  assert.deepEqual(next, expected); assert.deepEqual(later, expected);
  assert.notEqual(next, later); assert.notEqual(next.resolution, later.resolution);
  assert.notEqual(next.resolution.redirects, later.resolution.redirects);
  assert.equal(Object.isFrozen(next.resolution.subject), true);
  assert.equal(Object.isFrozen(next.resolution.subject.definition), true);
});

test('same Subject at different row positions retains fresh P3 attribution and row checks', () => {
  const f = fixture(limits, { second: true });
  const row = ids => ({ ref: { namespace: f.handle.namespace, kind: 'knowledge', id: 'K-000001' },
    entry: { file: 'knowledge/one.md', record: { id: 'K-000001', subjects: ids } } });
  const first = validateAssignments(row(['S-000001', 'S-000002']), f.handle, options(f));
  const before = f.operationBudget.used;
  const next = validateAssignments(row(['S-000002', 'S-000001']), f.handle, options(f));
  assert.equal(first.ok, true); assert.equal(next.ok, true);
  assert.deepEqual(next.subjects.map(({ originalId, index, path }) => ({ originalId, index, path })), [
    { originalId: 'S-000002', index: 0, path: 'subjects[0]' },
    { originalId: 'S-000001', index: 1, path: 'subjects[1]' },
  ]);
  assert.equal(f.operationBudget.used.subjects, before.subjects);
  for (const [change, code] of [
    [r => { r.entry.record.subjects.push('S-000001'); }, 'duplicate-subject'],
    [r => { r.entry.record.subjects = ['bad']; }, 'invalid-subject-id'],
    [r => { r.entry.record.id = 'K-000002'; }, 'invalid-record-ref'],
    [r => { r.ref.namespace = '12345678-1234-4234-8234-123456789abd'; }, 'namespace-mismatch'],
  ]) {
    const changed = row(['S-000001']); change(changed);
    const checked = validateAssignments(changed, f.handle, options(f));
    assert.equal(checked.ok, false); assert.ok(checked.diagnostics.some(d => d.code === code));
  }
  const absent = row([]); delete absent.entry.record.subjects;
  assert.deepEqual(validateAssignments(absent, f.handle, options(f)).assignments, { state: 'unknown', reason: 'absent' });
});

test('historical, equivalent, inspection and new-assignment calls never borrow a query hit', () => {
  const f = fixture(); ask(f);
  for (const patch of [{ policy: 'historical' }, { policy: 'equivalent' }, { purpose: 'inspect' }, { purpose: 'new-assignment' }]) {
    const before = f.operationBudget.used;
    const first = subjectEligibility(f.handle, 'S-000001', { ...options(f), ...patch });
    const middle = f.operationBudget.used;
    assert.deepEqual(subjectEligibility(f.handle, 'S-000001', { ...options(f), ...patch }), first);
    assert.ok(middle.subjects > before.subjects);
    assert.equal(f.operationBudget.used.subjects - middle.subjects, middle.subjects - before.subjects);
  }
});

test('unavailable, retired and missing targets never establish successful memo entries', () => {
  for (const [config, id, expected] of [[{ evidence: false }, 'S-000001', null],
    [{ retired: true }, 'S-000001', false], [{}, 'S-999999', 'unknown-subject']]) {
    const f = fixture(limits, config), before = f.operationBudget.used;
    const run = () => subjectEligibility(f.handle, id, options(f));
    if (typeof expected === 'string') assert.throws(run, { code: expected });
    else assert.equal(run().eligible, expected);
    const middle = f.operationBudget.used;
    if (typeof expected === 'string') assert.throws(run, { code: expected });
    else assert.equal(run().eligible, expected);
    assert.ok(middle.subjects > before.subjects);
    assert.equal(f.operationBudget.used.subjects - middle.subjects, middle.subjects - before.subjects);
  }
});

test('options, authentic handles and exact operation binding are checked before a hit', () => {
  const f = fixture(); ask(f);
  for (const patch of [{ budget: { redirects: -1 } }, { budget: { redirects: 0, extra: true } },
    { budget: { redirects: 0.5 } }, { policy: 'other' }, { purpose: 'other' }]) {
    assert.throws(() => subjectEligibility(f.handle, 'S-000001', { ...options(f), ...patch }),
      error => ['invalid-budget', 'invalid-options'].includes(error.code));
  }
  assert.throws(() => subjectEligibility({ ...f.handle }, 'S-000001', options(f)), { code: 'governance-unavailable' });
  assert.throws(() => subjectEligibility(f.handle, 'S-000001', { ...options(f), operationBudget: {} }),
    { code: 'invalid-subject-validation-budget-handle' });
  assert.throws(() => subjectEligibility(f.handle, 'S-000001', { ...options(f), operationBudget: createSubjectValidationBudget(limits) }),
    { code: 'subject-operation-mismatch' });
  assert.equal(subjectEligibility(f.handle, 'S-000001', { ...options(f), budget: { redirects: 12 } }).eligible, true);
});

test('new evaluations on the same or fresh allowance never inherit another capture proof', () => {
  const f = fixture(); ask(f);
  for (const operationBudget of [f.operationBudget, createSubjectValidationBudget(limits)]) {
    const checked = evaluateSubjectGovernance({ ...f, identity: f.identityInput.identity,
      registry: indexSubjects(f.document).registry }, { operationBudget });
    assert.equal(checked.ok, true);
    const before = operationBudget.used;
    assert.equal(subjectEligibility(checked.governance, 'S-000001', { ...options(f), operationBudget }).eligible, true);
    assert.equal(operationBudget.used.subjects - before.subjects, 3);
  }
});

test('exact subject capacity permits hits but refuses a later distinct Subject miss', () => {
  const measure = fixture(limits, { second: true }), before = measure.operationBudget.used;
  const f = fixture({ ...limits, maxSubjects: before.subjects + 3 }, { second: true });
  assert.equal(ask(f).eligible, true); assert.equal(ask(f).eligible, true);
  assert.equal(f.operationBudget.used.subjects, before.subjects + 3);
  assert.throws(() => subjectEligibility(f.handle, 'S-000002', options(f)), { counter: 'subjects', phase: 'resolution-subject' });
  const failure = f.operationBudget.failure, used = f.operationBudget.used;
  assert.throws(() => ask(f), { counter: 'subjects', phase: 'resolution-subject' });
  assert.deepEqual(f.operationBudget.failure, failure); assert.deepEqual(f.operationBudget.used, used);
});

test('hit lookup and miss history have exact-fit and one-unit-short sticky step boundaries', () => {
  const baseline = fixture().operationBudget.used.validationSteps;
  const exact = fixture({ ...limits, maxValidationSteps: baseline + 8 });
  ask(exact); ask(exact); assert.equal(exact.operationBudget.used.validationSteps, baseline + 8);
  for (const [extra, phase, prime] of [[7, 'current-query-eligibility-lookup', true], [5, 'eligibility-event', false]]) {
    const f = fixture({ ...limits, maxValidationSteps: baseline + extra });
    if (prime) ask(f);
    assert.throws(() => ask(f), { counter: 'validationSteps', phase });
    const used = f.operationBudget.used, failure = f.operationBudget.failure;
    assert.throws(() => ask(f), { counter: 'validationSteps', phase });
    assert.deepEqual(f.operationBudget.used, used); assert.deepEqual(f.operationBudget.failure, failure);
  }
});

test('a different counter exhaustion prevents an already proven hit', () => {
  const f = fixture(); ask(f);
  assert.throws(() => f.operationBudget.charge('historyRows', limits.maxHistoryRows + 1, 'other-owner'), { phase: 'other-owner' });
  const used = f.operationBudget.used;
  assert.throws(() => ask(f), { phase: 'other-owner' });
  assert.deepEqual(f.operationBudget.used, used);
});

test('captured equivalent redirects remain uncached and respect a later smaller remaining budget', () => {
  const { handle, operationBudget } = fixture(limits, { second: true, retired: true, equivalent: true });
  subjectEligibility(handle, 'S-000002', { purpose: 'query', policy: 'current', operationBudget });
  const before = operationBudget.used;
  const options = { purpose: 'query', policy: 'equivalent', operationBudget, budget: { redirects: 1 } };
  const first = subjectEligibility(handle, 'S-000001', options), middle = operationBudget.used;
  assert.equal(first.eligible, true); assert.equal(first.resolution.redirects.length, 1);
  assert.deepEqual(subjectEligibility(handle, 'S-000001', options), first);
  assert.ok(middle.subjects > before.subjects);
  assert.equal(operationBudget.used.subjects - middle.subjects, middle.subjects - before.subjects);
  const short = subjectEligibility(handle, 'S-000001', { ...options, budget: { redirects: 0 } });
  assert.equal(short.eligible, false); assert.equal(short.code, 'redirect-budget');
});

// Test-only inspection/fault injection; no caller-visible proof or callback API.
async function privateSeams({ failBeforePopulation = false } = {}) {
  const url = new URL('../payload/engine/lib/subject-governance.js', import.meta.url);
  let source = readFileSync(url, 'utf8').replace(/from '(\.[^']+)'/g,
    (_, specifier) => `from ${JSON.stringify(new URL(specifier, url).href)}`);
  if (failBeforePopulation) source = source.replace('// Publication of the private proof must not follow a latched failure.',
    "try { operationBudget.charge('subjects', 1000001, 'before-population'); } catch {}\n");
  source += '\nexport const memoSize = handle => evaluations.get(handle).currentQueryEligibility.size;\n';
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
}

test('unbounded calls do not populate proof, and interrupted success cannot populate after failure', async () => {
  const api = await privateSeams(), f = fixture(limits, { api });
  const { operationBudget, ...unbounded } = options(f);
  assert.equal(api.subjectEligibility(f.handle, 'S-000001', unbounded).eligible, true);
  assert.equal(api.memoSize(f.handle), 0);
  api.subjectEligibility(f.handle, 'S-000001', options(f)); assert.equal(api.memoSize(f.handle), 1);
  const before = operationBudget.used;
  api.subjectEligibility(f.handle, 'S-000001', unbounded);
  assert.deepEqual(operationBudget.used, before, 'unbounded API remains outside the supplied host allowance');
  const injected = await privateSeams({ failBeforePopulation: true });
  const stopped = fixture(limits, { api: injected });
  assert.throws(() => injected.subjectEligibility(stopped.handle, 'S-000001', options(stopped)), { phase: 'before-population' });
  assert.equal(injected.memoSize(stopped.handle), 0);
});

const hostLimits = () => ({ version: 1, maxSourceBytes: 33554432, maxSingleCaptureBytes: 2097152, maxOutputBytes: 262144,
  validation: { ...limits, maxCaptureBytes: 33554432, maxDocumentTextUnits: 67108864 },
  corpus: { maxCanonicalRecords: 1000, maxAuthoredRecords: 1200, maxSubjects: 256, maxHierarchyDepth: 16,
    maxHistoryEvents: 256, maxHistoryRows: 1024, maxAssignmentsPerRecord: 16, maxAssignments: 16000, maxBodyBytesPerRecord: 16384 } });
function diskContext(t) {
  const f = subjectQueryDiskFixture(t), operation = createSubjectOperation(hostLimits());
  const loaded = loadSubjectQueryContext({ root: f.root, decisionCaptures: f.decisionCaptures, operation });
  assert.equal(loaded.ok, true, JSON.stringify(loaded.diagnostics));
  return { ...f, operation, context: loaded.context };
}

test('actual queries retain full model/index/authorizer binding after operand eligibility was memoized', t => {
  for (const mutate of [
    model => { model.decisions.get('D-000001').record.title = 'changed authorizer'; },
    model => { model.identity.allocations[0].publication.review = 'changed ledger'; },
    model => { model.identityIndex = buildIdentityIndex({ ...subjectGovernanceFixture().identityInput,
      records: [] }); },
  ]) {
    const f = diskContext(t), query = subjectQuery();
    assert.equal(validateSubjectQuery(query, f.context, { operation: f.operation }).ok, true);
    mutate(f.context.model);
    const result = querySubjects(f.context, query, { operation: f.operation });
    assert.equal(result.status, 'refused');
    assert.ok(result.diagnostics.some(d => d.code === 'input-mismatch'));
  }
});

test('actual query retains fresh invalid-assignment refusal after a successful complete query', t => {
  const f = diskContext(t), query = subjectQuery();
  assert.equal(querySubjects(f.context, query, { operation: f.operation }).status, 'complete');
  const entry = f.context.model.leaves.get('K-000001');
  entry.record.subjects = ['S-000001', 'S-000001'];
  const result = querySubjects(f.context, query, { operation: f.operation });
  assert.equal(result.status, 'refused');
  assert.ok(result.diagnostics.some(d => d.code === 'duplicate-subject' && d.path === 'subjects[1]'));
  assert.equal(result.groups, null); assert.equal(result.counts, null);
  assert.ok(getSubjectOperationResources(f.operation).subjectOperationBudget.used.subjects > 0);
});
