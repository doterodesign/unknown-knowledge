/** Shared capture transport and closed admission for fixed Subject lifecycles. */
import { canonicalSha256, CapturedInputError } from './canonical-json.js';
import { isCaptureLocator } from './capture-locator.js';
import { isIdentityUuid, parseCanonicalId, parseProposalKey } from './record-identity.js';
import { SubjectError } from './subject-error.js';
import { createSubjectValidationBudget } from './subject-validation-budget.js';
import { admitLifecycleCaptureEvidence, decodeLifecycleCaptureEvidence } from './subject-capture-admission.js';
import { isCalendarDate } from './iso-date.js';

const closed = (value, keys) => value !== null && typeof value === 'object'
  && [Object.prototype, null].includes(Object.getPrototypeOf(value))
  && Reflect.ownKeys(value).length === keys.length
  && keys.every((key) => Object.hasOwn(Object.getOwnPropertyDescriptor(value, key) ?? {}, 'value'));
const dense = (value) => Array.isArray(value) && Reflect.ownKeys(value).length === value.length + 1
  && Array.from({ length: value.length }, (_, i) => Object.hasOwn(Object.getOwnPropertyDescriptor(value, String(i)) ?? {}, 'value')).every(Boolean);
const text = (value) => typeof value === 'string' && value.trim().length > 0;
const hash = (value) => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
const id = (value) => parseCanonicalId('subject', value).ok;
const groups = {
  inventory: ['maxRecordVisits', 'maxRegistryReferenceVisits', 'maxHierarchyNodes', 'maxHierarchyEdges'],
  governance: ['maxCaptureBytes', 'maxDocumentNodes', 'maxDocumentTextUnits', 'maxSubjects', 'maxHistoryRows', 'maxValidationSteps'],
  assignments: ['maxRecords', 'maxCaptureBytes', 'maxRedirects'],
  reach: ['maxHierarchyNodes', 'maxHierarchyEdges', 'maxRecords'], views: ['version', 'maxViews'],
  replays: ['version', 'maxSubjects', 'maxEligibilityRedirects', 'maxCases', 'maxInventoryBytes'],
  query: ['version', 'maxAstNodes', 'maxAstDepth', 'maxHierarchyNodes', 'maxHierarchyEdges', 'maxRedirects',
    'maxRecords', 'maxPredicateSteps', 'maxResultsPerStore', 'maxExplanationNodes'],
};
const capacities = (value, fields) => closed(value, fields) && fields.every((key) => key === 'version'
  ? value[key] === 1 : Number.isSafeInteger(value[key]) && value[key] >= 0);
const descriptor = (value) => closed(value, ['commit', 'tree', 'kitPath'])
  && typeof value.commit === 'string' && /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(value.commit)
  && typeof value.tree === 'string' && value.tree.length === value.commit.length && /^[0-9a-f]+$/.test(value.tree)
  && typeof value.kitPath === 'string' && (value.kitPath === '.' || (value.kitPath.length > 0
    && !/[\\\0]/.test(value.kitPath) && !/^[A-Za-z]:/.test(value.kitPath)
    && value.kitPath.split('/').every((part) => part && part !== '.' && part !== '..')));
const event = (value) => closed(value, ['id', 'changeDigest']) && isIdentityUuid(value.id) && hash(value.changeDigest);
const capture = (value) => closed(value, ['capture', 'bytes', 'objectFormat']) && isCaptureLocator(value.capture)
  && Buffer.isBuffer(value.bytes) && ['sha1', 'sha256'].includes(value.objectFormat);
const wireCapture = ({ capture: locator, bytes, objectFormat }) => ({ capture: structuredClone(locator), bytesBase64: bytes.toString('base64'), objectFormat });
const copyCapture = ({ capture: locator, bytes, objectFormat }) => ({ capture: structuredClone(locator), bytes: Buffer.from(bytes), objectFormat });

/** Existing canonical capture transport, with only the host checkout coordinate excluded. */
export function subjectLifecycleInputWire(input) {
  const { repoRoot, evidence, ...semantic } = input;
  return { version: 1, ...structuredClone(semantic), evidence: {
    decisionCaptures: evidence.decisionCaptures.map(wireCapture),
    assessmentCaptures: evidence.assessmentCaptures.map(({ registry, identity }) => ({ registry: wireCapture(registry), identity: wireCapture(identity) })),
    ...(Object.hasOwn(evidence, 'materialCaptures') ? { materialCaptures: evidence.materialCaptures.map(wireCapture) } : {}),
  } };
}

function retainedUnknown(row) {
  const proposal = Object.hasOwn(row ?? {}, 'proposalRef');
  const field = proposal ? 'proposalRef' : 'ref';
  if (!closed(row, [field, 'reason']) || !text(row.reason)) return false;
  const ref = row[field];
  return closed(ref, ['namespace', 'kind', proposal ? 'key' : 'id']) && isIdentityUuid(ref.namespace)
    && ['knowledge', 'ontology', 'decision'].includes(ref.kind)
    && (proposal ? parseProposalKey(ref.kind, ref.key).ok : parseCanonicalId(ref.kind, ref.id).ok);
}

const ref = (value) => closed(value, ['namespace', 'kind', 'id']) && isIdentityUuid(value.namespace)
  && ['knowledge', 'ontology', 'decision'].includes(value.kind) && parseCanonicalId(value.kind, value.id).ok;
const ownerKey = (row) => { const value = row.ref ?? row.proposalRef; return JSON.stringify([value.namespace, value.kind, value.id ?? value.key]); };
const ordered = (rows, key) => rows.every((row, index) => index === 0 || key(rows[index - 1]) < key(row));

function retirementOperation(operation) {
  return closed(operation, ['version', 'id', 'action', 'subject', 'registryEvents', 'assignmentEvent',
    'retainedUnknowns', 'retainedHistoricalUses', 'retainedParents', 'retainedInheritedUses'])
    && operation.action === 'retire' && id(operation.subject)
    && (operation.assignmentEvent === null || event(operation.assignmentEvent))
    && dense(operation.retainedHistoricalUses) && operation.retainedHistoricalUses.every(row =>
      closed(row, ['ref', 'reason']) && ref(row.ref) && text(row.reason))
    && ordered(operation.retainedHistoricalUses, ownerKey)
    && dense(operation.retainedParents) && operation.retainedParents.every(row =>
      closed(row, ['child', 'parent', 'reason']) && id(row.child) && id(row.parent) && row.child !== row.parent
      && [row.child, row.parent].includes(operation.subject) && text(row.reason))
    && ordered(operation.retainedParents, row => JSON.stringify([row.child, row.parent]))
    && dense(operation.retainedInheritedUses) && operation.retainedInheritedUses.every(row =>
      closed(row, ['ref', 'assignedSubject', 'reason']) && ref(row.ref) && id(row.assignedSubject)
      && row.assignedSubject !== operation.subject && text(row.reason))
    && ordered(operation.retainedInheritedUses, row => JSON.stringify([row.ref.namespace, row.ref.kind, row.ref.id, row.assignedSubject]));
}

/** Split's wire must contain enumerable data, never executable or omitted fields. */
function splitWireData(input) {
  const pending = [input]; const seen = new WeakSet();
  while (pending.length) {
    const value = pending.pop();
    if (value === null || ['string', 'boolean', 'number'].includes(typeof value)) continue;
    if (typeof value !== 'object') return false;
    if (seen.has(value)) continue;
    seen.add(value);
    if (Buffer.isBuffer(value)) {
      if (Object.getPrototypeOf(value) !== Buffer.prototype
        || !Reflect.ownKeys(value).every(key => typeof key === 'string' && /^(?:0|[1-9][0-9]*)$/.test(key))) return false;
      continue;
    }
    const array = Array.isArray(value);
    if (!(array ? Object.getPrototypeOf(value) === Array.prototype
      : [Object.prototype, null].includes(Object.getPrototypeOf(value)))) return false;
    for (const key of Reflect.ownKeys(value)) {
      if (array && key === 'length') continue;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (typeof key !== 'string' || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) return false;
      pending.push(descriptor.value);
    }
  }
  return true;
}

function splitOperation(operation) {
  if (!closed(operation, ['version', 'id', 'action', 'subject', 'successors', 'registryEvents', 'assignmentEvent',
    'mappings', 'retainedUnknowns', 'retainedHistoricalUses', 'retainedParents', 'retainedInheritedUses', 'successorParents'])
    || operation.action !== 'split' || !id(operation.subject)
    || !dense(operation.successors) || operation.successors.length < 2 || !operation.successors.every(id)
    || new Set(operation.successors).size !== operation.successors.length || operation.successors.includes(operation.subject)) return false;
  // Reuse the fixed retention shapes; only the new split fields are projected out.
  const { successors, mappings, successorParents, ...retention } = operation;
  if (!retirementOperation({ ...retention, action: 'retire' }) || !dense(mappings)
    || !mappings.every(row => closed(row, ['ref', 'successors', 'reason']) && ref(row.ref) && text(row.reason)
      && dense(row.successors) && row.successors.every((subject, index) => successors.includes(subject)
        && (index === 0 || successors.indexOf(row.successors[index - 1]) < successors.indexOf(subject))))
    || !ordered(mappings, ownerKey) || (operation.assignmentEvent === null) !== (mappings.length === 0)
    || !dense(successorParents) || successorParents.length !== successors.length
    || !successorParents.every((row, index) => closed(row, ['subject', 'parent', 'reason'])
      && row.subject === successors[index] && text(row.reason)
      && (row.parent === null || (id(row.parent) && row.parent !== row.subject && row.parent !== operation.subject)))) return false;
  return true;
}

/** Closed split entrypoint; model and actual Git proof remain separate owners. */
export function admitSubjectSplitInput(input) {
  return lifecycleMaterialPresent(input) ? admitContinued(input, 'split', false) : admit(input, 'split');
}

/** Existing family entrypoint keeps its original accepted action set. */
export function admitSubjectLifecycleInput(input, action) {
  return ['retire', 'merge-equivalent'].includes(action) && lifecycleMaterialPresent(input) ? admitContinued(input, action, false)
    : admit(input, ['merge-equivalent', 'retire'].includes(action) ? action : null);
}

/** Inspect descriptors only; inherited/accessor selectors cannot fall into the old profile. */
export function lifecycleMaterialPresent(input) {
  if (input === null || typeof input !== 'object') return false;
  const field = Object.getOwnPropertyDescriptor(input, 'evidence');
  if (!field || !Object.hasOwn(field, 'value')) return false;
  const evidence = field.value;
  return evidence !== null && typeof evidence === 'object' && 'materialCaptures' in evidence;
}

/** Fixed wire admission is consumed directly by the retirement owner, never raw-admitted again. */
export function admitContinuedRetirementWire(repoRoot, wire) {
  return admitContinued(wire, 'retire', true, repoRoot);
}

export function admitContinuedSplitWire(repoRoot, wire) {
  return admitContinued(wire, 'split', true, repoRoot);
}

export function admitContinuedMergeWire(repoRoot, wire) {
  return admitContinued(wire, 'merge-equivalent', true, repoRoot);
}

function admitContinued(input, action, wire, repoRoot) {
  let budget = null;
  const field = (value, key) => {
    if (value === null || typeof value !== 'object' || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new SubjectError('invalid-lifecycle-continuation', 'Expected own plain data.');
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) throw new SubjectError('invalid-lifecycle-continuation', 'Expected own enumerable data.');
    return descriptor.value;
  };
  try {
    const governance = field(field(input, 'limits'), 'governance');
    if (governance === null || typeof governance !== 'object'
      || Reflect.ownKeys(governance).length !== groups.governance.length) throw new SubjectError('invalid-lifecycle-continuation', 'Supply every governance limit.');
    budget = createSubjectValidationBudget(Object.fromEntries(groups.governance.map(key => [key, field(governance, key)])));
    const keys = ['before', 'candidate', 'operation', 'reviewNote', 'evidence', 'limits', 'impact', wire ? 'version' : 'repoRoot'];
    if (Reflect.ownKeys(input).length !== keys.length) throw new SubjectError('invalid-lifecycle-continuation', 'Unexpected lifecycle field.');
    const metadata = {};
    for (const key of keys) if (key !== 'evidence') metadata[key] = field(input, key);
    budget.guard(metadata, 'lifecycle-continuation-input');
    if (wire && metadata.version !== 1) throw new SubjectError('invalid-lifecycle-continuation', 'Unsupported wire version.');
    const evidence = (wire ? decodeLifecycleCaptureEvidence : admitLifecycleCaptureEvidence)(field(input, 'evidence'), budget);
    const semantic = structuredClone(metadata); if (wire) { delete semantic.version; semantic.repoRoot = repoRoot; }
    const owned = { ...semantic, evidence };
    const result = admit(owned, action, budget);
    return { ...result, continuation: { operationBudget: budget } };
  } catch (error) {
    if (!(error instanceof SubjectError || error instanceof CapturedInputError)) throw error;
    return { ok: false, input: null, inputDigest: null, continuation: { operationBudget: budget },
      diagnostics: [{ code: error.code, path: '', message: error.message }] };
  }
}

function admit(input, action, continuationBudget = null) {
  const retirement = action === 'retire';
  const split = action === 'split';
  const refused = () => ({ ok: false, input: null, inputDigest: null,
    diagnostics: [{ code: split ? 'invalid-subject-split-input' : retirement ? 'invalid-subject-retirement-input' : 'invalid-equivalent-merge-input', path: '',
      message: split ? 'Supply the closed split input, explicit mappings and parent choices, and every owner capacity.'
        : retirement ? 'Supply the closed retirement input and every explicit owner capacity.'
        : 'Supply the closed first-merge input and every explicit owner capacity.' }] });
  if (!['merge-equivalent', 'retire', 'split'].includes(action) || (split && !continuationBudget && !splitWireData(input))
    || !closed(input, ['repoRoot', 'before', 'candidate', 'operation', 'reviewNote', 'evidence', 'limits', 'impact'])
    || !text(input.repoRoot) || input.repoRoot.includes('\0') || !descriptor(input.before) || !descriptor(input.candidate)) return refused();
  const { operation, reviewNote, evidence, limits, impact } = input;
  if (!(split ? splitOperation(operation) : retirement ? retirementOperation(operation)
    : closed(operation, ['version', 'id', 'action', 'survivor', 'absorbed', 'registryEvents', 'assignmentEvent', 'retainedUnknowns'])
      && operation.action === 'merge-equivalent' && id(operation.survivor)
      && dense(operation.absorbed) && operation.absorbed.length === 1 && id(operation.absorbed[0]) && operation.absorbed[0] !== operation.survivor
      && (operation.assignmentEvent === null || event(operation.assignmentEvent)))
    || operation.version !== 1 || !isIdentityUuid(operation.id)
    || !dense(operation.registryEvents) || operation.registryEvents.length !== (split ? 2 : 1) || !operation.registryEvents.every(event)
    || (split && new Set(operation.registryEvents.map(row => row.id)).size !== 2)
    || !dense(operation.retainedUnknowns) || !operation.retainedUnknowns.every(retainedUnknown)
    || new Set(operation.retainedUnknowns.map((row) => canonicalSha256(row.ref ?? row.proposalRef))).size !== operation.retainedUnknowns.length
    || ((retirement || split) && !ordered(operation.retainedUnknowns, ownerKey))
    || !closed(reviewNote, ['date', 'author', 'skill']) || !isCalendarDate(reviewNote.date)
    || !['author', 'skill'].every((key) => text(reviewNote[key]) && reviewNote[key] === reviewNote[key].trim()
      && reviewNote[key].length <= 160 && !/[\x00-\x1f\x7f]/.test(reviewNote[key]))) return refused();
  const zeroMerge = action === 'merge-equivalent' && operation.assignmentEvent === null;
  if (!closed(evidence, ['decisionCaptures', 'assessmentCaptures', ...(continuationBudget ? ['materialCaptures'] : [])]) || !dense(evidence.decisionCaptures)
    || !evidence.decisionCaptures.every(capture) || !dense(evidence.assessmentCaptures)
    || !evidence.assessmentCaptures.every((pair) => closed(pair, ['registry', 'identity']) && capture(pair.registry) && capture(pair.identity))
    || !closed(limits, [...Object.keys(groups), 'tree', ...(retirement || split || zeroMerge ? ['closure'] : []), ...(split ? ['allocation'] : [])])
    || !Object.entries(groups).every(([name, keys]) => capacities(limits[name], keys))
    || ((retirement || split || zeroMerge) && !capacities(limits.closure, ['maxRows', 'maxBytes']))
    || (split && !capacities(limits.allocation, ['maxLedgerRows', 'maxSuccessors']))
    || !closed(limits.tree, ['budget', 'maxBytes']) || !capacities(limits.tree.budget, ['nodes', 'edges', 'rows'])
    || !Number.isSafeInteger(limits.tree.maxBytes) || limits.tree.maxBytes < 0 || limits.query.maxAstNodes < 1 || limits.query.maxAstDepth < 1
    || !closed(impact, ['version', 'policy', 'routes']) || impact.version !== 1
    || impact.policy !== (split ? 'subject-split-impact-v1' : retirement ? 'plain-retirement-impact-v1' : 'equivalent-merge-impact-v1')
    || !closed(impact.routes, ['kind']) || impact.routes.kind !== 'runtime-capability') return refused();
  try {
    const wire = subjectLifecycleInputWire(input);
    const inputDigest = canonicalSha256(wire);
    const detached = { repoRoot: input.repoRoot, ...structuredClone(wire) };
    delete detached.version;
    detached.evidence = continuationBudget ? evidence : { decisionCaptures: evidence.decisionCaptures.map(copyCapture),
      assessmentCaptures: evidence.assessmentCaptures.map(({ registry, identity }) => ({ registry: copyCapture(registry), identity: copyCapture(identity) })) };
    return { ok: true, input: detached, inputDigest, diagnostics: [] };
  } catch (error) {
    if (!(error instanceof CapturedInputError)) throw error;
    return refused();
  }
}
