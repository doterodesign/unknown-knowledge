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
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { healthSummary, loadStores, isPrePromotionStatus, leafIdentityOf, leafStage, normalizeConceptIds, selectConcepts, selectLeaves, storeHealth, UnknownConceptsError, UnknownLeavesError } from '../lib/load-stores.js';
import { locateKitRoot } from '../lib/kit-root.js';
import { EXIT_CODES } from '../lib/exit-codes.js';
import { UsageError, parseArgs as parseFlags, rethrowIfBug } from '../lib/cli.js';
import { compare } from '../lib/validate-record.js';
import { createEntry } from '../lib/log-entry.js';
import { runChecks } from './validate.js';
import { validateValues } from './validate-values.js';
import { isCalendarDate } from '../lib/iso-date.js';
// The Time facet (UCS-1150) — the same verdict function the resolver ranks on,
// so a leaf demoted stale there is never verdicted trusted here.
import { TIME_VERDICTS, timeCheckStatus, timeVerdict } from '../lib/time-verdicts.js';

export const USAGE = 'usage: node payload/engine/preflight.js [--concepts <ids>] [--leaves <ids>] [--json] [--root <dir>] [--today <YYYY-MM-DD>] [--log]';

/** finding.schema.json conceptRef — `consulted` only carries conforming ids. */
const CONCEPT_REF = /^K-[0-9]+$/;

/** The per-verdict next action (engine hint; conduct is protocol policy). */
const NEXT_ACTIONS = Object.freeze({
  trusted: 'proceed — this verdict was computed fresh this run; never cache it (a stale "trusted" is a false all-clear, D-011)',
  quarantined: 'treat the concept as untrusted and fix the error-severity evidence, then re-run preflight — what a session does meanwhile (quarantine-and-continue vs. fail-stop) is protocol-layer policy (KK-20, D-011)',
  'unknown-status': 'do not rely on the enumerated values — only structural checks ran (§3.5); promote the concept to active to make its checks blocking-grade, or verify against the source-of-truth directly',
  'unknown-stage': 'do not rely on this leaf — a pre-promotion stage means no moderator has verified its citations (UCS-1149); read the cited sources directly, or have the leaf promoted to a verified stage',
  'unknown-store': 'repair the store first (fix the loader error diagnostics), then re-run preflight — no check ran for this concept, and a check that never ran is a blocking defect, never a silent pass (PRD §5)',
  // The Time facet (UCS-1150). A stale leaf is not broken and its checks did
  // run — the action is re-verification against the sources, which is a
  // steward's job rather than a repair.
  stale: 're-verify this leaf against its cited sources and update its `verified` date, or treat the claim as unverified — the knowledge is past the pinned freshness limit for its volatility class, so nothing currently vouches for it (UCS-1150)',
  // A leaf that asked to be governed by time and gave nothing to measure from.
  // Its verdict can only ever be `undated`, so the fix is the missing field.
  'unknown-undated': 'add the `verified` date this leaf is missing — it declares a volatility class, so it is under time governance, but its age cannot be computed and its freshness can never be certified (UCS-1150); the validator reports the same omission as a missing-verified finding',
  // No --today was injected, so no freshness verdict was computed at all.
  'unknown-skipped': 'pass --today <YYYY-MM-DD> to compute time verdicts — this leaf declares a volatility class but nothing measured its age this run, and a check that never ran is never a silent pass (PRD §5, D-012)',
});

// ---------------------------------------------------------- verdict joining

/**
 * Join both validators' results to the requested concepts — one verdict per
 * concept. Only called on a healthy store (the store-wide degradation path
 * never reaches the validators: their checks would not have run).
 */
function computeVerdicts(model, ids, repoRoot) {
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
 * Attribution is by the finding's `id`, which for a leaf is its identity — the
 * accession when minted, the notation otherwise (UCS-1142/1144) — so a leaf is
 * matched by the same string the validator names it by, not by a second guess
 * at its id space.
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
 * Ids are resolved through `leafIdentityOf`, the same translation the healthy
 * path's `selectLeaves` uses. Looking them up raw would have made a leaf named
 * by NOTATION report under the caller's spelling with a null stage on a broken
 * store, and under its accession with its real stage on a healthy one — the
 * same leaf wearing two names depending on a condition that has nothing to do
 * with what it is called.
 */
function degradeAllLeaves(model, ids, today) {
  const errors = storeHealth(model).errorCount;
  // De-duplicated by IDENTITY, like selectLeaves: naming one leaf by both its
  // accession and its notation is one leaf, and emitting two verdict rows for
  // it would have a caller reconciling two answers about a single record. An
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
function degradeAll(model, ids) {
  const errors = storeHealth(model).errorCount;
  return ids.map((id) => ({
    concept: id, status: model.concepts.get(id)?.record.status ?? null, verdict: 'unknown',
    reason: `store-wide failure: the loader reported ${errors} error(s) — no check ran for any concept (single health model, PRD §4)`,
    'next-action': NEXT_ACTIONS['unknown-store'],
    evidence: [],
  })).sort((a, b) => compare(a.concept, b.concept));
}

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

    // One read of the one authority; the wire shape is a projection of it.
    const fullHealth = storeHealth(model);
    const health = healthSummary(fullHealth);
    const storeVerdict = model.ok ? 'trusted' : 'unknown';
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

    let verdicts = [];
    let leafVerdicts = [];
    if (wantConcepts) {
      // Store-wide failures degrade ALL requested verdicts to unknown: the
      // validators' checks never ran over a store that failed to load, and a
      // check that never ran is a blocking defect, never a silent pass.
      verdicts = model.ok ? computeVerdicts(model, opts.concepts, opts.root) : degradeAll(model, opts.concepts);
    }
    if (wantLeaves) {
      leafVerdicts = model.ok
        ? computeLeafVerdicts(model, opts.leaves, opts.root, opts.today)
        : degradeAllLeaves(model, opts.leaves, opts.today);
    }

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
