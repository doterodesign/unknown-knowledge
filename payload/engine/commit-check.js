#!/usr/bin/env node
// Load failures must report failure (2), never findings (1).
try {
  const [{ boot }, command] = await Promise.all([
    import('./lib/boot.js'),
    import('./commands/commit-check.js'),
  ]);
  process.exitCode = await boot('commit-check', command);
} catch (error) {
  process.stderr.write(`commit-check: internal failure — the engine could not be loaded\n${error?.stack ?? error}\n`);
  process.exitCode = 2;
}
