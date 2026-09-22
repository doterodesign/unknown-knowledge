/** The loader's record-file parser, also used for already captured bytes. */
import { guardCapturedDocument } from './document-budget.js';
import { posix } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { load, YAMLException } from 'js-yaml';
import { validateStoreFile } from './validate-record.js';
import { IdentityOperationError, iterateCurrentRecords, parseCanonicalId, parseProposalKey } from './record-identity.js';
import { getIdentityIndexDescriptor, getRecordOccurrence } from './record-identity-index.js';
import { canonicalSha256 } from './canonical-json.js';

export const LEAF_ID_FIELD = 'notation';
export const LEAF_ACCESSION_FIELD = 'id';
export function leafIdentity(record) {
  const accession = record[LEAF_ACCESSION_FIELD];
  return parseCanonicalId('knowledge', accession).ok || parseProposalKey('knowledge', accession).ok
    ? accession : undefined;
}

const schemas = Object.freeze({ knowledge: 'knowledge-leaf', ontology: 'ontology-concept', decision: 'decision-entry' });
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

/** Preserve scalar types and the loader's existing parse diagnostics. */
export function parseYamlDocument(file, text, diagnostics, { documentBudget } = {}) {
  let doc;
  try { doc = load(text, { filename: file }); }
  catch (error) {
    const reason = error instanceof YAMLException ? error.reason ?? error.message : error.message;
    diagnostics.push({ severity: 'error', code: 'parse-error', file, path: '', message: `unparseable YAML: ${reason}` });
    return null;
  }
  if (documentBudget !== undefined) guardCapturedDocument(doc, documentBudget, { phase: 'parsed-yaml', allowUndefined: true });
  return { doc };
}

/**
 * Parse and validate the WHOLE file before selecting any occurrence. The
 * ordinary loader may still index defective documents for diagnostics; strict
 * capture consumers must require ok. Locators are kit-relative, in authored order.
 */
export function parseRecordFile({ kind, file, text, documentBudget }) {
  if (!Object.hasOwn(schemas, kind) || typeof file !== 'string' || typeof text !== 'string') {
    throw new TypeError('parseRecordFile requires a record kind, file and text');
  }
  const diagnostics = [];
  const occurrences = [];
  let body;
  if (kind === 'knowledge') {
    const normalized = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
    const match = /^---\n([^]*?\n)?---(?:\n|$)([^]*)$/.exec(normalized);
    if (!match) {
      diagnostics.push({ severity: 'error', code: 'parse-error', file, path: '',
        message: 'knowledge leaf must open with YAML front matter fenced by "---" lines (§3.2)' });
      return { ok: false, document: undefined, occurrences, diagnostics };
    }
    text = match[1] ?? '';
    body = match[2];
    if (documentBudget !== undefined) guardCapturedDocument(body, documentBudget, { phase: 'parsed-knowledge-body' });
  }
  const parsed = parseYamlDocument(file, text, diagnostics, { documentBudget });
  if (!parsed) return { ok: false, document: undefined, occurrences, diagnostics };
  const document = parsed.doc;
  const checked = validateStoreFile(schemas[kind], document);
  diagnostics.push(...checked.errors.map(({ path, code, message }) => ({ severity: 'error', code, file, path, message })));
  if (kind === 'knowledge') {
    if (isObject(document)) occurrences.push({ kind, locator: { file, path: '' }, entry: {
      identity: leafIdentity(document), id: document[LEAF_ACCESSION_FIELD] ?? null,
      notation: document[LEAF_ID_FIELD], file, record: document, body,
    } });
  } else if (isObject(document) && Array.isArray(document.entries)) {
    document.entries.forEach((record, i) => {
      if (isObject(record)) occurrences.push({ kind, locator: { file, path: `entries[${i}]` },
        entry: { id: record.id, file, record } });
    });
  }
  return { ok: checked.ok, document, occurrences, diagnostics };
}

const safePath = (value) => typeof value === 'string' && value.length > 0
  && !value.includes('\\') && !value.includes('\0') && !posix.isAbsolute(value)
  && value.split('/').every((part) => part !== '' && part !== '.' && part !== '..');

/**
 * Select exact canonical evidence from caller-captured bytes, without IO.
 * This proves parsing/model agreement only: commit membership, blob integrity,
 * scope, byte-preservation and publication approval are separate checks.
 * `file` is repo-relative; `kitPath` belongs to this same captured side.
 */
export function selectCapturedRecord({ model, ref, kitPath, file, bytes }) {
  const fail = (code, diagnostics = []) => ({ ok: false, code, diagnostics });
  if (!(bytes instanceof Uint8Array) || !isObject(ref)
      || Reflect.ownKeys(ref).length !== 3 || !['namespace', 'kind', 'id'].every((key) => Object.hasOwn(ref, key))
      || !Object.hasOwn(schemas, ref.kind) || !parseCanonicalId(ref.kind, ref.id).ok) return fail('invalid-capture-input');
  if (!safePath(file) || !(kitPath === '.' || safePath(kitPath))) return fail('invalid-capture-path');
  const prefix = kitPath === '.' ? '' : `${kitPath}/`;
  if (!file.startsWith(prefix) || file.length === prefix.length) return fail('invalid-capture-path');
  const kitFile = file.slice(prefix.length);
  const rawBytes = Buffer.from(bytes);
  const text = rawBytes.toString('utf8');
  if (!Buffer.from(text, 'utf8').equals(rawBytes)) return fail('invalid-capture-encoding');
  const parsed = parseRecordFile({ kind: ref.kind, file: kitFile, text });
  if (!parsed.ok) return fail('invalid-record-file', parsed.diagnostics);
  const matches = parsed.occurrences.filter(({ entry }) => entry.record.id === ref.id);
  if (matches.length !== 1) return fail('record-occurrence-count');
  const occurrence = matches[0];
  try {
    const descriptor = getIdentityIndexDescriptor(model?.identityIndex);
    const row = iterateCurrentRecords(model, { kinds: [ref.kind] }).find((row) => isDeepStrictEqual(row.ref, ref));
    const captured = getRecordOccurrence(model.identityIndex, ref);
    if (descriptor.identityDigest !== canonicalSha256(model.identity) || !row || !captured
        || !isDeepStrictEqual(row.entry, occurrence.entry) || !isDeepStrictEqual(captured, occurrence)) {
      return fail('capture-model-mismatch');
    }
  } catch (error) {
    if (!(error instanceof IdentityOperationError)) throw error;
    return fail('capture-model-mismatch');
  }
  return { ok: true, ref: { ...ref }, entry: occurrence.entry, locator: occurrence.locator, rawBytes };
}
