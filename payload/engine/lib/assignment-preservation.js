/** Read-only assignment byte preservation; no writer or approval claim. */
import { isDeepStrictEqual } from 'node:util';
import { parseEvents, EVENT_ID, COLLECTION_STYLE, SCALAR_STYLE, YAMLException } from 'js-yaml';
import { parseRecordFile } from './record-file.js';
import { isIdentityUuid, parseCanonicalId } from './record-identity.js';

// Events locate source regions only. The actual canonical parser remains the
// sole authority for record semantics, duplicate keys and schema validity.
function syntaxTree(source) {
  const events = parseEvents(source, {});
  const stack = []; let root;
  for (const event of events) {
    if (event.type === EVENT_ID.DOCUMENT) {
      if (root || event.explicitStart || event.explicitEnd || event.directives.length) return null;
      continue;
    }
    if (event.type === EVENT_ID.ALIAS || event.anchorStart >= 0 || event.tagStart >= 0) return null;
    if (event.type === EVENT_ID.POP) { stack.pop(); continue; }
    const node = { event, children: [] };
    if (stack.length) stack.at(-1).children.push(node);
    else { if (root) return null; root = node; }
    if ([EVENT_ID.MAPPING, EVENT_ID.SEQUENCE].includes(event.type)) stack.push(node);
  }
  return root;
}

function spans(text) {
  const match = /^(?:\uFEFF)?---\r?\n([^]*?\r?\n)?---(?:\r?\n|$)/.exec(text);
  if (!match) return null;
  const source = match[1] ?? '';
  const offset = text.indexOf('\n') + 1;
  const root = syntaxTree(source);
  if (root?.event.type !== EVENT_ID.MAPPING || root.event.style !== COLLECTION_STYLE.BLOCK) return null;
  const fields = [];
  for (let i = 0; i < root.children.length; i += 2) {
    const key = root.children[i].event;
    if (key.type !== EVENT_ID.SCALAR || key.style !== SCALAR_STYLE.PLAIN
      || (key.valueStart !== 0 && source[key.valueStart - 1] !== '\n')) return null;
    const name = source.slice(key.valueStart, key.valueEnd);
    if (!/^[a-z][a-z-]*$/.test(name) || source[key.valueEnd] !== ':') return null;
    fields.push({ name, start: key.valueStart, value: root.children[i + 1] });
  }
  const edits = new Map();
  for (const [i, field] of fields.entries()) {
    if (!['subjects', 'notes'].includes(field.name)) continue;
    let end = fields[i + 1]?.start ?? source.length;
    // Trailing comments and blank lines belong to the immutable surroundings.
    const region = source.slice(field.start, end);
    const lines = region.match(/[^\n]*\n|[^\n]+$/g) ?? [];
    while (lines.length > 1 && /^\s*(?:#.*)?(?:\r?\n)?$/.test(lines.at(-1))) end -= lines.pop().length;
    const raw = source.slice(field.start, end);
    if (raw.includes('#') || field.value?.event.type !== EVENT_ID.SEQUENCE) return null;
    edits.set(field.name, { start: offset + field.start, end: offset + end, raw,
      style: field.value.event.style });
  }
  return edits;
}

function immutableBytes(bytes, text, fields) {
  const pieces = []; let cursor = 0;
  for (const { start, end } of [...fields.values()].sort((a, b) => a.start - b.start)) {
    const from = Buffer.byteLength(text.slice(0, start));
    const to = Buffer.byteLength(text.slice(0, end));
    pieces.push(bytes.subarray(cursor, from)); cursor = to;
  }
  pieces.push(bytes.subarray(cursor));
  return Buffer.concat(pieces);
}

/** Exact reviewed suffix or null for no note append; never authenticates authorship. */
export function validateAssignmentPreservation({ file, beforeBytes, candidateBytes, reviewNote }) {
  const fail = (code) => ({ ok: false, diagnostics: [{ code, path: file }] });
  if (!Buffer.isBuffer(beforeBytes) || !Buffer.isBuffer(candidateBytes)) return fail('invalid-preservation-bytes');
  const texts = [beforeBytes, candidateBytes].map((bytes) => bytes.toString('utf8'));
  if (!Buffer.from(texts[0]).equals(beforeBytes) || !Buffer.from(texts[1]).equals(candidateBytes)) return fail('invalid-preservation-encoding');
  const parsed = texts.map((text) => parseRecordFile({ kind: 'knowledge', file, text }));
  if (parsed.some(({ ok }) => !ok)) return fail('invalid-preservation-record');
  const [before, after] = parsed.map(({ document }) => document);
  const clean = ({ subjects, notes, ...rest }) => rest;
  if (!isDeepStrictEqual(clean(before), clean(after))) return fail('assignment-metadata-changed');
  const oldNotes = before.notes ?? [];
  const expected = reviewNote === null ? oldNotes : [...oldNotes, reviewNote];
  if (!isDeepStrictEqual(after.notes ?? [], expected)) return fail('assignment-note-mismatch');
  let fields;
  try { fields = texts.map(spans); }
  catch (error) { if (!(error instanceof YAMLException)) throw error; return fail('unsupported-preservation-syntax'); }
  if (fields.some((value) => value === null)) return fail('unsupported-preservation-syntax');
  const oldSpan = fields[0].get('notes'); const newSpan = fields[1].get('notes');
  if (oldNotes.length > 0 && (oldSpan.style !== COLLECTION_STYLE.BLOCK
    || newSpan?.style !== COLLECTION_STYLE.BLOCK || !newSpan.raw.startsWith(oldSpan.raw))) {
    return fail('assignment-note-prefix-changed');
  }
  if (reviewNote === null && oldSpan?.raw !== newSpan?.raw) return fail('assignment-note-prefix-changed');
  if (!immutableBytes(beforeBytes, texts[0], fields[0]).equals(immutableBytes(candidateBytes, texts[1], fields[1]))) {
    return fail('assignment-unrelated-bytes-changed');
  }
  return { ok: true, diagnostics: [], scope: 'knowledge-file-bytes-outside-subjects-and-exact-note-suffix' };
}

const closed = (value, keys) => value !== null && typeof value === 'object' && !Array.isArray(value)
  && Reflect.ownKeys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const lineStart = (source, index) => source.lastIndexOf('\n', index - 1) + 1;
function mappingFields(source, node) {
  if (node?.event.type !== EVENT_ID.MAPPING || node.event.style !== COLLECTION_STYLE.BLOCK
    || node.children.length % 2) return null;
  const fields = [];
  for (let i = 0; i < node.children.length; i += 2) {
    const key = node.children[i].event;
    if (key.type !== EVENT_ID.SCALAR || key.style !== SCALAR_STYLE.PLAIN) return null;
    const name = source.slice(key.valueStart, key.valueEnd);
    if (!/^[a-z][a-z-]*$/.test(name) || source[key.valueEnd] !== ':') return null;
    fields.push({ name, start: key.valueStart, value: node.children[i + 1] });
  }
  return fields;
}

// Only structural positions come from events. Semantic IDs, selected owners and
// whole-file validity come from the shared parser, never a second YAML reader.
function typedSpans(text, parsed, selected) {
  const offset = text.startsWith('\uFEFF') ? 1 : 0;
  const source = text.slice(offset);
  const fields = mappingFields(source, syntaxTree(source));
  if (!fields) return null;
  const position = fields.findIndex(({ name }) => name === 'entries');
  const entries = fields[position]?.value;
  if (entries?.event.type !== EVENT_ID.SEQUENCE || entries.event.style !== COLLECTION_STYLE.BLOCK
    || entries.children.length !== parsed.occurrences.length) return null;
  const edits = new Map();
  for (const [index, node] of entries.children.entries()) {
    const occurrence = parsed.occurrences[index];
    if (!selected.has(occurrence.entry.record.id)) continue;
    const rowFields = mappingFields(source, node);
    if (!rowFields) return null;
    const subjectIndex = rowFields.findIndex(({ name }) => name === 'subjects');
    if (subjectIndex < 0) continue;
    const field = rowFields[subjectIndex];
    // The sequence marker and record's leading field stay immutable. A subjects
    // field on the '- subjects:' line needs an explicit future editing syntax.
    const start = lineStart(source, field.start);
    if (!/^ *$/.test(source.slice(start, field.start)) || field.value.event.type !== EVENT_ID.SEQUENCE) return null;
    const next = rowFields[subjectIndex + 1]?.start ?? entries.children[index + 1]?.event.start ?? fields[position + 1]?.start;
    let end = next === undefined ? source.length : lineStart(source, next);
    const lines = source.slice(start, end).match(/[^\n]*\n|[^\n]+$/g) ?? [];
    while (lines.length > 1 && /^\s*(?:#.*)?(?:\r?\n)?$/.test(lines.at(-1))) end -= lines.pop().length;
    const raw = source.slice(start, end);
    if (raw.includes('#')) return null;
    edits.set(occurrence.entry.record.id, { start: start + offset, end: end + offset });
  }
  return edits;
}

/** One actual physical file, with the union of all reviewed canonical edits. */
export function validateTypedAssignmentPreservation({ kind, file, beforeBytes, candidateBytes, rows }) {
  const fail = (code) => ({ ok: false, diagnostics: [{ code, path: file }] });
  if (!['knowledge', 'ontology', 'decision'].includes(kind) || !Array.isArray(rows) || !rows.length
    || !rows.every((row) => closed(row, ['ref', 'reviewNote']) && closed(row.ref, ['namespace', 'kind', 'id'])
      && isIdentityUuid(row.ref.namespace) && row.ref.kind === kind && parseCanonicalId(kind, row.ref.id).ok)
    || new Set(rows.map(({ ref }) => ref.id)).size !== rows.length
    || new Set(rows.map(({ ref }) => ref.namespace)).size !== 1
    || !Buffer.isBuffer(beforeBytes) || !Buffer.isBuffer(candidateBytes)) return fail('invalid-typed-preservation-input');
  const texts = [beforeBytes, candidateBytes].map((bytes) => bytes.toString('utf8'));
  if (!Buffer.from(texts[0]).equals(beforeBytes) || !Buffer.from(texts[1]).equals(candidateBytes)) return fail('invalid-preservation-encoding');
  const parsed = texts.map((text) => parseRecordFile({ kind, file, text }));
  if (parsed.some(({ ok }) => !ok)) return fail('invalid-preservation-record');
  const selected = new Set(rows.map(({ ref }) => ref.id));
  for (const id of selected) {
    const matches = parsed.map((part) => part.occurrences.filter(({ entry }) => entry.record.id === id));
    if (matches.some((list) => list.length !== 1)
      || !isDeepStrictEqual(matches[0][0].locator, matches[1][0].locator)) return fail('assignment-preservation-owner-mismatch');
  }
  if (kind === 'knowledge') {
    if (rows.length !== 1) return fail('assignment-preservation-owner-mismatch');
    return validateAssignmentPreservation({ file, beforeBytes, candidateBytes, reviewNote: rows[0].reviewNote });
  }
  if (rows.some(({ reviewNote }) => reviewNote !== null)) return fail('assignment-note-mismatch');
  const clean = (document) => ({ ...document, entries: document.entries.map((entry) => {
    if (!selected.has(entry.id)) return entry;
    const { subjects, ...rest } = entry;
    return rest;
  }) });
  if (!isDeepStrictEqual(clean(parsed[0].document), clean(parsed[1].document))) return fail('assignment-metadata-changed');
  let fields;
  try { fields = texts.map((text, index) => typedSpans(text, parsed[index], selected)); }
  catch (error) { if (!(error instanceof YAMLException)) throw error; return fail('unsupported-preservation-syntax'); }
  if (fields.some((part) => part === null)) return fail('unsupported-preservation-syntax');
  if (!immutableBytes(beforeBytes, texts[0], fields[0]).equals(immutableBytes(candidateBytes, texts[1], fields[1]))) {
    return fail('assignment-unrelated-bytes-changed');
  }
  return { ok: true, diagnostics: [], scope: 'typed-file-bytes-outside-selected-subject-spans' };
}
