/** Closed K/O/D owner input; retained Buffer evidence uses the existing canonical wire. */
import { canonicalSha256, CapturedInputError } from './canonical-json.js';
import { isCaptureLocator } from './capture-locator.js';
import { isIdentityUuid, parseCanonicalId, parseProposalKey } from './record-identity.js';
import { isCalendarDate } from './iso-date.js';
import { lifecycleMaterialPresent } from './subject-lifecycle-input.js';
import { createSubjectValidationBudget } from './subject-validation-budget.js';
import { admitLifecycleCaptureEvidence, decodeLifecycleCaptureEvidence } from './subject-capture-admission.js';
import { SubjectError } from './subject-error.js';

const closed = (v, keys) => v !== null && typeof v === 'object' && [Object.prototype, null].includes(Object.getPrototypeOf(v))
  && Reflect.ownKeys(v).length === keys.length && keys.every((key) => {
    const field = Object.getOwnPropertyDescriptor(v, key); return field?.enumerable && Object.hasOwn(field, 'value');
  });
const dense = (v) => Array.isArray(v) && Object.getPrototypeOf(v) === Array.prototype
  && Reflect.ownKeys(v).length === v.length + 1 && Array.from({ length: v.length }, (_, i) => {
    const field = Object.getOwnPropertyDescriptor(v, String(i)); return field?.enumerable && Object.hasOwn(field, 'value');
  }).every(Boolean);
const text = (v) => typeof v === 'string' && v === v.trim() && v.length > 0 && !/[\x00-\x1f\x7f]/.test(v);
const oid = (v) => typeof v === 'string' && /^(?:[0-9a-f]{40}|[0-9a-f]{64})(?![\s\S])/.test(v);
const descriptor = (v) => closed(v, ['commit', 'tree', 'kitPath']) && oid(v.commit) && oid(v.tree)
  && v.commit.length === v.tree.length && ['.', 'unknown-knowledge'].includes(v.kitPath);
const locator = (v, requiredSource = false) => {
  const source = v !== null && typeof v === 'object' && Object.hasOwn(v, 'source');
  return (!requiredSource || source) && closed(v, ['file', 'blob', 'sha256', ...(source ? ['source'] : [])])
    && (!source || (closed(v.source, ['commit', 'tree']) && oid(v.source.commit) && oid(v.source.tree))) && isCaptureLocator(v);
};
const capture = (v) => closed(v, ['capture', 'bytes', 'objectFormat']) && locator(v.capture)
  && Buffer.isBuffer(v.bytes) && ['sha1', 'sha256'].includes(v.objectFormat);
const copyCapture = (v) => ({ capture: structuredClone(v.capture), bytes: Buffer.from(v.bytes), objectFormat: v.objectFormat });
const wireCapture = (v) => ({ capture: structuredClone(v.capture), bytesBase64: Buffer.prototype.toString.call(v.bytes, 'base64'), objectFormat: v.objectFormat });
const groups = {
  promotion: ['maxFiles', 'maxFileBytes', 'maxSourceBytes', 'maxPromotions'],
  assignments: ['maxRecords', 'maxCaptureBytes', 'maxRedirects'],
  governance: ['maxCaptureBytes', 'maxDocumentNodes', 'maxDocumentTextUnits', 'maxSubjects', 'maxHistoryRows', 'maxValidationSteps'],
  reach: ['maxHierarchyNodes', 'maxHierarchyEdges', 'maxRecords'], views: ['version', 'maxViews'],
  replays: ['version', 'maxSubjects', 'maxEligibilityRedirects', 'maxCases', 'maxInventoryBytes'],
  query: ['version', 'maxAstNodes', 'maxAstDepth', 'maxHierarchyNodes', 'maxHierarchyEdges', 'maxRedirects', 'maxRecords',
    'maxPredicateSteps', 'maxResultsPerStore', 'maxExplanationNodes'],
};
const capacities = (v, keys, min = 0) => closed(v, keys) && keys.every((key) => key === 'version'
  ? v[key] === 1 : Number.isSafeInteger(v[key]) && v[key] >= min);

/** Canonical semantic input only; admission is separate and must precede use. */
export function recordPromotionInputWire(input) {
  const { repoRoot, evidence, ...semantic } = input;
  return { ...structuredClone(semantic), evidence: { decisionCaptures: evidence.decisionCaptures.map(wireCapture),
    assessmentCaptures: evidence.assessmentCaptures.map(({ registry, identity }) => ({ registry: wireCapture(registry), identity: wireCapture(identity) })),
    ...(Object.hasOwn(evidence, 'materialCaptures') ? { materialCaptures: evidence.materialCaptures.map(wireCapture) } : {}) } };
}

export function admitRecordPromotionInput(input) {
  return lifecycleMaterialPresent(input) ? admitContinued(input, false) : admit(input);
}

/** Fixed wire admission; workers pass this owned result directly to the typed owner. */
export function admitContinuedRecordPromotionWire(repoRoot, wire) {
  return admitContinued(wire, true, repoRoot);
}

function admitContinued(input, wire, repoRoot) {
  let budget = null;
  const field = (value, key) => {
    if (value === null || typeof value !== 'object' || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
      throw new SubjectError('invalid-record-promotion-input', 'Expected own plain promotion data.');
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) {
      throw new SubjectError('invalid-record-promotion-input', 'Expected own enumerable promotion data.');
    }
    return descriptor.value;
  };
  try {
    const governance = field(field(input, 'limits'), 'governance');
    if (!closed(governance, groups.governance)) throw new SubjectError('invalid-record-promotion-input', 'Supply all governance limits.');
    budget = createSubjectValidationBudget(Object.fromEntries(groups.governance.map(key => [key, field(governance, key)])));
    const keys = ['version', 'kind', 'before', 'candidate', 'publication', 'promotion', 'eventId', 'reviewNote', 'today', 'evidence', 'limits', 'impact', ...(wire ? [] : ['repoRoot'])];
    if (Reflect.ownKeys(input).length !== keys.length) throw new SubjectError('invalid-record-promotion-input', 'Unexpected promotion fields.');
    const metadata = {};
    for (const key of keys) if (key !== 'evidence') metadata[key] = field(input, key);
    budget.guard(metadata, 'record-promotion-continuation-input');
    const evidence = (wire ? decodeLifecycleCaptureEvidence : admitLifecycleCaptureEvidence)(field(input, 'evidence'), budget);
    const owned = { ...structuredClone(metadata), ...(wire ? { repoRoot } : {}), evidence };
    return { ...admit(owned, budget), continuation: { operationBudget: budget } };
  } catch (error) {
    if (!(error instanceof SubjectError || error instanceof CapturedInputError)) throw error;
    return { ok: false, input: null, inputDigest: null, continuation: { operationBudget: budget },
      diagnostics: [{ code: error.code, path: '', message: error.message }] };
  }
}

function admit(input, operationBudget = null) {
  const fail = () => ({ ok: false, input: null, inputDigest: null, diagnostics: [{ code: 'invalid-record-promotion-input', path: '',
    message: 'Supply the closed K/O/D promotion input, actual capture evidence and every explicit capacity.' }] });
  if (!closed(input, ['version', 'kind', 'repoRoot', 'before', 'candidate', 'publication', 'promotion', 'eventId', 'reviewNote', 'today', 'evidence', 'limits', 'impact'])
    || input.version !== 1 || !['ontology', 'knowledge', 'decision'].includes(input.kind) || !text(input.repoRoot) || !descriptor(input.before) || !descriptor(input.candidate)
    || !closed(input.publication, ['id', 'review']) || !isIdentityUuid(input.publication.id) || !text(input.publication.review)
    || !isIdentityUuid(input.eventId) || !isCalendarDate(input.today)
    || !closed(input.reviewNote, ['date', 'author', 'skill']) || !isCalendarDate(input.reviewNote.date)
    || !['author', 'skill'].every((key) => text(input.reviewNote[key]) && input.reviewNote[key].length <= 160)) return fail();
  const { promotion, evidence, limits, impact } = input;
  if (!closed(promotion, ['version', 'rows']) || promotion.version !== 1 || !dense(promotion.rows) || !promotion.rows.length
    || !closed(evidence, ['decisionCaptures', 'assessmentCaptures', ...(operationBudget ? ['materialCaptures'] : [])]) || !dense(evidence.decisionCaptures) || !evidence.decisionCaptures.every(capture)
    || !dense(evidence.assessmentCaptures) || !evidence.assessmentCaptures.every((v) => closed(v, ['registry', 'identity']) && capture(v.registry) && capture(v.identity))
    || !closed(limits, [...Object.keys(groups), 'tree']) || !Object.entries(groups).every(([name, keys]) => capacities(limits[name], keys, name === 'promotion' ? 1 : 0))
    || limits.promotion.maxFileBytes > 64 * 1024 * 1024 || promotion.rows.length > limits.promotion.maxPromotions
    || !closed(limits.tree, ['budget', 'maxBytes']) || !capacities(limits.tree.budget, ['nodes', 'edges', 'rows'])
    || !Number.isSafeInteger(limits.tree.maxBytes) || limits.tree.maxBytes < 0 || limits.query.maxAstNodes < 1 || limits.query.maxAstDepth < 1
    || !closed(impact, ['version', 'policy', 'routes']) || impact.version !== 1 || impact.policy !== 'typed-record-promotion-v3'
    || !closed(impact.routes, ['kind']) || impact.routes.kind !== 'runtime-capability') return fail();
  const proposals = new Set(); const refs = new Set();
  for (const row of promotion.rows) {
    if (!closed(row, ['proposalRef', 'canonicalRef', 'targetLifecycle', 'beforeCapture'])
      || !closed(row.proposalRef, ['namespace', 'kind', 'key']) || row.proposalRef.kind !== input.kind
      || !isIdentityUuid(row.proposalRef.namespace) || !parseProposalKey(input.kind, row.proposalRef.key).ok
      || !closed(row.canonicalRef, ['namespace', 'kind', 'id']) || row.canonicalRef.kind !== input.kind
      || !isIdentityUuid(row.canonicalRef.namespace) || !parseCanonicalId(input.kind, row.canonicalRef.id).ok
      || row.targetLifecycle !== ({ ontology: 'active', knowledge: 'verified', decision: 'accepted' }[input.kind]) || !locator(row.beforeCapture, true)
      || proposals.has(row.proposalRef.key) || refs.has(row.canonicalRef.id)) return fail();
    proposals.add(row.proposalRef.key); refs.add(row.canonicalRef.id);
  }
  try {
    const { evidence: ignoredEvidence, ...semantic } = input;
    const detached = operationBudget ? input : { ...structuredClone(semantic), evidence: { decisionCaptures: evidence.decisionCaptures.map(copyCapture),
      assessmentCaptures: evidence.assessmentCaptures.map(({ registry, identity }) => ({ registry: copyCapture(registry), identity: copyCapture(identity) })) } };
    return { ok: true, input: detached, inputDigest: canonicalSha256(recordPromotionInputWire(detached)), diagnostics: [] };
  } catch (error) { if (!(error instanceof CapturedInputError)) throw error; return fail(); }
}
