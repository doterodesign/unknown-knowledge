/** Fixed eventless transport checks. Serialized reports never supply fresh authority. */
import { isDeepStrictEqual as same } from 'node:util';
import { lstatSync } from 'node:fs';
import { join } from 'node:path';
import { load, YAMLException } from 'js-yaml';
import { canonicalJsonBytes, canonicalSha256, CapturedInputError } from './canonical-json.js';
import { canonicalBase64DecodedLength } from './canonical-base64.js';
import { isCaptureLocator } from './capture-locator.js';
import { isIdentityUuid, parseCanonicalId, parseProposalKey } from './record-identity.js';
import { verifyCapturedBytes } from './captured-source.js';
import { validateStoreFile } from './validate-record.js';
import { readPreparedSubjectBytes, readPreparedReconsiderationIdentityBytes } from './prepared-assignment-event.js';
import { EngineRefusal } from './engine-refusal.js';

const closed = (v, keys) => v !== null && typeof v === 'object' && [Object.prototype, null].includes(Object.getPrototypeOf(v))
  && Reflect.ownKeys(v).length === keys.length && keys.every(key => {
    const field = Object.getOwnPropertyDescriptor(v, key); return field?.enumerable && Object.hasOwn(field, 'value');
  });
const dense = v => Array.isArray(v) && Object.getPrototypeOf(v) === Array.prototype
  && Reflect.ownKeys(v).length === v.length + 1 && Array.from({ length: v.length }, (_, index) => {
    const field = Object.getOwnPropertyDescriptor(v, String(index)); return field?.enumerable && Object.hasOwn(field, 'value');
  }).every(Boolean);
const whole = v => Number.isSafeInteger(v) && v >= 0;
const hash = v => typeof v === 'string' && /^[0-9a-f]{64}(?![\s\S])/.test(v);
const text = v => typeof v === 'string' && v.trim().length > 0;
const modes = ['100644', '100755'];
const source = v => ({ commit: v.commit, tree: v.tree });
const path = (v, file) => `${v.kitPath === '.' ? '' : `${v.kitPath}/`}${file}`;
const checks = ['core', 'binding', 'reach', 'subjectTree', 'replays'];
const coreKeys = ['version', 'kind', 'ok', 'publicationReady', 'inputDigest', 'inputs', 'operation', 'registry',
  'decision', 'allocation', 'assessment', 'sourceMembership', 'ownerPreservation', 'assignments', 'resources', 'diagnostics'];
const counters = ['captureBytes', 'documentNodes', 'documentTextUnits', 'subjects', 'historyRows', 'validationSteps'];
const governanceKeys = counters.map(key => `max${key[0].toUpperCase()}${key.slice(1)}`);
const corpusLimits = ['maxCanonicalRecords', 'maxAuthoredRecords', 'maxSubjects', 'maxHierarchyDepth', 'maxHistoryEvents',
  'maxHistoryRows', 'maxAssignmentsPerRecord', 'maxAssignments', 'maxBodyBytesPerRecord'];
const caps = (v, keys) => closed(v, keys) && keys.every(key => whole(v[key]));
const locator = v => isCaptureLocator(v) && closed(v, Object.hasOwn(v, 'source')
  ? ['file', 'blob', 'sha256', 'source'] : ['file', 'blob', 'sha256'])
  && (!Object.hasOwn(v, 'source') || closed(v.source, ['commit', 'tree']));
const located = (v, descriptor, file) => locator(v) && v.file === path(descriptor, file) && same(v.source, source(descriptor));
const observed = (v, descriptor, file) => closed(v, ['capture', 'mode']) && modes.includes(v.mode) && located(v.capture, descriptor, file);
const ref = v => closed(v, ['namespace', 'kind', 'id']) && isIdentityUuid(v.namespace)
  && v.kind === 'decision' && parseCanonicalId('decision', v.id).ok;
const refuse = code => { throw Object.assign(new EngineRefusal(`prepared reconsideration: ${code}`), { code }); };
const need = (ok, code) => { if (!ok) refuse(code); };
const versionedCaps = (v, keys) => closed(v, ['version', ...keys]) && v.version === 1 && keys.every(key => whole(v[key]));

function impactLimits(v) {
  return closed(v, ['version', 'contexts', 'reach', 'views', 'tree', 'replays', 'query', 'closure']) && v.version === 1
    && closed(v.contexts, ['before', 'after']) && Object.values(v.contexts).every(row =>
      closed(row, ['version', 'maxSourceBytes', 'maxSingleCaptureBytes', 'maxOutputBytes', 'validation', 'corpus']) && row.version === 1
      && ['maxSourceBytes', 'maxSingleCaptureBytes', 'maxOutputBytes'].every(key => whole(row[key]))
      && caps(row.validation, governanceKeys) && caps(row.corpus, corpusLimits))
    && caps(v.reach, ['maxHierarchyNodes', 'maxHierarchyEdges', 'maxRecords']) && versionedCaps(v.views, ['maxViews'])
    && closed(v.tree, ['budget', 'maxBytes']) && whole(v.tree.maxBytes) && caps(v.tree.budget, ['nodes', 'edges', 'rows'])
    && versionedCaps(v.replays, ['maxSubjects', 'maxEligibilityRedirects', 'maxQualificationRedirects', 'maxCases', 'maxInventoryBytes'])
    && versionedCaps(v.query, ['maxAstNodes', 'maxAstDepth', 'maxHierarchyNodes', 'maxHierarchyEdges', 'maxRedirects',
      'maxRecords', 'maxPredicateSteps', 'maxResultsPerStore', 'maxExplanationNodes'])
    && v.query.maxAstNodes > 0 && v.query.maxAstDepth > 0 && caps(v.closure, ['maxRows', 'maxBytes']);
}

function corpusUsage(v, limits) {
  const direct = { canonicalRecords: 'maxCanonicalRecords', authoredRecords: 'maxAuthoredRecords', subjects: 'maxSubjects',
    hierarchyDepth: 'maxHierarchyDepth', historyEvents: 'maxHistoryEvents', historyRows: 'maxHistoryRows',
    assignments: 'maxAssignments', assignmentsPerRecord: 'maxAssignmentsPerRecord', bodyBytesPerRecord: 'maxBodyBytesPerRecord' };
  return closed(v, ['complete', ...Object.keys(direct), 'subjectHistoryEvents', 'subjectHistoryRows', 'assignmentEvents', 'assignmentRows', 'assignmentBaselines'])
    && v.complete === true && Object.entries(direct).every(([key, cap]) => whole(v[key]) && v[key] <= limits[cap])
    && ['subjectHistoryEvents', 'subjectHistoryRows', 'assignmentEvents', 'assignmentRows', 'assignmentBaselines'].every(key => whole(v[key]))
    && v.historyEvents === v.subjectHistoryEvents + v.assignmentEvents
    && v.historyRows === v.subjectHistoryRows + v.assignmentRows + v.assignmentBaselines;
}

export const validReconsiderationCaptureLimits = v => caps(v, ['maxRegistryBytes', 'maxIdentityBytes'])
  && v.maxRegistryBytes > 0 && v.maxIdentityBytes > 0;

function descriptor(v) {
  return closed(v, ['commit', 'tree', 'kitPath']) && ['.', 'unknown-knowledge'].includes(v.kitPath)
    && typeof v.commit === 'string' && [40, 64].includes(v.commit.length) && /^[0-9a-f]+$/.test(v.commit)
    && typeof v.tree === 'string' && v.tree.length === v.commit.length && /^[0-9a-f]+$/.test(v.tree);
}

// Grammar and bound metadata only; no evidence decoding or owner allowance.
function wireProof(wire, expected, ordinary) {
  if (!closed(wire, ['version', 'before', 'candidate', 'operation', 'limits', 'evidence', 'impact']) || wire.version !== 1
    || !descriptor(wire.before) || !descriptor(wire.candidate) || wire.before.kitPath !== wire.candidate.kitPath
    || !same(wire.before, expected.source) || !same(wire.candidate, expected.candidate)
    || !closed(wire.operation, ['version', 'id', 'action', 'proposal', 'subject', 'registryEvent', 'assignmentEvent'])
    || wire.operation.version !== 1 || (ordinary ? !['activate', 'promote-proposal'].includes(wire.operation.action) : wire.operation.action !== 'reconsider-proposal') || !isIdentityUuid(wire.operation.id)
    || (ordinary && wire.operation.action === 'activate' ? wire.operation.proposal !== null : !parseProposalKey('subject', wire.operation.proposal).ok) || !parseCanonicalId('subject', wire.operation.subject).ok
    || wire.operation.assignmentEvent !== null || !closed(wire.operation.registryEvent, ['id', 'changeDigest'])
    || !isIdentityUuid(wire.operation.registryEvent.id) || !hash(wire.operation.registryEvent.changeDigest)
    || !closed(wire.limits, ['governance', 'allocation', 'closure']) || !caps(wire.limits.governance, governanceKeys)
    || !caps(wire.limits.allocation, ['maxLedgerRows']) || !caps(wire.limits.closure, ['maxRows', 'maxBytes'])
    || !closed(wire.evidence, ['decisionCaptures', 'assessmentCaptures', 'materialCaptures'])) return null;
  let bytes = 0;
  const capture = row => {
    if (!closed(row, ['capture', 'bytesBase64', 'objectFormat']) || !locator(row.capture)
      || !['sha1', 'sha256'].includes(row.objectFormat)
      || row.capture.blob.length !== (row.objectFormat === 'sha1' ? 40 : 64)) return false;
    const length = canonicalBase64DecodedLength(row.bytesBase64);
    if (length === null || length > wire.limits.governance.maxCaptureBytes - bytes) return false;
    bytes += length; return true;
  };
  const pairs = [];
  for (const name of ['decisionCaptures', 'assessmentCaptures', 'materialCaptures']) {
    const rows = wire.evidence[name]; if (!dense(rows)) return null;
    const seen = new Set();
    for (const row of rows) {
      const pair = name === 'assessmentCaptures';
      if (pair ? !closed(row, ['registry', 'identity']) || !capture(row.registry) || !capture(row.identity) : !capture(row)) return null;
      const key = canonicalSha256(pair ? [row.registry.capture, row.identity.capture] : row.capture);
      if (seen.has(key)) return null; seen.add(key);
      if (pair && located(row.registry.capture, wire.before, 'subjects/registry.yaml')) pairs.push(row);
    }
  }
  if (pairs.length !== 1 || !located(pairs[0].identity.capture, wire.before, '_identity.yaml')) return null;
  const { impact, ...coreWire } = wire;
  if (!impactLimits(impact)) return null;
  return { bytes, pair: pairs[0], coreDigest: canonicalSha256(coreWire), gateDigest: canonicalSha256({ core: canonicalSha256(coreWire), impact }) };
}

function usage(used, limits) {
  return closed(used, [...counters, 'relevantRefusalRows']) && counters.every((key, index) => whole(used[key]) && used[key] <= limits[governanceKeys[index]])
    && whole(used.relevantRefusalRows) && used.relevantRefusalRows <= used.validationSteps;
}

function closure(report, limits, sections) {
  if (!closed(report, ['used', 'failure']) || report.failure !== null || !caps(report.used, ['rows', 'bytes'])) return false;
  const minimum = sections.reduce((sum, row) => sum + canonicalJsonBytes(row).length, 0);
  return report.used.rows >= sections.length && report.used.rows <= limits.maxRows
    && report.used.bytes >= minimum && report.used.bytes <= limits.maxBytes;
}

function coreProof(core, wire, proof, ordinary) {
  if (!closed(core, coreKeys)
    || core.version !== 1 || core.kind !== (ordinary ? 'subject-creation-core' : 'subject-reconsideration-core') || !core.ok || core.publicationReady !== false
    || core.assignments !== null || core.inputDigest !== proof.coreDigest || !same(core.operation, wire.operation)
    || !same(core.inputs, { before: wire.before, candidate: wire.candidate }) || !same(core.diagnostics, [])
    || !closed(core.registry, ['file', 'before', 'candidate', 'event'])
    || core.registry.file !== path(wire.before, 'subjects/registry.yaml') || !same(core.registry.event, wire.operation.registryEvent)
    || !closed(core.allocation, ['proof', 'before', 'candidate'])
    || !closed(core.decision, ['ref', 'review', 'before', 'candidate']) || !ref(core.decision.ref)) return false;
  for (const side of ['before', 'candidate']) {
    if (!observed(core.registry[side], wire[side], 'subjects/registry.yaml')
      || !observed(core.allocation[side], wire[side], '_identity.yaml')
      || !closed(core.decision[side], ['capture', 'mode']) || !modes.includes(core.decision[side].mode)
      || !locator(core.decision[side].capture) || !same(core.decision[side].capture.source, source(wire[side]))) return false;
  }
  if (!same(core.registry.before.capture, proof.pair.registry.capture) || !same(core.allocation.before.capture, proof.pair.identity.capture)) return false;
  const review = core.decision.review, allocation = core.allocation.proof;
  if (!closed(review, ['reference', 'acceptedStatus', 'decisionCapture', 'decisionDigest', 'changeDigest'])
    || !text(review.reference) || !['accepted', 'addressed'].includes(review.acceptedStatus)
    || !locator(review.decisionCapture) || !hash(review.decisionDigest) || review.changeDigest !== wire.operation.registryEvent.changeDigest
    || !closed(allocation, ['publication', 'ids', 'beforeIdentityDigest', 'candidateIdentityDigest', 'occupied', 'remaining'])
    || !same(allocation.publication, { id: wire.operation.id, review: review.reference })
    || !same(allocation.ids, [wire.operation.subject]) || !hash(allocation.beforeIdentityDigest) || !hash(allocation.candidateIdentityDigest)
    || !whole(allocation.occupied) || allocation.occupied < 1 || !whole(allocation.remaining) || allocation.occupied + allocation.remaining !== 999999
    || !closed(core.assessment, ['verification', 'refusalSetDigest', 'evidence', 'semanticCompleteness'])
    || core.assessment.verification !== 'verified' || !hash(core.assessment.refusalSetDigest)
    || core.assessment.evidence !== (ordinary ? 'captured-scope-and-listed-dispositions-only' : 'captured-scope-and-material-bindings-only')
    || core.assessment.semanticCompleteness !== 'asserted-in-reviewed-evidence') return false;
  const membership = core.sourceMembership, owners = core.ownerPreservation;
  if (!closed(membership, ['status', 'scope', 'rows']) || membership.status !== 'passed'
    || membership.scope !== 'supplied-captures-and-selected-transition' || !dense(membership.rows)
    || !closed(owners, ['status', 'changedPaths', 'records', 'unavailable', 'unknownAssignments']) || owners.status !== 'passed'
    || !same(owners.changedPaths, [path(wire.before, '_identity.yaml'), path(wire.before, 'subjects/registry.yaml')])
    || !['records', 'unavailable', 'unknownAssignments'].every(key => dense(owners[key]))
    || !closed(core.resources, ['governance', 'allocation', 'closure'])) return false;
  const governance = core.resources.governance, resources = core.resources.allocation;
  if (!closed(governance, ['used', 'failure']) || governance.failure !== null || !usage(governance.used, wire.limits.governance)
    || governance.used.captureBytes < proof.bytes || !governance.used.documentNodes || !governance.used.validationSteps
    || !closed(resources, ['accountingBasis', 'limits', 'used', 'failure']) || resources.failure !== null
    || resources.accountingBasis !== 'per-invocation-admitted-populations' || !same(resources.limits, wire.limits.allocation)
    || !caps(resources.used, ['ledgerRows', 'subjects']) || resources.used.subjects !== 1 || resources.used.ledgerRows < 1
    || resources.used.ledgerRows > wire.limits.allocation.maxLedgerRows) return false;
  return closure(core.resources.closure, wire.limits.closure, [core.inputs, core.operation, core.registry, core.allocation,
    core.assessment, core.decision, owners.changedPaths, ...membership.rows, ...owners.records, ...owners.unavailable, ...owners.unknownAssignments]);
}

function replayProof(replay, wire, ordinary) {
  if (!closed(replay, ['version', 'status', 'policy', 'scope', 'subjects', 'inventory', 'inventoryDigest', 'comparison',
    'cases', 'coverage', 'metamorphic', 'resources', 'diagnostics', 'fingerprint']) || replay.version !== 1 || replay.status !== 'complete'
    || !closed(replay.policy, ['id', 'version', 'digest']) || replay.policy.id !== (ordinary ? 'subject-creation-replay-v1' : 'reconsideration-replay-v1')
    || replay.policy.version !== 1 || !hash(replay.policy.digest) || !same(replay.diagnostics, [])
    || !dense(replay.subjects) || !dense(replay.cases) || !closed(replay.inventory, ['version', 'coverage', 'cases'])
    || replay.inventory.version !== 1 || replay.inventory.coverage !== 'complete' || !dense(replay.inventory.cases)
    || replay.inventory.cases.length !== replay.cases.length || replay.inventoryDigest !== canonicalSha256(replay.inventory)
    || !closed(replay.coverage, ['assessmentComplete', 'membershipComplete', 'expectedRefusalsComplete'])
    || replay.coverage.assessmentComplete !== true || replay.coverage.expectedRefusalsComplete !== true
    || typeof replay.coverage.membershipComplete !== 'boolean'
    || !closed(replay.resources, ['limits', 'queryBudgets', 'eligibility', 'inventory', 'qualification'])
    || !same(replay.resources.limits, wire.impact.replays) || !same(replay.resources.queryBudgets, wire.impact.query)) return false;
  const { fingerprint, ...unsealed } = replay;
  if (fingerprint !== canonicalSha256(unsealed)) return false;
  const count = replay.cases.length, comparison = replay.comparison;
  if (!comparison?.coverage?.reservationComplete || comparison.coverage.assessedCases !== count
    || !dense(comparison.cases) || comparison.cases.length !== count || count > wire.impact.replays.maxCases) return false;
  const eligibility = replay.resources.eligibility, inventory = replay.resources.inventory;
  if (!caps(eligibility, ['attempted', 'returned', 'unreportedCalls', 'reportedUsedRedirects'])
    || eligibility.attempted !== eligibility.returned || eligibility.unreportedCalls !== 0
    || eligibility.returned !== replay.subjects.length || eligibility.reportedUsedRedirects > wire.impact.replays.maxEligibilityRedirects
    || !caps(inventory, ['requiredCases', 'bytes', 'maximumNativeCalls']) || inventory.requiredCases !== count
    || inventory.maximumNativeCalls !== 6 * count + eligibility.attempted || inventory.bytes !== canonicalJsonBytes(replay.inventory).length
    || inventory.bytes > wire.impact.replays.maxInventoryBytes) return false;
  for (let i = 0; i < count; i++) {
    const raw = comparison.cases[i], row = replay.cases[i], specification = replay.inventory.cases[i];
    if (!closed(row, ['id', 'disposition', 'qualification']) || !closed(specification, ['id', 'query'])
      || !raw || typeof raw !== 'object' || Array.isArray(raw) || row.id !== specification.id || raw.id !== row.id
      || !same(raw.specification, specification) || !raw.before || !raw.after
      || !['exact-membership', 'expected-semantic-refusal'].includes(row.disposition)) return false;
  }
  let reserved = 0, calls = 0;
  if (!closed(replay.resources.qualification, ['preparation', 'rows'])) return false;
  for (const method of Object.values(replay.resources.qualification)) {
    if (!caps(method, ['attempted', 'returned', 'unreportedCalls', 'usageReportedCalls', 'usageUnreportedCalls', 'reservedRedirects', 'reportedUsedRedirects'])
      || method.attempted !== method.returned || method.unreportedCalls !== 0
      || method.usageReportedCalls + method.usageUnreportedCalls !== method.returned
      || method.reservedRedirects !== method.attempted * wire.impact.query.maxRedirects
      || method.reportedUsedRedirects > method.reservedRedirects) return false;
    reserved += method.reservedRedirects; calls += method.attempted;
  }
  return whole(reserved) && reserved <= wire.impact.replays.maxQualificationRedirects && calls <= 4 * count;
}

/** Parsed report validation only, including honest partial failure observations. */
export function isPreparedSubjectReconsiderationReport(value, expected, gateInput) { return isReport(value, expected, gateInput, false); }
export function isPreparedSubjectCreationReport(value, expected, gateInput) { return isReport(value, expected, gateInput, true); }
function isReport(value, expected, gateInput, ordinary) {
  try {
    canonicalJsonBytes(value); canonicalJsonBytes(gateInput);
    if (!expected || !closed(value, ['version', 'kind', 'mode', 'ok', 'publicationReady', 'inputDigest', 'inputs', 'operation',
      'core', 'sources', 'checks', 'assignments', 'impacts', 'resources', 'diagnostics']) || value.version !== 1
      || value.kind !== (ordinary ? 'subject-creation-gate' : 'subject-reconsideration-gate') || value.mode !== (ordinary ? 'read-only-prepared-creation' : 'read-only-prepared-reconsideration')
      || typeof value.ok !== 'boolean' || value.publicationReady !== false || value.assignments !== null
      || !(value.inputDigest === null || hash(value.inputDigest)) || !dense(value.checks) || value.checks.length > checks.length
      || !value.checks.every((row, i) => closed(row, ['id', 'passed']) && row.id === checks[i] && typeof row.passed === 'boolean')
      || !dense(value.diagnostics) || !value.diagnostics.every(row => typeof row?.code === 'string' && typeof row.message === 'string')
      || !closed(value.resources, ['core', 'contexts', 'closure']) || !closed(value.resources.contexts, ['before', 'after'])
      || !same(value.resources.core, value.core?.resources ?? null)) return false;
    if (!closed(value.core, coreKeys) || value.core.version !== 1 || value.core.kind !== (ordinary ? 'subject-creation-core' : 'subject-reconsideration-core')
      || typeof value.core.ok !== 'boolean' || value.core.publicationReady !== false || value.core.assignments !== null
      || !closed(value.core.resources, ['governance', 'allocation', 'closure']) || !dense(value.core.diagnostics)) return false;
    if (!value.ok) return value.diagnostics.length > 0 && (value.inputs === null || same(value.inputs, { before: expected.source, candidate: expected.candidate }))
      && (value.operation === null || same(value.operation, gateInput.operation));
    const proof = wireProof(gateInput, expected, ordinary);
    if (!proof || value.inputDigest !== proof.gateDigest || !same(value.inputs, { before: expected.source, candidate: expected.candidate })
      || !same(value.operation, gateInput.operation) || !same(value.checks, checks.map(id => ({ id, passed: true })))
      || value.diagnostics.length || !coreProof(value.core, gateInput, proof, ordinary)
      || !closed(value.sources, ['registryCapture', 'identityCapture', 'registryEvents', 'assignmentEvent'])
      || !same(value.sources, { registryCapture: value.core.registry.candidate, identityCapture: value.core.allocation.candidate,
        registryEvents: [value.core.registry.event], assignmentEvent: null })
      || !closed(value.impacts, ['bindings', 'reach', 'subjectTree', 'replays']) || !closed(value.impacts.bindings, ['before', 'after'])
      || !['complete', 'incomplete'].includes(value.impacts.reach?.status) || value.impacts.subjectTree?.status !== 'complete'
      || !replayProof(value.impacts.replays, gateInput, ordinary)) return false;
    for (const side of ['before', 'after']) {
      const used = value.resources.contexts[side], limits = gateInput.impact.contexts[side], binding = value.impacts.bindings[side];
      const coreSide = side === 'before' ? 'before' : 'candidate';
      if (!closed(used, ['limits', 'sourceBytes', 'validation', 'corpus', 'outputBytesAdmitted', 'outputBytesWritten', 'outputWriteUncertain', 'failure'])
        || !same(used.limits, limits) || used.failure !== null || !usage(used.validation, limits.validation)
        || !corpusUsage(used.corpus, limits.corpus)
        || !whole(used.sourceBytes) || used.sourceBytes > limits.maxSourceBytes || used.outputBytesAdmitted !== 0
        || used.outputBytesWritten !== 0 || used.outputWriteUncertain !== false
        || !closed(binding, ['registry', 'identity', 'excludedMaterialLocators']) || !dense(binding.excludedMaterialLocators)
        || !same(binding.registry, value.core.registry[coreSide]) || !same(binding.identity, value.core.allocation[coreSide])) return false;
    }
    return closure(value.resources.closure, gateInput.impact.closure,
      [value.impacts.bindings.before, value.impacts.bindings.after, value.impacts.reach, value.impacts.subjectTree, value.impacts.replays]);
  } catch (error) {
    if (error instanceof CapturedInputError || error instanceof RangeError) return false;
    throw error;
  }
}

/** Raw candidate corroboration only; no original-Git, model or allocation proof. */
export function capturePreparedSubjectReconsideration(input) { return capturePrepared(input, false); }
export function capturePreparedSubjectCreation(input) { return capturePrepared(input, true); }
export const validCreationCaptureLimits = validReconsiderationCaptureLimits;
function capturePrepared({ root, source: before, candidate, gate, gateInput, captureLimits }, ordinary) {
  need(validReconsiderationCaptureLimits(captureLimits) && gate?.ok
    && isReport(gate, { source: before, candidate }, gateInput, ordinary), 'reconsideration-capture-input');
  const captured = {};
  for (const name of ['registry', 'identity']) {
    const observation = gate.sources[`${name}Capture`], file = observation.capture.file;
    let stat;
    try { stat = lstatSync(join(root, file)); }
    catch (error) { if (!Number.isInteger(error?.errno)) throw error; refuse('reconsideration-capture-file'); }
    need(stat.isFile() && !stat.isSymbolicLink() && (stat.mode & 0o111 ? '100755' : '100644') === observation.mode,
      'reconsideration-capture-mode');
    const bytes = name === 'registry'
      ? readPreparedSubjectBytes({ root, file, maxBytes: captureLimits.maxRegistryBytes })
      : readPreparedReconsiderationIdentityBytes({ root, candidate, maxBytes: captureLimits.maxIdentityBytes });
    need(bytes !== null && verifyCapturedBytes({ locator: observation.capture, bytes,
      objectFormat: candidate.commit.length === 40 ? 'sha1' : 'sha256' }).ok, 'reconsideration-capture-bytes');
    captured[name] = bytes;
  }
  let registry;
  try { registry = load(new TextDecoder('utf-8', { fatal: true }).decode(captured.registry)); }
  catch (error) {
    if (!(error instanceof TypeError || error instanceof YAMLException || error instanceof RangeError)) throw error;
    refuse('reconsideration-capture-encoding');
  }
  need(validateStoreFile('subject-registry', registry).ok, 'reconsideration-capture-registry');
  const event = registry.history.at(-1), review = gate.core.decision.review;
  need(registry.namespace === gate.core.decision.ref.namespace && event?.action === 'activate'
    && event.id === gate.operation.registryEvent.id && same(event.decision, gate.core.decision.ref)
    && same(event.review, { reference: review.reference, 'accepted-status': review.acceptedStatus,
      'decision-capture': review.decisionCapture, 'decision-digest': review.decisionDigest, 'change-digest': review.changeDigest })
    && (ordinary && gate.operation.action === 'activate' ? !Object.hasOwn(event, 'promotes') : event.promotes?.key === gate.operation.proposal) && event.rows.length === 1 && event.rows[0].id === gate.operation.subject
    && event.rows[0].before === null && event.rows[0].after.status === 'active'
    && event[ordinary ? 'refusal-assessment' : 'reconsideration-assessment']?.scope?.['identity-digest'] === gate.core.allocation.proof.beforeIdentityDigest
    && same(event[ordinary ? 'refusal-assessment' : 'reconsideration-assessment']?.scope?.['before-registry']?.capture, gate.core.registry.before.capture),
  'reconsideration-capture-event');
  return captured;
}
