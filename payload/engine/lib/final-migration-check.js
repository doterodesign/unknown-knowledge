/** Private fixed child: no unexpected stdout/stderr may reveal adjudications. */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { canonicalJsonBytes } from './canonical-json.js';
import { verifyMigrationHistoricalRuntime } from './migration-historical-runtime.js';
import { runPreparedMigrationSemantics } from './prepared-migration-semantics.js';

try {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const job = JSON.parse(readFileSync(process.argv[2], 'utf8'));
  const runtime = { root, manifest: job.manifest };
  verifyMigrationHistoricalRuntime(runtime);
  const gate = await runPreparedMigrationSemantics({ repoRoot: job.repoRoot, source: job.source, candidate: job.candidate,
    migrationInputs: job.migration.migrationInputs, limits: job.migration.limits, semantic: job.migration.semantic,
    runtime, runtimeLimits: job.runtimeLimits });
  verifyMigrationHistoricalRuntime(runtime);
  process.stdout.write(canonicalJsonBytes({ version: 1, gate }));
} catch {
  // The outer migration boundary deliberately has no raw trusted-worker error channel.
  process.stdout.write('{"version":1,"failure":"migration-worker-failed"}');
  process.exitCode = 2;
}
