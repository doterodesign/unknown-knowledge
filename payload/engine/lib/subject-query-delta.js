/** Internal comparison of actual query outputs; callers own capture validation. */
import { canonicalSha256 } from './canonical-json.js';

const object = (value) => value !== null && typeof value === 'object'
  && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;

function exactOutput(result, possible) {
  if (result.outputVersion !== 2 || result.status !== 'complete' || result.coverage?.evaluationComplete !== true || result.coverage?.rankComplete !== true
    || result.coverage.pageTruncated !== false || result.coverage.explanationsComplete !== true
    || !object(result.groups) || !object(result.counts)) return false;
  return result.query.stores.every((store) => {
    const tally = result.counts[store];
    const group = result.groups[store];
    return tally?.basis === 'exact' && Array.isArray(group?.strict) && group.strict.length === tally.strict
      && (!possible || (Array.isArray(group?.possible) && group.possible.length === tally.possible));
  });
}

const identity = (row) => row.ref ? { ref: structuredClone(row.ref) } : { proposalRef: structuredClone(row.proposalRef) };
const identityKey = (row) => {
  const ref = row.ref ?? row.proposalRef;
  return JSON.stringify([ref.namespace, ref.kind, row.ref ? 'record' : 'proposal', ref.id ?? ref.key]);
};
function categoryDelta(before, after, category) {
  const collect = (result) => new Map(Object.values(result.groups).flatMap((group) => group[category])
    .map((row) => [identityKey(row), row]));
  const old = collect(before);
  const next = collect(after);
  const delta = { status: 'exact', added: [], removed: [], retained: [], rankChanges: [] };
  for (const key of [...new Set([...old.keys(), ...next.keys()])].sort(compare)) {
    const a = old.get(key); const b = next.get(key);
    const ref = identity(a ?? b);
    if (!a) delta.added.push(ref);
    else if (!b) delta.removed.push(ref);
    else {
      delta.retained.push(ref);
      if (canonicalSha256(a.rank) !== canonicalSha256(b.rank)) {
        delta.rankChanges.push({ ...ref, before: structuredClone(a.rank), after: structuredClone(b.rank) });
      }
    }
  }
  return delta;
}

/**
 * Compare actual full query results. Callers authenticate contexts, execute the
 * same authored query/options, and own inventory policy and resource limits.
 * This internal primitive does not establish capture authenticity or coverage
 * beyond the returned query contracts. Counts-only results are unavailable.
 */
export function compareSubjectQueryCandidates({ before, after, possibleMatches }) {
  const requestedPossible = possibleMatches;
  const reasons = ['before', 'after'].filter((side) => !exactOutput(side === 'before' ? before : after, requestedPossible))
    .map((side) => ({ side, code: 'full-query-output-unavailable' }));
  const unavailable = () => ({ status: 'unavailable', added: null, removed: null, retained: null, rankChanges: null, reasons });
  return { status: reasons.length ? 'unavailable' : 'exact',
    strict: reasons.length ? unavailable() : categoryDelta(before, after, 'strict'),
    possible: !requestedPossible ? { status: 'not-requested' }
      : reasons.length ? unavailable() : categoryDelta(before, after, 'possible') };
}
