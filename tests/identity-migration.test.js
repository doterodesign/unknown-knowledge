import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inventorySourceDocuments, planIdentityCorrespondence } from '../payload/engine/lib/identity-migration.js';

const document = (file, kind, text) => ({ file, kind, bytes: Buffer.from(text) });
const namespace = '11111111-1111-4111-8111-111111111111';
const publication = { id: '22222222-2222-4222-8222-222222222222', review: 'review/cutover' };

test('offline inventory preserves exact source spelling and every duplicate locator', () => {
  const source = document('decisions/entries/history.yaml', 'decision-entry', `schema-version: 1
entries:
  - id: D-1
  - id: D-001
  - id: D-000000
  - id: D-1234567
  - id: D-1
`);
  const inventory = inventorySourceDocuments([source]);
  assert.deepEqual(inventory.records.map(({ kind, id, file, path }) => ({ kind, id, file, path })), [
    { kind: 'decision', id: 'D-000000', file: source.file, path: ['entries', 2, 'id'] },
    { kind: 'decision', id: 'D-001', file: source.file, path: ['entries', 1, 'id'] },
    { kind: 'decision', id: 'D-1', file: source.file, path: ['entries', 0, 'id'] },
    { kind: 'decision', id: 'D-1', file: source.file, path: ['entries', 4, 'id'] },
    { kind: 'decision', id: 'D-1234567', file: source.file, path: ['entries', 3, 'id'] },
  ]);
  assert.equal(new Set(inventory.records.map((record) => record.key)).size, 5);
  assert.equal(inventory.diagnostics.some((item) => item.code === 'duplicate-source-id'), true);
});

test('typed reference inventory resolves old ontology K independently from knowledge identity', () => {
  const inventory = inventorySourceDocuments([
    document('ontology/classes/100.yaml', 'ontology-concept', 'entries: [{id: K-000001, rationale: [D-1]}]\n'),
    document('decisions/entries/one.yaml', 'decision-entry', 'entries: [{id: D-1, relates-to: {concepts: [K-000001], leaves: [L-000001]}}]\n'),
    document('knowledge/one.md', 'knowledge-leaf', '---\nid: L-000001\nconcepts: [K-000001]\n---\nLiteral K-000001 in source evidence.\n'),
  ]);
  assert.deepEqual(inventory.references.map(({ kind, id, status }) => ({ kind, id, status })).sort((a, b) => a.kind.localeCompare(b.kind)), [
    { kind: 'decision', id: 'D-1', status: 'resolved' },
    { kind: 'knowledge', id: 'L-000001', status: 'resolved' },
    { kind: 'ontology', id: 'K-000001', status: 'resolved' },
    { kind: 'ontology', id: 'K-000001', status: 'resolved' },
  ]);
  for (const ref of inventory.references) assert.equal(inventory.records.find((record) => record.key === ref.target).kind, ref.kind);
  assert.ok(inventory.reviewRequired.some(({ file, path }) => file === 'knowledge/one.md' && path[0] === '$body'));
});

test('scalar spans select original ID bytes after BOM, Unicode, CRLF and quoted comments', () => {
  const text = '\uFEFF---\r\ntitle: "色 😀 id: decoy" # id: decoy\r\nid: "L-000001" # comment\r\n---\r\n# id: L-000002\r\n';
  const source = document('knowledge/unicode.md', 'knowledge-leaf', text);
  const inventory = inventorySourceDocuments([source]);
  assert.equal(inventory.records.length, 1);
  assert.equal(source.bytes.subarray(inventory.records[0].span.start, inventory.records[0].span.end).toString(), 'L-000001');
  assert.equal(inventory.records[0].span.style, 'double-quoted');
});

test('unresolved and duplicate references are reported instead of selecting a first record', () => {
  const inventory = inventorySourceDocuments([
    document('decisions/entries/one.yaml', 'decision-entry', 'entries: [{id: D-1, supersedes: [D-2, D-3]}, {id: D-2}, {id: D-2}]\n'),
  ]);
  assert.deepEqual(inventory.references.map(({ id, status, target }) => ({ id, status, target })), [
    { id: 'D-2', status: 'ambiguous', target: undefined },
    { id: 'D-3', status: 'missing', target: undefined },
  ]);
  assert.equal(inventory.ok, false);
});

test('unsupported aliases and malformed/nonstring IDs have actionable diagnostics', () => {
  const inventory = inventorySourceDocuments([
    document('decisions/entries/alias.yaml', 'decision-entry', 'entries: [&record {id: D-1}, *record]\n'),
    document('decisions/entries/number.yaml', 'decision-entry', 'entries: [{id: 1}]\n'),
  ]);
  assert.equal(inventory.ok, false);
  assert.equal(inventory.records.length, 0);
  assert.ok(inventory.diagnostics.some(({ file, code, line }) => file.endsWith('alias.yaml') && code === 'unsupported-yaml' && line === 1));
  assert.ok(inventory.diagnostics.some(({ file, code, path }) => file.endsWith('number.yaml') && code === 'invalid-source-id' && path.join('.') === 'entries.0.id'));
});

test('catalogs, registry governance, Phoenix and log references are independently inventoried', () => {
  const inventory = inventorySourceDocuments([
    document('decisions/entries/one.yaml', 'decision-entry', 'entries: [{id: D-1}]\n'),
    document('ontology/classes/100.yaml', 'ontology-concept', 'entries: [{id: K-1}]\n'),
    document('knowledge/one.md', 'knowledge-leaf', '---\nid: L-000001\n---\nEvidence\n'),
    document('decisions/_catalog.yaml', 'catalog', 'store: decisions\nentries: [{id: D-1, file: entries/one.yaml}]\n'),
    document('knowledge/_registries/a.yaml', 'registry', 'values: [{value: a, decision: D-1}]\n'),
    document('decisions/_registries/graduation.yaml', 'graduation-categories', 'categories: [{category: a, decision: D-1}]\n'),
    document('knowledge/_phoenix/P-1.yaml', 'phoenix-event', 'event: P-1\ndecision: D-1\nleaves: [{id: L-000001, why: Unchanged reason}]\n'),
    document('logs/findings/a.yaml', 'finding', 'consulted: {concepts: [K-1], leaves: [L-000001]}\nprior-outcomes: [{status: rejected, reason: "D-1 policy"}]\n'),
  ]);
  assert.deepEqual(inventory.references.map((ref) => [ref.file, ref.path.join('.'), ref.kind, ref.id]), [
    ['decisions/_catalog.yaml', 'entries.0.id', 'decision', 'D-1'],
    ['decisions/_registries/graduation.yaml', 'categories.0.decision', 'decision', 'D-1'],
    ['knowledge/_phoenix/P-1.yaml', 'decision', 'decision', 'D-1'],
    ['knowledge/_phoenix/P-1.yaml', 'leaves.0.id', 'knowledge', 'L-000001'],
    ['knowledge/_registries/a.yaml', 'values.0.decision', 'decision', 'D-1'],
    ['logs/findings/a.yaml', 'consulted.concepts.0', 'ontology', 'K-1'],
    ['logs/findings/a.yaml', 'consulted.leaves.0', 'knowledge', 'L-000001'],
  ]);
  assert.ok(inventory.reviewRequired.some(({ file, path }) => file === 'logs/findings/a.yaml' && path.join('.') === 'prior-outcomes.0.reason'));
  assert.equal(inventory.coverage, 'supplied-documents-only');
});

test('explicit reference adjudication must identify the exact candidate source record', () => {
  const docs = [document('decisions/entries/duplicates.yaml', 'decision-entry', 'entries: [{id: D-1, supersedes: [D-2]}, {id: D-2}, {id: D-2}]\n')];
  const first = inventorySourceDocuments(docs);
  const source = first.references[0];
  const target = first.records.find((record) => record.path[1] === 2);
  const next = inventorySourceDocuments(docs, { adjudications: [{ file: source.file, path: source.path, target: target.key }] });
  assert.equal(next.references[0].target, target.key);
  assert.equal(next.references[0].status, 'adjudicated');
  const wrong = inventorySourceDocuments(docs, { adjudications: [{ file: source.file, path: source.path, target: first.records.find((record) => record.id === 'D-1').key }] });
  assert.equal(wrong.references[0].target, undefined);
  assert.ok(wrong.diagnostics.some(({ code }) => code === 'invalid-reference-adjudication'));
});

test('flow/block refs retain scalar quote spans and unsafe YAML never falls back to reserialization', () => {
  const docs = [
    document('decisions/entries/one.yaml', 'decision-entry', "entries:\n  - id: 'D-1'\n    supersedes:\n      - \"D-2\" # untouched\n  - id: D-2\n"),
    document('decisions/entries/tag.yaml', 'decision-entry', 'entries: [{id: !!str D-3}]\n'),
    document('decisions/entries/duplicate-key.yaml', 'decision-entry', 'entries: [{id: D-4, id: D-5}]\n'),
    document('decisions/entries/complex-key.yaml', 'decision-entry', 'entries: [{id: D-6, ? [a,b]: x}]\n'),
  ];
  const inventory = inventorySourceDocuments(docs);
  assert.deepEqual(inventory.records.map(({ id }) => id), ['D-1', 'D-2']);
  const ref = inventory.references[0];
  assert.equal(ref.span.style, 'double-quoted');
  assert.equal(docs[0].bytes.subarray(ref.span.start, ref.span.end).toString(), 'D-2');
  assert.equal(inventory.diagnostics.filter(({ file }) => !file.endsWith('one.yaml')).length, 3);
});

test('duplicate and unused adjudications refuse instead of overriding silently', () => {
  const docs = [document('decisions/entries/one.yaml', 'decision-entry', 'entries: [{id: D-1, supersedes: [D-2]}, {id: D-2}]\n')];
  const before = inventorySourceDocuments(docs);
  const choice = { file: docs[0].file, path: ['entries', 0, 'supersedes', 0], target: before.records[1].key };
  const after = inventorySourceDocuments(docs, { adjudications: [choice, choice, { ...choice, path: ['missing'] }] });
  assert.equal(after.ok, false);
  assert.equal(after.references[0].target, undefined);
  assert.deepEqual(after.diagnostics.map(({ code }) => code), ['invalid-reference-adjudication', 'unused-reference-adjudication']);
});

test('disposable correspondence allocates distinct canonical targets through the shared ledger', () => {
  const docs = [
    document('ontology/classes/100.yaml', 'ontology-concept', 'entries: [{id: K-000001, status: active}]\n'),
    document('knowledge/one.md', 'knowledge-leaf', '---\nid: L-000001\nconcepts: [K-000001]\n---\nEvidence\n'),
    document('decisions/entries/one.yaml', 'decision-entry', 'entries: [{id: D-1, status: accepted}, {id: D-001, status: accepted}]\n'),
  ];
  const bytes = docs.map(({ bytes }) => Buffer.from(bytes));
  const plan = planIdentityCorrespondence(docs, { namespace, publication });
  assert.equal(plan.ok, true);
  const sources = inventorySourceDocuments(docs).records;
  assert.deepEqual(plan.correspondence.map(({ source, target }) => [sources.find(({ key }) => key === source).id, target.kind, target.id]), [
    ['D-001', 'decision', 'D-000001'], ['D-1', 'decision', 'D-000002'],
    ['L-000001', 'knowledge', 'K-000001'], ['K-000001', 'ontology', 'O-000001'],
  ]);
  assert.deepEqual(plan.references[0].target, { namespace, kind: 'ontology', id: 'O-000001' });
  assert.deepEqual(plan.ledger.allocations.map(({ kind, id }) => [kind, id]), [
    ['decision', 'D-000001'], ['decision', 'D-000002'], ['knowledge', 'K-000001'], ['ontology', 'O-000001'],
  ]);
  assert.ok(plan.ledger.allocations.every(({ publication: row }) => row.id === publication.id));
  assert.deepEqual(docs.map(({ bytes }) => bytes), bytes);
  assert.equal(plan.publicationReady, false);
  assert.doesNotMatch(JSON.stringify(plan.ledger), /L-000001|D-001\"|previous|correspondence/);
});

test('unresolved source reference or invalid namespace produces no correspondence', () => {
  const docs = [document('decisions/entries/one.yaml', 'decision-entry', 'entries: [{id: D-1, supersedes: [D-999]}]\n')];
  const missing = planIdentityCorrespondence(docs, { namespace, publication });
  assert.equal(missing.ok, false);
  assert.equal(missing.correspondence, undefined);
  const invalid = planIdentityCorrespondence([], { namespace: 'not-a-namespace', publication });
  assert.equal(invalid.ok, false);
  assert.equal(invalid.correspondence, undefined);
});

test('old drafts require explicit typed proposal keys and consume no canonical slots', () => {
  const docs = [document('decisions/entries/draft.yaml', 'decision-entry', 'entries: [{id: D-2026-09-18-draft, status: proposed}]\n')];
  const source = inventorySourceDocuments(docs).records[0].key;
  const missing = planIdentityCorrespondence(docs, { namespace, publication });
  assert.equal(missing.ok, false);
  assert.equal(missing.code, 'proposal-disposition-required');
  const target = 'proposal:decision:33333333-3333-4333-8333-333333333333';
  const plan = planIdentityCorrespondence(docs, { namespace, publication, proposals: [{ source, id: target }] });
  assert.equal(plan.ok, true);
  assert.deepEqual(plan.ledger.allocations, []);
  assert.deepEqual(plan.correspondence, [{ source, target: { namespace, kind: 'decision', id: target } }]);
  const wrong = planIdentityCorrespondence(docs, { namespace, publication, proposals: [{ source, id: target.replace('decision', 'ontology') }] });
  assert.equal(wrong.ok, false);
  assert.equal(wrong.correspondence, undefined);
});

test('duplicate, unused and non-draft proposal dispositions cannot redirect canonical allocations', () => {
  const docs = [document('decisions/entries/draft.yaml', 'decision-entry', 'entries: [{id: D-1, status: proposed}, {id: D-2, status: accepted}]\n')];
  const records = inventorySourceDocuments(docs).records;
  const id = 'proposal:decision:33333333-3333-4333-8333-333333333333';
  for (const proposals of [
    [{ source: records[0].key, id }, { source: records[0].key, id }],
    [{ source: records[0].key, id }, { source: 'absent', id }],
    [{ source: records[0].key, id }, { source: records[1].key, id }],
  ]) {
    const plan = planIdentityCorrespondence(docs, { namespace, publication, proposals });
    assert.equal(plan.ok, false);
    assert.equal(plan.correspondence, undefined);
  }
});

test('effective dependencies and governance authorizers refuse draft targets without reclassifying navigation', () => {
  const proposal = 'proposal:knowledge:33333333-3333-4333-8333-333333333333';
  const draft = document('knowledge/draft.md', 'knowledge-leaf', '---\nid: L-000002\nfacets: {stage: draft}\n---\nDraft\n');
  const target = inventorySourceDocuments([draft]).records[0].key;
  for (const [edge, expected] of [['depends-on', false], ['see-also', true]]) {
    const active = document('knowledge/active.md', 'knowledge-leaf', `---\nid: L-000001\nfacets: {stage: verified}\nrelates: {${edge}: [L-000002]}\n---\nEvidence\n`);
    const plan = planIdentityCorrespondence([active, draft], { namespace, publication, proposals: [{ source: target, id: proposal }] });
    assert.equal(plan.ok, expected);
    if (!expected) assert.equal(plan.code, 'effective-proposal-dependency');
  }
  const decision = document('decisions/entries/draft.yaml', 'decision-entry', 'entries: [{id: D-1, status: proposed}]\n');
  const decisionKey = inventorySourceDocuments([decision]).records[0].key;
  const registry = document('knowledge/_registries/x.yaml', 'registry', 'values: [{value: x, decision: D-1}]\n');
  const plan = planIdentityCorrespondence([decision, registry], { namespace, publication, proposals: [{ source: decisionKey, id: proposal.replace('knowledge', 'decision') }] });
  assert.equal(plan.ok, false);
  assert.equal(plan.code, 'effective-proposal-dependency');
});

test('draft bundles reference drafts and rejected provisional records remain inspection-only', () => {
  const docs = [
    document('knowledge/one.md', 'knowledge-leaf', '---\nid: L-000001\nfacets: {stage: draft}\nrelates: {depends-on: [L-000002]}\n---\nDraft\n'),
    document('knowledge/two.md', 'knowledge-leaf', '---\nid: L-000002\nfacets: {stage: proposed}\n---\nDraft\n'),
    document('decisions/entries/rejected.yaml', 'decision-entry', 'entries: [{id: D-2026-09-18-no, status: rejected, superseded-by: [D-1]}, {id: D-1, status: accepted, relates-to: {decisions: [D-2026-09-18-no]}}]\n'),
  ];
  const inventory = inventorySourceDocuments(docs);
  const proposals = inventory.records.filter(({ proposalRequired }) => proposalRequired).map((record, i) => ({ source: record.key, id: `proposal:${record.kind}:33333333-3333-4333-8333-${String(i + 1).padStart(12, '0')}` }));
  const plan = planIdentityCorrespondence(docs, { namespace, publication, proposals });
  assert.equal(plan.ok, true);
  assert.equal(plan.ledger.allocations.length, 1);
  assert.equal(plan.references.find(({ targetLifecycle }) => targetLifecycle === 'rejected').inspectionOnly, true);
});

test('rejected canonical authorizers and rejected draft dependencies refuse even for draft owners', () => {
  for (const lifecycle of ['rejected', 'suppressed']) {
    const decision = document('decisions/entries/rejected.yaml', 'decision-entry', `entries: [{id: D-1, status: ${lifecycle}}]\n`);
    const registry = document('knowledge/_registries/x.yaml', 'registry', 'values: [{value: x, decision: D-1}]\n');
    const authorizer = planIdentityCorrespondence([decision, registry], { namespace, publication });
    assert.equal(authorizer.ok, false);
    assert.equal(authorizer.code, 'rejected-source-dependency');
    assert.equal(authorizer.correspondence, undefined);

    const owner = document('knowledge/owner.md', 'knowledge-leaf', '---\nid: L-000001\nfacets: {stage: draft}\nrelates: {depends-on: [L-000002]}\n---\nDraft\n');
    const target = document('knowledge/target.md', 'knowledge-leaf', `---\nid: L-000002\nfacets: {stage: ${lifecycle}}\n---\nRejected\n`);
    const source = inventorySourceDocuments([owner]).records[0].key;
    const dependency = planIdentityCorrespondence([owner, target], { namespace, publication, proposals: [{ source, id: 'proposal:knowledge:33333333-3333-4333-8333-333333333333' }] });
    assert.equal(dependency.ok, false);
    assert.equal(dependency.code, 'rejected-source-dependency');

    const navigationOwner = document('knowledge/owner.md', 'knowledge-leaf', '---\nid: L-000001\nfacets: {stage: verified}\nrelates: {see-also: [L-000002]}\n---\nEvidence\n');
    const navigation = planIdentityCorrespondence([navigationOwner, target], { namespace, publication });
    assert.equal(navigation.ok, true);
    assert.equal(navigation.references[0].inspectionOnly, true);
  }
});
