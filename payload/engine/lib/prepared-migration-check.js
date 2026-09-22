/** Fixed private adapter: domain inputs and correspondence never become output. */
import { readFileSync } from 'node:fs';
import { runPreparedMigrationGate } from './prepared-migration-gate.js';

let job = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const result = await runPreparedMigrationGate({ repoRoot: job.repoRoot, source: job.source, candidate: job.candidate,
  migrationInputs: job.operationInputs.migrationInputs, limits: job.operationInputs.limits });
job = null;
process.stdout.write(`${JSON.stringify(result)}\n`);
process.exitCode = result.mechanicalStatus === 'passed' ? 0 : 1;
