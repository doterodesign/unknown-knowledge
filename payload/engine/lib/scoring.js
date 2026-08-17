/**
 * The resolver's scoring table (UCS-1152) — every signal that moves a score,
 * declared in one place, with the number it is worth.
 *
 * Extracted BEFORE the query-decomposition signals were added, on the survey's
 * prefactor advice, and the ordering matters: scoring that lives inline in the
 * matcher grows a new arm per signal, and by the fourth signal nobody can say
 * what a score of 7 is made of without reading four functions. A table says it
 * in one screen, and `explain()` turns any score back into the signals that
 * produced it — which is the acceptance criterion "ranking is reproducible from
 * the output", enforced by construction rather than by a comment asking future
 * authors to remember.
 *
 * TWO FAMILIES, deliberately kept apart:
 *
 *   CONCEPT_SIGNALS   the pre-1152 ladder — a concept scores on the HIGHEST
 *                     rung it reaches and rungs never add up. Unchanged numbers
 *                     (100/80/60/50/40, -30 for draft), because published
 *                     concept scores are a ranking consumers already depend on
 *                     and this ticket had no reason to move them.
 *   LEAF_SIGNALS      the structured joins a LEAF scores on, and these DO add
 *                     up. A leaf reached by both a declared operation and a
 *                     declared concept is more strongly the answer than one
 *                     reached by either alone, and additive scoring is the only
 *                     shape that says so.
 *
 * That the two families disagree about adding is the substantive modelling
 * claim here, not an inconsistency. A concept match is one question asked five
 * ways — "is this the term the user typed" — so the best answer wins and a
 * second, weaker phrasing of the same question adds nothing. A leaf's joins are
 * INDEPENDENT questions — does it declare this operation, this concept, does
 * its term text match — and independent evidence accumulates.
 *
 * The leaf weights (3/2/1) are pinned: their ordering is the behavior the
 * goldens mirror, and the ordering they encode is the defensible part — a
 * DECLARED operation is
 * the strongest join (the leaf's author named the verb this ask is about), a
 * declared concept edge is next (curatorial, survives a rename), and term text
 * is weakest (it is exactly as reliable as two authors choosing the same
 * words). Absolute magnitudes matter only relative to each other.
 */

/**
 * The concept ladder — highest rung reached wins, rungs never add (KK-06).
 *
 * @type {Readonly<Record<string, number>>}
 */
export const CONCEPT_SIGNALS = Object.freeze({
  'exact-term': 100,
  'exact-alias': 80,
  'term-match': 60,
  'alias-match': 50,
  'summary-match': 40,
});

/**
 * The structured joins a leaf scores on — these ADD (UCS-1152).
 *
 * @type {Readonly<Record<string, number>>}
 */
export const LEAF_SIGNALS = Object.freeze({
  // The leaf declares the operation the query's verb resolved to. The strongest
  // join in the table because it needed no noun guessing: the registry turned
  // "add a sport" into `add-sport`, and the leaf had already declared it.
  operation: 3,
  // The leaf declares the concept the query's noun resolved to — the structural
  // edge from UCS-1151, a curatorial claim that survives the concept being
  // renamed.
  concept: 2,
  // The leaf's `terms` text matched query tokens. Weakest, and it is meant to
  // be: it fires exactly when two authors happened to choose the same words.
  term: 1,
});

/**
 * The draft/proposed downrank applied to a CONCEPT score (§3.5).
 *
 * A subtraction with a floor of 1, never a filter: a draft concept that matches
 * is still the best answer when it is the only answer, and hiding it would send
 * the reader to invent one. Leaves take their pre-promotion demotion through
 * the `downranked` ordering instead — see `demotionsOf` in the resolver — because
 * a leaf's stage travels with a reason and sorts below rather than subtracting.
 */
export const STATUS_DOWNRANK = 30;

/** Concept statuses the downrank applies to. */
const DOWNRANKED_STATUSES = Object.freeze(['draft', 'proposed']);

/**
 * A concept's score: the rung it reached, less the draft downrank if it is one.
 *
 * Unchanged from the pre-1152 inline version, and pinned by the existing
 * goldens — the extraction moved this arithmetic, it did not renegotiate it.
 *
 * @param {string} match the rung name, a key of CONCEPT_SIGNALS
 * @param {unknown} status the concept's declared status
 * @returns {number}
 */
export function conceptScore(match, status) {
  const base = CONCEPT_SIGNALS[match];
  return DOWNRANKED_STATUSES.includes(status) ? Math.max(1, base - STATUS_DOWNRANK) : base;
}

/**
 * Total one leaf's structured-join signals, and keep the working.
 *
 * Returns BOTH the number and the signals that made it, because a score a
 * reader cannot decompose is a ranking they cannot check. The acceptance
 * criterion is literally "ranking is reproducible from the output": every
 * published leaf carries its `signals`, so `sum(signal.score)` must equal the
 * published `score` — an invariant a test can assert rather than a claim a
 * comment makes.
 *
 * Signals arrive in join order and are NOT re-sorted here: the caller emits
 * them operation-first, concept-next, term-last, which is descending weight, so
 * the strongest reason a leaf surfaced reads first. Sorting by name would put
 * `concept` above `operation` and bury the lead.
 *
 * @param {Array<{signal: string, via: string}>} signals the joins that fired
 * @returns {{score: number, signals: Array<{signal: string, via: string, score: number}>}}
 */
export function leafScore(signals) {
  const scored = signals.map(({ signal, via }) => ({
    signal,
    via,
    // An unknown signal scores 0 rather than NaN. `undefined + n` is NaN, and a
    // NaN score sorts unpredictably AND serializes to JSON as `null`, so one
    // typo in a signal name would silently unrank a leaf and publish a null
    // where every consumer reads a number.
    score: LEAF_SIGNALS[signal] ?? 0,
  }));
  return { score: scored.reduce((total, s) => total + s.score, 0), signals: scored };
}

/**
 * The published scoring table — the engine's own answer to "where do these
 * numbers come from", carried in the payload rather than documented elsewhere.
 *
 * Emitted on every query payload so a consumer reproducing a ranking never has
 * to hard-code the weights it is checking against. A table that lives only in
 * source is one a downstream reader has to guess at or vendor a copy of, and a
 * vendored copy is the thing that goes stale the first time a weight moves.
 *
 * @returns {{concept: Record<string, number>, leaf: Record<string, number>, 'status-downrank': number}}
 */
export const scoringTable = () => ({
  concept: { ...CONCEPT_SIGNALS },
  leaf: { ...LEAF_SIGNALS },
  'status-downrank': STATUS_DOWNRANK,
});
