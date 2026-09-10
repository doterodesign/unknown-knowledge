#!/usr/bin/env node
// Load failures must report failure (2), never findings (1).
try {
  const [{ boot }, command] = await Promise.all([
    import('./lib/boot.js'),
    import('./commands/reverse-staged.js'),
  ]);
  process.exitCode = await boot('reverse-staged', command);
} catch (error) {
  process.stderr.write(`reverse-staged: internal failure — the engine could not be loaded\n${error?.stack ?? error}\n`);
  process.exitCode = 2;
}
