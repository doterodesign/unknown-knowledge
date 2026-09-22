/** Fixed owner adapter; retained input is the owner's unchanged canonical wire. */
import { readFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { runPreparedEquivalentMergeGateFromWire } from './subject-equivalent-merge-gate.js';
import { EngineRefusal } from './engine-refusal.js';

const job = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const input = job.operationInputs.gateInput;
if (!isDeepStrictEqual(input.before, job.source) || !isDeepStrictEqual(input.candidate, job.candidate)) {
  throw new EngineRefusal('prepared equivalent merge: descriptor mismatch');
}
const result = await runPreparedEquivalentMergeGateFromWire({ repoRoot: job.repoRoot, gateInput: input });
process.stdout.write(`${JSON.stringify(result)}\n`);
process.exitCode = result.ok ? 0 : 1;
