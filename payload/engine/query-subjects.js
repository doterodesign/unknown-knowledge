#!/usr/bin/env node
/** Dynamic entry shim: module-load failures exit 2, never findings exit 1. */
try {
  const [{ boot }, command] = await Promise.all([
    import('./lib/boot.js'),
    import('./commands/query-subjects.js'),
  ]);
  const bounded = process.argv.slice(2).some((arg) => arg === '--operation-limits-json' || arg.startsWith('--operation-limits-json='));
  process.exitCode = await boot('query-subjects', command, { bounded });
} catch (error) {
  if (!process.argv.slice(2).some((arg) => arg === '--operation-limits-json' || arg.startsWith('--operation-limits-json='))) process.stderr.write(`query-subjects: internal failure — the engine could not be loaded\n${error?.stack ?? error}\n`);
  process.exitCode = 2;
}
