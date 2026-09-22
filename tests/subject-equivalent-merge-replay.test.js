import test from 'node:test';
import assert from 'node:assert/strict';
import { equivalentMergeFixture, registryWire } from './helpers/equivalent-merge-fixture.js';
import { compareEquivalentMergeReplays } from '../payload/engine/lib/subject-equivalent-merge-replay.js';
import { canonicalSha256 } from '../payload/engine/lib/canonical-json.js';

const replay = (f, input, limits = {}) => compareEquivalentMergeReplays({ version: 1,
  before: { capturedInputRef: input.before.descriptor.commit, context: input.before.context },
  after: { capturedInputRef: input.candidate.descriptor.commit, context: input.candidate.context },
  source: f.input.operation.absorbed[0], survivor: f.input.operation.survivor,
  limits: { ...f.input.limits.replays, ...limits }, queryBudgets: f.input.limits.query });

test('equivalent merge recipe retains original source operands and unchanged ASTs on actual captures', async (t) => {
  const f = equivalentMergeFixture(t);
  const result = await f.withCoreInput((input) => replay(f, input));
  assert.equal(result.status, 'complete', JSON.stringify(result.diagnostics));
  assert.equal(result.inventory.cases.length, 144);
  assert.equal(result.comparison.resources.queries.calls, 288);
  const source = result.subjects.find(({ id }) => id === 'S-000001');
  assert.equal(source.before.resolution.id, 'S-000001'); assert.equal(source.after.resolution.id, 'S-000002');
  assert.deepEqual(source.after.resolution.redirects, [{ from: 'S-000001', to: 'S-000002' }]);
  const cases = result.inventory.cases.filter(({ id }) => id.endsWith('/assigned/S-000001'));
  assert.equal(cases.length, 8);
  assert.ok(cases.every(({ query }) => query.subjectPolicy === 'equivalent' && query.where.subject === 'S-000001'));
  assert.ok(result.comparison.cases.every(({ candidates }) => candidates.status === 'exact'));
});

test('nonadjacent source-survivor pair is mandatory without resolved-ID deduplication', async (t) => {
  const f = equivalentMergeFixture(t, { survivor: 'S-000003' });
  const result = await f.withCoreInput((input) => replay(f, input));
  assert.equal(result.status, 'complete', JSON.stringify(result.diagnostics));
  assert.equal(result.inventory.cases.length, 176);
  assert.equal(result.inventory.cases.filter(({ id }) => id.endsWith('/or/S-000001/S-000003')).length, 8);
  assert.equal(result.subjects.filter(({ disposition }) => disposition === 'queryable').length, 3);
});

test('full paired recipe is reserved before any query when cases or bytes do not fit', async (t) => {
  const f = equivalentMergeFixture(t);
  await f.withCoreInput((input) => {
    for (const limits of [{ maxCases: 143 }, { maxInventoryBytes: 1 }]) {
      const result = replay(f, input, limits);
      assert.equal(result.status, 'incomplete');
      assert.equal(result.comparison?.resources.queries.calls ?? 0, 0);
    }
  });
});

test('a store present on only one captured side cannot disappear through intersection', async (t) => {
  const f = equivalentMergeFixture(t);
  const result = await f.withCoreInput((input) => {
    input.candidate.context.model.stores.knowledge.present = false;
    return replay(f, input);
  });
  assert.equal(result.status, 'incomplete'); assert.equal(result.diagnostics[0].code, 'merge-replay-store-unavailable');
  assert.equal(result.comparison, null);
});

test('redirect budget exhaustion preserves the mandatory source outcome and runs no queries', async (t) => {
  const f = equivalentMergeFixture(t);
  const result = await f.withCoreInput((input) => replay(f, input, { maxEligibilityRedirects: 0 }));
  assert.equal(result.status, 'incomplete'); assert.equal(result.comparison, null);
  assert.equal(result.subjects[0].after.code, 'redirect-budget');
  assert.equal(result.subjects[0].disposition, 'blocked');
});

for (const assigned of [false, true]) test(`stable retired operand exclusion ${assigned ? 'does not waive invalid assignments' : 'retains full actual outcomes'}`, async (t) => {
  const f = equivalentMergeFixture(t, {
    beforeChange: ({ context, put, replaceSubjects }) => {
      const document = structuredClone(context.model.subjectRegistry.document);
      const subject = document.subjects[2]; const { id, changes, ...before } = subject;
      const after = { ...structuredClone(before), status: 'retired', retirement: { kind: 'retire' } };
      const event = { id: '44444444-4444-4444-8444-444444444444', action: 'retire', decision: document.history[0].decision,
        reason: 'Retain unrelated retired meaning', rows: [{ id, before, after }] };
      event.review = { ...document.history[0].review, changeDigest: canonicalSha256(event) };
      document.history.push(event); document.revision += 1;
      document.subjects[2] = { id, ...after, changes: [...changes, event.id] };
      put('subjects/registry.yaml', registryWire(document));
      if (!assigned) { replaceSubjects('knowledge/K-000002.md', ['S-000001', 'S-000002']); replaceSubjects('knowledge/K-000006.md', []); }
    },
    candidateChange: ({ replaceSubjects }) => { if (!assigned) replaceSubjects('knowledge/K-000002.md', ['S-000002']); },
  });
  const result = await f.withCoreInput((input) => replay(f, input));
  assert.equal(result.status, assigned ? 'incomplete' : 'complete', JSON.stringify(result.diagnostics));
  const excluded = result.subjects.find(({ id }) => id === 'S-000003');
  assert.equal(excluded.disposition, 'stable-ineligible');
  assert.deepEqual(excluded.before, excluded.after);
  assert.equal(excluded.before.code, 'subject-retired');
  assert.equal(result.inventory.cases.length, 96);
  if (assigned) assert.ok(result.comparison.cases.some(({ candidates }) => candidates.status !== 'exact'));
});
