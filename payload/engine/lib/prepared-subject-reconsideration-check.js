/** Fixed wire owner dispatch; decoded evidence is never readmitted through the raw API. */
import { readFileSync } from 'node:fs';
import { isDeepStrictEqual as same } from 'node:util';
import { inspectSubjectReconsiderationGateFromWire } from './subject-reconsideration-gate.js';
import { EngineRefusal } from './engine-refusal.js';

const job = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const gateInput = job.operationInputs.gateInput;
if (!same(gateInput.before, job.source) || !same(gateInput.candidate, job.candidate)) {
  throw new EngineRefusal('prepared reconsideration: descriptor mismatch');
}
const result = await inspectSubjectReconsiderationGateFromWire({ repoRoot: job.repoRoot, gateInput });
process.stdout.write(`${JSON.stringify(result)}\n`);
process.exitCode = result.ok ? 0 : 1;
