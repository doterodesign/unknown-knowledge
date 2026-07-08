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
  const known = KNOWN_FLAGS[command] ?? [];
  const options = {};
  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i];
    // Both conventional flag spellings: `--flag value` and `--flag=value`
    // (mirrors resolve.js's parser).
    const eq = arg.startsWith('--') ? arg.indexOf('=') : -1;
    const flag = eq === -1 ? arg : arg.slice(0, eq);
    if (!flag.startsWith('--') || !known.includes(flag.slice(2))) {
      throw new Error(`unknown argument ${JSON.stringify(flag)}\n${USAGE}`);
    }
    let value;
    if (eq === -1) {
      value = rest[i + 1];
      if (value === undefined) throw new Error(`${flag} requires a value\n${USAGE}`);
      i += 1;
    } else {
      value = arg.slice(eq + 1);
    }
    options[flag.slice(2)] = value;
  }
  return { command, options };
}

function main() {
  const { command, options } = parseArgs(process.argv.slice(2));
  if (!Object.hasOwn(KNOWN_FLAGS, command ?? '')) {
    throw new Error(`unknown command ${JSON.stringify(command)}\n${USAGE}`);
  }
  const root = options.root ?? process.cwd();
  if (command === 'create') {
    let fields = null;
    try {
      fields = JSON.parse(options.entry ?? '');
    } catch {
      // fall through to the shape check below
    }
    // JSON.parse also accepts null/scalars/arrays — only a plain object is
    // a set of kind-specific fields.
    if (typeof fields !== 'object' || fields === null || Array.isArray(fields)) {
      throw new Error(`--entry must be a JSON object of kind-specific fields\n${USAGE}`);
    }
    return createEntry({ root, log: options.log, date: options.date, fields, suffix: options.suffix });
  }
  return transitionStatus({
    root, file: options.file, to: options.to, date: options.date, reason: options.reason,
  });
}

// exitCode, never process.exit(): exit() drops queued async stdout writes, so
// piped JSON output could truncate (corrupt output with exit 0) — same
// rationale as resolve.js. Node exits on its own once stdout drains.
try {
  const { file, entry } = main();
  console.log(JSON.stringify({ file, status: entry.status, entry }, null, 2));
  process.exitCode = EXIT_CODES.CLEAN;
} catch (error) {
  process.stderr.write(`log-entry: ${error.message}\n`);
  process.exitCode = EXIT_CODES.FAILURE;
}
