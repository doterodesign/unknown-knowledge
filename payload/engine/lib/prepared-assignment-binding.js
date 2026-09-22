/** Fixed retained assignment-input binding shared by final execution and review. */
import { isDeepStrictEqual as same } from 'node:util';
import { canonicalJsonBytes, canonicalSha256, CapturedInputError } from './canonical-json.js';
import { EngineRefusal } from './engine-refusal.js';
import { validTypedAssignmentSelection } from './prepared-assignment-continuation.js';

const closed = (value, keys) => value !== null && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const refuse = () => { throw new EngineRefusal('retained assignment input binding unavailable'); };

/** Accepts only native retained readback from fixed internal call sites. No policy argument. */
export function readBoundPreparedAssignmentInput(retained, expected) {
  const artifact = retained.artifacts.find(row => row.file === 'checks/operation/input.json');
  if (!artifact) refuse();
  let operation;
  try {
    operation = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(artifact.bytes));
    if (!canonicalJsonBytes(operation).equals(artifact.bytes)) refuse();
  } catch (error) {
    if (!(error instanceof SyntaxError || error instanceof TypeError || error instanceof CapturedInputError || error instanceof RangeError)) throw error;
    refuse();
  }
  if (!closed(operation, ['source', 'candidate', 'operation', 'operationInputs', 'runtimeDigest'])
    || operation.operation !== 'subject-assignment' || expected.operation !== 'subject-assignment'
    || operation.runtimeDigest !== retained.manifest.runtimeDigest || operation.runtimeDigest !== expected.runtimeDigest
    || !same(operation.source, retained.manifest.source) || !same(operation.source, expected.source)
    || !same(operation.candidate, retained.manifest.candidate) || !same(operation.candidate, expected.candidate)) refuse();
  const check = retained.report.checks.find(row => row.id === 'operation');
  if (retained.report.provenance !== 'verified' || retained.report.runtimeVerification !== 'verified'
    || check?.completion !== 'complete' || check.invocation?.injectedInputsDigest !== canonicalSha256(operation)) refuse();
  const input = operation.operationInputs;
  if (!closed(input, ['eventId', 'reviewNote', 'decisionCaptures', 'limits', 'impact', 'maxEventBytes',
    ...(Object.hasOwn(input ?? {}, 'selection') ? ['selection'] : []),
    ...(Object.hasOwn(input ?? {}, 'continuation') ? ['continuation'] : [])])) refuse();
  if (Object.hasOwn(input, 'selection') && !validTypedAssignmentSelection(input.selection)) refuse();
  return operation;
}
