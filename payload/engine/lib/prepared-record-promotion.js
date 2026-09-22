/** Fixed homogeneous O/K/D promotion transport; no widening of the Decisions-only wire. */
import { isDeepStrictEqual as same } from 'node:util';
import { canonicalSha256 } from './canonical-json.js';
import { EngineRefusal } from './engine-refusal.js';
import { admitRecordPromotionInput, admitContinuedRecordPromotionWire, recordPromotionInputWire } from './record-promotion-input.js';
import { decodeDecisionCaptures, decodeAssessmentCaptures } from './subject-query-context.js';
import { lifecycleMaterialPresent } from './subject-lifecycle-input.js';
import { typedPromotionPolicyRef, typedPromotionPreflightSatisfied } from './typed-promotion-policy.js';

const closed = (v, keys) => v !== null && typeof v === 'object' && !Array.isArray(v)
  && Reflect.ownKeys(v).length === keys.length && keys.every((key) => {
    const field = Object.getOwnPropertyDescriptor(v, key); return field?.enumerable && Object.hasOwn(field, 'value');
  });
export function decodePreparedRecordPromotion(repoRoot, wire) {
  if (lifecycleMaterialPresent(wire)) {
    const admitted = admitContinuedRecordPromotionWire(repoRoot, wire);
    if (!admitted.ok) throw new EngineRefusal('invalid typed promotion input');
    return admitted.input;
  }
  if (!closed(wire, ['version', 'kind', 'before', 'candidate', 'publication', 'promotion', 'eventId', 'reviewNote', 'today', 'evidence', 'limits', 'impact'])
    || !closed(wire.evidence, ['decisionCaptures', 'assessmentCaptures'])) throw new EngineRefusal('invalid typed promotion wire');
  const admitted = admitRecordPromotionInput({ ...wire, repoRoot, evidence: {
    decisionCaptures: decodeDecisionCaptures(wire.evidence.decisionCaptures),
    assessmentCaptures: decodeAssessmentCaptures(wire.evidence.assessmentCaptures),
  } });
  if (!admitted.ok || admitted.inputDigest !== canonicalSha256(wire) || !same(recordPromotionInputWire(admitted.input), wire)) {
    throw new EngineRefusal('invalid typed promotion input');
  }
  return admitted.input;
}

/** Corroborates this profile's scope; the final gate still reruns every domain check. */
export function isTypedRecordPromotionProof(value, selectedRefs) {
  const before = value.capabilities?.before; const candidate = value.capabilities?.candidate;
  const keys = ['knowledge', 'ontology', 'decisions', 'subjectRegistry', 'assignmentHistory'];
  if (!['ontology', 'knowledge', 'decision'].includes(value.recordKind) || !closed(before, keys) || !closed(candidate, keys)
    || !keys.every((key) => typeof before[key] === 'boolean' && typeof candidate[key] === 'boolean')
    || !before[value.recordKind === 'decision' ? 'decisions' : value.recordKind] || !before.decisions || !candidate.assignmentHistory
    || !['knowledge', 'ontology', 'decisions', 'subjectRegistry'].every((key) => before[key] === candidate[key])
    || !typedPromotionPreflightSatisfied(value, selectedRefs)
    || value.impacts?.status !== 'passed' || !same(value.impacts.policy, typedPromotionPolicyRef())
    || !same(value.impacts.routes, { status: 'requires-final-capability', scope: 'kit-managed-subject-route-persistence' })) return false;
  return before.subjectRegistry
    ? same(value.impacts.applicability, { kind: 'subject-registry-present' })
      && same(value.impacts.required, ['reach', 'subjectTree', 'representativeReplays'])
      && ['complete', 'incomplete'].includes(value.impacts.reach?.status)
      && value.impacts.subjectTree?.status === 'complete' && value.impacts.representativeReplays?.status === 'complete'
      && value.impacts.unknownOwners?.status === 'complete'
    : same(value.impacts.applicability, { kind: 'subject-registry-absent-both' }) && same(value.impacts.required, [])
      && ['reach', 'subjectTree', 'representativeReplays', 'unknownOwners'].every((key) => value.impacts[key] === null);
}

export function isPreparedRecordPromotionReport(value, expected) {
  const wire = expected.operationInputs?.gateInput;
  const continued = lifecycleMaterialPresent(wire);
  const rows = wire?.promotion?.rows;
  if (continued && (!Array.isArray(rows) || !rows.every(row => row && typeof row === 'object' && row.canonicalRef))) return false;
  const selectedRefs = Array.isArray(rows) ? rows.map(({ canonicalRef }) => canonicalRef) : undefined;
  return closed(value, ['version', 'kind', 'mode', 'ok', 'publicationReady', 'inputDigest', 'inputs', 'recordKind', 'capabilities',
    'checks', 'promotion', 'assignment', 'preflight', 'sources', 'impacts', 'resources', 'diagnostics'])
    && value.version === (continued ? 3 : 2) && value.kind === 'typed-record-promotion-gate' && value.mode === 'read-only-prepared-record-promotion'
    && typeof value.ok === 'boolean' && value.publicationReady === false
    && (value.inputDigest === null || (typeof value.inputDigest === 'string' && /^[0-9a-f]{64}$/.test(value.inputDigest)))
    && (value.inputs === null || same(value.inputs, { before: expected.source, candidate: expected.candidate }))
    && closed(value.checks, ['admission', 'models', 'source', 'promotion', 'governance', 'assignments', 'preflight', 'preservation', 'authorizer', 'impacts'])
    && Array.isArray(value.diagnostics)
    && (!value.ok || (value.inputs !== null && isTypedRecordPromotionProof(value, selectedRefs)
      && (!continued || (value.inputDigest === canonicalSha256(wire) && same(value.resources?.limits, wire.limits)
        && closed(value.resources?.governance, ['used', 'failure']) && value.resources.governance.failure === null
        && closed(value.resources.governance.used, ['captureBytes', 'documentNodes', 'documentTextUnits', 'subjects', 'historyRows', 'validationSteps', 'relevantRefusalRows'])
        && Object.values(value.resources.governance.used).every(used => Number.isSafeInteger(used) && used >= 0)
        && Object.entries({ captureBytes: 'maxCaptureBytes', documentNodes: 'maxDocumentNodes', documentTextUnits: 'maxDocumentTextUnits',
          subjects: 'maxSubjects', historyRows: 'maxHistoryRows', validationSteps: 'maxValidationSteps' })
          .every(([counter, limit]) => value.resources.governance.used[counter] <= wire.limits?.governance?.[limit])))
      && Object.entries(value.checks).every(([name, check]) => name === 'preflight' || check?.status === 'passed')
      && value.promotion?.status === 'passed' && value.assignment?.ok === true && value.assignment.publicationReady === false
      && value.assignment.checks?.humanApproval?.status === 'not-performed' && value.assignment.checks?.impactPolicy?.status === 'not-performed'));
}
