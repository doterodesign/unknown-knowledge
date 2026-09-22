/** Fixed captured worker: fresh owner gate plus complete raw candidate captures. */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { canonicalJsonBytes } from './canonical-json.js';
import { verifyPreparedRuntime } from './prepared-runtime.js';
import { capturePreparedEquivalentMerge } from './prepared-equivalent-merge.js';
import { runPreparedEquivalentMergeGateFromWire } from './subject-equivalent-merge-gate.js';
import { withTreeSnapshot } from './commit-snapshot.js';
import { rawSha256 } from './prepared-evidence.js';
import { EngineRefusal } from './engine-refusal.js';
const runtime = fileURLToPath(new URL('../../', import.meta.url));
const job = JSON.parse(readFileSync(process.argv[2], 'utf8'));
verifyPreparedRuntime(runtime, job.manifest);
const input = job.operationInputs.gateInput;
if (!isDeepStrictEqual(input.before, job.source) || !isDeepStrictEqual(input.candidate, job.candidate)) {
  throw new EngineRefusal('final equivalent merge descriptor mismatch');
}
const gate = await runPreparedEquivalentMergeGateFromWire({ repoRoot: job.repoRoot, gateInput: input });
let captures = null;
if (gate.ok) {
  const captured = await withTreeSnapshot(job.repoRoot, job.candidate.tree, ({ root }) => capturePreparedEquivalentMerge({
    root, source: job.source, candidate: job.candidate, gate, gateInput: input, captureLimits: job.operationInputs.captureLimits }));
  captures = Object.fromEntries(Object.entries(captured).map(([kind, bytes]) => [kind, bytes === null ? null : { size: bytes.length, sha256: rawSha256(bytes) }]));
}
verifyPreparedRuntime(runtime, job.manifest);
process.stdout.write(canonicalJsonBytes({ version: 1, gate, captures }));
