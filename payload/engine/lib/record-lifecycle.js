/** Lifecycle-only record classification; no source, freshness or approval claim. */
import { isIdentityUuid, RECORD_KINDS, recordIdentityMatches, proposalIdentityMatches } from './record-identity.js';

const CURRENT_LIFECYCLE = Object.freeze({
  knowledge: Object.freeze({ verified: true, draft: false, proposed: false }),
  ontology: Object.freeze({ active: true, draft: false, proposed: false, deprecated: false }),
  decision: Object.freeze({ accepted: true, addressed: true, proposed: false, archived: false, rejected: false, superseded: false }),
});

/** Exact shared Knowledge stage field; missing or non-string is unknown. */
export function leafStage(record) {
  const stage = record?.facets?.stage;
  return typeof stage === 'string' ? stage : null;
}

export class RecordLifecycleError extends Error {
  constructor() {
    super('Lifecycle classification requires a coherent typed original record row.');
    this.name = 'RecordLifecycleError';
    this.code = 'invalid-record';
  }
}

/**
 * Classify an original canonical/proposal iterator row. Unsupported canonical
 * lifecycle is unknown, never false; an authored proposal is unpublished even
 * if its payload asserts an effective status. Structural schema validity is
 * the loader's separate responsibility. No allocation or approval is inferred.
 * @param {{ref?:object, proposalRef?:object, entry:object}} row
 * @returns {{basis:'lifecycle-only', state:'effective'|'non-effective'|'unknown'|'unpublished', lifecycle:string|null}}
 */
export function recordLifecycleState(row) {
  if (row === null || typeof row !== 'object' || Array.isArray(row)) throw new RecordLifecycleError();
  const canonical = Object.hasOwn(row, 'ref');
  const proposal = Object.hasOwn(row, 'proposalRef');
  if (canonical === proposal) throw new RecordLifecycleError();
  const ref = canonical ? row.ref : row.proposalRef;
  if (!ref || !isIdentityUuid(ref.namespace) || !RECORD_KINDS.includes(ref.kind)
      || !(canonical ? recordIdentityMatches(ref.kind, ref.id, row.entry)
        : proposalIdentityMatches(ref.kind, ref.key, row.entry))) throw new RecordLifecycleError();
  const raw = ref.kind === 'knowledge' ? leafStage(row.entry.record) : row.entry.record.status;
  const lifecycle = typeof raw === 'string' ? raw : null;
  const policy = CURRENT_LIFECYCLE[ref.kind];
  const state = proposal ? 'unpublished'
    : lifecycle === null || !Object.hasOwn(policy, lifecycle) ? 'unknown'
      : policy[lifecycle] ? 'effective' : 'non-effective';
  return { basis: 'lifecycle-only', state, lifecycle };
}
