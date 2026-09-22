import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { validateRecord, validateStoreFile, ERROR_CODES } from '../payload/engine/lib/validate-record.js';
import { CANONICAL_ID_GRAMMARS } from '../payload/engine/lib/id-grammars.js';
import { loadStores } from '../payload/engine/lib/load-stores.js';
import { readAssignments } from '../payload/engine/lib/subject-assignments.js';

const specs = [
  { kind: 'knowledge-leaf', semantic: 'knowledge', store: 'knowledge', collection: 'leaves', file: 'evidence.md', required: 'citations',
    record: { 'schema-version': 3, id: 'K-000001', domain: 'world', heading: 'Evidence', citations: [{ source: 'recorded-source' }] } },
  { kind: 'ontology-concept', semantic: 'ontology', store: 'ontology', collection: 'concepts', file: 'classes/900-meaning.yaml', required: 'term',
    record: { id: 'O-000001', term: 'Meaning', class: 'arbitrary', summary: 'Definition', status: 'active', 'source-of-truth': ['src/value.js'] } },
  { kind: 'decision-entry', semantic: 'decision', store: 'decisions', collection: 'decisions', file: 'entries/direction.yaml', required: 'decision',
    record: { id: 'D-000001', title: 'Direction', category: 'architecture', status: 'accepted', date: '2026-09-19', deciders: ['steward'], context: 'Observed context', decision: 'Reviewed direction' } },
];
const envelope = (spec, record) => spec.semantic === 'knowledge' ? record : { 'schema-version': 2, entries: [record] };
const prefix = (spec) => spec.semantic === 'knowledge' ? '' : 'entries[0].';

for (const spec of specs) {
  test(`${spec.kind}: optional assignments retain absent, empty and authored ordering`, () => {
    for (const metadata of [{}, { subjects: [] }, { subjects: ['S-999999', 'S-000001'] }]) {
      const record = { ...spec.record, ...metadata };
      const before = structuredClone(record);
      assert.deepEqual(validateRecord(spec.kind, record), { ok: true, errors: [] });
      assert.deepEqual(validateStoreFile(spec.kind, envelope(spec, record)), { ok: true, errors: [] });
      assert.deepEqual(record, before);
      const proposal = { ...record, id: `proposal:${spec.semantic}:33333333-3333-4333-8333-333333333333` };
      assert.equal(validateRecord(spec.kind, proposal).ok, true);
    }
  });
  test(`${spec.kind}: malformed and duplicate assignments fail at their exact field`, () => {
    for (const subjects of [null, 'S-000001', [null], [1], ['S-000000'], ['S-1'], ['K-000001'], ['S-000001\n'], [' S-000001'], ['proposal:subject:33333333-3333-4333-8333-333333333333'], ['S-000001', 'S-000001']]) {
      const checked = validateStoreFile(spec.kind, envelope(spec, { ...spec.record, subjects }));
      assert.equal(checked.ok, false, JSON.stringify(subjects));
      assert.ok(checked.errors.every(({ code }) => ERROR_CODES.includes(code)));
      const expected = Array.isArray(subjects) ? `subjects[${subjects.length - 1}]` : 'subjects';
      assert.ok(checked.errors.some(({ path }) => path === prefix(spec) + expected), JSON.stringify(checked));
      if (subjects?.[1] === 'S-000001') assert.ok(checked.errors.some(({ code }) => code === 'duplicate-subject'));
    }
    const sparse = { ...spec.record, subjects: new Array(1) };
    assert.equal(validateRecord(spec.kind, sparse).ok, false);
  });
  test(`${spec.kind}: subjects do not replace the record's existing required fields`, () => {
    const record = { ...spec.record, subjects: ['S-000001'] };
    delete record[spec.required];
    assert.ok(validateRecord(spec.kind, record).errors.some(({ code, path }) => code === 'missing-required' && path === spec.required));
  });
  test(`${spec.kind}: published subject grammar agrees with the shared canonical grammar`, () => {
    const schema = JSON.parse(readFileSync(new URL(`../payload/schemas/${spec.kind}.schema.json`, import.meta.url)));
    assert.deepEqual(schema.properties.subjects.items, { $ref: '#/$defs/subjectRef' });
    assert.equal(schema.$defs.subjectRef.pattern, CANONICAL_ID_GRAMMARS.subject.pattern);
    assert.equal(schema.required.includes('subjects'), false);
  });
}

function fixture(t, metadata, { proposals = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'assignment-schema-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const put = (file, value) => {
    mkdirSync(join(root, file, '..'), { recursive: true });
    writeFileSync(join(root, file), typeof value === 'string' ? value : JSON.stringify(value));
  };
  put('_identity.yaml', { 'schema-version': 1, 'identity-format': 1, namespace: '11111111-1111-4111-8111-111111111111',
    allocations: proposals ? [] : specs.map((spec) => ({ kind: spec.semantic, id: spec.record.id, state: 'allocated',
      publication: { id: '22222222-2222-4222-8222-222222222222', review: 'review:assignments' } })) });
  put('src/value.js', 'export const value = 1;\n');
  for (const spec of specs) {
    const record = { ...spec.record, ...metadata };
    if (proposals) {
      record.id = `proposal:${spec.semantic}:33333333-3333-4333-8333-333333333333`;
      if (spec.semantic === 'knowledge') record.facets = { stage: 'draft' };
      else record.status = spec.semantic === 'decision' ? 'proposed' : 'draft';
    }
    put(`${spec.store}/_catalog.yaml`, { 'schema-version': 2, store: spec.store,
      entries: [{ id: record.id, title: 'Record', file: spec.file }] });
    put(`${spec.store}/${spec.file}`, spec.semantic === 'knowledge'
      ? `---\n${JSON.stringify(record)}\n---\nEvidence body remains unchanged.\n` : envelope(spec, record));
  }
  return root;
}

test('real reader and structural CLI accept absent/empty assignments without a subject registry', (t) => {
  for (const metadata of [{}, { subjects: [] }]) {
    const root = fixture(t, metadata);
    const model = loadStores(root);
    assert.equal(model.ok, true, JSON.stringify(model.diagnostics));
    for (const spec of specs) {
      const entry = model[spec.collection].get(spec.record.id);
      assert.deepEqual(entry.record, { ...spec.record, ...metadata });
      assert.deepEqual(readAssignments(entry), Object.hasOwn(metadata, 'subjects') ? { state: 'known', ids: [] } : { state: 'unknown', reason: 'absent' });
    }
    assert.equal(model.leaves.get('K-000001').body.trim(), 'Evidence body remains unchanged.');
    const result = spawnSync(process.execPath, ['payload/engine/validate.js', '--root', root, '--json'], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const values = spawnSync(process.execPath, ['payload/engine/validate-values.js', '--root', root, '--json'], { encoding: 'utf8' });
    assert.equal(values.status, 0, values.stdout + values.stderr);
  }
});

test('real reader retains canonical subject assignments on all three proposal owner kinds', (t) => {
  const subjects = ['S-000001'];
  const model = loadStores(fixture(t, { subjects }, { proposals: true }));
  for (const spec of specs) {
    const key = `proposal:${spec.semantic}:33333333-3333-4333-8333-333333333333`;
    const entry = model.proposals[spec.semantic].get(key);
    assert.deepEqual(readAssignments(entry), { state: 'known', ids: subjects });
    assert.equal(entry.record.id, key);
    assert.equal(model[spec.collection].size, 0);
  }
});

test('real reader preserves nonempty assignment shape without claiming subject eligibility', (t) => {
  const subjects = ['S-999999', 'S-000001'];
  const model = loadStores(fixture(t, { subjects }));
  for (const spec of specs) {
    assert.deepEqual(model[spec.collection].get(spec.record.id)?.record, { ...spec.record, subjects });
  }
  // A structurally valid list is not proof of registry membership or approval.
  assert.equal(model.diagnostics.some(({ code, path }) => ['unknown-property', 'wrong-type', 'pattern-mismatch', 'duplicate-subject'].includes(code) && path?.includes('subjects')), false);
});

test('real reader and CLI reject duplicate assignments with store-local attribution', (t) => {
  const root = fixture(t, { subjects: ['S-000001', 'S-000001'] });
  const model = loadStores(root);
  assert.equal(model.ok, false);
  for (const spec of specs) {
    assert.ok(model.diagnostics.some(({ code, file, path }) => code === 'duplicate-subject'
      && file === `${spec.store}/${spec.file}` && path === prefix(spec) + 'subjects[1]'), JSON.stringify(model.diagnostics));
  }
  const result = spawnSync(process.execPath, ['payload/engine/validate.js', '--root', root, '--json'], { encoding: 'utf8' });
  assert.equal(result.status, 2, result.stdout + result.stderr);
});
