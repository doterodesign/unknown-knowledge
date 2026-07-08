#!/usr/bin/env node
/**
 * engine/log-entry.js (KK-13) — CLI over lib/log-entry.js so agents append
 * and transition fragment-based log entries (PRD §3.4, D-010) without
 * hand-editing YAML.
 *
 *   node engine/log-entry.js create --log findings --date 2026-07-08 \
 *     --entry '{"trigger":"correction","summary":"K-210 stale per src/sports.ts"}'
 *
 *   node engine/log-entry.js transition --file logs/findings/2026-07-08-a3f2.yaml \
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
  log-entry.js create --log <${Object.keys(LOGS).join('|')}> --date YYYY-MM-DD --entry '<json fields>' [--suffix hhhh] [--root dir]
  log-entry.js transition --file logs/<log>/<entry>.yaml --to <status> --date YYYY-MM-DD [--reason "..."] [--root dir]`;

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = {};
  for (let i = 0; i < rest.length; i += 2) {
    const flag = rest[i];
    if (!flag.startsWith('--') || rest[i + 1] === undefined) {
      throw new Error(`malformed arguments near ${JSON.stringify(flag)}\n${USAGE}`);
    }
    options[flag.slice(2)] = rest[i + 1];
  }
  return { command, options };
}

function main() {
  const { command, options } = parseArgs(process.argv.slice(2));
  const root = options.root ?? process.cwd();
  if (command === 'create') {
    let fields;
    try {
      fields = JSON.parse(options.entry ?? '');
    } catch {
      throw new Error(`--entry must be a JSON object of kind-specific fields\n${USAGE}`);
    }
    return createEntry({ root, log: options.log, date: options.date, fields, suffix: options.suffix });
  }
  if (command === 'transition') {
    return transitionStatus({
      root, file: options.file, to: options.to, date: options.date, reason: options.reason,
    });
  }
  throw new Error(`unknown command ${JSON.stringify(command)}\n${USAGE}`);
}

try {
  const { file, entry } = main();
  console.log(JSON.stringify({ file, status: entry.status, entry }, null, 2));
  process.exit(EXIT_CODES.CLEAN);
} catch (error) {
  process.stderr.write(`log-entry: ${error.message}\n`);
  process.exit(EXIT_CODES.FAILURE);
}
