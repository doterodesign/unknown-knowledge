#!/usr/bin/env node
/** One-shot 2.x -> 3.0 store conversion entry shim; load failures are exit 2. */
try {
  const [{ boot }, command] = await Promise.all([
    import('./lib/boot.js'),
    import('./commands/migrate.js'),
  ]);
  process.exitCode = await boot('migrate', command);
} catch (error) {
  process.stderr.write(`migrate: internal failure — the engine could not be loaded\n${error?.stack ?? error}\n`);
  process.exitCode = 2;
}
