import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { words, queryTerms, buildIndex, ask } from '../payload/engine/lib/ask.js';
import { aggregate, describeFields, UnknownFieldError } from '../payload/engine/lib/aggregate.js';
import { classifyConfidence, NONE_BELOW, COVERED_TOP } from '../payload/engine/lib/ask-service.js';

const tsApp = fileURLToPath(new URL('../fixtures/ts-app', import.meta.url));
const askJs = fileURLToPath(new URL('../payload/engine/ask.js', import.meta.url));

/** The smallest model lib/load-stores `authoringRecords` accepts. */
function model({ leaves = [], concepts = [], decisions = [], subjects = [] } = {}) {
  const map = (rows) => new Map(rows.map((r) => [r.id, r]));
  return {
    leaves: map(leaves.map(({ id, body = '', ...record }) => ({ id, identity: id, file: `knowledge/${id}.md`, body, record: { id, ...record } }))),
    concepts: map(concepts.map(({ id, ...record }) => ({ id, file: `ontology/${id}.yaml`, record: { id, ...record } }))),
    decisions: map(decisions.map(({ id, ...record }) => ({ id, file: `decisions/${id}.yaml`, record: { id, ...record } }))),
    proposals: { knowledge: new Map(), ontology: new Map(), decision: new Map() },
    subjectRegistry: {
      subjects: new Map(subjects.map((s) => [s.id, s])),
      parents: new Map(subjects.filter((s) => s.parent).map((s) => [s.id, s.parent])),
    },
  };
}
const one = (m) => buildIndex([{ installation: 'test', model: m }]);

test('words fold accents, split punctuation and keep hyphenated compounds', () => {
  assert.deepEqual(words('Éclat: --accent-soft exports'), ['eclat', 'accent', 'soft', 'accentsoft', 'export']);
  assert.deepEqual(words('đỏ'), ['do']);
});

test('query noise is judged before folding, so đỏ survives and "do" does not', () => {
  assert.deepEqual(queryTerms('What do we know about đỏ?'), ['know', 'do']);
  assert.deepEqual(queryTerms('Clarify the intended meaning if ambiguous: rouge'), ['rouge']);
});

test('a record named by a distinctive title word is always returned', () => {
  const filler = Array.from({ length: 12 }, (_, i) => ({
    id: `K-0000${String(i + 10).padStart(2, '0')}`, heading: `Attention study ${i}`, subjects: ['S-000001'],
    body: 'Attention result in this collection.',
  }));
  const m = model({
    subjects: [{ id: 'S-000001', label: 'Red', aliases: ['Rouge'] }],
    leaves: [...filler, { id: 'K-000001', heading: 'Rouge project', body: 'A naming study.' }],
  });
  const result = ask(one(m), 'Does Rouge provide an attention result in this collection?', { limit: 5 });
  assert.ok(result.ranked.some((r) => r.doc.id === 'K-000001'), 'named record kept in the top 5');
});

test('an accession ID leads the results and the rest of the question is still searched', () => {
  const m = model({
    concepts: [{ id: 'O-000001', term: 'North contract' }],
    leaves: [{ id: 'K-000001', heading: 'Supported export formats', body: 'CSV and JSON.' }],
  });
  const result = ask(one(m), 'What export formats does O-000001 support?');
  assert.deepEqual(result.ranked.map((r) => r.doc.id), ['O-000001', 'K-000001']);
  assert.deepEqual(result.signals.exact, { requested: 1, found: 1 });
  assert.equal(ask(one(m), 'O-000001').signals.mode, 'exact-id');
});

test('decisions are searched alongside knowledge and ontology', () => {
  const m = model({ decisions: [{ id: 'D-000001', title: 'Retention interval is seven years', status: 'accepted' }] });
  assert.equal(ask(one(m), 'retention interval').ranked[0].doc.id, 'D-000001');
});

test('tiers: covered is strict, none only when nothing distinctive matched', () => {
  const base = { mode: 'search', topScore: 3, unknown: [], missed: [], ties: 0 };
  assert.equal(classifyConfidence({ ...base, coverage: 1, topCoverage: COVERED_TOP }), 'covered');
  assert.equal(classifyConfidence({ ...base, coverage: 1, topCoverage: 1, ties: 2 }), 'partial', 'ambiguous');
  assert.equal(classifyConfidence({ ...base, coverage: 1, topCoverage: 1, unknown: ['zebra'] }), 'partial', 'vocabulary gap');
  assert.equal(classifyConfidence({ ...base, coverage: 1, topCoverage: 1, missed: ['plant'] }), 'partial', 'top three miss a term');
  assert.equal(classifyConfidence({ ...base, coverage: NONE_BELOW - 0.01, topCoverage: 0.1 }), 'none');
  assert.equal(classifyConfidence({ ...base, topScore: 0, coverage: 0, topCoverage: 0 }), 'none');
  assert.equal(classifyConfidence({ mode: 'exact-id', exact: { requested: 2, found: 1 } }), 'partial');
});

test('aggregation counts exactly, reports missing fields and never counts the filter value', () => {
  const m = model({
    subjects: [
      { id: 'S-000001', label: 'Complaints' },
      { id: 'S-000002', label: 'Delivery', parent: 'S-000001' },
      { id: 'S-000003', label: 'Late delivery', parent: 'S-000002' },
      { id: 'S-000004', label: 'Billing', parent: 'S-000001' },
    ],
    leaves: [
      { id: 'K-000001', heading: 'c1', terms: ['complaint', 'late'], subjects: ['S-000003'] },
      { id: 'K-000002', heading: 'c2', terms: ['complaint', 'late'], subjects: ['S-000002'] },
      { id: 'K-000003', heading: 'c3', terms: ['complaint', 'fees'], subjects: ['S-000004'] },
      { id: 'K-000004', heading: 'c4', terms: ['complaint'] },
      { id: 'K-000005', heading: 'praise', terms: ['praise'], subjects: ['S-000004'] },
    ],
  });
  const index = one(m);
  const byTerm = aggregate(index, { where: [{ field: 'term', value: 'Complaint' }], countBy: 'term' });
  assert.equal(byTerm.selected, 4);
  assert.equal(byTerm.missing, 1, 'K-000004 has no term besides the filter');
  assert.deepEqual(byTerm.top.map((g) => [g.value, g.count]), [['late', 2], ['fees', 1]]);

  // Subjects select by descendant and roll up to the child of --under.
  const bySubject = aggregate(index, { where: [{ field: 'subject', value: 'S-000001' }], countBy: 'subject', under: 'S-000001' });
  assert.equal(bySubject.selected, 4, 'K-000004 has no subject; K-000005 is under Billing');
  assert.deepEqual(bySubject.top.map((g) => [g.label, g.count]), [['Delivery', 2], ['Billing', 2]], 'ties order by value');

  const cut = aggregate(index, { where: [{ field: 'subject', value: 'S-000001' }], countBy: 'subject', under: 'S-000001', top: 1 });
  assert.equal(cut.tieAtCut, true, 'Delivery and Billing tie across the cut');

  assert.throws(() => aggregate(index, { countBy: 'colour' }), UnknownFieldError);
  assert.ok(describeFields(index).fields.some((f) => f.field === 'term'));
});

test('ask CLI: search is small and deterministic, and API returns the same payload', async () => {
  const run = (...args) => spawnSync(process.execPath, [askJs, ...args, '--root', tsApp, '--json'], { encoding: 'utf8' });
  const first = run('export format');
  assert.equal(first.status, 0, first.stderr);
  assert.equal(first.stdout, run('export format').stdout, 'byte-identical reruns');
  assert.ok(first.stdout.length < 4096, `payload ${first.stdout.length} bytes`);
  const payload = JSON.parse(first.stdout);
  assert.equal(payload['store-health'].ok, true);
  assert.ok(payload.records.length > 0);

  const { invoke } = await import('../payload/engine/api/index.js');
  const viaApi = await invoke({ interfaceVersion: 1, operation: 'record.ask', inputVersion: 1, root: tsApp, input: { question: 'export format' } });
  assert.equal(viaApi.status, 'completed');
  assert.deepEqual(viaApi.data, payload);

  const refused = await invoke({ interfaceVersion: 1, operation: 'record.ask', inputVersion: 1, root: tsApp, input: { mode: 'count', countBy: 'colour' } });
  assert.equal(refused.status, 'refused');
  assert.equal(refused.diagnostics[0].code, 'unknown-field');

  const usage = spawnSync(process.execPath, [askJs, '--count-by', 'colour', '--root', tsApp], { encoding: 'utf8' });
  assert.equal(usage.status, 2);
});
