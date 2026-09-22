/** Fixed owned-capture admission; no source membership or governance authority. */
import { canonicalSha256 } from './canonical-json.js';
import { isCaptureLocator } from './capture-locator.js';
import { getSubjectValidationBudget } from './subject-validation-budget.js';
import { SubjectError } from './subject-error.js';
import { canonicalBase64DecodedLength } from './canonical-base64.js';

const bufferLength = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(Uint8Array.prototype), 'length').get;
const reconsideration = Object.freeze({ prefix: 'reconsideration-input', code: 'invalid-subject-reconsideration-input',
  message: 'Supply the closed reconsideration request and explicit capacities.' });
const lifecycle = Object.freeze({ prefix: 'lifecycle-continuation', code: 'invalid-lifecycle-continuation',
  message: 'Supply the closed lifecycle evidence and explicit governance capacities.' });
const assignment = Object.freeze({ prefix: 'assignment-continuation', code: 'invalid-assignment-continuation',
  message: 'Supply the closed assignment continuation and explicit governance capacities.' });

/** Preserve the original reconsideration raw-input phases and refusal policy. */
export function admitReconsiderationCaptureEvidence(evidence, operationBudget) {
  return admitEvidence(evidence, operationBudget, reconsideration, false);
}

/** Reconsideration wire owns one reserved decode per supplied occurrence. */
export function decodeReconsiderationCaptureEvidence(evidence, operationBudget) {
  return admitEvidence(evidence, operationBudget, reconsideration, true);
}

/** Ordinary continuation owns one copy of each supplied raw occurrence. */
export function admitAssignmentCaptureEvidence(evidence, operationBudget) {
  return admitEvidence(evidence, operationBudget, assignment, false);
}

/** Ordinary wire continuation reserves before its single canonical decode. */
export function decodeAssignmentCaptureEvidence(evidence, operationBudget) {
  return admitEvidence(evidence, operationBudget, assignment, true);
}

/** Fixed lifecycle raw/wire transport; the owner retains all actual-source proof. */
export function admitLifecycleCaptureEvidence(evidence, operationBudget) {
  return admitEvidence(evidence, operationBudget, lifecycle, false);
}
export function decodeLifecycleCaptureEvidence(evidence, operationBudget) {
  return admitEvidence(evidence, operationBudget, lifecycle, true);
}

function admitEvidence(evidence, operationBudget, profile, wire) {
  const budget = getSubjectValidationBudget(operationBudget);
  budget.assertActive();
  const fail = () => { throw new SubjectError(profile.code, profile.message); };
  const own = (value, keys) => {
    if (value === null || typeof value !== 'object'
      || ![Object.prototype, null].includes(Object.getPrototypeOf(value))
      || Reflect.ownKeys(value).length !== keys.length) fail();
    for (const key of keys) {
      const field = Object.getOwnPropertyDescriptor(value, key);
      if (!field?.enumerable || !Object.hasOwn(field, 'value')) fail();
    }
  };
  const locator = value => {
    own(value, Object.hasOwn(value ?? {}, 'source') ? ['file', 'blob', 'sha256', 'source'] : ['file', 'blob', 'sha256']);
    if (Object.hasOwn(value, 'source')) own(value.source, ['commit', 'tree']);
    if (!isCaptureLocator(value)) fail();
  };
  own(evidence, ['decisionCaptures', 'assessmentCaptures', 'materialCaptures']);

  const capture = value => {
    budget.charge('validationSteps', 1, `${profile.prefix}-capture`);
    own(value, ['capture', wire ? 'bytesBase64' : 'bytes', 'objectFormat']);
    budget.guard({ capture: value.capture, objectFormat: value.objectFormat }, `${profile.prefix}-capture-metadata`);
    locator(value.capture);
    if (!['sha1', 'sha256'].includes(value.objectFormat)
      || value.capture.blob.length !== (value.objectFormat === 'sha1' ? 40 : 64)) fail();
    let bytes, reservation;
    if (wire) {
      budget.guard({ bytesBase64: value.bytesBase64 }, `${profile.prefix}-wire-bytes`);
      const text = value.bytesBase64;
      const length = canonicalBase64DecodedLength(text);
      if (length === null) fail();
      reservation = budget.reserveCaptureBytes(length, `${profile.prefix}-wire-decode`);
      bytes = Buffer.from(text, 'base64');
    } else {
      if (!Buffer.isBuffer(value.bytes) || Object.getPrototypeOf(value.bytes) !== Buffer.prototype) fail();
      const length = bufferLength.call(value.bytes);
      reservation = budget.reserveCaptureBytes(length, `${profile.prefix}-owned-copy`);
      // Native own-key allocation is not an end-to-end CPU/memory bound.
      budget.charge('validationSteps', length + 1, `${profile.prefix}-buffer-properties`);
      if (Reflect.ownKeys(value.bytes).length !== length) fail();
      for (let index = 0; index < length; index += 1) {
        const field = Object.getOwnPropertyDescriptor(value.bytes, String(index));
        if (!field?.enumerable || !Object.hasOwn(field, 'value')) fail();
      }
      bytes = Buffer.from(value.bytes);
    }
    const owned = { capture: structuredClone(value.capture), bytes, objectFormat: value.objectFormat };
    budget.admitCapture(owned, reservation);
    return owned;
  };
  const list = (rows, pair) => {
    if (!Array.isArray(rows) || Object.getPrototypeOf(rows) !== Array.prototype) fail();
    budget.charge('validationSteps', rows.length, `${profile.prefix}-capture-rows`);
    if (Reflect.ownKeys(rows).length !== rows.length + 1) fail();
    const result = [], seen = new Set();
    for (let index = 0; index < rows.length; index += 1) {
      const field = Object.getOwnPropertyDescriptor(rows, String(index));
      if (!field?.enumerable || !Object.hasOwn(field, 'value')) fail();
      const value = field.value;
      if (pair) own(value, ['registry', 'identity']);
      const copied = pair ? { registry: capture(value.registry), identity: capture(value.identity) } : capture(value);
      const key = canonicalSha256(pair ? [copied.registry.capture, copied.identity.capture] : copied.capture);
      if (seen.has(key)) fail();
      seen.add(key);
      result.push(copied);
    }
    return result;
  };
  return { decisionCaptures: list(evidence.decisionCaptures, false),
    assessmentCaptures: list(evidence.assessmentCaptures, true), materialCaptures: list(evidence.materialCaptures, false) };
}
