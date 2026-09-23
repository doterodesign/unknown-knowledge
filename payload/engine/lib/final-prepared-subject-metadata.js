/** Fresh retained metadata proof; no caller report substitutes for execution. */
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, relative } from 'node:path';
import { isDeepStrictEqual as same } from 'node:util';
import { canonicalJsonBytes, canonicalSha256, CapturedInputError } from './canonical-json.js';
import { EngineRefusal } from './engine-refusal.js';
import { readRetainedPreparedEvidence } from './prepared-evidence.js';
import { verifyRetainedRuntimeCapability } from './runtime-capability.js';
import { capturePreparedRuntime, verifyPreparedRuntime } from './prepared-runtime.js';
import { executePreparedWorker } from './prepared-worker-process.js';
import { validMetadataCaptureLimits, isPreparedSubjectMetadataReport, isPreparedSubjectProposalSuppressionReport } from './prepared-subject-metadata.js';

const policyBytes = readFileSync(new URL('../policies/candidate-publication.json', import.meta.url));
const policies = JSON.parse(policyBytes).operations;
const closed = (v, keys) => v !== null && typeof v === 'object' && !Array.isArray(v)
  && Reflect.ownKeys(v).length === keys.length && keys.every(key => Object.hasOwn(v, key));
const runtimeKeys = ['maxRuntimeFiles', 'maxRuntimeBytes', 'maxOutputBytesPerCheck', 'maxCheckMilliseconds'];
const within = (root, target) => { const rel = relative(root, target); return rel === '' || (!rel.startsWith('../') && rel !== '..' && !isAbsolute(rel)); };
function parse(bytes, canonical = true) {
  let value;
  try { value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch (error) {
    if (!(error instanceof SyntaxError || error instanceof TypeError)) throw error;
    throw new EngineRefusal('invalid metadata JSON');
  }
  if (canonical) {
    let encoded;
    try { encoded = canonicalJsonBytes(value); }
    catch (error) {
      if (!(error instanceof CapturedInputError || error instanceof RangeError)) throw error;
      throw new EngineRefusal('metadata JSON cannot be canonicalized');
    }
    if (!encoded.equals(bytes)) throw new EngineRefusal('noncanonical metadata JSON');
  }
  return value;
}

export function runFinalPreparedSubjectMetadataGate(input) { return runFinal(input,false); }
export function runFinalPreparedSubjectProposalSuppressionGate(input) { return runFinal(input,true); }
async function runFinal(input,suppression) {
  const operationName=suppression?'subject-proposal-suppression':'subject-metadata';
  const policy=policies[operationName];
  const validReport=suppression?isPreparedSubjectProposalSuppressionReport:isPreparedSubjectMetadataReport;
  const result = { version: 1, kind: suppression?'final-prepared-subject-proposal-suppression':'final-prepared-subject-metadata',
    policy: { id: policy.id, version: policy.version, digest: canonicalSha256(policy) },
    source: null, candidate: null, runtimeDigest: null, capability: null, gate: null, status: 'failed', diagnostics: [] };
  const fail = code => { result.status = 'failed'; result.diagnostics.push({ code }); return result; };
  if (!closed(input, ['repoRoot', 'evidenceDirectory', 'validationBundleDigest', 'expected', 'approvedRuntimeProfile', 'limits'])
    || typeof input.repoRoot !== 'string' || !input.repoRoot || input.repoRoot.includes('\0')
    || input.expected?.operation !== operationName || !closed(input.limits, ['evidence', 'runtime'])
    || !closed(input.limits.runtime, runtimeKeys)
    || !runtimeKeys.every(key => Number.isSafeInteger(input.limits.runtime[key]) && input.limits.runtime[key] > 0)
    || input.limits.runtime.maxCheckMilliseconds > 600000) return fail('invalid-final-subject-metadata-input');
  const plan = structuredClone(input); let work = null;
  try {
    const readInput = { evidenceDirectory: plan.evidenceDirectory, bundleDigest: plan.validationBundleDigest,
      expected: plan.expected, limits: plan.limits.evidence };
    const retained = readRetainedPreparedEvidence(readInput);
    if (retained.status !== 'verified') return fail('metadata-retention-unavailable');
    const member = file => retained.artifacts.find(row => row.file === file);
    result.source = { ...retained.manifest.source }; result.candidate = { ...retained.manifest.candidate };
    if (!member('runtime/files/engine/policies/candidate-publication.json')?.bytes.equals(policyBytes)) return fail('metadata-policy-mismatch');
    const inputArtifact = member('checks/operation/input.json'), limitsArtifact = member('checks/operation/capture-limits.json');
    const rawReport = member('checks/operation/result');
    if (!inputArtifact || !limitsArtifact || !rawReport) return fail('metadata-input-unavailable');
    const operationInputs = { gateInput: parse(inputArtifact.bytes), captureLimits: parse(limitsArtifact.bytes) };
    if (!validMetadataCaptureLimits(operationInputs.captureLimits)) return fail('metadata-capture-limits-invalid');
    const wire = operationInputs.gateInput;
    if (!same(wire.before, result.source) || !same(wire.candidate, result.candidate)) return fail('metadata-input-mismatch');
    const original = parse(rawReport.bytes, false);
    if (!validReport(original, { source: result.source, candidate: result.candidate }, wire)
      || !original.ok) return fail('metadata-owner-report-invalid');
    const operation = retained.report.checks.find(row => row.id === 'operation');
    if (retained.report.provenance !== 'verified' || retained.report.runtimeVerification !== 'verified'
      || retained.report.eventSource !== null || operation?.invocation?.injectedInputsDigest !== canonicalSha256(operationInputs)
      || operation.result?.sha256 !== rawReport.sha256 || operation.result?.file !== rawReport.file
      || !retained.report.checks.every(check => check.status === 'passed' && check.completion === 'complete'
        && check.exitCode === 0 && check.signal === null)) return fail('metadata-validation-incomplete');
    if (member('checks/operation/event.yaml') || member('checks/operation/identity.yaml')) return fail('metadata-unexpected-event-capture');
    const captures = {};
    for (const name of ['registry']) {
      const row = member(`checks/operation/${name}.yaml`), observation = original.sources[`${name}Capture`];
      const cap = operationInputs.captureLimits[name === 'registry' ? 'maxRegistryBytes' : 'maxIdentityBytes'];
      if (!row || row.size > cap || row.sha256 !== observation.sha256) return fail('metadata-capture-mismatch');
      captures[name] = { size: row.size, sha256: row.sha256 };
    }
    const capability = verifyRetainedRuntimeCapability(readInput, plan.approvedRuntimeProfile);
    result.capability = { profileDigest: plan.approvedRuntimeProfile?.digest ?? null, resultDigest: canonicalSha256(capability) };
    if (capability.status !== 'established' || capability.persistence !== 'unsupported'
      || capability.scope !== 'kit-managed-subject-route-persistence' || capability.runtimeDigest !== retained.manifest.runtimeDigest
      || !same(capability.captures, { source: result.source, candidate: result.candidate })) return fail('metadata-capability-unavailable');
    plan.repoRoot = realpathSync(plan.repoRoot); work = mkdtempSync(join(realpathSync('/tmp'), 'final-subject-metadata-'));
    if (within(plan.repoRoot, work)) return fail('metadata-runtime-overlap');
    const runtime = capturePreparedRuntime(work, plan.limits.runtime, operationName);
    if (Object.values(runtime.manifest.executables).some(({ path }) => within(plan.repoRoot, path))) return fail('metadata-runtime-overlap');
    if (canonicalSha256(runtime.manifest) !== retained.manifest.runtimeDigest) return fail('metadata-runtime-mismatch');
    if (!runtime.manifest.files.some(({ path }) => path === (suppression?'engine/lib/final-subject-proposal-suppression-check.js':'engine/lib/final-subject-metadata-check.js'))) return fail('metadata-entrypoint-unavailable');
    verifyPreparedRuntime(runtime.root, runtime.manifest); result.runtimeDigest = canonicalSha256(runtime.manifest);
    const jobFile = join(work, 'job.json');
    writeFileSync(jobFile, canonicalJsonBytes({ repoRoot: plan.repoRoot, source: result.source, candidate: result.candidate,
      operationInputs, manifest: runtime.manifest }), { flag: 'wx', mode: 0o400 });
    const actual = await executePreparedWorker(runtime, jobFile, plan.limits.runtime, suppression?'final-subject-proposal-suppression':'final-subject-metadata');
    if (actual.error || ![0, 1].includes(actual.status) || actual.signal || actual.stderr.length) return fail('metadata-worker-incomplete');
    verifyPreparedRuntime(runtime.root, runtime.manifest);
    const output = parse(actual.stdout);
    if (!closed(output, ['version', 'gate', 'captures']) || output.version !== 1
      || !validReport(output.gate, { source: result.source, candidate: result.candidate }, wire)
      || actual.status !== (output.gate.ok ? 0 : 1)) return fail('metadata-output-invalid');
    result.gate = output.gate;
    if (!output.gate.ok) {
      if (output.captures !== null) return fail('metadata-output-invalid');
      result.diagnostics.push(...output.gate.diagnostics);
      return fail('metadata-fresh-owner-refused');
    }
    if (!same(output.gate, original) || !same(output.captures, captures)) return fail('metadata-fresh-proof-mismatch');
    result.status = 'passed'; return result;
  } catch (error) {
    if (!(error instanceof EngineRefusal) && !Number.isInteger(error?.errno)) throw error;
    return fail('metadata-evidence-unavailable');
  } finally {
    if (work) try { rmSync(work, { recursive: true, force: true }); }
    catch (error) {
      if (!Number.isInteger(error?.errno)) throw error;
      fail('metadata-cleanup-failed');
    }
  }
}
