/**
 * Preflight CLI adapter (UCS-953, D-011).
 *
 * Parses explicit concept/leaf selections and an injected date, loads the
 * Store, delegates to lib/preflight.js, renders, and returns its exit code.
 * Verdict rules live in lib/verdicts.js; no trust result is cached here.
 * Empty selections request store health only. Logging is opt-in and requires
 * --today; the shared CLI guard reports any incomplete run as exit 2.
 */
import process from 'node:process';
import { loadStores, normalizeConceptIds } from '../lib/load-stores.js';
import { runPreflight } from '../lib/preflight.js';
import { locateKitRoot } from '../lib/kit-root.js';
import { EXIT_CODES } from '../lib/exit-codes.js';
import { UsageError, parseArgs as parseFlags, rethrowIfBug } from '../lib/cli.js';
import { isCalendarDate } from '../lib/iso-date.js';

export const USAGE = 'usage: node payload/engine/preflight.js [--concepts <ids>] [--leaves <ids>] [--json] [--root <dir>] [--today <YYYY-MM-DD>] [--log]';

function parseArgs(argv) {
  const { options } = parseFlags(argv, {
    boolean: ['json', 'log'],
    value: ['root', 'today'],
    repeatable: ['concepts', 'leaves'],
    // PRD §7: an explicitly empty --concepts selects store-health-only.
    allowEmpty: ['concepts', 'leaves'],
  });
  const opts = {
    json: !!options.json,
    log: !!options.log,
    root: options.root ?? process.cwd(),
    today: options.today ?? null,
    concepts: options.concepts ? normalizeConceptIds(options.concepts.flatMap((v) => v.split(','))) : null,
    // Same grammar as --concepts, deliberately: an id list is an id list, and
    // two surfaces that trimmed arguments differently is the divergence
    // normalizeConceptIds was written to end (UCS-935).
    leaves: options.leaves ? normalizeConceptIds(options.leaves.flatMap((v) => v.split(','))) : null,
  };
  if (opts.today !== null && !isCalendarDate(opts.today)) {
    // --log writes --today into permanent fragments, so a date that does not
    // exist would be stamped into an audit trail forever.
    throw new UsageError(`--today must be a real calendar date (YYYY-MM-DD), got ${JSON.stringify(opts.today)}`);
  }
  if (opts.log && !opts.today) {
    throw new UsageError('--log requires --today <YYYY-MM-DD> — the finding helper never reads the wall clock (PRD §5)');
  }
  return opts;
}

function renderHuman(payload) {
  const lines = [];
  const { counts } = payload;
  const leafVerdicts = payload['leaf-verdicts'] ?? [];
  if (payload.mode === 'store-health') {
    lines.push(`preflight (store-health only — no --concepts/--leaves): store verdict ${payload['store-verdict']}`);
  } else {
    // One counted subject line over both record kinds, matching `counts`: a
    // header that tallied only concepts would disagree with the exit code the
    // moment a leaf was quarantined.
    const subjects = [
      payload.verdicts.length ? `${payload.verdicts.length} concept(s)` : null,
      leafVerdicts.length ? `${leafVerdicts.length} leaf/leaves` : null,
    ].filter(Boolean).join(' + ');
    lines.push(
      `preflight: ${subjects} — ${counts.trusted} trusted, `
      + `${counts.quarantined} quarantined, ${counts.stale} stale, ${counts.unknown} unknown `
      + `(store verdict ${payload['store-verdict']})`,
    );
  }
  // Whether time verdicts ran at all — printed whenever leaves were asked
  // about, computed or not. A skipped check that said nothing would read
  // exactly like a check that passed (PRD §5).
  if (payload['time-check']) lines.push(`time check: ${payload['time-check']}`);
  for (const d of payload['store-errors'] ?? []) {
    lines.push(`  store error ${d.code}  ${d.file}${d.path ? `  ${d.path}` : ''}`, `    ${d.message}`);
  }
  for (const v of payload.verdicts) {
    lines.push('', `${v.verdict.toUpperCase()}  ${v.concept}${v.status ? `  (${v.status})` : ''}`, `  ${v.reason}`);
    for (const e of v.evidence) {
      lines.push(`  ${e.severity === 'hard-error' ? 'HARD ERROR' : 'error'} ${e.code}  ${e.file}  ${e.path}${e.source ? `  (source: ${e.source})` : ''}`);
    }
    lines.push(`  next: ${v['next-action']}`);
  }
  for (const v of leafVerdicts) {
    // The time verdict rides the subject line beside the stage: both are
    // properties of the leaf a reader judges it by, and a stale leaf must say
    // so where its verdict is read rather than only in the tally.
    const time = v.time ? `  (time: ${v.time.verdict}${v.time.volatility ? `, ${v.time.volatility}` : ''}${v.time.age === null ? '' : `, ${v.time.age}d`})` : '';
    lines.push('', `${v.verdict.toUpperCase()}  ${v.leaf}${v.stage ? `  (stage: ${v.stage})` : ''}${time}`, `  ${v.reason}`);
    for (const e of v.evidence) {
      lines.push(`  error ${e.code}  ${e.file}  ${e.path}`);
    }
    lines.push(`  next: ${v['next-action']}`);
  }
  for (const file of payload.logged ?? []) {
    lines.push('', `quarantine finding appended: ${file}`);
  }
  if (payload.ok) {
    lines.push('', payload.mode === 'store-health'
      ? 'store health is clean — per-record verdicts need a --concepts or --leaves list'
      : 'everything requested is trusted this run — verdicts are never cached (D-011)');
  }
  return lines;
}

export function main(argv) {
  const opts = parseArgs(argv);

  let model;
  try {
    // --root is the repo root (§9.1), same as validate-values.js.
    model = loadStores(locateKitRoot(opts.root));
  } catch (error) {
    // An EXPECTED refusal from the loader — an unreadable root, an ambiguous
    // kit layout, a Store that will not load. The stores this command would
    // check never loaded, so its checks never ran: exit 2, never 1.
    process.stderr.write(`preflight: ${error.message}\n`);
    rethrowIfBug(error); // a bug, or a UsageError raised deep in the loader, is not ours to speak for
    return EXIT_CODES.FAILURE;
  }

  const { payload, exitCode } = runPreflight(model, {
    repoRoot: opts.root, concepts: opts.concepts, leaves: opts.leaves,
    today: opts.today, log: opts.log,
  });
  const lines = opts.json ? [JSON.stringify(payload, null, 2)] : renderHuman(payload);
  process.stdout.write(`${lines.join('\n').replace(/\n+$/, '')}\n`);
  return exitCode;
}
