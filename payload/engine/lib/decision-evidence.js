/** Captured Decision evidence only; callers own event scope, current authority and publication. */
import { load, YAMLException } from 'js-yaml';
import { isIdentityUuid, parseCanonicalId } from './record-identity.js';
import { isCaptureLocator } from './capture-locator.js';
import { verifyCapturedBytes } from './captured-source.js';
import { canonicalSha256 } from './canonical-json.js';

/** Optional internal budget guards parsed input; it is never an authorization flag. */
export function verifyDecisionEvidence({ decision, acceptedStatus, decisionDigest, decisionCapture, captures }, { budget } = {}) {
  const invalid = (code, message) => ({ status: 'invalid', diagnostics: [{ code, path: '', message }] });
  if (!decision || Object.keys(decision).length !== 3 || !isIdentityUuid(decision.namespace)
    || decision.kind !== 'decision' || !parseCanonicalId('decision', decision.id).ok) {
    return invalid('invalid-authorizer', 'Evidence requires an exact qualified Decision reference.');
  }
  if (!['accepted', 'addressed'].includes(acceptedStatus) || !isCaptureLocator(decisionCapture)
    || typeof decisionDigest !== 'string' || !/^[0-9a-f]{64}(?![\s\S])$/.test(decisionDigest)) {
    return invalid('invalid-review', 'Review requires accepted status, a captured Decision locator and exact digest.');
  }
  if (!Array.isArray(captures) || captures.some((item) => !isCaptureLocator(item?.capture))) {
    return invalid('invalid-evidence', 'Decision captures must contain exact capture locators.');
  }
  const matches = captures.filter((item) => canonicalSha256(item.capture) === canonicalSha256(decisionCapture));
  if (matches.length === 0) return { status: 'unavailable', diagnostics: [] };
  if (matches.length !== 1) return invalid('ambiguous-evidence', 'Decision evidence is supplied more than once.');
  const { bytes, objectFormat } = matches[0];
  if (!verifyCapturedBytes({ locator: decisionCapture, bytes, objectFormat }).ok) {
    return invalid('evidence-digest-mismatch', 'Supplied Decision bytes do not match the review capture.');
  }
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch (error) {
    if (error.code !== 'ERR_ENCODING_INVALID_ENCODED_DATA') throw error;
    return invalid('invalid-evidence', 'Captured Decision bytes are not valid UTF-8.');
  }
  let document;
  try { document = load(text); }
  catch (error) {
    if (!(error instanceof YAMLException)) throw error;
    return invalid('invalid-evidence', 'Captured Decision bytes are not valid YAML.');
  }
  budget?.guard(document, 'parsed-decision');
  const records = Array.isArray(document?.entries) ? document.entries.filter((record) => record?.id === decision.id) : [];
  if (records.length !== 1 || records[0].status !== acceptedStatus || canonicalSha256(records[0]) !== decisionDigest) {
    return invalid('invalid-authorizer-evidence', 'Captured Decision must match the accepted review-time authorizer.');
  }
  return { status: 'verified', diagnostics: [] };
}
