#!/usr/bin/env node
// Dynamic imports preserve exit 2 for module-load failures, never findings.
const args = process.argv.slice(2);
const bounded = args.some((arg) => arg === '--operation-limits-json' || arg.startsWith('--operation-limits-json='));
try {
  const [{ boot }, command] = await Promise.all([
    import('./lib/boot.js'),
    import('./commands/subject-view.js'),
  ]);
  process.exitCode = await boot('subject-view', command, { bounded });
} catch (error) {
  if (!bounded) process.stderr.write(`subject-view: internal failure — the engine could not be loaded\n${error?.stack ?? error}\n`);
  process.exitCode = 2;
}
