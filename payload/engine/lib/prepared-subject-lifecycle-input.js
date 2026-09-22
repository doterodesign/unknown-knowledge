/** Shared transport mechanics behind two fixed Subject lifecycle entrypoints. */
import { isDeepStrictEqual } from 'node:util';
import { canonicalSha256 } from './canonical-json.js';
import { EngineRefusal } from './engine-refusal.js';
import { admitSubjectLifecycleInput, admitSubjectSplitInput, subjectLifecycleInputWire, lifecycleMaterialPresent, admitContinuedRetirementWire, admitContinuedMergeWire, admitContinuedSplitWire } from './subject-lifecycle-input.js';
import { decodeDecisionCaptures, decodeAssessmentCaptures } from './subject-query-context.js';

const closed = (value, keys) => value !== null && typeof value === 'object' && !Array.isArray(value)
  && Reflect.ownKeys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
export const validSubjectLifecycleCaptureLimits = (value) => closed(value, ['maxRegistryBytes', 'maxEventBytes'])
  && Object.values(value).every((limit) => Number.isSafeInteger(limit) && limit > 0);

/** The wrapper chooses the literal action; untrusted wire cannot select its validator. */
export function decodePreparedSubjectLifecycleInput(repoRoot, wire, action) {
  if (!['merge-equivalent', 'retire'].includes(action)) throw new EngineRefusal('prepared subject lifecycle: unsupported action');
  if (lifecycleMaterialPresent(wire)) {
    const admitted = (action === 'retire' ? admitContinuedRetirementWire : admitContinuedMergeWire)(repoRoot, wire);
    if (!admitted.ok) throw new EngineRefusal(action === 'retire' ? 'prepared subject retirement: owner input admission' : 'prepared equivalent merge: owner input admission');
    return admitted.input;
  }
  return decodeInput(repoRoot, wire, action);
}

export function decodePreparedSubjectSplitInput(repoRoot, wire) {
  if (lifecycleMaterialPresent(wire)) {
    const admitted = admitContinuedSplitWire(repoRoot, wire);
    if (!admitted.ok) throw new EngineRefusal('prepared subject split: owner input admission');
    return admitted.input;
  }
  return decodeInput(repoRoot, wire, 'split');
}

function decodeInput(repoRoot, wire, action) {
  const prefix = action === 'split' ? 'prepared subject split' : action === 'retire' ? 'prepared subject retirement' : 'prepared equivalent merge';
  const refuse = code => { throw new EngineRefusal(`${prefix}: ${code}`); };
  if (!closed(wire, ['version', 'before', 'candidate', 'operation', 'reviewNote', 'evidence', 'limits', 'impact'])
    || wire.version !== 1 || !closed(wire.evidence, ['decisionCaptures', 'assessmentCaptures'])
    || !Array.isArray(wire.evidence.decisionCaptures) || !Array.isArray(wire.evidence.assessmentCaptures)) refuse('invalid input wire');
  const limit = wire.limits?.governance?.maxCaptureBytes;
  if (!Number.isSafeInteger(limit) || limit < 0) refuse('invalid capture capacity');
  let size = 0;
  for (const row of [...wire.evidence.decisionCaptures,
    ...wire.evidence.assessmentCaptures.flatMap((pair) => [pair?.registry, pair?.identity])]) {
    if (typeof row?.bytesBase64 !== 'string' || row.bytesBase64.length % 4 !== 0) refuse('invalid capture wire');
    const padding = row.bytesBase64.endsWith('==') ? 2 : row.bytesBase64.endsWith('=') ? 1 : 0;
    size += row.bytesBase64.length / 4 * 3 - padding;
    if (!Number.isSafeInteger(size) || size > limit) refuse('capture decode capacity');
  }
  const { version, evidence, ...semantic } = wire;
  const input = { repoRoot, ...semantic, evidence: {
    decisionCaptures: decodeDecisionCaptures(evidence.decisionCaptures),
    assessmentCaptures: decodeAssessmentCaptures(evidence.assessmentCaptures) } };
  const admitted = action === 'split' ? admitSubjectSplitInput(input) : admitSubjectLifecycleInput(input, action);
  if (!admitted.ok || admitted.inputDigest !== canonicalSha256(wire)
    || !isDeepStrictEqual(subjectLifecycleInputWire(admitted.input), wire)) refuse('owner input admission');
  return admitted.input;
}
