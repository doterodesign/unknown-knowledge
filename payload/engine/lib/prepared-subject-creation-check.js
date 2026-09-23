/** Fixed wire owner dispatch; decoded evidence is never readmitted through the raw API. */
import { readFileSync } from 'node:fs';
import { isDeepStrictEqual as same } from 'node:util';
import { inspectSubjectCreationGateFromWire } from './subject-creation-gate.js';
import { EngineRefusal } from './engine-refusal.js';

const job = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const gateInput = job.operationInputs.gateInput;
if (!same(gateInput.before, job.source) || !same(gateInput.candidate, job.candidate)) {
  throw new EngineRefusal('prepared creation: descriptor mismatch');
}
const result = await inspectSubjectCreationGateFromWire({ repoRoot: job.repoRoot, gateInput });
process.stdout.write(`${JSON.stringify(result)}\n`);
process.exitCode = result.ok ? 0 : 1;
