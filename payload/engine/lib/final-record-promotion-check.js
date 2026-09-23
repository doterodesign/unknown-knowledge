/** Fresh actual K/O/D gate and raw creation-event recapture. */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { canonicalJsonBytes } from './canonical-json.js';
import { verifyPreparedRuntime } from './prepared-runtime.js';
import { runPreparedRecordPromotionGateFromWire } from './assignment-gate.js';
import { capturePreparedAssignmentEvent } from './prepared-assignment-event.js';
import { withTreeSnapshot } from './commit-snapshot.js';
import { rawSha256 } from './prepared-evidence.js';
import { EngineRefusal } from './engine-refusal.js';
const runtime = fileURLToPath(new URL('../../', import.meta.url));
const job = JSON.parse(readFileSync(process.argv[2], 'utf8'));
verifyPreparedRuntime(runtime, job.manifest);
const input = job.operationInputs.gateInput;
if (!isDeepStrictEqual(input.before, job.source) || !isDeepStrictEqual(input.candidate, job.candidate)) throw new EngineRefusal('promotion descriptor mismatch');
const gate = await runPreparedRecordPromotionGateFromWire({ repoRoot: job.repoRoot, gateInput: input });
let eventCapture = null;
if (gate.ok) {
  const captured = await withTreeSnapshot(job.repoRoot, job.candidate.tree, ({ root }) => capturePreparedAssignmentEvent({
    root, source: job.source, candidate: job.candidate, eventId: input.eventId, gate: gate.assignment,
    maxEventBytes: job.operationInputs.maxEventBytes }));
  if (captured) eventCapture = { file: captured.eventSource.file, size: captured.bytes.length, sha256: rawSha256(captured.bytes) };
}
verifyPreparedRuntime(runtime, job.manifest);
process.stdout.write(canonicalJsonBytes({ version: 1, gate, eventCapture }));
