/** Fingerprints describe supplied parsed inputs, never an atomic filesystem snapshot. */
import { canonicalSha256 as digest, CapturedInputError } from './canonical-json.js';
import { parseCanonicalId, parseProposalKey } from './record-identity.js';
import { UUID_V4_PATTERN } from './id-grammars.js';

const namespacePattern = new RegExp(`^${UUID_V4_PATTERN}(?![\\s\\S])$`);

const compare = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

function compareRefs(a, b) {
  return compare(a.ref.namespace, b.ref.namespace)
    || compare(a.ref.kind, b.ref.kind) || compare(a.ref.id, b.ref.id);
}

/** Loader wrapper aliases/indexes are not authored content (projection v1). */
function authoritativeEntry(entry, expectedId) {
  if (!entry?.record || entry.record.id !== expectedId) {
    throw new CapturedInputError('captured record identity differs from typed reference');
  }
  const source = { file: entry.file, record: entry.record };
  if (Object.hasOwn(entry, 'body')) source.body = entry.body;
  return source;
}

function authoritativeRecord({ ref, entry }) {
  return { ref, entry: authoritativeEntry(entry, ref.id) };
}

/**
 * Hash complete captured documents, including source locators and governance.
 * Registry callers supply registry.document, never its derived Map indexes.
 * Records project the current loader's file, full authored record and parsed
 * body. Optional wrapper notation and duplicate identity aliases are excluded;
 * undefined inside authored content is still invalid. The parsed body may have
 * loader-normalized line endings; these are not original file-byte digests.
 * This does not establish store coverage, approval, or original-source trust.
 * @param {{namespace:string, records:Iterable<{ref:object,entry:object}>, registry:object}} input
 */
export function fingerprintCapturedInputs({ namespace, records, registry }) {
  if (typeof namespace !== 'string' || !namespacePattern.test(namespace)
    || registry?.namespace !== namespace) throw new CapturedInputError('captured namespace must match registry namespace');
  const sorted = [...records];
  for (const { ref } of sorted) {
    if (ref?.namespace !== namespace) throw new CapturedInputError('record namespace differs from captured namespace');
    if (!['knowledge', 'ontology', 'decision'].includes(ref.kind)
      || !parseCanonicalId(ref.kind, ref.id).ok) throw new CapturedInputError('invalid captured record identity');
  }
  sorted.sort(compareRefs);
  for (let i = 1; i < sorted.length; i += 1) {
    if (compareRefs(sorted[i - 1], sorted[i]) === 0) throw new CapturedInputError('duplicate captured record identity');
  }
  return {
    version: 1, consistency: 'captured-model', namespace,
    inputs: { records: digest(sorted.map(authoritativeRecord)), registry: digest(registry) },
  };
}

/**
 * Bind input digests to the consumer's versions, revisions and effective options.
 * Include injected today only when rendering freshness; never read the clock.
 * @param {object} metadata JSON metadata before adding the fingerprint field
 * @returns {string} SHA256 of canonical JSON (no trailing newline)
 */
export function fingerprintMetadata(metadata) {
  if (Object.hasOwn(metadata, 'fingerprint')) {
    throw new CapturedInputError('fingerprint metadata must not include its own fingerprint');
  }
  return digest(metadata);
}

/**
 * Capture both explicitly supplied identity universes. Callers must obtain
 * all-view proposals through the real iterator; this helper cannot establish
 * store coverage or turn an unavailable collection into an empty capture.
 * The query wrapper separately binds view/options and real governance evidence.
 */
export function fingerprintQueryInputs({ namespace, records, proposals, registry }) {
  if (proposals == null || typeof proposals[Symbol.iterator] !== 'function') {
    throw new CapturedInputError('query capture requires an explicit proposals iterable');
  }
  const canonical = fingerprintCapturedInputs({ namespace, records, registry });
  const sorted = [...proposals];
  for (const { proposalRef } of sorted) {
    if (proposalRef?.namespace !== namespace) throw new CapturedInputError('proposal namespace differs from captured namespace');
    if (!['knowledge', 'ontology', 'decision'].includes(proposalRef.kind)
      || !parseProposalKey(proposalRef.kind, proposalRef.key).ok) throw new CapturedInputError('invalid captured proposal identity');
  }
  const compareProposals = (a, b) => compare(a.proposalRef.namespace, b.proposalRef.namespace)
    || compare(a.proposalRef.kind, b.proposalRef.kind) || compare(a.proposalRef.key, b.proposalRef.key);
  sorted.sort(compareProposals);
  for (let i = 1; i < sorted.length; i += 1) {
    if (compareProposals(sorted[i - 1], sorted[i]) === 0) throw new CapturedInputError('duplicate captured proposal identity');
  }
  const projected = sorted.map(({ proposalRef, entry }) => ({
    proposalRef, entry: authoritativeEntry(entry, proposalRef.key),
  }));
  return {
    ...canonical, version: 2, inputScope: 'records-and-proposals',
    inputs: { ...canonical.inputs, proposals: digest(projected) },
  };
}
