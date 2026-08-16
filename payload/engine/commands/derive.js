/**
 * The derived layer (UCS-1158) — generate the browse trees and resolution index.
 *
 * The second engine command that writes, and it follows the first one's shape
 * (phoenix, UCS-1154): the read-only verb is the DEFAULT, and writing takes a
 * word typed on purpose.
 *
 *   --check   (default) compute the layer and compare it to what is on disk.
 *   --write   compute the layer and write it, replacing the directory whole.
 *
 * What makes this command different from phoenix is what it is allowed to
 * destroy. Phoenix rewrites authored leaves, so its gate is total and a single
 * finding refuses the event. This command writes only into `knowledge/derived/`,
 * a directory whose entire contract is that deleting it loses nothing — so the
 * dangerous direction is reversed. The risk is not that a write destroys
 * something; it is that something starts DEPENDING on the output, at which
 * point the layer is no longer disposable and the store has quietly acquired a
 * second source of truth. Three things hold that line:
 *
 *   - the loader skips `derived/` by name, so no generated artifact can enter
 *     the model or affect store health (lib/load-stores.js, DERIVED_DIR);
 *   - `--check` exits FINDINGS when the on-disk layer differs from the computed
 *     one, so a stale or hand-edited artifact is reported rather than believed;
 *   - the round-trip test deletes the directory, regenerates, and asserts the
 *     bytes are identical — which fails the moment anything unreproducible
 *     starts living here.
 *
 * `--check` returning FINDINGS is the right code rather than FAILURE: the check
 * RAN, and what it found is a real defect its author fixes by re-running with
 * --write. Exit 2 stays reserved for a run that never happened.
 *
 * TIME VERDICTS NEED --today, ALWAYS INJECTED. The trees annotate stale leaves,
 * and staleness is measured from an injected date — never the wall clock (D-012,
 * PRD §5). Without `--today` the time verdicts are `skipped` and every artifact
 * SAYS so in its header; it is never a silent pass, and the artifacts stay
 * byte-stable across runs, which is the property baseline diffing rests on.
 * That also means `--today` changes the output: two runs on different injected
 * dates legitimately differ, and the check compares against whatever date this
 * invocation named.
 */
import {
  mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { locateKitRoot } from '../lib/kit-root.js';
import { loadStores, storeHealth, healthSummary, DERIVED_DIR } from '../lib/load-stores.js';
import {
  AXES, DERIVED_BANNER, RECALL_SLOT, demotionsFor, deriveArtifacts,
} from '../lib/derived.js';
import { compare } from '../lib/validate-record.js';
import { timeCheckStatus } from '../lib/time-verdicts.js';
import { isCalendarDate } from '../lib/iso-date.js';
import { EXIT_CODES } from '../lib/exit-codes.js';
import { parseArgs as parseFlags, rethrowIfBug, UsageError } from '../lib/cli.js';

export const USAGE = 'usage: node payload/engine/derive.js [--write] [--check] [--root <dir>] [--today <YYYY-MM-DD>] [--json]';

function parseArgs(argv) {
  const { options } = parseFlags(argv, {
    boolean: ['json', 'write', 'check'],
    value: ['root', 'today'],
  });
  // Naming both verbs states two intentions whose difference is whether the
  // directory gets rewritten. Refusing is the only reading that cannot silently
  // pick the writing one.
  if (options.write && options.check) {
    throw new UsageError('--write and --check are the two verbs; name one');
  }
  const today = options.today ?? null;
  if (today !== null && !isCalendarDate(today)) {
    // The shape AND the calendar: 2026-02-30 matches the pattern and names no
    // day, and an age measured from it is a number nobody's calendar agrees
    // with (UCS-957). Same refusal the resolver makes.
    throw new UsageError(`--today must be a real calendar date (YYYY-MM-DD), got ${JSON.stringify(today)}`);
  }
  return {
    root: resolve(options.root ?? '.'),
    json: !!options.json,
    write: !!options.write,
    today,
  };
}

/**
 * ENOENT is the ONLY read failure that means "this is not there".
 *
 * Every other errno means the engine could not LOOK: EACCES (no permission),
 * EIO (the disk failed), EMFILE (out of descriptors), ENOTDIR (something on the
 * path is a file). Reading any of those as an empty layer would let `--check`
 * report the layer cleanly regenerable when nothing was actually examined —
 * the silent pass the exit-code contract exists to prevent (PRD §5). A check
 * that never ran is a blocking defect, so those rethrow and surface as exit 2.
 *
 * ENOTDIR is deliberately on the ERROR side of that line. If `knowledge/derived`
 * exists as a FILE, the layer is not absent — it is corrupted, and `--write`
 * would have to delete a file the engine never created. Reporting that as
 * `derived-missing` would tell an author to regenerate, when what they need to
 * know is that something is squatting on the directory's name.
 *
 * @param {unknown} error a caught filesystem error
 * @returns {boolean} whether it means the path simply does not exist
 */
const isAbsent = (error) => error?.code === 'ENOENT';

/**
 * Every file currently under the derived directory, relative to the store root.
 *
 * A missing directory reads as no files, not as an error: the layer being absent
 * is the ordinary state of a fresh clone (it is engine output), and it is the
 * exact state the round-trip test creates on purpose. Every OTHER failure
 * rethrows — see `isAbsent`.
 *
 * @param {string} root the store root
 * @returns {string[]} sorted relative paths
 * @throws when the directory exists but could not be read
 */
function existingArtifacts(root) {
  const dir = join(root, 'knowledge', DERIVED_DIR);
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true, recursive: true });
  } catch (error) {
    if (isAbsent(error)) return [];
    throw error;
  }
  return entries
    .filter((e) => e.isFile())
    .map((e) => {
      // `parentPath` is absolute; make it relative to the store root and
      // forward-slashed, so the comparison is platform-identical.
      const rel = join(e.parentPath ?? dir, e.name).slice(root.length + 1);
      return rel.split(/[\\/]/).join('/');
    })
    .sort(compare);
}

/**
 * Compare the computed layer against what is on disk.
 *
 * Three defect classes, each its own finding code, because they call for
 * different edits: a MISSING artifact means the layer was never generated (or
 * was partly deleted), a STALE one means the store changed since it was, and an
 * UNEXPECTED one means a file is living in the derived directory that no axis
 * generates — which is the drift that would make the layer load-bearing.
 *
 * @param {string} root the store root
 * @param {Array<{path: string, text: string}>} artifacts the computed layer
 * @returns {Array<object>} findings, sorted
 */
function checkArtifacts(root, artifacts) {
  const findings = [];
  const expected = new Set(artifacts.map((a) => a.path));
  for (const artifact of artifacts) {
    let actual;
    try {
      actual = readFileSync(join(root, artifact.path), 'utf8');
    } catch (error) {
      // Same rule as `existingArtifacts`: only ENOENT is a missing artifact.
      // An unreadable file is not an absent one, and calling it `derived-missing`
      // would send an author to regenerate a layer whose real problem is that
      // the engine could not read it.
      if (!isAbsent(error)) throw error;
      findings.push({
        severity: 'error',
        code: 'derived-missing',
        file: artifact.path,
        message: 'this derived artifact is absent — regenerate the layer with --write (nothing is lost by doing so)',
      });
      continue;
    }
    if (actual !== artifact.text) {
      findings.push({
        severity: 'error',
        code: 'derived-stale',
        file: artifact.path,
        message: 'this derived artifact differs from what the store projects — the leaves changed, '
          + 'or the file was hand-edited; regenerate with --write, and never edit a derived file',
      });
    }
  }
  for (const found of existingArtifacts(root)) {
    if (expected.has(found)) continue;
    findings.push({
      severity: 'error',
      code: 'derived-unexpected',
      file: found,
      message: 'no axis generates this file, so regenerating the layer would delete it — '
        + 'nothing may live in the derived directory that the engine does not produce',
    });
  }
  return findings.sort((a, b) => compare(a.file, b.file) || compare(a.code, b.code));
}

/**
 * Replace the derived directory with the computed artifacts.
 *
 * Removes the whole directory first, deliberately. A merge-write would leave
 * behind artifacts from a previous axis table — a tree for an axis that no
 * longer exists, still looking authoritative — and the layer's promise is that
 * what is there is what the store currently projects. Removing first is safe
 * precisely because this directory holds nothing that is not regenerable, which
 * is the same property the round-trip test asserts.
 *
 * @param {string} root the store root
 * @param {Array<{path: string, text: string}>} artifacts
 */
function writeArtifacts(root, artifacts) {
  rmSync(join(root, 'knowledge', DERIVED_DIR), { recursive: true, force: true });
  for (const artifact of artifacts) {
    const file = join(root, artifact.path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, artifact.text);
  }
}

function render(payload) {
  const { verb, findings, artifacts, counts } = payload;
  const lines = [];
  if (findings.length) {
    lines.push(
      `derive -> ${findings.length} finding(s) — the derived layer is not what the store projects`,
    );
    for (const f of findings) lines.push(`${f.severity}  ${f.code}  ${f.file}`, `    ${f.message}`);
    lines.push('regenerate with --write; a derived artifact is never hand-edited');
  } else {
    lines.push(verb === 'write'
      ? `derive -> WROTE ${artifacts.length} artifact(s) — ${counts.leaves} leaf/leaves across ${payload.axes.length} axes`
      : `derive -> up to date — ${artifacts.length} artifact(s) match what the store projects`);
  }
  for (const a of artifacts) lines.push(`  ${a}`);
  lines.push(`time verdicts: ${payload['time-check']}`);
  lines.push(`demoted leaves: ${counts.demoted} (annotated in every tree, never hidden)`);
  lines.push(`embedding recall: ${RECALL_SLOT.status} — ${RECALL_SLOT['out-of-scope-here']}`);
  lines.push(DERIVED_BANNER);
  return lines;
}

/**
 * CLI entry. Exit codes per the engine contract (PRD §5): 0 the layer is
 * up to date (or was written), 1 the on-disk layer differs from what the store
 * projects, 2 the run never happened.
 *
 * @param {string[]} argv
 * @returns {number} an exit code
 */
export function main(argv) {
  const opts = parseArgs(argv); // a UsageError reaches the harness

  let model;
  try {
    model = loadStores(locateKitRoot(opts.root));
  } catch (error) {
    rethrowIfBug(error); // a bug is not a refusal — the harness prints its stack
    process.stderr.write(`derive: ${error.message}\n`);
    return EXIT_CODES.FAILURE;
  }

  // A store the loader rejects cannot be projected: the trees would file leaves
  // by facets no check approved, and under --write we would publish them. The
  // derived layer's claim is that it says what the store says, and a store that
  // does not load has not said anything yet. Exit 2 — the generation never ran.
  if (!model.ok) {
    const health = storeHealth(model);
    process.stderr.write(
      `derive: the store has ${health.errors.length} loader error(s); nothing is projected from a store that does not load\n`,
    );
    for (const d of health.errors) {
      process.stderr.write(`  ${d.code}  ${d.file}${d.path ? `  ${d.path}` : ''}  ${d.message}\n`);
    }
    return EXIT_CODES.FAILURE;
  }

  const artifacts = deriveArtifacts(model.leaves.values(), opts.today);

  let findings = [];
  if (opts.write) {
    try {
      writeArtifacts(model.root, artifacts);
    } catch (error) {
      rethrowIfBug(error); // a bug is not a refusal — the harness prints its stack
      // A filesystem failure part-way through leaves the directory incomplete.
      // Exit 2, never 1: the generation did not finish, and an agent reading 1
      // would conclude the layer was cleanly checked and found wanting. The
      // remedy is the same either way and costs nothing — re-run with --write,
      // because nothing here is authored.
      process.stderr.write(
        `derive: writing the derived layer FAILED part-way through — the directory is incomplete\n`
        + `  ${error.message}\n`
        + `  re-run with --write; the derived layer is regenerable, so nothing is lost\n`,
      );
      return EXIT_CODES.FAILURE;
    }
  } else {
    try {
      findings = checkArtifacts(model.root, artifacts);
    } catch (error) {
      rethrowIfBug(error); // a bug is not a refusal — the harness prints its stack
      // The engine could not READ the layer — a permission, I/O, or ENOTDIR
      // failure, never a merely absent directory (that returns cleanly, and is
      // the ordinary state of a fresh clone). Exit 2, never 1: nothing was
      // compared, so there are no findings to report, and an agent reading 1
      // would conclude the layer had been checked and found wanting.
      process.stderr.write(
        `derive: the derived layer could not be READ, so nothing was checked\n`
        + `  ${error.message}\n`
        + `  this is not a stale layer — the engine never got to look; fix the path and re-run\n`,
      );
      return EXIT_CODES.FAILURE;
    }
  }

  // Counted off the same predicate the trees annotate with, so the summary
  // cannot report a different number of demoted leaves than the artifacts show.
  let demoted = 0;
  for (const entry of model.leaves.values()) {
    if (demotionsFor(entry.record, opts.today).length) demoted += 1;
  }

  const payload = {
    verb: opts.write ? 'write' : 'check',
    directory: `knowledge/${DERIVED_DIR}`,
    note: DERIVED_BANNER,
    'time-check': timeCheckStatus(opts.today),
    axes: AXES.map((a) => ({ key: a.key, label: a.label, audience: a.audience })),
    'recall-slot': RECALL_SLOT,
    'store-health': healthSummary(storeHealth(model)),
    counts: { leaves: model.leaves.size, demoted, findings: findings.length },
    artifacts: artifacts.map((a) => a.path),
    findings,
  };
  const lines = opts.json ? [JSON.stringify(payload, null, 2)] : render(payload);
  process.stdout.write(`${lines.join('\n').replace(/\n+$/, '')}\n`);
  return findings.length ? EXIT_CODES.FINDINGS : EXIT_CODES.CLEAN;
}
