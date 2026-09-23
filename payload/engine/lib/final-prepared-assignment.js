/** Fresh final assignment evaluation; never mutates a prior report or publishes refs. */
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, relative } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { canonicalJsonBytes, canonicalSha256 } from './canonical-json.js';
import { EngineRefusal } from './engine-refusal.js';
import { readRetainedPreparedEvidence } from './prepared-evidence.js';
import { verifyRetainedRuntimeCapability } from './runtime-capability.js';
import { capturePreparedRuntime, verifyPreparedRuntime } from './prepared-runtime.js';
import { executePreparedWorker } from './prepared-worker-process.js';
import { readBoundPreparedAssignmentInput } from './prepared-assignment-binding.js';
import { isIdentityUuid } from './record-identity.js';
import { isPreparedAssignmentContinuationReport, isPreparedTypedAssignmentReport } from './prepared-assignment-continuation.js';

const policyBytes = readFileSync(new URL('../policies/candidate-publication.json', import.meta.url));
const policies = JSON.parse(policyBytes);
const policy = policies.operations['subject-assignment'];
const closed = (v, keys) => v !== null && typeof v === 'object' && !Array.isArray(v)
  && Reflect.ownKeys(v).length === keys.length && keys.every((key) => Object.hasOwn(v, key));
const runtimeKeys = ['maxRuntimeFiles', 'maxRuntimeBytes', 'maxOutputBytesPerCheck', 'maxCheckMilliseconds'];
const hash = (v) => typeof v === 'string' && /^[0-9a-f]{64}(?![\s\S])/.test(v);
const within = (root, target) => { const rel = relative(root, target); return rel === '' || (!rel.startsWith('../') && rel !== '..' && !isAbsolute(rel)); };
function parse(bytes) {
  let value;
  try { value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { throw new EngineRefusal('invalid final assignment JSON'); }
  if (!canonicalJsonBytes(value).equals(bytes)) throw new EngineRefusal('noncanonical final assignment JSON');
  return value;
}
function validGate(gate, expected) {
  if (Object.hasOwn(expected.operationInputs, 'selection')) return isPreparedTypedAssignmentReport(gate, expected);
  if (Object.hasOwn(expected.operationInputs, 'continuation')) return isPreparedAssignmentContinuationReport(gate, expected);
  return closed(gate, ['version', 'ok', 'mode', 'publicationReady', 'inputs', 'eventSource', 'scope', 'checks',
    'rows', 'optionalImpact', 'used', 'diagnostics']) && gate.version === 1 && typeof gate.ok === 'boolean'
    && gate.mode === 'read-only-prepared-assignment' && gate.publicationReady === false
    && closed(gate.optionalImpact, ['routes', 'regeneratedViews', 'representativeReplays'])
    && Array.isArray(gate.rows) && Array.isArray(gate.diagnostics);
}
function assessedSubjectTree(report) {
  const paths = ['subjects/derived/tree.md', 'subjects/derived/metadata.json'];
  return report?.status === 'complete' && report.coverage?.assessedViews >= 1
    && report.resources?.derivations?.calls === report.coverage.assessedViews * 2
    && Array.isArray(report.views) && report.views.some((view) => view.kind === 'subject-tree'
      && view.delta?.status === 'exact' && ['before', 'after'].every((side) => view[side]?.status === 'complete'
        && Array.isArray(view[side].artifacts) && view[side].artifacts.length === paths.length
        && paths.every((path) => view[side].artifacts.filter((artifact) => artifact.path === path).length === 1)));
}

/** The only inputs are fixed retained coordinates, external approved configuration and explicit bounds. */
export async function runFinalPreparedAssignmentGate(input) {
  const result = { version: 1, kind: 'final-prepared-assignment', policy: { id: policy.id, version: policy.version, digest: canonicalSha256(policy) },
    source: null, candidate: null, runtimeDigest: null, capability: null,
    routes: { scope: 'kit-managed-subject-route-persistence', managedPersistence: 'unavailable', suppliedAssessment: null },
    gate: null, status: 'failed', diagnostics: [] };
  const fail = (code) => { result.diagnostics.push({ code }); return result; };
  if (!closed(input, ['repoRoot', 'evidenceDirectory', 'validationBundleDigest', 'expected', 'approvedRuntimeProfile', 'limits'])
    || typeof input.repoRoot !== 'string' || !input.repoRoot || input.repoRoot.includes('\0')
    || !closed(input.limits, ['evidence', 'runtime']) || !closed(input.limits.runtime, runtimeKeys)
    || !runtimeKeys.every((key) => Number.isSafeInteger(input.limits.runtime[key]) && input.limits.runtime[key] > 0)
    || input.limits.runtime.maxCheckMilliseconds > 600000 || input.expected?.operation !== 'subject-assignment') return fail('invalid-final-assignment-input');
  // Detach before the first asynchronous process boundary; no later caller mutation changes the job.
  const plan = structuredClone(input); let work = null;
  try {
    const readInput = { evidenceDirectory: plan.evidenceDirectory, bundleDigest: plan.validationBundleDigest,
      expected: plan.expected, limits: plan.limits.evidence };
    const retained = readRetainedPreparedEvidence(readInput);
    if (retained.status !== 'verified') return fail('final-assignment-retention-unavailable');
    result.source = { ...retained.manifest.source }; result.candidate = { ...retained.manifest.candidate };
    const policyArtifact = retained.artifacts.find((row) => row.file === 'runtime/files/engine/policies/candidate-publication.json');
    if (!policyArtifact?.bytes.equals(policyBytes)) return fail('final-assignment-policy-mismatch');
    const inputArtifact = retained.artifacts.find((row) => row.file === 'checks/operation/input.json');
    if (!inputArtifact) return fail('final-assignment-input-unavailable');
    const operation = readBoundPreparedAssignmentInput(retained, plan.expected);
    const typed = Object.hasOwn(operation.operationInputs, 'selection');
    if (typed) result.policy = { id: policies.typedSubjectAssignment.id, version: policies.typedSubjectAssignment.version, digest: canonicalSha256(policies.typedSubjectAssignment) };
    if (!closed(operation, ['source', 'candidate', 'operation', 'operationInputs', 'runtimeDigest'])
      || operation.operation !== 'subject-assignment' || operation.runtimeDigest !== retained.manifest.runtimeDigest
      || !isDeepStrictEqual(operation.source, result.source) || !isDeepStrictEqual(operation.candidate, result.candidate)) return fail('final-assignment-input-mismatch');
    const values = operation.operationInputs;
    if (!closed(values, ['eventId', 'reviewNote', 'decisionCaptures', 'limits', 'impact', 'maxEventBytes',
      ...('continuation' in Object(values) ? ['continuation'] : []), ...(typed ? ['selection'] : [])])
      || !isIdentityUuid(values.eventId) || !values.impact || Array.isArray(values.impact)
      || Object.keys(values.impact).some((key) => !['routes', 'regeneratedViews', 'representativeReplays'].includes(key))) return fail('final-assignment-input-mismatch');
    const supplied = Object.hasOwn(values.impact, 'routes');
    result.routes.suppliedAssessment = supplied ? 'incomplete' : 'not-supplied';
    const operationCheck = retained.report.checks.find(({ id }) => id === 'operation');
    const continuationExpected = { source: result.source, candidate: result.candidate, operationInputs: values };
    if (typed || Object.hasOwn(values, 'continuation')) {
      const artifact = retained.artifacts.find(row => row.file === 'checks/operation/result');
      if (!artifact || !isDeepStrictEqual(operationCheck?.result,
        { kind: 'detached-artifact', file: artifact.file, size: artifact.size, sha256: artifact.sha256 })) return fail('final-assignment-continuation-report-invalid');
      let prior;
      try { prior = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(artifact.bytes)); }
      catch { return fail('final-assignment-continuation-report-invalid'); }
      if (!(typed ? isPreparedTypedAssignmentReport : isPreparedAssignmentContinuationReport)(prior, continuationExpected)
        || !Buffer.from(`${JSON.stringify(prior)}\n`).equals(artifact.bytes)
        || operationCheck.exitCode !== (prior.ok ? 0 : 1)
        || operationCheck.status !== (prior.ok ? 'passed' : 'failed')) return fail('final-assignment-continuation-report-invalid');
    }
    if (retained.report.provenance !== 'verified' || retained.report.runtimeVerification !== 'verified'
      || operationCheck?.invocation?.injectedInputsDigest !== canonicalSha256(operation)
      || operationCheck.completion !== 'complete'
      || !retained.report.checks.filter(({ id }) => id !== 'operation').every((check) => check.status === 'passed'
        && check.completion === 'complete' && check.exitCode === 0)) return fail('final-assignment-validation-incomplete');
    const event = retained.report.eventSource;
    const eventArtifact = retained.artifacts.find((row) => row.file === 'checks/operation/event.yaml');
    if (!eventArtifact || !event || !isDeepStrictEqual(event.candidate, result.candidate) || event.eventId !== values.eventId
      || !isDeepStrictEqual(event.capture, { kind: 'detached-artifact', file: eventArtifact.file, size: eventArtifact.size, sha256: eventArtifact.sha256 })) return fail('final-assignment-event-unavailable');
    const capability = verifyRetainedRuntimeCapability(readInput, plan.approvedRuntimeProfile);
    result.capability = { profileDigest: plan.approvedRuntimeProfile === null ? null
      : hash(plan.approvedRuntimeProfile?.digest) ? plan.approvedRuntimeProfile.digest : null, resultDigest: canonicalSha256(capability) };
    if (capability.status !== 'established' || capability.persistence !== 'unsupported'
      || capability.scope !== result.routes.scope || capability.runtimeDigest !== retained.manifest.runtimeDigest
      || !isDeepStrictEqual(capability.captures, { source: result.source, candidate: result.candidate })) return fail('final-assignment-capability-unavailable');
    plan.repoRoot = realpathSync(plan.repoRoot);
    work = mkdtempSync(join(realpathSync('/tmp'), 'final-assignment-'));
    if (within(plan.repoRoot, work)) return fail('final-assignment-runtime-overlap');
    const runtime = capturePreparedRuntime(work, plan.limits.runtime, 'subject-assignment');
    if (Object.values(runtime.manifest.executables).some(({ path }) => within(plan.repoRoot, path))) return fail('final-assignment-runtime-overlap');
    if (canonicalSha256(runtime.manifest) !== retained.manifest.runtimeDigest) return fail('final-assignment-runtime-mismatch');
    const entry = runtime.manifest.files.find(({ path }) => path === 'engine/lib/final-assignment-check.js');
    if (!entry) return fail('final-assignment-entrypoint-unavailable');
    verifyPreparedRuntime(runtime.root, runtime.manifest);
    result.runtimeDigest = canonicalSha256(runtime.manifest); result.routes.managedPersistence = 'not-applicable';
    const jobFile = join(work, 'job.json');
    writeFileSync(jobFile, canonicalJsonBytes({ repoRoot: plan.repoRoot, source: result.source, candidate: result.candidate,
      operationInputs: values, manifest: runtime.manifest }), { flag: 'wx', mode: 0o400 });
    const actual = await executePreparedWorker(runtime, jobFile, plan.limits.runtime, 'final-assignment');
    if (actual.error) return fail('final-assignment-worker-incomplete');
    if (actual.status !== 0 || actual.signal || actual.stderr.length) {
      // Unexpected trusted child failures must remain diagnosable, outside retained domain JSON.
      const error = new Error('Trusted final assignment worker failed unexpectedly', { cause: new Error(actual.stderr.toString('utf8')) });
      error.name = 'FinalAssignmentExecutionError';
      error.execution = { exitCode: actual.status, signal: actual.signal, stdout: actual.stdout, stderr: actual.stderr };
      throw error;
    }
    verifyPreparedRuntime(runtime.root, runtime.manifest);
    const output = parse(actual.stdout);
    if (!closed(output, ['version', 'gate', 'eventCapture']) || output.version !== 1 || !validGate(output.gate, continuationExpected)) return fail('final-assignment-output-invalid');
    result.gate = output.gate;
    const gate = result.gate;
    if (!isDeepStrictEqual(output.eventCapture, { file: event.file, size: eventArtifact.size, sha256: eventArtifact.sha256 })) return fail('final-assignment-event-mismatch');
    if (supplied && gate.optionalImpact.routes.status === 'complete') result.routes.suppliedAssessment = 'complete';
    const { capture, ...hint } = event;
    if (!isDeepStrictEqual(gate.inputs?.before, { kind: 'commit', ...result.source })
      || !isDeepStrictEqual(gate.inputs?.candidate, { kind: 'commit', ...result.candidate })
      || !isDeepStrictEqual(gate.eventSource, hint)) return fail('final-assignment-source-mismatch');
    if (!gate.ok || !assessedSubjectTree(gate.optionalImpact.regeneratedViews)
      || gate.optionalImpact.representativeReplays.status !== 'complete'
      || (supplied && result.routes.suppliedAssessment !== 'complete')) return fail('final-assignment-gate-incomplete');
    result.status = 'passed'; return result;
  } catch (error) {
    if (!(error instanceof EngineRefusal) && !Number.isInteger(error?.errno)) throw error;
    return fail('final-assignment-evidence-unavailable');
  } finally {
    if (work) {
      try { rmSync(work, { recursive: true, force: true }); }
      catch (error) {
        if (!Number.isInteger(error?.errno)) throw error;
        result.status = 'failed'; fail('final-assignment-cleanup-failed');
      }
    }
  }
}
