#!/usr/bin/env node
// Load the engine inside the failure boundary: module errors always exit 2.
try {
  const [{ boot }, command] = await Promise.all([
    import('./lib/boot.js'),
    import('./commands/intent-plan.js'),
  ]);
  const bounded = process.argv.slice(2).some(arg => arg === '--operation-limits-json' || arg.startsWith('--operation-limits-json='));
  process.exitCode = await boot('intent-plan', command, { bounded });
} catch (error) {
  if (!process.argv.slice(2).some(arg => arg === '--operation-limits-json' || arg.startsWith('--operation-limits-json='))) {
    process.stderr.write(`intent-plan: internal failure — the engine could not be loaded\n${error?.stack ?? error}\n`);
  }
  process.exitCode = 2;
}
