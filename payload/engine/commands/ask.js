/**
 * `ask` — one question in, a short ranked record list and a confidence tier out.
 *
 * The agent's first retrieval call. It replaces neither `resolve` (governed
 * vocabulary joins, residue findings, --paths, --doc) nor the typed Subject
 * queries (governed eligibility). It answers the question those two leave
 * open: which records is this question about, and is the knowledge base
 * likely to hold the answer?
 *
 * Output is small on purpose. The held-out evaluation lost four of seven
 * regressions to host output budgets, so the payload carries identities,
 * titles, files and the evidence behind the ranking, never record bodies. A
 * typical answer is well under 4 KB.
 *
 * Exit 0: the search ran (any tier, including `none`). Exit 2: it never ran.
 */
import process from 'node:process';
import { EXIT_CODES } from '../lib/exit-codes.js';
import { UsageError, parseArgs as parseFlags, rethrowIfBug } from '../lib/cli.js';
import { askPayload, loadAskIndex } from '../lib/ask-service.js';
import { UnknownFieldError } from '../lib/aggregate.js';

export const USAGE = [
  'usage: ask.js "<question>" [--root <repo>]... [--limit <n>] [--json]',
  '       ask.js --fields [--where field=value]... ["<words>"] [--root <repo>]... [--json]',
  '       ask.js --count-by <field> [--under S-NNNNNN] [--where field=value]... ["<words>"] [--top <n>] [--root <repo>]... [--json]',
].join('\n');

function parseArgs(argv) {
  const { options, positionals } = parseFlags(argv, {
    boolean: ['json', 'fields'],
    value: ['limit', 'count-by', 'under', 'top'],
    repeatable: ['root', 'where'],
    positionals: true,
  });
  const text = positionals.join(' ').trim();
  const mode = options.fields ? 'fields' : options['count-by'] ? 'count' : 'search';
  if (mode === 'search' && !text) throw new UsageError('nothing to ask — give a question, --count-by <field> or --fields');
  if (options.fields && options['count-by']) throw new UsageError('choose --fields or --count-by, not both');
  const integer = (name, fallback, max) => {
    const value = options[name] === undefined ? fallback : Number(options[name]);
    if (!Number.isInteger(value) || value < 1 || value > max) throw new UsageError(`--${name} must be an integer from 1 to ${max}`);
    return value;
  };
  const where = (options.where ?? []).map((clause) => {
    const at = clause.indexOf('=');
    if (at < 1 || at === clause.length - 1) throw new UsageError(`--where needs field=value, got ${JSON.stringify(clause)}`);
    return { field: clause.slice(0, at).trim(), value: clause.slice(at + 1).trim() };
  });
  if (mode === 'search' && (where.length || options.under)) throw new UsageError('--where and --under apply to --count-by and --fields');
  return {
    json: !!options.json,
    roots: options.root?.length ? options.root : [process.cwd()],
    mode,
    text,
    where,
    countBy: options['count-by'] ?? null,
    under: options.under ?? null,
    limit: integer('limit', 8, 50),
    top: integer('top', 10, 100),
  };
}

export function main(argv) {
  const opts = parseArgs(argv);
  let loaded;
  try {
    loaded = loadAskIndex(opts.roots);
  } catch (error) {
    process.stderr.write(`ask: ${error.message}\n`);
    rethrowIfBug(error);
    return EXIT_CODES.FAILURE;
  }
  let payload;
  try {
    payload = askPayload(loaded, opts);
  } catch (error) {
    if (error instanceof UnknownFieldError) throw new UsageError(error.message);
    throw error;
  }

  if (opts.json) {
    process.stdout.write(`${JSON.stringify(payload)}\n`);
    return EXIT_CODES.CLEAN;
  }
  const { health, multi } = loaded;
  const lines = health.every((h) => h.ok) ? [] : [`store health: NOT OK (${health.filter((h) => !h.ok).map((h) => `${h.installation}: ${h.errors} errors`).join('; ')})`];
  if (opts.mode !== 'search') {
    lines.push(JSON.stringify(payload, null, 2));
    process.stdout.write(`${lines.join('\n')}\n`);
    return EXIT_CODES.CLEAN;
  }
  const { tier } = payload.confidence;
  lines.push(`confidence: ${tier}  (coverage ${payload.confidence.coverage ?? '-'}, margin ${payload.confidence.margin ?? '-'})`);
  if (payload.confidence.unknown?.length) lines.push(`not in any record: ${payload.confidence.unknown.join(', ')}`);
  if (payload.confidence.missed?.length) lines.push(`not in top records: ${payload.confidence.missed.join(', ')}`);
  for (const r of payload.records) {
    lines.push(`  ${multi ? `${r.installation}/` : ''}${r.id}  ${r.title ?? ''}  [${r.kind}${r.status ? `, ${r.status}` : ''}]  ${r.file}`);
  }
  lines.push(payload.next);
  process.stdout.write(`${lines.join('\n')}\n`);
  return EXIT_CODES.CLEAN;
}
