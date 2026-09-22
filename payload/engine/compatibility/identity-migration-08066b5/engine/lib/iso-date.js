/**
 * What "an ISO date" means, once (UCS-957).
 *
 * The rule was stated four times — in `lib/log-entry.js`, `lib/suppressions.js`,
 * `commands/preflight.js` and `commands/audit.js` — and the copies disagreed.
 * Three checked the SHAPE. Only preflight also asked the calendar.
 *
 * `Date.parse('2026-02-30')` does not fail. It rolls forward to March 2nd. So
 * `audit --today 2026-02-30` exited 0 and reported staleness measured from a
 * day that does not exist, two days later than the caller named, while
 * preflight refused the same string outright.
 *
 * That defeats the reason injectable dates exist. The engine never reads the
 * wall clock (D-012, PRD §5) so that its answers are reproducible from their
 * inputs — and a date silently replaced by a different date is not the input
 * anybody gave. Worse for `log-entry`, whose `--date` is stamped into fragment
 * filenames and status transitions: a rolled-forward date lands in a permanent
 * audit trail.
 *
 * One definition. The strict one.
 */

/** The shape: exactly four digits, two, two. Nothing else, no time, no zone. */
export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * True when `value` is a YYYY-MM-DD string naming a day that actually exists.
 *
 * The round-trip is the whole check: `new Date('2026-02-30T00:00:00Z')` is a
 * valid Date object (March 2nd), so `Number.isNaN` alone never catches it.
 * Formatting it back and comparing to the input does.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
export function isCalendarDate(value) {
  if (typeof value !== 'string' || !ISO_DATE.test(value)) return false;
  const roundTrip = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(roundTrip.getTime())) return false;
  return roundTrip.toISOString().slice(0, 10) === value;
}

/**
 * Whole days from ISO date `from` to ISO date `to`.
 *
 * Both must already be calendar dates — callers validate at their edge, where
 * they can say which flag was wrong. UTC midnight throughout, so no timezone
 * and no daylight-saving hour can move the answer.
 *
 * @param {string} from
 * @param {string} to
 * @returns {number}
 */
export const daysBetween = (from, to) =>
  Math.floor((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
