import { getSubjectValidationBudget } from './subject-validation-budget.js';
/** Read-only staged assignment checks; no publication operation. */
import { readFileSync, lstatSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { isDeepStrictEqual as same } from 'node:util';
import { withCommitSnapshot, withTreeSnapshot, readCommittedTree, changedTreePaths } from './commit-snapshot.js';
import { locateKitRoot } from './kit-root.js';
import { loadSubjectQueryContext, decodeDecisionCaptures } from './subject-query-context.js';
import { evaluateSubjectGovernance, validateSubjectGovernanceCapture } from './subject-governance.js';
import { getRecordOccurrence, resolveRecord } from './record-identity-index.js';
import { iterateCurrentRecords, iterateProposalRecords, isIdentityUuid, parseCanonicalId } from './record-identity.js';
import { selectCapturedRecord } from './record-file.js';
import { recordLifecycleState } from './record-lifecycle.js';
import { captureCommittedFile, describeCandidateBytes, verifyCapturedBytes } from './captured-source.js';
import { verifyDecisionEvidence } from './decision-evidence.js';
import { validateAssignmentChange, validateSubjectSplitAssignmentChange, validateContinuedAssignmentChange } from './assignment-validation.js';
import { readAssignments } from './subject-assignments.js';
import { validateBaselineTransition, validateAssignmentHistoryChain } from './subject-history.js';
import { assignmentEventDigest } from './assignment-event.js';
import { validateAssignmentPreservation, validateTypedAssignmentPreservation } from './assignment-preservation.js';
import { compareSubjectRoutes } from './subject-route-impact.js';
import { compareSubjectTreeViews } from './subject-view-impact.js';
import { compareAssignmentReplays, compareTypedAssignmentReplays } from './subject-replay-impact.js';
import { canonicalSha256, CapturedInputError } from './canonical-json.js';
import { isCalendarDate } from './iso-date.js';
import { rethrowIfBug } from './engine-refusal.js';
import { runChecks } from '../commands/validate.js';
import { admitEquivalentMergeInput } from './subject-equivalent-merge-input.js';
import { inspectEquivalentMergeAssignmentScope } from './subject-equivalent-merge-core.js';
import { admitDecisionPromotionInput } from './decision-promotion-input.js';
import { planCapturedDecisionPromotion, planCapturedRecordPromotion } from './record-promotion.js';
import { loadStores } from './load-stores.js';
import { validateValues } from '../commands/validate-values.js';
import { admitRecordPromotionInput, admitContinuedRecordPromotionWire } from './record-promotion-input.js';
import { typedPromotionPreflightSatisfied } from './typed-promotion-policy.js';
import { admitSubjectRetirementInput } from './subject-retirement-input.js';
import { inspectSubjectRetirementAssignmentScope, inspectContinuedRetirementAssignmentScope, inspectContinuedMergeAssignmentScope } from './subject-transition-core.js';
import { loadContinuedLifecycleContext, verifyLifecycleEvidenceSources } from './subject-lifecycle-context.js';
import { admitSubjectSplitInput } from './subject-split-input.js';
import { inspectSubjectSplitAssignmentScope, inspectContinuedSplitAssignmentScope } from './subject-split-core.js';
import { SubjectError } from './subject-error.js';
import { createSubjectValidationBudget } from './subject-validation-budget.js';
import { lifecycleMaterialPresent } from './subject-lifecycle-input.js';
import { decodePreparedRecordPromotion } from './prepared-record-promotion.js';
import { createTypedPromotionResult, typedPromotionGovernance, typedPromotionCapabilities, completeTypedPromotion } from './typed-promotion-checks.js';
import { admitSubjectAssignmentContinuation, decodeSubjectAssignmentContinuation } from './subject-assignment-continuation.js';
import { createAssignmentContinuationContexts } from './assignment-continuation-context.js';

const closed = (value, required, optional = []) => value !== null && typeof value === 'object' && !Array.isArray(value)
  && required.every((key) => Object.hasOwn(value, key)) && Reflect.ownKeys(value).every((key) => [...required, ...optional].includes(key));
const key = (ref) => JSON.stringify([ref.namespace, ref.kind, ref.id]);
const whole = (n) => Number.isSafeInteger(n) && n >= 0;
const label = (s) => typeof s === 'string' && s === s.trim() && s.length > 0 && s.length <= 160 && !/[\x00-\x1f\x7f]/.test(s);
const domainPath = (s) => typeof s === 'string' && /^[a-z0-9]+(-[a-z0-9]+)*(\/[a-z0-9]+(-[a-z0-9]+)*)*(?![\s\S])$/.test(s);
const historyDir = 'subjects/_assignments';
const baselineFile = `${historyDir}/_baselines.yaml`;
const repoPath = (kitPath, file) => kitPath === '.' ? file : `${kitPath}/${file}`;
const detachedCapture = ({ source, ...capture }) => capture;
const assignmentEqual = (a, b) => a.state === b.state && (a.state === 'unknown'
  || same([...a.ids].sort(), [...b.ids].sort()));
const committedDescriptor = (value) => closed(value, ['commit', 'tree', 'kitPath'])
  && ['commit', 'tree', 'kitPath'].every((key) => typeof value[key] === 'string' && value[key].length > 0);
const typedSelection = (value) => closed(value, ['kind', 'refs']) && value.kind === 'typed-records'
  && Array.isArray(value.refs) && value.refs.length > 0 && value.refs.every((ref) => closed(ref, ['namespace', 'kind', 'id'])
    && isIdentityUuid(ref.namespace) && ['knowledge', 'ontology', 'decision'].includes(ref.kind) && parseCanonicalId(ref.kind, ref.id).ok)
  && new Set(value.refs.map(key)).size === value.refs.length;

/**
 * Assemble every model and record from actual immutable Git snapshots. Caller
 * retained Decision captures supply historical byte evidence, never models,
 * successful checks or an approval boolean. Optional typed selection is reviewed
 * intent, corroborated against actual existing records and the event row set.
 * Snapshot enumeration
 * has the existing materializer's bounds; limits below bound this gate's work.
 */
export async function runAssignmentGate(input) {
  return evaluateAssignmentGate(input, (check) => withCommitSnapshot(input.repoRoot, check), false, null, null,
    admitSubjectAssignmentContinuation(input));
}

/** Prepared-commit adapter; implemented against the released P1 object seams. */
export async function runPreparedAssignmentGate(input) {
  return evaluateAssignmentGate(input, preparedSnapshots(input), true, null, null, admitSubjectAssignmentContinuation(input));
}

/** Fixed wire representation adapter; no caller allowance or admitted bundle. */
export async function runPreparedAssignmentGateFromWire(input) {
  const admitted = decodeSubjectAssignmentContinuation(input);
  if (!admitted.present && admitted.ok) {
    return runPreparedAssignmentGate({ ...input, decisionCaptures: decodeDecisionCaptures(input.decisionCaptures) });
  }
  return evaluateAssignmentGate(input, preparedSnapshots(input), true, null, null, admitted);
}

/** Closed joint input; scope authority comes only from the fixed actual P2 core. */
export async function runPreparedSubjectUseAssignmentGate(input) {
  const admitted = admitEquivalentMergeInput(input);
  if (!admitted.ok) return { version: 1, core: null, assignment: await evaluateAssignmentGate(null, null, true) };
  return runMergeAssignment(admitted.input, admitted.continuation?.operationBudget ?? null);
}

/** INTERNAL fixed merge handoff; actual snapshots establish scope. */
export async function runAdmittedSubjectMergeAssignmentGate(request, { operationBudget }) {
  const budget = getSubjectValidationBudget(operationBudget); budget.assertActive();
  return runMergeAssignment(request, budget);
}

async function runMergeAssignment(request, operationBudget) {
  const joint = { request, core: null, operationBudget };
  const assignmentInput = { repoRoot: request.repoRoot, before: request.before, candidate: request.candidate,
    eventId: request.operation.assignmentEvent.id, reviewNote: request.reviewNote,
    selection: { kind: 'typed-records', refs: [] }, decisionCaptures: request.evidence.decisionCaptures,
    limits: request.limits.assignments, impact: { required: [] } };
  const assignment = await evaluateAssignmentGate(assignmentInput, preparedSnapshots(assignmentInput), true, joint);
  return { version: 1, core: joint.core, assignment };
}

/** Fixed nonempty retirement adapter; the outer gate owns eventless preservation. */
export async function runPreparedSubjectRetirementAssignmentGate(input) {
  const admitted = admitSubjectRetirementInput(input);
  if (!admitted.ok || admitted.input.operation.assignmentEvent === null) {
    return { version: 1, core: null, assignment: await evaluateAssignmentGate(null, null, true) };
  }
  return runRetirementAssignment(admitted.input, admitted.continuation?.operationBudget ?? null);
}

/** INTERNAL fixed owned-input handoff from retirement; actual snapshots still establish authority. */
export async function runAdmittedSubjectRetirementAssignmentGate(request, { operationBudget }) {
  const budget = getSubjectValidationBudget(operationBudget); budget.assertActive();
  return runRetirementAssignment(request, budget);
}

async function runRetirementAssignment(request, operationBudget) {
  const joint = { request, core: null, retirement: true, operationBudget };
  const assignmentInput = { repoRoot: request.repoRoot, before: request.before, candidate: request.candidate,
    eventId: request.operation.assignmentEvent.id, reviewNote: request.reviewNote,
    selection: { kind: 'typed-records', refs: [] }, decisionCaptures: request.evidence.decisionCaptures,
    limits: request.limits.assignments, impact: { required: [] } };
  const assignment = await evaluateAssignmentGate(assignmentInput, preparedSnapshots(assignmentInput), true, joint);
  return { version: 1, core: joint.core, assignment };
}

/** Fixed positive split adapter; eventless preservation belongs to the outer gate. */
export async function runPreparedSubjectSplitAssignmentGate(input) {
  const admitted = admitSubjectSplitInput(input);
  if (!admitted.ok || admitted.input.operation.assignmentEvent === null) {
    return { version: 1, core: null, assignment: await evaluateAssignmentGate(null, null, true) };
  }
  return runSplitAssignment(admitted.input, admitted.continuation?.operationBudget ?? null);
}

export async function runAdmittedSubjectSplitAssignmentGate(request, { operationBudget }) {
  const budget = getSubjectValidationBudget(operationBudget); budget.assertActive();
  return runSplitAssignment(request, budget);
}

async function runSplitAssignment(request, operationBudget) {
  const joint = { request, core: null, split: true, continued: Boolean(operationBudget), operationBudget };
  const assignmentInput = { repoRoot: request.repoRoot, before: request.before, candidate: request.candidate,
    eventId: request.operation.assignmentEvent.id, reviewNote: request.reviewNote,
    selection: { kind: 'typed-records', refs: [] }, decisionCaptures: request.evidence.decisionCaptures,
    limits: request.limits.assignments, impact: { required: [] } };
  const assignment = await evaluateAssignmentGate(assignmentInput, preparedSnapshots(assignmentInput), true, joint);
  return { version: 1, core: joint.core, assignment };
}

/** First actual Decisions-only promotion branch; never publication approval. */
export async function runPreparedDecisionPromotionGate(input) {
  const output = { version: 1, kind: 'decision-promotion-gate', mode: 'read-only-prepared-decision-promotion',
    ok: false, publicationReady: false, inputDigest: null, inputs: null,
    capabilities: { before: null, candidate: null },
    promotion: { status: 'not-performed', createdRefs: [], files: [], resources: null, diagnostics: [] }, assignment: null };
  const admitted = admitDecisionPromotionInput(input);
  if (!admitted.ok) {
    output.promotion.diagnostics.push({ code: 'invalid-decision-promotion-input', path: '', message: 'Supply the closed first-branch promotion input.' });
    return output;
  }
  const request = admitted.input; output.inputDigest = admitted.inputDigest;
  const creation = { request, output, plan: null };
  const assignmentInput = { repoRoot: request.repoRoot, before: request.before, candidate: request.candidate,
    eventId: request.eventId, reviewNote: request.reviewNote,
    selection: { kind: 'typed-records', refs: request.promotion.rows.map(({ canonicalRef }) => canonicalRef) },
    decisionCaptures: [], limits: request.limits.assignments, impact: { required: [] } };
  output.assignment = await evaluateAssignmentGate(assignmentInput, preparedSnapshots(assignmentInput), true, null, creation);
  output.ok = output.assignment.ok && output.promotion.status === 'passed';
  return output;
}

/** Distinct K/O/D owner gate; the legacy Decisions-only contract is unchanged. */
export async function runPreparedRecordPromotionGate(input) {
  return runRecordPromotion(admitRecordPromotionInput(input));
}

export async function runPreparedRecordPromotionGateFromWire({ repoRoot, gateInput }) {
  return lifecycleMaterialPresent(gateInput) ? runRecordPromotion(admitContinuedRecordPromotionWire(repoRoot, gateInput))
    : runPreparedRecordPromotionGate(decodePreparedRecordPromotion(repoRoot, gateInput));
}

async function runRecordPromotion(admitted) {
  const output = createTypedPromotionResult();
  const continued = Object.hasOwn(admitted, 'continuation');
  const operationBudget = admitted.continuation?.operationBudget;
  if (continued) {
    output.version = 3;
    output.resources.governance = operationBudget ? { used: operationBudget.used, failure: operationBudget.failure } : null;
  }
  if (!admitted.ok) {
    output.checks.admission.status = 'failed'; output.diagnostics = admitted.diagnostics; return output;
  }
  const request = admitted.input;
  output.inputDigest = admitted.inputDigest; output.inputs = { before: request.before, candidate: request.candidate };
  output.recordKind = request.kind; output.resources.limits = structuredClone(request.limits); output.checks.admission.status = 'passed';
  const creation = { typed: true, continued, request, output, plan: null, registry: {},
    budget: operationBudget ?? createSubjectValidationBudget(request.limits.governance), roots: [] };
  const assignmentInput = { repoRoot: request.repoRoot, before: request.before, candidate: request.candidate,
    eventId: request.eventId, reviewNote: request.reviewNote,
    selection: { kind: 'typed-records', refs: request.promotion.rows.map(({ canonicalRef }) => canonicalRef) },
    decisionCaptures: request.evidence.decisionCaptures, limits: request.limits.assignments, impact: { required: [] } };
  const assignment = await evaluateAssignmentGate(assignmentInput, preparedSnapshots(assignmentInput), true, null, creation);
  output.assignment = assignment;
  for (const name of ['models', 'source', 'preservation', 'authorizer']) if (output.checks[name].status !== 'failed') {
    output.checks[name].status = assignment.checks[name].status;
  }
  output.checks.promotion.status = output.promotion.status;
  output.checks.assignments.status = assignment.ok ? 'passed'
    : ['scope', 'history', 'captures', 'eligibility'].some((name) => assignment.checks[name].status === 'failed') ? 'failed' : 'not-performed';
  for (const { code, path, message, ...details } of assignment.diagnostics) output.diagnostics.push({ code, path, message, details });
  if (creation.continued || creation.governanceAttempted) output.resources.governance = { used: creation.budget.used, failure: creation.budget.failure };
  output.ok = assignment.ok && Object.entries(output.checks).every(([name, { status }]) =>
    name === 'preflight' ? typedPromotionPreflightSatisfied(output, assignmentInput.selection.refs) : status === 'passed');
  const stable = (value) => {
    if (typeof value === 'string') {
      for (const [root, label] of creation.roots) value = value.replaceAll(root, label);
      return value.replaceAll(resolve(request.repoRoot), '<repository>');
    }
    if (Array.isArray(value)) return value.map(stable);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, stable(item)]));
    return value;
  };
  return stable(output);
}

function preparedSnapshots(input) {
  return async (check) => {
    const before = readCommittedTree(input.repoRoot, input.before.commit);
    const candidate = readCommittedTree(input.repoRoot, input.candidate.commit);
    for (const [side, actual] of [['before', before], ['candidate', candidate]]) {
      if (actual.tree !== input[side].tree) throw new Error(`assignment: ${side} tree differs from its actual committed tree`);
    }
    return withTreeSnapshot(input.repoRoot, before.tree, (prior) =>
      withTreeSnapshot(input.repoRoot, candidate.tree, (after) => check({
        before: { commit: before.commit, tree: before.tree, materialize: () => prior },
        candidate: { ...after, commit: candidate.commit },
        changedPaths: () => changedTreePaths(input.repoRoot, before.tree, candidate.tree),
      })));
  };
}

// Only fixed adapters in this module can supply snapshot assembly. This is not
// a public caller-model/callback interface or an alternate domain authority.
async function evaluateAssignmentGate(input, withSnapshots, prepared = false, joint = null, creation = null, admitted = null) {
  const continuation = admitted?.present ? admitted : null;
  const continuedBudget = continuation?.bundle?.operationBudget;
  const typed = input !== null && typeof input === 'object' && Object.hasOwn(input, 'selection');
  const typedPromotion = creation?.typed === true;
  const diagnosticRoots = [];
  const stable = (value) => {
    if (typeof value === 'string') {
      for (const [root, label] of diagnosticRoots) value = value.replaceAll(root, label);
      // Failures before the materializer callback (including cleanup failures)
      // have no exposed root descriptor. Its fixed temporary-name convention
      // is diagnostic transport only, never a source of identity or evidence.
      return value.replace(/(?:\/[^\s"']*)?\/unknown-knowledge-(?:commit|tree)-[^/\s"']+/g, '<snapshot>');
    }
    if (Array.isArray(value)) return value.map(stable);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, stable(item)]));
    return value;
  };
  const checks = Object.fromEntries(['models', 'source', 'scope', 'history', 'captures', 'eligibility', 'preservation', 'authorizer', 'impactPolicy',
    'candidateCommitMembership', 'humanApproval'].map((name) => [name, { status: 'not-performed' }]));
  const result = { version: 1, ok: false, mode: prepared ? 'read-only-prepared-assignment' : 'read-only-staged-assignment', publicationReady: false,
    inputs: null, eventSource: null, scope: { status: 'not-performed', refs: null, historicalRefs: null }, checks, rows: [],
    optionalImpact: { routes: { status: 'not-assessed' }, regeneratedViews: { status: 'not-assessed' }, representativeReplays: { status: 'not-assessed' } },
    used: { ...(typed ? { selectedRecords: 0 } : { allocatedKnowledge: 0 }), captureBytes: 0, redirects: 0 }, diagnostics: [] };
  if (continuation) {
    result.version = 2;
    result.continuation = { version: 1, inputDigest: continuation.bundle?.inputDigest ?? null,
      governance: continuedBudget ? { used: continuedBudget.used, failure: continuedBudget.failure } : null };
  }
  const fail = (check, code, message, details = {}) => {
    result.ok = false;
    if (continuedBudget) result.continuation.governance = { used: continuedBudget.used, failure: continuedBudget.failure };
    checks[check] = { status: 'failed' }; result.diagnostics.push(stable({ code, path: check, message, ...details })); return result;
  };
  if (continuation && !continuation.ok) {
    const diagnostic = continuation.diagnostics[0];
    return fail('models', diagnostic.code, diagnostic.message);
  }
  if (continuation) {
    try {
      const metadata = Object.create(null);
      for (const key of Reflect.ownKeys(input)) {
        const field = Object.getOwnPropertyDescriptor(input, key);
        if (typeof key !== 'string' || !field.enumerable || !Object.hasOwn(field, 'value')) {
          throw new SubjectError('invalid-assignment-gate-input', 'Continued assignment requires own data input fields.');
        }
        if (!['decisionCaptures', 'continuation'].includes(key)) metadata[key] = field.value;
      }
      continuedBudget.guard(metadata, 'assignment-continuation-gate-metadata');
      input = { ...structuredClone(metadata), decisionCaptures: continuation.bundle.evidence.decisionCaptures,
        continuation: { version: 1, assessmentCaptures: continuation.bundle.evidence.assessmentCaptures,
          materialCaptures: continuation.bundle.evidence.materialCaptures, limits: { governance: continuation.bundle.limits } } };
      withSnapshots = prepared ? preparedSnapshots(input) : check => withCommitSnapshot(input.repoRoot, check);
    } catch (error) {
      if (!(error instanceof SubjectError || error instanceof CapturedInputError)) throw error;
      result.continuation.governance = { used: continuedBudget.used, failure: continuedBudget.failure };
      return fail('models', error.code, error.message);
    }
  }
  if (!closed(input, ['repoRoot', 'eventId', 'reviewNote', 'decisionCaptures', 'limits', 'impact', ...(prepared ? ['before', 'candidate'] : [])],
    continuation ? ['selection', 'continuation'] : ['selection'])
    || (typed && !joint && !typedSelection(input.selection))
    || (prepared && (!committedDescriptor(input.before) || !committedDescriptor(input.candidate)))
    || typeof input.repoRoot !== 'string' || !input.repoRoot || !isIdentityUuid(input.eventId)
    || !closed(input.reviewNote, ['date', 'author', 'skill']) || !isCalendarDate(input.reviewNote.date)
    || !label(input.reviewNote.author) || !label(input.reviewNote.skill) || !Array.isArray(input.decisionCaptures)
    || !closed(input.limits, ['maxRecords', 'maxCaptureBytes', 'maxRedirects']) || !Object.values(input.limits).every(whole)
    || !closed(input.impact, ['required'], ['routes', 'regeneratedViews', 'representativeReplays']) || !Array.isArray(input.impact.required)
    || new Set(input.impact.required).size !== input.impact.required.length
    || !input.impact.required.every((name) => Object.hasOwn(result.optionalImpact, name))
    || ['routes', 'regeneratedViews'].some((name) => input.impact[name] !== undefined && !closed(input.impact[name], ['inventory', 'limits']))
    || (input.impact.representativeReplays !== undefined && !closed(input.impact.representativeReplays, ['limits', 'queryBudgets']))) {
    return fail('models', 'invalid-assignment-gate-input', 'Supply the closed read-only gate input with explicit review, budgets and required impact policy.');
  }
  const { limits } = input;
  diagnosticRoots.push([resolve(input.repoRoot), '<repository>']);
  try {
    return await withSnapshots(async (snapshot) => {
      if (!snapshot.before) return fail('source', 'assignment-before-unavailable', 'This operation requires an existing committed installation.');
      const roots = { before: snapshot.before.materialize().root, candidate: snapshot.candidate.root };
      if (typedPromotion) creation.roots = [[roots.before, '<before>'], [roots.candidate, '<candidate>'],
        [dirname(roots.before), '<before-snapshot>'], [dirname(roots.candidate), '<candidate-snapshot>']];
      diagnosticRoots.unshift([roots.before, '<before>'], [roots.candidate, '<candidate>'],
        [dirname(roots.before), '<before-snapshot>'], [dirname(roots.candidate), '<candidate-snapshot>']);
      const contexts = {}; const models = {}; const kitPaths = {};
      for (const side of ['before', 'candidate']) {
        kitPaths[side] = relative(roots[side], locateKitRoot(roots[side])) || '.';
        if (prepared && kitPaths[side] !== input[side].kitPath) {
          return fail('source', 'assignment-kit-path-mismatch', 'Each requested kit path must equal its own actual snapshot layout.', { side });
        }
        const actualModel = creation || joint?.split || continuation ? loadStores(locateKitRoot(roots[side])) : null;
        const loaded = creation || joint?.split || continuation ? { ok: actualModel.ok, context: { model: actualModel }, diagnostics: actualModel.diagnostics }
          : joint && !joint.split && joint.operationBudget
            ? loadContinuedLifecycleContext({ root: roots[side], evidence: joint.request.evidence, operationBudget: joint.operationBudget })
          : loadSubjectQueryContext({ root: roots[side], ...(joint ? joint.request.evidence : { decisionCaptures: input.decisionCaptures }) });
        if (!loaded.ok) return fail('models', 'assignment-model-unavailable', creation
          ? 'Both actual promotion snapshot models must be structurally healthy.' : 'Both actual snapshot models must be healthy and governed.', { side, diagnostics: loaded.diagnostics });
        contexts[side] = loaded.context; models[side] = loaded.context.model;
        if (creation) {
          const kit = locateKitRoot(roots[side]);
          const present = (file) => Boolean(lstatSync(join(kit, file), { throwIfNoEntry: false }));
          const capabilities = { knowledge: present('knowledge'), ontology: present('ontology'), decisions: present('decisions'),
            subjectRegistry: present('subjects/registry.yaml'), assignmentHistory: present(historyDir) };
          creation.output.capabilities[side] = capabilities;
          if (!typedPromotion && (capabilities.knowledge || capabilities.ontology || !capabilities.decisions || capabilities.subjectRegistry
            || capabilities.assignmentHistory !== (side === 'candidate') || !models[side].stores.decisions.catalog)) {
            return fail('models', 'promotion-capability-unsupported', 'This branch requires actual Decisions-only stores, no Subject registry, absent prior history and exact new genesis history.', { side });
          }
          if (typedPromotion) {
            const governed = typedPromotionGovernance(creation, side, models[side], roots[side]);
            if (!governed.ok) {
              creation.output.checks.governance.status = 'failed';
              return fail('models', 'promotion-governance-unavailable', 'Actual typed promotion governance refused.', { side, diagnostics: governed.diagnostics });
            }
            contexts[side] = governed.context;
          }
          const values = validateValues(models[side], undefined, roots[side]);
          if (values.hardErrors.length || values.findings.some(({ severity }) => severity === 'error')) {
            return fail('models', 'promotion-value-defects', 'Both actual store value checks must pass.', { side, diagnostics: [...values.hardErrors, ...values.findings] });
          }
        } else if (!joint?.split && !continuation && !joint?.operationBudget) {
          const binding = validateSubjectGovernanceCapture(loaded.context.subjectGovernance, { model: models[side] });
          if (!binding.ok) return fail('models', 'assignment-governance-mismatch', 'Governance must bind this side\'s own actual model.', { side, diagnostics: binding.diagnostics });
        }
        // Split's core runs structural checks after its allocation and binding proof.
        const findings = joint?.split ? [] : runChecks(models[side], roots[side]).filter(({ severity }) => severity === 'error');
        if (findings.length) return fail('models', 'assignment-structural-defects', 'Existing structural gates must pass on both sides.', { side, diagnostics: findings });
      }
      if (continuation) Object.assign(contexts, createAssignmentContinuationContexts({ repoRoot: input.repoRoot,
        snapshot, roots, kitPaths, models, evidence: continuation.bundle.evidence, operationBudget: continuedBudget }));
      if (typedPromotion && !typedPromotionCapabilities(creation, models)) {
        creation.output.checks.governance.status = 'failed';
        return fail('models', 'promotion-capability-unsupported', 'Typed promotion preserves present stores and exact Subject authority, and requires actual candidate history.');
      }
      if (creation?.continued) verifyLifecycleEvidenceSources({ repoRoot: input.repoRoot,
        before: { descriptor: input.before, root: roots.before }, candidate: { descriptor: input.candidate, root: roots.candidate },
        evidence: creation.request.evidence, operationBudget: creation.budget });
      if (!joint?.split) checks.models = { status: 'passed', scope: typedPromotion ? 'actual-typed-capabilities-structural-and-value-checks'
        : creation ? 'actual-decisions-only-capabilities-structural-and-value-checks' : 'both-actual-models-and-structural-checks' };
      const { before, candidate } = models;
      if (joint?.split) {
        const { request } = joint;
        const inspect = joint.continued ? inspectContinuedSplitAssignmentScope : inspectSubjectSplitAssignmentScope;
        const bundle = await inspect({ repoRoot: input.repoRoot,
          before: { descriptor: input.before, root: roots.before, model: before },
          candidate: { descriptor: input.candidate, root: roots.candidate, model: candidate },
          operation: request.operation, reviewNote: request.reviewNote, evidence: request.evidence,
          limits: { inventory: request.limits.inventory, governance: request.limits.governance,
            closure: request.limits.closure, allocation: request.limits.allocation } }, joint.continued ? { operationBudget: joint.operationBudget } : {});
        joint.core = bundle.core; joint.operationBudget = bundle.operationBudget;
        if (!joint.core.ok) return fail('scope', 'assignment-split-scope-refused',
          'The fixed actual split core refused.', { diagnostics: joint.core.diagnostics });
        // Candidate governance is already bound by the one model/core proof.
        // Before eligibility needs its own real evaluation and binding, charged
        // to that same allowance rather than an implicit query-context reload.
        contexts.candidate.subjectGovernance = bundle.candidateGovernance;
        const checked = evaluateSubjectGovernance({ registry: before.subjectRegistry, identity: before.identity,
          identityIndex: before.identityIndex, ...request.evidence }, { operationBudget: joint.operationBudget });
        if (!checked.ok) return fail('models', 'assignment-split-before-governance',
          'Actual before governance must evaluate under the continued allowance.', { diagnostics: checked.diagnostics });
        const binding = validateSubjectGovernanceCapture(checked.governance, { model: before }, { operationBudget: joint.operationBudget });
        if (!binding.ok) return fail('models', 'assignment-governance-mismatch',
          'Before governance must bind its own actual model.', { diagnostics: binding.diagnostics });
        contexts.before.subjectGovernance = checked.governance;
        checks.models = { status: 'passed', scope: 'actual-split-core-structural-checks-and-before-binding' };
      }
      if (kitPaths.before !== kitPaths.candidate || (!creation && !joint?.split && !same(before.identity, candidate.identity))) {
        return fail('source', 'assignment-installation-changed', creation ? 'Promotion preserves the actual installation location.'
          : 'The first operation preserves kit location and the entire allocation ledger.');
      }
      result.inputs = { before: { kind: 'commit', commit: snapshot.before.commit, tree: snapshot.before.tree, kitPath: kitPaths.before },
        candidate: { ...(prepared ? { kind: 'commit', commit: snapshot.candidate.commit } : { kind: 'tree' }),
          tree: snapshot.candidate.tree, kitPath: kitPaths.candidate } };
      if (creation) {
        creation.output.inputs = { before: { ...input.before }, candidate: { ...input.candidate } };
        const plannerInput = { repoRoot: input.repoRoot, source: input.before,
          publication: creation.request.publication, selected: creation.request.promotion.rows, limits: creation.request.limits.promotion };
        const plan = typedPromotion && creation.request.kind !== 'decision' ? await planCapturedRecordPromotion({ version: 1, kind: creation.request.kind, ...plannerInput })
          : await planCapturedDecisionPromotion(plannerInput);
        creation.output.promotion.status = 'failed';
        if (!plan.ok) {
          creation.output.promotion.status = 'failed';
          creation.output.promotion.diagnostics = [{ code: plan.code, path: '', message: 'Actual proposal transformation refused.' }, ...plan.diagnostics];
          return fail('scope', 'promotion-transformation-refused', 'The fixed actual committed-source transformation refused.', { diagnostics: creation.output.promotion.diagnostics });
        }
        creation.plan = plan; creation.output.promotion.resources = plan.resources;
        if (!same(plan.source, input.before) || !same(candidate.identity, plan.identity)
          || !same(plan.createdRefs.map(key).sort(), input.selection.refs.map(key).sort())) {
          return fail('scope', 'promotion-identity-mismatch', 'Actual candidate identity and exact new canonical set must match the fixed allocator transformation.');
        }
        creation.output.promotion.createdRefs = plan.createdRefs.map((ref) => ({ ...ref }));
      }
      const source = candidate.assignmentHistory?.sources.events.find(({ document }) => document.event === input.eventId);
      if (!source) return fail('source', 'assignment-event-unavailable', 'The exact proposed event must exist in the actual candidate source history.');
      const event = source.document;
      if (typed ? event['schema-version'] !== 2 || event.operation !== (creation ? 'canonical-creation' : joint ? 'subject-use-transition' : 'existing-subjects') : event['schema-version'] !== 1) {
        return fail('source', 'assignment-event-operation-mismatch', 'The actual event version and operation must match this selected gate.');
      }
      if (!same(event['before-input'], { commit: snapshot.before.commit, tree: snapshot.before.tree, 'kit-path': kitPaths.before })) {
        return fail('source', 'assignment-before-mismatch', 'Event before provenance differs from the pinned actual before commit.');
      }
      if (creation && creation.request.publication.review !== event.review.reference) {
        return fail('source', 'promotion-review-mismatch', 'Allocation publication and creation event must cite the same operation review reference.');
      }
      checks.source = { status: 'passed', scope: prepared ? 'exact-before-and-candidate-commit-trees' : 'pinned-before-commit-and-staged-candidate-tree' };
      let selection = input.selection;
      if (joint) {
        const { request } = joint;
        const inspect = joint.retirement ? joint.operationBudget ? inspectContinuedRetirementAssignmentScope
          : inspectSubjectRetirementAssignmentScope : joint.operationBudget ? inspectContinuedMergeAssignmentScope : inspectEquivalentMergeAssignmentScope;
        if (!joint.split) joint.core = await inspect({ repoRoot: input.repoRoot,
          before: { descriptor: input.before, root: roots.before, context: contexts.before },
          candidate: { descriptor: input.candidate, root: roots.candidate, context: contexts.candidate },
          operation: request.operation, reviewNote: request.reviewNote, evidence: request.evidence,
          limits: { inventory: request.limits.inventory, governance: request.limits.governance,
            ...(joint.retirement ? { closure: request.limits.closure } : {}) } }, joint.operationBudget ? { operationBudget: joint.operationBudget } : {});
        const core = joint.core;
        if (!core.ok) return fail('scope', joint.retirement ? 'assignment-retirement-scope-refused' : 'assignment-merge-scope-refused',
          'The actual shared registry and affected-use inspection refused.', { diagnostics: core.diagnostics });
        const scope = { kind: 'subject-use-transition', operation: request.operation.id, action: request.operation.action,
          ...(joint.split ? { subject: request.operation.subject, successors: request.operation.successors }
            : joint.retirement ? { subject: request.operation.subject }
            : { survivor: request.operation.survivor, absorbed: request.operation.absorbed }),
          'registry-events': request.operation.registryEvents.map(({ id }) => id) };
        if (!same(core.inputs, { before: input.before, candidate: input.candidate }) || !same(core.operation, request.operation)
          || !same(event.scope, scope) || assignmentEventDigest(event) !== request.operation.assignmentEvent.changeDigest
          || core.assignments.some((expected) => !event.rows.some((row) => same(row.ref, expected.ref) && same(row.after, expected.after)))
          || (joint.split && (event.rows.length !== core.assignments.length || event.rows.some((row, index) =>
            !same(row.ref, core.assignments[index].ref) || row.reason !== request.operation.mappings[index].reason
            || row.before?.state !== 'known' || row.after?.state !== 'known' || row.disposition !== 'changed'
            || row['after-revision'] !== row['before-revision'] + 1)))) {
          return fail('scope', joint.split ? 'assignment-split-binding-mismatch' : joint.retirement ? 'assignment-retirement-binding-mismatch' : 'assignment-merge-binding-mismatch',
            'Actual core descriptors, operation, assignment event and expected arrays must agree exactly.');
        }
        selection = { kind: 'typed-records', refs: core.assignments.map(({ ref }) => ref) };
      }
      const affected = []; const historical = [];
      if (creation) {
        if (selection.refs.length > limits.maxRecords) return fail('scope', 'assignment-record-budget', 'The complete promoted selection exceeds the assignment record budget.');
        const kinds = [typedPromotion ? creation.request.kind : 'decision'];
        const oldRecords = iterateCurrentRecords(before, { kinds });
        const newRecords = iterateCurrentRecords(candidate, { kinds });
        const oldProposals = iterateProposalRecords(before, { kinds });
        const newProposals = iterateProposalRecords(candidate, { kinds });
        for (const selected of creation.request.promotion.rows) {
          const ref = selected.canonicalRef; result.used.selectedRecords += 1;
          const prior = oldProposals.find(({ proposalRef }) => same(proposalRef, selected.proposalRef));
          const current = newRecords.find((row) => same(row.ref, ref));
          const lifecycle = current ? recordLifecycleState(current) : null;
          if (ref.namespace !== before.identity.namespace || before.identity.allocations.some((row) => row.kind === ref.kind && row.id === ref.id)
            || oldRecords.some((row) => same(row.ref, ref)) || !prior
            || newProposals.some(({ proposalRef }) => same(proposalRef, selected.proposalRef))
            || !current || resolveRecord(candidate.identityIndex, ref).status !== 'loaded'
            || !same(getRecordOccurrence(candidate.identityIndex, ref)?.entry, current.entry)
            || lifecycle.lifecycle !== selected.targetLifecycle || lifecycle.state !== 'effective') {
            return fail('scope', 'promotion-freshness-or-consumption-mismatch', 'Each selected proposal must be consumed into one fresh allocated effective canonical occurrence.', { ref });
          }
          const states = [readAssignments(prior.entry), readAssignments(current.entry)];
          if ((!typedPromotion || !before.subjectRegistry) && states.some((state) => !(same(state, { state: 'unknown', reason: 'absent' }) || same(state, { state: 'known', ids: [] })))) {
            return fail('scope', 'promotion-subject-branch-unsupported', 'The first subjectless branch admits only absent or known-empty selected assignments.', { ref });
          }
          affected.push(current);
        }
      } else if (typed) {
        if (selection.refs.length > limits.maxRecords) return fail('scope', 'assignment-record-budget', 'The complete reviewed typed selection must fit the record budget.');
        const kinds = [...new Set(selection.refs.map(({ kind }) => kind))];
        const loaded = new Map(iterateCurrentRecords(before, { kinds }).map((row) => [key(row.ref), row]));
        const next = new Map(iterateCurrentRecords(candidate, { kinds }).map((row) => [key(row.ref), row]));
        for (const ref of selection.refs) {
          if (ref.namespace !== before.identity.namespace) return fail('scope', 'assignment-payload-unavailable', 'Selected owners must belong to this captured installation.', { ref });
          const old = resolveRecord(before.identityIndex, ref); const after = resolveRecord(candidate.identityIndex, ref);
          const occurrence = getRecordOccurrence(before.identityIndex, ref); const row = loaded.get(key(ref));
          const nextRow = next.get(key(ref));
          result.used.selectedRecords += 1;
          // The actual identity resolver only returns loaded for an allocated owner.
          if (old.status !== 'loaded' || after.status !== 'loaded' || !occurrence || !row || !nextRow || !same(occurrence.entry, row.entry)) {
            return fail('scope', 'assignment-payload-unavailable', 'Each selected typed owner requires an existing allocated unique payload on both sides.', { ref });
          }
          const lifecycle = recordLifecycleState(row);
          if (lifecycle.state !== 'effective' || !same(lifecycle, recordLifecycleState(nextRow))) {
            return fail('scope', 'assignment-target-not-effective', 'Typed subjects-only edits preserve the existing effective lifecycle.', { ref });
          }
          affected.push(row);
        }
      } else {
        if (!before.stores.knowledge.present || !before.stores.knowledge.catalog) return fail('scope', 'assignment-store-unavailable', 'A complete Knowledge store is required.');
        const current = iterateCurrentRecords(before, { kinds: ['knowledge'] });
        const loaded = new Map(current.map((row) => [key(row.ref), row]));
        for (const allocation of before.identity.allocations.filter(({ kind }) => kind === 'knowledge')) {
          const ref = { namespace: before.identity.namespace, kind: allocation.kind, id: allocation.id };
          if (allocation.state !== 'allocated') { historical.push(ref); continue; }
          result.used.allocatedKnowledge += 1;
          if (result.used.allocatedKnowledge > limits.maxRecords) return fail('scope', 'assignment-record-budget', 'The complete allocated universe exceeds the supplied record budget.');
          const resolution = resolveRecord(before.identityIndex, ref); const occurrence = getRecordOccurrence(before.identityIndex, ref);
          const row = loaded.get(key(ref));
          if (resolution.status !== 'loaded' || !occurrence || !row || !same(occurrence.entry, row.entry)) {
            return fail('scope', 'assignment-payload-unavailable', 'Every allocated Knowledge identity needs one corroborated usable original payload.', { ref, resolution: resolution.status });
          }
          const domain = row.entry.record.facets?.domain;
          if (!domainPath(domain)) return fail('scope', 'assignment-source-metadata-unavailable', 'Every allocated Knowledge record requires a valid recorded facets.domain.', { ref });
          if (event.scope.values.some((value) => domain === value || (event.scope.match === 'subtree' && domain.startsWith(`${value}/`)))) {
            if (recordLifecycleState(row).state !== 'effective') return fail('scope', 'assignment-target-not-effective', 'Every matched record must already have known effective lifecycle.', { ref });
            affected.push(row);
          }
        }
        if (event.scope.values.some((value) => !domainPath(value))) return fail('scope', 'assignment-invalid-scope-path', 'Scope selectors must use governed domain path grammar.');
      }
      const eventRefs = event.rows.map(({ ref }) => key(ref)); const scopeRefs = affected.map(({ ref }) => key(ref));
      if (new Set(eventRefs).size !== eventRefs.length || !same([...eventRefs].sort(), [...scopeRefs].sort())) {
        return fail('scope', 'assignment-scope-mismatch', 'Event rows must cover exactly the independently derived affected typed set.');
      }
      result.scope = { status: 'complete', basis: typedPromotion ? 'actual-typed-proposal-promotion' : creation ? 'actual-decision-proposal-promotion'
        : joint ? joint.split ? 'actual-split-affected-uses' : joint.retirement ? 'actual-retirement-affected-uses' : 'actual-equivalent-merge-affected-uses'
          : typed ? 'reviewed-typed-existing-records' : 'all-allocated-knowledge-before-payloads',
        refs: affected.map(({ ref }) => ({ ...ref })), historicalRefs: historical };
      checks.scope = { status: 'passed', scope: creation ? 'actual-fresh-canonical-set-and-proposal-consumption'
        : joint ? joint.split ? 'exact-actual-split-affected-uses' : joint.retirement ? 'exact-actual-retirement-affected-uses' : 'exact-actual-merge-affected-uses'
          : typed ? 'exact-reviewed-typed-selector' : 'exact-recorded-domain-selector' };
      const oldHistory = before.assignmentHistory;
      const nextHistory = candidate.assignmentHistory;
      const oldEvents = oldHistory?.sources.events ?? [];
      const additions = nextHistory.sources.events.filter(({ document }) => !oldEvents.some((old) => old.document.event === document.event));
      if (oldEvents.some(({ document }) => document.event === input.eventId) || additions.length !== 1 || additions[0].document.event !== input.eventId
        || oldEvents.some((old) => !nextHistory.sources.events.some((next) => next.file === old.file && same(next.document, old.document)))) {
        return fail('history', 'assignment-history-not-append-only', 'Retain all old events and add exactly this one new event.');
      }
      const oldBaselines = oldHistory?.baselines ?? [];
      const transition = validateBaselineTransition({ namespace: event.namespace, before: oldBaselines, after: nextHistory.baselines });
      if (!transition.ok || !same(nextHistory.baselines.slice(0, oldBaselines.length), oldBaselines)) {
        return fail('history', 'assignment-baseline-transition', 'Baselines must retain their exact old ordered declarations.', { diagnostics: transition.diagnostics });
      }
      const adopted = nextHistory.baselines.slice(oldBaselines.length);
      const untracked = affected.filter(({ ref }) => !oldBaselines.some((row) => same(row.ref, ref)));
      if (!same(adopted.map(({ ref }) => key(ref)).sort(), untracked.map(({ ref }) => key(ref)).sort())) {
        return fail('history', 'assignment-baseline-scope', 'Adopt exactly the affected previously untracked records, without resetting any prior revision.');
      }
      if (oldHistory) {
        const file = repoPath(kitPaths.before, baselineFile);
        const oldPath = join(roots.before, file); const nextPath = join(roots.candidate, file);
        const oldBytes = readFileSync(oldPath); const nextBytes = readFileSync(nextPath);
        const appended = adopted.length > 0 && oldBytes.at(-1) === 0x0a
          && nextBytes.length > oldBytes.length && nextBytes.subarray(0, oldBytes.length).equals(oldBytes);
        if ((lstatSync(oldPath).mode & 0o777) !== (lstatSync(nextPath).mode & 0o777)
          || (!oldBytes.equals(nextBytes) && !appended)) {
          return fail('history', 'assignment-baseline-bytes-changed', 'Retained baseline bytes and mode must remain exact; new declarations require a literal YAML suffix.');
        }
      }
      // Reuse the only chain engine; adding an unrelated future event cannot
      // make an incorrect local before revision look valid.
      const chain = validateAssignmentHistoryChain({ namespace: event.namespace, baselines: nextHistory.baselines, events: nextHistory.events });
      if (!chain.ok) return fail('history', 'assignment-history-invalid', 'Full candidate history must replay.', { diagnostics: chain.diagnostics });
      checks.history = { status: 'passed', scope: 'complete-retained-chain-and-baseline-transition' };
      // Source identity only: later eligibility, preservation or impact may fail.
      // The runner independently retains raw bytes; this hint is not a capture.
      if (prepared) result.eventSource = { file: repoPath(kitPaths.candidate, source.file),
        eventId: event.event, eventDigest: assignmentEventDigest(event),
        candidate: { commit: snapshot.candidate.commit, tree: snapshot.candidate.tree, kitPath: kitPaths.candidate } };
      const allowed = new Set([repoPath(kitPaths.candidate, source.file), repoPath(kitPaths.candidate, baselineFile)]);
      const countBytes = (bytes) => { result.used.captureBytes += bytes.length; return result.used.captureBytes <= limits.maxCaptureBytes; };
      const files = new Map();
      if (creation) {
        for (const change of creation.plan.changes) {
          const file = change.file;
          const prior = captureCommittedFile({ repoRoot: input.repoRoot, commit: input.before.commit, file });
          const after = captureCommittedFile({ repoRoot: input.repoRoot, commit: input.candidate.commit, file });
          const bytes = readFileSync(join(roots.candidate, file));
          if (![prior.bytes, after.bytes, bytes].every(countBytes)) {
            return fail('captures', 'assignment-byte-budget', 'Actual proposal transformation captures exceed the assignment allowance.');
          }
          if (!same(prior.locator, change.before.capture) || prior.mode !== change.before.mode || after.mode !== change.after.mode
            || !after.bytes.equals(change.after.bytes) || !bytes.equals(after.bytes)
            || !prior.bytes.equals(readFileSync(join(roots.before, file)))) {
            return fail('preservation', 'promotion-candidate-transformation-mismatch', 'Every actual candidate file and mode must equal the fixed committed-source transformation.', { file });
          }
          allowed.add(file);
          files.set(file, { candidateBytes: bytes, afterCapture: detachedCapture(after.locator), objectFormat: after.objectFormat });
          creation.output.promotion.files.push({ file, before: { mode: prior.mode, capture: prior.locator },
            after: { mode: after.mode, capture: after.locator } });
        }
      }
      if (joint?.split) {
        const registry = joint.core.registry;
        if (registry.file !== repoPath(kitPaths.candidate, 'subjects/registry.yaml')
          || !same(registry.events, joint.request.operation.registryEvents)) {
          return fail('captures', 'assignment-split-registry-mismatch', 'Require the exact actual split registry and ordered events.');
        }
        for (const name of ['registry', 'identity']) {
          const file = repoPath(kitPaths.candidate, name === 'registry' ? 'subjects/registry.yaml' : '_identity.yaml');
          let beforeMode;
          for (const side of ['before', 'candidate']) {
            const captured = captureCommittedFile({ repoRoot: input.repoRoot, commit: input[side].commit, file });
            if (!countBytes(captured.bytes)) return fail('captures', 'assignment-byte-budget', 'Actual authority recapture exceeds the assignment allowance.');
            const path = join(roots[side], file); const stat = lstatSync(path);
            const bytes = readFileSync(path);
            if (!countBytes(bytes)) return fail('captures', 'assignment-byte-budget', 'Materialized authority reread exceeds the assignment allowance.');
            if (side === 'before') beforeMode = captured.mode;
            const expected = name === 'registry' ? registry[`${side}Capture`] : joint.core.allocation[side].capture;
            const mode = name === 'registry' ? beforeMode : joint.core.allocation[side].mode;
            if (!stat.isFile() || (stat.mode & 0o777) !== parseInt(captured.mode.slice(-3), 8)
              || captured.mode !== mode || !same(captured.locator, expected) || !bytes.equals(captured.bytes)) {
              return fail('captures', `assignment-split-${name}-mismatch`, 'Actual source, bytes and mode must equal the core authority proof.', { side });
            }
          }
          allowed.add(file);
        }
      } else if (joint) {
        const registry = joint.core.registry; const file = repoPath(kitPaths.candidate, 'subjects/registry.yaml');
        if (registry.file !== file || !same(registry.events, joint.request.operation.registryEvents)) {
          return fail('captures', joint.retirement ? 'assignment-retirement-registry-mismatch' : 'assignment-merge-registry-mismatch',
            'The registry exception requires the exact actual registry path and ordered events.');
        }
        let beforeMode;
        for (const side of ['before', 'candidate']) {
          const captured = captureCommittedFile({ repoRoot: input.repoRoot, commit: input[side].commit, file });
          if (side === 'before') beforeMode = captured.mode;
          if (!countBytes(captured.bytes)) return fail('captures', 'assignment-byte-budget', 'Actual registry correspondence exceeds the assignment capture budget.');
          if (captured.mode !== beforeMode || !same(captured.locator, registry[`${side}Capture`]) || !captured.bytes.equals(readFileSync(join(roots[side], file)))) {
            return fail('captures', joint.retirement ? 'assignment-retirement-registry-mismatch' : 'assignment-merge-registry-mismatch',
              'Core registry captures must equal these actual commit and snapshot bytes.', { side });
          }
        }
        allowed.add(file);
      }
      for (const row of affected) {
        const declared = event.rows.find(({ ref }) => same(ref, row.ref));
        const file = repoPath(kitPaths.before, row.entry.file); allowed.add(file);
        if (creation) {
          const group = files.get(file);
          if (!group) return fail('captures', 'promotion-candidate-transformation-mismatch', 'Every created canonical owner must occur in an actual verified transformed file.', { ref: row.ref });
          const after = selectCapturedRecord({ model: candidate, ref: row.ref, kitPath: kitPaths.candidate, file, bytes: group.candidateBytes });
          if (!after.ok || !same(group.afterCapture, declared['after-capture'])
            || !verifyCapturedBytes({ locator: declared['after-capture'], bytes: group.candidateBytes, objectFormat: group.objectFormat }).ok) {
            return fail('captures', 'assignment-record-capture-mismatch', 'Creation captures must bind the actual canonical candidate occurrence and complete file.', { ref: row.ref });
          }
          const state = readAssignments(after.entry); const baseline = adopted.find(({ ref }) => same(ref, row.ref));
          if (declared.before !== null || declared['before-capture'] !== null || declared['before-revision'] !== null
            || declared['after-revision'] !== 0 || declared.disposition !== 'created' || !same(state, declared.after)
            || !baseline || !same(baseline.origin, { kind: 'creation', event: event.event })
            || !same(baseline.state, state) || !same(baseline.capture, group.afterCapture)) {
            return fail('history', 'promotion-genesis-mismatch', 'Canonical absence and exact revision-zero birth state/capture/origin must agree with the actual candidate.', { ref: row.ref });
          }
          const change = { before: null, candidate: { ref: row.ref, entry: after.entry },
            governance: typedPromotion ? contexts.candidate.subjectGovernance : undefined };
          const redirectBudget = { redirects: limits.maxRedirects - result.used.redirects };
          if (creation.continued) {
            creation.budget.assertActive();
            creation.budget.charge('validationSteps', 1, 'record-promotion-genesis-row');
            creation.budget.guard({ ref: row.ref, record: after.entry.record, file: after.entry.file }, 'record-promotion-genesis-row');
          }
          const eligibility = creation.continued && contexts.candidate.subjectGovernance
            ? validateContinuedAssignmentChange(change, { budget: redirectBudget, operationBudget: creation.budget })
            : validateAssignmentChange(change, { purpose: 'new-assignment', budget: redirectBudget });
          result.used.redirects += eligibility.used.redirects;
          result.rows.push({ ref: row.ref, eligibility, preservation: { ok: true, diagnostics: [], scope: 'exact-captured-proposal-transformation' } });
          if (!eligibility.ok) return fail('eligibility', 'assignment-ineligible', 'Actual newly effective assignment checks refused.', { ref: row.ref, diagnostics: eligibility.diagnostics });
          continue;
        }
        if (!files.has(file)) {
          const captured = captureCommittedFile({ repoRoot: input.repoRoot, commit: snapshot.before.commit, file });
          const path = join(roots.candidate, file); const stat = lstatSync(path);
          if (!stat.isFile() || (stat.mode & 0o777) !== (Number.parseInt(captured.mode, 8) & 0o777)) return fail('preservation', 'assignment-file-mode-changed', 'Selected record must remain an unchanged-mode regular file.', { ref: row.ref });
          const candidateBytes = readFileSync(path);
          if (!countBytes(captured.bytes) || !countBytes(candidateBytes)) return fail('captures', 'assignment-byte-budget', 'Captured record bytes exceed the supplied gate budget.');
          const afterCapture = describeCandidateBytes({ file, bytes: candidateBytes, objectFormat: captured.objectFormat });
          if (prepared) {
            const committed = captureCommittedFile({ repoRoot: input.repoRoot, commit: snapshot.candidate.commit, file });
            if (!countBytes(committed.bytes)) return fail('captures', 'assignment-byte-budget', 'Candidate committed capture exceeds the supplied gate byte budget.');
            if (!committed.bytes.equals(candidateBytes) || committed.mode !== captured.mode
              || !same(detachedCapture(committed.locator), afterCapture)) {
              return fail('captures', 'assignment-candidate-membership-mismatch', 'Materialized candidate record must match its actual committed regular file.', { ref: row.ref });
            }
          }
          files.set(file, { kind: row.ref.kind, captured, candidateBytes, afterCapture, rows: [] });
        }
        const group = files.get(file);
        if (group.kind !== row.ref.kind) return fail('captures', 'assignment-record-capture-mismatch', 'One physical record file cannot have conflicting owner kinds.');
        const { captured, candidateBytes, afterCapture } = group;
        const prior = selectCapturedRecord({ model: before, ref: row.ref, kitPath: kitPaths.before, file, bytes: captured.bytes });
        const after = selectCapturedRecord({ model: candidate, ref: row.ref, kitPath: kitPaths.candidate, file, bytes: candidateBytes });
        if (!prior.ok || !after.ok || !same(captured.locator, declared['before-capture']) || !same(afterCapture, declared['after-capture'])
          || !verifyCapturedBytes({ locator: declared['after-capture'], bytes: candidateBytes, objectFormat: captured.objectFormat }).ok) {
          return fail('captures', 'assignment-record-capture-mismatch', 'Actual whole-file bytes, canonical occurrence and declared captures must agree.', { ref: row.ref });
        }
        const beforeState = readAssignments(prior.entry); const afterState = readAssignments(after.entry);
        const revision = oldHistory?.revisions.find(({ ref }) => same(ref, row.ref))?.revision ?? 0;
        if (!same(beforeState, declared.before) || !same(afterState, declared.after) || declared['before-revision'] !== revision) {
          return fail('history', 'assignment-record-state-mismatch', 'Event snapshots and revision must describe the exact actual record states.', { ref: row.ref });
        }
        const baseline = adopted.find(({ ref }) => same(ref, row.ref));
        if (baseline && (!same(baseline.state, beforeState) || !same(baseline.capture, captured.locator))) {
          return fail('history', 'assignment-adoption-mismatch', 'New baseline must preserve the verified actual before state and capture.', { ref: row.ref });
        }
        const assignmentChange = { before: { ref: row.ref, entry: prior.entry }, candidate: { ref: row.ref, entry: after.entry },
          governance: contexts.candidate.subjectGovernance };
        const redirectBudget = { redirects: limits.maxRedirects - result.used.redirects };
        const eligibility = joint?.split
          ? (joint.continued ? validateContinuedAssignmentChange : validateSubjectSplitAssignmentChange)(assignmentChange, { budget: redirectBudget, operationBudget: joint.operationBudget })
          : joint && !joint.split && joint.operationBudget
            ? validateContinuedAssignmentChange(assignmentChange, { budget: redirectBudget, operationBudget: joint.operationBudget })
          : continuation ? validateContinuedAssignmentChange(assignmentChange, { budget: redirectBudget, operationBudget: continuedBudget })
          : validateAssignmentChange(assignmentChange, { purpose: 'new-assignment', budget: redirectBudget });
        result.used.redirects += eligibility.used.redirects;
        const changed = !assignmentEqual(beforeState, afterState);
        const noteState = afterState.state === 'unknown' ? 'unknown (classification withdrawn)'
          : afterState.ids.length ? afterState.ids.join(', ') : 'explicit empty';
        const note = changed && row.ref.kind === 'knowledge' ? { type: 'revision', date: input.reviewNote.date,
          text: `Classification review by ${input.reviewNote.author} using ${input.reviewNote.skill}: subjects ${noteState}. Existing evidence metadata retained.` } : null;
        if (!typed && changed && afterState.state !== 'known') return fail('captures', 'assignment-after-unknown', 'A changed classification must record a known after assignment list.', { ref: row.ref });
        group.rows.push({ ref: row.ref, reviewNote: note });
        const preservation = typed ? { status: 'not-performed' }
          : validateAssignmentPreservation({ file, beforeBytes: captured.bytes, candidateBytes, reviewNote: note });
        result.rows.push({ ref: row.ref, eligibility, preservation });
        if (!eligibility.ok) return fail('eligibility', 'assignment-ineligible', 'Actual newly effective assignment checks refused.', { ref: row.ref, diagnostics: eligibility.diagnostics });
        if (!typed && !preservation.ok) return fail('preservation', 'assignment-preservation-failed', 'Record bytes changed outside the allowed subjects edit and exact note suffix.', { ref: row.ref, diagnostics: preservation.diagnostics });
      }
      if (typed && !creation) for (const [file, group] of files) {
        const preservation = validateTypedAssignmentPreservation({ kind: group.kind, file, beforeBytes: group.captured.bytes,
          candidateBytes: group.candidateBytes, rows: group.rows });
        for (const { ref } of group.rows) result.rows.find((row) => same(row.ref, ref)).preservation = preservation;
        if (!preservation.ok) return fail('preservation', 'assignment-preservation-failed', 'Whole-file bytes differ outside the jointly selected assignment spans and permitted Knowledge note suffix.', { file, diagnostics: preservation.diagnostics });
      }
      for (const file of snapshot.changedPaths()) if (!allowed.has(file)) return fail('preservation', 'assignment-unselected-path-changed', 'The first operation cannot change any unselected or unrelated path.', { file });
      if (creation) creation.output.promotion.status = 'passed';
      checks.captures = { status: 'passed', scope: prepared ? 'both-commit-memberships-and-actual-record-bytes' : 'before-commit-membership-and-actual-staged-record-bytes' };
      if (prepared) checks.candidateCommitMembership = { status: 'passed', scope: 'actual-candidate-commit-tree-and-selected-regular-files' };
      checks.eligibility = { status: 'passed', scope: 'actual-newly-effective-subject-assignments' };
      checks.preservation = { status: 'passed', scope: 'whole-changed-path-set-and-selected-file-bytes' };
      const authorizer = resolveRecord(before.identityIndex, event.decision);
      const authorizerAfter = resolveRecord(candidate.identityIndex, event.decision);
      if (authorizer.status !== 'loaded' || authorizerAfter.status !== 'loaded' || !same(authorizer.entry, authorizerAfter.entry)) return fail('authorizer', 'assignment-authorizer-changed', 'The first operation requires an existing unchanged current authorizer.');
      const decisionFile = repoPath(kitPaths.before, authorizer.entry.file);
      const retained = captureCommittedFile({ repoRoot: input.repoRoot, commit: snapshot.before.commit, file: decisionFile });
      if (!countBytes(retained.bytes)) return fail('authorizer', 'assignment-byte-budget', 'Decision capture exceeds the supplied gate byte budget.');
      const selected = selectCapturedRecord({ model: before, ref: event.decision, kitPath: kitPaths.before, file: decisionFile, bytes: retained.bytes });
      if (!selected.ok || !same(detachedCapture(retained.locator), detachedCapture(event.review['decision-capture']))) return fail('authorizer', 'assignment-authorizer-capture', 'Review must bind the actual current unchanged authorizer bytes.');
      // A supplied historical source pair is not a membership assertion. When
      // present, verify it independently with the shared retained-file reader.
      const reviewCapture = event.review['decision-capture'];
      if (reviewCapture.source && !same(retained.locator, reviewCapture)) {
        const historical = captureCommittedFile({ repoRoot: input.repoRoot, commit: reviewCapture.source.commit, file: reviewCapture.file });
        if (!countBytes(historical.bytes)) return fail('authorizer', 'assignment-byte-budget', 'Retained historical Decision capture exceeds the supplied gate byte budget.');
        if (!same(historical.locator, reviewCapture)) return fail('authorizer', 'assignment-authorizer-source', 'Decision source membership differs from its declared locator.');
      }
      const evidence = verifyDecisionEvidence({ decision: event.decision, acceptedStatus: event.review['accepted-status'], decisionDigest: event.review['decision-digest'],
        decisionCapture: reviewCapture, captures: [{ capture: reviewCapture, bytes: retained.bytes, objectFormat: retained.objectFormat }] });
      if (evidence.status !== 'verified') return fail('authorizer', 'assignment-authorizer-evidence', 'Actual shared Decision evidence verification refused.', { diagnostics: evidence.diagnostics });
      if (joint && !same(joint.core.decision, { ref: event.decision, reference: event.review.reference,
        acceptedStatus: event.review['accepted-status'], decisionDigest: event.review['decision-digest'], decisionCapture: reviewCapture })) {
        return fail('authorizer', joint.split ? 'assignment-split-decision-mismatch' : joint.retirement ? 'assignment-retirement-decision-mismatch' : 'assignment-merge-decision-mismatch',
          'Registry and assignment reviews must retain the same complete actual Decision tuple.');
      }
      checks.authorizer = { status: 'passed', scope: 'current-unchanged-decision-and-review-byte-evidence', humanAttention: 'not-authenticated' };
      for (const [name, compare] of [['routes', compareSubjectRoutes], ['regeneratedViews', compareSubjectTreeViews]]) {
        if (input.impact[name]) result.optionalImpact[name] = compare({ version: 1,
          before: { capturedInputRef: canonicalSha256(result.inputs.before), context: contexts.before },
          after: { capturedInputRef: canonicalSha256(result.inputs.candidate), context: contexts.candidate }, ...input.impact[name] });
      }
      if (input.impact.representativeReplays) result.optionalImpact.representativeReplays = (typed ? compareTypedAssignmentReplays : compareAssignmentReplays)({ version: 1,
        before: { capturedInputRef: canonicalSha256(result.inputs.before), context: contexts.before },
        after: { capturedInputRef: canonicalSha256(result.inputs.candidate), context: contexts.candidate },
        ...input.impact.representativeReplays });
      if (typed && input.impact.representativeReplays && result.optionalImpact.representativeReplays.status === 'complete') {
        const changed = new Set(event.rows.filter(row => row.disposition === 'changed').map(row => key(row.ref)));
        for (const replay of result.optionalImpact.representativeReplays.comparison.cases) {
          const baseline = ['all', 'none'].includes(replay.specification.query.where.op);
          for (const category of ['strict', 'possible']) {
            const delta = replay.candidates[category];
            if (replay.candidates.status !== 'exact' || delta.status !== 'exact'
              || [...delta.added, ...delta.removed].some(row => baseline || !row.ref || !changed.has(key(row.ref)))) {
              return fail('impactPolicy', 'typed-assignment-replay-scope', 'Membership deltas must remain within actual changed assignment owners; all/none membership is invariant.');
            }
          }
        }
      }
      const missing = input.impact.required.filter((name) => result.optionalImpact[name].status !== 'complete');
      if (missing.length) return fail('impactPolicy', 'assignment-required-impact-incomplete', 'Required impact classes cannot be waived by missing or incomplete assessments.', { required: missing });
      checks.impactPolicy = typedPromotion ? { status: 'not-performed', scope: 'typed-promotion-impacts-owned-by-outer-gate' }
        : creation ? { status: 'passed', scope: 'actual-decisions-only-capabilities-and-creation-obligations', required: [] }
        : joint ? { status: 'not-performed', scope: joint.split ? 'split-impacts-owned-by-outer-gate' : joint.retirement ? 'retirement-impacts-owned-by-outer-gate' : 'joint-merge-impacts-owned-by-outer-gate' }
        : { status: 'passed', scope: 'explicit-supplied-required-impact-classes', required: [...input.impact.required] };
      if (continuedBudget) continuedBudget.assertActive();
      result.ok = true;
      if (typedPromotion) completeTypedPromotion(creation, roots, models, result);
      return result;
    });
  } catch (error) {
    if ((continuation || creation?.continued) && (error instanceof SubjectError || error instanceof CapturedInputError)) return fail('eligibility', error.code, error.message);
    if ((joint?.split || joint?.operationBudget) && error instanceof SubjectError) return fail('eligibility', error.code, error.message);
    if (!Number.isInteger(error?.errno)) rethrowIfBug(error);
    return fail('source', 'assignment-snapshot-unavailable', error.message);
  } finally {
    if (continuedBudget) result.continuation.governance = { used: continuedBudget.used, failure: continuedBudget.failure };
    // Awaited snapshot cleanup precedes this refresh, including every refusal.
    if (joint?.core && joint.operationBudget) joint.core.resources.governance = {
      used: joint.operationBudget.used, failure: joint.operationBudget.failure };
  }
}
