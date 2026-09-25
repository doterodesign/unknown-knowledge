import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from 'js-yaml';
import { createHash } from 'node:crypto';
import { inventorySourceDocuments, rewriteIdentityCandidate } from '../payload/engine/lib/identity-migration.js';

const namespace = '11111111-1111-4111-8111-111111111111';
const publication = { id: '22222222-2222-4222-8222-222222222222', review: 'review/cutover' };
const targetVersions = { 'knowledge-leaf': 3, 'ontology-concept': 2, 'decision-entry': 2, catalog: 2, registry: 2, 'graduation-categories': 2, 'phoenix-event': 2, finding: 2, gap: 2, miss: 1 };
const options = { namespace, publication, targetVersions };
const doc = (file, kind, text) => ({ file, kind, bytes: Buffer.from(text) });
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

function sources() {
  return [
    doc('decisions/entries/a.yaml', 'decision-entry', '\uFEFFschema-version: 1 # keep\r\nentries:\r\n  - id: "D-9" # keep id quote\r\n    status: accepted\r\n    date: 2020-01-02\r\n    edition: 4\r\n    reason: "色 remains exactly here"\r\n    relates-to: {concepts: [\'K-4\'], leaves: [L-000007]}\r\n'),
    doc('ontology/classes/a.yaml', 'ontology-concept', 'schema-version: 1\nentries: [{id: K-4, status: active, rationale: [D-9]}]\n'),
    doc('knowledge/a.md', 'knowledge-leaf', '\uFEFF---\r\nschema-version: 2\r\nid: L-000007\r\nfacets: {stage: verified}\r\nconcepts: [K-4]\r\n---\r\nEvidence 😀 untouched.\r\n'),
  ];
}

test('candidate rewrites only original identity/ref/version spans preserving all other bytes', () => {
  const documents = sources();
  const before = documents.map((row) => Buffer.from(row.bytes));
  const candidate = rewriteIdentityCandidate(documents, options);
  assert.equal(candidate.ok, true, JSON.stringify(candidate));
  assert.equal(candidate.publicationReady, false);
  assert.equal(candidate.coverage, 'supplied-documents-only');
  assert.equal(candidate.targetValidation, 'pending');
  assert.equal(Object.hasOwn(candidate, 'correspondence'), false);
  const replacements = [['D-9', 'D-000001'], ['K-4', 'O-000001'], ['L-000007', 'K-000001']];
  for (const [i, source] of documents.entries()) {
    const file = candidate.files.find((row) => row.file === source.file);
    let expected = source.bytes.toString().replace(`schema-version: ${source.kind === 'knowledge-leaf' ? 2 : 1}`, `schema-version: ${targetVersions[source.kind]}`);
    for (const [old, current] of replacements) expected = expected.replaceAll(old, current);
    assert.deepEqual(file.bytes, Buffer.from(expected));
    assert.equal(file.beforeSha256, sha256(source.bytes));
    assert.equal(file.sha256, sha256(file.bytes));
    assert.deepEqual(source.bytes, before[i]);
  }
  assert.equal(candidate.identity.allocations.length, 3);
  assert.doesNotMatch(JSON.stringify(candidate.identity), /D-9|K-4|L-000007/);
});

test('prose requires a reviewed classification and operational references cannot be preserved', () => {
  const documents = [doc('decisions/a.yaml', 'decision-entry', 'schema-version: 1\nentries: [{id: D-9, status: accepted, reason: "Previously quoted D-9"}]\n')];
  const hint = inventorySourceDocuments(documents).reviewRequired[0];
  const decision = { file: hint.file, path: hint.path, action: 'preserve', classification: 'non-operational-evidence', review: 'review/literal' };
  assert.equal(rewriteIdentityCandidate(documents, options).code, 'prose-adjudication-required');
  assert.equal(rewriteIdentityCandidate(documents, { ...options, proseDecisions: [{ ...decision, classification: 'operational-reference' }] }).ok, false);
  const candidate = rewriteIdentityCandidate(documents, { ...options, proseDecisions: [decision] });
  assert.equal(candidate.ok, true);
  assert.match(candidate.files[0].bytes.toString(), /Previously quoted D-9/);
  assert.match(candidate.files[0].bytes.toString(), /id: D-000001/);
});

test('reviewed prose edits use exact original UTF8 byte ranges and fresh typed correspondence', () => {
  const documents = sources();
  const leaf = documents[2];
  leaf.bytes = Buffer.concat([leaf.bytes, Buffer.from('See 色 D-9 and K-4.\r\n')]);
  const inventory = inventorySourceDocuments(documents);
  const hint = inventory.reviewRequired.find((row) => row.file === leaf.file);
  const edits = ['D-9', 'K-4'].map((expected) => ({
    start: leaf.bytes.indexOf(Buffer.from(expected), hint.span.start),
    end: leaf.bytes.indexOf(Buffer.from(expected), hint.span.start) + expected.length,
    expected, source: inventory.records.find((row) => row.id === expected).key,
  }));
  const decision = { file: leaf.file, path: hint.path, action: 'rewrite', review: 'review/prose', edits };
  const candidate = rewriteIdentityCandidate(documents, { ...options, proseDecisions: [decision] });
  assert.equal(candidate.ok, true);
  assert.match(candidate.files.find((row) => row.file === leaf.file).bytes.toString(), /See 色 D-000001 and O-000001\.\r\n/);
  for (const changed of [
    { ...decision, edits: [{ ...edits[0], expected: 'D-8' }] },
    { ...decision, edits: [edits[0], edits[0]] },
    { ...decision, edits: [{ ...edits[0], start: 0 }] },
    { ...decision, review: '' },
  ]) assert.equal(rewriteIdentityCandidate(documents, { ...options, proseDecisions: [changed] }).ok, false);
  assert.equal(rewriteIdentityCandidate(documents, { ...options, proseDecisions: [decision, decision] }).ok, false);
  assert.equal(rewriteIdentityCandidate(documents, { ...options, proseDecisions: [{ ...decision, path: ['unknown'] }] }).ok, false);
});

test('representation rewrite keeps explicit drafts provisional without changing lifecycle or evidence', () => {
  const documents = [doc('decisions/a.yaml', 'decision-entry', 'schema-version: 1\nentries: [{id: D-2020-01-01-plan, status: proposed, date: 2020-01-01, reason: Pending}]\n')];
  const source = inventorySourceDocuments(documents).records[0].key;
  const id = 'proposal:decision:33333333-3333-4333-8333-333333333333';
  assert.equal(rewriteIdentityCandidate(documents, options).code, 'proposal-disposition-required');
  const candidate = rewriteIdentityCandidate(documents, { ...options, proposals: [{ source, id }] });
  assert.equal(candidate.ok, true);
  const record = load(candidate.files[0].bytes.toString()).entries[0];
  assert.equal(record.id, id);
  assert.equal(record.status, 'proposed');
  assert.equal(record.reason, 'Pending');
  assert.equal(record.date, '2020-01-01');
  assert.equal(candidate.identity.allocations.length, 0);
});

test('rewrite refuses unsupported scalar representation and wrong source/target versions without partial files', () => {
  for (const text of [
    'schema-version: 1\nentries: [{id: "D-\\x39", status: accepted}]\n',
    'schema-version: 1\nentries:\n  - id: >-\n      D-9\n    status: accepted\n',
    'schema-version: 99\nentries: [{id: D-9}]\n',
    'entries: [{id: D-9}]\n',
  ]) {
    const candidate = rewriteIdentityCandidate([doc('decisions/a.yaml', 'decision-entry', text)], options);
    assert.equal(candidate.ok, false);
    assert.equal(Object.hasOwn(candidate, 'files'), false);
  }
  assert.equal(rewriteIdentityCandidate(sources(), { ...options, targetVersions: { ...targetVersions, 'knowledge-leaf': 99 } }).code, 'unsupported-target-versions');
});

test('metadata references and stamps change without altering retained outcomes or Phoenix event count', () => {
  const documents = sources();
  documents.push(
    doc('decisions/_catalog.yaml', 'catalog', 'schema-version: 1\nstore: decisions\nentries: [{id: D-9, file: entries/a.yaml}]\n'),
    doc('knowledge/_registries/stage.yaml', 'registry', 'schema-version: 1\nvalues: [{value: verified, decision: D-9}]\n'),
    doc('decisions/_registries/graduation-categories.yaml', 'graduation-categories', 'schema-version: 1\ncategories: [{category: drift, decision: D-9}]\n'),
    doc('knowledge/_phoenix/event.yaml', 'phoenix-event', 'schema-version: 1\ndecision: D-9\nleaves: [{id: L-000007, why: Preserve reason}]\ndate: 2020-01-02\n'),
    doc('logs/findings/a.yaml', 'finding', 'schema-version: 1\nconsulted: {concepts: [K-4], leaves: [L-000007]}\nprior-outcomes: [{status: rejected, reason: Keep history}]\n'),
    doc('logs/gaps/a.yaml', 'gap', 'schema-version: 1\nconsulted: {concepts: [K-4]}\nstatus: open\n'),
    doc('logs/misses/a.yaml', 'miss', 'schema-version: 1\nstatus: open\nshape: Unknown\n'),
  );
  const candidate = rewriteIdentityCandidate(documents, options);
  assert.equal(candidate.ok, true, JSON.stringify(candidate));
  const after = inventorySourceDocuments(candidate.files);
  assert.equal(after.ok, true, JSON.stringify(after.diagnostics));
  assert.equal(candidate.files.length, documents.length);
  assert.equal(candidate.files.filter((row) => row.kind === 'phoenix-event').length, 1);
  assert.deepEqual(candidate.files.find((row) => row.kind === 'miss').bytes, documents.at(-1).bytes);
  assert.deepEqual(load(candidate.files.find((row) => row.kind === 'finding').bytes.toString())['prior-outcomes'],
    [{ status: 'rejected', reason: 'Keep history' }]);
});

test('reviewed prose changes inside quoted and folded YAML retain escapes, comments and folding', () => {
  const documents = [doc('decisions/a.yaml', 'decision-entry', String.raw`schema-version: 1
entries:
  - id: D-9
    status: accepted
    reason: "quoted \"word\" D-9" # unchanged
    notes: >-
      Reference D-9
      remains folded.
`)];
  const inventory = inventorySourceDocuments(documents);
  const proseDecisions = inventory.reviewRequired.map((hint) => {
    const start = documents[0].bytes.indexOf(Buffer.from('D-9'), hint.span.start);
    return { file: hint.file, path: hint.path, action: 'rewrite', review: 'review/prose', edits: [{ start, end: start + 3, expected: 'D-9', source: inventory.records[0].key }] };
  });
  const candidate = rewriteIdentityCandidate(documents, { ...options, proseDecisions });
  assert.equal(candidate.ok, true, JSON.stringify(candidate));
  assert.deepEqual(candidate.files[0].bytes, Buffer.from(documents[0].bytes.toString().replace('schema-version: 1', 'schema-version: 2').replaceAll('D-9', 'D-000001')));
});

test('duplicate old IDs need exact locator adjudication and receive distinct current identities', () => {
  const documents = [doc('decisions/a.yaml', 'decision-entry', 'schema-version: 1\nentries: [{id: D-9, status: accepted}, {id: D-9, status: rejected}, {id: D-8, supersedes: [D-9]}]\n')];
  const inventory = inventorySourceDocuments(documents);
  assert.equal(rewriteIdentityCandidate(documents, options).code, 'invalid-source-inventory');
  const rejected = inventory.records.find((row) => row.lifecycle === 'rejected');
  const adjudications = [{ file: documents[0].file, path: ['entries', 2, 'supersedes', 0], target: rejected.key }];
  const candidate = rewriteIdentityCandidate(documents, { ...options, adjudications });
  assert.equal(candidate.ok, true, JSON.stringify(candidate));
  const entries = load(candidate.files[0].bytes.toString()).entries;
  assert.notEqual(entries[0].id, entries[1].id);
  assert.deepEqual(entries[2].supersedes, [entries[1].id]);
  assert.equal(entries[1].status, 'rejected');
});

test('a prohibited lifecycle dependency cannot produce even a partial rewrite', () => {
  const documents = sources();
  documents[0].bytes = Buffer.from(documents[0].bytes.toString().replace('status: accepted', 'status: rejected'));
  documents.push(doc('knowledge/_registries/stage.yaml', 'registry', 'schema-version: 1\nvalues: [{value: verified, decision: D-9}]\n'));
  const candidate = rewriteIdentityCandidate(documents, options);
  assert.equal(candidate.code, 'rejected-source-dependency');
  assert.equal(Object.hasOwn(candidate, 'files'), false);
});

test('prose replacement cannot reinterpret an ID substring as an exact source reference', () => {
  const documents = [doc('decisions/a.yaml', 'decision-entry', 'schema-version: 1\nentries: [{id: D-9, status: accepted, reason: "Reference D-99"}]\n')];
  const inventory = inventorySourceDocuments(documents);
  const hint = inventory.reviewRequired[0];
  const start = documents[0].bytes.indexOf(Buffer.from('D-99'));
  const proseDecisions = [{ file: hint.file, path: hint.path, review: 'review/prose', action: 'rewrite',
    edits: [{ start, end: start + 3, expected: 'D-9', source: inventory.records[0].key }] }];
  assert.equal(rewriteIdentityCandidate(documents, { ...options, proseDecisions }).code, 'invalid-prose-edit');
});
