import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { subjectGovernanceFixture } from './helpers/subject-governance-fixture.js';
import { canonicalSha256 } from '../payload/engine/lib/canonical-json.js';
import { buildIdentityIndex } from '../payload/engine/lib/record-identity-index.js';
import { indexSubjects } from '../payload/engine/lib/subjects.js';
import { evaluateSubjectGovernance, validateSubjectGovernanceCapture } from '../payload/engine/lib/subject-governance.js';
import { createSubjectValidationBudget } from '../payload/engine/lib/subject-validation-budget.js';

const limits = { maxCaptureBytes: 1000000, maxDocumentNodes: 1000000, maxDocumentTextUnits: 1000000,
  maxSubjects: 1000000, maxHistoryRows: 1000000, maxValidationSteps: 1000000 };
const seal = event => { const { review, ...body } = event; event.review.changeDigest = canonicalSha256(body); };
function fixture(padding = 0, events = 4) {
  const f = subjectGovernanceFixture();
  for (let i = 1; i < events; i++) {
    const before = structuredClone(f.document.history.at(-1).rows[0].after);
    const event = { ...structuredClone(f.document.history[0]),
      id: `34567890-1234-4234-8234-${String(i).padStart(12, '0')}`, action: 'rename', unchangedMeaning: true,
      rows: [{ id: 'S-000001', before, after: { ...before, label: `Color ${i}` } }] };
    seal(event); f.document.history.push(event);
  }
  f.document.subjects = [{ id: 'S-000001', ...structuredClone(f.document.history.at(-1).rows[0].after),
    changes: f.document.history.map(event => event.id) }];
  f.identityInput.records[0].entry.record.title += 'x'.repeat(padding);
  f.identityIndex = buildIdentityIndex(f.identityInput);
  f.registry = indexSubjects(f.document).registry;
  f.identity = f.identityInput.identity;
  f.model = { ok: true, identity: f.identity, identityIndex: f.identityIndex, subjectRegistry: f.registry,
    stores: { decisions: { present: true } },
    decisions: new Map(f.identityInput.records.map(({ entry }) => [entry.id, entry])) };
  return f;
}
function evaluate(f, budget = createSubjectValidationBudget(limits), api = { evaluateSubjectGovernance }) {
  const result = api.evaluateSubjectGovernance(f, { budget });
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  return { handle: result.governance, used: budget.used, budget };
}

test('repeated historical authorizers visit current Decision text only on the first resolution', t => {
  const short = evaluate(fixture());
  const long = evaluate(fixture(4096));
  assert.equal(long.used.documentTextUnits - short.used.documentTextUnits, 4096,
    'one complete wrapper visit with strict authored descendants, regardless of repeated events');
  t.diagnostic(`four-event evaluation counters: ${JSON.stringify(long.used)}`);
  assert.equal(long.used.validationSteps, 14, 'ten history steps plus four authorizer lookups');
  evaluate(fixture(4096), createSubjectValidationBudget({ ...limits, maxDocumentTextUnits: long.used.documentTextUnits }));
});

test('binding reuses only index resolution while guarding every mutable model record', () => {
  const measure = padding => {
    const f = fixture(padding), checked = evaluate(f);
    const budget = createSubjectValidationBudget(limits);
    assert.equal(validateSubjectGovernanceCapture(checked.handle, { model: f.model }, { budget }).ok, true);
    assert.equal(budget.used.validationSteps, 4, 'every event pays one index lookup');
    return budget.used;
  };
  assert.equal(measure(4096).documentTextUnits - measure(0).documentTextUnits, (4 + 1) * 4096,
    'all four model guards remain, with one single-visit index resolution');
});

test('each invocation pays fresh document work even with the same index and allowance', () => {
  const f = fixture(4096), budget = createSubjectValidationBudget(limits);
  const first = evaluate(f, budget), second = evaluate(f, budget);
  assert.equal(second.used.documentTextUnits, 2 * first.used.documentTextUnits);
  assert.equal(second.used.documentNodes, 2 * first.used.documentNodes);
  assert.deepEqual(evaluate(f).used, first.used, 'fresh allowance does not inherit prior work');
  const binding = createSubjectValidationBudget(limits);
  assert.equal(validateSubjectGovernanceCapture(first.handle, { model: f.model }, { budget: binding }).ok, true);
  const once = binding.used;
  assert.equal(validateSubjectGovernanceCapture(first.handle, { model: f.model }, { budget: binding }).ok, true);
  assert.equal(binding.used.documentTextUnits, 2 * once.documentTextUnits);
  f.model.decisions.get('D-000001').record.title = 'Mutation after successful binding';
  assert.equal(validateSubjectGovernanceCapture(first.handle, { model: f.model }, { budget: binding }).ok, false);
});

test('a later review with the same authorizer still validates its own status, digest and retained bytes', () => {
  for (const patch of [{ acceptedStatus: 'addressed' }, { decisionDigest: '0'.repeat(64) }]) {
    const f = fixture(); Object.assign(f.document.history[2].review, patch);
    f.registry = indexSubjects(f.document).registry;
    const result = evaluateSubjectGovernance(f, { budget: createSubjectValidationBudget(limits) });
    assert.equal(result.ok, false);
    assert.ok(result.diagnostics.some(row => row.path === 'history[2]' && row.code === 'invalid-authorizer-evidence'));
  }
  const f = fixture(); f.decisionCaptures[0].bytes[0] ^= 1;
  const result = evaluateSubjectGovernance(f, { budget: createSubjectValidationBudget(limits) });
  assert.equal(result.ok, false);
  assert.equal(result.diagnostics.length, 4, 'resolution reuse never caches an evidence outcome');
  assert.ok(result.diagnostics.every(row => row.code === 'evidence-digest-mismatch'));
});

test('both governance calls charge the last cache hit and preserve its exhaustion latch', () => {
  const f = fixture(), checked = evaluate(f);
  for (const [phase, steps, run] of [
    ['historical-authorizer-lookup', 13, budget => evaluateSubjectGovernance(f, { budget })],
    ['binding-index-authorizer-lookup', 3, budget => validateSubjectGovernanceCapture(checked.handle, { model: f.model }, { budget })],
  ]) {
    const budget = createSubjectValidationBudget({ ...limits, maxValidationSteps: steps });
    assert.throws(() => run(budget), { code: 'subject-validation-budget', phase, attempted: 1, remaining: 0 });
    const failure = budget.failure, used = budget.used;
    assert.throws(() => run(budget), { code: 'subject-validation-budget', phase });
    assert.deepEqual(budget.failure, failure); assert.deepEqual(budget.used, used);
  }
});

test('equal refs in distinct authentic indexes do not share captured records', () => {
  const before = fixture(), candidate = fixture(4096);
  const old = evaluate(before), next = evaluate(candidate);
  assert.equal(validateSubjectGovernanceCapture(old.handle, { model: candidate.model }).ok, false);
  assert.equal(validateSubjectGovernanceCapture(next.handle, { model: before.model }).ok, false);
  assert.equal(validateSubjectGovernanceCapture(next.handle, { model: candidate.model }).ok, true);
  before.identityInput.records[0].entry.record.title = 'Changed caller copy';
  assert.equal(evaluate(before).used.documentTextUnits, old.used.documentTextUnits,
    'identity builder retains its own detached capture');
});

test('model-side changes on a later repeated lookup still refuse within the same binding call', () => {
  const f = fixture(), checked = evaluate(f);
  let lookups = 0;
  f.model.decisions.get = function (id) {
    const entry = Map.prototype.get.call(this, id);
    if (++lookups === 3) entry.record.title = 'Changed on the third model lookup';
    return entry;
  };
  const budget = createSubjectValidationBudget(limits);
  assert.equal(validateSubjectGovernanceCapture(checked.handle, { model: f.model }, { budget }).ok, false);
  assert.equal(lookups, 3);
  assert.equal(budget.used.validationSteps, 3);
});

test('replacing the model identity index during binding cannot borrow the original resolution', () => {
  const f = fixture(), changed = fixture(4096), checked = evaluate(f);
  let lookups = 0;
  f.model.decisions.get = function (id) {
    if (++lookups === 3) f.model.identityIndex = changed.identityIndex;
    return Map.prototype.get.call(this, id);
  };
  assert.equal(validateSubjectGovernanceCapture(checked.handle, { model: f.model }).ok, false);
});

// Fault injection follows the existing topology test pattern. Private descriptor
// corruption and a budget failing between lookups cannot be supplied through the
// public API; keep these probes out of the production module's exports.
async function privateSeams() {
  const url = new URL('../payload/engine/lib/subject-governance.js', import.meta.url);
  const source = readFileSync(url, 'utf8').replace(/from '(\.[^']+)'/g,
    (_, specifier) => `from ${JSON.stringify(new URL(specifier, url).href)}`);
  const injected = `${source}\nexport { authorizerResolver };\nexport function corruptLater(handle) {
    evaluations.get(handle).descriptor.events[2].decision.currentRecordDigest = '0'.repeat(64);
  }`;
  return import(`data:text/javascript;base64,${Buffer.from(injected).toString('base64')}`);
}

test('a corrupted later private descriptor cannot borrow an earlier successful comparison', async () => {
  const api = await privateSeams(), f = fixture();
  const checked = evaluate(f, createSubjectValidationBudget(limits), api);
  api.corruptLater(checked.handle);
  const budget = createSubjectValidationBudget(limits);
  assert.equal(api.validateSubjectGovernanceCapture(checked.handle, { model: f.model }, { budget }).ok, false);
  assert.equal(budget.used.validationSteps, 3, 'later cached resolution still compares the third expected digest');
});

test('malformed refs cannot project onto a loaded memo entry', async () => {
  const { authorizerResolver } = await privateSeams(), f = fixture();
  const budget = createSubjectValidationBudget(limits);
  const resolve = authorizerResolver(f.identityIndex, budget, 'test-authorizer');
  const ref = f.document.history[0].decision;
  assert.equal(resolve(ref).resolved.status, 'loaded');
  const hidden = { ...ref }; Object.defineProperty(hidden, 'extra', { value: 1 });
  for (const malformed of [{ ...ref, extra: 1 }, hidden, { ...ref, kind: 'knowledge' },
    { ...ref, namespace: '87654321-1234-4234-8234-123456789abc' }, { ...ref, id: 'D-1' }, { id: ref.id }]) {
    assert.equal(resolve(malformed).resolved.status, 'invalid');
  }
  const before = budget.used;
  assert.equal(resolve({ ...ref }).resolved.status, 'loaded');
  assert.equal(budget.used.documentTextUnits, before.documentTextUnits, 'valid exact ref hits after malformed lookups');
});

test('a previously loaded cache hit cannot proceed after another counter exhausts', async () => {
  const { authorizerResolver } = await privateSeams(), f = fixture();
  const budget = createSubjectValidationBudget({ ...limits, maxCaptureBytes: 0 });
  const resolve = authorizerResolver(f.identityIndex, budget, 'test-authorizer');
  const ref = f.document.history[0].decision;
  assert.equal(resolve(ref).resolved.status, 'loaded');
  assert.throws(() => budget.charge('captureBytes', 1, 'intervening-evidence'), { code: 'subject-validation-budget' });
  const failure = budget.failure, used = budget.used;
  assert.throws(() => resolve(ref), { code: 'subject-validation-budget', phase: 'intervening-evidence' });
  assert.deepEqual(budget.failure, failure); assert.deepEqual(budget.used, used);
});

test('unsuccessful resolutions are never cached and misses keep strict authored guards', async () => {
  const { authorizerResolver } = await privateSeams();
  for (const duplicate of [false, true]) {
    const f = fixture();
    f.identityInput.records = duplicate ? [f.identityInput.records[0], structuredClone(f.identityInput.records[0])] : [];
    const budget = createSubjectValidationBudget(limits);
    const resolve = authorizerResolver(buildIdentityIndex(f.identityInput), budget, 'test-authorizer');
    const ref = f.document.history[0].decision;
    assert.equal(resolve(ref).resolved.status, duplicate ? 'ambiguous' : 'missing');
    const first = budget.used;
    resolve(ref);
    assert.equal(budget.used.documentTextUnits, first.documentTextUnits * 2);
    assert.equal(budget.used.documentNodes, first.documentNodes * 2);
  }
  const f = fixture(); f.identityInput.records[0].entry.record.invalid = undefined;
  const resolve = authorizerResolver(buildIdentityIndex(f.identityInput), createSubjectValidationBudget(limits), 'test-authorizer');
  assert.throws(() => resolve(f.document.history[0].decision), { code: 'invalid-subject-input' });
});
