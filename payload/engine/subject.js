#!/usr/bin/env node
// Dynamic-only entry shim: even a module-load failure must exit 2, never findings.
try {
  const [{ boot }, command] = await Promise.all([
    import('./lib/boot.js'),
    import('./commands/subject.js'),
  ]);
  process.exitCode = await boot('subject', command);
} catch (error) {
  process.stderr.write(`subject: internal failure — the engine could not be loaded\n${error?.stack ?? error}\n`);
  process.exitCode = 2;
}
