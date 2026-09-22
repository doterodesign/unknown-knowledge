/** Fixed K/O/D policy; selected preflight applicability is explicit and versioned. */
import { canonicalSha256 } from './canonical-json.js';
import { isDeepStrictEqual as same } from 'node:util';
import { isIdentityUuid, parseCanonicalId } from './record-identity.js';

const descriptor = {
  id: 'typed-record-promotion-v3', version: 3, recordKinds: ['ontology', 'knowledge', 'decision'],
  selectedPreflight: { ontology: 'concepts', knowledge: 'leaves', decision: 'not-applicable-no-selected-decision-api' },
  subjectAuthority: 'unchanged-or-absent-both', absentAuthorityAssignments: ['unknown', 'known-empty'],
  presentAuthorityRequired: ['reach', 'subjectTree', 'representativeReplays'],
  stores: 'actual-present-union-preserved', subjectPolicy: 'current',
  views: ['current', 'all'], expansions: ['direct', 'self-and-descendants'],
  ranking: { profile: 'id-v1' }, possibleMatches: true,
  baseline: ['all', 'none', 'subjects-present', 'not-subjects-present'], unary: ['assigned', 'not-assigned'],
  pairs: { selection: 'adjacent-canonical-ids-no-wrap', forms: ['and', 'or', 'and-not-right', 'and-not-left'] },
  scope: 'finite-representative-queries-not-exhaustive-use-discovery',
};
export function typedPromotionPolicy() { return structuredClone(descriptor); }
export function typedPromotionPolicyRef() { return { id: descriptor.id, version: descriptor.version, digest: canonicalSha256(descriptor) }; }

/** The sole successful inapplicability branch; it never waives other checks. */
export function typedPromotionPreflightSatisfied(value, selectedRefs) {
  if (value?.recordKind === 'decision') {
    const refs = value.promotion?.createdRefs;
    const valid = (rows) => Array.isArray(rows) && rows.length > 0
      && rows.every((ref) => ref?.kind === 'decision' && isIdentityUuid(ref.namespace)
        && parseCanonicalId('decision', ref.id).ok
        && same(ref, { namespace: ref.namespace, kind: 'decision', id: ref.id }))
      && new Set(rows.map(canonicalSha256)).size === rows.length;
    // The allocator sorts by proposal key; the reviewed request retains its own order.
    return valid(refs) && valid(selectedRefs)
      && same(refs.map(canonicalSha256).sort(), selectedRefs.map(canonicalSha256).sort())
      && same(value.checks?.preflight, { status: 'not-applicable' })
      && same(value.preflight, { status: 'not-applicable', recordKind: 'decision',
        selectedIds: selectedRefs.map(({ id }) => id), today: null, result: null });
  }
  return ['ontology', 'knowledge'].includes(value?.recordKind)
    && same(value.checks?.preflight, { status: 'passed' })
    && value.preflight?.status === 'passed' && value.preflight.recordKind === value.recordKind;
}
