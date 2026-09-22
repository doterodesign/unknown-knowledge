/** Real fresh creation proof and two candidate captures; failure has no captures. */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual as same } from 'node:util';
import { canonicalJsonBytes } from './canonical-json.js';
import { verifyPreparedRuntime } from './prepared-runtime.js';
import { capturePreparedSubjectCreation } from './prepared-subject-creation.js';
import { inspectSubjectCreationGateFromWire } from './subject-creation-gate.js';
import { withTreeSnapshot } from './commit-snapshot.js';
import { rawSha256 } from './prepared-evidence.js';
import { EngineRefusal } from './engine-refusal.js';

const runtime = fileURLToPath(new URL('../../', import.meta.url));
const job = JSON.parse(readFileSync(process.argv[2], 'utf8'));
verifyPreparedRuntime(runtime, job.manifest);
const gateInput = job.operationInputs.gateInput;
if (!same(gateInput.before, job.source) || !same(gateInput.candidate, job.candidate)) {
  throw new EngineRefusal('final creation: descriptor mismatch');
}
const gate = await inspectSubjectCreationGateFromWire({ repoRoot: job.repoRoot, gateInput });
let captures = null;
if (gate.ok) {
  const captured = await withTreeSnapshot(job.repoRoot, job.candidate.tree, ({ root }) => capturePreparedSubjectCreation({
    root, source: job.source, candidate: job.candidate, gate, gateInput, captureLimits: job.operationInputs.captureLimits }));
  const summary = bytes => ({ size: bytes.length, sha256: rawSha256(bytes) });
  captures = { registry: summary(captured.registry), identity: summary(captured.identity) };
}
verifyPreparedRuntime(runtime, job.manifest);
process.stdout.write(canonicalJsonBytes({ version: 1, gate, captures }));
process.exitCode = gate.ok ? 0 : 1;
