/**
 * Phoenix events (KK-34) — apply a governed bulk re-taxonomy (UCS-1154).
 *
 * The first engine command that MUTATES a store, which is why almost all of it
 * is about refusing to.
 *
 * A phoenix event rewrites a drifted subtree's facets in bulk from a
 * leaf-granular mapping, bumps the `edition` of every leaf it moves — the only
 * thing that ever bumps it in v2 — and lands as an ordinary PR. Citations are
 * untouched by construction: identity is the accession id, and no event ever
 * changes one, so nothing that cites a leaf notices it was reclassified.
 *
 * Two verbs, and the read-only one is the default:
 *
 *   --check   (default) plan the event and report. Writes nothing, ever.
 *   --apply   plan the event, and write ONLY if the plan is completely clean.
 *
 * `--check` is the default because the safe reading of a bare `phoenix` is the
 * one that cannot damage a store. An agent that runs the command without
 * reading this file gets a dry run; mutating takes a word typed on purpose.
 *
 * Exit codes follow the engine contract (PRD §5, D-011), and the classification
 * of a rejected mapping is the load-bearing choice here. A mapping that misses
 * a leaf in its declared scope, or names an accession the store does not carry,
 * is FINDINGS — exit 1. The precedent is the one every other surface follows:
 * exit 1 means the run happened and the input has defects its author fixes,
 * which is exactly what a bad mapping is. Exit 2 stays reserved for a run that
 * never happened (unreadable store, unparseable mapping, no such event), where
 * an agent must not conclude anything about the store at all.
 *
 * A rejected event NEVER writes. The gate is total and it runs first: the whole
 * mapping is planned against the whole store before a single byte is written,
 * and any finding refuses the entire event. There is no partial apply, because
 * a half-re-taxonomized store is worse than an untouched one — the next run
 * cannot tell which leaves already moved.
 */
import { resolve } from 'node:path';
import { locateKitRoot } from '../lib/kit-root.js';
import { loadStores, storeHealth, healthSummary, PHOENIX_DIR } from '../lib/load-stores.js';
import { CHECKS, applyRewrites, planEvent, phoenixPath } from '../lib/phoenix.js';
import { compare } from '../lib/validate-record.js';
import { EXIT_CODES } from '../lib/exit-codes.js';
import { parseArgs as parseFlags, rethrowIfBug, UsageError } from '../lib/cli.js';

export const USAGE = 'usage: node payload/engine/phoenix.js <event> [--apply] [--check] [--root <dir>] [--json]';

function parseArgs(argv) {
  const { options, positionals } = parseFlags(argv, {
    boolean: ['json', 'apply', 'check'],
    value: ['root'],
    positionals: true,
  });
  if (positionals.length > 1) {
    throw new UsageError(`unexpected argument ${JSON.stringify(positionals[1])} — one event at a time`);
  }
  if (!positionals.length) {
    throw new UsageError('name the phoenix event to apply, e.g. P-001 (its mapping is knowledge/_phoenix/<event>.yaml)');
  }
  // Naming both verbs states two intentions and the difference between them is
  // whether the store gets written to. Refusing is the only reading that cannot
  // silently pick the destructive one.
  if (options.apply && options.check) {
    throw new UsageError('--apply and --check are the two verbs; name one');
  }
  return {
    event: positionals[0],
    root: resolve(options.root ?? '.'),
    json: !!options.json,
    apply: !!options.apply,
  };
}

function render(payload) {
  const { event, verb, findings, rewrites, carried } = payload;
  const lines = [];
  if (findings.length) {
    lines.push(
      `phoenix ${event} -> REFUSED — ${findings.length} finding(s); nothing was written`,
      `checks run: ${CHECKS.join(', ')}`,
    );
    for (const f of findings) {
      lines.push(`${f.severity}  ${f.code}  ${f.id}  ${f.file}  ${f.path}`, `    ${f.message}`);
    }
    lines.push('a phoenix event applies in full or not at all — fix every finding and re-run');
    return lines;
  }
  const moved = `${rewrites.length} leaf/leaves rewritten, ${carried.length} carried forward`;
  lines.push(
    verb === 'apply'
      ? `phoenix ${event} -> APPLIED — ${moved}`
      : `phoenix ${event} -> would apply cleanly — ${moved} (nothing written; --apply to write)`,
    `checks run: ${CHECKS.join(', ')}`,
  );
  for (const r of rewrites) {
    lines.push(`  ${r.id}  ${r.from} -> ${r.to}  edition ${r.edition - 1} -> ${r.edition}  ${r.file}`);
  }
  for (const id of carried) lines.push(`  ${id}  carried forward — considered, unmoved, edition unchanged`);
  lines.push('accession ids and citations are untouched by construction — nothing that cites these leaves moved');
  return lines;
}

/**
 * CLI entry. Exit codes per the engine contract (PRD §5): 0 the event is clean
 * (and applied, under --apply), 1 the mapping was REFUSED with findings, 2 the
 * run never happened.
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
    process.stderr.write(`phoenix: ${error.message}\n`);
    return EXIT_CODES.FAILURE;
  }

  // A store the loader rejects cannot be re-taxonomized: the model the plan
  // would be built from is already known to be wrong, so every verdict about
  // which leaves are in scope would be untrustworthy — and under --apply we
  // would write from it. Exit 2: the event never ran.
  if (!model.ok) {
    const health = storeHealth(model);
    process.stderr.write(
      `phoenix: the store has ${health.errors.length} loader error(s); no event runs against a store that does not load\n`,
    );
    for (const d of health.errors) {
      process.stderr.write(`  ${d.code}  ${d.file}${d.path ? `  ${d.path}` : ''}  ${d.message}\n`);
    }
    return EXIT_CODES.FAILURE;
  }

  const event = model.phoenix.get(`knowledge/${opts.event}`);
  if (!event) {
    const known = [...model.phoenix.keys()].map((k) => k.split('/')[1]).sort(compare);
    process.stderr.write(
      `phoenix: no event "${opts.event}" — expected its mapping at ${phoenixPath('knowledge', opts.event)}`
      + `${known.length ? `; this store carries ${known.join(', ')}` : `; this store carries no ${PHOENIX_DIR}/ mappings`}\n`,
    );
    return EXIT_CODES.FAILURE;
  }

  const plan = planEvent(model, event);
  // THE GATE. Everything above decided; nothing above wrote. A single finding
  // refuses the whole event, and the write below is unreachable.
  const refused = plan.findings.length > 0;
  if (opts.apply && !refused) applyRewrites(model.root, plan.rewrites);

  const payload = {
    event: event.event,
    verb: opts.apply && !refused ? 'apply' : 'check',
    mapping: event.file,
    decision: event.decision,
    scope: event.scope,
    checks: CHECKS,
    'store-health': healthSummary(storeHealth(model)),
    counts: { findings: plan.findings.length, rewritten: plan.rewrites.length, carried: plan.carried.length },
    findings: plan.findings,
    // The before/after text is deliberately not published: it would make the
    // JSON enormous and the diff is what `git diff` is for. What ships is the
    // claim a reviewer checks — which leaf moved where, and to which edition.
    rewrites: plan.rewrites.map(({ id, file, from, to, edition }) => ({ id, file, from, to, edition })),
    carried: plan.carried,
  };
  const lines = opts.json ? [JSON.stringify(payload, null, 2)] : render(payload);
  process.stdout.write(`${lines.join('\n').replace(/\n+$/, '')}\n`);
  return refused ? EXIT_CODES.FINDINGS : EXIT_CODES.CLEAN;
}
