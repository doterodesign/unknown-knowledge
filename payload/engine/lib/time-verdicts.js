/**
 * The Time facet (UCS-1150) — `verified` + `volatility`, and the one function
 * that turns them into a trusted/stale verdict.
 *
 * Freshness made visible. A leaf records WHEN it was last verified and HOW FAST
 * its subject moves; the engine turns those two facts into a verdict every
 * projection can read. A fast-growing store cannot rot silently, because an
 * agent never has to judge at query time whether a world-fact from eighteen
 * months ago still holds — the verdict already said.
 *
 * ONE implementation, deliberately. Three surfaces demote on this today (the
 * resolver's ranking, preflight's leaf verdicts, the validator's missing-date
 * finding) and the derived-layer trees (UCS-1158) plus the resolution pipeline
 * (UCS-1152) inherit it. That is exactly the shape that goes wrong when each
 * surface computes its own: a leaf ranked stale by the resolver and verdicted
 * trusted by preflight is one record wearing two answers, and the disagreement
 * surfaces as a bug in whichever surface the reader happened to trust. The
 * shared `isPrePromotionStatus` predicate exists for the same reason one rung
 * up, and this is the time facet's half of that discipline.
 *
 * THRESHOLDS ARE PINNED, not configurable. `stable` stales after 365 days,
 * `volatile` after 90, `static` never. A per-store threshold would make "stale"
 * mean something different in every repo, and the verdict's whole value is that
 * an agent reading it needs no local knowledge to act on it. Changing a number
 * here is an engine release with a Decisions entry behind it, which is the
 * governance the audit's `--stale-days` flag deliberately does NOT have (that
 * one is advisory and never demotes anything).
 *
 * THE DATE IS INJECTED, never read from the wall clock (D-012, PRD §5). Without
 * an injected `today` there is no verdict to compute, and the answer is
 * `skipped` — a distinct verdict class that every surface must print, never a
 * quiet `trusted`. A check that never ran is a blocking defect, never a silent
 * pass; the audit's `stale-last-verified` established the rule and this follows
 * it exactly, so baseline finding-set diffing survives.
 */
import { daysBetween, isCalendarDate } from './iso-date.js';

/** The leaf front-matter field naming when this leaf was last verified. */
export const VERIFIED_FIELD = 'verified';

/** The leaf front-matter field naming how fast this leaf's subject moves. */
export const VOLATILITY_FIELD = 'volatility';

/**
 * How long a leaf stays fresh, per volatility class — the pinned thresholds.
 *
 * `static` is `Infinity` rather than absent: a static leaf is IN the time
 * facet and its verdict is that it never stales, which is a different claim
 * from a leaf the facet does not govern at all. Modelling it as a missing row
 * would collapse those two into one and lose the distinction the schema draws.
 *
 * Read as `age > limit`: a `stable` leaf verified exactly 365 days ago is
 * fresh, and stales on day 366. The boundary is pinned that way in both
 * directions by golden fixtures, because "more than a year old" and "a year or
 * more old" differ by exactly one day and nothing in the phrase says which.
 *
 * NULL-PROTOTYPE, and that is a correctness requirement rather than a style
 * preference. A plain object literal inherits `toString`, `constructor`,
 * `valueOf` and the rest of Object.prototype, so `'toString' in LIMITS` is
 * TRUE and `LIMITS['toString']` is a native function. A leaf spelling
 * `volatility: toString` would then be treated as a known class whose limit is
 * a function — and `age > someFunction` is always false, so a leaf verified in
 * 2020 would read `trusted`, undemoted, with `limit` silently dropped from the
 * JSON (JSON.stringify omits function values) and `[native code]` leaking into
 * the reason a human reads.
 *
 * The schema enum already refuses such a leaf, so no VALIDATED store reaches
 * it. That is not enough: the resolver deliberately never gates on store health
 * — a lookup runs on whatever loaded (§4) — so it is precisely the surface that
 * can be asked to publish a verdict on a leaf no check approved. Fixing it at
 * the table rather than at each call site means a future consumer of this
 * module cannot reintroduce the bug by reaching for `in` or `[]` itself.
 *
 * @type {Readonly<Record<string, number>>}
 */
export const VOLATILITY_LIMITS = Object.freeze(Object.assign(Object.create(null), {
  static: Infinity,
  stable: 365,
  volatile: 90,
}));

/** The closed volatility vocabulary, sorted — the schema enum's single source. */
export const VOLATILITY_CLASSES = Object.freeze(Object.keys(VOLATILITY_LIMITS).sort());

/** Verdict classes. `skipped` is one of them, and that is the point. */
export const TIME_VERDICTS = Object.freeze({
  TRUSTED: 'trusted',
  STALE: 'stale',
  SKIPPED: 'skipped',
  EXEMPT: 'exempt',
  UNDATED: 'undated',
});

/**
 * A leaf's declared volatility class, or null when it declares none.
 *
 * The single reader of the `volatility` spelling, for the reason `leafStage` is
 * the single reader of `facets.stage`: a later move of the field must not leave
 * one surface silently reading `undefined` and quietly promoting a leaf the
 * defect should have held back.
 *
 * A value outside the closed vocabulary reads as null rather than travelling
 * on. The schema has already refused it, and handing an unknown class to the
 * threshold table would produce `undefined > n` — which is `false`, i.e. a
 * silent `trusted` for a leaf whose volatility nobody can interpret.
 *
 * Membership is an OWN-property test, never `in`. The table is null-prototype
 * so `in` would be safe today, but this is the gate every unknown value passes
 * through and it should be correct on its own terms rather than by depending on
 * how the table above happens to be built — an inherited name like `toString`
 * reading as a known class is the one failure this function exists to prevent.
 *
 * @param {object} record a leaf's front-matter record
 * @returns {string|null}
 */
export function leafVolatility(record) {
  const volatility = record?.[VOLATILITY_FIELD];
  return typeof volatility === 'string' && Object.prototype.hasOwnProperty.call(VOLATILITY_LIMITS, volatility)
    ? volatility
    : null;
}

/**
 * A leaf's declared verified date, or null when it declares none.
 *
 * Null covers a malformed date as well as an absent one — `2026-02-30` is not a
 * day, and measuring an age from it would report a number nobody's calendar
 * agrees with (the defect `isCalendarDate` was written for, UCS-957). The
 * schema's pattern catches the SHAPE; this catches the calendar, and the
 * validator reports the difference so a malformed date is never merely ignored.
 *
 * @param {object} record a leaf's front-matter record
 * @returns {string|null}
 */
export function leafVerified(record) {
  const verified = record?.[VERIFIED_FIELD];
  return isCalendarDate(verified) ? verified : null;
}

/**
 * The time verdict for one leaf — the whole facet, in one function.
 *
 * Returns a verdict object, never a bare boolean, because every surface has to
 * show its WORK: the ticket's demand is that a demotion is never silent, and a
 * `true` carries no reason a reader could act on. The shape is one stable set
 * of keys whatever the verdict, so a consumer never needs a presence check to
 * tell "not stale" from "this engine predates the time facet":
 *
 *   verdict     trusted | stale | skipped | exempt | undated
 *   stale       the boolean every ranking sorts on — `true` ONLY for `stale`,
 *               so a skipped or exempt leaf is never demoted by accident
 *   volatility  the declared class, or null
 *   verified    the declared date, or null
 *   age         whole days from `verified` to `today`, or null when uncomputed
 *   limit       the pinned threshold for this class, or null
 *   reason      why this verdict, in words a reader can act on
 *
 * The five verdicts, and why each is its own class rather than folded into
 * another:
 *
 *   skipped   no `today` was injected. NOT `trusted`: the check did not run,
 *             and reporting a leaf as fresh because nobody asked what day it is
 *             would be the silent pass this rule exists to prevent (D-012).
 *   exempt    the leaf declares no volatility, so the store has not placed it
 *             under time governance at all. Distinct from `trusted`, which is a
 *             leaf the facet governs and finds fresh — collapsing them would
 *             report an ungoverned leaf as having passed a check it never sat.
 *   undated   the leaf declares a volatility but no usable `verified` date, so
 *             its age is unknowable. NOT stale (nothing measured it) and not
 *             trusted (nothing vouches for it): the validator raises the
 *             missing-date finding, and this verdict is what every projection
 *             says meanwhile. A leaf whose freshness cannot be computed must
 *             not read as fresh.
 *   stale     age exceeds the pinned limit for its class.
 *   trusted   the check ran, and the leaf is inside its limit.
 *
 * @param {object} record a leaf's front-matter record
 * @param {string|null} today the injected date (YYYY-MM-DD), or null
 * @returns {{verdict: string, stale: boolean, volatility: string|null, verified: string|null, age: number|null, limit: number|null, reason: string}}
 */
export function timeVerdict(record, today) {
  const volatility = leafVolatility(record);
  const verified = leafVerified(record);
  // `Infinity` is not JSON: `JSON.stringify(Infinity)` is `null`, silently. So
  // static's limit is published as an explicit null rather than travelling as
  // one by accident — the two are the same bytes, and only one of them is a
  // decision. What distinguishes "never stales" from "no limit applies" on the
  // wire is `volatility`, which is present either way and says which it is.
  // The COMPARISON still uses the table's Infinity; this is the wire shape.
  const limit = volatility === null || volatility === 'static'
    ? null
    : VOLATILITY_LIMITS[volatility];
  const base = { volatility, verified, age: null, limit, stale: false };

  // Order matters. `exempt` is asked FIRST, before the injected date: a leaf
  // the facet does not govern has the same verdict on every run, and reporting
  // it as `skipped` would tell a reader to pass --today to learn something
  // --today cannot tell them.
  if (volatility === null) {
    return {
      ...base,
      verdict: TIME_VERDICTS.EXEMPT,
      reason: `no ${VOLATILITY_FIELD} declared — this leaf is not under time governance, so no freshness verdict applies (UCS-1150)`,
    };
  }
  // STATIC is settled here, before `today` and before the date check, because
  // neither can change the answer: static knowledge never stales, so there is
  // no age at which it would, and no date that would make it. Reporting it
  // `skipped` would tell a reader to pass --today to learn something --today
  // cannot tell them, and reporting it `undated` would demote a leaf whose
  // whole declared property is that it cannot rot — the same asymmetry the
  // validator's missing-verified finding draws, where a static leaf without a
  // date is clean.
  //
  // The age is still computed and published when BOTH a date and a `today`
  // are available: an author who wrote a date meant it, and a surface that
  // showed nothing would be hiding a fact it holds. The verdict is trusted
  // either way, which is the part that does not depend on the date.
  if (volatility === 'static') {
    const age = verified !== null && today ? daysBetween(verified, today) : null;
    return {
      ...base,
      age,
      verdict: TIME_VERDICTS.TRUSTED,
      reason: age === null
        ? `static knowledge never stales — no age is needed to say so (UCS-1150)`
        : `static knowledge never stales — verified ${age} day(s) ago (UCS-1150)`,
    };
  }
  if (!today) {
    return {
      ...base,
      verdict: TIME_VERDICTS.SKIPPED,
      reason: timeCheckStatus(null),
    };
  }
  if (verified === null) {
    return {
      ...base,
      verdict: TIME_VERDICTS.UNDATED,
      reason: `${volatility} leaf carries no usable ${VERIFIED_FIELD} date — its age cannot be computed, so nothing vouches for its freshness (UCS-1150)`,
    };
  }
  // `static` never stales: Infinity is never exceeded, so the comparison needs
  // no special case and cannot acquire one by accident. Read from the TABLE,
  // not from the published `limit` above — that one is nulled for static to
  // survive JSON, and comparing against it would make every static leaf stale.
  const age = daysBetween(verified, today);
  if (age > VOLATILITY_LIMITS[volatility]) {
    return {
      ...base,
      age,
      verdict: TIME_VERDICTS.STALE,
      stale: true,
      reason: `verified ${age} day(s) ago, past the ${limit}-day limit for ${volatility} knowledge (UCS-1150)`,
    };
  }
  // Only `stable` and `volatile` reach here — `static` returned above and
  // `exempt` never had a class — so the limit is always a real number.
  return {
    ...base,
    age,
    verdict: TIME_VERDICTS.TRUSTED,
    reason: `verified ${age} day(s) ago, within the ${limit}-day limit for ${volatility} knowledge (UCS-1150)`,
  };
}

/**
 * What a surface prints about whether time checks ran at all.
 *
 * Every projection that can demote on time must SAY whether it computed
 * verdicts, and it must say so in one wording — a surface that phrased its own
 * skip notice would eventually phrase it as silence. Reports the missing
 * input as a fact; recovery wording belongs to the protocol (D-011).
 *
 * @param {string|null} today the injected date, or null
 * @returns {string}
 */
export const timeCheckStatus = (today) => (today
  ? `checked against --today ${today} (stale after ${VOLATILITY_LIMITS.stable} days for stable, ${VOLATILITY_LIMITS.volatile} for volatile; static never stales)`
  : 'skipped — no evaluation date supplied; diffable output never reads the wall clock (D-012)');
