/**
 * Preflight verdict module (KK-26) — the session gate (PRD §4, D-011). Joins
 * the KK-04 loader's diagnostics and the KK-05/KK-07 validator results to the
 * concepts a task resolved, emitting one deterministic verdict per concept
 * plus a next action. JSON-first; the engine computes verdicts ONLY — conduct
 * on a verdict (quarantine-and-continue, fail-stop, …) is protocol-layer
 * policy the client owns (KK-20, D-011).
 *
 *   node payload/engine/preflight.js [--concepts <ids>] [--leaves <ids>] [--json]
 *                                    [--root <dir>] [--today <YYYY-MM-DD>] [--log]
 *
 * `--leaves` is the LEAF-facing surface (UCS-1149), and it exists because
 * frontmatter v2 gave leaves a promotion stage. A `stage: draft` leaf must
 * yield an unknown-class verdict through the SAME `isPrePromotionStatus`
 * predicate that downranks it in the resolver — otherwise the two surfaces
 * could disagree about which leaves are provisional, which is exactly the
 * divergence one shared predicate exists to prevent. Leaf verdicts land in
 * `leaf-verdicts` and are counted with the concept ones, so a quarantined leaf
 * gates the run; a `--concepts`-only invocation is byte-identical to before.
 *
 * Verdicts (derived, never cached — a stale "trusted" is a false all-clear,
 * D-011; every run recomputes from the working tree):
 *   trusted      every check attributable to the concept ran and ran clean
 *   quarantined  the structural (KK-05) or value (KK-07) checks yield
 *                error-severity findings or hard errors attributable to the
 *                concept — do not rely on it until the evidence is fixed
 *   unknown      the checks could not certify anything: draft/proposed status
 *                (§3.5: structural checks only, value checks skipped), a leaf
 *                under time governance whose freshness could not be computed
 *                (UCS-1150 — no `verified` date, or no injected --today), or a
 *                store-wide failure (loader error-severity diagnostics), which
 *                degrades ALL requested verdicts to unknown — no check ran
 *   stale        LEAVES ONLY (UCS-1150): the leaf's age exceeds the pinned
 *                limit for its volatility class — 365 days for `stable`, 90 for
 *                `volatile`; `static` never stales. Its own class rather than a
 *                mapping onto the others, because nothing about a stale leaf is
 *                broken (quarantined) and its checks DID run and returned a
 *                definite answer (unknown). The action is re-verification
 *                against the cited sources, which neither of those would say.
 *
 * `--today <YYYY-MM-DD>` is what time verdicts are measured against; the engine
 * never reads the wall clock (D-012). Without it, a time-governed leaf verdicts
 * unknown rather than trusted, and the `time-check` line in the output says the
 * check was skipped — a check that never ran is never a silent pass.
 *
 * Exit codes (PRD §5, lib/exit-codes.js): 0 = all trusted, 1 = quarantines or
 * stale verdicts present, 2 = engine failure / check-never-ran. Any unknown
 * verdict gates at 2 — a check that never ran is a blocking defect, never a
 * silent pass; only an all-trusted run may read as clean. A stale verdict gates
 * at 1 rather than 2, because the check ran: rotted knowledge is a finding to
 * fix, not a broken engine. An id --concepts names that the ontology does not
 * carry is exit 2 for the same reason a never-run check is: a verdict on a typo
 * must never read as anything.
 *
 * Empty or omitted --concepts = store-health-only validation: the run exits
 * on the store verdict alone (trusted when the loader's single health model
 * is clean, unknown/exit 2 otherwise) and computes no per-concept checks.
 *
 * Quarantine finding trigger (KK-13, engine-attributed): with `--log`, every
 * quarantined verdict appends one open finding fragment to logs/findings/ via
 * the KK-13 helper (one file per entry, D-010). `--log` requires `--today`
 * because the helper never reads the wall clock (PRD §5) — diffable output
 * stays date-injected. Capture content policy (§3.4): the summary carries
 * concept IDs, finding codes, and file paths ONLY — never verbatim user text.
 *
 * Reuses the exported check logic — runChecks (validate.js), validateValues
 * (validate-values.js) — over one loadStores model: the single-health-model
 * guarantee that preflight and the validators can never disagree. Output is
 * deterministic and stable-sorted (verdicts by concept id), no wall-clock
 * timestamps; only --log introduces fragment file names (random suffixes are
 * the D-010 id space, and they live in `logged`, written on request only).
 */
import process from 'node:process';
import { healthSummary, loadStores, normalizeConceptIds } from '../lib/load-stores.js';
import { computeVerdicts } from '../lib/verdicts.js';
import { locateKitRoot } from '../lib/kit-root.js';
import { EXIT_CODES } from '../lib/exit-codes.js';
import { UsageError, parseArgs as parseFlags, rethrowIfBug } from '../lib/cli.js';
import { compare } from '../lib/validate-record.js';
import { createEntry } from '../lib/log-entry.js';
import { isCalendarDate } from '../lib/iso-date.js';
import { timeCheckStatus } from '../lib/time-verdicts.js';

export const USAGE = 'usage: node payload/engine/preflight.js [--concepts <ids>] [--leaves <ids>] [--json] [--root <dir>] [--today <YYYY-MM-DD>] [--log]';

/** finding.schema.json conceptRef — `consulted` only carries conforming ids. */
const CONCEPT_REF = /^K-[0-9]+$/;

// -------------------------------------------- quarantine findings (KK-13)

/**
 * Append one engine-attributed quarantine finding per quarantined concept
 * (capture content policy §3.4: concept ids, codes, and paths only).
 * Returns the root-relative fragment paths, sorted.
 */
function logQuarantines(root, verdicts, today) {
  const logged = [];
  for (const v of verdicts) {
    if (v.verdict !== 'quarantined') continue;
    const codes = [...new Set(v.evidence.map((e) => e.code))].sort(compare);
    const paths = [...new Set(v.evidence.flatMap((e) => [e.file, e.source]).filter(Boolean))].sort(compare);
    const { file } = createEntry({
      root, log: 'findings', date: today,
      fields: {
        trigger: 'quarantine',
        session: 'engine/preflight.js',
        summary: `preflight quarantined ${v.concept}: ${codes.join(', ')} (${paths.join(', ')})`,
        ...(CONCEPT_REF.test(v.concept) ? { consulted: { concepts: [v.concept] } } : {}),
      },
    });
    logged.push(file);
  }
  return logged.sort(compare);
}

// ------------------------------------------------------------- CLI plumbing

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
  {
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

    // Verdict computation owns the store-wide degradation decision; the
    // command projects the returned health into the existing wire shape.
    const { health: fullHealth, storeVerdict, verdicts, leafVerdicts } = computeVerdicts(model, {
      concepts: opts.concepts, leaves: opts.leaves, repoRoot: opts.root, today: opts.today,
    });
    const health = healthSummary(fullHealth);
    const storeErrors = fullHealth.errors
      .map(({ code, file, path, message }) => ({ code, file, path, message }));

    // Empty/omitted --concepts AND --leaves: store-health-only — exit on the
    // store verdict alone (§7); no per-record check runs, so no per-record
    // verdict exists. Either flag alone selects that flag's records; both
    // select both, because "which concepts" and "which leaves" are two
    // questions and a run may legitimately ask one, the other, or both.
    const wantConcepts = !!opts.concepts && opts.concepts.length > 0;
    const wantLeaves = !!opts.leaves && opts.leaves.length > 0;
    const storeHealthOnly = !wantConcepts && !wantLeaves;

    // Counted TOGETHER, over both verdict lists. Splitting the counts would let
    // a run exit 0 on clean concepts while a requested leaf was quarantined —
    // the gate reading as clean about the half of the question it liked.
    const all = [...verdicts, ...leafVerdicts];
    const counts = {
      trusted: all.filter((v) => v.verdict === 'trusted').length,
      quarantined: all.filter((v) => v.verdict === 'quarantined').length,
      unknown: all.filter((v) => v.verdict === 'unknown').length,
      // Counted separately (UCS-1150) so a stale leaf is visible in the tally
      // rather than absorbed into a class that means something else. `ok`
      // below still requires trusted === all.length, so a stale leaf gates.
      stale: all.filter((v) => v.verdict === 'stale').length,
    };
    const logged = opts.log ? logQuarantines(model.root, verdicts, opts.today) : null;

    const ok = storeHealthOnly
      ? storeVerdict === 'trusted'
      : storeVerdict === 'trusted' && counts.trusted === all.length;
    const payload = {
      ok,
      // The mode names what was ASKED. `leaves` and `concepts+leaves` are new
      // (UCS-1149); a run that named only concepts reads exactly as it did
      // before, so no existing consumer sees a shape it did not ask for.
      mode: storeHealthOnly
        ? 'store-health'
        : [wantConcepts ? 'concepts' : null, wantLeaves ? 'leaves' : null].filter(Boolean).join('+'),
      'store-verdict': storeVerdict,
      'store-health': health,
      ...(storeErrors.length ? { 'store-errors': storeErrors } : {}),
      counts,
      verdicts,
      // Present only when leaves were asked about, for the same reason `mode`
      // still says `concepts`: a --concepts-only run's JSON is unchanged.
      // `time-check` rides the same condition — leaves are the only records the
      // time facet governs, so a concepts-only run has no time check to report
      // and inventing one would answer a question nobody asked. When leaves
      // ARE asked about, it is always present: a run that computed no freshness
      // verdicts must never look like one that checked and found them fresh.
      ...(wantLeaves ? { 'time-check': timeCheckStatus(opts.today), 'leaf-verdicts': leafVerdicts } : {}),
      ...(logged ? { logged } : {}),
    };

    const lines = opts.json ? [JSON.stringify(payload, null, 2)] : renderHuman(payload);
    process.stdout.write(`${lines.join('\n').replace(/\n+$/, '')}\n`);

    // Exit-code contract (PRD §5, D-011): only all-trusted reads as clean.
    // Any unknown — store-wide failure or a draft/proposed skip — gates at 2:
    // its checks never ran, and that is a blocking defect, never exit 0.
    if (storeHealthOnly) return storeVerdict === 'trusted' ? EXIT_CODES.CLEAN : EXIT_CODES.FAILURE;
    if (storeVerdict !== 'trusted' || counts.unknown > 0) return EXIT_CODES.FAILURE;
    // A stale verdict gates at 1, alongside quarantine, and NOT at 2 (UCS-1150).
    // The distinction is the one the exit contract already draws: 2 means a
    // check never ran, and the time check ran — it returned a definite answer
    // a steward can act on. Rotted knowledge is a finding to fix, not a broken
    // engine, and only an all-trusted run still reads as clean.
    return counts.quarantined > 0 || counts.stale > 0 ? EXIT_CODES.FINDINGS : EXIT_CODES.CLEAN;
  }
}
