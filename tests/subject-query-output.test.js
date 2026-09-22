import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { subjectQueryDiskFixture } from './helpers/subject-query-disk-fixture.js';
import { subjectQuery, subjectQueryFixture } from './helpers/subject-query-fixture.js';
import { loadSubjectQueryContext } from '../payload/engine/lib/subject-query-context.js';
import { querySubjects } from '../payload/engine/lib/subject-query.js';
import { expandedQueryRow, queryExplanationNodes, jsonNodes } from './helpers/subject-query-output.js';

const subjects = ['S-000001', 'S-000002', 'S-000003'];
function allStores(t) {
  const f = subjectQueryDiskFixture(t);
  const identity = structuredClone(f.context.model.identity);
  const publication = identity.allocations.find(row => row.id === 'D-000001').publication;
  const catalogs = Object.fromEntries(['knowledge', 'decisions'].map(store => [store,
    JSON.parse(readFileSync(join(f.kitRoot, store, '_catalog.yaml'), 'utf8'))]));
  catalogs.ontology = { 'schema-version': 2, store: 'ontology', entries: [] };
  const sources = [];
  for (const [store, kind, prefix] of [['knowledge', 'knowledge', 'K'], ['ontology', 'ontology', 'O'], ['decisions', 'decision', 'D']]) {
    for (let index = 1; index <= 12; index++) {
      const id = `${prefix}-${String(index + (prefix === 'D' ? 1 : 0)).padStart(6, '0')}`;
      if (!identity.allocations.some(row => row.id === id)) identity.allocations.push({ kind, id, state: 'allocated', publication });
      const existing = catalogs[store].entries.find(row => row.id === id);
      const file = existing?.file ?? (prefix === 'K' ? `${id}.md` : `${prefix === 'D' ? 'entries' : 'classes'}/${id}.yaml`);
      if (!existing) catalogs[store].entries.push({ id, title: id, file });
      const record = prefix === 'K' ? { 'schema-version': 3, id, heading: id, domain: 'world',
        facets: { stage: 'verified' }, citations: [{ source: 'original source' }], subjects }
        : prefix === 'O' ? { id, term: id, class: 'general', summary: id, status: 'active', subjects,
          'source-of-truth': ['sources/item.txt'] }
          : { id, title: id, category: 'architecture', status: 'accepted', date: '2026-09-19', deciders: ['steward'],
            context: 'Observed', decision: 'Reviewed', subjects };
      f.put(`${store}/${file}`, prefix === 'K' ? `---\n${JSON.stringify(record)}\n---\nSource body.\n`
        : { 'schema-version': 2, entries: [record] });
      sources.push({ store, kind, file: `${store}/${file}`, record, position: index });
    }
    f.put(`${store}/_catalog.yaml`, catalogs[store]);
  }
  f.put('_identity.yaml', identity);
  f.put('sources/item.txt', 'Original source\n');
  const loaded = loadSubjectQueryContext({ root: f.root, decisionCaptures: f.decisionCaptures });
  assert.equal(loaded.ok, true, JSON.stringify(loaded.diagnostics));
  return { ...f, context: loaded.context, sources };
}

test('subject eligibility reaches a record beyond the registered lexical top-ten window', t => {
  const f = allStores(t);
  for (const { file, record } of f.sources.filter(source => source.kind === 'knowledge')) {
    const authored = { ...record, heading: 'Chromatic reference', terms: ['chromatic'],
      subjects: [record.id === 'K-000011' ? 'S-000001' : 'S-000002'] };
    f.put(file, `---\n${JSON.stringify(authored)}\n---\nSource body.\n`);
  }
  const loaded = loadSubjectQueryContext({ root: f.root, decisionCaptures: f.decisionCaptures });
  assert.equal(loaded.ok, true, JSON.stringify(loaded.diagnostics));
  const lexical = spawnSync(process.execPath,
    [fileURLToPath(new URL('../payload/engine/resolve.js', import.meta.url)), 'chromatic',
      '--root', f.root, '--json', '--today', '2026-09-19'], { encoding: 'utf8' });
  assert.equal(lexical.status, 0, lexical.stdout + lexical.stderr);
  const ranked = JSON.parse(lexical.stdout).leaves.map(row => row.id);
  assert.deepEqual(ranked, ['K-000001', 'K-000002', 'K-000003', 'K-000004',
    'K-000005', 'K-000006', 'K-000007', 'K-000008', 'K-000009', 'K-000010',
    'K-000011', 'K-000012']);
  // The resolver returns all matches; Recall@10 is the evaluator's window.
  assert.equal(ranked.slice(0, 10).includes('K-000011'), false);
  const result = querySubjects(loaded.context, subjectQuery({ op: 'assigned', subject: 'S-000001' }));
  assert.equal(result.status, 'complete', JSON.stringify(result.diagnostics));
  assert.equal(result.coverage.evaluationComplete, true);
  assert.equal(result.coverage.explanationsComplete, true);
  assert.equal(result.counts.knowledge.strict, 1);
  assert.deepEqual(result.groups.knowledge.strict.map(row => row.ref), [
    { namespace: loaded.context.model.identity.namespace, kind: 'knowledge', id: 'K-000011' },
  ]);
  assert.deepEqual(result.groups.knowledge.strict[0].witness, [{ path: '/where', op: 'assigned',
    subject: 'S-000001', expansion: 'direct', truth: 'T', matchedSubjects: ['S-000001'],
    assignmentState: 'known', resolvedSubject: 'S-000001', redirects: [], expansionComplete: true }]);
});

test('all three real store pages retain full evidence under the original 4096-node ceiling', t => {
  const f = allStores(t);
  const query = subjectQuery(undefined, { stores: ['knowledge', 'ontology', 'decisions'] });
  query.budgets.maxExplanationNodes = 4096;
  const result = querySubjects(f.context, query);
  assert.equal(result.status, 'complete', JSON.stringify(result.diagnostics));
  assert.deepEqual(Object.values(result.groups).map(group => group.strict.length), [10, 10, 10],
    JSON.stringify({ counts: result.counts, used: result.resources.used, coverage: result.coverage }));
  assert.equal(result.coverage.explanationsComplete, true);
  assert.equal(result.coverage.pageTruncated, true, 'twelve matches per store still exceed the ten-row page');
  assert.deepEqual(Object.values(result.counts).map(count => count.strict), [12, 12, 12]);
  assert.equal(result.resources.used.explanationNodes, queryExplanationNodes(result));
  assert.ok(Buffer.byteLength(`${JSON.stringify(result, null, 2)}\n`) < 262144);
  for (const group of Object.values(result.groups)) for (const row of group.strict) {
    assert.deepEqual(row.assignments, { state: 'known', ids: subjects });
    assert.deepEqual(expandedQueryRow(result, row).assignmentSubjects.map(({ originalId, index, path }) => ({ originalId, index, path })),
      subjects.map((originalId, index) => ({ originalId, index, path: `subjects[${index}]` })));
  }
  // Derive full expected outcomes from authored file bytes, independently of
  // query/eligibility output and without the production normalization helpers.
  const names = { 'origin-decision': 'originDecision', 'accepted-status': 'acceptedStatus',
    'decision-capture': 'decisionCapture', 'decision-digest': 'decisionDigest', 'change-digest': 'changeDigest' };
  const normalize = value => Array.isArray(value) ? value.map(normalize)
    : value !== null && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([k, v]) => [names[k] ?? k, normalize(v)])) : value;
  const forest = new Map(JSON.parse(readFileSync(join(f.kitRoot, 'subjects/registry.yaml'))).subjects.map(s => [s.id, normalize(s)]));
  const namespace = JSON.parse(readFileSync(join(f.kitRoot, '_identity.yaml'))).namespace;
  for (const { store, kind, file, record, position } of f.sources.filter(source => source.position <= 10)) {
    const expected = { identityType: 'record', ref: { namespace, kind, id: record.id }, label: record.id, file,
      sourcePointers: { sourceOfTruth: record['source-of-truth'] ?? null, citations: record.citations ?? null },
      lifecycle: { basis: 'lifecycle-only', value: kind === 'knowledge' ? 'verified' : record.status }, truth: 'T',
      witness: [{ path: '/where', op: 'assigned', subject: 'S-000001', expansion: 'direct', truth: 'T',
        matchedSubjects: ['S-000001'], assignmentState: 'known', resolvedSubject: 'S-000001', redirects: [], expansionComplete: true }],
      unknowns: [], assignments: { state: 'known', ids: subjects },
      assignmentSubjects: subjects.map((originalId, index) => ({ originalId, index, path: `subjects[${index}]`,
        outcome: { eligible: true, verification: 'verified', resolution: { status: 'resolved', requestedId: originalId,
          subject: forest.get(originalId), policy: 'current', redirects: [], id: originalId } } })),
      rank: { profile: 'id-v1', signals: [], position } };
    assert.deepEqual(expandedQueryRow(result, result.groups[store].strict[position - 1]), expected);
  }
});

const localExplanation = row => Object.fromEntries(['witness', 'unknowns', 'assignments', 'applicability']
  .filter(key => Object.hasOwn(row, key)).map(key => [key, row[key]]));

test('exact and one-node-short admission charges the serialized table and every retained local value', t => {
  const f = allStores(t);
  const query = subjectQuery(undefined, { stores: ['knowledge', 'ontology', 'decisions'] });
  const full = querySubjects(f.context, query);
  const cost = queryExplanationNodes(full);
  const exact = querySubjects(f.context, { ...query, budgets: { ...query.budgets, maxExplanationNodes: cost } });
  assert.equal(exact.coverage.explanationsComplete, true);
  assert.equal(queryExplanationNodes(exact), cost);
  const short = querySubjects(f.context, { ...query, budgets: { ...query.budgets, maxExplanationNodes: cost - 1 } });
  assert.equal(short.coverage.explanationsComplete, false);
  assert.equal(Object.values(short.groups).reduce((sum, group) => sum + group.strict.length, 0), 29);
  assert.equal(short.resources.used.explanationNodes, queryExplanationNodes(short));
  assert.deepEqual(short.counts, full.counts);
});

test('failed multi-outcome admission rolls back all new entries while later empty and unknown rows can fit', () => {
  const context = subjectQueryFixture();
  context.model.leaves.get('K-000003').record.subjects = [];
  context.model.leaves.get('K-000006').record.subjects = [];
  const query = subjectQuery({ op: 'all' });
  const full = querySubjects(context, query);
  const first = querySubjects(context, { ...query, budgets: { ...query.budgets, maxResultsPerStore: 1 } });
  const cap = queryExplanationNodes(first) + jsonNodes(localExplanation(full.groups.knowledge.strict[1]))
    + jsonNodes(full.assignmentEvidence.outcomes['S-000002']);
  const result = querySubjects(context, { ...query, budgets: { ...query.budgets, maxExplanationNodes: cap } });
  assert.equal(result.coverage.explanationsComplete, false);
  assert.deepEqual(Object.keys(result.assignmentEvidence.outcomes), ['S-000001']);
  assert.equal(result.groups.knowledge.strict.some(row => row.ref.id === 'K-000002'), false);
  assert.ok(result.groups.knowledge.strict.some(row => row.ref.id === 'K-000004'));
  assert.ok(result.groups.knowledge.strict.some(row => row.ref.id === 'K-000005'));
  assert.equal(result.resources.used.explanationNodes, queryExplanationNodes(result));
});

test('zero, counts, unknown-only and empty-only results omit all unused evidence', () => {
  const context = subjectQueryFixture();
  const query = subjectQuery({ op: 'all' });
  for (const result of [querySubjects(context, { ...query, budgets: { ...query.budgets, maxExplanationNodes: 0 } }),
    querySubjects(context, query, { collect: 'counts' })]) {
    assert.equal(Object.hasOwn(result, 'assignmentEvidence'), false);
    assert.equal(result.resources.used.explanationNodes, 0);
    assert.equal(result.outputVersion, 2);
  }
  for (const entry of context.model.leaves.values()) delete entry.record.subjects;
  const unknown = querySubjects(context, query);
  assert.equal(Object.hasOwn(unknown, 'assignmentEvidence'), false);
  assert.equal(queryExplanationNodes(unknown), unknown.resources.used.explanationNodes);
  for (const entry of context.model.leaves.values()) entry.record.subjects = [];
  const empty = querySubjects(context, query);
  assert.equal(Object.hasOwn(empty, 'assignmentEvidence'), false);
  assert.equal(queryExplanationNodes(empty), empty.resources.used.explanationNodes);
  assert.notDeepEqual(empty.groups, unknown.groups);
});

test('factoring does not authorize a later invalid record or avoid cumulative equivalent redirects', () => {
  const context = subjectQueryFixture();
  context.model.leaves.get('K-000006').record.subjects = ['S-999999'];
  const refused = querySubjects(context, subjectQuery({ op: 'all' }));
  assert.equal(refused.status, 'refused'); assert.equal(refused.groups, null);
  assert.equal(Object.hasOwn(refused, 'assignmentEvidence'), false);
  const equivalent = subjectQueryFixture({ equivalent: true });
  const query = subjectQuery({ op: 'all' }, { subjectPolicy: 'equivalent' });
  query.budgets.maxRedirects = 1;
  const partial = querySubjects(equivalent, query);
  assert.equal(partial.status, 'incomplete');
  assert.equal(partial.resources.used.redirects, 1);
  assert.equal(partial.coverage.evaluationComplete, false);
  assert.deepEqual(partial.groups.knowledge.strict.map(row => row.ref.id), ['K-000001']);
  assert.equal(partial.resources.used.explanationNodes, queryExplanationNodes(partial));
});

test('ordered assignments and original equivalent IDs reconstruct exactly and results do not alias across calls', () => {
  const context = subjectQueryFixture({ equivalent: true });
  context.model.leaves.get('K-000002').record.subjects = ['S-000003', 'S-000001', 'S-000002'];
  const query = subjectQuery({ op: 'all' }, { subjectPolicy: 'equivalent' });
  const first = querySubjects(context, query);
  const second = querySubjects(context, query);
  assert.deepEqual(Object.keys(first.assignmentEvidence.outcomes), subjects);
  assert.deepEqual(expandedQueryRow(first, first.groups.knowledge.strict[1]).assignmentSubjects.map(row => [row.originalId, row.index, row.path]),
    [['S-000003', 0, 'subjects[0]'], ['S-000001', 1, 'subjects[1]'], ['S-000002', 2, 'subjects[2]']]);
  first.assignmentEvidence.outcomes['S-000001'].resolution.redirects[0].to = 'S-999999';
  assert.deepEqual(querySubjects(context, query), second);
  assert.equal(second.assignmentEvidence.outcomes['S-000001'].resolution.id, 'S-000002');
  assert.equal(second.assignmentEvidence.outcomes['S-000002'].resolution.id, 'S-000002');
});
