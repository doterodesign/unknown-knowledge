#!/usr/bin/env node
/**
 * Reverse audit (KK-12) — the code→store scan (PRD §4). ADVISORY by design:
 * it grows the map proposal-first — every unmatched anchor arrives as a
 * drafted concept YAML ready for human review — and is never a CI gate.
 *
 *   node payload/engine/audit.js [--root <dir>] [--json] [--fail-on-findings]
 *                                [--today <YYYY-MM-DD>] [--stale-days <n>]
 *
 * The scan surface IS the survey map (KK-25): git-tracked files, built-in
 * denylist, anchor candidates from the shared signature table — and the
 * survey-scope.yaml honor-it contract, so excluded areas are never rescanned
 * (widening happens via retrieval-miss findings, never re-litigation). A
 * malformed scope file is an engine failure (exit 2), never a silently
 * ignored boundary.
 *
 * Findings (all advisory):
 *   unmatched-anchor     an anchor candidate no concept points at — exports,
 *                        registries, config keys, module directories. Carries
 *                        `draft`: a proposed §3.1 concept record. The draft id
 *                        is a deliberate NON-minted placeholder (K-XXX):
 *                        pasting a draft unedited must fail validation, never
 *                        silently mint an id outside the owning class's range
 *                        (§3.5). Matching is pointer-prefix: a concept whose
 *                        source-of-truth names a folder covers its subtree
 *                        ("point at a folder for identity, at a file for
 *                        facts").
 *   stale-last-verified  an active concept whose last-verified predates
 *                        --today by more than --stale-days (default 90).
 *                        Checked ONLY when --today is given: diffable output
 *                        never reads the wall clock (D-012); without --today
 *                        the check reports itself skipped, never silently.
 *
 * The kit's own zone is never audited — the map must not be told to map
 * itself. The store dir is discovered: `<root>/ontology` (stores at the scan
 * root, the engine-fixture layout) or `<root>/unknown-knowledge/` (the D-016
 * post-init default). A repo with no stores at all still audits — every
 * anchor is a proposal.
 *
 * Suppressions (KK-27, D-013 §11.1 minimal core): a client-zone
 * `suppressions.yaml` in the kit zone — `<kitRoot>/suppressions.yaml`, i.e.
 * next to the stores (unknown-knowledge/suppressions.yaml in the D-016
 * layout; at the scan root, beside survey-scope.yaml, when the stores live
 * there). A YAML list of entries, each STRICTLY
 * { term, sourcePath, reason, date } — exact match only, no patterns, no
 * expiry (deferred §11.1). What the fields match, per finding code:
 *   unmatched-anchor     the anchor path is the identity: `sourcePath` must
 *                        equal the finding's path exactly, and `term` must
 *                        equal the term the draft would carry (the path's
 *                        basename without extension) — so a suppression stops
 *                        matching the moment the file moves.
 *   stale-last-verified  the concept is the identity and has no file path:
 *                        BOTH `term` and `sourcePath` must equal the concept
 *                        id (e.g. K-101) — one strict shape, no second
 *                        entry grammar.
 * Suppressed findings leave the finding list (and never trip
 * --fail-on-findings); the human report shows the suppressed count, the JSON
 * report the full stable-sorted suppressed list. Suppression is
 * advisory-side and FAILS OPEN — the opposite of survey-scope.yaml: a
 * malformed entry (or an unreadable/unparseable file) produces a warning and
 * suppresses nothing, so the findings it would have hidden resurface; it is
 * never an engine failure. A missing file is a plain no-op. Engine-internal
 * noise heuristics (denylist, the "." root filter) stay engine-side — the
 * client file is for client judgments only.
 *
 * Single health model (KK-04): a store with error-severity diagnostics is an
 * engine failure (exit 2) — matching candidates against broken stores would
 * misreport, and a check that never ran is a blocking defect, never a silent
 * pass (PRD §5).
 *
 * Exit codes (PRD §5): 0 ran (findings are advisory), 2 engine failure.
 * `--fail-on-findings` opts a HUMAN run into exit 1 on findings — never a
 * shipped CI default (governance test lands with KK-27). Output is
 * deterministic and stable-sorted; no wall-clock timestamps (drafted dates
 * come from --today or are omitted).
 */
import process from 'node:process';
import { readFileSync } from 'node:fs';
import { basename, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dump, load } from 'js-yaml';
import { buildSurveyMap } from './survey-map.js';
import { locateKit, SCOPE_FILE, SUPPRESSIONS_FILE } from './lib/kit-root.js';
import { loadStores, storeHealth } from './lib/load-stores.js';
import { compare } from './lib/validate-record.js';
import { EXIT_CODES } from './lib/exit-codes.js';

const USAGE = 'usage: node payload/engine/audit.js [--root <dir>] [--json] [--fail-on-findings] [--today <YYYY-MM-DD>] [--stale-days <n>]';
const STALE_DAYS_DEFAULT = 90;
// Kit layout — where the stores live and what counts as kit zone — is
// lib/kit-root.js's one job (UCS-934). The audit used to answer that itself,
// with the opposite tie-break, and so read a different Store than every other
// surface whenever a repo carried both layouts.
export { SUPPRESSIONS_FILE } from './lib/kit-root.js';

class UsageError extends Error {}


const underPrefix = (path, prefix) => path === prefix || path.startsWith(`${prefix}/`);

/** Pointer-prefix matching: a folder pointer covers its subtree (§3.1). */
function matchesPointer(path, pointerPaths) {
  return pointerPaths.some((p) => underPrefix(path, p));
}

/** Drafted §3.1 concept record for one unmatched anchor (proposal-first). */
function draftConcept(path, kinds, today) {
  const record = {
    // NOT a mintable K-NNN: the human mints the id inside the owning class's
    // range at PR time (§3.5) — a paste-unedited draft must fail validation.
    id: 'K-XXX',
    term: basename(path, extname(path)),
    class: 'TODO — owning class file; mint the id in its declared range (§3.5)',
    summary: `TODO — drafted by reverse audit: ${kinds.join(', ')} anchor with no concept pointing at it`,
    'source-of-truth': [path],
    status: 'draft',
    ...(today ? { 'last-verified': today } : {}),
  };
  return dump(record, { lineWidth: -1 });
}

// ------------------------------------------------------- suppressions (KK-27)

/** The v1 entry shape, STRICTLY: exact-match identity + audit trail. */
const SUPPRESSION_FIELDS = ['term', 'sourcePath', 'reason', 'date'];

/**
 * The exact-match identity a suppression entry must equal, per finding code
 * (documented in the header): the anchor path (plus its drafted term) for
 * unmatched-anchor; the concept id in both fields for stale-last-verified.
 */
function suppressionIdentity(finding) {
  if (finding.code === 'unmatched-anchor') {
    return { term: basename(finding.path, extname(finding.path)), sourcePath: finding.path };
  }
  return { term: finding.concept, sourcePath: finding.concept };
}

/** Warning text for one malformed entry, or null when it is well-formed. */
function suppressionEntryProblem(entry) {
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

/**
 * Load `<kitRoot>/suppressions.yaml`. FAILS OPEN by design (the opposite of
 * the scope file): a missing file is a silent no-op; anything malformed — the
 * whole file or a single entry — becomes a warning and suppresses nothing,
 * never an engine failure. Suppression is advisory-side, never blocking.
 */
function loadSuppressions(kitRoot) {
  const warn = (msg) => ({ entries: [], warnings: [`${SUPPRESSIONS_FILE}: ${msg} — ignoring every entry (suppression fails open, findings resurface)`] });
  let text;
  try {
    text = readFileSync(join(kitRoot, SUPPRESSIONS_FILE), 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return { entries: [], warnings: [] }; // no file, no-op
    return warn(`cannot read: ${error.message}`);
  }
  let doc;
  try {
    doc = load(text, { filename: SUPPRESSIONS_FILE });
  } catch (error) {
    return warn(`unparseable YAML: ${error.reason ?? error.message}`);
  }
  if (doc === null || doc === undefined) return { entries: [], warnings: [] }; // empty file, no-op
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

/** Whole days from ISO date `from` to ISO date `to` (both validated). */
const daysBetween = (from, to) =>
  Math.floor((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Run the reverse audit: survey the repo at `root` (scope-honoring), load the
 * stores, and report unmatched anchors + stale verifications. Throws on
 * engine failure (unhealthy store, malformed scope, no git).
 */
export function runAudit(root, { today = null, staleDays = STALE_DAYS_DEFAULT } = {}) {
  const map = buildSurveyMap(root);
  const { kitRoot, kitPrefixes } = locateKit(root);
  const model = loadStores(kitRoot);

  const { errors } = storeHealth(model);
  if (errors.length > 0) {
    const detail = errors.map((d) => `  ${d.code}  ${d.file}${d.path ? `  ${d.path}` : ''}  ${d.message}`);
    throw new Error(`the store loader reported ${errors.length} error(s) — auditing against broken stores would misreport (single health model, PRD §4):\n${detail.join('\n')}`);
  }

  const pointerPaths = [...model.pointers.keys()];
  // One finding per path: a file matching several signatures is one anchor
  // to propose, never a cascade of near-identical drafts.
  const byPath = new Map();
  let matched = 0;
  for (const { kind, path } of map.candidates) {
    if (path === '.') continue; // engine-side noise heuristic (D-013): a draft proposing "the repo root is a concept" is never actionable
    if (kitPrefixes.some((p) => underPrefix(path, p))) continue; // the map never maps itself
    if (matchesPointer(path, pointerPaths)) {
      matched += 1;
      continue;
    }
    if (!byPath.has(path)) byPath.set(path, []);
    if (!byPath.get(path).includes(kind)) byPath.get(path).push(kind);
  }

  const findings = [];
  for (const [path, kinds] of byPath) {
    kinds.sort(compare);
    findings.push({
      code: 'unmatched-anchor', severity: 'advisory', path, kinds,
      message: `no concept points at this ${kinds.join('/')} anchor — draft below is ready for human review`,
      draft: draftConcept(path, kinds, today),
    });
  }

  if (today) {
    for (const { id, record } of model.concepts.values()) {
      if (record.status !== 'active') continue; // draft/proposed are unverified by definition; deprecated needs no re-verification
      const verified = record['last-verified'];
      if (typeof verified !== 'string' || !ISO_DATE.test(verified)) continue; // presence/shape is KK-05's check
      const days = daysBetween(verified, today);
      if (days > staleDays) {
        findings.push({
          code: 'stale-last-verified', severity: 'advisory', concept: id,
          'last-verified': verified, days, 'stale-days': staleDays,
          message: `last verified ${days} day(s) ago — re-verify or deprecate (§3.1 rung 4)`,
        });
      }
    }
  }

  findings.sort((a, b) =>
    compare(a.code, b.code) || compare(a.path ?? '', b.path ?? '') || compare(a.concept ?? '', b.concept ?? ''));

  // Client-zone suppressions (KK-27): exact-match filter, fails open. Only
  // well-formed entries suppress; the sort above keeps both lists stable.
  const { entries: suppressionEntries, warnings } = loadSuppressions(kitRoot);
  const kept = [];
  const suppressed = [];
  for (const finding of findings) {
    const identity = suppressionIdentity(finding);
    const match = suppressionEntries.some(
      (e) => e.term === identity.term && e.sourcePath === identity.sourcePath,
    );
    (match ? suppressed : kept).push(finding);
  }

  return {
    checks: {
      'unmatched-anchor': 'checked',
      'stale-last-verified': today
        ? `checked against --today ${today} (stale after ${staleDays} day(s))`
        : 'skipped — pass --today YYYY-MM-DD to enable; diffable output never reads the wall clock (D-012)',
    },
    scope: map.scope.source === SCOPE_FILE ? SCOPE_FILE : 'unscoped (no confirmed survey-scope.yaml)',
    counts: {
      candidates: map.candidates.length,
      matched,
      findings: kept.length,
      suppressed: suppressed.length,
    },
    findings: kept,
    // Full suppressed list in JSON output (stable-sorted, same order as
    // findings); the human renderer shows only the count. Warnings surface
    // in both — a malformed entry must never vanish silently.
    suppressions: { warnings, suppressed },
  };
}

// ------------------------------------------------------------- CLI plumbing

function parseArgs(argv) {
  const opts = {
    root: process.cwd(), json: false, failOnFindings: false,
    today: null, staleDays: STALE_DAYS_DEFAULT,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const eq = arg.startsWith('--') ? arg.indexOf('=') : -1;
    const flag = eq === -1 ? arg : arg.slice(0, eq);
    const takesValue = ['--root', '--today', '--stale-days'].includes(flag);
    if (flag === '--json' || flag === '--fail-on-findings') {
      if (eq !== -1) throw new UsageError(`${flag} takes no value`);
      if (flag === '--json') opts.json = true;
      else opts.failOnFindings = true;
    } else if (takesValue) {
      let value;
      if (eq !== -1) {
        value = arg.slice(eq + 1);
      } else {
        value = argv[i + 1];
        if (value === undefined || value.startsWith('--')) {
          throw new UsageError(`${flag} requires a value`);
        }
        i += 1;
      }
      if (flag === '--root') {
        opts.root = value;
      } else if (flag === '--today') {
        if (!ISO_DATE.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
          throw new UsageError(`--today must be an ISO date (YYYY-MM-DD), got ${JSON.stringify(value)}`);
        }
        opts.today = value;
      } else {
        opts.staleDays = Number(value);
        if (!Number.isInteger(opts.staleDays) || opts.staleDays < 0) {
          throw new UsageError(`--stale-days must be a non-negative integer, got ${JSON.stringify(value)}`);
        }
      }
    } else if (arg.startsWith('--')) {
      throw new UsageError(`unknown flag ${arg}`);
    } else {
      throw new UsageError(`unexpected argument ${JSON.stringify(arg)} — this CLI takes flags only`);
    }
  }
  opts.root = resolve(opts.root);
  return opts;
}

function renderHuman(payload) {
  const lines = [];
  const n = payload.counts.findings;
  const s = payload.counts.suppressed;
  lines.push(
    `audit (advisory — proposals for human review, never a gate): `
    + `${payload.counts.candidates} candidate(s), ${payload.counts.matched} matched, `
    + `${n} finding${n === 1 ? '' : 's'}`
    + (s > 0 ? `, ${s} suppressed (${SUPPRESSIONS_FILE})` : ''),
    `scope: ${payload.scope}`,
    `stale check: ${payload.checks['stale-last-verified']}`,
  );
  for (const w of payload.suppressions.warnings) lines.push(`warning: ${w}`);
  for (const f of payload.findings) {
    lines.push('', `${f.code}  ${f.path ?? f.concept}`, `  ${f.message}`);
    if (f.draft) lines.push(...f.draft.trimEnd().split('\n').map((l) => `  | ${l}`));
  }
  if (n === 0) lines.push('', 'nothing to propose — every anchor is mapped');
  return lines;
}

export function main(argv) {
  try {
    const opts = parseArgs(argv);
    const payload = runAudit(opts.root, { today: opts.today, staleDays: opts.staleDays });
    const lines = opts.json ? [JSON.stringify(payload, null, 2)] : renderHuman(payload);
    process.stdout.write(`${lines.join('\n').replace(/\n+$/, '')}\n`);
    return opts.failOnFindings && payload.counts.findings > 0 ? EXIT_CODES.FINDINGS : EXIT_CODES.CLEAN;
  } catch (error) {
    if (error instanceof UsageError) {
      process.stderr.write(`audit: ${error.message}\n${USAGE}\n`);
    } else {
      // Engine failure (malformed scope, unhealthy store, no git, a crash):
      // the audit never ran to completion — exit 2, never a plausible report.
      process.stderr.write(`audit: ${error.message}\n`);
    }
    return EXIT_CODES.FAILURE;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  // Never process.exit(): it truncates piped stdout mid-flush (PRD §5).
  process.exitCode = main(process.argv.slice(2));
}
