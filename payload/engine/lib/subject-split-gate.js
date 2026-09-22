import { admitContinuedSplitWire, lifecycleMaterialPresent } from './subject-lifecycle-input.js';
import { decodePreparedSubjectSplitInput } from './prepared-subject-lifecycle-input.js';
/** Fixed actual split composition; reports never substitute for original inputs. */
import { isDeepStrictEqual as same } from 'node:util';
import { dirname, relative } from 'node:path';
import { admitSubjectSplitInput } from './subject-split-input.js';
import { runPreparedSubjectSplitAssignmentGate, runAdmittedSubjectSplitAssignmentGate } from './assignment-gate.js';
import { inspectSubjectSplitAssignmentScope, inspectContinuedSplitAssignmentScope } from './subject-split-core.js';
import { readCommittedTree, withTreeSnapshot, changedTreePaths } from './commit-snapshot.js';
import { locateKitRoot } from './kit-root.js';
import { loadStores } from './load-stores.js';
import { loadSubjectQueryContext } from './subject-query-context.js';
import { validateSubjectGovernanceCapture } from './subject-governance.js';
import { captureCommittedFile } from './captured-source.js';
import { assignmentEventDigest } from './assignment-event.js';
import { canonicalSha256, canonicalJsonBytes, CapturedInputError } from './canonical-json.js';
import { assessSubjectSplitImpacts } from './subject-transition-impact.js';
import { rethrowIfBug } from './engine-refusal.js';
import { SubjectError } from './subjects.js';

const checks = ['admission', 'models', 'registry', 'allocation', 'authoredReferences', 'assignments',
  'decision', 'preservation', 'candidateCommitMembership', 'impacts'];
const coreFailure = code => code?.includes('authorizer') ? 'decision'
  : /(?:allocation|identity|ledger)/.test(code) ? 'allocation'
    : /(?:changed|preservation)/.test(code) ? 'preservation'
      : /(?:closure|historical|inherited|parent|unknown|source-use|assignment|inventory|graph)/.test(code) ? 'authoredReferences' : 'registry';

export async function runPreparedSubjectSplitGate(input) {
  return runSplit(admitSubjectSplitInput(input));
}

export async function runPreparedSubjectSplitGateFromWire({ repoRoot, gateInput }) {
  return lifecycleMaterialPresent(gateInput) ? runSplit(admitContinuedSplitWire(repoRoot, gateInput))
    : runPreparedSubjectSplitGate(decodePreparedSubjectSplitInput(repoRoot, gateInput));
}

async function runSplit(admitted) {
  const operationBudget = admitted.continuation?.operationBudget;
  const result = { version: admitted.continuation ? 2 : 1, kind: 'subject-split-gate', mode: 'read-only-prepared-split',
    ok: false, publicationReady: false, inputDigest: null, inputs: null, operation: null,
    sources: { registryCapture: null, identityCapture: null, registryEvents: [], assignmentEvent: null },
    decision: null, allocation: null, assessment: null,
    checks: Object.fromEntries(checks.map(name => [name, { status: 'not-performed' }])),
    authoredReferenceClosure: { status: 'not-performed', semanticCompleteness: 'unknown', affectedRefs: [],
      retainedUnknowns: [], retainedHistoricalUses: [], retainedParents: [], retainedInheritedUses: [], successorParents: [] },
    inventory: null, assignments: null, assignmentAssessment: null, preservation: null,
    impacts: { reach: null, subjectTree: null, representativeReplays: null,
      routes: { status: 'requires-final-capability', scope: 'kit-managed-subject-route-persistence', externalInventory: 'unknown' } },
    resources: { limits: null, governance: null, closure: null, allocation: null }, diagnostics: [] };
  const roots = []; let zeroBundle;
  const stable = value => {
    if (typeof value === 'string') {
      for (const [root, label] of roots) value = value.replaceAll(root, label);
      return value.replace(/(?:\/[^\s"']*)?\/unknown-knowledge-(?:commit|tree)-[^/\s"']+/g, '<snapshot>');
    }
    if (Array.isArray(value)) return value.map(stable);
    return value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, stable(item)])) : value;
  };
  const fail = (check, code, message, details = {}) => {
    result.ok = false; result.checks[check].status = 'failed';
    result.diagnostics.push(stable({ code, path: check, message, ...details })); return result;
  };
  if (operationBudget) result.resources.governance = { used: operationBudget.used, failure: operationBudget.failure };
  if (!admitted.ok) return fail('admission', 'invalid-subject-split-input', 'The closed split input is invalid.', { diagnostics: admitted.diagnostics });
  const request = admitted.input;
  result.checks.admission.status = 'passed'; result.inputDigest = admitted.inputDigest;
  result.operation = structuredClone(request.operation); result.resources.limits = structuredClone(request.limits);
  roots.push([request.repoRoot, '<repository>']);
  const adoptCore = core => {
    if (!core) return false;
    for (const key of ['inputs', 'inventory', 'decision', 'allocation', 'assessment', 'authoredReferenceClosure']) result[key] = core[key];
    for (const key of ['governance', 'closure', 'allocation']) result.resources[key] = core.resources[key];
    if (core.registry) {
      result.sources.registryCapture = core.registry.candidateCapture; result.sources.registryEvents = core.registry.events;
      result.checks.registry.status = 'passed';
    }
    if (core.allocation) {
      result.sources.identityCapture = core.allocation.candidate.capture; result.checks.allocation.status = 'passed';
    }
    if (core.authoredReferenceClosure.status === 'complete') result.checks.authoredReferences.status = 'passed';
    return core.ok && same(core.inputs, { before: request.before, candidate: request.candidate }) && same(core.operation, request.operation);
  };
  // Each call materializes the same immutable pair. Impact contexts are a separate phase.
  const withPair = check => withTreeSnapshot(request.repoRoot, request.before.tree, prior =>
    withTreeSnapshot(request.repoRoot, request.candidate.tree, next => {
      const sides = {};
      for (const [side, snapshot] of [['before', prior], ['candidate', next]]) {
        roots.unshift([snapshot.root, `<${side}>`], [dirname(snapshot.root), `<${side}-snapshot>`]);
        if ((relative(snapshot.root, locateKitRoot(snapshot.root)) || '.') !== request[side].kitPath) {
          return fail('models', 'split-kit-path-mismatch', 'Actual installation paths must match both descriptors.', { side });
        }
        sides[side] = { descriptor: request[side], root: snapshot.root };
      }
      return check(sides);
    }));
  const runImpacts = core => withPair(sides => {
    for (const side of ['before', 'candidate']) {
      const loaded = loadSubjectQueryContext({ root: sides[side].root, ...request.evidence });
      if (!loaded.ok) return fail('models', 'split-impact-context-unavailable', 'Both actual impact contexts must load.', { side, diagnostics: loaded.diagnostics });
      const binding = validateSubjectGovernanceCapture(loaded.context.subjectGovernance, { model: loaded.context.model });
      const inventory = core.inventory.inputs[side];
      if (!binding.ok || inventory.registryDigest !== canonicalSha256(loaded.context.model.subjectRegistry.document)
        || inventory.identityDigest !== canonicalSha256(loaded.context.model.identity)) {
        return fail('models', 'split-impact-context-mismatch', 'Fresh impact contexts must bind the actual core authorities.', { side, diagnostics: binding.diagnostics });
      }
      sides[side].context = loaded.context;
    }
    if (request.operation.assignmentEvent !== null) {
      const source = sides.candidate.context.model.assignmentHistory.sources.events.find(({ document }) => document.event === request.operation.assignmentEvent.id);
      const file = source && (request.candidate.kitPath === '.' ? source.file : `${request.candidate.kitPath}/${source.file}`);
      const expected = result.assignments.eventSource;
      if (!source || file !== expected.file || assignmentEventDigest(source.document) !== request.operation.assignmentEvent.changeDigest) {
        return fail('assignments', 'split-event-source-mismatch', 'The reloaded event must match the exact P8 event evidence.');
      }
      const capture = captureCommittedFile({ repoRoot: request.repoRoot, commit: request.candidate.commit, file });
      result.sources.assignmentEvent = { eventId: source.document.event, eventDigest: assignmentEventDigest(source.document), eventCapture: capture.locator };
    }
    const actual = assessSubjectSplitImpacts({ core, limits: request.limits,
      before: { capturedInputRef: canonicalSha256(request.before), context: sides.before.context },
      after: { capturedInputRef: canonicalSha256(request.candidate), context: sides.candidate.context } });
    for (const key of ['reach', 'subjectTree', 'representativeReplays']) result.impacts[key] = actual[key];
    if (!actual.ok) return fail('impacts', 'split-required-impact-incomplete', 'Every fixed split impact must finish.', { diagnostics: actual.diagnostics });
    result.checks.impacts.status = 'passed';
    result.ok = Object.entries(result.checks).every(([name, { status }]) => status === 'passed'
      || (name === 'assignments' && status === 'not-applicable' && request.operation.assignmentEvent === null
        && result.assignments === null && result.assignmentAssessment?.status === 'not-applicable' && result.preservation?.status === 'passed'));
    return result;
  });
  try {
    for (const side of ['before', 'candidate']) if (readCommittedTree(request.repoRoot, request[side].commit).tree !== request[side].tree) {
      return fail('models', 'split-tree-mismatch', 'Both trees must equal their actual committed trees.', { side });
    }
    if (request.operation.assignmentEvent !== null) {
      const { core, assignment } = await (operationBudget ? runAdmittedSubjectSplitAssignmentGate(request, { operationBudget }) : runPreparedSubjectSplitAssignmentGate(request));
      result.assignments = assignment;
      for (const [name, owner] of [['models', 'models'], ['decision', 'authorizer'], ['preservation', 'preservation'], ['candidateCommitMembership', 'candidateCommitMembership']]) {
        result.checks[name].status = assignment.checks[owner].status;
      }
      if (!adoptCore(core)) return fail(coreFailure(core?.diagnostics[0]?.code), 'split-scope-refused',
        'Actual split closure and original binding must pass.', { diagnostics: core?.diagnostics ?? assignment.diagnostics });
      if (!assignment.ok || !same(assignment.eventSource?.candidate, request.candidate)
        || assignment.eventSource.eventId !== request.operation.assignmentEvent.id
        || assignment.eventSource.eventDigest !== request.operation.assignmentEvent.changeDigest) {
        return fail('assignments', 'split-assignment-refused', 'The nonempty P8 pipeline must bind its exact event and candidate.', { diagnostics: assignment.diagnostics });
      }
      result.checks.assignments.status = 'passed';
      return await runImpacts(core);
    }
    await withPair(async sides => {
      for (const side of ['before', 'candidate']) sides[side].model = loadStores(locateKitRoot(sides[side].root));
      const inspect = operationBudget ? inspectContinuedSplitAssignmentScope : inspectSubjectSplitAssignmentScope;
      zeroBundle = await inspect({ repoRoot: request.repoRoot, ...sides,
        operation: request.operation, reviewNote: request.reviewNote, evidence: request.evidence,
        limits: { inventory: request.limits.inventory, governance: request.limits.governance,
          closure: request.limits.closure, allocation: request.limits.allocation } }, operationBudget ? { operationBudget } : {});
      const { core } = zeroBundle;
      if (!adoptCore(core)) return fail(coreFailure(core.diagnostics[0]?.code), 'split-scope-refused',
        'Actual eventless split closure and original binding must pass.', { diagnostics: core.diagnostics });
      result.checks.models.status = 'passed';
      if (core.assignments.length !== 0) return fail('assignments', 'split-effective-use-remains', 'An eventless split requires actually empty direct-use scope.');
      const proof = { inputs: { before: request.before, candidate: request.candidate }, operationDigest: canonicalSha256(request.operation),
        registryFile: core.registry.file, identityFile: core.allocation.candidate.capture.file,
        changedPaths: changedTreePaths(request.repoRoot, request.before.tree, request.candidate.tree), inventoryDigest: canonicalSha256(core.inventory) };
      const resources = result.resources.closure; const cost = { rows: 1, bytes: canonicalJsonBytes(proof).length };
      for (const [counter, limit] of [['rows', 'maxRows'], ['bytes', 'maxBytes']]) if (cost[counter] > request.limits.closure[limit] - resources.used[counter]) {
        resources.failure = { code: 'split-closure-budget', limit, used: resources.used[counter], requested: cost[counter] };
        return fail('preservation', 'split-closure-budget', 'The entire eventless proof must fit the remaining closure allowance.');
      }
      resources.used.rows += cost.rows; resources.used.bytes += cost.bytes;
      result.preservation = { status: 'failed', proof, proofDigest: canonicalSha256(proof) };
      if (!same(proof.changedPaths, [proof.identityFile, proof.registryFile])) return fail('preservation', 'split-zero-use-path-changed',
        'Without assignments, exactly the identity and registry paths must change.');
      result.preservation.status = 'passed';
      for (const name of ['decision', 'preservation', 'candidateCommitMembership']) result.checks[name].status = 'passed';
      result.checks.assignments.status = 'not-applicable';
      result.assignmentAssessment = { status: 'not-applicable', reason: 'zero-effective-direct-use', effectiveDirectRefs: [],
        inventoryDigest: proof.inventoryDigest, preservationDigest: result.preservation.proofDigest };
    });
    if (result.diagnostics.length) return result;
    return await runImpacts(zeroBundle.core);
  } catch (error) {
    if (!(error instanceof SubjectError || error instanceof CapturedInputError)) rethrowIfBug(error);
    return fail('models', error.code ?? 'split-source-unavailable', 'Actual split evaluation could not be completed.', { detail: error.message });
  } finally {
    if (operationBudget) result.resources.governance = { used: operationBudget.used, failure: operationBudget.failure };
    if (zeroBundle) {
      const budget = zeroBundle.operationBudget;
      zeroBundle.core.resources.governance = result.resources.governance = { used: budget.used, failure: budget.failure };
    }
  }
}
