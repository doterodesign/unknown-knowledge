import test from 'node:test';
import assert from 'node:assert/strict';
import { typedEquivalentMergeFixture } from './helpers/typed-equivalent-merge-fixture.js';
import { runPreparedEquivalentMergeGate } from '../payload/engine/lib/subject-equivalent-merge-gate.js';
import { captureCommittedFile } from '../payload/engine/lib/captured-source.js';

for (const kinds of [['ontology'], ['decision'], ['knowledge', 'ontology', 'decision']]) {
  test(`${kinds.join('/')}: actual merge covers every typed affected owner and grouped file`, async (t) => {
    const f = typedEquivalentMergeFixture(t, { kinds, nested: kinds.length === 3 });
    const result = await runPreparedEquivalentMergeGate(f.input);
    assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
    assert.deepEqual([...new Set(result.authoredReferenceClosure.affectedRefs.map(({ kind }) => kind))].sort(), [...kinds].sort());
    assert.equal(result.assignments.rows.length, kinds.length * 2);
    assert.ok(result.assignments.rows.every(({ preservation }) => preservation.ok));
    const replay = result.impacts.representativeReplays;
    assert.deepEqual(replay.scope.stores, ['knowledge', 'ontology', 'decisions']);
    assert.equal(replay.inventory.cases.length, 216); assert.equal(replay.comparison.resources.queries.calls, 432);
    assert.equal(result.impacts.subjectTree.status, 'complete'); assert.equal(result.publicationReady, false);
    for (const kind of kinds.filter((kind) => kind !== 'knowledge')) {
      const store = kind === 'decision' ? 'decisions' : kind;
      const ids = kind === 'decision' ? ['D-000002', 'D-000003'] : ['O-000001', 'O-000002'];
      for (const view of ['current', 'all']) for (const expansion of ['direct', 'self-and-descendants']) {
        const cases = replay.comparison.cases;
        const source = cases.find(({ id }) => id === `${store}/${view}/${expansion}/assigned/S-000001`);
        const survivor = cases.find(({ id }) => id === `${store}/${view}/${expansion}/assigned/S-000002`);
        const both = cases.find(({ id }) => id === `${store}/${view}/${expansion}/and/S-000001/S-000002`);
        assert.deepEqual(source.before.groups[store].strict.map(({ ref }) => ref.id), ids);
        assert.deepEqual(source.after.groups[store].strict.map(({ ref }) => ref.id), ids);
        assert.deepEqual(survivor.candidates.strict.added.map(({ ref }) => ref.id), [ids[0]]);
        assert.deepEqual(both.candidates.strict.added.map(({ ref }) => ref.id), [ids[0]]);
        assert.equal(source.specification.query.where.subject, 'S-000001');
      }
      assert.equal(result.impacts.reach.records.filter(({ ref }) => ids.includes(ref.id)).length, 2);
      const grouped = result.assignments.rows.filter(({ ref }) => ref.kind === kind);
      assert.deepEqual(grouped[0].preservation, grouped[1].preservation);
    }
    if (kinds.length === 3) assert.deepEqual(await runPreparedEquivalentMergeGate(f.input), result);
  });
}

for (const kind of ['ontology', 'decision']) {
  test(`${kind}: an edited known unselected sibling refuses despite newly sealed captures`, async (t) => {
    const f = typedEquivalentMergeFixture(t, { kinds: [kind] }); const file = f.files[kind];
    const sibling = kind === 'ontology' ? 'O-000003' : 'D-000004';
    f.put(file, f.read(file).replace(`Retained ${sibling}`, `Altered ${sibling}`)); f.save();
    const result = await runPreparedEquivalentMergeGate(f.input);
    assert.equal(result.ok, false); assert.equal(result.checks.preservation.status, 'failed');
  });
  test(`${kind}: a retained unknown sibling preserves its whole physical file`, async (t) => {
    const f = typedEquivalentMergeFixture(t, { kinds: [kind], unknownSibling: kind });
    const result = await runPreparedEquivalentMergeGate(f.input);
    assert.equal(result.ok, false); assert.equal(result.diagnostics[0].diagnostics[0].code, 'merge-retained-unknown-changed');
    assert.equal(result.impacts.reach, null);
  });
  test(`${kind}: inactive direct source owners remain unsupported`, async (t) => {
    const f = typedEquivalentMergeFixture(t, { kinds: [kind], inactive: kind });
    const result = await runPreparedEquivalentMergeGate(f.input);
    assert.equal(result.ok, false); assert.equal(result.diagnostics[0].diagnostics[0].code, 'merge-source-use-unsupported');
  });
}

for (const authorizer of ['self', 'sibling']) test(`selected ${authorizer} cannot change the authorizer whole file`, async (t) => {
  const f = typedEquivalentMergeFixture(t, { kinds: ['decision'], authorizer });
  const result = await runPreparedEquivalentMergeGate(f.input);
  assert.equal(result.ok, false); assert.equal(result.checks.decision.status, 'failed');
  assert.equal(result.diagnostics[0].diagnostics[0].code, 'merge-authorizer-changed');
});

test('an accepted-to-addressed edit remains forbidden even though both statuses are effective', async (t) => {
  const f = typedEquivalentMergeFixture(t, { kinds: ['decision'] }); const file = f.files.decision;
  f.put(file, f.read(file).replace('status: "accepted"', 'status: "addressed"')); f.save();
  const result = await runPreparedEquivalentMergeGate(f.input);
  assert.equal(result.ok, false); assert.equal(result.assignments.diagnostics[0].code, 'assignment-target-not-effective');
});

test('omitting one selected physical-file sibling cannot shrink derived merge scope', async (t) => {
  const f = typedEquivalentMergeFixture(t, { kinds: ['ontology'] }); f.assignmentEvent.rows.pop(); f.save();
  const result = await runPreparedEquivalentMergeGate(f.input);
  assert.equal(result.ok, false); assert.equal(result.assignments.diagnostics[0].code, 'assignment-model-unavailable');
  assert.equal(result.checks.models.status, 'failed'); assert.equal(result.impacts.reach, null);
});

test('removing an unknown sibling disposition cannot waive whole-file preservation', async (t) => {
  const f = typedEquivalentMergeFixture(t, { kinds: ['ontology'], unknownSibling: 'ontology' });
  f.input.operation.retainedUnknowns.pop();
  const result = await runPreparedEquivalentMergeGate(f.input);
  assert.equal(result.ok, false); assert.equal(result.diagnostics[0].diagnostics[0].code, 'merge-retained-unknown-scope');
});

test('selected-record capacity counts both typed entries even when they share one file', async (t) => {
  const f = typedEquivalentMergeFixture(t, { kinds: ['ontology'] }); f.input.limits.assignments.maxRecords = 1;
  const result = await runPreparedEquivalentMergeGate(f.input);
  assert.equal(result.ok, false); assert.equal(result.assignments.diagnostics[0].code, 'assignment-record-budget');
});

test('a tracked O sibling keeps its prior revision while a new sibling adopts the exact baseline', async (t) => {
  const f = typedEquivalentMergeFixture(t, { kinds: ['ontology'], tracked: true });
  const result = await runPreparedEquivalentMergeGate(f.input);
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  assert.equal(result.assignments.checks.history.status, 'passed');
  assert.deepEqual(f.assignmentEvent.rows.map((row) => [row.ref.id, row['before-revision'], row['after-revision']]),
    [['O-000001', 1, 2], ['O-000002', 0, 1]]);
});

test('inventing explicit empty classification for a protected unknown sibling cannot waive retention', async (t) => {
  const f = typedEquivalentMergeFixture(t, { kinds: ['ontology'], unknownSibling: 'ontology' });
  f.put(f.files.ontology, `${f.read(f.files.ontology)}    subjects: []\n`); f.save();
  const result = await runPreparedEquivalentMergeGate(f.input);
  assert.equal(result.ok, false); assert.equal(result.diagnostics[0].diagnostics[0].code, 'merge-retained-unknown-scope');
});

test('grouped capture accounting charges the actual file workload and refuses one byte short', async (t) => {
  const f = typedEquivalentMergeFixture(t, { kinds: ['ontology'] });
  const size = (side, file) => captureCommittedFile({ repoRoot: f.root, commit: f.input[side].commit, file }).bytes.length;
  const file = f.files.ontology;
  const expected = size('before', file) + 2 * size('candidate', file)
    + size('before', 'subjects/registry.yaml') + size('candidate', 'subjects/registry.yaml')
    + size('before', 'decisions/entries/approval.yaml');
  f.input.limits.assignments.maxCaptureBytes = expected;
  const result = await runPreparedEquivalentMergeGate(f.input);
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  assert.equal(result.assignments.used.captureBytes, expected);
  f.input.limits.assignments.maxCaptureBytes = expected - 1;
  const refused = await runPreparedEquivalentMergeGate(f.input);
  assert.equal(refused.ok, false); assert.equal(refused.assignments.diagnostics[0].code, 'assignment-byte-budget');
});
