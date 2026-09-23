import { lifecycleMaterialPresent } from './subject-lifecycle-input.js';
import { canonicalSha256, canonicalJsonBytes, CapturedInputError } from './canonical-json.js';
import { isCaptureLocator } from './capture-locator.js';
import { parseCanonicalId, isIdentityUuid } from './record-identity.js';
/** Fixed equivalent-merge wire admission and raw snapshot capture for transport. */
import { isDeepStrictEqual } from 'node:util';
import { EngineRefusal } from './engine-refusal.js';
import { decodePreparedSubjectLifecycleInput, validSubjectLifecycleCaptureLimits } from './prepared-subject-lifecycle-input.js';
import { capturePreparedAssignmentEvent, readPreparedSubjectBytes } from './prepared-assignment-event.js';
import { verifyCapturedBytes } from './captured-source.js';

const closed = (value, keys) => value !== null && typeof value === 'object' && !Array.isArray(value)
  && Reflect.ownKeys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const refuse = (code) => { throw new EngineRefusal(`prepared equivalent merge: ${code}`); };
const checkNames = ['admission', 'models', 'registry', 'authoredReferences', 'assignments', 'decision', 'preservation', 'impacts'];
export const validMergeCaptureLimits = validSubjectLifecycleCaptureLimits;

/** Decode the owner's existing capture transport; its own admission/digest remains authoritative. */
export function decodePreparedEquivalentMerge(repoRoot, wire) {
  return decodePreparedSubjectLifecycleInput(repoRoot, wire, 'merge-equivalent');
}

export function isPreparedEquivalentMergeReport(value, expected, gateInput) {
  if (gateInput?.operation?.assignmentEvent === null) {
    try { return zeroReport(value, expected, gateInput); }
    catch (error) {
      if (!(error instanceof CapturedInputError || error instanceof RangeError)) throw error;
      return false;
    }
  }
  return closed(value, ['version', 'kind', 'mode', 'ok', 'publicationReady', 'inputDigest', 'inputs', 'operation',
    'sources', 'decision', 'checks', 'authoredReferenceClosure', 'inventory', 'assignments', 'impacts', 'resources', 'diagnostics'])
    && value.version === (lifecycleMaterialPresent(gateInput) ? 2 : 1) && value.kind === 'subject-equivalent-merge-gate' && value.mode === 'read-only-prepared-equivalent-merge'
    && typeof value.ok === 'boolean' && value.publicationReady === false
    && (value.inputDigest === null || (typeof value.inputDigest === 'string' && /^[0-9a-f]{64}$/.test(value.inputDigest)))
    && (value.inputs === null || isDeepStrictEqual(value.inputs, { before: expected.source, candidate: expected.candidate }))
    && closed(value.sources, ['registryCapture', 'registryEvents', 'assignmentEvent']) && Array.isArray(value.sources.registryEvents)
    && closed(value.checks, checkNames) && Object.values(value.checks).every((row) => closed(row, ['status'])
      && ['not-performed', 'passed', 'failed'].includes(row.status))
    && closed(value.impacts, ['reach', 'subjectTree', 'representativeReplays', 'routes']) && Array.isArray(value.diagnostics)
    && (!value.ok || !lifecycleMaterialPresent(gateInput) || (canonicalSha256(gateInput) === value.inputDigest
      && isDeepStrictEqual(gateInput.before, expected.source) && isDeepStrictEqual(gateInput.candidate, expected.candidate)
      && isDeepStrictEqual(gateInput.operation, value.operation) && isDeepStrictEqual(gateInput.limits, value.resources?.limits)
      && value.resources?.governance?.failure === null))
    && (!value.ok || (value.inputs !== null && checkNames.every((name) => value.checks[name].status === 'passed')));
}

/** Fixed parsed-JSON boundary. Consistency is not independent authority. */
function zeroReport(value, expected, wire) {
  if (!closed(value, ['version', 'kind', 'mode', 'ok', 'publicationReady', 'inputDigest', 'inputs', 'operation',
    'sources', 'decision', 'checks', 'authoredReferenceClosure', 'inventory', 'assignments', 'impacts', 'resources',
    'diagnostics', 'preservation', 'assignmentAssessment']) || value.version !== 3
    || value.kind !== 'subject-equivalent-merge-gate' || value.mode !== 'read-only-prepared-equivalent-merge'
    || typeof value.ok !== 'boolean' || value.publicationReady !== false || !Array.isArray(value.diagnostics)
    || !closed(value.checks, checkNames) || !checkNames.every(name => closed(value.checks[name], ['status'])
      && ['not-performed','failed','passed', ...(name === 'assignments' ? ['not-applicable'] : [])].includes(value.checks[name].status))) return false;
  canonicalSha256(value);
  if (!value.ok) return true;
  const whole = n => Number.isSafeInteger(n) && n >= 0;
  const counters = ['captureBytes','documentNodes','documentTextUnits','subjects','historyRows','validationSteps'];
  const registryFile = `${expected.candidate.kitPath === '.' ? '' : `${expected.candidate.kitPath}/`}subjects/registry.yaml`;
  const proof = value.preservation?.proof, assessment = value.assignmentAssessment;
  const resources = value.resources, operation = wire.operation;
  if (!closed(wire, ['version','before','candidate','operation','reviewNote','evidence','limits','impact']) || wire.version !== 1
    || canonicalSha256(wire) !== value.inputDigest || !isDeepStrictEqual(value.operation, operation)
    || operation.action !== 'merge-equivalent' || operation.version !== 1 || !isIdentityUuid(operation.id)
    || !parseCanonicalId('subject', operation.survivor).ok || !Array.isArray(operation.absorbed) || operation.absorbed.length !== 1
    || !parseCanonicalId('subject', operation.absorbed[0]).ok || operation.absorbed[0] === operation.survivor
    || !isDeepStrictEqual(wire.before, expected.source) || !isDeepStrictEqual(wire.candidate, expected.candidate)
    || !isDeepStrictEqual(value.inputs, { before: expected.source, candidate: expected.candidate })
    || value.diagnostics.length || value.assignments !== null || !closed(value.sources, ['registryCapture','registryEvents','assignmentEvent'])
    || value.sources.assignmentEvent !== null || !isCaptureLocator(value.sources.registryCapture)
    || value.sources.registryCapture.file !== registryFile
    || !isDeepStrictEqual(value.sources.registryCapture.source, { commit: expected.candidate.commit, tree: expected.candidate.tree })
    || !isDeepStrictEqual(value.sources.registryEvents, operation.registryEvents) || operation.registryEvents.length !== 1
    || !checkNames.every(name => value.checks[name].status === (name === 'assignments' ? 'not-applicable' : 'passed'))
    || !['complete','incomplete'].includes(value.inventory?.status) || value.authoredReferenceClosure?.status !== 'complete'
    || !isDeepStrictEqual(value.authoredReferenceClosure.affectedRefs, []) || !Array.isArray(value.authoredReferenceClosure.retainedUnknowns)
    || !closed(resources, ['limits','governance','closure']) || !isDeepStrictEqual(resources.limits, wire.limits)
    || !closed(wire.limits.closure, ['maxRows','maxBytes']) || !Object.values(wire.limits.closure).every(whole)
    || !closed(resources.governance, ['used','failure']) || resources.governance.failure !== null
    || !closed(resources.governance.used, [...counters,'relevantRefusalRows'])
    || !counters.every(key => whole(resources.governance.used[key]) && whole(wire.limits.governance[`max${key[0].toUpperCase()}${key.slice(1)}`])
      && resources.governance.used[key] <= wire.limits.governance[`max${key[0].toUpperCase()}${key.slice(1)}`])
    || !whole(resources.governance.used.relevantRefusalRows) || resources.governance.used.relevantRefusalRows > resources.governance.used.validationSteps
    || !closed(resources.closure, ['used','failure']) || resources.closure.failure !== null
    || !closed(resources.closure.used, ['rows','bytes']) || !['rows','bytes'].every(key => whole(resources.closure.used[key])
      && resources.closure.used[key] <= wire.limits.closure[key === 'rows' ? 'maxRows' : 'maxBytes'])) return false;
  const namespace = value.inventory.inputs?.before?.namespace, decision = value.decision;
  if (!isIdentityUuid(namespace) || !['before','candidate'].every(side => {
    const actual = value.inventory.inputs?.[side];
    return actual?.namespace === namespace && isDeepStrictEqual({ commit: actual.commit, tree: actual.tree, kitPath: actual.kitPath }, value.inputs[side])
      && ['records','registry','hierarchy'].every(part => value.inventory.coverage?.[side]?.[part] === 'complete');
  }) || !isDeepStrictEqual(value.sources.registryCapture, value.inventory.inputs.candidate.registryCapture)
    || !closed(decision, ['ref','reference','acceptedStatus','decisionDigest','decisionCapture'])
    || !closed(decision.ref, ['namespace','kind','id']) || decision.ref.namespace !== namespace || decision.ref.kind !== 'decision'
    || !parseCanonicalId('decision', decision.ref.id).ok || typeof decision.reference !== 'string' || !decision.reference.trim()
    || !['accepted','addressed'].includes(decision.acceptedStatus) || !/^[0-9a-f]{64}$/.test(decision.decisionDigest)
    || !isCaptureLocator(decision.decisionCapture)
    || !closed(value.impacts, ['reach','subjectTree','representativeReplays','routes'])
    || !['complete','incomplete'].includes(value.impacts.reach?.status) || value.impacts.subjectTree?.status !== 'complete'
    || value.impacts.representativeReplays?.status !== 'complete'
    || value.impacts.representativeReplays.policy?.id !== 'equivalent-merge-replay-v1'
    || !isDeepStrictEqual(value.impacts.routes, { status: 'requires-final-capability', scope: 'kit-managed-subject-route-persistence', externalInventory: 'unknown' })
    || !closed(value.preservation, ['status','proof','proofDigest']) || value.preservation.status !== 'passed'
    || !closed(proof, ['inputs','operationDigest','registryFile','changedPaths','inventoryDigest'])
    || !isDeepStrictEqual(proof.inputs, value.inputs) || proof.operationDigest !== canonicalSha256(operation)
    || proof.registryFile !== registryFile || !isDeepStrictEqual(proof.changedPaths, [registryFile])
    || proof.inventoryDigest !== canonicalSha256(value.inventory) || value.preservation.proofDigest !== canonicalSha256(proof)
    || !isDeepStrictEqual(assessment, { status: 'not-applicable', reason: 'zero-effective-direct-use', effectiveDirectRefs: [],
      inventoryDigest: proof.inventoryDigest, preservationDigest: value.preservation.proofDigest })) return false;
  const rows = [...value.authoredReferenceClosure.retainedUnknowns, proof];
  return resources.closure.used.rows === rows.length
    && resources.closure.used.bytes === rows.reduce((sum, row) => sum + canonicalJsonBytes(row).length, 0);
}

/** Actual owner locators are corroborated with complete raw bytes in the verified candidate snapshot. */
export function capturePreparedEquivalentMerge({ root, source, candidate, gate, gateInput, captureLimits }) {
  if (!validMergeCaptureLimits(captureLimits) || !isPreparedEquivalentMergeReport(gate, { source, candidate }, gateInput)) refuse('capture input unavailable');
  const registryFile = `${candidate.kitPath === '.' ? '' : `${candidate.kitPath}/`}subjects/registry.yaml`;
  const locator = gate.sources.registryCapture;
  const sourcePair = { commit: candidate.commit, tree: candidate.tree };
  const zero = gateInput.operation.assignmentEvent === null;
  if (locator?.file !== registryFile || !isDeepStrictEqual(locator.source, sourcePair)
    || (!zero && (!gate.sources.assignmentEvent || !isDeepStrictEqual(gate.sources.assignmentEvent.eventCapture?.source, sourcePair)))) refuse('capture source mismatch');
  const registry = readPreparedSubjectBytes({ root, file: registryFile, maxBytes: captureLimits.maxRegistryBytes });
  const objectFormat = candidate.commit.length === 40 ? 'sha1' : 'sha256';
  if (registry === null || !verifyCapturedBytes({ locator, bytes: registry, objectFormat }).ok) refuse('registry capture unavailable');
  if (zero) return { registry, event: null };
  const captured = capturePreparedAssignmentEvent({ root, source, candidate, gate: gate.assignments,
    eventId: gate.sources.assignmentEvent.eventId, maxEventBytes: captureLimits.maxEventBytes });
  const event = gate.sources.assignmentEvent;
  if (!captured || event.eventCapture.file !== captured.eventSource.file || event.eventDigest !== captured.eventSource.eventDigest
    || !verifyCapturedBytes({ locator: event.eventCapture, bytes: captured.bytes, objectFormat }).ok) refuse('assignment capture unavailable');
  return { registry, event: captured.bytes };
}
