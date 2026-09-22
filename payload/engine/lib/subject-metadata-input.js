/** Fixed metadata admission owns evidence bytes once; it grants no Git authority. */
import { canonicalSha256, CapturedInputError } from './canonical-json.js';
import { admitReconsiderationCaptureEvidence, decodeReconsiderationCaptureEvidence } from './subject-capture-admission.js';
import { isIdentityUuid } from './record-identity.js';
import { getSubjectValidationBudget, createSubjectValidationBudget } from './subject-validation-budget.js';
import { SubjectError } from './subject-error.js';

const fail = () => { throw new SubjectError('invalid-subject-metadata-input', 'Supply the closed metadata request and explicit capacities.'); };
const own = (value, keys) => {
  if (!value || typeof value !== 'object' || ![Object.prototype, null].includes(Object.getPrototypeOf(value))
    || Reflect.ownKeys(value).length !== keys.length || keys.some(key => {
      const field = Object.getOwnPropertyDescriptor(value, key); return !field?.enumerable || !Object.hasOwn(field, 'value');
    })) fail();
  return value;
};
const groups = {
  governance: ['maxCaptureBytes','maxDocumentNodes','maxDocumentTextUnits','maxSubjects','maxHistoryRows','maxValidationSteps'],
  inventory: ['maxRecordVisits','maxRegistryReferenceVisits','maxHierarchyNodes','maxHierarchyEdges'],
  closure: ['maxRows','maxBytes'], reach: ['maxHierarchyNodes','maxHierarchyEdges','maxRecords'],
  views: ['version','maxViews'], replays: ['version','maxSubjects','maxEligibilityRedirects','maxCases','maxInventoryBytes'],
  query: ['version','maxAstNodes','maxAstDepth','maxHierarchyNodes','maxHierarchyEdges','maxRedirects','maxRecords','maxPredicateSteps','maxResultsPerStore','maxExplanationNodes'],
  lookup: ['maxTerms','maxTermBytes','maxMatches','maxBytes'],
};
function caps(value, keys) {
  own(value, keys); if (keys.some(key => !Number.isSafeInteger(value[key]) || value[key] < 0) || (keys.includes('version') && value.version !== 1)) fail();
}
export function createSubjectMetadataBudget(input) {
  const limit = Object.getOwnPropertyDescriptor(input ?? {}, 'limits');
  if (!limit?.enumerable || !Object.hasOwn(limit, 'value')) fail();
  const governance = Object.getOwnPropertyDescriptor(limit.value ?? {}, 'governance');
  if (!governance?.enumerable || !Object.hasOwn(governance, 'value')) fail();
  caps(governance.value, groups.governance);
  return createSubjectValidationBudget(governance.value);
}
export function subjectMetadataInputWire(input) {
  const capture = row => ({ capture: structuredClone(row.capture), bytesBase64: row.bytes.toString('base64'), objectFormat: row.objectFormat });
  return { version: 1, before: structuredClone(input.before), candidate: structuredClone(input.candidate),
    operation: structuredClone(input.operation), limits: structuredClone(input.limits), impact: structuredClone(input.impact),
    evidence: { decisionCaptures: input.evidence.decisionCaptures.map(capture), materialCaptures: input.evidence.materialCaptures.map(capture),
      assessmentCaptures: input.evidence.assessmentCaptures.map(pair => ({ registry: capture(pair.registry), identity: capture(pair.identity) })) } };
}
export function admitSubjectMetadataInput(input, options) { return admit(input, options, false); }
export function decodeSubjectMetadataInput(repoRoot, input, options) { return admit(input, options, true, repoRoot); }
export function admitSubjectProposalSuppressionInput(input, options) { return admit(input, options, false, undefined, true); }
export function decodeSubjectProposalSuppressionInput(repoRoot, input, options) { return admit(input, options, true, repoRoot, true); }
export const subjectProposalSuppressionInputWire = subjectMetadataInputWire;
function admit(input, options, wire, root, suppression = false) {
  try {
    own(options, ['operationBudget']); const budget = getSubjectValidationBudget(options.operationBudget); budget.assertActive();
    budget.charge('validationSteps', 1, 'metadata-input');
    own(input, [wire ? 'version' : 'repoRoot','before','candidate','operation','evidence','limits','impact']);
    if (wire && input.version !== 1) fail();
    const repoRoot = wire ? root : input.repoRoot;
    const { before, candidate, operation, evidence, limits, impact } = input;
    budget.guard({ repoRoot, before, candidate, operation, limits, impact }, 'metadata-input-metadata');
    if (typeof repoRoot !== 'string' || !repoRoot.trim() || repoRoot.includes('\0')) fail();
    for (const side of [before, candidate]) {
      own(side, ['commit','tree','kitPath']);
      if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(side.commit) || side.commit.length !== side.tree?.length
        || !/^[a-f0-9]+$/.test(side.tree) || typeof side.kitPath !== 'string'
        || !(side.kitPath === '.' || side.kitPath.split('/').every(part => part && !['.','..'].includes(part))
          && !/[\\\0:]/.test(side.kitPath))) fail();
    }
    own(operation, ['version','id','action','registryEvent','retainedUnknowns']); own(operation.registryEvent, ['id','changeDigest']);
    if (operation.version !== 1 || !isIdentityUuid(operation.id) || !(suppression ? ['suppress'] : ['rename','clarify','reparent','relate']).includes(operation.action)
      || !isIdentityUuid(operation.registryEvent.id) || typeof operation.registryEvent.changeDigest !== 'string'
      || operation.registryEvent.changeDigest.length !== 64 || !/^[a-f0-9]+$/.test(operation.registryEvent.changeDigest)
      || !Array.isArray(operation.retainedUnknowns)) fail();
    for (const row of operation.retainedUnknowns) {
      own(row, [Object.hasOwn(row, 'ref') ? 'ref' : 'proposalRef', 'reason']);
      if (typeof row.reason !== 'string' || !row.reason.trim()) fail();
    }
    own(limits, [...Object.keys(groups), 'tree']);
    for (const [key, fields] of Object.entries(groups)) caps(limits[key], fields);
    own(limits.tree, ['budget','maxBytes']); caps(limits.tree.budget, ['nodes','edges','rows']);
    if (!Number.isSafeInteger(limits.tree.maxBytes) || limits.tree.maxBytes < 0) fail();
    own(impact, ['version','policy','routes']); own(impact.routes, ['kind']);
    if (impact.version !== 1 || impact.policy !== (suppression ? 'subject-proposal-suppression-impact-v1' : 'subject-metadata-impact-v1') || impact.routes.kind !== 'runtime-capability') fail();
    const owned = { repoRoot, before: structuredClone(before), candidate: structuredClone(candidate), operation: structuredClone(operation),
      limits: structuredClone(limits), impact: structuredClone(impact),
      evidence: wire ? decodeReconsiderationCaptureEvidence(evidence, budget) : admitReconsiderationCaptureEvidence(evidence, budget) };
    return { ok: true, input: owned, inputDigest: canonicalSha256(subjectMetadataInputWire(owned)), diagnostics: [] };
  } catch (error) {
    if (!(error instanceof SubjectError || error instanceof CapturedInputError)) throw error;
    return { ok: false, input: null, inputDigest: null, diagnostics: [{ code: error.code, message: error.message }] };
  }
}
