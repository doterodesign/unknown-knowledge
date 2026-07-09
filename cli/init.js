#!/usr/bin/env node
/**
 * cli/init.js — the entry shim (UCS-956/UCS-950).
 *
 * Statically imports NOTHING. Node exits 1 on an unhandled ES module load
 * error, and exit 1 means FINDINGS (PRD §5) — so a SyntaxError or a missing
 * dependency in the init path would tell an agent the seed ran and found
 * problems. Init never emits findings at all: exit 1 must be unreachable.
 *
 * The command lives in commands/init.js. The invocation path is unchanged —
 * this file is what `npx unknown-knowledge` runs.
 */
try {
  const [{ boot }, command] = await Promise.all([
    import('../payload/engine/lib/boot.js'),
    import('./commands/init.js'),
  ]);
  process.exitCode = await boot('unknown-knowledge init', command);
} catch (error) {
  // The CLI could not be loaded, so nothing was seeded. Exit 2 — never 1.
  // Hardcoded: reading it from lib/exit-codes.js is what may have just failed.
  process.stderr.write(`unknown-knowledge init: internal failure — nothing was seeded\n${error?.stack ?? error}\n`);
  process.exitCode = 2;
}
