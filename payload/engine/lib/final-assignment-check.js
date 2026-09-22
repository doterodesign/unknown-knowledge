/** Fixed captured child: fresh domain evaluation under internal final impact policy. */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { canonicalJsonBytes } from './canonical-json.js';
import { verifyPreparedRuntime } from './prepared-runtime.js';
import { runPreparedAssignmentGate, runPreparedAssignmentGateFromWire } from './assignment-gate.js';
import { decodeDecisionCaptures } from './subject-query-context.js';
import { withTreeSnapshot } from './commit-snapshot.js';
import { capturePreparedAssignmentEvent } from './prepared-assignment-event.js';
import { rawSha256 } from './prepared-evidence.js';
import { rethrowIfBug } from './engine-refusal.js';

const runtime = fileURLToPath(new URL('../../', import.meta.url));
const job = JSON.parse(readFileSync(process.argv[2], 'utf8'));
verifyPreparedRuntime(runtime, job.manifest);
// Only the fixed parent can create this private job after actual capability/runtime verification.
const { maxEventBytes, ...input } = job.operationInputs;
const required = Object.hasOwn(input.impact, 'routes')
  ? ['routes', 'regeneratedViews', 'representativeReplays'] : ['regeneratedViews', 'representativeReplays'];
const continued = Object.hasOwn(input, 'continuation');
const gate = await (continued ? runPreparedAssignmentGateFromWire : runPreparedAssignmentGate)({ repoRoot: job.repoRoot, before: job.source, candidate: job.candidate,
  ...input, decisionCaptures: continued ? input.decisionCaptures : decodeDecisionCaptures(input.decisionCaptures), impact: { ...input.impact, required } });
let captured = null;
if (gate.eventSource !== null) {
  try { captured = await withTreeSnapshot(job.repoRoot, job.candidate.tree, ({ root }) => capturePreparedAssignmentEvent({
    root, source: job.source, candidate: job.candidate, eventId: input.eventId, maxEventBytes, gate })); }
  catch (error) { rethrowIfBug(error); }
}
const eventCapture = captured === null ? null
  : { file: captured.eventSource.file, size: captured.bytes.length, sha256: rawSha256(captured.bytes) };
verifyPreparedRuntime(runtime, job.manifest);
process.stdout.write(canonicalJsonBytes({ version: 1, gate, eventCapture }));
