/**
 * Deterministic Verdict computation (UCS-947, D-011).
 *
 * Joins the validators to a freshly loaded Store. The library owns the
 * store-wide degradation decision for both concepts and leaves, including
 * their promotion and time rules. No results are cached and no logs are
 * written; callers retain rendering, logging, and exit-code handling.
 */
import { isPrePromotionStatus, leafIdentityOf, leafStage, selectConcepts, selectLeaves, storeHealth } from './load-stores.js';
import { compare } from './validate-record.js';
import { runChecks } from '../commands/validate.js';
import { validateValues } from '../commands/validate-values.js';
import { TIME_VERDICTS, timeVerdict } from './time-verdicts.js';

/**
 * Compute requested Verdicts using the loader's single health model.
 * Empty or omitted selections request store health only, never all records.
 * On an unhealthy Store every requested id degrades to unknown, including
 * ids that could not load. Healthy Stores reject unknown ids through the
 * loader's selectors. Dates are injected; the wall clock is never read.
 *
 * @param {object} model freshly loaded Store; reload after Store edits
 * @param {object} options
 * @param {string} options.repoRoot repo root used to resolve source pointers
 * @param {string[] | null} [options.concepts] normalized concept ids
 * @param {string[] | null} [options.leaves] normalized leaf accession ids
 * @param {string | null} [options.today] injected ISO calendar date
 * @returns {{ health: ReturnType<typeof storeHealth>, storeVerdict: string, verdicts: object[], leafVerdicts: object[] }}
 */
export function computeVerdicts(model, { repoRoot, concepts = null, leaves = null, today = null }) {
  const health = storeHealth(model);
  const verdicts = concepts?.length
    ? (health.ok ? computeConceptVerdicts(model, concepts, repoRoot) : degradeAll(model, concepts, health.errorCount))
    : [];
  const leafVerdicts = leaves?.length
    ? (health.ok ? computeLeafVerdicts(model, leaves, repoRoot, today) : degradeAllLeaves(model, leaves, today, health.errorCount))
    : [];
  return { health, storeVerdict: health.ok ? 'trusted' : 'unknown', verdicts, leafVerdicts };
}

/**
 * Stable next-action codes, shared by JSON and human output (UCS-954).
 * Conduct is keyed by these codes in protocol/AGENTS.md, never rendered here.
 * Changing a code is a breaking CLI contract change (D-021).
 */
const NEXT_ACTIONS = Object.freeze({
  trusted: 'proceed',
  quarantined: 'repair-evidence',
  'unknown-status': 'review-status',
  'unknown-stage': 'review-stage',
  'unknown-store': 'repair-store',
  // The Time facet (UCS-1150). A stale leaf is not broken and its checks did
  // run — the action is re-verification against the sources, which is a
  // steward's job rather than a repair.
  stale: 'reverify-leaf',
  // A leaf that asked to be governed by time and gave nothing to measure from.
  // Its verdict can only ever be `undated`, so the fix is the missing field.
  'unknown-undated': 'supply-verified-date',
  // No --today was injected, so no freshness verdict was computed at all.
  'unknown-skipped': 'supply-evaluation-date',
});

// ---------------------------------------------------------- verdict joining

/**
 * Join both validators' results to the requested concepts — one verdict per
 * concept. Only called on a healthy store (the store-wide degradation path
 * never reaches the validators: their checks would not have run).
 */
function computeConceptVerdicts(model, ids, repoRoot) {
  const structural = runChecks(model, repoRoot);
  const values = validateValues(model, null, repoRoot); // full run; attribution below

  return selectConcepts(model, ids).map(({ id, record }) => {
    const status = record.status ?? null;
    // Evidence: error-severity findings from either validator, plus value
    // hard errors (unknown-kind, source-missing, …) — all attributable to
    // this concept, all reasons not to trust it (quarantine, per §4).
    const evidence = [
      ...structural
        .filter((f) => f.id === id && f.severity === 'error')
        .map(({ code, file, path, message }) => ({ check: 'structural', code, severity: 'error', file, path, message })),
      ...values.findings
        .filter((f) => f.concept === id && f.severity === 'error')
        .map(({ code, file, path, source, value, message }) => ({ check: 'value', code, severity: 'error', file, path, ...(source ? { source } : {}), ...(value !== undefined ? { value } : {}), message })),
      ...values.hardErrors
        .filter((e) => e.concept === id)
        .map(({ code, file, path, source, message }) => ({ check: 'value', code, severity: 'hard-error', file, path, ...(source ? { source } : {}), message })),
    ].sort((a, b) => compare(a.check, b.check) || compare(a.path ?? '', b.path ?? '')
      || compare(a.code, b.code) || compare(a.value ?? '', b.value ?? ''));

    if (evidence.length) {
      return {
        concept: id, status, verdict: 'quarantined',
        reason: `${evidence.length} error-severity check result(s) attributable to this concept — see evidence`,
        'next-action': NEXT_ACTIONS.quarantined,
        evidence,
      };
    }
    if (isPrePromotionStatus(status)) {
      return {
        concept: id, status, verdict: 'unknown',
        reason: `status "${status}" — structural checks only (§3.5); the value checks were skipped, so nothing certifies the claims`,
        'next-action': NEXT_ACTIONS['unknown-status'],
        evidence,
      };
    }
    return {
      concept: id, status, verdict: 'trusted',
      reason: 'every attributable check ran clean this run',
      'next-action': NEXT_ACTIONS.trusted,
      evidence,
    };
  }).sort((a, b) => compare(a.concept, b.concept));
}

/**
 * Leaf verdicts (UCS-1149) — the same three verdicts, computed for leaves.
 *
 * A leaf earns a verdict on the same two questions a concept does, asked of the
 * evidence a leaf actually has:
 *
 *   quarantined  error-severity structural findings attributable to this leaf —
 *                an unminted facet value, a citation with no authority tier, a
 *                cross-reference that does not resolve. There is no value-check
 *                half: value checks diff a descriptor against source code, and
 *                a leaf carries no descriptor. Its evidence is structural only,
 *                which is stated rather than silently implied by an empty list.
 *   unknown      `facets.stage` is pre-promotion — the SAME predicate the
 *                concept path calls, so a draft leaf and a draft concept cannot
 *                be verdicted differently by two surfaces that both think they
 *                are asking one question. This is preflight's half of the
 *                draft-stage contract; the resolver's half is the downrank.
 *   trusted      neither.
 *
 * Attribution is by the finding's `id`, which for a leaf is its identity — its
 * accession (UCS-1142/1147) — so a leaf is matched by the same string the
 * validator names it by, not by a second guess at its id space.
 */
function computeLeafVerdicts(model, ids, repoRoot, today) {
  const structural = runChecks(model, repoRoot);

  return selectLeaves(model, ids).map((entry) => {
    const id = entry.identity;
    const stage = leafStage(entry.record);
    const time = timeVerdict(entry.record, today);
    const base = { leaf: id, stage, time };
    const evidence = structural
      .filter((f) => f.id === id && f.severity === 'error')
      .map(({ code, file, path, message }) => ({ check: 'structural', code, severity: 'error', file, path, message }))
      .sort((a, b) => compare(a.path ?? '', b.path ?? '') || compare(a.code, b.code));

    if (evidence.length) {
      return {
        ...base, verdict: 'quarantined',
        reason: `${evidence.length} error-severity check result(s) attributable to this leaf — see evidence`,
        'next-action': NEXT_ACTIONS.quarantined,
        evidence,
      };
    }
    if (isPrePromotionStatus(stage)) {
      return {
        ...base, verdict: 'unknown',
        reason: `stage "${stage}" — this leaf is pre-promotion, so no moderator has certified its citations and nothing vouches for the claim`,
        'next-action': NEXT_ACTIONS['unknown-stage'],
        evidence,
      };
    }
    // The Time facet (UCS-1150). Asked AFTER stage, because a leaf that no
    // moderator has promoted is unverified for a reason that outranks its age:
    // re-dating a draft would not make it trusted. A promoted leaf, though, is
    // exactly the one whose freshness is the remaining question.
    //
    // `stale` is its OWN verdict class rather than a mapping onto `unknown` or
    // `quarantined`, and the choice is the ticket's ("trusted/stale verdicts").
    // The existing three each mean something a stale leaf is not: nothing about
    // it is broken (quarantined), and its checks did run and returned a
    // definite answer (unknown). Folding it into either would tell a steward to
    // do the wrong thing — repair evidence that is fine, or pass a flag they
    // already passed — and would make the leaf-verdicts surface dishonest about
    // what it computed. It gates like the others: only trusted reads as clean.
    if (time.stale) {
      return {
        ...base, verdict: 'stale',
        reason: time.reason,
        'next-action': NEXT_ACTIONS.stale,
        evidence,
      };
    }
    // A leaf under time governance whose freshness could not be computed is
    // NOT trusted. Two ways that happens, and they need different actions: the
    // leaf is missing its date (`undated`), or this run never injected one
    // (`skipped`). Both are unknown-class — a check that never ran is never a
    // silent pass — and each says which fix applies.
    if (time.verdict === TIME_VERDICTS.UNDATED || time.verdict === TIME_VERDICTS.SKIPPED) {
      return {
        ...base, verdict: 'unknown',
        reason: time.reason,
        'next-action': NEXT_ACTIONS[`unknown-${time.verdict}`],
        evidence,
      };
    }
    return {
      ...base, verdict: 'trusted',
      reason: 'every attributable check ran clean this run',
      'next-action': NEXT_ACTIONS.trusted,
      evidence,
    };
  }).sort((a, b) => compare(a.leaf, b.leaf));
}

/**
 * Store-wide failure: no check ran — every requested LEAF verdict is unknown.
 *
 * Ids are resolved through `leafIdentityOf`, the same lookup the healthy path's
 * `selectLeaves` uses, so a leaf that IS in the store reports under its own
 * identity whether the store loaded clean or not. An id that resolves to
 * nothing keys on the caller's spelling instead — see below.
 */
function degradeAllLeaves(model, ids, today, errors) {
  // De-duplicated by IDENTITY, like selectLeaves: naming one leaf twice is one
  // leaf, and emitting two verdict rows for it would have a caller reconciling
  // two answers about a single record. An
  // id that resolves to nothing keys on the caller's spelling instead — on a
  // store this broken the leaf may simply have failed to load, so echoing back
  // what was asked for is more honest than inventing an identity, and two
  // distinct unresolved ids stay two rows.
  const seen = new Set();
  const out = [];
  for (const id of ids) {
    const identity = leafIdentityOf(model, id) ?? id;
    if (seen.has(identity)) continue;
    seen.add(identity);
    const record = model.leaves.get(identity)?.record;
    out.push({
      leaf: identity, stage: leafStage(record),
      // The time verdict travels on the degraded path too, computed from
      // whatever loaded. A key that vanished on a broken store would make a
      // consumer's presence check mean two things at once.
      time: timeVerdict(record, today),
      verdict: 'unknown',
      reason: `store-wide failure: the loader reported ${errors} error(s) — no check ran for any leaf (single health model, PRD §4)`,
      'next-action': NEXT_ACTIONS['unknown-store'],
      evidence: [],
    });
  }
  return out.sort((a, b) => compare(a.leaf, b.leaf));
}

/** Store-wide failure: no check ran — every requested verdict is unknown. */
function degradeAll(model, ids, errors) {
  return ids.map((id) => ({
    concept: id, status: model.concepts.get(id)?.record.status ?? null, verdict: 'unknown',
    reason: `store-wide failure: the loader reported ${errors} error(s) — no check ran for any concept (single health model, PRD §4)`,
    'next-action': NEXT_ACTIONS['unknown-store'],
    evidence: [],
  })).sort((a, b) => compare(a.concept, b.concept));
}
