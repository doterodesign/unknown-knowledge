#!/usr/bin/env node
/**
 * engine/preflight.js — the entry shim (UCS-956).
 *
 * This file statically imports NOTHING. That is its entire job.
 *
 * Node exits 1 on an unhandled ES module load error, and exit 1 means FINDINGS
 * (PRD §5). A SyntaxError in a lib/ module, or a missing `js-yaml`, must not
 * tell an agent that the check ran and found problems. So the engine is reached
 * only through `import()`, where a load failure is an ordinary catchable
 * rejection rather than a process-level crash.
 *
 * Both specifiers are string literals naming the engine's own files. D-014
 * forbids importing REPO CONTENT — the client's code — and nothing here can
 * name it: there is no variable to point somewhere else.
 *
 * The command lives in commands/preflight.js. Its invocation path is unchanged.
 */
try {
  const [{ boot }, command] = await Promise.all([
    import('./lib/boot.js'),
    import('./commands/preflight.js'),
  ]);
  // exitCode, never process.exit(): exit() drops queued async stdout writes, so
  // piped --json output would truncate at the pipe buffer — corrupt output
  // wearing a clean exit code. Node exits on its own once stdout drains.
  process.exitCode = await boot('preflight', command);
} catch (error) {
  // The engine could not be loaded, so no check ran. Exit 2 — never 1.
  // Hardcoded, because reading it from lib/exit-codes.js is the very thing
  // that may have just failed.
  process.stderr.write(`preflight: internal failure — the engine could not be loaded\n${error?.stack ?? error}\n`);
  process.exitCode = 2;
}
