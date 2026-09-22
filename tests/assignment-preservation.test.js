import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateAssignmentPreservation } from '../payload/engine/lib/assignment-preservation.js';

const note = { type: 'revision', date: '2026-09-19', text: 'Classification review by steward using kb-build: subjects S-000001. Existing evidence metadata retained.' };
const base = '---\nschema-version: 3\nid: K-000001\ndomain: legacy\nheading: Café\ncitations: [{source: retained}]\nfacets: {domain: design-system, stage: verified}\nprovenance: {author: steward}\n# retained comment\n---\nEvidence π stays exactly here.\n';
const field = 'subjects: [S-000001]\n';
const notes = `notes:\n  - ${JSON.stringify(note)}\n`;
const insert = (text, value) => text.replace('# retained comment', `${value}# retained comment`);
const check = (before, candidate, reviewNote = note) => validateAssignmentPreservation({ file: 'knowledge/leaves/a.md', beforeBytes: Buffer.from(before), candidateBytes: Buffer.from(candidate), reviewNote });

test('unknown assignments may acquire subjects plus an exact new revision note', () => {
  assert.equal(check(base, insert(base, field + notes)).ok, true);
});
test('BOM, CRLF, Unicode, body and outside comments remain exact bytes', () => {
  const before = '\uFEFF' + base.replaceAll('\n', '\r\n');
  const candidate = '\uFEFF' + insert(base, field + notes).replaceAll('\n', '\r\n');
  assert.equal(check(before, candidate).ok, true);
  for (const changed of [candidate.slice(1), candidate.replaceAll('\r\n', '\n'), candidate.replace('Evidence π', 'Evidence pi'), candidate.replace('# retained comment', '# changed comment')]) {
    assert.equal(check(before, changed).ok, false);
  }
});
test('existing block notes keep their exact bytes as a prefix', () => {
  const prior = 'notes:\n  - {type: scope, text: "Original wording"}\n';
  const before = insert(base, prior + 'subjects: []\n');
  const candidate = before.replace('subjects: []', 'subjects: [S-000001]').replace(prior, prior + `  - ${JSON.stringify(note)}\n`);
  assert.equal(check(before, candidate).ok, true);
  assert.equal(check(before, candidate.replace('"Original wording"', "'Original wording'")).ok, false);
});
test('explicit empty notes can receive a revision suffix and unchanged subjects are reviewed', () => {
  const before = insert(base, field + 'notes: []\n');
  assert.equal(check(before, before.replace('notes: []\n', notes)).ok, true);
});
test('other metadata and existing provenance cannot change', () => {
  const candidate = insert(base, field + notes);
  for (const altered of [candidate.replace('author: steward', 'author: another'), candidate.replace('source: retained', 'source: replaced'), candidate.replace('stage: verified', 'stage: draft'), candidate.replace('domain: design-system', 'domain: elsewhere')]) {
    assert.equal(check(base, altered).ok, false);
  }
});
test('exact reviewed note is required and no existing note may disappear', () => {
  assert.equal(check(base, insert(base, field)).ok, false);
  assert.equal(check(base, insert(base, field + notes.replace('metadata retained', 're-verified'))).ok, false);
  const before = insert(base, 'notes:\n  - {type: scope, text: retained}\n');
  assert.equal(check(before, insert(base, field + notes)).ok, false);
});
test('comments inside subject edits, tags, aliases and ambiguous styles refuse', () => {
  for (const before of [insert(base, 'subjects: [] # keep me\n'), insert(base, 'subjects: &ids []\n'), base.replace('domain: legacy', '"domain": legacy')]) {
    assert.equal(check(before, insert(base, field + notes)).ok, false);
  }
});
test('an inserted revision cannot absorb and silently delete adjacent comments', () => {
  const before = insert(base, 'subjects: []\n# subject rationale\n');
  const candidate = insert(base, field + notes);
  assert.equal(check(before, candidate).ok, false);
});
