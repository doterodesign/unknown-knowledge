/**
 * Suppression — the steward's rejection memory (KK-27, D-013, PRD §11.1).
 *
 * A client-zone `suppressions.yaml` next to the stores, telling the reverse
 * audit "this is deliberately not a Concept". It has real depth behind a small
 * interface: a fails-open loader, a strict entry shape, and an exact-match
 * filter that can only ever UNDER-suppress.
 *
 * Two rules give the whole module its shape:
 *
 * 1. IT FAILS OPEN, always. The opposite of the scope file. A missing file is a
 *    no-op; anything malformed — the whole document, or one entry — becomes a
 *    warning and suppresses nothing, so the findings it would have hidden come
 *    back. Suppression is advisory-side; it must never be able to silence a
 *    finding by being broken, and never raise an engine failure.
 *
 * 2. IDENTITY TRAVELS WITH THE FINDING. A Finding knows what a suppression
 *    entry would have to say to silence it, because it is stamped at the place
 *    the Finding is built. Nothing here switches on the Finding's code.
 *
 * Rule 2 is the point of this module existing. The identity used to be derived
 * by a function that switched on `finding.code`, so a third Finding code was
 * one forgotten `if` away from being permanently unsuppressable — silently, and
 * only in a client's Store. Now a Finding without an identity is refused
 * outright: `partitionBySuppression` throws rather than quietly keeping it.
 *
 * v1 is deliberately minimal (§11.1): exact match on `{ term, sourcePath }`.
 * No patterns, no expiry, no globs. A suppression that could match something
 * its author did not read is a suppression that can hide the finding they most
 * needed to see.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { load } from 'js-yaml';
import { SUPPRESSIONS_FILE } from './kit-root.js';

export { SUPPRESSIONS_FILE };

/** The v1 entry shape, STRICTLY: exact-match identity + audit trail. */
export const SUPPRESSION_FIELDS = Object.freeze(['term', 'sourcePath', 'reason', 'date']);

/**
 * The identity a Finding is suppressed by, carried on the Finding itself.
 *
 * A Symbol, so it never reaches the wire: `JSON.stringify` and `Object.keys`
 * skip symbol keys, and the audit's `--json` payload is a published contract.
 * It survives object spread, which is how findings are built.
 */
export const SUPPRESSION_IDENTITY = Symbol('suppression identity');

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Stamp a Finding with the exact-match identity that would silence it.
 *
 * Call this where the Finding is BUILT, where its shape is known. That is the
 * whole design: no downstream function has to know every Finding code, so a new
 * code cannot fall out of sync with a switch statement that forgot it.
 *
 * @param {object} finding
 * @param {{ term: string, sourcePath: string }} identity
 * @returns {object} the finding, carrying its identity
 */
export function suppressibleBy(finding, identity) {
  if (typeof identity?.term !== 'string' || identity.term === ''
    || typeof identity?.sourcePath !== 'string' || identity.sourcePath === '') {
    throw new Error(`finding "${finding?.code}": a suppression identity needs a non-empty term and sourcePath`);
  }
  return { ...finding, [SUPPRESSION_IDENTITY]: Object.freeze({ ...identity }) };
}

/** Warning text for one malformed entry, or null when it is well-formed. */
export function suppressionEntryProblem(entry) {
  if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
    return 'not a mapping';
  }
  for (const field of SUPPRESSION_FIELDS) {
    if (typeof entry[field] !== 'string' || entry[field].trim() === '') {
      return `"${field}" must be a non-empty string`;
    }
  }
  const unknown = Object.keys(entry).filter((k) => !SUPPRESSION_FIELDS.includes(k));
  if (unknown.length > 0) {
    return `unknown field(s) ${unknown.map((k) => `"${k}"`).join(', ')} — v1 entries are strictly { ${SUPPRESSION_FIELDS.join(', ')} } (no patterns, no expiry; §11.1)`;
  }
  if (!ISO_DATE.test(entry.date)) {
    return `"date" must be an ISO date (YYYY-MM-DD), got ${JSON.stringify(entry.date)}`;
  }
  return null;
}

/** True when the document has anything but blank lines and `#` comments. */
const hasContent = (text) =>
  text.split('\n').some((line) => line.trim() !== '' && !line.trim().startsWith('#'));

/**
 * Load `<kitRoot>/suppressions.yaml`. FAILS OPEN by design.
 *
 * @returns {{ entries: object[], warnings: string[] }} only well-formed entries
 */
export function loadSuppressions(kitRoot) {
  const warn = (msg) => ({ entries: [], warnings: [`${SUPPRESSIONS_FILE}: ${msg} — ignoring every entry (suppression fails open, findings resurface)`] });
  let text;
  try {
    text = readFileSync(join(kitRoot, SUPPRESSIONS_FILE), 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return { entries: [], warnings: [] }; // no file, no-op
    return warn(`cannot read: ${error.message}`);
  }
  // A file with nothing in it but blank lines and comments is a file with no
  // entries — not a broken one. js-yaml raises "expected a document, but the
  // input is empty" for all three, so a steward who commented out their last
  // suppression used to be told their file was unparseable.
  if (!hasContent(text)) return { entries: [], warnings: [] };

  let doc;
  try {
    doc = load(text, { filename: SUPPRESSIONS_FILE });
  } catch (error) {
    return warn(`unparseable YAML: ${error.reason ?? error.message}`);
  }
  if (doc === null || doc === undefined) return { entries: [], warnings: [] }; // explicit `null`, no-op
  if (!Array.isArray(doc)) return warn('must be a YAML list of { term, sourcePath, reason, date } entries');

  const entries = [];
  const warnings = [];
  doc.forEach((entry, i) => {
    const problem = suppressionEntryProblem(entry);
    if (problem === null) {
      entries.push(entry);
    } else {
      warnings.push(`${SUPPRESSIONS_FILE}: entry ${i + 1} ignored (fails open, its finding resurfaces): ${problem}`);
    }
  });
  return { entries, warnings };
}

/**
 * Split findings into those a suppression entry silences and those it does not.
 *
 * Exact match on both fields, in the order the findings arrive — callers sort
 * first, so both lists stay stable.
 *
 * A Finding with no identity is a PROGRAMMING error, not a client-data one, so
 * it is refused rather than passed through. Passing it through would make a new
 * Finding code permanently unsuppressable, and nothing would ever say so: the
 * audit would run clean, the entry the steward wrote would be ignored, and the
 * finding they rejected would come back every run. Failing open is right for a
 * malformed suppressions.yaml; it is wrong for a Finding the engine built.
 *
 * @param {object[]} findings each stamped by `suppressibleBy`
 * @param {object[]} entries well-formed suppression entries
 * @returns {{ kept: object[], suppressed: object[] }}
 */
export function partitionBySuppression(findings, entries) {
  const kept = [];
  const suppressed = [];
  for (const finding of findings) {
    const identity = finding[SUPPRESSION_IDENTITY];
    if (identity === undefined) {
      throw new Error(
        `finding "${finding?.code}" carries no suppression identity — stamp it with suppressibleBy() `
        + 'where it is built, or a steward could never suppress it',
      );
    }
    const match = entries.some((e) => e.term === identity.term && e.sourcePath === identity.sourcePath);
    (match ? suppressed : kept).push(finding);
  }
  return { kept, suppressed };
}
