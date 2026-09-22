/** Canonical identity primitives for the new installation format (UCS-1234). */
import { CANONICAL_ID_GRAMMARS, UUID_V4_PATTERN } from './id-grammars.js';

/** @typedef {'knowledge'|'ontology'|'decision'} RecordKind */
/** @typedef {RecordKind|'subject'} IdentityKind */
/** @typedef {{namespace: string, kind: RecordKind, id: string}} RecordRef */

const canonical = Object.fromEntries(Object.entries(CANONICAL_ID_GRAMMARS)
  .map(([kind, { pattern }]) => [kind, new RegExp(pattern)]));
const proposals = Object.fromEntries(Object.keys(CANONICAL_ID_GRAMMARS)
  .map((kind) => [kind, new RegExp(`^proposal:${kind}:${UUID_V4_PATTERN}(?![\\s\\S])$`)]));
const namespacePattern = new RegExp(`^${UUID_V4_PATTERN}(?![\\s\\S])$`);
/** Exact UUID spelling used by installation and publication identity. */
export const isIdentityUuid = (value) => typeof value === 'string' && namespacePattern.test(value);
const recordSpaces = Object.freeze({
  knowledge: { store: 'knowledge', map: 'leaves' },
  ontology: { store: 'ontology', map: 'concepts' },
  decision: { store: 'decisions', map: 'decisions' },
});
export const RECORD_KINDS = Object.freeze(Object.keys(recordSpaces));

/** One identity check for current map entries and captured lookup candidates. */
export function recordIdentityMatches(kind, id, entry) {
  return parseCanonicalId(kind, id).ok && entryIdentityMatches(id, entry);
}

/** Authoring-key coherence for proposal iterators and assignment adapters. */
export function proposalIdentityMatches(kind, key, entry) {
  return parseProposalKey(kind, key).ok && entryIdentityMatches(key, entry);
}

function entryIdentityMatches(id, entry) {
  return entry?.record?.id === id
    && (!Object.hasOwn(entry, 'id') || entry.id === id)
    && (!Object.hasOwn(entry, 'identity') || entry.identity === id);
}

export const IDENTITY_OPERATION_CODES = Object.freeze([
  'invalid-selection', 'invalid-model', 'unsupported-identity-format',
  'invalid-namespace', 'unavailable-store', 'unavailable-proposals', 'invalid-record',
]);

/** Operation failures are not reference lookup outcomes such as `missing`. */
export class IdentityOperationError extends Error {
  constructor(code, details = {}) {
    super(`identity operation failed: ${code}`);
    this.name = 'IdentityOperationError';
    this.code = code;
    this.details = details;
  }
}

function parse(patterns, kind, value) {
  if (typeof kind !== 'string' || !Object.hasOwn(patterns, kind)) {
    return { ok: false, code: 'invalid-kind' };
  }
  return typeof value === 'string' && patterns[kind].test(value)
    ? { ok: true, kind, id: value }
    : { ok: false, code: 'invalid-id' };
}

/** Parse an exact canonical identity without formatting or coercion. */
export function parseCanonicalId(kind, value) {
  return parse(canonical, kind, value);
}

/** Proposal keys are authoring identities, never canonical lookup aliases. */
export function parseProposalKey(kind, value) {
  return parse(proposals, kind, value);
}

/**
 * Iterate separately captured proposals, including rejected authoring records.
 * Missing proposal capture is unavailable, never a known empty draft universe.
 * Eager validation and original-entry ownership match current-record iteration.
 * @param {object} model healthy captured model with per-kind proposal Maps
 * @param {{kinds: RecordKind[]}} options explicit nonempty kind selection
 * @returns {Array<{proposalRef: {namespace: string, kind: RecordKind, key: string}, entry: object}>}
 */
export function iterateProposalRecords(model, options) {
  const { kinds, namespace } = validateIteration(model, options);
  if (!Object.hasOwn(model, 'proposals')) throw new IdentityOperationError('unavailable-proposals');
  if (model.proposals === null || typeof model.proposals !== 'object' || Array.isArray(model.proposals)) {
    throw new IdentityOperationError('invalid-model');
  }
  const rows = [];
  for (const kind of kinds) {
    if (!Object.hasOwn(model.proposals, kind)) throw new IdentityOperationError('unavailable-proposals', { kind });
    const entries = model.proposals[kind];
    if (!(entries instanceof Map)) throw new IdentityOperationError('invalid-model', { kind });
    for (const [key, entry] of entries) {
      if (!proposalIdentityMatches(kind, key, entry)) {
        throw new IdentityOperationError('invalid-record', { kind, key });
      }
      rows.push({ proposalRef: { namespace, kind, key }, entry });
    }
  }
  return rows.sort((a, b) => compare(a.proposalRef.kind, b.proposalRef.kind) || compare(a.proposalRef.key, b.proposalRef.key));
}

const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;

/**
 * Capture an iterable of selected current records, preserving original entries.
 * Validate the entire selected universe before returning even its first row.
 * The caller supplies an already validated captured model, not a live snapshot.
 * @param {object} model current-format model with identity, stores and record maps
 * @param {{kinds: RecordKind[]}} options explicit nonempty store selection
 * @returns {Array<{ref: RecordRef, entry: object}>}
 */
export function iterateCurrentRecords(model, options) {
  const { kinds, namespace } = validateIteration(model, options);
  const rows = [];
  for (const kind of kinds) {
    const entries = model[recordSpaces[kind].map];
    if (!(entries instanceof Map)) throw new IdentityOperationError('invalid-model', { kind });
    for (const [id, entry] of entries) {
      if (!recordIdentityMatches(kind, id, entry)) {
        throw new IdentityOperationError('invalid-record', { kind, id });
      }
      rows.push({ ref: { namespace, kind, id }, entry });
    }
  }
  return rows.sort((a, b) => compare(a.ref.kind, b.ref.kind) || compare(a.ref.id, b.ref.id));
}

/** Shared selection and captured-model checks; each view owns its identity map. */
function validateIteration(model, options) {
  const kinds = options?.kinds;
  if (!Array.isArray(kinds) || kinds.length === 0 || new Set(kinds).size !== kinds.length
      || kinds.some((kind) => typeof kind !== 'string' || !Object.hasOwn(recordSpaces, kind))) {
    throw new IdentityOperationError('invalid-selection');
  }
  if (model?.ok !== true) throw new IdentityOperationError('invalid-model');
  if (model.identity?.['identity-format'] !== 1) {
    throw new IdentityOperationError('unsupported-identity-format');
  }
  const namespace = model.identity.namespace;
  if (!isIdentityUuid(namespace)) {
    throw new IdentityOperationError('invalid-namespace');
  }
  for (const kind of kinds) {
    const { store } = recordSpaces[kind];
    if (model.stores?.[store]?.present !== true) {
      throw new IdentityOperationError('unavailable-store', { kind });
    }
  }
  return { kinds: [...kinds].sort(compare), namespace };
}
