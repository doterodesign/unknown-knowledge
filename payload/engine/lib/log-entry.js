/**
 * Log-entry append/transition helper (KK-13) — how agents write to the
 * fragment-based logs (PRD §3.4, D-010) without hand-editing YAML.
 *
 *   logs/findings/  finding.schema.json   five capture triggers (§3.4)
 *   logs/misses/    miss.schema.json      unextractable anchors → extractor backlog
 *   logs/gaps/      gap.schema.json       requests no protocol/skill could route
 *
 * ONE FILE PER ENTRY: `createEntry` mints `logs/<log>/<date>-<hex8>.yaml`,
 * so hundreds of concurrent sessions on hundreds of branches append without
 * a single merge conflict — the file name is the entry id. Eight hex chars
 * (2^32 ids per date per log): 'wx' only guards one checkout, so the suffix
 * space itself must keep cross-branch same-day collisions negligible (D-010).
 *
 * Status lifecycle (§3.4/§8): open → proposed → resolved | rejected, and
 * re-open-not-duplicate — a recurrence transitions the SAME entry back to
 * open (appending the date to `occurrences`), never mints a sibling.
 * `transitionStatus` enforces the legal table and THROWS on an illegal move;
 * resolving stamps `verified`, rejecting requires a `reason`, re-opening
 * drops both — the old outcome no longer holds.
 *
 * Dates are injectable — callers pass the ISO date; nothing in here reads the
 * wall clock, so diffable output never depends on when a test ran (PRD §5).
 *
 * Capture content policy (§3.4/KK-20): entries carry concept IDs and file
 * paths only — never verbatim user text, quoted session content, or secrets.
 * Committed fragments are permanent git history in the client's repo.
 *
 * Reflect-side contract (implementation lands with KK-22): /knowledge-reflect
 * consolidates fragments via these same transitions — approved + validator
 * re-run pass → resolved (+ verified date); fail → re-opened; rejected with
 * reason; recurrences re-open, never duplicate. `open` entries still
 * uncorroborated after N reflect cycles are pruned: archived with a rollup
 * note (the fragment file is deleted; the rollup is reflect output, not a
 * status — this module never deletes).
 */
import { randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { load, dump } from 'js-yaml';
import { validateRecord } from './validate-record.js';
import { isCalendarDate } from './iso-date.js';

/** Log directory name (under logs/) → record kind / schema document. */
export const LOGS = Object.freeze({
  findings: 'finding',
  misses: 'miss',
  gaps: 'gap',
});

/** The §3.4 lifecycle: open → proposed → resolved/rejected; re-open-not-duplicate. */
export const LEGAL_TRANSITIONS = Object.freeze({
  open: Object.freeze(['proposed']),
  proposed: Object.freeze(['rejected', 'resolved']),
  rejected: Object.freeze(['open']),
  resolved: Object.freeze(['open']),
});

const SCHEMA_VERSION = 1;
/** Keys the helper stamps itself; hand-supplying one is a caller bug. */
const HELPER_OWNED = ['schema-version', 'date', 'status', 'verified', 'reason', 'occurrences'];

function assertDate(date, what = 'date') {
  // A real day, not just four-two-two: the date is stamped into the fragment's
  // filename and its status transitions, so `2026-02-30` would live forever in
  // an audit trail as a day that never happened.
  if (!isCalendarDate(date)) {
    throw new Error(`${what} must be an injected ISO date (YYYY-MM-DD), got ${JSON.stringify(date)} — the helper never reads the wall clock (PRD §5)`);
  }
}

function kindFor(log) {
  const kind = LOGS[log];
  if (!kind) throw new Error(`unknown log "${log}" (expected one of: ${Object.keys(LOGS).join(', ')})`);
  return kind;
}

function assertValid(kind, entry, file) {
  const { errors } = validateRecord(kind, entry);
  if (errors.length > 0) {
    const detail = errors.map((e) => `${e.path}: ${e.code} — ${e.message}`).join('; ');
    throw new Error(`${file}: entry does not validate against ${kind}.schema.json: ${detail}`);
  }
}

/** Serialize with stable options so fragments diff cleanly run-over-run. */
function serialize(entry) {
  return dump(entry, { lineWidth: 100, noRefs: true, sortKeys: false });
}

/**
 * Append one entry to logs/<log>/ — one file per entry (D-010).
 *
 * @param {object} options
 * @param {string} options.root kit root (the dir containing logs/)
 * @param {string} options.log 'findings' | 'misses' | 'gaps'
 * @param {string} options.date injected ISO date — never wall-clock
 * @param {object} options.fields kind-specific fields (trigger/summary/…);
 *   concept IDs and paths only — never verbatim user text or secrets
 * @param {string} [options.suffix] 8-hex filename suffix (default: random)
 * @returns {{ file: string, entry: object }} root-relative fragment path + entry
 */
export function createEntry({ root, log, date, fields = {}, suffix } = {}) {
  const kind = kindFor(log);
  assertDate(date);
  for (const key of HELPER_OWNED) {
    if (Object.hasOwn(fields, key)) {
      throw new Error(`field "${key}" is helper-owned — createEntry stamps it; entries are born open with schema-version ${SCHEMA_VERSION}`);
    }
  }
  if (suffix !== undefined && !/^[0-9a-f]{8}$/.test(suffix)) {
    throw new Error(`suffix must be 8 lowercase hex chars, got ${JSON.stringify(suffix)}`);
  }
  const id = suffix ?? randomBytes(4).toString('hex');
  const file = `logs/${log}/${date}-${id}.yaml`;
  const entry = { 'schema-version': SCHEMA_VERSION, date, status: 'open', ...fields };
  assertValid(kind, entry, file);
  mkdirSync(join(root, 'logs', log), { recursive: true });
  // 'wx' = exclusive create: a suffix collision is a hard error, never an
  // overwrite — published fragments are immutable except via transitions.
  writeFileSync(join(root, file), serialize(entry), { flag: 'wx' });
  return { file, entry };
}

/**
 * Move one fragment through the lifecycle; hard-errors on an illegal move
 * and leaves the file untouched.
 *
 * @param {object} options
 * @param {string} options.root kit root (the dir containing logs/)
 * @param {string} options.file root-relative fragment path (as createEntry returned)
 * @param {string} options.to target status
 * @param {string} options.date injected ISO date — never wall-clock
 * @param {string} [options.reason] required when rejecting
 * @returns {{ file: string, entry: object }} the rewritten entry
 */
/** Derived from LOGS so a fourth log can't be creatable-but-untransitionable. */
const FRAGMENT_PATH = new RegExp(`^logs/(${Object.keys(LOGS).join('|')})/[^/]+\\.yaml$`);

/**
 * What each target status does to the lifecycle fields (§3.4/§8) — one table
 * so field ownership lives in one place, not scattered through an if/else
 * chain. `stamp` writes fields; `drop` removes the ones the new status must
 * not carry (the validation layer enforces the same invariants).
 */
const STATUS_EFFECTS = Object.freeze({
  proposed: {},
  resolved: {
    // the validator re-run passed (§8)
    stamp: ({ date }) => ({ verified: date }),
  },
  rejected: {
    stamp: ({ file, reason }) => {
      if (typeof reason !== 'string' || reason === '') {
        throw new Error(`${file}: rejecting requires a reason — rejections record the reason (§8)`);
      }
      return { reason };
    },
  },
  open: {
    // Re-open, not duplicate: same entry, occurrence date appended; the old
    // resolution/rejection outcome (verified, reason) no longer holds.
    drop: ['verified', 'reason'],
    stamp: ({ date, entry }) => ({ occurrences: [...(entry.occurrences ?? []), date] }),
  },
});

export function transitionStatus({ root, file, to, date, reason } = {}) {
  const match = FRAGMENT_PATH.exec(file ?? '');
  if (!match) throw new Error(`not a log fragment path: ${JSON.stringify(file)} (expected logs/<${Object.keys(LOGS).join('|')}>/<entry>.yaml, relative to root)`);
  const kind = kindFor(match[1]);
  if (!Object.hasOwn(LEGAL_TRANSITIONS, to ?? '')) {
    throw new Error(`unknown target status ${JSON.stringify(to)} (expected one of: ${Object.keys(LEGAL_TRANSITIONS).join(', ')})`);
  }
  assertDate(date);
  // Confine the read/write inside root's logs/ dir: a crafted relative path
  // ('../logs/…', 'foo/../../logs/…') must never reach a sibling tree.
  const logsDir = resolve(root, 'logs');
  const absolute = resolve(root, file);
  if (!absolute.startsWith(logsDir + sep)) {
    throw new Error(`fragment path ${JSON.stringify(file)} escapes the kit root — transitions only touch files under ${logsDir}`);
  }
  const entry = load(readFileSync(absolute, 'utf8'));
  assertValid(kind, entry, file);
  const from = entry.status;
  if (!LEGAL_TRANSITIONS[from].includes(to)) {
    throw new Error(`${file}: illegal transition ${from} → ${to} (legal from ${from}: ${LEGAL_TRANSITIONS[from].join(', ') || 'none'}) — the lifecycle is open → proposed → resolved/rejected; re-open-not-duplicate (§3.4)`);
  }
  const effects = STATUS_EFFECTS[to];
  entry.status = to;
  for (const key of effects.drop ?? []) delete entry[key];
  Object.assign(entry, effects.stamp?.({ file, date, reason, entry }));
  assertValid(kind, entry, file);
  writeFileSync(absolute, serialize(entry));
  return { file, entry };
}
