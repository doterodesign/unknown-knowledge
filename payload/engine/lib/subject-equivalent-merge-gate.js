import { admitContinuedMergeWire, lifecycleMaterialPresent } from './subject-lifecycle-input.js';
import { decodePreparedSubjectLifecycleInput } from './prepared-subject-lifecycle-input.js';
/** Read-only joint merge gate; final retained review and publication remain external. */
import { isDeepStrictEqual as same } from 'node:util';
import { dirname, relative } from 'node:path';
import { admitEquivalentMergeInput } from './subject-equivalent-merge-input.js';
import { runPreparedSubjectUseAssignmentGate, runAdmittedSubjectMergeAssignmentGate } from './assignment-gate.js';
import { readCommittedTree, withTreeSnapshot, changedTreePaths } from './commit-snapshot.js';
import { inspectEquivalentMergeAssignmentScope, inspectContinuedMergeAssignmentScope } from './subject-transition-core.js';
import { loadContinuedLifecycleContext } from './subject-lifecycle-context.js';
import { validateSubjectGovernanceCapture } from './subject-governance.js';
import { validateAssignmentHistoryChain } from './subject-history.js';
import { runChecks } from '../commands/validate.js';
import { locateKitRoot } from './kit-root.js';
import { loadSubjectQueryContext } from './subject-query-context.js';
import { captureCommittedFile } from './captured-source.js';
import { assignmentEventDigest } from './assignment-event.js';
import { canonicalSha256, canonicalJsonBytes, CapturedInputError } from './canonical-json.js';
import { assessEquivalentMergeImpacts } from './subject-equivalent-merge-impact.js';
import { rethrowIfBug } from './engine-refusal.js';
import { SubjectError } from './subjects.js';

const checks = ['admission', 'models', 'registry', 'authoredReferences', 'assignments', 'decision', 'preservation', 'impacts'];
const coreFailureCheck = (code) => code?.startsWith('merge-authorizer') ? 'decision'
  : ['merge-inventory-incomplete', 'merge-retained-unknown-scope', 'merge-retained-unknown-changed',
    'merge-source-use-unsupported', 'merge-graph-use-unsupported', 'merge-assignment-substitution'].includes(code) ? 'authoredReferences' : 'registry';

/** No retained owner result, caller model or approval flag is accepted as input. */
export async function runPreparedEquivalentMergeGate(input) {
  return runMerge(admitEquivalentMergeInput(input));
}

export async function runPreparedEquivalentMergeGateFromWire({ repoRoot, gateInput }) {
  return lifecycleMaterialPresent(gateInput) ? runMerge(admitContinuedMergeWire(repoRoot, gateInput))
    : runPreparedEquivalentMergeGate(decodePreparedSubjectLifecycleInput(repoRoot, gateInput, 'merge-equivalent'));
}

async function runMerge(admitted) {
  const operationBudget = admitted.continuation?.operationBudget;
  const result = { version: admitted.continuation ? 2 : 1, kind: 'subject-equivalent-merge-gate', mode: 'read-only-prepared-equivalent-merge',
    ok: false, publicationReady: false, inputDigest: null, inputs: null, operation: null,
    sources: { registryCapture: null, registryEvents: [], assignmentEvent: null }, decision: null,
    checks: Object.fromEntries(checks.map((name) => [name, { status: 'not-performed' }])),
    authoredReferenceClosure: { status: 'not-performed', semanticCompleteness: 'unknown', affectedRefs: [], retainedUnknowns: [] },
    inventory: null, assignments: null,
    impacts: { reach: null, subjectTree: null, representativeReplays: null,
      routes: { status: 'requires-final-capability', scope: 'kit-managed-subject-route-persistence', externalInventory: 'unknown' } },
    resources: { limits: null, governance: null }, diagnostics: [] };
  const roots = [];
  const stable = (value) => {
    if (typeof value === 'string') {
      for (const [root, label] of roots) value = value.replaceAll(root, label);
      // The materializer can refuse before its callback exposes a root.
      return value.replace(/(?:\/[^\s"']*)?\/unknown-knowledge-(?:commit|tree)-[^/\s"']+/g, '<snapshot>');
    }
    if (Array.isArray(value)) return value.map(stable);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, stable(item)]));
    return value;
  };
  const fail = (check, code, message, details = {}) => {
    result.checks[check] = { status: 'failed' };
    result.diagnostics.push(stable({ code, path: check, message, ...details })); return result;
  };
  if (operationBudget) result.resources.governance = { used: operationBudget.used, failure: operationBudget.failure };
  if (!admitted.ok) return fail('admission', 'invalid-equivalent-merge-input', 'The closed merge input is invalid.', { diagnostics: admitted.diagnostics });
  const request = admitted.input;
  const zero = request.operation.assignmentEvent === null;
  if (zero) {
    result.version = 3; result.assignmentAssessment = null; result.preservation = null;
    result.resources.closure = null;
  }
  result.checks.admission.status = 'passed'; result.inputDigest = admitted.inputDigest;
  result.operation = structuredClone(request.operation); result.resources.limits = structuredClone(request.limits);
  roots.push([request.repoRoot, '<repository>']);
  try {
    for (const side of ['before', 'candidate']) {
      if (readCommittedTree(request.repoRoot, request[side].commit).tree !== request[side].tree) {
        return fail('models', 'merge-tree-mismatch', 'Both descriptors must equal their actual committed trees.', { side });
      }
    }
    if (zero) return await withTreeSnapshot(request.repoRoot, request.before.tree, prior =>
      withTreeSnapshot(request.repoRoot, request.candidate.tree, async next => {
        const sides = {};
        for (const [side, snapshot] of [['before', prior], ['candidate', next]]) {
          roots.unshift([snapshot.root, `<${side}>`], [dirname(snapshot.root), `<${side}-snapshot>`]);
          if ((relative(snapshot.root, locateKitRoot(snapshot.root)) || '.') !== request[side].kitPath) {
            return fail('models', 'merge-kit-path-mismatch', 'Actual contexts must use each declared installation path.', { side });
          }
          const loaded = operationBudget ? loadContinuedLifecycleContext({ root: snapshot.root, evidence: request.evidence, operationBudget })
            : loadSubjectQueryContext({ root: snapshot.root, ...request.evidence });
          if (!loaded.ok) return fail('models', 'merge-context-unavailable', 'Actual governed contexts must load.', { side, diagnostics: loaded.diagnostics });
          const { context } = loaded, { model } = context;
          const binding = validateSubjectGovernanceCapture(context.subjectGovernance, { model }, operationBudget ? { operationBudget } : {});
          const errors = runChecks(model, snapshot.root).filter(row => row.severity === 'error');
          const history = model.assignmentHistory;
          const chain = history ? validateAssignmentHistoryChain({ namespace: model.identity.namespace,
            baselines: history.baselines, events: history.events }) : null;
          if (!binding.ok || errors.length || (chain && !chain.ok)) return fail('models', 'merge-model-invalid',
            'Actual structure, governance and assignment history must validate.', { side, diagnostics: [...binding.diagnostics, ...errors, ...(chain?.diagnostics ?? [])] });
          sides[side] = { descriptor: request[side], root: snapshot.root, context };
        }
        result.checks.models.status = 'passed';
        const inspect = operationBudget ? inspectContinuedMergeAssignmentScope : inspectEquivalentMergeAssignmentScope;
        const core = await inspect({ repoRoot: request.repoRoot, ...sides, operation: request.operation,
          reviewNote: request.reviewNote, evidence: request.evidence, limits: { inventory: request.limits.inventory,
            governance: request.limits.governance, closure: request.limits.closure } }, operationBudget ? { operationBudget } : {});
        result.inputs = core.inputs; result.inventory = core.inventory; result.decision = core.decision;
        result.authoredReferenceClosure = core.authoredReferenceClosure;
        result.resources.governance = core.resources.governance; result.resources.closure = core.resources.closure;
        if (core.registry) {
          result.sources.registryCapture = core.registry.candidateCapture; result.sources.registryEvents = core.registry.events;
          result.checks.registry.status = 'passed';
        }
        if (!core.ok || !same(core.inputs, { before: request.before, candidate: request.candidate }) || !same(core.operation, request.operation)) {
          return fail(coreFailureCheck(core.diagnostics[0]?.code), 'merge-scope-refused', 'Actual eventless merge scope must pass.', { diagnostics: core.diagnostics });
        }
        if (core.assignments.length !== 0) return fail('assignments', 'merge-effective-use-remains', 'Eventless merge requires actually empty direct-use scope.');
        const proof = { inputs: core.inputs, operationDigest: canonicalSha256(request.operation), registryFile: core.registry.file,
          changedPaths: changedTreePaths(request.repoRoot, request.before.tree, request.candidate.tree), inventoryDigest: canonicalSha256(core.inventory) };
        const resources = result.resources.closure, requested = { rows: 1, bytes: canonicalJsonBytes(proof).length };
        for (const [counter, limit] of [['rows','maxRows'], ['bytes','maxBytes']]) if (requested[counter] > request.limits.closure[limit] - resources.used[counter]) {
          resources.failure = { code: 'merge-closure-budget', limit, used: resources.used[counter], requested: requested[counter] };
          return fail('preservation', 'merge-closure-budget', 'The complete preservation proof must fit the remaining closure allowance.');
        }
        resources.used.rows += requested.rows; resources.used.bytes += requested.bytes;
        result.preservation = { status: 'failed', proof, proofDigest: canonicalSha256(proof) };
        if (!same(proof.changedPaths, [proof.registryFile])) return fail('preservation', 'merge-zero-use-path-changed', 'Only the actual registry path may change.');
        result.preservation.status = 'passed';
        for (const name of ['authoredReferences', 'decision', 'preservation']) result.checks[name].status = 'passed';
        result.checks.assignments.status = 'not-applicable';
        result.assignmentAssessment = { status: 'not-applicable', reason: 'zero-effective-direct-use', effectiveDirectRefs: [],
          inventoryDigest: proof.inventoryDigest, preservationDigest: result.preservation.proofDigest };
        const impact = assessEquivalentMergeImpacts({ core, limits: request.limits,
          before: { capturedInputRef: canonicalSha256(request.before), context: sides.before.context },
          after: { capturedInputRef: canonicalSha256(request.candidate), context: sides.candidate.context } });
        for (const key of ['reach','subjectTree','representativeReplays']) result.impacts[key] = impact[key];
        if (!impact.ok) return fail('impacts', 'merge-required-impact-incomplete', 'Mandatory native merge impacts must finish.', { diagnostics: impact.diagnostics });
        result.checks.impacts.status = 'passed'; result.ok = true; return result;
      }));
    const actual = await (operationBudget ? runAdmittedSubjectMergeAssignmentGate(request, { operationBudget })
      : runPreparedSubjectUseAssignmentGate(request));
    const { core, assignment } = actual;
    result.assignments = assignment;
    if (assignment.checks.models.status === 'passed') result.checks.models.status = 'passed';
    if (core) {
      result.inputs = core.inputs; result.inventory = core.inventory;
      result.authoredReferenceClosure = core.authoredReferenceClosure; result.decision = core.decision;
      result.resources.governance = core.resources.governance;
      if (core.registry) {
        result.sources.registryCapture = core.registry.candidateCapture; result.sources.registryEvents = core.registry.events;
        result.checks.registry.status = 'passed';
      }
      if (core.authoredReferenceClosure.status === 'complete') result.checks.authoredReferences.status = 'passed';
      if (!core.ok) return fail(coreFailureCheck(core.diagnostics[0]?.code), 'merge-scope-refused',
        'The actual registry and authored-reference checks refused.', { diagnostics: core.diagnostics });
    }
    if (!assignment.ok || !core) {
      for (const [target, owner] of [['models', 'models'], ['decision', 'authorizer'], ['preservation', 'preservation']]) {
        if (assignment.checks[owner].status === 'failed') result.checks[target].status = 'failed';
      }
      return fail('assignments', 'merge-assignment-refused', 'The shared actual assignment checks refused.', { diagnostics: assignment.diagnostics });
    }
    if (!same(core.inputs, { before: request.before, candidate: request.candidate }) || !same(core.operation, request.operation)
      || !same(assignment.eventSource?.candidate, request.candidate)
      || assignment.eventSource.eventId !== request.operation.assignmentEvent.id
      || assignment.eventSource.eventDigest !== request.operation.assignmentEvent.changeDigest) {
      return fail('assignments', 'merge-owner-binding-mismatch', 'Actual owner results must bind the complete admitted pair, operation and event.');
    }
    for (const name of ['models', 'registry', 'authoredReferences', 'assignments', 'decision', 'preservation']) result.checks[name].status = 'passed';
    return await withTreeSnapshot(request.repoRoot, request.before.tree, (prior) =>
      withTreeSnapshot(request.repoRoot, request.candidate.tree, (next) => {
        const contexts = {};
        for (const [side, snapshot] of [['before', prior], ['candidate', next]]) {
          roots.unshift([snapshot.root, `<${side}>`], [dirname(snapshot.root), `<${side}-snapshot>`]);
          if ((relative(snapshot.root, locateKitRoot(snapshot.root)) || '.') !== request[side].kitPath) {
            return fail('models', 'merge-kit-path-mismatch', 'Impact contexts must use each actual installation path.', { side });
          }
          const loaded = loadSubjectQueryContext({ root: snapshot.root, ...request.evidence });
          if (!loaded.ok) return fail('models', 'merge-impact-context-unavailable', 'Actual impact context could not be loaded.', { side, diagnostics: loaded.diagnostics });
          contexts[side] = loaded.context;
        }
        const source = contexts.candidate.model.assignmentHistory.sources.events.find(({ document }) => document.event === request.operation.assignmentEvent.id);
        const file = source && (request.candidate.kitPath === '.' ? source.file : `${request.candidate.kitPath}/${source.file}`);
        if (!source || file !== assignment.eventSource.file || assignmentEventDigest(source.document) !== request.operation.assignmentEvent.changeDigest) {
          return fail('assignments', 'merge-event-source-mismatch', 'The independently reloaded actual event must match the exact owner evidence.');
        }
        const captured = captureCommittedFile({ repoRoot: request.repoRoot, commit: request.candidate.commit, file });
        result.sources.assignmentEvent = { eventId: source.document.event, eventDigest: assignmentEventDigest(source.document), eventCapture: captured.locator };
        const impact = assessEquivalentMergeImpacts({ core, limits: request.limits,
          before: { capturedInputRef: canonicalSha256(request.before), context: contexts.before },
          after: { capturedInputRef: canonicalSha256(request.candidate), context: contexts.candidate } });
        result.impacts.reach = impact.reach; result.impacts.subjectTree = impact.subjectTree;
        result.impacts.representativeReplays = impact.representativeReplays;
        if (!impact.ok) return fail('impacts', 'merge-required-impact-incomplete', 'The mandatory lifecycle impacts did not finish.', { diagnostics: impact.diagnostics });
        result.checks.impacts.status = 'passed'; result.ok = true; return result;
      }));
  } catch (error) {
    if (!(error instanceof SubjectError || error instanceof CapturedInputError)) rethrowIfBug(error);
    result.ok = false;
    return fail('models', error.code ?? 'merge-source-unavailable', 'The actual merge operation could not be completed.', { detail: error.message });
  } finally {
    if (operationBudget) result.resources.governance = { used: operationBudget.used, failure: operationBudget.failure };
  }
}
