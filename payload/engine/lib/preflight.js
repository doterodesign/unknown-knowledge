/**
 * Preflight orchestration (UCS-953): compute fresh Verdicts, assemble the
 * command result, and optionally append quarantine findings. Verdict rules
 * stay in verdicts.js; this layer owns counts, the numeric exit contract,
 * and logging. It never renders or writes to stdout/stderr.
 */
import { healthSummary } from './load-stores.js';
import { computeVerdicts } from './verdicts.js';
import { EXIT_CODES } from './exit-codes.js';
import { compare } from './validate-record.js';
import { createEntry } from './log-entry.js';
import { timeCheckStatus } from './time-verdicts.js';

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

/**
 * @param {object} model freshly loaded Store
 * @param {object} options
 * @param {string} options.repoRoot repo root for source pointers
 * @param {string[] | null} [options.concepts] normalized concept ids
 * @param {string[] | null} [options.leaves] normalized leaf accession ids
 * @param {string | null} [options.today] injected calendar date
 * @param {boolean} [options.log] append quarantine findings (requires today)
 * @returns {{ payload: object, exitCode: number }}
 * @throws when computation or logging cannot complete; a partial logged run
 * may already have appended findings. Let the CLI guard report incompletion.
 */
export function runPreflight(model, { repoRoot, concepts = null, leaves = null, today = null, log = false }) {
  // Verdict computation owns the store-wide degradation decision; the
  // orchestration projects the returned health into the existing wire shape.
  const { health: fullHealth, storeVerdict, verdicts, leafVerdicts } = computeVerdicts(model, {
    concepts, leaves, repoRoot, today,
  });
  const health = healthSummary(fullHealth);
  const storeErrors = fullHealth.errors
    .map(({ code, file, path, message }) => ({ code, file, path, message }));

  // Empty/omitted --concepts AND --leaves: store-health-only — exit on the
  // store verdict alone (§7); no per-record check runs, so no per-record
  // verdict exists. Either flag alone selects that flag's records; both
  // select both, because "which concepts" and "which leaves" are two
  // questions and a run may legitimately ask one, the other, or both.
  const wantConcepts = !!concepts && concepts.length > 0;
  const wantLeaves = !!leaves && leaves.length > 0;
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
  const logged = log ? logQuarantines(model.root, verdicts, today) : null;

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
    ...(wantLeaves ? { 'time-check': timeCheckStatus(today), 'leaf-verdicts': leafVerdicts } : {}),
    ...(logged ? { logged } : {}),
  };
  // Unknown includes store-wide failure and skipped checks. Stale and
  // quarantined are completed findings; only checked success exits cleanly.
  const exitCode = storeVerdict !== 'trusted' || counts.unknown > 0
    ? EXIT_CODES.FAILURE
    : counts.quarantined > 0 || counts.stale > 0 ? EXIT_CODES.FINDINGS : EXIT_CODES.CLEAN;
  return { payload, exitCode };
}
