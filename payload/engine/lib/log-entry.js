/**
 * Log-entry append/transition helper (KK-13) — how agents write to the
 * fragment-based logs (PRD §3.4, D-010) without hand-editing YAML.
 *
 *   logs/findings/  finding.schema.json   five capture triggers (§3.4)
 *   logs/misses/    miss.schema.json      unextractable anchors → extractor backlog
 *   logs/gaps/      gap.schema.json       requests no protocol/skill could route
 *
 * ONE FILE PER ENTRY: `createEntry` mints `logs/<log>/<date>-<hex4>.yaml`,
 * so hundreds of concurrent sessions on hundreds of branches append without
 * a single merge conflict — the file name is the entry id.
 *
 * Status lifecycle (§3.4/§8): open → proposed → resolved | rejected, and
 * re-open-not-duplicate — a recurrence transitions the SAME entry back to
 * open (appending the date to `occurrences`), never mints a sibling.
 * `transitionStatus` enforces the legal table and THROWS on an illegal move;
 * resolving stamps `verified`, rejecting requires a `reason`, re-opening
 * drops `verified`.
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
import { join } from 'node:path';
import { load, dump } from 'js-yaml';
import { validateRecord } from './validate-record.js';

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
const ISO_DATE = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;
/** Keys the helper stamps itself; hand-supplying one is a caller bug. */
const HELPER_OWNED = ['schema-version', 'date', 'status', 'verified', 'occurrences'];

function assertDate(date, what = 'date') {
  if (typeof date !== 'string' || !ISO_DATE.test(date)) {
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
 * @param {string} [options.suffix] 4-hex filename suffix (default: random)
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
  const id = suffix ?? randomBytes(2).toString('hex');
  if (!/^[0-9a-f]{4}$/.test(id)) {
    throw new Error(`suffix must be 4 hex chars, got ${JSON.stringify(suffix)}`);
  }
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
export function transitionStatus({ root, file, to, date, reason } = {}) {
  const match = /(?:^|\/)logs\/(findings|misses|gaps)\/[^/]+\.yaml$/.exec(file ?? '');
  if (!match) throw new Error(`not a log fragment path: ${JSON.stringify(file)} (expected logs/<findings|misses|gaps>/<entry>.yaml)`);
  const kind = kindFor(match[1]);
  if (!Object.hasOwn(LEGAL_TRANSITIONS, to ?? '')) {
    throw new Error(`unknown target status ${JSON.stringify(to)} (expected one of: ${Object.keys(LEGAL_TRANSITIONS).join(', ')})`);
  }
  assertDate(date);
  const absolute = join(root, file);
  const entry = load(readFileSync(absolute, 'utf8'));
  assertValid(kind, entry, file);
  const from = entry.status;
  if (!LEGAL_TRANSITIONS[from].includes(to)) {
    throw new Error(`${file}: illegal transition ${from} → ${to} (legal from ${from}: ${LEGAL_TRANSITIONS[from].join(', ') || 'none'}) — the lifecycle is open → proposed → resolved/rejected; re-open-not-duplicate (§3.4)`);
  }
  entry.status = to;
  if (to === 'resolved') {
    entry.verified = date; // the validator re-run passed (§8)
  } else if (to === 'rejected') {
    if (typeof reason !== 'string' || reason === '') {
      throw new Error(`${file}: rejecting requires a reason — rejections record the reason (§8)`);
    }
    entry.reason = reason;
  } else if (to === 'open') {
    // Re-open, not duplicate: same entry, occurrence date appended.
    delete entry.verified;
    entry.occurrences = [...(entry.occurrences ?? []), date];
  }
  assertValid(kind, entry, file);
  writeFileSync(absolute, serialize(entry));
  return { file, entry };
}
