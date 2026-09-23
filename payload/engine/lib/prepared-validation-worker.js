import { capturePreparedSubjectMetadata, isPreparedSubjectMetadataReport, capturePreparedSubjectProposalSuppression, isPreparedSubjectProposalSuppressionReport } from './prepared-subject-metadata.js';
import { capturePreparedSubjectCreation, isPreparedSubjectCreationReport } from './prepared-subject-creation.js';
import { SUBJECT_CREATION_ENTRYPOINT } from './prepared-validation-policy.js';
/** Private fixed worker; invoked only by the trusted prepared-validation runner. */
import { executePreparedEngineCheck } from './prepared-engine-process.js';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalJsonBytes } from './canonical-json.js';
import { readCommittedTree, withTreeSnapshot } from './commit-snapshot.js';
import { locateKitRoot } from './kit-root.js';
import { rethrowIfBug } from './engine-refusal.js';
import { ASSIGNMENT_ENTRYPOINT, MIGRATION_ENTRYPOINT, EQUIVALENT_MERGE_ENTRYPOINT, SUBJECT_RETIREMENT_ENTRYPOINT, SUBJECT_SPLIT_ENTRYPOINT, SUBJECT_RECONSIDERATION_ENTRYPOINT, SUBJECT_METADATA_ENTRYPOINT, SUBJECT_PROPOSAL_SUPPRESSION_ENTRYPOINT, PROMOTION_ENTRYPOINT, RECORD_PROMOTION_ENTRYPOINT, VALIDATION_ENTRYPOINTS, verifyPreparedRuntime } from './prepared-runtime.js';
import { capturePreparedAssignmentEvent } from './prepared-assignment-event.js';
import { isPreparedMigrationReport } from './prepared-migration-report.js';

import { capturePreparedEquivalentMerge, isPreparedEquivalentMergeReport } from './prepared-equivalent-merge.js';
import { capturePreparedSubjectSplit, isPreparedSubjectSplitReport } from './prepared-subject-split.js';
import { capturePreparedSubjectReconsideration, isPreparedSubjectReconsiderationReport } from './prepared-subject-reconsideration.js';
import { capturePreparedSubjectRetirement, isPreparedSubjectRetirementReport } from './prepared-subject-retirement.js';

import { isPreparedRecordPromotionReport } from './prepared-record-promotion.js';
import { isPreparedPromotionReport } from './prepared-promotion.js';
import { isPreparedAssignmentContinuationReport, isPreparedTypedAssignmentReport } from './prepared-assignment-continuation.js';

const jobFile = process.argv[2];
const job = JSON.parse(readFileSync(jobFile, 'utf8'));
const work = dirname(jobFile);
const runtime = fileURLToPath(new URL('../../', import.meta.url));
const checks = VALIDATION_ENTRYPOINTS.map(({ id, path }) => ({ id,
  invocation: { entrypoint: path, arguments: ['--json', '--root', '<candidate-root>'] },
  status: 'not-performed', completion: 'unavailable', exitCode: null, signal: null,
  reason: 'candidate-unavailable', stdout: null, stderr: null, result: null }));
checks.push({ id: 'operation', invocation: null, status: 'not-performed', completion: 'unavailable',
  exitCode: null, signal: null, reason: 'candidate-unavailable', stdout: null, stderr: null, result: null });
const report = { checks, diagnostics: [], provenance: 'unverified', eventSource: null };

const save = (name, bytes) => { writeFileSync(join(work, name), bytes, { flag: 'wx', mode: 0o400 }); return name; };

function expectedResult(id, value) {
  if (id === 'operation' && job.operation === 'identity-migration') return isPreparedMigrationReport(value, job) && value.mechanicalStatus === 'passed';
  if (id === 'operation' && job.operation === 'subject-equivalent-merge') return isPreparedEquivalentMergeReport(value, job, job.operationInputs.gateInput) && value.ok;
  if (id === 'operation' && job.operation === 'subject-split') return isPreparedSubjectSplitReport(value, job, job.operationInputs.gateInput) && value.ok;
  if (id === 'operation' && job.operation === 'subject-proposal-suppression') return isPreparedSubjectProposalSuppressionReport(value, job, job.operationInputs.gateInput) && value.ok;
  if (id === 'operation' && job.operation === 'subject-metadata') return isPreparedSubjectMetadataReport(value, job, job.operationInputs.gateInput) && value.ok;
  if (id === 'operation' && job.operation === 'subject-creation') return isPreparedSubjectCreationReport(value, job, job.operationInputs.gateInput) && value.ok;
  if (id === 'operation' && job.operation === 'subject-reconsideration') return isPreparedSubjectReconsiderationReport(value, job, job.operationInputs.gateInput) && value.ok;
  if (id === 'operation' && job.operation === 'subject-retirement') return isPreparedSubjectRetirementReport(value, job, job.operationInputs.gateInput) && value.ok;
  if (id === 'operation' && job.operation === 'ordinary-promotion') return isPreparedPromotionReport(value, job) && value.ok;
  if (id === 'operation' && job.operation === 'typed-record-promotion') return isPreparedRecordPromotionReport(value, job) && value.ok;
  if (id === 'operation' && job.operation === 'subject-assignment' && Object.hasOwn(job.operationInputs, 'selection')) {
    return isPreparedTypedAssignmentReport(value, job) && value.ok;
  }
  if (id === 'operation' && job.operation === 'subject-assignment' && Object.hasOwn(job.operationInputs, 'continuation')) {
    return isPreparedAssignmentContinuationReport(value, job) && value.ok;
  }
  if (id === 'operation') return value?.version === 1 && value.mode === 'read-only-prepared-assignment'
    && value.ok === true && value.publicationReady === false && value.checks?.humanApproval?.status === 'not-performed';
  if (!value || typeof value !== 'object' || Array.isArray(value) || !Array.isArray(value.findings)
    || !value['store-health']) return false;
  return id === 'structural'
    ? Array.isArray(value.checks) && value.counts?.errors === 0 && Number.isSafeInteger(value.counts.warnings)
    : value.ok === true && Array.isArray(value.checked) && Array.isArray(value['hard-errors']) && value['hard-errors'].length === 0;
}

async function runCheck(entry, root) {
  verifyPreparedRuntime(runtime, job.manifest);
  const check = checks.find(({ id }) => id === entry.id);
  if (entry.id === 'operation') check.invocation = { entrypoint: entry.path, arguments: ['<operation-input>'],
    ...(['subject-assignment', 'subject-equivalent-merge', 'subject-retirement', 'subject-split', 'subject-reconsideration', 'subject-metadata', 'subject-proposal-suppression', 'subject-creation', 'ordinary-promotion', 'typed-record-promotion'].includes(job.operation) ? { injectedInputsDigest: job.operationInputDigest } : {}) };
  const selected = entry.id === 'operation'
    ? { kind: ({ 'subject-assignment': 'assignment', 'identity-migration': 'migration', 'subject-equivalent-merge': 'equivalent-merge', 'subject-retirement': 'subject-retirement', 'subject-split': 'subject-split', 'subject-reconsideration': 'subject-reconsideration', 'subject-metadata': 'subject-metadata', 'subject-proposal-suppression': 'subject-proposal-suppression', 'subject-creation': 'subject-creation', 'ordinary-promotion': 'promotion', 'typed-record-promotion': 'record-promotion' })[job.operation], jobFile }
    : { kind: entry.id, root };
  const { exitCode, signal, reason, stdout, stderr } = await executePreparedEngineCheck(runtime, job.manifest, job.limits, selected);
  Object.assign(check, { status: 'failed', completion: reason || signal ? 'interrupted' : 'complete',
    exitCode, signal, reason, stdout: save(`${entry.id}.stdout`, stdout), stderr: save(`${entry.id}.stderr`, stderr) });
  let value;
  try { value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(stdout)); }
  catch { check.reason ??= 'invalid-json-output'; }
  if (value !== undefined && check.completion === 'complete') check.result = save(`${entry.id}.result`, stdout);
  if (check.completion === 'complete' && exitCode === 0 && expectedResult(entry.id, value)) check.status = 'passed';
  else check.reason ??= exitCode === 0 ? 'unexpected-result' : 'nonzero-exit';
  return check.completion === 'complete' && [0, 1].includes(exitCode) ? value : undefined;
}

try {
  for (const side of ['source', 'candidate']) {
    const actual = readCommittedTree(job.repoRoot, job[side].commit);
    if (actual.tree !== job[side].tree) throw new Error(`${side} commit/tree mismatch`);
  }
  await withTreeSnapshot(job.repoRoot, job.source.tree, async (source) => {
    if ((relative(source.root, locateKitRoot(source.root)) || '.') !== job.source.kitPath) throw new Error('source kit path mismatch');
    await withTreeSnapshot(job.repoRoot, job.candidate.tree, async (candidate) => {
      if ((relative(candidate.root, locateKitRoot(candidate.root)) || '.') !== job.candidate.kitPath) throw new Error('candidate kit path mismatch');
      report.provenance = 'verified';
      for (const entry of VALIDATION_ENTRYPOINTS) await runCheck(entry, candidate.root);
      if (job.operation === 'subject-assignment') {
        const gate = await runCheck(ASSIGNMENT_ENTRYPOINT, candidate.root);
        const event = capturePreparedAssignmentEvent({ root: candidate.root, source: job.source, candidate: job.candidate,
          eventId: job.operationInputs.eventId, maxEventBytes: job.operationInputs.maxEventBytes, gate });
        if (event) report.eventSource = { ...event.eventSource, capture: save('operation.event', event.bytes) };
      }
      if (job.operation === 'subject-split') {
        const gate = await runCheck(SUBJECT_SPLIT_ENTRYPOINT, candidate.root);
        // Only complete actual success can produce candidate authority artifacts.
        if (checks.find(check => check.id === 'operation').status === 'passed') {
          const captured = capturePreparedSubjectSplit({ root: candidate.root, source: job.source, candidate: job.candidate,
            gate, gateInput: job.operationInputs.gateInput, captureLimits: job.operationInputs.captureLimits });
          save('operation.registry', captured.registry);
          save('operation.identity', captured.identity);
          if (captured.event !== null) save('operation.event', captured.event);
        }
      }
      if (['subject-metadata','subject-proposal-suppression'].includes(job.operation)) {
        const suppression=job.operation === 'subject-proposal-suppression';
        const gate = await runCheck(suppression?SUBJECT_PROPOSAL_SUPPRESSION_ENTRYPOINT:SUBJECT_METADATA_ENTRYPOINT, candidate.root);
        if (checks.find(check => check.id === 'operation').status === 'passed') {
          const captured = (suppression?capturePreparedSubjectProposalSuppression:capturePreparedSubjectMetadata)({ root: candidate.root, source: job.source, candidate: job.candidate,
            gate, gateInput: job.operationInputs.gateInput, captureLimits: job.operationInputs.captureLimits });
          save('operation.registry', captured.registry);
        }
      }
      if (['subject-reconsideration', 'subject-creation'].includes(job.operation)) {
        const gate = await runCheck(job.operation === 'subject-creation' ? SUBJECT_CREATION_ENTRYPOINT : SUBJECT_RECONSIDERATION_ENTRYPOINT, candidate.root);
        if (checks.find(check => check.id === 'operation').status === 'passed') {
          const captured = (job.operation === 'subject-creation' ? capturePreparedSubjectCreation : capturePreparedSubjectReconsideration)({ root: candidate.root, source: job.source, candidate: job.candidate,
            gate, gateInput: job.operationInputs.gateInput, captureLimits: job.operationInputs.captureLimits });
          save('operation.registry', captured.registry);
          save('operation.identity', captured.identity);
        }
      }
      if (['subject-equivalent-merge', 'subject-retirement'].includes(job.operation)) {
        const retirement = job.operation === 'subject-retirement';
        const gate = await runCheck(retirement ? SUBJECT_RETIREMENT_ENTRYPOINT : EQUIVALENT_MERGE_ENTRYPOINT, candidate.root);
        const capture = retirement ? capturePreparedSubjectRetirement : capturePreparedEquivalentMerge;
        const captured = capture({ root: candidate.root, source: job.source, candidate: job.candidate,
          gate, gateInput: job.operationInputs.gateInput, captureLimits: job.operationInputs.captureLimits });
        save('operation.registry', captured.registry);
        if (captured.event !== null) save('operation.event', captured.event);
      }
      if (['ordinary-promotion', 'typed-record-promotion'].includes(job.operation)) {
        const gate = await runCheck(job.operation === 'ordinary-promotion' ? PROMOTION_ENTRYPOINT : RECORD_PROMOTION_ENTRYPOINT, candidate.root);
        const event = capturePreparedAssignmentEvent({ root: candidate.root, source: job.source, candidate: job.candidate,
          eventId: job.operationInputs.gateInput.eventId, maxEventBytes: job.operationInputs.maxEventBytes, gate: gate?.assignment });
        if (event) save('operation.event', event.bytes);
      }
      if (job.operation === 'identity-migration') await runCheck(MIGRATION_ENTRYPOINT, candidate.root);
    });
  });
  verifyPreparedRuntime(runtime, job.manifest);
} catch (error) {
  if (!Number.isInteger(error?.errno)) rethrowIfBug(error);
  // No raw temporary input or migration correspondence is serialized here.
  report.diagnostics.push({ code: error.code ?? error.name, message: 'Prepared validation could not complete its fixed execution boundary.' });
}
if (job.operation === 'subject-assignment' && report.eventSource === null) {
  report.diagnostics.push({ code: 'assignment-event-unavailable' });
}
writeFileSync(join(work, 'worker-report.json'), canonicalJsonBytes(report), { flag: 'wx', mode: 0o400 });
