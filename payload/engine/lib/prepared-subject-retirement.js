/** Fixed retirement proof and raw capture transport; never approval authority. */
import { isDeepStrictEqual as same } from 'node:util';
import { canonicalJsonBytes, canonicalSha256, CapturedInputError } from './canonical-json.js';
import { EngineRefusal } from './engine-refusal.js';
import { isCaptureLocator } from './capture-locator.js';
import { isIdentityUuid, parseCanonicalId } from './record-identity.js';
import { decodePreparedSubjectLifecycleInput, validSubjectLifecycleCaptureLimits } from './prepared-subject-lifecycle-input.js';
import { capturePreparedAssignmentEvent, readPreparedSubjectBytes } from './prepared-assignment-event.js';
import { lifecycleMaterialPresent } from './subject-lifecycle-input.js';
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
const checkNames = ['admission', 'models', 'registry', 'authoredReferences', 'assignments', 'decision', 'preservation', 'candidateCommitMembership', 'impacts'];
const assignmentChecks = ['models', 'source', 'scope', 'history', 'captures', 'eligibility', 'preservation', 'authorizer', 'candidateCommitMembership'];
const refuse = code => { throw new EngineRefusal(`prepared subject retirement: ${code}`); };
const registryPath = candidate => `${candidate.kitPath === '.' ? '' : `${candidate.kitPath}/`}subjects/registry.yaml`;
const sourcePair = candidate => ({ commit: candidate.commit, tree: candidate.tree });
const ref = (value, namespace) => closed(value, ['namespace', 'kind', 'id']) && value.namespace === namespace
  && ['knowledge', 'ontology', 'decision'].includes(value.kind) && parseCanonicalId(value.kind, value.id).ok;
const refKey = value => JSON.stringify([value.namespace, value.kind, value.id]);
const refs = (values, namespace) => dense(values) && values.every(value => ref(value, namespace))
  && new Set(values.map(refKey)).size === values.length;
const sameRefs = (a, b) => same(a.map(refKey).sort(), b.map(refKey).sort());

export const validRetirementCaptureLimits = validSubjectLifecycleCaptureLimits;
export function decodePreparedSubjectRetirement(repoRoot, wire) {
  return decodePreparedSubjectLifecycleInput(repoRoot, wire, 'retire');
}

/** Original admitted wire is required at each successful retained/fresh boundary. */
export function isPreparedSubjectRetirementReport(value, expected, gateInput) {
  if (!closed(value, ['version', 'kind', 'mode', 'ok', 'publicationReady', 'inputDigest', 'inputs', 'operation',
    'sources', 'decision', 'checks', 'authoredReferenceClosure', 'inventory', 'assignments', 'assignmentAssessment',
    'preservation', 'impacts', 'resources', 'diagnostics']) || !expected
    || value.version !== (lifecycleMaterialPresent(gateInput) ? 2 : 1) || value.kind !== 'subject-retirement-gate' || value.mode !== 'read-only-prepared-retirement'
    || typeof value.ok !== 'boolean' || value.publicationReady !== false
    || !(value.inputDigest === null || hash(value.inputDigest))
    || !(value.inputs === null || same(value.inputs, { before: expected.source, candidate: expected.candidate }))
    || !closed(value.sources, ['registryCapture', 'registryEvents', 'assignmentEvent']) || !dense(value.sources.registryEvents)
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
    return !value.ok || retirementProof(value, expected, gateInput);
  } catch (error) {
    if (!(error instanceof CapturedInputError)) throw error;
    return false;
  }
}

function retirementProof(value, expected, wire) {
  if (!closed(wire, ['version', 'before', 'candidate', 'operation', 'reviewNote', 'evidence', 'limits', 'impact'])
    || wire.version !== 1 || canonicalSha256(wire) !== value.inputDigest
    || !same(wire.before, expected.source) || !same(wire.candidate, expected.candidate)
    || !same(value.operation, wire.operation) || wire.operation?.action !== 'retire' || wire.operation.version !== 1
    || !isIdentityUuid(wire.operation.id) || !parseCanonicalId('subject', wire.operation.subject).ok
    || value.inputs === null || value.diagnostics.length || !['complete', 'incomplete'].includes(value.inventory?.status)
    || value.authoredReferenceClosure?.status !== 'complete'
    || !closed(value.resources, ['limits', 'governance', 'closure']) || !same(value.resources.limits, wire.limits)
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
  const operation = wire.operation; const namespace = value.inventory.inputs?.before?.namespace;
  if (!isIdentityUuid(namespace) || !['before', 'candidate'].every(side => {
    const actual = value.inventory.inputs?.[side]; const descriptor = value.inputs[side];
    return actual?.namespace === namespace && same({ commit: actual.commit, tree: actual.tree, kitPath: actual.kitPath }, descriptor)
      && ['records', 'registry', 'hierarchy'].every(part => value.inventory.coverage?.[side]?.[part] === 'complete');
  }) || !closed(value.decision, ['ref', 'reference', 'acceptedStatus', 'decisionDigest', 'decisionCapture'])
    || !ref(value.decision.ref, namespace) || value.decision.ref.kind !== 'decision' || !text(value.decision.reference)
    || !['accepted', 'addressed'].includes(value.decision.acceptedStatus) || !hash(value.decision.decisionDigest)
    || !isCaptureLocator(value.decision.decisionCapture)
    || operation.registryEvents?.length !== 1 || !same(value.sources.registryEvents, operation.registryEvents)
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
      && same(value.authoredReferenceClosure.affectedRefs, [])
      && closed(assessment, ['status', 'reason', 'effectiveDirectRefs', 'inventoryDigest', 'preservationDigest'])
      && assessment.status === 'not-applicable' && assessment.reason === 'zero-effective-direct-use' && same(assessment.effectiveDirectRefs, [])
      && closed(value.preservation, ['status', 'proof', 'proofDigest']) && value.preservation.status === 'passed'
      && closed(proof, ['inputs', 'operationDigest', 'registryFile', 'changedPaths', 'inventoryDigest'])
      && value.resources.closure.used.rows >= 1 && value.resources.closure.used.bytes >= canonicalJsonBytes(proof).length
      && same(proof.inputs, value.inputs) && proof.operationDigest === canonicalSha256(operation)
      && proof.registryFile === registryPath(expected.candidate) && same(proof.changedPaths, [proof.registryFile])
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
    && assignment.scope.status === 'complete' && assignment.scope.basis === 'actual-retirement-affected-uses'
    && closed(assignment.checks, [...assignmentChecks, 'impactPolicy', 'humanApproval'])
    && assignmentChecks.every(name => assignment.checks[name]?.status === 'passed')
    && ['impactPolicy', 'humanApproval'].every(name => assignment.checks[name]?.status === 'not-performed')
    && closed(event, ['eventId', 'eventDigest', 'eventCapture']) && event.eventId === operation.assignmentEvent?.id
    && event.eventDigest === operation.assignmentEvent.changeDigest && isCaptureLocator(event.eventCapture)
    && event.eventCapture.file === eventFile && same(event.eventCapture.source, sourcePair(expected.candidate))
    && same(assignment.eventSource, { file: eventFile, eventId: event.eventId, eventDigest: event.eventDigest, candidate: expected.candidate });
}

/** Raw bytes come only from the trusted caller's verified candidate snapshot. */
export function capturePreparedSubjectRetirement({ root, source, candidate, gate, gateInput, captureLimits }) {
  if (!validRetirementCaptureLimits(captureLimits) || !isPreparedSubjectRetirementReport(gate, { source, candidate }, gateInput)
    || gate.ok !== true) refuse('capture input unavailable');
  const objectFormat = candidate.commit.length === 40 ? 'sha1' : 'sha256';
  const registry = readPreparedSubjectBytes({ root, file: registryPath(candidate), maxBytes: captureLimits.maxRegistryBytes });
  if (registry === null || !verifyCapturedBytes({ locator: gate.sources.registryCapture, bytes: registry, objectFormat }).ok) refuse('registry capture unavailable');
  if (gateInput.operation.assignmentEvent === null) return { registry, event: null };
  const expected = gate.sources.assignmentEvent;
  const captured = capturePreparedAssignmentEvent({ root, source, candidate, gate: gate.assignments,
    eventId: expected.eventId, maxEventBytes: captureLimits.maxEventBytes });
  if (!captured || captured.eventSource.file !== expected.eventCapture.file || captured.eventSource.eventDigest !== expected.eventDigest
    || !verifyCapturedBytes({ locator: expected.eventCapture, bytes: captured.bytes, objectFormat }).ok) refuse('assignment capture unavailable');
  return { registry, event: captured.bytes };
}
