import { validMetadataCaptureLimits, isPreparedSubjectMetadataReport, isPreparedSubjectProposalSuppressionReport } from './prepared-subject-metadata.js';
import { lifecycleMaterialPresent } from './subject-lifecycle-input.js';
/** Fixed read-only checks on exact prepared commits, with detached retained evidence. */
import { executePreparedWorker } from './prepared-worker-process.js';
import { mkdtempSync, lstatSync, readFileSync, realpathSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { canonicalJsonBytes, canonicalSha256 } from './canonical-json.js';
import { EngineRefusal } from './engine-refusal.js';
import { readOwnedFile } from './prepared-evidence-files.js';
import { decodePreparedSubjectSplit, validSplitCaptureLimits, isPreparedSubjectSplitReport } from './prepared-subject-split.js';
import { validReconsiderationCaptureLimits, isPreparedSubjectReconsiderationReport, isPreparedSubjectCreationReport } from './prepared-eventless-creation.js';
import { artifactCapture, retainPreparedEvidence } from './prepared-evidence.js';
import { capturePreparedRuntime, verifyPreparedRuntime, VALIDATION_ENTRYPOINTS } from './prepared-runtime.js';
import { isPreparedMigrationReport } from './prepared-migration-report.js';
import { isPreparedAssignmentContinuationReport, isPreparedTypedAssignmentReport, validTypedAssignmentSelection } from './prepared-assignment-continuation.js';

import { decodePreparedRecordPromotion } from './prepared-record-promotion.js';
import { decodePreparedPromotion } from './prepared-promotion.js';
import { decodePreparedEquivalentMerge, validMergeCaptureLimits } from './prepared-equivalent-merge.js';
import { decodePreparedSubjectRetirement, validRetirementCaptureLimits } from './prepared-subject-retirement.js';

const closed = (value, keys) => value !== null && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const descriptor = (value) => closed(value, ['commit', 'tree', 'kitPath'])
  && ['commit', 'tree'].every((key) => typeof value[key] === 'string' && /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(value[key]))
  && ['.', 'unknown-knowledge'].includes(value.kitPath);
const limitKeys = ['maxRuntimeFiles', 'maxRuntimeBytes', 'maxOutputBytesPerCheck', 'maxCheckMilliseconds'];
const refuse = (message) => { throw new EngineRefusal(`prepared validation: ${message}`); };
const within = (root, path) => { const rel = relative(root, path); return rel === '' || (!rel.startsWith('../') && rel !== '..' && !isAbsolute(rel)); };
const unsafeMigration = () => {
  const error = new EngineRefusal('prepared validation: migration execution did not produce safe retained evidence');
  error.code = 'unsafe-migration-output'; throw error;
};

function checkMigrationOutput(work, report, plan) {
  const check = report.checks?.find(({ id }) => id === 'operation');
  if (check?.status === 'not-performed' && check.completion === 'unavailable'
    && check.stdout === null && check.stderr === null && check.result === null) return;
  if (!check || check.completion !== 'complete' || check.signal !== null || ![0, 1].includes(check.exitCode)
    || check.stdout !== 'operation.stdout' || check.stderr !== 'operation.stderr' || check.result !== 'operation.result') unsafeMigration();
  const bytes = readFileSync(join(work, 'operation.stdout'));
  if (readFileSync(join(work, 'operation.stderr')).length !== 0 || !readFileSync(join(work, 'operation.result')).equals(bytes)) unsafeMigration();
  let result;
  try { result = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { unsafeMigration(); }
  // The fixed shim emits exactly JSON.stringify(report)+LF. Re-encoding also
  // rejects duplicate/ignored JSON keys that could hide private data in raw bytes.
  if (!isPreparedMigrationReport(result, plan) || !Buffer.from(`${JSON.stringify(result)}\n`).equals(bytes)
    || check.exitCode !== (result.mechanicalStatus === 'passed' ? 0 : 1)) unsafeMigration();
}

/** Split-only byte/exit association and owned artifact admission, not report authority. */
function readSplitArtifacts(work, report, plan) {
  if (!closed(report, ['checks', 'diagnostics', 'provenance', 'eventSource'])
    || !Array.isArray(report.checks) || report.checks.length !== 3
    || !['structural', 'values', 'operation'].every((id, index) => report.checks[index]?.id === id)) {
    refuse('split worker check inventory invalid');
  }
  const check = report.checks[2];
  if (!check || check.completion !== 'complete' || check.signal !== null || ![0, 1].includes(check.exitCode)
    || check.stdout !== 'operation.stdout' || check.stderr !== 'operation.stderr' || check.result !== 'operation.result') {
    refuse('split operation incomplete');
  }
  const read = (name, cap) => {
    try { return readOwnedFile(join(work, name), cap); }
    catch (error) {
      if (!(error instanceof EngineRefusal) && !Number.isInteger(error?.errno)) throw error;
      refuse('split raw capture unavailable or exceeds capacity');
    }
  };
  const stdout = read('operation.stdout', plan.limits.maxOutputBytesPerCheck);
  const result = read('operation.result', plan.limits.maxOutputBytesPerCheck);
  const stderr = read('operation.stderr', plan.limits.maxOutputBytesPerCheck);
  if (!stdout.equals(result) || stderr.length) refuse('split operation output mismatch');
  let gate;
  try { gate = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(stdout)); }
  catch { refuse('split operation output invalid'); }
  if (!isPreparedSubjectSplitReport(gate, plan, plan.operationInputs.gateInput)
    || !Buffer.from(`${JSON.stringify(gate)}\n`).equals(stdout)
    || check.exitCode !== (gate.ok ? 0 : 1) || check.status !== (gate.ok ? 'passed' : 'failed')) refuse('split operation output mismatch');
  const caps = plan.operationInputs.captureLimits;
  const expected = gate.ok ? [['registry', caps.maxRegistryBytes], ['identity', caps.maxIdentityBytes],
    ...(plan.operationInputs.gateInput.operation.assignmentEvent === null ? [] : [['event', caps.maxEventBytes]])] : [];
  for (const name of ['registry', 'identity', 'event']) if (!expected.some(([kind]) => kind === name)) {
    try { lstatSync(join(work, `operation.${name}`)); refuse('split unexpected authority capture'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  return { streams: { stdout, stderr, result },
    artifacts: expected.map(([name, cap]) => [`checks/operation/${name}.yaml`, read(`operation.${name}`, cap)]) };
}

/** Fixed eventless readback; exact returned bytes are reused during retention. */
function readReconsiderationArtifacts(work, report, plan) {
  const family = plan.operation === 'subject-proposal-suppression' ? 'proposal-suppression' : plan.operation === 'subject-metadata' ? 'metadata' : 'reconsideration';
  if (!closed(report, ['checks', 'diagnostics', 'provenance', 'eventSource']) || report.eventSource !== null
    || !Array.isArray(report.checks) || report.checks.length !== 3
    || !['structural', 'values', 'operation'].every((id, index) => report.checks[index]?.id === id)) {
    refuse(`${family} worker check inventory invalid`);
  }
  const check = report.checks[2];
  if (check.completion !== 'complete' || check.signal !== null || ![0, 1].includes(check.exitCode)
    || check.stdout !== 'operation.stdout' || check.stderr !== 'operation.stderr' || check.result !== 'operation.result') {
    refuse(`${family} operation incomplete`);
  }
  const read = (name, cap) => {
    try { return readOwnedFile(join(work, name), cap); }
    catch (error) {
      if (!(error instanceof EngineRefusal) && !Number.isInteger(error?.errno)) throw error;
      refuse(`${family} raw capture unavailable or exceeds capacity`);
    }
  };
  const streams = Object.fromEntries(['stdout', 'stderr', 'result'].map(name =>
    [name, read(`operation.${name}`, plan.limits.maxOutputBytesPerCheck)]));
  if (!streams.stdout.equals(streams.result) || streams.stderr.length) refuse(`${family} operation output mismatch`);
  let gate;
  try { gate = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(streams.result)); }
  catch { refuse(`${family} operation output invalid`); }
  if (!(plan.operation === 'subject-proposal-suppression' ? isPreparedSubjectProposalSuppressionReport : plan.operation === 'subject-metadata' ? isPreparedSubjectMetadataReport : plan.operation === 'subject-creation' ? isPreparedSubjectCreationReport : isPreparedSubjectReconsiderationReport)(gate, plan, plan.operationInputs.gateInput)
    || !Buffer.from(`${JSON.stringify(gate)}\n`).equals(streams.result)
    || check.exitCode !== (gate.ok ? 0 : 1) || check.status !== (gate.ok ? 'passed' : 'failed')) {
    refuse(`${family} operation output mismatch`);
  }
  const expected = gate.ok ? [['registry', plan.operationInputs.captureLimits.maxRegistryBytes],
    ...(['subject-metadata','subject-proposal-suppression'].includes(plan.operation) ? [] : [['identity', plan.operationInputs.captureLimits.maxIdentityBytes]])] : [];
  for (const name of ['registry', 'identity', 'event']) if (!expected.some(([kind]) => kind === name)) {
    try { lstatSync(join(work, `operation.${name}`)); refuse(`${family} unexpected authority capture`); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  return { streams, artifacts: expected.map(([name, cap]) => [`checks/operation/${name}.yaml`, read(`operation.${name}`, cap)]) };
}

/** Continued assignment retains the exact bounded bytes checked against its wire. */
function readContinuedAssignmentArtifacts(work, report, plan) {
  const check = report.checks?.find(row => row.id === 'operation');
  if (!check || check.completion !== 'complete' || check.signal !== null || ![0, 1].includes(check.exitCode)
    || check.stdout !== 'operation.stdout' || check.stderr !== 'operation.stderr' || check.result !== 'operation.result') {
    refuse('continued assignment operation incomplete');
  }
  const streams = Object.fromEntries(['stdout', 'stderr', 'result'].map(name =>
    [name, readOwnedFile(join(work, `operation.${name}`), plan.limits.maxOutputBytesPerCheck)]));
  if (!streams.stdout.equals(streams.result) || streams.stderr.length) refuse('continued assignment output mismatch');
  let gate;
  try { gate = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(streams.result)); }
  catch { refuse('continued assignment output invalid'); }
  if (!(Object.hasOwn(plan.operationInputs, 'selection') ? isPreparedTypedAssignmentReport : isPreparedAssignmentContinuationReport)(gate, plan)
    || !Buffer.from(`${JSON.stringify(gate)}\n`).equals(streams.result)
    || check.exitCode !== (gate.ok ? 0 : 1) || check.status !== (gate.ok ? 'passed' : 'failed')) {
    refuse('continued assignment output mismatch');
  }
  let event = null;
  if (report.eventSource !== null) {
    const { capture, ...hint } = report.eventSource;
    if (capture !== 'operation.event' || !isDeepStrictEqual(hint, gate.eventSource)) refuse('continued assignment event mismatch');
    event = readOwnedFile(join(work, 'operation.event'), plan.operationInputs.maxEventBytes);
  } else {
    // An absent capture includes refusal of an empty file or broken symlink.
    try { lstatSync(join(work, 'operation.event')); refuse('continued assignment unexpected event'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  return { streams, event };
}

/**
 * Migration operationInputs contain private migrationInputs and explicit limits.
 * Assignment inputs use existing Decision capture JSON transport (bytesBase64).
 * No caller commands, models, success flags, required-check lists or crosswalks.
 * evidenceDirectory is an existing managed mode-0700 directory with caller-owned
 * persistent lifetime. This runner never dispatches or mutates repository refs.
 */
export async function runPreparedCandidateChecks(input) {
  if (!closed(input, ['repoRoot', 'source', 'candidate', 'operation', 'operationInputs', 'limits', 'evidenceDirectory'])
    || !descriptor(input.source) || !descriptor(input.candidate)
    || !['identity-migration', 'subject-assignment', 'subject-equivalent-merge', 'subject-retirement', 'subject-split', 'subject-reconsideration', 'subject-metadata', 'subject-proposal-suppression', 'subject-creation', 'ordinary-promotion', 'typed-record-promotion'].includes(input.operation)
    || (input.operation === 'identity-migration' ? !closed(input.operationInputs, ['migrationInputs', 'limits'])
      : ['subject-equivalent-merge', 'subject-retirement', 'subject-split', 'subject-reconsideration', 'subject-metadata', 'subject-proposal-suppression', 'subject-creation'].includes(input.operation) ? (!closed(input.operationInputs, ['gateInput', 'captureLimits'])
        || !(['subject-metadata','subject-proposal-suppression'].includes(input.operation) ? validMetadataCaptureLimits : ['subject-reconsideration', 'subject-creation'].includes(input.operation) ? validReconsiderationCaptureLimits : input.operation === 'subject-split' ? validSplitCaptureLimits : input.operation === 'subject-retirement' ? validRetirementCaptureLimits : validMergeCaptureLimits)(input.operationInputs.captureLimits))
      : ['ordinary-promotion', 'typed-record-promotion'].includes(input.operation) ? (!closed(input.operationInputs, ['gateInput', 'maxEventBytes'])
        || !Number.isSafeInteger(input.operationInputs.maxEventBytes) || input.operationInputs.maxEventBytes <= 0)
      : !closed(input.operationInputs, ['eventId', 'reviewNote', 'decisionCaptures', 'limits', 'impact', 'maxEventBytes',
        ...('continuation' in Object(input.operationInputs) ? ['continuation'] : []),
        ...('selection' in Object(input.operationInputs) ? ['selection'] : [])])
        || !Number.isSafeInteger(input.operationInputs.maxEventBytes) || input.operationInputs.maxEventBytes <= 0
        || !input.operationInputs.impact || Array.isArray(input.operationInputs.impact)
        || Object.keys(input.operationInputs.impact).some((key) => !['routes', 'regeneratedViews', 'representativeReplays'].includes(key)))
    || !closed(input.limits, limitKeys)
    || !limitKeys.every((key) => Number.isSafeInteger(input.limits[key]) && input.limits[key] > 0)
    || input.limits.maxCheckMilliseconds > 600_000
    || !['repoRoot', 'evidenceDirectory'].every((key) => typeof input[key] === 'string' && input[key].length && !input[key].includes('\0'))) {
    refuse('expected exact commits, supported operation, closed migration or assignment inputs, and explicit positive limits (timeout <= 600000ms)');
  }
  if (input.operation === 'subject-assignment' && 'selection' in input.operationInputs) {
    const field = Object.getOwnPropertyDescriptor(input.operationInputs, 'selection');
    if (!field?.enumerable || !Object.hasOwn(field, 'value') || !validTypedAssignmentSelection(field.value)) {
      refuse('typed assignment requires an own-data closed selection');
    }
  }
  // Detach all accepted input before asynchronous execution can hand control back.
  const plan = JSON.parse(canonicalJsonBytes(input));
  const metadata = ['subject-metadata','subject-proposal-suppression'].includes(plan.operation);
  const reconsideration = ['subject-reconsideration', 'subject-creation'].includes(plan.operation);
  if ((reconsideration || metadata) && (!closed(plan.operationInputs.gateInput, ['version', 'before', 'candidate', 'operation', 'limits', 'evidence', 'impact'])
    || plan.operationInputs.gateInput.version !== 1 || !isDeepStrictEqual(plan.operationInputs.gateInput.before, plan.source)
    || !isDeepStrictEqual(plan.operationInputs.gateInput.candidate, plan.candidate))) refuse(metadata ? 'metadata input binding mismatch' : 'reconsideration input binding mismatch');
  const continuedAssignment = plan.operation === 'subject-assignment' && (Object.hasOwn(plan.operationInputs, 'continuation') || Object.hasOwn(plan.operationInputs, 'selection'));
  plan.repoRoot = realpathSync(plan.repoRoot);
  if (plan.operation === 'subject-equivalent-merge' && !lifecycleMaterialPresent(plan.operationInputs.gateInput)) decodePreparedEquivalentMerge(plan.repoRoot, plan.operationInputs.gateInput);
  if (plan.operation === 'subject-split' && !lifecycleMaterialPresent(plan.operationInputs.gateInput)) decodePreparedSubjectSplit(plan.repoRoot, plan.operationInputs.gateInput);
  if (plan.operation === 'subject-retirement') {
    const wire = plan.operationInputs.gateInput;
    if (!lifecycleMaterialPresent(wire)) decodePreparedSubjectRetirement(plan.repoRoot, wire);
    else if (!closed(wire, ['version', 'before', 'candidate', 'operation', 'reviewNote', 'evidence', 'limits', 'impact'])
      || wire.version !== 1 || !isDeepStrictEqual(wire.before, plan.source)
      || !isDeepStrictEqual(wire.candidate, plan.candidate)) refuse('retirement input binding mismatch');
  }
  if (plan.operation === 'ordinary-promotion') decodePreparedPromotion(plan.repoRoot, plan.operationInputs.gateInput);
  if (plan.operation === 'typed-record-promotion' && !lifecycleMaterialPresent(plan.operationInputs.gateInput)) decodePreparedRecordPromotion(plan.repoRoot, plan.operationInputs.gateInput);
  plan.evidenceDirectory = resolve(plan.evidenceDirectory);
  const work = mkdtempSync(join(realpathSync('/tmp'), 'prepared-validation-'));
  let output;
  try {
    if (within(plan.repoRoot, work)) refuse('private runtime must be outside the repository');
    const runtime = capturePreparedRuntime(work, plan.limits, plan.operation);
    if (Object.values(runtime.manifest.executables).some(({ path }) => within(plan.repoRoot, path))) {
      refuse('trusted host executables must be outside the repository');
    }
    const artifacts = runtime.artifacts;
    const add = (file, bytes) => { artifacts.push({ file, bytes }); return artifactCapture(file, bytes); };
    add('runtime/manifest.json', canonicalJsonBytes(runtime.manifest));
    const runtimeDigest = canonicalSha256(runtime.manifest);
    const operationInput = plan.operation === 'subject-assignment' ? { source: plan.source, candidate: plan.candidate,
      operation: plan.operation, operationInputs: plan.operationInputs, runtimeDigest } : ['subject-equivalent-merge', 'subject-retirement', 'subject-split', 'subject-reconsideration', 'subject-metadata', 'subject-proposal-suppression', 'subject-creation', 'ordinary-promotion', 'typed-record-promotion'].includes(plan.operation) ? plan.operationInputs : null;
    const operationInputDigest = operationInput === null ? null : canonicalSha256(operationInput);
    if (plan.operation === 'subject-assignment') add('checks/operation/input.json', canonicalJsonBytes(operationInput));
    if (['subject-equivalent-merge', 'subject-retirement', 'subject-split', 'subject-reconsideration', 'subject-metadata', 'subject-proposal-suppression', 'subject-creation'].includes(plan.operation)) {
      add('checks/operation/input.json', canonicalJsonBytes(plan.operationInputs.gateInput));
      add('checks/operation/capture-limits.json', canonicalJsonBytes(plan.operationInputs.captureLimits));
    }
    if (['ordinary-promotion', 'typed-record-promotion'].includes(plan.operation)) {
      add('checks/operation/input.json', canonicalJsonBytes(plan.operationInputs.gateInput));
      add('checks/operation/capture-limits.json', canonicalJsonBytes({ maxEventBytes: plan.operationInputs.maxEventBytes }));
    }
    const jobFile = join(work, 'job.json');
    writeFileSync(jobFile, canonicalJsonBytes({ repoRoot: plan.repoRoot, source: plan.source,
      candidate: plan.candidate, limits: plan.limits, manifest: runtime.manifest,
      operation: plan.operation, operationInputs: plan.operationInputs, operationInputDigest }), { flag: 'wx', mode: 0o400 });
    verifyPreparedRuntime(runtime.root, runtime.manifest);
    const worker = await executePreparedWorker(runtime, jobFile, plan.limits, 'validation');
    if ((reconsideration || metadata) && (worker.status !== 0 || worker.error || worker.signal
      || worker.stdout.length || worker.stderr.length)) refuse(metadata ? 'metadata worker incomplete' : 'reconsideration worker incomplete');
    if (continuedAssignment && (worker.status !== 0 || worker.error || worker.signal
      || worker.stdout.length || worker.stderr.length)) refuse('continued assignment worker incomplete');
    if (plan.operation === 'subject-split' && (worker.status !== 0 || worker.error || worker.signal
      || worker.stdout.length || worker.stderr.length)) refuse('split worker incomplete');
    if (plan.operation === 'identity-migration' && (worker.status !== 0 || worker.error || worker.signal
      || worker.stdout.length || worker.stderr.length)) unsafeMigration();
    const execution = { exitCode: worker.status, signal: worker.signal,
      reason: worker.error?.code ?? null,
      stdout: add('execution/stdout', worker.stdout ?? Buffer.alloc(0)),
      stderr: add('execution/stderr', worker.stderr ?? Buffer.alloc(0)) };
    let workerReport;
    if (worker.status === 0 && !worker.error && !worker.signal) {
      const bytes = metadata || reconsideration || plan.operation === 'subject-split' || continuedAssignment
        ? readOwnedFile(join(work, 'worker-report.json'), plan.limits.maxOutputBytesPerCheck)
        : readFileSync(join(work, 'worker-report.json'));
      try { workerReport = JSON.parse(bytes); }
      catch (error) { if (metadata) refuse('metadata worker report invalid'); if (reconsideration) refuse('reconsideration worker report invalid'); if (plan.operation === 'subject-split') refuse('split worker report invalid'); if (plan.operation === 'identity-migration') unsafeMigration(); throw error; }
      add('execution/result.json', bytes);
    } else {
      workerReport = { provenance: 'unverified', eventSource: null, diagnostics: [{ code: 'worker-incomplete' },
        ...(plan.operation === 'subject-assignment' ? [{ code: 'assignment-event-unavailable' }] : [])],
        checks: [...VALIDATION_ENTRYPOINTS, { id: 'operation' }].map(({ id, path }) => ({ id,
          invocation: path ? { entrypoint: path, arguments: ['--json', '--root', '<candidate-root>'] } : null,
          status: 'not-performed', completion: 'unavailable', reason: 'worker-incomplete',
          exitCode: null, signal: null, stdout: null, stderr: null, result: null })) };
    }
    if (plan.operation === 'identity-migration') checkMigrationOutput(work, workerReport, plan);
    const splitOutput = plan.operation === 'subject-split' ? readSplitArtifacts(work, workerReport, plan) : null;
    const reconsiderationOutput = reconsideration || metadata ? readReconsiderationArtifacts(work, workerReport, plan) : null;
    const continuedOutput = continuedAssignment ? readContinuedAssignmentArtifacts(work, workerReport, plan) : null;
    if (splitOutput) for (const [file, bytes] of splitOutput.artifacts) add(file, bytes);
    if (reconsiderationOutput) for (const [file, bytes] of reconsiderationOutput.artifacts) add(file, bytes);
    for (const check of workerReport.checks) {
      for (const stream of ['stdout', 'stderr', 'result']) {
        if (check[stream] !== null) {
          const name = `${check.id}.${stream}`;
          if (!['structural', 'values', 'operation'].includes(check.id) || check[stream] !== name) refuse('unexpected worker artifact');
          // Fixed new profiles retain the exact validated operation bytes.
          const verifiedOutput = reconsiderationOutput ?? splitOutput ?? continuedOutput;
          check[stream] = add(`checks/${check.id}/${stream}`, verifiedOutput && check.id === 'operation'
            ? verifiedOutput.streams[stream] : readFileSync(join(work, name)));
        }
      }
    }
    if (['subject-equivalent-merge', 'subject-retirement'].includes(plan.operation)) {
      const retirement = plan.operation === 'subject-retirement';
      const eventRequired = plan.operationInputs.gateInput.operation.assignmentEvent !== null;
      if (!eventRequired) {
        // Reject an event file even when it is empty or a broken symbolic link.
        try { lstatSync(join(work, 'operation.event')); refuse(retirement ? 'retirement unexpected event capture' : 'equivalent merge unexpected event capture'); }
        catch (error) { if (error.code !== 'ENOENT') throw error; }
      }
      for (const [name, artifact] of [['registry', 'registry.yaml'], ...(eventRequired ? [['event', 'event.yaml']] : [])]) {
        let bytes;
        try { bytes = readFileSync(join(work, `operation.${name}`)); }
        catch { refuse(retirement ? 'retirement raw capture unavailable' : 'equivalent merge raw capture unavailable'); }
        const cap = name === 'registry' ? plan.operationInputs.captureLimits.maxRegistryBytes : plan.operationInputs.captureLimits.maxEventBytes;
        if (bytes.length > cap) refuse(retirement ? 'retirement capture capacity' : 'equivalent merge capture capacity');
        add(`checks/operation/${artifact}`, bytes);
      }
    }
    if (['ordinary-promotion', 'typed-record-promotion'].includes(plan.operation)) {
      let bytes;
      try { bytes = readFileSync(join(work, 'operation.event')); }
      catch { refuse('ordinary promotion event capture unavailable'); }
      if (bytes.length > plan.operationInputs.maxEventBytes) refuse('ordinary promotion capture capacity');
      add('checks/operation/event.yaml', bytes);
    }
    if (workerReport.eventSource != null) {
      if (plan.operation !== 'subject-assignment' || workerReport.eventSource.capture !== 'operation.event') refuse('unexpected event artifact');
      workerReport.eventSource.capture = add('checks/operation/event.yaml', continuedOutput
        ? continuedOutput.event : readFileSync(join(work, 'operation.event')));
    }
    if (plan.operation === 'identity-migration') {
      unlinkSync(jobFile);
      plan.operationInputs = null;
    }
    let runtimeVerification = 'verified';
    try { verifyPreparedRuntime(runtime.root, runtime.manifest); }
    catch (error) { runtimeVerification = 'failed'; workerReport.diagnostics.push({ code: 'runtime-drift', kind: error.name }); }
    const report = { version: 1, source: plan.source, candidate: plan.candidate, operation: plan.operation,
      runtimeDigest, runtimeVerification, ...workerReport, execution,
      validationComplete: false, publicationReady: false };
    add('report.json', canonicalJsonBytes(report));
    const reportDigest = canonicalSha256(report);
    const retention = retainPreparedEvidence({ evidenceDirectory: plan.evidenceDirectory, repoRoot: plan.repoRoot,
      runtimeRoot: work, artifacts, binding: { source: plan.source, candidate: plan.candidate,
        operation: plan.operation, runtimeDigest, reportDigest } });
    output = { report, runtimeDigest, reportDigest, retention };
  } finally {
    try { rmSync(work, { recursive: true, force: true }); }
    catch (error) { if (metadata) refuse('metadata private runtime cleanup failed; retained evidence, if any, remains intact'); if (reconsideration) refuse('reconsideration private runtime cleanup failed; retained evidence, if any, remains intact'); if (plan.operation === 'subject-split') refuse('split private runtime cleanup failed; retained evidence, if any, remains intact'); if (output) output.cleanup = { status: 'failed', code: error.code ?? error.name }; else throw error; }
  }
  return output;
}
