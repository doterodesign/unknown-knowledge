#!/usr/bin/env node
/**
 * Value validator (KK-07) — blocking-grade rung-2 checks (PRD §4). Runs every
 * `enumerates` recipe on the loaded ontology: parses the named source with the
 * descriptor's extractor kind, extracts the actual value set, and diffs it
 * against the claim IN BOTH DIRECTIONS. §3.5 equality: values are strings,
 * compared byte-exact and case-sensitive, as sets — order irrelevant,
 * duplicates in source are a finding.
 *
 *   node payload/engine/validate-values.js [--concepts <ids>] [--json] [--root <dir>]
 *
 * Findings (exit 1 when any is error-severity):
 *   value-not-in-source    a claimed value the source does not carry
 *   source-value-missing   a source value the claim does not carry
 *   duplicate-source-value the source declares the same value twice (§3.5:
 *                          sets — a duplicate is a defect, never a bigger set)
 *   wrong-pointer          ALL claimed values missing from a real, parseable
 *                          file — the descriptor points at the wrong place;
 *                          one distinct finding, never a per-value cascade
 *
 * Hard errors (exit 2 — a check that never ran is a blocking defect, never a
 * silent pass, PRD §5):
 *   - a store the single health model marks unhealthy: every error-severity
 *     loader diagnostic (including the KK-02 malformed-descriptor codes
 *     non-string-enumerates-value / duplicate-enumerates-value /
 *     enumerates-source-not-listed) is surfaced as a hard error and no value
 *     check runs — an unprovable claim silently passing would re-open the gap
 *     this validator closes
 *   unknown-kind     the descriptor names an extractor kind the registry does
 *                    not carry — nothing can re-derive the claim
 *   source-missing   the named source file does not exist / is unreadable
 *   out-of-envelope  an out-of-envelope sentinel appears in the matched span
 *                    (PRD §5: a confident wrong parse is a false all-clear)
 *   extract-failed   the kind's recipe could not parse the source
 *
 * §3.5 status semantics: draft/proposed concepts are skipped (structural
 * checks only — preflight verdicts them unknown); active is blocking-grade;
 * deprecated demotes value findings AND the path-existence/envelope hard
 * errors to warnings — deprecation is precisely the state that stops the
 * blocking check from dead-ending a legitimate source deletion (§3.5).
 * A malformed descriptor or unknown kind stays hard on every status.
 *
 * Extractor kinds are registered by NAME in lib/extractor-kinds.js — a small
 * deterministic recipe `extract(text, descriptor) -> string[]` that reads a
 * value set out of a reified anchor, throwing EnvelopeError / ExtractError.
 * KK-08 ships the TS/JS + JSON kinds; KK-09 (Swift/config) and KK-10
 * (dir-modules) extend the registry; `test-lines` (newline-delimited registry
 * files) proves dispatch, the envelope hard-error path, and determinism.
 * D-014: kinds parse lexically only — the engine never executes client code.
 *
 * --root is the REPO root (default cwd): descriptor sources and
 * source-of-truth pointers are repo-relative (§9.1 — a post-init repo nests
 * the kit inside the codebase its pointers describe). The stores load from
 * <root>/unknown-knowledge/ when that directory exists, else from <root>
 * itself (the kit repo's own dogfood layout).
 *
 * Consumes the KK-04 loader's model — never re-parses stores. Output is
 * deterministic and stable-sorted (findings by concept/path/code/value), no
 * wall-clock timestamps. Exit codes (PRD §5, D-011): 0 clean, 1 findings,
 * 2 engine failure / check-never-ran.
 */
import process from 'node:process';
import { readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadStores } from './lib/load-stores.js';
import { EXIT_CODES } from './lib/exit-codes.js';
import { compare } from './lib/validate-record.js';
import { KINDS, EnvelopeError, ExtractError } from './lib/extractor-kinds.js';

const USAGE = 'usage: node payload/engine/validate-values.js [--concepts <ids>] [--json] [--root <dir>]';

class UsageError extends Error {}

/** The §9.1 seeded kit directory name; stores live there in a client repo. */
const KIT_DIR_DEFAULT = 'unknown-knowledge';

/** Store root for a repo root: <root>/unknown-knowledge/ if present, else root. */
function locateKitRoot(root) {
  const nested = join(root, KIT_DIR_DEFAULT);
  return statSync(nested, { throwIfNoEntry: false })?.isDirectory() ? nested : root;
}

// ------------------------------------------------------------ the check body

const isObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Run one descriptor: dispatch to its kind, read the source, diff both ways.
 * Pushes findings/hard-errors into ctx; never throws for check outcomes.
 */
function checkDescriptor(ctx, concept, descriptor, i) {
  const { id, file } = concept;
  const path = `enumerates[${i}]`;
  const deprecated = concept.record.status === 'deprecated';
  const severity = deprecated ? 'warning' : 'error';
  // deprecated demotes path-existence/envelope to warning findings (§3.5);
  // malformed/unknown-kind stay hard on every status.
  const never = (code, message, extra = {}) => {
    const entry = { concept: id, code, file, path, source: descriptor.source, message, ...extra };
    if (deprecated && (code === 'source-missing' || code === 'out-of-envelope')) {
      ctx.findings.push({ ...entry, severity: 'warning' });
    } else {
      ctx.hardErrors.push(entry);
    }
  };

  const extract = KINDS[descriptor.kind];
  if (!extract) {
    ctx.hardErrors.push({
      concept: id, code: 'unknown-kind', file, path, source: descriptor.source,
      message: `extractor kind "${descriptor.kind}" is not registered — nothing can re-derive this claim, and an unprovable claim must never silently pass (PRD §4); registered kinds: ${Object.keys(KINDS).sort(compare).join(', ')}`,
    });
    return;
  }

  let text;
  try {
    text = readFileSync(join(ctx.root, descriptor.source), 'utf8');
  } catch (error) {
    never('source-missing', `cannot read source ${JSON.stringify(descriptor.source)}: ${error.message}`);
    return;
  }

  let actual;
  try {
    actual = extract(text, descriptor);
  } catch (error) {
    if (error instanceof EnvelopeError) {
      never('out-of-envelope', error.message);
    } else if (error instanceof ExtractError) {
      never('extract-failed', error.message);
    } else {
      throw error; // a kind bug is an engine failure, not a finding
    }
    return;
  }

  const claimed = descriptor.values;
  const actualSet = new Set();
  for (const value of actual) {
    if (actualSet.has(value)) {
      ctx.findings.push({
        concept: id, code: 'duplicate-source-value', severity, file, path,
        source: descriptor.source, value,
        message: `source declares ${JSON.stringify(value)} more than once — values compare as sets (§3.5), so a duplicate is a source defect, never a bigger set`,
      });
    }
    actualSet.add(value);
  }

  // Wrong-pointer signature (PRD §4): the file is real and parseable, yet
  // carries NONE of the claimed values — one finding, not a cascade.
  if (claimed.length && claimed.every((v) => !actualSet.has(v))) {
    ctx.findings.push({
      concept: id, code: 'wrong-pointer', severity, file, path,
      source: descriptor.source,
      message: `all ${claimed.length} claimed value(s) are missing from ${JSON.stringify(descriptor.source)} — the file exists and parses (${actualSet.size} value(s) extracted), so the descriptor points at the wrong place`,
    });
    return;
  }

  const claimedSet = new Set(claimed);
  for (const value of claimed) {
    if (!actualSet.has(value)) {
      ctx.findings.push({
        concept: id, code: 'value-not-in-source', severity, file, path,
        source: descriptor.source, value,
        message: `claimed value ${JSON.stringify(value)} is not in ${JSON.stringify(descriptor.source)} (byte-exact, case-sensitive, §3.5)`,
      });
    }
  }
  for (const value of actualSet) {
    if (!claimedSet.has(value)) {
      ctx.findings.push({
        concept: id, code: 'source-value-missing', severity, file, path,
        source: descriptor.source, value,
        message: `source value ${JSON.stringify(value)} in ${JSON.stringify(descriptor.source)} is not claimed by the descriptor`,
      });
    }
  }
}

/** Select the concepts to check; an unknown id is a check that never ran. */
function selectConcepts(model, ids) {
  if (!ids) return [...model.concepts.values()];
  const unknown = ids.filter((id) => !model.concepts.has(id));
  if (unknown.length) {
    throw new UsageError(`--concepts names id(s) not in the ontology: ${unknown.join(', ')} — a check that never ran is a blocking defect, never a silent pass (PRD §5)`);
  }
  return ids.map((id) => model.concepts.get(id));
}

/**
 * Run every enumerates check over a loaded model — the reusable seam
 * preflight (KK-26) consumes, so verdicts and this validator can never
 * disagree. `conceptIds` null = all concepts; an unknown id throws (a check
 * that never ran is a blocking defect). `repoRoot` is where descriptor
 * sources resolve (§9.1 repo-relative); it defaults to the store root, the
 * flat layout where both coincide. Returns { findings, hardErrors,
 * checked }, stable-sorted.
 */
export function validateValues(model, conceptIds, repoRoot = model.root) {
  // Sources are repo-relative (§9.1), not store-relative: in a seeded repo
  // the stores sit at <repo>/unknown-knowledge/ but point at <repo>/src/....
  const ctx = { root: repoRoot, findings: [], hardErrors: [], checked: [] };

  // Single health model: the loader already validated every descriptor's
  // shape (KK-02 codes). An unhealthy store means the value check cannot
  // certify anything — surface the diagnostics as hard errors and stop.
  const storeErrors = model.diagnostics.filter((d) => d.severity === 'error');
  if (storeErrors.length) {
    ctx.hardErrors = storeErrors.map(({ code, file, path, message }) => ({
      concept: null, code, file, path, source: null, message,
    }));
    return ctx;
  }

  for (const concept of selectConcepts(model, conceptIds)) {
    const { id, file, record } = concept;
    const descriptors = Array.isArray(record.enumerates) ? record.enumerates : [];
    const entry = { concept: id, status: record.status ?? null, descriptors: descriptors.length };
    if (record.status === 'draft' || record.status === 'proposed') {
      // §3.5: structural checks only; the resolver downranks, preflight
      // verdicts unknown — the value check does not run.
      entry.skipped = record.status;
      ctx.checked.push(entry);
      continue;
    }
    ctx.checked.push(entry);
    descriptors.forEach((descriptor, i) => {
      if (!isObject(descriptor)) return; // shape defects already hard-errored via the loader
      checkDescriptor(ctx, { id, file, record }, descriptor, i);
    });
  }

  ctx.checked.sort((a, b) => compare(a.concept, b.concept));
  ctx.findings.sort((a, b) =>
    compare(a.concept, b.concept) || compare(a.path, b.path) || compare(a.code, b.code)
    || compare(a.value ?? '', b.value ?? ''));
  ctx.hardErrors.sort((a, b) =>
    compare(a.concept ?? '', b.concept ?? '') || compare(a.file ?? '', b.file ?? '')
    || compare(a.path ?? '', b.path ?? '') || compare(a.code, b.code));
  return ctx;
}

// ------------------------------------------------------------- CLI plumbing

function parseArgs(argv) {
  const opts = { json: false, root: process.cwd(), concepts: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    // Both conventional flag spellings: `--flag value` and `--flag=value`.
    const eq = arg.startsWith('--') ? arg.indexOf('=') : -1;
    const flag = eq === -1 ? arg : arg.slice(0, eq);
    if (flag === '--json') {
      if (eq !== -1) throw new UsageError('--json takes no value');
      opts.json = true;
    } else if (flag === '--root' || flag === '--concepts') {
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
      if (flag === '--root') opts.root = value;
      else opts.concepts = [...(opts.concepts ?? []), ...value.split(',').filter(Boolean)];
    } else if (arg.startsWith('--')) {
      throw new UsageError(`unknown flag ${arg}`);
    } else {
      throw new UsageError(`unexpected argument ${JSON.stringify(arg)} — this CLI takes flags only`);
    }
  }
  if (opts.concepts && !opts.concepts.length) {
    throw new UsageError('--concepts must name at least one concept id');
  }
  return opts;
}

function renderHuman(payload) {
  const lines = [];
  const f = payload.findings.length;
  const h = payload['hard-errors'].length;
  const checked = payload.checked.filter((c) => !c.skipped).length;
  const skipped = payload.checked.length - checked;
  lines.push(
    `validate-values: ${checked} concept(s) checked, ${skipped} skipped (draft/proposed), `
    + `${f} finding${f === 1 ? '' : 's'}, ${h} hard error${h === 1 ? '' : 's'}`,
    '',
  );
  for (const e of payload['hard-errors']) {
    lines.push(`HARD ERROR ${e.code}  ${e.concept ?? e.file}${e.source ? `  (source: ${e.source})` : ''}`);
    lines.push(`  ${e.message}`);
  }
  if (h) {
    lines.push('', 'the check never ran on the entries above — fix the descriptors/store first (PRD §4: a malformed descriptor is a hard error, never skipped)', '');
  }
  for (const x of payload.findings) {
    lines.push(`${x.severity === 'warning' ? 'warning' : 'FINDING'} ${x.code}  ${x.concept}${x.value !== undefined ? `  ${JSON.stringify(x.value)}` : ''}  (source: ${x.source})`);
    lines.push(`  ${x.message}`);
  }
  if (!f && !h) lines.push('every enumerates claim agrees with its source (both directions, §3.5 set equality)');
  return lines;
}

function main(argv) {
  try {
    const opts = parseArgs(argv);

    let model;
    try {
      model = loadStores(locateKitRoot(opts.root));
    } catch (error) {
      process.stderr.write(`validate-values: ${error.message}\n`);
      return EXIT_CODES.FAILURE;
    }

    const ctx = validateValues(model, opts.concepts, opts.root);
    const hard = ctx.hardErrors.length > 0;
    const blocking = ctx.findings.some((x) => x.severity === 'error');
    const payload = {
      ok: !hard && !blocking,
      'store-health': {
        ok: model.ok,
        errors: model.diagnostics.filter((d) => d.severity === 'error').length,
        warnings: model.diagnostics.filter((d) => d.severity === 'warning').length,
      },
      checked: ctx.checked,
      findings: ctx.findings,
      'hard-errors': ctx.hardErrors,
    };

    const lines = opts.json ? [JSON.stringify(payload, null, 2)] : renderHuman(payload);
    process.stdout.write(`${lines.join('\n').replace(/\n+$/, '')}\n`);
    return hard ? EXIT_CODES.FAILURE : blocking ? EXIT_CODES.FINDINGS : EXIT_CODES.CLEAN;
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    process.stderr.write(`validate-values: ${error.message}\n${USAGE}\n`);
    return EXIT_CODES.FAILURE;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  // exitCode, never process.exit(): exit() drops queued async stdout writes,
  // so piped --json output would truncate at the ~64KB pipe buffer (corrupt
  // JSON with exit 0). Node exits on its own once stdout drains.
  process.exitCode = main(process.argv.slice(2));
}
