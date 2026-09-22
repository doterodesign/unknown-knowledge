#!/usr/bin/env node
// A module-load failure is an engine failure, never findings.
try {
  const [{ boot }, command] = await Promise.all([
    import('./lib/boot.js'),
    import('./commands/invoke.js'),
  ]);
  process.exitCode = await boot('invoke', command);
} catch (error) {
  process.stderr.write(`invoke: internal failure — the engine could not be loaded\n${error?.stack ?? error}\n`);
  process.exitCode = 2;
}
