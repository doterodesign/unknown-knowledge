/** Fixed parsed-JSON continuation report binding; fresh owner proves sources. */
import { isDeepStrictEqual as same } from 'node:util';
import { canonicalSha256, CapturedInputError } from './canonical-json.js';
import { isCaptureLocator } from './capture-locator.js';
import { isIdentityUuid, parseCanonicalId } from './record-identity.js';
import { canonicalBase64DecodedLength } from './canonical-base64.js';

const closed = (value, keys) => value !== null && typeof value === 'object'
  && [Object.prototype, null].includes(Object.getPrototypeOf(value))
  && Reflect.ownKeys(value).length === keys.length && keys.every(key => {
    const field = Object.getOwnPropertyDescriptor(value, key);
    return field?.enumerable && Object.hasOwn(field, 'value');
  });
function dense(value) {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype
    || Reflect.ownKeys(value).length !== value.length + 1) return false;
  for (let index = 0; index < value.length; index++) {
    const field = Object.getOwnPropertyDescriptor(value, String(index));
    if (!field?.enumerable || !Object.hasOwn(field, 'value')) return false;
  }
  return true;
}
const whole = value => Number.isSafeInteger(value) && value >= 0;
const hash = value => typeof value === 'string' && /^[0-9a-f]{64}(?![\s\S])/.test(value);
const counters = ['captureBytes', 'documentNodes', 'documentTextUnits', 'subjects', 'historyRows', 'validationSteps'];
const limitName = counter => `max${counter[0].toUpperCase()}${counter.slice(1)}`;
const checks = ['models', 'source', 'scope', 'history', 'captures', 'eligibility', 'preservation', 'authorizer',
  'impactPolicy', 'candidateCommitMembership', 'humanApproval'];
const descriptor = value => closed(value, ['commit', 'tree', 'kitPath'])
  && typeof value.commit === 'string' && [40, 64].includes(value.commit.length)
  && typeof value.tree === 'string' && value.tree.length === value.commit.length
  && /^[0-9a-f]+(?![\s\S])/.test(value.commit) && /^[0-9a-f]+(?![\s\S])/.test(value.tree)
  && ['.', 'unknown-knowledge'].includes(value.kitPath);

function captureSize(value) {
  if (!closed(value, ['capture', 'bytesBase64', 'objectFormat']) || !isCaptureLocator(value.capture)
    || !['sha1', 'sha256'].includes(value.objectFormat) || value.capture.blob.length !== (value.objectFormat === 'sha1' ? 40 : 64)) return null;
  return canonicalBase64DecodedLength(value.bytesBase64);
}

/** Original retained wire is required; this predicate never decodes or recaptures.
 * Counter bounds are plausibility checks, not proof of historical measured work.
 * Actual source semantics and fresh measured usage require the native owner.
 */
export function isPreparedAssignmentContinuationReport(value, expected) {
  return assignmentContinuationReport(value, expected, false);
}

function assignmentContinuationReport(value, expected, typed) {
  const input = expected?.operationInputs, continuation = input?.continuation;
  if (!descriptor(expected?.source) || !descriptor(expected?.candidate)
    || !closed(input, ['eventId', 'reviewNote', 'decisionCaptures', 'limits', 'impact', 'maxEventBytes', 'continuation', ...(typed ? ['selection'] : [])])
    || !isIdentityUuid(input.eventId) || !closed(continuation, ['version', 'assessmentCaptures', 'materialCaptures', 'limits'])
    || continuation.version !== 1 || !closed(continuation.limits, ['governance'])
    || !closed(continuation.limits.governance, counters.map(limitName))
    || !Object.values(continuation.limits.governance).every(whole)
    || !dense(input.decisionCaptures) || !dense(continuation.assessmentCaptures) || !dense(continuation.materialCaptures)
    || !continuation.assessmentCaptures.every(pair => closed(pair, ['registry', 'identity']))
    || !closed(value, ['version', 'ok', 'mode', 'publicationReady', 'inputs', 'eventSource', 'scope', 'checks',
      'rows', 'optionalImpact', 'used', 'diagnostics', 'continuation'])
    || value.version !== 2 || typeof value.ok !== 'boolean' || value.mode !== 'read-only-prepared-assignment'
    || value.publicationReady !== false || !closed(value.continuation, ['version', 'inputDigest', 'governance'])
    || value.continuation.version !== 1 || !closed(value.checks, checks)
    || !checks.every(key => ['passed', 'failed', 'not-performed'].includes(value.checks[key]?.status))
    || value.checks.humanApproval.status !== 'not-performed' || !dense(value.rows) || !dense(value.diagnostics)
    || !closed(value.optionalImpact, ['routes', 'regeneratedViews', 'representativeReplays'])) return false;
  // This consumes parsed worker/retained JSON, not executable caller objects.
  // Native recursive encoding failure is confined to these exact encodings.
  let digest;
  try {
    canonicalSha256(value);
    digest = canonicalSha256({ version: 1, decisionCaptures: input.decisionCaptures, continuation });
  } catch (error) {
    if (!(error instanceof CapturedInputError || error instanceof RangeError)) throw error;
    return false;
  }
  let bytes = 0;
  for (const capture of [...input.decisionCaptures, ...continuation.assessmentCaptures.flatMap(pair => [pair.registry, pair.identity]),
    ...continuation.materialCaptures]) {
    const size = captureSize(capture);
    if (size === null || !Number.isSafeInteger(bytes + size)) return false;
    bytes += size;
  }
  const report = value.continuation;
  if (report.inputDigest !== null && report.inputDigest !== digest) return false;
  if (value.inputs !== null && !same(value.inputs, { before: { kind: 'commit', ...expected.source },
    candidate: { kind: 'commit', ...expected.candidate } })) return false;
  if (report.governance !== null) {
    const governance = report.governance;
    if (!closed(governance, ['used', 'failure']) || !closed(governance.used, [...counters, 'relevantRefusalRows'])
      || !Object.values(governance.used).every(whole)
      || !counters.every(key => governance.used[key] <= continuation.limits.governance[limitName(key)])
      || governance.used.relevantRefusalRows > governance.used.validationSteps
      || !(governance.failure === null || (closed(governance.failure, ['code', 'message', 'counter', 'phase', 'attempted', 'remaining'])
        && governance.failure.code === 'subject-validation-budget' && counters.includes(governance.failure.counter)
        && typeof governance.failure.message === 'string' && typeof governance.failure.phase === 'string'
        && whole(governance.failure.attempted) && whole(governance.failure.remaining)))) return false;
  }
  if (!value.ok) return value.diagnostics.length > 0;
  if (report.inputDigest !== digest || !report.governance || report.governance.failure !== null
    || report.governance.used.captureBytes < bytes || report.governance.used.documentNodes === 0
    || report.governance.used.validationSteps === 0 || value.inputs === null || value.diagnostics.length
    || !checks.filter(key => key !== 'humanApproval').every(key => value.checks[key].status === 'passed')
    || value.scope?.status !== 'complete' || !dense(value.scope.refs) || !dense(value.scope.historicalRefs)
    || !closed(value.used, [typed ? 'selectedRecords' : 'allocatedKnowledge', 'captureBytes', 'redirects']) || !Object.values(value.used).every(whole)
    || !closed(input.limits, ['maxRecords', 'maxCaptureBytes', 'maxRedirects']) || !Object.values(input.limits).every(whole)
    || value.used[typed ? 'selectedRecords' : 'allocatedKnowledge'] > input.limits.maxRecords || value.used.captureBytes > input.limits.maxCaptureBytes
    || value.used.redirects > input.limits.maxRedirects) return false;
  const source = value.eventSource;
  if (!closed(source, ['file', 'eventId', 'eventDigest', 'candidate']) || source.eventId !== input.eventId
    || !hash(source.eventDigest) || !same(source.candidate, expected.candidate)
    || source.file !== `${expected.candidate.kitPath === '.' ? '' : `${expected.candidate.kitPath}/`}subjects/_assignments/${input.eventId}.yaml`) return false;
  const ref = item => closed(item, ['namespace', 'kind', 'id']) && isIdentityUuid(item.namespace)
    && (typed ? ['knowledge', 'ontology', 'decision'].includes(item.kind) : item.kind === 'knowledge') && parseCanonicalId(item.kind, item.id).ok;
  if (!value.scope.refs.every(ref) || !value.scope.historicalRefs.every(ref)
    || value.rows.length !== value.scope.refs.length) return false;
  const rowKeys = value.rows.map(row => JSON.stringify(row.ref));
  return new Set(rowKeys).size === rowKeys.length && value.rows.every(row => closed(row, ['ref', 'eligibility', 'preservation'])
    && ref(row.ref) && value.scope.refs.some(item => same(item, row.ref)) && row.eligibility?.ok === true
    && row.eligibility.publicationReady === false && row.preservation?.ok === true);
}


/** Typed parsed-report binding. Original selection is never inferred from event rows. */
export function isPreparedTypedAssignmentReport(value, expected) {
  const input = expected?.operationInputs;
  if (!input || !validTypedAssignmentSelection(input.selection)) return false;
  if (Object.hasOwn(input, 'continuation')) {
    if (!assignmentContinuationReport(value, expected, true)) return false;
  } else {
    if (!closed(input, ['eventId', 'reviewNote', 'decisionCaptures', 'limits', 'impact', 'maxEventBytes', 'selection'])
      || !closed(value, ['version', 'ok', 'mode', 'publicationReady', 'inputs', 'eventSource', 'scope', 'checks', 'rows', 'optionalImpact', 'used', 'diagnostics'])
      || value.version !== 1 || typeof value.ok !== 'boolean' || value.publicationReady !== false
      || value.mode !== 'read-only-prepared-assignment' || !dense(value.rows) || !dense(value.diagnostics)
      || !closed(value.checks, checks) || value.checks.humanApproval.status !== 'not-performed'
      || !closed(value.used, ['selectedRecords', 'captureBytes', 'redirects']) || !Object.values(value.used).every(whole)) return false;
    if (value.inputs !== null && !same(value.inputs, { before: { kind: 'commit', ...expected.source }, candidate: { kind: 'commit', ...expected.candidate } })) return false;
    if (!value.ok) return value.diagnostics.length > 0;
    if (!checks.filter(key => key !== 'humanApproval').every(key => value.checks[key].status === 'passed')
      || !closed(input.limits, ['maxRecords', 'maxCaptureBytes', 'maxRedirects'])
      || value.used.selectedRecords > input.limits.maxRecords || value.used.captureBytes > input.limits.maxCaptureBytes
      || value.used.redirects > input.limits.maxRedirects || value.diagnostics.length) return false;
  }
  if (!value.ok) return true;
  if (value.scope?.status !== 'complete' || value.scope.basis !== 'reviewed-typed-existing-records'
    || !same(value.scope.refs, input.selection.refs) || !dense(value.scope.historicalRefs) || value.scope.historicalRefs.length
    || value.rows.length !== input.selection.refs.length || value.used.selectedRecords !== input.selection.refs.length
    || !value.rows.every((row, index) => same(row.ref, input.selection.refs[index]) && row.eligibility?.ok === true && row.preservation?.ok === true)
    || !closed(value.eventSource, ['file', 'eventId', 'eventDigest', 'candidate']) || value.eventSource.eventId !== input.eventId
    || !same(value.eventSource.candidate, expected.candidate) || !hash(value.eventSource.eventDigest)
    || value.eventSource.file !== `${expected.candidate.kitPath === '.' ? '' : `${expected.candidate.kitPath}/`}subjects/_assignments/${input.eventId}.yaml`) return false;
  return value.optionalImpact?.representativeReplays?.policy?.id === 'typed-assignment-replay-v1'
    && value.optionalImpact.representativeReplays.policy.version === 1 && hash(value.optionalImpact.representativeReplays.policy.digest);
}

export function validTypedAssignmentSelection(selection) {
  return closed(selection, ['kind', 'refs']) && selection.kind === 'typed-records' && dense(selection.refs) && selection.refs.length > 0
    && selection.refs.every(ref => closed(ref, ['namespace', 'kind', 'id']) && isIdentityUuid(ref.namespace)
      && ['knowledge', 'ontology', 'decision'].includes(ref.kind) && parseCanonicalId(ref.kind, ref.id).ok)
    && new Set(selection.refs.map(ref => JSON.stringify([ref.namespace, ref.kind, ref.id]))).size === selection.refs.length;
}
