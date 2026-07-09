#!/usr/bin/env node
/**
 * engine/log-entry.js (KK-13) — CLI over lib/log-entry.js so agents append
 * and transition fragment-based log entries (PRD §3.4, D-010) without
 * hand-editing YAML.
 *
 *   node engine/log-entry.js create --log findings --date 2026-07-08 \
 *     --entry '{"trigger":"correction","summary":"K-210 stale per src/sports.ts"}'
 *
 *   node engine/log-entry.js transition --file logs/findings/2026-07-08-a3f2b9c4.yaml \
 *     --to proposed --date 2026-07-09 [--reason "..."]
 *
 * --date is mandatory (injectable dates — the helper never reads the wall
 * clock, PRD §5); --root defaults to the cwd. Prints the fragment path and
 * entry as JSON on stdout. Exit codes per PRD §5: 0 clean, 2 failure (an
 * illegal transition or invalid entry is a hard error, never a silent pass).
 *
 * Capture content policy (§3.4): entries carry concept IDs and file paths
 * only — never verbatim user text or secrets.
 */
import process from 'node:process';
import { createEntry, transitionStatus, LOGS } from './lib/log-entry.js';
import { EXIT_CODES } from './lib/exit-codes.js';
import { isEntrypoint, parseArgs as parseFlags, runCli, UsageError } from './lib/cli.js';

const USAGE = `usage:
  log-entry.js create --log <${Object.keys(LOGS).join('|')}> --date YYYY-MM-DD --entry '<json fields>' [--suffix hhhhhhhh] [--root dir]
  log-entry.js transition --file logs/<log>/<entry>.yaml --to <status> --date YYYY-MM-DD [--reason "..."] [--root dir]`;

/** Flags each command understands — a typo (--sufix) is an error, never silence. */
const KNOWN_FLAGS = Object.freeze({
  create: Object.freeze(['log', 'date', 'entry', 'suffix', 'root']),
  transition: Object.freeze(['file', 'to', 'date', 'reason', 'root']),
});

function parseArgs(argv) {
  const [command, ...rest] = argv;
  if (!Object.hasOwn(KNOWN_FLAGS, command ?? '')) {
    throw new UsageError(`unknown command ${JSON.stringify(command)}`);
  }
  // The grammar is per-subcommand: `--file` is meaningful to transition and a
  // typo to create. A flag the subcommand does not know is an error, never
  // silence.
  const { options } = parseFlags(rest, { value: KNOWN_FLAGS[command] });
  return { command, options };
}

/** @returns {number} an exit code */
export function main(argv) {
  const { command, options } = parseArgs(argv); // a UsageError reaches the harness
  const root = options.root ?? process.cwd();

  let fields = null;
  if (command === 'create') {
    try {
      fields = JSON.parse(options.entry ?? '');
    } catch {
      // fall through to the shape check below
    }
    // JSON.parse also accepts null/scalars/arrays — only a plain object is
    // a set of kind-specific fields.
    if (typeof fields !== 'object' || fields === null || Array.isArray(fields)) {
      throw new UsageError('--entry must be a JSON object of kind-specific fields');
    }
  }

  let result;
  try {
    result = command === 'create'
      ? createEntry({ root, log: options.log, date: options.date, fields, suffix: options.suffix })
      : transitionStatus({ root, file: options.file, to: options.to, date: options.date, reason: options.reason });
  } catch (error) {
    // An EXPECTED refusal (an illegal transition, an invalid entry, an unknown
    // log): a hard error, never a silent pass (PRD §5). Exit 2 — the entry was
    // not written, so nothing was found and nothing was logged.
    process.stderr.write(`log-entry: ${error.message}\n`);
    return EXIT_CODES.FAILURE;
  }

  const { file, entry } = result;
  // exitCode, never process.exit(): exit() drops queued async stdout writes, so
  // piped JSON output could truncate (corrupt output with exit 0).
  console.log(JSON.stringify({ file, status: entry.status, entry }, null, 2));
  return EXIT_CODES.CLEAN;
}

if (isEntrypoint(import.meta.url)) {
  // runCli owns the epilogue: a usage error and ANY unexpected throw exit 2.
  runCli('log-entry', main, { usage: USAGE }).then((code) => { process.exitCode = code; });
}
