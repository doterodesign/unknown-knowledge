/** Transport for the released Decisions-only owner gate, never a generic promotion dispatcher. */
import { isDeepStrictEqual as same } from 'node:util';
import { canonicalSha256 } from './canonical-json.js';
import { EngineRefusal } from './engine-refusal.js';
import { admitDecisionPromotionInput, decisionPromotionInputWire } from './decision-promotion-input.js';
const closed = (v, keys) => v !== null && typeof v === 'object' && !Array.isArray(v)
  && Reflect.ownKeys(v).length === keys.length && keys.every((key) => Object.hasOwn(v, key));
export function decodePreparedPromotion(repoRoot, wire) {
  if (!closed(wire, ['version', 'before', 'candidate', 'publication', 'promotion', 'eventId', 'reviewNote', 'limits']) || wire.version !== 1) {
    throw new EngineRefusal('invalid Decisions-only promotion wire');
  }
  const { version, ...semantic } = wire;
  const admitted = admitDecisionPromotionInput({ repoRoot, ...semantic });
  if (!admitted.ok || admitted.inputDigest !== canonicalSha256(wire) || !same(decisionPromotionInputWire(admitted.input), wire)) {
    throw new EngineRefusal('invalid Decisions-only promotion input');
  }
  return admitted.input;
}
export function isPreparedPromotionReport(value, expected) {
  return closed(value, ['version', 'kind', 'mode', 'ok', 'publicationReady', 'inputDigest', 'inputs', 'capabilities', 'promotion', 'assignment'])
    && value.version === 1 && value.kind === 'decision-promotion-gate' && value.mode === 'read-only-prepared-decision-promotion'
    && typeof value.ok === 'boolean' && value.publicationReady === false
    && (value.inputDigest === null || (typeof value.inputDigest === 'string' && /^[0-9a-f]{64}$/.test(value.inputDigest)))
    && (value.inputs === null || same(value.inputs, { before: expected.source, candidate: expected.candidate }))
    && closed(value.capabilities, ['before', 'candidate'])
    && closed(value.promotion, ['status', 'createdRefs', 'files', 'resources', 'diagnostics'])
    && Array.isArray(value.promotion.createdRefs) && Array.isArray(value.promotion.files) && Array.isArray(value.promotion.diagnostics)
    && (!value.ok || (value.inputs !== null && value.promotion.status === 'passed' && value.assignment?.ok === true
      && value.assignment.publicationReady === false && value.assignment.checks.humanApproval.status === 'not-performed'));
}
export function isDecisionOnlyPromotionCapability(value) {
  return same(value, { before: { knowledge: false, ontology: false, decisions: true, subjectRegistry: false, assignmentHistory: false },
    candidate: { knowledge: false, ontology: false, decisions: true, subjectRegistry: false, assignmentHistory: true } });
}
