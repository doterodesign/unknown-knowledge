/** Actual plain retirement, with separate nonempty withdrawal and eventless proofs. */
import { isDeepStrictEqual as same } from 'node:util';
import { dirname, relative } from 'node:path';
import { admitSubjectRetirementInput } from './subject-retirement-input.js';
import { runPreparedSubjectRetirementAssignmentGate, runAdmittedSubjectRetirementAssignmentGate } from './assignment-gate.js';
import { inspectSubjectRetirementAssignmentScope, inspectContinuedRetirementAssignmentScope } from './subject-transition-core.js';
import { admitContinuedRetirementWire, lifecycleMaterialPresent } from './subject-lifecycle-input.js';
import { decodePreparedSubjectLifecycleInput } from './prepared-subject-lifecycle-input.js';
import { loadContinuedLifecycleContext } from './subject-lifecycle-context.js';
import { readCommittedTree, withTreeSnapshot, changedTreePaths } from './commit-snapshot.js';
import { locateKitRoot } from './kit-root.js';
import { loadSubjectQueryContext } from './subject-query-context.js';
import { validateSubjectGovernanceCapture } from './subject-governance.js';
import { validateAssignmentHistoryChain } from './subject-history.js';
import { runChecks } from '../commands/validate.js';
import { captureCommittedFile } from './captured-source.js';
import { assignmentEventDigest } from './assignment-event.js';
import { canonicalSha256, canonicalJsonBytes, CapturedInputError } from './canonical-json.js';
import { assessSubjectRetirementImpacts } from './subject-transition-impact.js';
import { rethrowIfBug } from './engine-refusal.js';
import { SubjectError } from './subjects.js';

const checks = ['admission', 'models', 'registry', 'authoredReferences', 'assignments', 'decision',
  'preservation', 'candidateCommitMembership', 'impacts'];
const coreFailure = code => code?.includes('authorizer') ? 'decision'
  : /(?:changed|preservation)/.test(code) ? 'preservation'
    : /(?:closure|historical|inherited|parent|unknown|source-use|assignment|inventory|graph)/.test(code) ? 'authoredReferences' : 'registry';

export async function runPreparedSubjectRetirementGate(input) {
  return runRetirement(admitSubjectRetirementInput(input));
}

/** Fixed worker boundary: continued wire is owned once and never routed through raw admission. */
export async function runPreparedSubjectRetirementGateFromWire({ repoRoot, gateInput }) {
  return lifecycleMaterialPresent(gateInput)
    ? runRetirement(admitContinuedRetirementWire(repoRoot, gateInput))
    : runPreparedSubjectRetirementGate(decodePreparedSubjectLifecycleInput(repoRoot, gateInput, 'retire'));
}

async function runRetirement(admitted) {
  const operationBudget = admitted.continuation?.operationBudget;
  const result = { version: admitted.continuation ? 2 : 1, kind: 'subject-retirement-gate', mode: 'read-only-prepared-retirement',
    ok: false, publicationReady: false, inputDigest: null, inputs: null, operation: null,
    sources: { registryCapture: null, registryEvents: [], assignmentEvent: null }, decision: null,
    checks: Object.fromEntries(checks.map(name => [name, { status: 'not-performed' }])),
    authoredReferenceClosure: { status: 'not-performed', semanticCompleteness: 'unknown', affectedRefs: [],
      retainedUnknowns: [], retainedHistoricalUses: [], retainedParents: [], retainedInheritedUses: [] },
    inventory: null, assignments: null, assignmentAssessment: null, preservation: null,
    impacts: { reach: null, subjectTree: null, representativeReplays: null,
      routes: { status: 'requires-final-capability', scope: 'kit-managed-subject-route-persistence', externalInventory: 'unknown' } },
    resources: { limits: null, governance: null, closure: null }, diagnostics: [] };
  const roots = [];
  const stable = value => {
    if (typeof value === 'string') {
      for (const [root,label] of roots) value = value.replaceAll(root,label);
      return value.replace(/(?:\/[^\s"']*)?\/unknown-knowledge-(?:commit|tree)-[^/\s"']+/g, '<snapshot>');
    }
    if (Array.isArray(value)) return value.map(stable);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key,item]) => [key,stable(item)]));
    return value;
  };
  const fail = (check, code, message, details = {}) => {
    result.ok = false;
    result.checks[check].status = 'failed'; result.diagnostics.push(stable({ code, path: check, message, ...details })); return result;
  };
  if (operationBudget) result.resources.governance = { used: operationBudget.used, failure: operationBudget.failure };
  if (!admitted.ok) return fail('admission', 'invalid-subject-retirement-input', 'The closed retirement input is invalid.', { diagnostics: admitted.diagnostics });
  const request = admitted.input;
  result.checks.admission.status = 'passed'; result.inputDigest = admitted.inputDigest;
  result.operation = structuredClone(request.operation); result.resources.limits = structuredClone(request.limits);
  roots.push([request.repoRoot, '<repository>']);
  const adoptCore = core => {
    if (!core) return false;
    result.inputs = core.inputs; result.inventory = core.inventory; result.decision = core.decision;
    result.authoredReferenceClosure = core.authoredReferenceClosure;
    result.resources.governance = core.resources.governance; result.resources.closure = core.resources.closure;
    if (core.registry) {
      result.sources.registryCapture = core.registry.candidateCapture; result.sources.registryEvents = core.registry.events;
      result.checks.registry.status = 'passed';
    }
    if (core.authoredReferenceClosure.status === 'complete') result.checks.authoredReferences.status = 'passed';
    return core.ok && same(core.inputs, { before: request.before, candidate: request.candidate }) && same(core.operation, request.operation);
  };
  // A fixed private snapshot composition; no caller contexts, reports or executors.
  const withContexts = (check, continued = false) => withTreeSnapshot(request.repoRoot, request.before.tree, prior =>
    withTreeSnapshot(request.repoRoot, request.candidate.tree, next => {
      const sides = {};
      for (const [side,snapshot] of [['before',prior],['candidate',next]]) {
        roots.unshift([snapshot.root, `<${side}>`], [dirname(snapshot.root), `<${side}-snapshot>`]);
        if ((relative(snapshot.root, locateKitRoot(snapshot.root)) || '.') !== request[side].kitPath) {
          return fail('models', 'retirement-kit-path-mismatch', 'Each actual context must use its declared installation path.', { side });
        }
        const loaded = continued
          ? loadContinuedLifecycleContext({ root: snapshot.root, evidence: request.evidence, operationBudget })
          : loadSubjectQueryContext({ root: snapshot.root, ...request.evidence });
        if (!loaded.ok) return fail('models', 'retirement-context-unavailable', 'Both actual governed contexts must load.', { side, diagnostics: loaded.diagnostics });
        const { context } = loaded; const { model } = context;
        const binding = validateSubjectGovernanceCapture(context.subjectGovernance, { model }, continued ? { operationBudget } : {});
        const diagnostics = runChecks(model, snapshot.root).filter(({severity}) => severity === 'error');
        const history = model.assignmentHistory;
        const chain = history ? validateAssignmentHistoryChain({ namespace: model.identity.namespace,
          baselines: history.baselines, events: history.events }) : null;
        if (!binding.ok || diagnostics.length || (chain && !chain.ok)) {
          return fail('models', 'retirement-model-invalid', 'Actual structure, governance and existing assignment history must validate.',
            { side, diagnostics: [...binding.diagnostics, ...diagnostics, ...(chain?.diagnostics ?? [])] });
        }
        sides[side] = { descriptor: request[side], root: snapshot.root, context };
      }
      result.checks.models.status = 'passed'; return check(sides);
    }));
  const impacts = (core, sides) => {
    const actual = assessSubjectRetirementImpacts({ core, limits: request.limits,
      before: { capturedInputRef: canonicalSha256(request.before), context: sides.before.context },
      after: { capturedInputRef: canonicalSha256(request.candidate), context: sides.candidate.context } });
    for (const key of ['reach','subjectTree','representativeReplays']) result.impacts[key] = actual[key];
    if (!actual.ok) return fail('impacts', 'retirement-required-impact-incomplete', 'Every fixed retirement impact must finish.', { diagnostics: actual.diagnostics });
    result.checks.impacts.status = 'passed';
    result.ok = Object.entries(result.checks).every(([name, {status}]) => status === 'passed'
      || (name === 'assignments' && status === 'not-applicable' && request.operation.assignmentEvent === null
        && result.assignments === null && result.assignmentAssessment?.status === 'not-applicable'
        && result.preservation?.status === 'passed'));
    return result;
  };
  try {
    for (const side of ['before','candidate']) if (readCommittedTree(request.repoRoot, request[side].commit).tree !== request[side].tree) {
      return fail('models', 'retirement-tree-mismatch', 'Both trees must equal their actual committed trees.', { side });
    }
    if (request.operation.assignmentEvent !== null) {
      const { core, assignment } = await (operationBudget
        ? runAdmittedSubjectRetirementAssignmentGate(request, { operationBudget })
        : runPreparedSubjectRetirementAssignmentGate(request));
      result.assignments = assignment;
      for (const [name, owner] of [['models','models'],['decision','authorizer'],['preservation','preservation'],['candidateCommitMembership','candidateCommitMembership']]) {
        result.checks[name].status = assignment.checks[owner].status;
      }
      if (!adoptCore(core)) return fail(coreFailure(core?.diagnostics[0]?.code), 'retirement-scope-refused',
        'Actual retirement closure and original input binding must pass.', { diagnostics: core?.diagnostics ?? assignment.diagnostics });
      if (!assignment.ok || !same(assignment.eventSource?.candidate, request.candidate)
        || assignment.eventSource.eventId !== request.operation.assignmentEvent.id
        || assignment.eventSource.eventDigest !== request.operation.assignmentEvent.changeDigest) {
        return fail('assignments', 'retirement-assignment-refused', 'The actual nonempty withdrawal pipeline must bind its exact event and candidate.', { diagnostics: assignment.diagnostics });
      }
      result.checks.assignments.status = 'passed';
      return await withContexts(sides => {
        const source = sides.candidate.context.model.assignmentHistory.sources.events.find(({document}) => document.event === request.operation.assignmentEvent.id);
        const file = source && (request.candidate.kitPath === '.' ? source.file : `${request.candidate.kitPath}/${source.file}`);
        if (!source || file !== assignment.eventSource.file || assignmentEventDigest(source.document) !== request.operation.assignmentEvent.changeDigest) {
          return fail('assignments', 'retirement-event-source-mismatch', 'The independently reloaded event must match the exact P8 evidence.');
        }
        const capture = captureCommittedFile({ repoRoot: request.repoRoot, commit: request.candidate.commit, file });
        result.sources.assignmentEvent = { eventId: source.document.event, eventDigest: assignmentEventDigest(source.document), eventCapture: capture.locator };
        return impacts(core, sides);
      });
    }
    return await withContexts(async sides => {
      const inspect = operationBudget ? inspectContinuedRetirementAssignmentScope : inspectSubjectRetirementAssignmentScope;
      const core = await inspect({ repoRoot: request.repoRoot, ...sides,
        operation: request.operation, reviewNote: request.reviewNote, evidence: request.evidence,
        limits: { inventory: request.limits.inventory, governance: request.limits.governance, closure: request.limits.closure } }, operationBudget ? { operationBudget } : {});
      if (!adoptCore(core)) return fail(coreFailure(core.diagnostics[0]?.code), 'retirement-scope-refused',
        'Actual eventless retirement closure and original input binding must pass.', { diagnostics: core.diagnostics });
      if (core.assignments.length !== 0) return fail('assignments', 'retirement-effective-use-remains', 'Eventless retirement requires an actually empty effective direct-use scope.');
      const proof = { inputs: { before: request.before, candidate: request.candidate }, operationDigest: canonicalSha256(request.operation),
        registryFile: core.registry.file, changedPaths: changedTreePaths(request.repoRoot, request.before.tree, request.candidate.tree),
        inventoryDigest: canonicalSha256(core.inventory) };
      const resources = result.resources.closure;
      const requested = { rows: 1, bytes: canonicalJsonBytes(proof).length };
      for (const [counter,limit] of [['rows','maxRows'],['bytes','maxBytes']]) if (requested[counter] > request.limits.closure[limit] - resources.used[counter]) {
        resources.failure = { code: 'retirement-closure-budget', limit, used: resources.used[counter], requested: requested[counter] };
        return fail('preservation', 'retirement-closure-budget', 'The complete zero-use preservation proof must fit the remaining closure allowance.');
      }
      resources.used.rows += requested.rows; resources.used.bytes += requested.bytes;
      result.preservation = { status: 'failed', proof, proofDigest: canonicalSha256(proof) };
      if (!same(proof.changedPaths, [proof.registryFile])) return fail('preservation', 'retirement-zero-use-path-changed',
        'Without withdrawals, the registry must be the only actual changed path.');
      result.preservation.status = 'passed';
      for (const name of ['decision','preservation','candidateCommitMembership']) result.checks[name].status = 'passed';
      result.checks.assignments.status = 'not-applicable';
      result.assignmentAssessment = { status: 'not-applicable', reason: 'zero-effective-direct-use', effectiveDirectRefs: [],
        inventoryDigest: proof.inventoryDigest, preservationDigest: result.preservation.proofDigest };
      return impacts(core, sides);
    }, Boolean(operationBudget));
  } catch (error) {
    if (!(error instanceof SubjectError || error instanceof CapturedInputError)) rethrowIfBug(error);
    return fail('models', error.code ?? 'retirement-source-unavailable', 'Actual retirement could not be completed.', { detail: error.message });
  } finally {
    if (operationBudget) result.resources.governance = { used: operationBudget.used, failure: operationBudget.failure };
  }
}
