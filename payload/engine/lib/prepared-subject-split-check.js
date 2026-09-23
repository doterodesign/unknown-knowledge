/** Fixed split adapter over the original admitted owner wire. */
import { readFileSync } from 'node:fs';
import { isDeepStrictEqual as same } from 'node:util';
import { runPreparedSubjectSplitGateFromWire } from './subject-split-gate.js';
import { EngineRefusal } from './engine-refusal.js';

const job = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const input = job.operationInputs.gateInput;
if (!same(input.before, job.source) || !same(input.candidate, job.candidate)) {
  throw new EngineRefusal('prepared subject split: descriptor mismatch');
}
const result = await runPreparedSubjectSplitGateFromWire({ repoRoot: job.repoRoot, gateInput: input });
process.stdout.write(`${JSON.stringify(result)}\n`);
process.exitCode = result.ok ? 0 : 1;
