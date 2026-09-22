import { lifecycleMaterialPresent } from './subject-lifecycle-input.js';
/** Fresh equivalent-merge publication proof; the original owner report stays unchanged. */
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, relative } from 'node:path';
import { isDeepStrictEqual as same } from 'node:util';
import { canonicalJsonBytes, canonicalSha256 } from './canonical-json.js';
import { EngineRefusal } from './engine-refusal.js';
import { readRetainedPreparedEvidence } from './prepared-evidence.js';
import { verifyRetainedRuntimeCapability } from './runtime-capability.js';
import { capturePreparedRuntime, verifyPreparedRuntime } from './prepared-runtime.js';
import { executePreparedWorker } from './prepared-worker-process.js';
import { decodePreparedEquivalentMerge, validMergeCaptureLimits, isPreparedEquivalentMergeReport } from './prepared-equivalent-merge.js';

const policyBytes = readFileSync(new URL('../policies/candidate-publication.json', import.meta.url));
const policy = JSON.parse(policyBytes).operations['subject-equivalent-merge'];
const closed = (v, keys) => v !== null && typeof v === 'object' && !Array.isArray(v)
  && Reflect.ownKeys(v).length === keys.length && keys.every((key) => Object.hasOwn(v, key));
const runtimeKeys = ['maxRuntimeFiles', 'maxRuntimeBytes', 'maxOutputBytesPerCheck', 'maxCheckMilliseconds'];
const scope = 'kit-managed-subject-route-persistence';
const within = (root, target) => { const rel = relative(root, target); return rel === '' || (!rel.startsWith('../') && rel !== '..' && !isAbsolute(rel)); };
function parse(bytes, canonical = true) {
  let value;
  try { value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { throw new EngineRefusal('invalid equivalent merge JSON'); }
  if (canonical && !canonicalJsonBytes(value).equals(bytes)) throw new EngineRefusal('noncanonical equivalent merge JSON');
  return value;
}

export async function runFinalPreparedEquivalentMergeGate(input) {
  const result = { version: 1, kind: 'final-prepared-equivalent-merge', policy: { id: policy.id, version: policy.version, digest: canonicalSha256(policy) },
    source: null, candidate: null, runtimeDigest: null, capability: null, gate: null, status: 'failed', diagnostics: [] };
  const fail = (code) => { result.diagnostics.push({ code }); return result; };
  if (!closed(input, ['repoRoot', 'evidenceDirectory', 'validationBundleDigest', 'expected', 'approvedRuntimeProfile', 'limits'])
    || typeof input.repoRoot !== 'string' || !input.repoRoot || input.repoRoot.includes('\0')
    || input.expected?.operation !== 'subject-equivalent-merge' || !closed(input.limits, ['evidence', 'runtime'])
    || !closed(input.limits.runtime, runtimeKeys) || !runtimeKeys.every((key) => Number.isSafeInteger(input.limits.runtime[key]) && input.limits.runtime[key] > 0)
    || input.limits.runtime.maxCheckMilliseconds > 600000) return fail('invalid-final-equivalent-merge-input');
  const plan = structuredClone(input); let work = null;
  try {
    const readInput = { evidenceDirectory: plan.evidenceDirectory, bundleDigest: plan.validationBundleDigest, expected: plan.expected, limits: plan.limits.evidence };
    const retained = readRetainedPreparedEvidence(readInput);
    if (retained.status !== 'verified') return fail('merge-retention-unavailable');
    const member = (file) => retained.artifacts.find((row) => row.file === file);
    result.source = { ...retained.manifest.source }; result.candidate = { ...retained.manifest.candidate };
    if (!member('runtime/files/engine/policies/candidate-publication.json')?.bytes.equals(policyBytes)) return fail('merge-policy-mismatch');
    const inputArtifact = member('checks/operation/input.json'); const limitsArtifact = member('checks/operation/capture-limits.json');
    const rawReport = member('checks/operation/result');
    if (!inputArtifact || !limitsArtifact || !rawReport) return fail('merge-input-unavailable');
    const operationInputs = { gateInput: parse(inputArtifact.bytes), captureLimits: parse(limitsArtifact.bytes) };
    if (!validMergeCaptureLimits(operationInputs.captureLimits)) return fail('merge-capture-limits-invalid');
    const admitted = lifecycleMaterialPresent(operationInputs.gateInput) ? operationInputs.gateInput
      : decodePreparedEquivalentMerge(plan.repoRoot, operationInputs.gateInput);
    if (!same(admitted.before, result.source) || !same(admitted.candidate, result.candidate)
      || !same(admitted.impact?.routes, { kind: 'runtime-capability' })) return fail('merge-input-mismatch');
    const original = parse(rawReport.bytes, false);
    if (!isPreparedEquivalentMergeReport(original, { source: result.source, candidate: result.candidate }, operationInputs.gateInput) || !original.ok
      || original.inputDigest !== canonicalSha256(operationInputs.gateInput)) return fail('merge-owner-report-invalid');
    const operation = retained.report.checks.find(({ id }) => id === 'operation');
    if (retained.report.provenance !== 'verified' || retained.report.runtimeVerification !== 'verified'
      || operation?.invocation?.injectedInputsDigest !== canonicalSha256(operationInputs)
      || operation.result?.sha256 !== rawReport.sha256 || operation.result?.file !== rawReport.file
      || !retained.report.checks.every((check) => check.status === 'passed' && check.completion === 'complete' && check.exitCode === 0)) return fail('merge-validation-incomplete');
    const zero = operationInputs.gateInput.operation.assignmentEvent === null;
    const captures = zero ? { registry: null, event: null } : {};
    if (zero && member('checks/operation/event.yaml')) return fail('merge-unexpected-event-capture');
    for (const kind of zero ? ['registry'] : ['registry', 'event']) {
      const row = member(`checks/operation/${kind}.yaml`);
      const locator = kind === 'registry' ? original.sources.registryCapture : original.sources.assignmentEvent?.eventCapture;
      const cap = kind === 'registry' ? operationInputs.captureLimits.maxRegistryBytes : operationInputs.captureLimits.maxEventBytes;
      if (!row || row.size > cap || row.sha256 !== locator?.sha256) return fail('merge-capture-mismatch');
      captures[kind] = { size: row.size, sha256: row.sha256 };
    }
    const capability = verifyRetainedRuntimeCapability(readInput, plan.approvedRuntimeProfile);
    result.capability = { profileDigest: plan.approvedRuntimeProfile?.digest ?? null, resultDigest: canonicalSha256(capability) };
    if (capability.status !== 'established' || capability.persistence !== 'unsupported' || capability.scope !== scope
      || capability.runtimeDigest !== retained.manifest.runtimeDigest || !same(capability.captures, { source: result.source, candidate: result.candidate })) return fail('merge-capability-unavailable');
    plan.repoRoot = realpathSync(plan.repoRoot); work = mkdtempSync(join(realpathSync('/tmp'), 'final-equivalent-merge-'));
    if (within(plan.repoRoot, work)) return fail('merge-runtime-overlap');
    const runtime = capturePreparedRuntime(work, plan.limits.runtime, 'subject-equivalent-merge');
    if (Object.values(runtime.manifest.executables).some(({ path }) => within(plan.repoRoot, path))) return fail('merge-runtime-overlap');
    if (canonicalSha256(runtime.manifest) !== retained.manifest.runtimeDigest) return fail('merge-runtime-mismatch');
    if (!runtime.manifest.files.some(({ path }) => path === 'engine/lib/final-equivalent-merge-check.js')) return fail('merge-entrypoint-unavailable');
    verifyPreparedRuntime(runtime.root, runtime.manifest); result.runtimeDigest = canonicalSha256(runtime.manifest);
    const jobFile = join(work, 'job.json');
    writeFileSync(jobFile, canonicalJsonBytes({ repoRoot: plan.repoRoot, source: result.source, candidate: result.candidate,
      operationInputs, manifest: runtime.manifest }), { flag: 'wx', mode: 0o400 });
    const actual = await executePreparedWorker(runtime, jobFile, plan.limits.runtime, 'final-equivalent-merge');
    if (actual.error || actual.status !== 0 || actual.signal || actual.stderr.length) return fail('merge-worker-incomplete');
    verifyPreparedRuntime(runtime.root, runtime.manifest);
    const output = parse(actual.stdout);
    if (!closed(output, ['version', 'gate', 'captures']) || output.version !== 1
      || !isPreparedEquivalentMergeReport(output.gate, { source: result.source, candidate: result.candidate }, operationInputs.gateInput)) return fail('merge-output-invalid');
    result.gate = output.gate;
    // The actual owner enforces the full authored closure, tree pair and fixed replay recipe.
    // Preserve its qualified inventory/reach and requires-final-capability route report verbatim.
    if (!output.gate.ok || !same(output.gate, original) || !same(output.captures, captures)) return fail('merge-fresh-proof-mismatch');
    result.status = 'passed'; return result;
  } catch (error) {
    if (!(error instanceof EngineRefusal) && !Number.isInteger(error?.errno)) throw error;
    return fail('merge-evidence-unavailable');
  } finally {
    if (work) try { rmSync(work, { recursive: true, force: true }); }
    catch (error) {
      if (!Number.isInteger(error?.errno)) throw error;
      result.status = 'failed'; fail('merge-cleanup-failed');
    }
  }
}
