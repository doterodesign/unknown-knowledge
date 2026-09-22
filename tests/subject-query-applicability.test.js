import { test } from 'node:test';
import assert from 'node:assert/strict';
import { querySubjects, validateSubjectQuery } from '../payload/engine/lib/subject-query.js';
import { subjectQuery, queryBudgets } from './helpers/subject-query-fixture.js';
import { subjectQueryDiskFixture } from './helpers/subject-query-disk-fixture.js';

const profile = { profile: 'legacy-jurisdictions-v1', mode: 'any', jurisdictions: ['eu-eaa'] };
const request = (fields = {}) => subjectQuery({ op: 'all' }, { applicability: profile, ...fields });
function context(t) {
  const { context: captured } = subjectQueryDiskFixture(t);
  captured.model.leaves.get('K-000001').record.applies = { jurisdictions: ['eu-eaa'] };
  captured.model.leaves.get('K-000002').record.applies = { jurisdictions: ['us-ca'] };
  captured.model.leaves.get('K-000003').record.applies = { jurisdictions: [] };
  captured.model.leaves.get('K-000006').record.applies = { jurisdictions: ['us-ca'] };
  return captured;
}

test('explicit Knowledge scope uses actual captured vocabulary and distinguishes scope exclusions from predicate false', (t) => {
  const result = querySubjects(context(t), request());
  assert.equal(result.status, 'complete');
  assert.deepEqual(result.groups.knowledge.strict.map(({ ref }) => ref.id), ['K-000001', 'K-000003', 'K-000004', 'K-000005']);
  assert.equal(result.counts.knowledge.scopeExcluded, 2);
  assert.equal(result.counts.knowledge.excluded, 0);
  assert.equal(result.groups.knowledge.strict[0].applicability.scopeBasis, 'declared-jurisdictions');
  for (const row of result.groups.knowledge.strict.slice(1)) {
    assert.equal(row.applicability.scopeBasis, 'legacy-unrestricted-default');
  }
});

test('scope inclusion is any overlap, and output pages cannot determine scope counts', (t) => {
  const all = querySubjects(context(t), request({ applicability: { ...profile, jurisdictions: ['us-ca', 'eu-eaa'] } }));
  assert.equal(all.status, 'complete');
  assert.equal(all.counts.knowledge.strict, 6);
  assert.equal(all.counts.knowledge.scopeExcluded, 0);
  const query = request({ budgets: { ...queryBudgets, maxResultsPerStore: 1 } });
  const results = querySubjects(context(t), query);
  const counts = querySubjects(context(t), query, { collect: 'counts' });
  assert.equal(results.groups.knowledge.strict.length, 1);
  assert.deepEqual(results.counts, counts.counts);
  assert.equal(counts.counts.knowledge.strict, 4);
});

test('missing captured vocabulary and unknown exact values refuse instead of becoming zero matches', (t) => {
  const captured = context(t);
  captured.model.registries.delete('knowledge/jurisdictions');
  assert.equal(validateSubjectQuery(request(), captured).diagnostics[0].code, 'unavailable-jurisdiction-registry');
  for (const value of ['EU-EAA', ' eu-eaa', 'never-minted']) {
    const result = validateSubjectQuery(request({ applicability: { ...profile, jurisdictions: [value] } }), context(t));
    assert.equal(result.ok, false);
    assert.equal(result.diagnostics[0].code, 'unknown-jurisdiction');
  }
});

test('scope profile refuses unsupported stores/modes and ambiguous or empty requested sets', (t) => {
  for (const fields of [{ stores: ['knowledge', 'decisions'] },
    { applicability: { ...profile, mode: 'all' } }, { applicability: { ...profile, mode: 'containment' } },
    { applicability: { ...profile, jurisdictions: [] } },
    { applicability: { ...profile, jurisdictions: ['eu-eaa', 'eu-eaa'] } },
    { applicability: { ...profile, extra: true } }]) {
    assert.equal(validateSubjectQuery(request(fields), context(t)).ok, false);
  }
});

test('scope filtering cannot conceal invalid assignment references on excluded records', (t) => {
  const captured = context(t);
  captured.model.leaves.get('K-000002').record.subjects = ['S-999999'];
  const result = querySubjects(captured, request());
  assert.equal(result.status, 'refused');
  assert.equal(result.diagnostics[0].code, 'unknown-subject');
  assert.equal(result.groups, null);
});

test('scope lookup and fingerprint use the same full captured document despite stale disposable indexes', (t) => {
  const captured = context(t);
  const registry = captured.model.registries.get('knowledge/jurisdictions');
  const first = validateSubjectQuery(request(), captured);
  assert.equal(first.ok, true);
  assert.match(first.input.inputs.jurisdictions, /^[a-f0-9]{64}$/);
  assert.deepEqual(first.requirements.constraintPaths.at(-1), { path: '/applicability', kind: 'selector', origin: 'explicit' });
  registry.minted.clear();
  registry.minted.add('never-minted');
  registry.suppressed.add('eu-eaa');
  const indexed = validateSubjectQuery(request(), captured);
  assert.equal(indexed.ok, true);
  assert.equal(indexed.input.fingerprint, first.input.fingerprint);
  assert.equal(validateSubjectQuery(request({ applicability: { ...profile, jurisdictions: ['never-minted'] } }), captured)
    .diagnostics[0].code, 'unknown-jurisdiction');
  registry.document.values[0].gloss = 'Clarified authored scope';
  const changed = validateSubjectQuery(request(), captured);
  assert.equal(changed.ok, true);
  assert.notEqual(changed.input.inputs.jurisdictions, first.input.inputs.jurisdictions);
  assert.notEqual(changed.input.fingerprint, first.input.fingerprint);
});

test('suppression and duplicate declarations in actual source cannot be hidden by old minted sets', (t) => {
  const captured = context(t);
  const document = captured.model.registries.get('knowledge/jurisdictions').document;
  document.values[0].status = 'suppressed';
  assert.equal(validateSubjectQuery(request(), captured).diagnostics[0].code, 'suppressed-jurisdiction');
  delete document.values[0].status;
  document.values.push(structuredClone(document.values[0]));
  assert.equal(validateSubjectQuery(request(), captured).diagnostics[0].code, 'invalid-jurisdiction-registry');
});
