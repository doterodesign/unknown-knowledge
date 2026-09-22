import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { readSubjectRegistry, parseSubjectRegistry, SUBJECT_REGISTRY_DIAGNOSTIC_CODES } from '../payload/engine/lib/subject-registry-reader.js';
import { createSubjectValidationBudget } from '../payload/engine/lib/subject-validation-budget.js';
import { CANONICAL_ID_GRAMMARS, UUID_V4_PATTERN } from '../payload/engine/lib/id-grammars.js';
import { readFileSync } from 'node:fs';
import { lookupSubjects } from '../payload/engine/lib/subjects.js';
import { subjectGovernanceFixture } from './helpers/subject-governance-fixture.js';

const namespace = '12345678-1234-4234-8234-123456789abc';
const document = () => ({ 'schema-version': 1, namespace, revision: 0, 'hierarchy-revision': 0,
  subjects: [{ id: `proposal:subject:${namespace}`, label: 'Café', status: 'proposed',
    definition: { text: 'A place serving coffee', includes: [], excludes: [] },
  aliases: [{ label: 'Coffeehouse', locale: 'en', context: 'places' }], related: [], changes: [] }], history: [] });

test('shared raw-byte parser agrees with disk reader and guards invalid UTF-8 and cyclic YAML before mapping', (t) => {
  const input = kit(t); write(input, document());
  const limits = { maxCaptureBytes: 10000, maxDocumentNodes: 10000, maxDocumentTextUnits: 10000,
    maxSubjects: 10000, maxHistoryRows: 10000, maxValidationSteps: 10000 };
  const parsed = parseSubjectRegistry({ bytes: Buffer.from(JSON.stringify(document())), identity: input.identity,
    budget: createSubjectValidationBudget(limits) });
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.subjectRegistry.document, readSubjectRegistry(input).subjectRegistry.document);
  assert.equal(parseSubjectRegistry({ bytes: Buffer.from([0xff]), identity: input.identity }).ok, false);
  assert.throws(() => parseSubjectRegistry({ bytes: Buffer.from('a: &a [*a]'), identity: input.identity,
    budget: createSubjectValidationBudget(limits) }), { code: 'cyclic-subject-input' });
});

function kit(t) {
  const kitDir = mkdtempSync(join(tmpdir(), 'subject-registry-'));
  t.after(() => rmSync(kitDir, { recursive: true, force: true }));
  return { kitDir, identity: subjectGovernanceFixture().identityInput.identity };
}

function write(input, value) {
  mkdirSync(join(input.kitDir, 'subjects'), { recursive: true });
  writeFileSync(join(input.kitDir, 'subjects', 'registry.yaml'), typeof value === 'string' ? value : JSON.stringify(value));
}

test('absent authority is an unavailable optional capability with no invented identity errors', (t) => {
  const input = kit(t);
  assert.deepEqual(readSubjectRegistry({ kitDir: input.kitDir }),
    { ok: true, present: false, subjectRegistry: undefined, diagnostics: [] });
});

test('the exact authority yields an indexed structural registry with explicit on-disk mapping', (t) => {
  const input = kit(t); write(input, document());
  const result = readSubjectRegistry(input);
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  assert.equal(result.present, true);
  assert.equal(result.subjectRegistry?.schemaVersion, 1);
  assert.equal(result.subjectRegistry?.hierarchyRevision, 0);
  assert.equal(lookupSubjects(result.subjectRegistry, 'coffeehouse').matches[0].label, 'Café');
  assert.equal(Object.hasOwn(result.subjectRegistry.document, 'schema-version'), false);
});

test('derived or adjacent registry-looking files are never ingested', (t) => {
  const input = kit(t);
  mkdirSync(join(input.kitDir, 'subjects', 'derived'), { recursive: true });
  writeFileSync(join(input.kitDir, 'subjects', 'derived', 'registry.yaml'), 'invalid: [');
  writeFileSync(join(input.kitDir, 'subjects', 'other.yaml'), 'invalid: [');
  assert.equal(readSubjectRegistry(input).present, false);
  write(input, document());
  assert.equal(readSubjectRegistry(input).ok, true);
});

test('empty authority is present while malformed, unsupported and unknown fields refuse', (t) => {
  const input = kit(t);
  write(input, { ...document(), subjects: [] });
  assert.equal(readSubjectRegistry(input).present, true);
  assert.equal(readSubjectRegistry(input).subjectRegistry.subjects.size, 0);
  for (const value of ['subjects: [', { ...document(), 'schema-version': 2 },
    { ...document(), schemaVersion: 1 }, { ...document(), namespace: 17 }]) {
    write(input, value);
    const result = readSubjectRegistry(input);
    assert.equal(result.ok, false);
    assert.equal(result.present, true);
    assert.equal(result.subjectRegistry, undefined);
    assert.ok(result.diagnostics.every((d) => d.severity === 'error' && d.file === 'subjects/registry.yaml'));
    assert.ok(result.diagnostics.every((d) => SUBJECT_REGISTRY_DIAGNOSTIC_CODES.includes(d.code)));
  }
});

test('present authority requires the real coherent ledger and cannot borrow a wrong namespace', (t) => {
  const input = kit(t); write(input, document());
  assert.equal(readSubjectRegistry({ kitDir: input.kitDir }).ok, false);
  assert.equal(readSubjectRegistry({ ...input, identity: { ...input.identity, namespace: '23456789-1234-4234-8234-123456789abc' } }).ok, false);
  assert.equal(readSubjectRegistry({ ...input, identity: { ...input.identity, allocations: 'invalid' } }).ok, false);
});

test('a directory or symbolic-link authority is a read error rather than absent or derived data', (t) => {
  const input = kit(t);
  mkdirSync(join(input.kitDir, 'subjects', 'registry.yaml'), { recursive: true });
  assert.equal(readSubjectRegistry(input).ok, false);
  rmSync(join(input.kitDir, 'subjects', 'registry.yaml'), { recursive: true });
  writeFileSync(join(input.kitDir, 'target.yaml'), JSON.stringify(document()));
  symlinkSync('../target.yaml', join(input.kitDir, 'subjects', 'registry.yaml'));
  const result = readSubjectRegistry(input);
  assert.equal(result.ok, false);
  assert.equal(result.present, true);
});

function authoredGovernance(data) {
  const state = ({ originDecision, ...rest }) => ({ ...rest, 'origin-decision': originDecision });
  const { schemaVersion, hierarchyRevision, subjects, history, ...rest } = data.document;
  return { ...rest, 'schema-version': schemaVersion, 'hierarchy-revision': hierarchyRevision,
    subjects: subjects.map(state), history: history.map(({ review, rows, ...event }) => ({ ...event,
      review: { reference: review.reference, 'accepted-status': review.acceptedStatus,
        'decision-capture': review.decisionCapture, 'decision-digest': review.decisionDigest, 'change-digest': review.changeDigest },
      rows: rows.map((row) => ({ ...row, before: row.before === null ? null : state(row.before), after: state(row.after) })) })) };
}

test('all governance fields round-trip into the exact domain capture without approving source evidence', (t) => {
  const input = kit(t);
  const data = subjectGovernanceFixture();
  write(input, authoredGovernance(data));
  const result = readSubjectRegistry(input);
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  assert.deepEqual(result.subjectRegistry.document, data.document);
  assert.equal(Object.hasOwn(result, 'governance'), false);
});

test('active entries require complete structural governance and existing subject allocations', (t) => {
  const input = kit(t);
  const bare = document();
  Object.assign(bare.subjects[0], { id: 'S-000001', status: 'active' });
  write(input, bare);
  assert.equal(readSubjectRegistry(input).ok, false);
  const data = subjectGovernanceFixture();
  write(input, authoredGovernance(data));
  const identity = { ...input.identity, allocations: input.identity.allocations.filter((row) => row.kind !== 'subject') };
  assert.equal(readSubjectRegistry({ ...input, identity }).ok, false);
});

test('programmer input errors and missing kit roots are not ordinary malformed registry diagnostics', (t) => {
  const input = kit(t);
  assert.throws(() => readSubjectRegistry({ ...input, kitDir: null }), TypeError);
  assert.throws(() => readSubjectRegistry({ ...input, kitDir: join(input.kitDir, 'missing-root') }), { code: 'ENOENT' });
});

test('a symlinked subjects directory cannot import another tree as the authority', (t) => {
  const input = kit(t);
  mkdirSync(join(input.kitDir, 'derived-data'));
  writeFileSync(join(input.kitDir, 'derived-data', 'registry.yaml'), JSON.stringify(document()));
  symlinkSync('derived-data', join(input.kitDir, 'subjects'));
  const result = readSubjectRegistry(input);
  assert.equal(result.ok, false);
  assert.equal(result.present, true);
});

test('the shipped authority schema retains exact shared canonical and proposal identity spellings', () => {
  const schema = JSON.parse(readFileSync(new URL('../payload/schemas/subject-registry.schema.json', import.meta.url), 'utf8'));
  assert.equal(schema.$defs.subjectRelated.properties.target.pattern, CANONICAL_ID_GRAMMARS.subject.pattern);
  assert.equal(schema.$defs.subjectDecisionRef.properties.id.pattern, CANONICAL_ID_GRAMMARS.decision.pattern);
  assert.equal(schema.$defs.subjectNamespace.pattern, `^${UUID_V4_PATTERN}(?![\\s\\S])$`);
});
