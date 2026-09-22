/** Inspect declared bindings against captured navigation inputs, never approval. */
import { validateIntentPlan } from './intent-plan.js';
import { canonicalSha256 } from './canonical-json.js';
import { indexSubjects, lookupSubjects, SubjectError } from './subjects.js';
import { resolveRecord } from './record-identity-index.js';
import { IdentityOperationError, isIdentityUuid, parseCanonicalId, parseProposalKey } from './record-identity.js';

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const shape = (value, fields) => object(value) && Reflect.ownKeys(value).length === fields.length
  && fields.every(key => Object.hasOwn(value, key));
const unavailable = reason => ({ status: 'unavailable', reason });
const invalidContext = reason => ({ status: 'invalid-context', reason });

function captureSubjects(document) {
  if (document === undefined) return { problem: unavailable('subject-document-unavailable') };
  // Digest and derived lookup must share the same detached document. Caller maps
  // are neither accepted nor trusted; indexSubjects owns the lookup algorithm.
  let documentSha256;
  try {
    document = structuredClone(document);
    documentSha256 = canonicalSha256(document);
  }
  catch (error) {
    if (!(error instanceof TypeError) && error.name !== 'DataCloneError') throw error;
    return { problem: invalidContext('invalid-subject-document') };
  }
  const indexed = indexSubjects(document);
  if (!indexed.ok) return { problem: { ...invalidContext('invalid-subject-document'), diagnostics: indexed.diagnostics } };
  const { registry } = indexed;
  return { registry, captured: { namespace: registry.namespace, revision: registry.revision,
    hierarchyRevision: registry.hierarchyRevision, normalizerVersion: registry.normalizerVersion, documentSha256 } };
}

function inspectSubjectTarget(target, subjects) {
  if (!shape(target, ['namespace', 'kind', 'id']) || !isIdentityUuid(target.namespace)
    || (!parseCanonicalId('subject', target.id).ok && !parseProposalKey('subject', target.id).ok)) {
    return { status: 'invalid', reason: 'invalid-ref', ref: target };
  }
  if (subjects.problem) return subjects.problem;
  if (target.namespace !== subjects.registry.namespace) return { status: 'invalid', reason: 'namespace-mismatch', ref: target };
  const subject = subjects.registry.subjects.get(target.id) ?? subjects.registry.proposals.get(target.id);
  return subject ? { status: 'loaded', ref: target, subject }
    : { status: 'missing', ref: target };
}

function inspectRecordTarget(target, identityIndex) {
  if (identityIndex === undefined) return unavailable('identity-index-unavailable');
  try { return resolveRecord(identityIndex, target); }
  catch (error) {
    if (!(error instanceof IdentityOperationError)) throw error;
    return { ...invalidContext(error.code), details: error.details };
  }
}

function inspectLookup(binding, subjects, requests) {
  if (subjects.problem) return subjects.problem;
  if (!object(requests) || !Object.hasOwn(requests, binding.sourceRef)) return unavailable('lookup-request-unavailable');
  const request = requests[binding.sourceRef];
  if (!shape(request, ['text', 'options', 'expected'])
    || !object(request.options)
    || !shape(request.expected, ['namespace', 'revision', 'normalizerVersion', 'documentSha256'])
    || !isIdentityUuid(request.expected.namespace)
    || ![request.expected.revision, request.expected.normalizerVersion].every(n => Number.isSafeInteger(n) && n >= 0)
    || typeof request.expected.documentSha256 !== 'string' || request.expected.documentSha256.length !== 64
    || !/^[a-f0-9]{64}$/.test(request.expected.documentSha256)) {
    return invalidContext('invalid-lookup-request');
  }
  let witness;
  try { witness = lookupSubjects(subjects.registry, request.text, request.options); }
  catch (error) {
    if (!(error instanceof SubjectError)) throw error;
    return invalidContext(error.code);
  }
  const { captured } = subjects;
  const stale = Object.keys(request.expected).some(key => request.expected[key] !== captured[key]);
  return { status: stale ? 'stale-context' : 'available', text: request.text, options: request.options,
    expected: request.expected, captured,
    candidates: witness.matches.map(({ id, ...candidate }) => ({
      ref: { namespace: captured.namespace, kind: 'subject', id }, ...candidate,
    })) };
}

/**
 * Inspect a structural plan using the actual identity and subject lookup owners.
 * `subjectDocument` is full captured JSON, not a derived registry or live reader.
 * Each `lookupRequests[sourceRef]` supplies exact text/options and expected
 * namespace, revision, normalizerVersion and canonical documentSha256.
 * `identityIndex` is the opaque result of P1 buildIdentityIndex. It provides
 * captured identity navigation only; no record label lookup proof is invented.
 *
 * A supported basis means that this rerun witnesses the declared preferred label
 * and match kind. It authenticates neither the original lookup nor governance,
 * source evidence, intent completeness, lifecycle eligibility or query meaning.
 * @param {unknown} plan
 * @param {{subjectDocument?: object, lookupRequests?: object, identityIndex?: object}} [context]
 */
export function inspectIntentBindings(plan, context = {}) {
  const planValidation = validateIntentPlan(plan);
  const result = { version: 1, inspectionScope: 'captured-navigation-only', planValidation,
    queryValidation: 'not-run', governanceValidation: 'not-run', bindings: [] };
  if (!planValidation.valid) return result;
  const bindings = planValidation.handoff.bindings;
  const subjects = bindings.some(binding => binding.target.kind === 'subject')
    ? captureSubjects(context?.subjectDocument) : null;
  for (const binding of bindings) {
    const isSubject = binding.target.kind === 'subject';
    const target = isSubject ? inspectSubjectTarget(binding.target, subjects)
      : inspectRecordTarget(binding.target, context?.identityIndex);
    const lookup = isSubject ? inspectLookup(binding, subjects, context?.lookupRequests)
      : unavailable('record-label-lookup-not-supported');
    let basisCheck = binding.basis === 'inference' ? 'inference' : 'not-run';
    if (binding.basis !== 'inference' && lookup.status === 'available') {
      const matched = lookup.candidates.find(candidate => candidate.ref.id === binding.target.id
        && candidate.ref.namespace === binding.target.namespace);
      basisCheck = target.status === 'loaded' && matched?.label === binding.label
        && matched.matches.some(match => match.kind === binding.basis) ? 'supported' : 'unsupported';
    }
    result.bindings.push({ key: binding.key, sourceRef: binding.sourceRef, claim: binding, target, lookup, basisCheck });
  }
  // Consumers may annotate inspection output without editing captured inputs.
  return structuredClone(result);
}
