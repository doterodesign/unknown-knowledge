import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { parseRecordFile, selectCapturedRecord } from '../payload/engine/lib/record-file.js';
import { getRecordOccurrence } from '../payload/engine/lib/record-identity-index.js';
import { loadStores } from '../payload/engine/lib/load-stores.js';

const namespace = '11111111-1111-4111-8111-111111111111';
const publication = { id: '22222222-2222-4222-8222-222222222222', review: 'review:test' };
const decision = (id) => ({ id, title: 'Direction', category: 'architecture', status: 'accepted',
  date: '2026-09-19', deciders: ['steward'], context: 'Observed', decision: 'Reviewed' });
const documents = {
  knowledge: { 'schema-version': 3, id: 'K-000001', domain: 'world', heading: 'Evidence', citations: [{ source: 'recorded-source' }] },
  ontology: { 'schema-version': 2, entries: [{ id: 'O-000001', term: 'Source', class: 'general', summary: 'Meaning', status: 'draft' }] },
  decision: { 'schema-version': 2, entries: [decision('D-000001'), decision('D-000002')] },
};
const files = { knowledge: 'knowledge/evidence.md', ontology: 'ontology/classes/source.yaml', decision: 'decisions/entries/direction.yaml' };
function encode(kind, document = documents[kind]) {
  return Buffer.from(kind === 'knowledge'
    ? `\uFEFF---\r\n${JSON.stringify(document)}\r\n---\r\n# Authored body\r\n`
    : JSON.stringify(document));
}
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'record-file-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const put = (file, bytes) => { mkdirSync(dirname(join(root, file)), { recursive: true }); writeFileSync(join(root, file), bytes); };
  const allocations = [];
  for (const kind of Object.keys(files)) {
    const file = files[kind];
    const store = file.split('/')[0];
    const records = kind === 'knowledge' ? [documents[kind]] : documents[kind].entries;
    allocations.push(...records.map(({ id }) => ({ kind, id, state: 'allocated', publication })));
    put(file, encode(kind));
    put(`${store}/_catalog.yaml`, JSON.stringify({ 'schema-version': 2, store,
      entries: records.map(({ id }) => ({ id, title: id, file: file.slice(store.length + 1) })) }));
  }
  put('_identity.yaml', JSON.stringify({ 'schema-version': 1, 'identity-format': 1, namespace, allocations }));
  const model = loadStores(root);
  assert.equal(model.ok, true, JSON.stringify(model.diagnostics));
  const input = (kind = 'knowledge', kitPath = '.') => ({ model, ref: { namespace, kind,
    id: kind === 'knowledge' ? 'K-000001' : kind === 'ontology' ? 'O-000001' : 'D-000001' },
  kitPath, file: kitPath === '.' ? files[kind] : `${kitPath}/${files[kind]}`, bytes: encode(kind) });
  return { model, input, root, put };
}

test('actual loader and captured selection share all three record-file shapes and own-side kit paths', (t) => {
  const f = fixture(t);
  for (const kind of Object.keys(files)) for (const kitPath of ['.', 'packages/client/unknown-knowledge']) {
    const input = f.input(kind, kitPath);
    const selected = selectCapturedRecord(input);
    assert.equal(selected.ok, true, JSON.stringify(selected));
    assert.deepEqual(selected.locator, { file: files[kind], path: kind === 'knowledge' ? '' : 'entries[0]' });
    assert.deepEqual(selected.entry, getRecordOccurrence(f.model.identityIndex, input.ref).entry);
    assert.deepEqual(selected.rawBytes, input.bytes);
    assert.notEqual(selected.rawBytes, input.bytes);
  }
});

test('BOM, CRLF and comments remain raw evidence distinct from normalized Knowledge body', (t) => {
  const f = fixture(t);
  const input = f.input();
  const selected = selectCapturedRecord(input);
  assert.equal(selected.entry.body, '# Authored body\n');
  assert.equal(selected.rawBytes.toString(), '\uFEFF---\r\n' + JSON.stringify(documents.knowledge) + '\r\n---\r\n# Authored body\r\n');
  input.bytes.fill(0);
  selected.entry.record.heading = 'changed returned payload';
  assert.equal(f.model.leaves.get('K-000001').record.heading, 'Evidence');
  assert.notEqual(selected.rawBytes[0], 0);
  // Formatting may differ while model parsing agrees; preservation is a later gate.
  const formatted = f.input('decision');
  formatted.bytes = Buffer.from('# retained comment\n' + JSON.stringify(documents.decision, null, 2));
  assert.equal(selectCapturedRecord(formatted).ok, true);
});

test('full-file schema failures cannot be hidden behind a valid selected record', (t) => {
  const f = fixture(t);
  for (const edit of [
    (doc) => { doc['schema-version'] = 1; },
    (doc) => { doc.entries[1].unexpected = 'invalid sibling'; },
  ]) {
    const doc = structuredClone(documents.decision); edit(doc);
    const result = selectCapturedRecord({ ...f.input('decision'), bytes: encode('decision', doc) });
    assert.equal(result.code, 'invalid-record-file');
    assert.ok(result.diagnostics.length);
  }
});

test('missing and duplicate exact canonical occurrences refuse before model lookup', (t) => {
  const f = fixture(t);
  for (const entries of [[decision('D-000002')], [decision('D-000001'), decision('D-000001')]]) {
    const result = selectCapturedRecord({ ...f.input('decision'), bytes: encode('decision', { 'schema-version': 2, entries }) });
    assert.equal(result.code, 'record-occurrence-count');
  }
  assert.equal(selectCapturedRecord({ ...f.input(), ref: { namespace, kind: 'knowledge', id: 'proposal:knowledge:33333333-3333-4333-8333-333333333333' } }).code, 'invalid-capture-input');
});

test('same record at a different entry locator or file cannot borrow actual model authority', (t) => {
  const f = fixture(t);
  const doc = structuredClone(documents.decision); doc.entries.reverse();
  assert.equal(selectCapturedRecord({ ...f.input('decision'), bytes: encode('decision', doc) }).code, 'capture-model-mismatch');
  assert.equal(selectCapturedRecord({ ...f.input(), file: 'knowledge/other.md' }).code, 'capture-model-mismatch');
});

test('model mutation, fake index and changed ledger cannot corroborate captured bytes', (t) => {
  for (const edit of [
    (model) => { model.leaves.get('K-000001').record.heading = 'changed'; },
    (model) => { model.identity.namespace = publication.id; },
    (model) => { model.identityIndex = { ...model.identityIndex }; },
    (model) => { model.ok = false; },
  ]) {
    const f = fixture(t); edit(f.model);
    assert.equal(selectCapturedRecord(f.input()).code, 'capture-model-mismatch');
  }
});

test('capture requires exact UTF8 and normalized repo/kit path containment', (t) => {
  const f = fixture(t);
  for (const file of ['/knowledge/evidence.md', '../knowledge/evidence.md', 'kit/../knowledge/evidence.md', 'kit//knowledge/evidence.md', 'kit\\knowledge\\evidence.md']) {
    assert.equal(selectCapturedRecord({ ...f.input(), file }).code, 'invalid-capture-path');
  }
  for (const kitPath of ['/kit', '..', './kit', 'other', 'knowledge/evidence.md']) {
    assert.equal(selectCapturedRecord({ ...f.input(), kitPath }).code, 'invalid-capture-path');
  }
  assert.equal(selectCapturedRecord({ ...f.input(), bytes: Buffer.from([0xff]) }).code, 'invalid-capture-encoding');
});

test('shared parser retains original malformed-input diagnostics and diagnostic occurrences', () => {
  const missing = parseRecordFile({ kind: 'knowledge', file: files.knowledge, text: '# no front matter' });
  assert.equal(missing.diagnostics[0].code, 'parse-error');
  const malformed = parseRecordFile({ kind: 'decision', file: files.decision, text: 'entries: [' });
  assert.equal(malformed.diagnostics[0].code, 'parse-error');
  const invalid = parseRecordFile({ kind: 'decision', file: files.decision,
    text: JSON.stringify({ 'schema-version': 1, entries: [decision('D-000001')] }) });
  assert.equal(invalid.ok, false);
  assert.equal(invalid.occurrences.length, 1, 'the loader can still inspect schema-defective authoring records');
});

test('private occurrence access returns detached locators and no invented unavailable payload', (t) => {
  const f = fixture(t);
  const occurrence = getRecordOccurrence(f.model.identityIndex, f.input('decision').ref);
  occurrence.locator.path = 'entries[99]';
  assert.equal(getRecordOccurrence(f.model.identityIndex, f.input('decision').ref).locator.path, 'entries[0]');
  assert.equal(getRecordOccurrence(f.model.identityIndex, { namespace, kind: 'knowledge', id: 'K-999999' }), null);
});
