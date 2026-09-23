/** Fixed actual retirement rerun; eventless capture is explicit, never empty bytes. */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual as same } from 'node:util';
import { canonicalJsonBytes } from './canonical-json.js';
import { verifyPreparedRuntime } from './prepared-runtime.js';
import { capturePreparedSubjectRetirement } from './prepared-subject-retirement.js';
import { runPreparedSubjectRetirementGateFromWire } from './subject-retirement-gate.js';
import { withTreeSnapshot } from './commit-snapshot.js';
import { rawSha256 } from './prepared-evidence.js';
import { EngineRefusal } from './engine-refusal.js';

const runtime = fileURLToPath(new URL('../../', import.meta.url));
const job = JSON.parse(readFileSync(process.argv[2], 'utf8'));
verifyPreparedRuntime(runtime, job.manifest);
const gateInput = job.operationInputs.gateInput;
const input = gateInput;
if (!same(input.before, job.source) || !same(input.candidate, job.candidate)) {
  throw new EngineRefusal('final subject retirement: descriptor mismatch');
}
const gate = await runPreparedSubjectRetirementGateFromWire({ repoRoot: job.repoRoot, gateInput: input });
let captures = null;
if (gate.ok) {
  const captured = await withTreeSnapshot(job.repoRoot, job.candidate.tree, ({ root }) => capturePreparedSubjectRetirement({
    root, source: job.source, candidate: job.candidate, gate, gateInput, captureLimits: job.operationInputs.captureLimits }));
  const summary = bytes => bytes === null ? null : { size: bytes.length, sha256: rawSha256(bytes) };
  captures = { registry: summary(captured.registry), event: summary(captured.event) };
}
verifyPreparedRuntime(runtime, job.manifest);
process.stdout.write(canonicalJsonBytes({ version: 1, gate, captures }));
