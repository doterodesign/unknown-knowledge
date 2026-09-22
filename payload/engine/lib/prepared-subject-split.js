import { lifecycleMaterialPresent } from './subject-lifecycle-input.js';
/** Fixed split proof and raw capture transport; never approval authority. */
import { isDeepStrictEqual as same } from 'node:util';
import { lstatSync } from 'node:fs';
import { join } from 'node:path';
import { load, YAMLException } from 'js-yaml';
import { parseSubjectRegistry } from './subject-registry-reader.js';
import { canonicalJsonBytes, canonicalSha256, CapturedInputError } from './canonical-json.js';
import { EngineRefusal } from './engine-refusal.js';
import { isCaptureLocator } from './capture-locator.js';
import { isIdentityUuid, parseCanonicalId } from './record-identity.js';
import { decodePreparedSubjectSplitInput } from './prepared-subject-lifecycle-input.js';
import { capturePreparedAssignmentEvent, readPreparedSubjectBytes, readPreparedSplitIdentityBytes } from './prepared-assignment-event.js';
import { verifyCapturedBytes } from './captured-source.js';

const closed = (value, keys) => value !== null && typeof value === 'object'
  && [Object.prototype, null].includes(Object.getPrototypeOf(value))
  && Reflect.ownKeys(value).length === keys.length && keys.every(key => {
    const field = Object.getOwnPropertyDescriptor(value, key); return field?.enumerable && Object.hasOwn(field, 'value');
  });
const dense = value => Array.isArray(value) && Reflect.ownKeys(value).length === value.length + 1
  && Array.from({ length: value.length }, (_, index) => Object.hasOwn(value, index)).every(Boolean);
const text = value => typeof value === 'string' && value.trim().length > 0;
const hash = value => typeof value === 'string' && /^[0-9a-f]{64}(?![\s\S])/.test(value);
const whole = value => Number.isSafeInteger(value) && value >= 0;
const governanceCounters = ['captureBytes', 'documentNodes', 'documentTextUnits', 'subjects', 'historyRows', 'validationSteps'];
const checkNames = ['admission', 'models', 'registry', 'allocation', 'authoredReferences', 'assignments', 'decision', 'preservation', 'candidateCommitMembership', 'impacts'];
const assignmentChecks = ['models', 'source', 'scope', 'history', 'captures', 'eligibility', 'preservation', 'authorizer', 'candidateCommitMembership'];
const refuse = code => { throw new EngineRefusal(`prepared subject split: ${code}`); };
const registryPath = candidate => `${candidate.kitPath === '.' ? '' : `${candidate.kitPath}/`}subjects/registry.yaml`;
const sourcePair = candidate => ({ commit: candidate.commit, tree: candidate.tree });
const ref = (value, namespace) => closed(value, ['namespace', 'kind', 'id']) && value.namespace === namespace
  && ['knowledge', 'ontology', 'decision'].includes(value.kind) && parseCanonicalId(value.kind, value.id).ok;
const refKey = value => JSON.stringify([value.namespace, value.kind, value.id]);
const refs = (values, namespace) => dense(values) && values.every(value => ref(value, namespace))
  && new Set(values.map(refKey)).size === values.length;
const sameRefs = (a, b) => same(a.map(refKey).sort(), b.map(refKey).sort());

export const validSplitCaptureLimits = value => closed(value, ['maxRegistryBytes', 'maxIdentityBytes', 'maxEventBytes'])
  && Object.values(value).every(limit => Number.isSafeInteger(limit) && limit > 0);
export function decodePreparedSubjectSplit(repoRoot, wire) {
  return decodePreparedSubjectSplitInput(repoRoot, wire);
}

/** Original admitted wire is required at each successful retained/fresh boundary. */
export function isPreparedSubjectSplitReport(value, expected, gateInput) {
  if (!closed(value, ['version', 'kind', 'mode', 'ok', 'publicationReady', 'inputDigest', 'inputs', 'operation',
    'sources', 'decision', 'allocation', 'assessment', 'checks', 'authoredReferenceClosure', 'inventory', 'assignments', 'assignmentAssessment',
    'preservation', 'impacts', 'resources', 'diagnostics']) || !expected
    || value.version !== (lifecycleMaterialPresent(gateInput) ? 2 : 1) || value.kind !== 'subject-split-gate' || value.mode !== 'read-only-prepared-split'
    || typeof value.ok !== 'boolean' || value.publicationReady !== false
    || !(value.inputDigest === null || hash(value.inputDigest))
    || !(value.inputs === null || same(value.inputs, { before: expected.source, candidate: expected.candidate }))
    || !closed(value.sources, ['registryCapture', 'identityCapture', 'registryEvents', 'assignmentEvent']) || !dense(value.sources.registryEvents)
    || !closed(value.checks, checkNames) || !checkNames.every(name => closed(value.checks[name], ['status'])
      && ['not-performed', 'passed', 'failed', ...(name === 'assignments' ? ['not-applicable'] : [])].includes(value.checks[name].status))
    || !closed(value.impacts, ['reach', 'subjectTree', 'representativeReplays', 'routes']) || !dense(value.diagnostics)) return false;
  // This boundary consumes parsed worker JSON, not arbitrary objects/accessors.
  // Keep depth-exhaustion handling local to encoding, not the domain predicate.
  try {
    canonicalSha256(value);
  } catch (error) {
    if (!(error instanceof CapturedInputError || error instanceof RangeError)) throw error;
    return false;
  }
  try {
    return !value.ok || splitProof(value, expected, gateInput);
  } catch (error) {
    if (!(error instanceof CapturedInputError || error instanceof RangeError)) throw error;
    return false;
  }
}

function splitProof(value, expected, wire) {
  if (!closed(wire, ['version', 'before', 'candidate', 'operation', 'reviewNote', 'evidence', 'limits', 'impact'])
    || wire.version !== 1 || canonicalSha256(wire) !== value.inputDigest
    || !same(wire.before, expected.source) || !same(wire.candidate, expected.candidate)
    || !same(value.operation, wire.operation) || wire.operation?.action !== 'split' || wire.operation.version !== 1
    || !isIdentityUuid(wire.operation.id) || !parseCanonicalId('subject', wire.operation.subject).ok
    || value.inputs === null || value.diagnostics.length || !['complete', 'incomplete'].includes(value.inventory?.status)
    || value.authoredReferenceClosure?.status !== 'complete'
    || !closed(value.resources, ['limits', 'governance', 'closure', 'allocation']) || !same(value.resources.limits, wire.limits)
    || !closed(wire.limits?.closure, ['maxRows', 'maxBytes'])
    || !['maxRows', 'maxBytes'].every(key => whole(wire.limits.closure[key]))
    || !closed(wire.limits.governance, governanceCounters.map(key => `max${key[0].toUpperCase()}${key.slice(1)}`))
    || !closed(value.resources.governance, ['used', 'failure']) || value.resources.governance.failure !== null
    || !closed(value.resources.governance.used, [...governanceCounters, 'relevantRefusalRows'])
    || !governanceCounters.every(key => {
      const limit = wire.limits.governance[`max${key[0].toUpperCase()}${key.slice(1)}`];
      return whole(limit) && whole(value.resources.governance.used[key]) && value.resources.governance.used[key] <= limit;
    })
    || !whole(value.resources.governance.used.relevantRefusalRows)
    || value.resources.governance.used.relevantRefusalRows > value.resources.governance.used.validationSteps
    || !closed(value.resources.closure, ['used', 'failure']) || value.resources.closure.failure !== null
    || !closed(value.resources.closure.used, ['rows', 'bytes'])
    || !['rows', 'bytes'].every(key => whole(value.resources.closure.used[key])
      && value.resources.closure.used[key] <= wire.limits.closure[key === 'rows' ? 'maxRows' : 'maxBytes'])) return false;
  if (!splitAllocationProof(value, expected, wire)) return false;
  const operation = wire.operation; const namespace = value.inventory.inputs?.before?.namespace;
  if (!isIdentityUuid(namespace) || !['before', 'candidate'].every(side => {
    const actual = value.inventory.inputs?.[side]; const descriptor = value.inputs[side];
    return actual?.namespace === namespace && same({ commit: actual.commit, tree: actual.tree, kitPath: actual.kitPath }, descriptor)
      && ['records', 'registry', 'hierarchy'].every(part => value.inventory.coverage?.[side]?.[part] === 'complete');
  }) || !closed(value.decision, ['ref', 'reference', 'acceptedStatus', 'decisionDigest', 'decisionCapture'])
    || !ref(value.decision.ref, namespace) || value.decision.ref.kind !== 'decision' || !text(value.decision.reference)
    || !['accepted', 'addressed'].includes(value.decision.acceptedStatus) || !hash(value.decision.decisionDigest)
    || !isCaptureLocator(value.decision.decisionCapture)
    || operation.registryEvents?.length !== 2 || !same(value.sources.registryEvents, operation.registryEvents)
    || !isCaptureLocator(value.sources.registryCapture) || value.sources.registryCapture.file !== registryPath(expected.candidate)
    || !same(value.sources.registryCapture.source, sourcePair(expected.candidate))
    || !same(value.sources.registryCapture, value.inventory.inputs.candidate.registryCapture)
    || !['complete', 'incomplete'].includes(value.impacts.reach?.status)
    || value.impacts.subjectTree?.status !== 'complete' || value.impacts.representativeReplays?.status !== 'complete'
    || !same(value.impacts.routes, { status: 'requires-final-capability', scope: 'kit-managed-subject-route-persistence', externalInventory: 'unknown' })) return false;
  if (operation.assignmentEvent === null) {
    const proof = value.preservation?.proof; const assessment = value.assignmentAssessment;
    return checkNames.every(name => value.checks[name].status === (name === 'assignments' ? 'not-applicable' : 'passed'))
      && value.sources.assignmentEvent === null && value.assignments === null
      && same(value.authoredReferenceClosure.affectedRefs, []) && same(operation.mappings, [])
      && closed(assessment, ['status', 'reason', 'effectiveDirectRefs', 'inventoryDigest', 'preservationDigest'])
      && assessment.status === 'not-applicable' && assessment.reason === 'zero-effective-direct-use' && same(assessment.effectiveDirectRefs, [])
      && closed(value.preservation, ['status', 'proof', 'proofDigest']) && value.preservation.status === 'passed'
      && closed(proof, ['inputs', 'operationDigest', 'registryFile', 'identityFile', 'changedPaths', 'inventoryDigest'])
      && value.resources.closure.used.rows >= 1 && value.resources.closure.used.bytes >= canonicalJsonBytes(proof).length
      && same(proof.inputs, value.inputs) && proof.operationDigest === canonicalSha256(operation)
      && proof.registryFile === registryPath(expected.candidate) && proof.identityFile === identityPath(expected.candidate) && same(proof.changedPaths, [proof.identityFile, proof.registryFile])
      && proof.inventoryDigest === canonicalSha256(value.inventory) && assessment.inventoryDigest === proof.inventoryDigest
      && value.preservation.proofDigest === canonicalSha256(proof) && assessment.preservationDigest === value.preservation.proofDigest;
  }
  const assignment = value.assignments; const event = value.sources.assignmentEvent;
  const affected = value.authoredReferenceClosure.affectedRefs; const scope = assignment?.scope?.refs;
  const eventFile = `${expected.candidate.kitPath === '.' ? '' : `${expected.candidate.kitPath}/`}subjects/_assignments/${operation.assignmentEvent?.id}.yaml`;
  return checkNames.every(name => value.checks[name].status === 'passed') && value.assignmentAssessment === null && value.preservation === null
    && assignment?.version === 1 && assignment.ok === true && assignment.publicationReady === false && assignment.mode === 'read-only-prepared-assignment'
    && dense(assignment.diagnostics) && assignment.diagnostics.length === 0
    && same(assignment.inputs, { before: { kind: 'commit', ...expected.source }, candidate: { kind: 'commit', ...expected.candidate } })
    && refs(affected, namespace) && affected.length > 0 && refs(scope, namespace) && sameRefs(affected, scope)
    && splitRowsProof(value, wire)
    && assignment.scope.status === 'complete' && assignment.scope.basis === 'actual-split-affected-uses'
    && closed(assignment.checks, [...assignmentChecks, 'impactPolicy', 'humanApproval'])
    && assignmentChecks.every(name => assignment.checks[name]?.status === 'passed')
    && assignment.checks.impactPolicy?.scope === 'split-impacts-owned-by-outer-gate'
    && ['impactPolicy', 'humanApproval'].every(name => assignment.checks[name]?.status === 'not-performed')
    && closed(event, ['eventId', 'eventDigest', 'eventCapture']) && event.eventId === operation.assignmentEvent?.id
    && event.eventDigest === operation.assignmentEvent.changeDigest && isCaptureLocator(event.eventCapture)
    && event.eventCapture.file === eventFile && same(event.eventCapture.source, sourcePair(expected.candidate))
    && same(assignment.eventSource, { file: eventFile, eventId: event.eventId, eventDigest: event.eventDigest, candidate: expected.candidate });
}

const identityPath = candidate => `${candidate.kitPath === '.' ? '' : `${candidate.kitPath}/`}_identity.yaml`;
const located = (capture, descriptor, file) => isCaptureLocator(capture) && capture.file === file
  && same(capture.source, sourcePair(descriptor));
const subjectIds = ids => dense(ids) && ids.every(id => parseCanonicalId('subject', id).ok)
  && new Set(ids).size === ids.length;

function splitAllocationProof(value, expected, wire) {
  const op = wire.operation; const allocation = value.allocation; const resources = value.resources.allocation;
  if (!['.', 'unknown-knowledge'].includes(expected.source?.kitPath) || !['.', 'unknown-knowledge'].includes(expected.candidate?.kitPath)
    || !subjectIds(op.successors) || op.successors.length < 2
    || !closed(allocation, ['before', 'candidate', 'publication', 'allocatedIds', 'occupied', 'remaining'])
    || !same(allocation.allocatedIds, op.successors)
    || !same(allocation.publication, { id: op.id, review: value.decision?.reference })
    || !whole(allocation.occupied) || !whole(allocation.remaining) || allocation.occupied < op.successors.length
    || allocation.occupied + allocation.remaining !== 999999
    || !['before', 'candidate'].every(side => {
      const descriptor = side === 'before' ? expected.source : expected.candidate;
      return closed(allocation[side], ['capture', 'mode']) && ['100644', '100755'].includes(allocation[side].mode)
        && located(allocation[side].capture, descriptor, identityPath(descriptor));
    }) || allocation.before.mode !== allocation.candidate.mode
    || !same(value.sources.identityCapture, allocation.candidate.capture)
    || !closed(resources, ['accountingBasis', 'limits', 'used', 'failure'])
    || resources.accountingBasis !== 'per-invocation-admitted-populations' || resources.failure !== null
    || !closed(wire.limits.allocation, ['maxLedgerRows', 'maxSuccessors'])
    || !Object.values(wire.limits.allocation).every(whole) || !same(resources.limits, wire.limits.allocation)
    || !closed(resources.used, ['ledgerRows', 'successors']) || !whole(resources.used.ledgerRows)
    || resources.used.ledgerRows < op.successors.length || resources.used.ledgerRows > resources.limits.maxLedgerRows
    || resources.used.successors !== op.successors.length || resources.used.successors > resources.limits.maxSuccessors
    || !closed(value.assessment, ['verification', 'refusalSetDigest', 'evidence', 'semanticCompleteness'])
    || value.assessment.verification !== 'verified' || !hash(value.assessment.refusalSetDigest)
    || value.assessment.evidence !== 'captured-scope-and-listed-dispositions-only'
    || value.assessment.semanticCompleteness !== 'asserted-in-reviewed-evidence'
    || !closed(wire.evidence, ['decisionCaptures', 'assessmentCaptures', ...(lifecycleMaterialPresent(wire) ? ['materialCaptures'] : [])]) || !dense(wire.evidence.assessmentCaptures)) return false;
  const beforeRegistry = value.inventory.inputs?.before?.registryCapture;
  if (!located(beforeRegistry, expected.source, registryPath(expected.source))) return false;
  const pairs = wire.evidence.assessmentCaptures;
  const selected = pairs.filter(pair => same(pair?.registry?.capture, beforeRegistry));
  if (selected.length !== 1 || !same(selected[0].identity?.capture, allocation.before.capture)
    || pairs.filter(pair => same(pair?.identity?.capture, allocation.before.capture)).length !== 1) return false;
  const closure = value.authoredReferenceClosure;
  if (!closed(closure, ['status', 'semanticCompleteness', 'affectedRefs', 'retainedUnknowns', 'retainedHistoricalUses',
    'retainedParents', 'retainedInheritedUses', 'successorParents'])
    || !['complete', 'unknown'].includes(closure.semanticCompleteness)) return false;
  for (const name of ['retainedUnknowns', 'retainedHistoricalUses', 'retainedParents', 'retainedInheritedUses', 'successorParents']) {
    if (!dense(closure[name]) || !dense(op[name]) || closure[name].length !== op[name].length
      || !op[name].every((row, index) => Object.keys(row).every(key => same(row[key], closure[name][index]?.[key])))) return false;
  }
  return splitReplayShape(value.impacts.representativeReplays);
}

function splitRowsProof(value, wire) {
  const assignment = value.assignments; const rows = assignment?.rows; const mappings = wire.operation.mappings;
  if (!dense(rows) || !dense(mappings) || rows.length !== mappings.length || !rows.length
    || !same(rows.map(row => row?.ref), mappings.map(mapping => mapping.ref))
    || !same(value.authoredReferenceClosure.affectedRefs, mappings.map(mapping => mapping.ref))
    || !closed(assignment.used, ['selectedRecords', 'captureBytes', 'redirects'])
    || assignment.used.selectedRecords !== rows.length
    || ![['selectedRecords', 'maxRecords'], ['captureBytes', 'maxCaptureBytes'], ['redirects', 'maxRedirects']].every(([used, limit]) =>
      whole(assignment.used[used]) && whole(wire.limits.assignments?.[limit]) && assignment.used[used] <= wire.limits.assignments[limit])) return false;
  return rows.every((row, index) => {
    const e = row?.eligibility; const mapping = mappings[index];
    return closed(row, ['ref', 'eligibility', 'preservation']) && row.preservation?.ok === true
      && same(row.preservation.diagnostics, [])
      && closed(e, ['ok', 'scope', 'publicationReady', 'purpose', 'before', 'candidate', 'lifecycle', 'changes', 'subjects', 'diagnostics', 'used', 'ref'])
      && same(e.ref, row.ref) && e.ok === true && e.scope === 'row-local-assignment-eligibility' && e.publicationReady === false && e.purpose === 'new-assignment'
      && same(e.diagnostics, []) && e.lifecycle?.before?.state === 'effective' && e.lifecycle?.candidate?.state === 'effective'
      && closed(e.before, ['state', 'ids']) && closed(e.candidate, ['state', 'ids'])
      && e.before.state === 'known' && e.candidate.state === 'known' && subjectIds(e.before.ids) && subjectIds(e.candidate.ids)
      && e.before.ids.includes(wire.operation.subject) && subjectIds(mapping.successors)
      && mapping.successors.every(id => wire.operation.successors.includes(id))
      && same(e.candidate.ids, e.before.ids.flatMap(id => id === wire.operation.subject ? mapping.successors : [id]))
      && closed(e.used, ['redirects']) && whole(e.used.redirects) && e.used.redirects <= assignment.used.redirects;
  });
}

function splitReplayShape(replay) {
  return closed(replay, ['version', 'kind', 'status', 'policy', 'scope', 'subjects', 'inventory', 'inventoryDigest',
    'comparison', 'assessments', 'coverage', 'resources', 'diagnostics'])
    && replay.version === 1 && replay.kind === 'subject-split-replay' && replay.status === 'complete'
    && closed(replay.policy, ['id', 'version', 'digest']) && replay.policy.id === 'split-replay-v1'
    && replay.policy.version === 1 && hash(replay.policy.digest) && hash(replay.inventoryDigest)
    && same(replay.diagnostics, []);
}

/** Actual candidate bytes only; neither original Git membership nor native allocation proof. */
export function capturePreparedSubjectSplit({ root, source, candidate, gate, gateInput, captureLimits }) {
  if (!validSplitCaptureLimits(captureLimits) || !isPreparedSubjectSplitReport(gate, { source, candidate }, gateInput)
    || gate.ok !== true) refuse('capture input unavailable');
  const objectFormat = candidate.commit.length === 40 ? 'sha1' : 'sha256';
  const registry = readPreparedSubjectBytes({ root, file: registryPath(candidate), maxBytes: captureLimits.maxRegistryBytes });
  if (registry === null || !verifyCapturedBytes({ locator: gate.sources.registryCapture, bytes: registry, objectFormat }).ok) refuse('registry capture unavailable');
  const identity = readPreparedSplitIdentityBytes({ root, candidate, maxBytes: captureLimits.maxIdentityBytes });
  if (identity === null || !verifyCapturedBytes({ locator: gate.sources.identityCapture, bytes: identity, objectFormat }).ok) refuse('identity capture unavailable');
  try {
    const mode = lstatSync(join(root, identityPath(candidate))).mode;
    if ((mode & 0o777) !== parseInt(gate.allocation.candidate.mode.slice(-3), 8)) refuse('identity mode mismatch');
    const document = parseSubjectRegistry({ bytes: registry, identity: parseBytes(identity) });
    if (!document.ok || !rawRegistryProof(document.subjectRegistry.document, gate, gateInput)) refuse('registry evidence mismatch');
    if (gateInput.operation.assignmentEvent === null) return { registry, identity, event: null };
    const expected = gate.sources.assignmentEvent;
    const captured = capturePreparedAssignmentEvent({ root, source, candidate, gate: gate.assignments,
      eventId: expected.eventId, maxEventBytes: captureLimits.maxEventBytes });
    if (!captured || !verifyCapturedBytes({ locator: expected.eventCapture, bytes: captured.bytes, objectFormat }).ok
      || !rawAssignmentProof(parseBytes(captured.bytes), gate, gateInput)) refuse('assignment capture unavailable');
    return { registry, identity, event: captured.bytes };
  } catch (error) {
    if (error instanceof YAMLException || error instanceof CapturedInputError || error instanceof RangeError
      || Number.isInteger(error?.errno)) refuse('candidate evidence unavailable');
    throw error;
  }
}

function parseBytes(bytes) {
  const text = bytes.toString('utf8');
  if (!Buffer.from(text).equals(bytes)) refuse('candidate UTF-8 unavailable');
  return load(text);
}

function rawRegistryProof(document, gate, wire) {
  const suffix = document.history.slice(-2); const op = wire.operation;
  const tuple = event => ({ ref: event.decision, reference: event.review.reference, acceptedStatus: event.review.acceptedStatus,
    decisionDigest: event.review.decisionDigest, decisionCapture: event.review.decisionCapture });
  if (suffix.length !== 2 || !same(suffix.map(event => ({ id: event.id, changeDigest: event.review.changeDigest })), op.registryEvents)
    || !same(suffix.map(event => event.action), ['activate', 'split']) || !suffix.every(event => same(tuple(event), gate.decision))
    || !same(suffix[0].rows.map(row => row.id), op.successors) || suffix[1].rows.length !== 1
    || suffix[1].rows[0].id !== op.subject || !same(suffix[1].rows[0].after.retirement?.successors, op.successors)) return false;
  const scope = suffix[0].refusalAssessment?.scope;
  return same(scope?.beforeRegistry?.capture, gate.inventory.inputs.before.registryCapture)
    && scope?.beforeRegistry?.documentDigest === gate.inventory.inputs.before.registryDigest
    && scope?.identityDigest === gate.inventory.inputs.before.identityDigest;
}

function rawAssignmentProof(event, gate, wire) {
  const op = wire.operation;
  const tuple = { ref: event.decision, reference: event.review.reference, acceptedStatus: event.review['accepted-status'],
    decisionDigest: event.review['decision-digest'], decisionCapture: event.review['decision-capture'] };
  if (!same(tuple, gate.decision) || !same(event.scope, { kind: 'subject-use-transition', operation: op.id, action: 'split',
    subject: op.subject, successors: op.successors, 'registry-events': op.registryEvents.map(row => row.id) })
    || !same(event['before-input'], { commit: wire.before.commit, tree: wire.before.tree, 'kit-path': wire.before.kitPath })
    || event.rows.length !== op.mappings.length) return false;
  return event.rows.every((row, index) => {
    const mapping = op.mappings[index]; const eligibility = gate.assignments.rows[index].eligibility;
    return same(row.ref, mapping.ref) && row.reason === mapping.reason
      && row.disposition === 'changed' && whole(row['before-revision']) && row['after-revision'] === row['before-revision'] + 1
      && same(row.before, eligibility.before) && same(row.after, eligibility.candidate);
  });
}
