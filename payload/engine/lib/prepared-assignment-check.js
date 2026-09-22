/** Fixed child adapter for the released prepared gate; never a caller command. */
import { readFileSync } from 'node:fs';
import { runPreparedAssignmentGate, runPreparedAssignmentGateFromWire } from './assignment-gate.js';
import { decodeDecisionCaptures } from './subject-query-context.js';

const job = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const input = job.operationInputs;
const continued = Object.hasOwn(input, 'continuation');
const result = await (continued ? runPreparedAssignmentGateFromWire : runPreparedAssignmentGate)({
  repoRoot: job.repoRoot, before: job.source, candidate: job.candidate,
  eventId: input.eventId, reviewNote: input.reviewNote,
  ...(Object.hasOwn(input, 'selection') ? { selection: input.selection } : {}),
  decisionCaptures: continued ? input.decisionCaptures : decodeDecisionCaptures(input.decisionCaptures), limits: input.limits,
  ...(continued ? { continuation: input.continuation } : {}),
  impact: { ...input.impact, required: ['routes', 'regeneratedViews', 'representativeReplays'] },
});
// Retain the complete actual report, including partial coverage and humanApproval.
process.stdout.write(`${JSON.stringify(result)}\n`);
process.exitCode = result.ok ? 0 : 1;
