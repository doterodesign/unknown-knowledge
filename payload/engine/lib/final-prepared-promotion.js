/** Fresh promotion proof with two fixed owner profiles; no caller-selected executors. */
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, relative } from 'node:path';
import { isDeepStrictEqual as same } from 'node:util';
import { canonicalJsonBytes, canonicalSha256 } from './canonical-json.js';
import { lifecycleMaterialPresent } from './subject-lifecycle-input.js';
import { EngineRefusal } from './engine-refusal.js';
import { readRetainedPreparedEvidence } from './prepared-evidence.js';
import { verifyRetainedRuntimeCapability } from './runtime-capability.js';
import { capturePreparedRuntime, verifyPreparedRuntime } from './prepared-runtime.js';
import { executePreparedWorker } from './prepared-worker-process.js';
import { decodePreparedRecordPromotion, isPreparedRecordPromotionReport, isTypedRecordPromotionProof } from './prepared-record-promotion.js';
import { decodePreparedPromotion, isPreparedPromotionReport, isDecisionOnlyPromotionCapability } from './prepared-promotion.js';

const policyBytes = readFileSync(new URL('../policies/candidate-publication.json', import.meta.url));
const policies = JSON.parse(policyBytes).operations;
const closed = (v, keys) => v !== null && typeof v === 'object' && !Array.isArray(v)
  && Reflect.ownKeys(v).length === keys.length && keys.every((key) => Object.hasOwn(v, key));
const runtimeKeys = ['maxRuntimeFiles', 'maxRuntimeBytes', 'maxOutputBytesPerCheck', 'maxCheckMilliseconds'];
const scope = 'kit-managed-subject-route-persistence';
const within = (root, target) => { const rel = relative(root, target); return rel === '' || (!rel.startsWith('../') && rel !== '..' && !isAbsolute(rel)); };
function parse(bytes, canonical = true) {
  let value;
  try { value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { throw new EngineRefusal('invalid promotion JSON'); }
  if (canonical && !canonicalJsonBytes(value).equals(bytes)) throw new EngineRefusal('noncanonical promotion JSON');
  return value;
}

export async function runFinalPreparedPromotionGate(input) { return runFinalPromotionGate(input, false); }
export async function runFinalPreparedRecordPromotionGate(input) { return runFinalPromotionGate(input, true); }

async function runFinalPromotionGate(input, typed) {
  const operationName = typed ? 'typed-record-promotion' : 'ordinary-promotion';
  const workerKind = typed ? 'final-record-promotion' : 'final-promotion';
  const entrypoint = typed ? 'engine/lib/final-record-promotion-check.js' : 'engine/lib/final-promotion-check.js';
  const decode = typed ? decodePreparedRecordPromotion : decodePreparedPromotion;
  const isReport = typed ? isPreparedRecordPromotionReport : isPreparedPromotionReport;
  const policy = policies[operationName];
  const result = { version: 1, kind: typed ? 'final-prepared-record-promotion' : 'final-prepared-promotion', policy: { id: policy.id, version: policy.version, digest: canonicalSha256(policy) },
    source: null, candidate: null, runtimeDigest: null, capability: null, gate: null, status: 'failed', diagnostics: [] };
  const fail = (code) => { result.diagnostics.push({ code }); return result; };
  if (!closed(input, ['repoRoot', 'evidenceDirectory', 'validationBundleDigest', 'expected', 'approvedRuntimeProfile', 'limits'])
    || typeof input.repoRoot !== 'string' || !input.repoRoot || input.repoRoot.includes('\0')
    || input.expected?.operation !== operationName || !closed(input.limits, ['evidence', 'runtime'])
    || !closed(input.limits.runtime, runtimeKeys) || !runtimeKeys.every((key) => Number.isSafeInteger(input.limits.runtime[key]) && input.limits.runtime[key] > 0)
    || input.limits.runtime.maxCheckMilliseconds > 600000) return fail('invalid-final-promotion-input');
  const plan = structuredClone(input); let work = null;
  try {
    const readInput = { evidenceDirectory: plan.evidenceDirectory, bundleDigest: plan.validationBundleDigest, expected: plan.expected, limits: plan.limits.evidence };
    const retained = readRetainedPreparedEvidence(readInput);
    if (retained.status !== 'verified') return fail('promotion-retention-unavailable');
    const member = (file) => retained.artifacts.find((row) => row.file === file);
    result.source = { ...retained.manifest.source }; result.candidate = { ...retained.manifest.candidate };
    if (!member('runtime/files/engine/policies/candidate-publication.json')?.bytes.equals(policyBytes)) return fail('promotion-policy-mismatch');
    const inputArtifact = member('checks/operation/input.json'); const limitsArtifact = member('checks/operation/capture-limits.json');
    const rawReport = member('checks/operation/result');
    if (!inputArtifact || !limitsArtifact || !rawReport) return fail('promotion-input-unavailable');
    const captureLimits = parse(limitsArtifact.bytes);
    if (!closed(captureLimits, ['maxEventBytes']) || !Number.isSafeInteger(captureLimits.maxEventBytes) || captureLimits.maxEventBytes <= 0) return fail('promotion-capture-limits-invalid');
    const operationInputs = { gateInput: parse(inputArtifact.bytes), maxEventBytes: captureLimits.maxEventBytes };
    const admitted = typed && lifecycleMaterialPresent(operationInputs.gateInput) ? operationInputs.gateInput
      : decode(plan.repoRoot, operationInputs.gateInput);
    if (!same(admitted.before, result.source) || !same(admitted.candidate, result.candidate)) return fail('promotion-input-mismatch');
    const reportExpected = { source: result.source, candidate: result.candidate, ...(typed ? { operationInputs } : {}) };
    const original = parse(rawReport.bytes, false);
    if (!isReport(original, reportExpected) || !original.ok
      || original.inputDigest !== canonicalSha256(operationInputs.gateInput)) return fail('promotion-owner-report-invalid');
    const operation = retained.report.checks.find(({ id }) => id === 'operation');
    if (retained.report.provenance !== 'verified' || retained.report.runtimeVerification !== 'verified'
      || operation?.invocation?.injectedInputsDigest !== canonicalSha256(operationInputs)
      || operation.result?.sha256 !== rawReport.sha256 || operation.result?.file !== rawReport.file
      || !retained.report.checks.every((check) => check.status === 'passed' && check.completion === 'complete' && check.exitCode === 0)) return fail('promotion-validation-incomplete');
    const event = member('checks/operation/event.yaml');
    const hint = original.assignment?.eventSource;
    const file = `${result.candidate.kitPath === '.' ? '' : `${result.candidate.kitPath}/`}subjects/_assignments/${admitted.eventId}.yaml`;
    if (!event || event.size > operationInputs.maxEventBytes || hint?.file !== file || hint.eventId !== admitted.eventId
      || !same(hint.candidate, result.candidate)) return fail('promotion-event-unavailable');
    const eventCapture = { file, size: event.size, sha256: event.sha256 };
    const capability = verifyRetainedRuntimeCapability(readInput, plan.approvedRuntimeProfile);
    result.capability = { profileDigest: plan.approvedRuntimeProfile?.digest ?? null, resultDigest: canonicalSha256(capability) };
    if (capability.status !== 'established' || capability.persistence !== 'unsupported' || capability.scope !== scope
      || capability.runtimeDigest !== retained.manifest.runtimeDigest || !same(capability.captures, { source: result.source, candidate: result.candidate })) return fail('promotion-capability-unavailable');
    plan.repoRoot = realpathSync(plan.repoRoot); work = mkdtempSync(join(realpathSync('/tmp'), 'final-promotion-'));
    if (within(plan.repoRoot, work)) return fail('promotion-runtime-overlap');
    const runtime = capturePreparedRuntime(work, plan.limits.runtime, operationName);
    if (Object.values(runtime.manifest.executables).some(({ path }) => within(plan.repoRoot, path))) return fail('promotion-runtime-overlap');
    if (canonicalSha256(runtime.manifest) !== retained.manifest.runtimeDigest) return fail('promotion-runtime-mismatch');
    if (!runtime.manifest.files.some(({ path }) => path === entrypoint)) return fail('promotion-entrypoint-unavailable');
    verifyPreparedRuntime(runtime.root, runtime.manifest); result.runtimeDigest = canonicalSha256(runtime.manifest);
    const jobFile = join(work, 'job.json');
    writeFileSync(jobFile, canonicalJsonBytes({ repoRoot: plan.repoRoot, source: result.source, candidate: result.candidate,
      operationInputs, manifest: runtime.manifest }), { flag: 'wx', mode: 0o400 });
    const actual = await executePreparedWorker(runtime, jobFile, plan.limits.runtime, workerKind);
    if (actual.error || actual.status !== 0 || actual.signal || actual.stderr.length) return fail('promotion-worker-incomplete');
    verifyPreparedRuntime(runtime.root, runtime.manifest);
    const output = parse(actual.stdout);
    if (!closed(output, ['version', 'gate', 'eventCapture']) || output.version !== 1
      || !isReport(output.gate, reportExpected)) return fail('promotion-output-invalid');
    result.gate = output.gate;
    // Fixed profiles preserve distinct capability and impact obligations. Both
    // still require exact fresh owner/report/event equality before publication.
    const capabilityMatches = typed ? isTypedRecordPromotionProof(output.gate, admitted.promotion.rows.map(({ canonicalRef }) => canonicalRef))
      : isDecisionOnlyPromotionCapability(output.gate.capabilities) && same(output.gate.assignment.checks.impactPolicy.required, []);
    if (!output.gate.ok || !capabilityMatches
      || !same(output.gate, original) || !same(output.eventCapture, eventCapture)) return fail('promotion-fresh-proof-mismatch');
    result.status = 'passed'; return result;
  } catch (error) {
    if (!(error instanceof EngineRefusal) && !Number.isInteger(error?.errno)) throw error;
    return fail('promotion-evidence-unavailable');
  } finally {
    if (work) try { rmSync(work, { recursive: true, force: true }); }
    catch (error) {
      if (!Number.isInteger(error?.errno)) throw error;
      result.status = 'failed'; fail('promotion-cleanup-failed');
    }
  }
}
