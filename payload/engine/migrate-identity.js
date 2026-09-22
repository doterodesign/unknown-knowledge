#!/usr/bin/env node
/** Offline identity migration entry shim; load failures are exit 2. */
try {
  const [{ boot }, command] = await Promise.all([
    import('./lib/boot.js'),
    import('./commands/migrate-identity.js'),
  ]);
  process.exitCode = await boot('migrate-identity', command);
} catch (error) {
  process.stderr.write(`migrate-identity: internal failure — the engine could not be loaded\n${error?.stack ?? error}\n`);
  process.exitCode = 2;
}
