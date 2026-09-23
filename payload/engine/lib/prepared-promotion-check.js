/** Fixed adapter to the original closed Decisions-only promotion gate. */
import { readFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { decodePreparedPromotion } from './prepared-promotion.js';
import { runPreparedDecisionPromotionGate } from './assignment-gate.js';
import { EngineRefusal } from './engine-refusal.js';
const job = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const input = decodePreparedPromotion(job.repoRoot, job.operationInputs.gateInput);
if (!isDeepStrictEqual(input.before, job.source) || !isDeepStrictEqual(input.candidate, job.candidate)) {
  throw new EngineRefusal('prepared promotion descriptor mismatch');
}
const result = await runPreparedDecisionPromotionGate(input);
process.stdout.write(`${JSON.stringify(result)}\n`);
process.exitCode = result.ok ? 0 : 1;
