import { governanceLimits, closureBudget, originalPair, actualFiles, evidenceMembership, ownerCensus, wireEnvelope, gateProjection } from './subject-eventless-source.js';
/** Actual immutable Git proof for one reconsidered Subject; no publication authority. */
import { isDeepStrictEqual as same } from 'node:util';
import { relative, dirname } from 'node:path';
import { readCommittedTree, withTreeSnapshot, changedTreePaths } from './commit-snapshot.js';
import { locateKitRoot } from './kit-root.js';
import { loadStores } from './load-stores.js';
import { CapturedInputError } from './canonical-json.js';
import { admitSubjectReconsiderationInput, decodeSubjectReconsiderationInput } from './subject-reconsideration-input.js';
import { createSubjectValidationBudget, adaptDocumentBudgetError } from './subject-validation-budget.js';
import { validateSubjectReconsiderationCreation } from './subject-governance.js';
import { IdentityOperationError } from './record-identity.js';
import { validateAssignmentHistoryChain } from './subject-history.js';
import { runChecks } from '../commands/validate.js';
import { validateValues } from '../commands/validate-values.js';
import { SubjectError } from './subject-error.js';
import { rethrowIfBug } from './engine-refusal.js';

const sides = ['before', 'candidate'];
const repoPath = (kitPath, file) => kitPath === '.' ? file : `${kitPath}/${file}`;
const content = ({ source, ...locator }) => locator;
const observed = actual => ({ capture: actual.locator, mode: actual.mode });
const fail = (code, message) => { throw new SubjectError(code, message); };
const requireThat = (condition, code, message) => { if (!condition) fail(code, message); };

/** Own snapshots and the one model/native invocation; no supplied proof shortcuts. */
export async function inspectSubjectReconsiderationCore(rawInput) { return inspectCore(rawInput, false); }

/** Fixed internal gate handoff, produced only by this actual owner invocation. */
export async function inspectSubjectReconsiderationGateCore(rawInput) { return inspectCore(rawInput, true); }

/** Fixed wire owner; its bundle is created here, never accepted from callers. */
export async function inspectSubjectReconsiderationGateCoreFromWire(input) { return inspectCore(input, true, true); }

async function inspectCore(rawInput, forGate, wire = false) {
  const result = { version: 1, kind: 'subject-reconsideration-core', ok: false, publicationReady: false,
    inputDigest: null, inputs: null, operation: null, registry: null, decision: null, allocation: null, assessment: null,
    sourceMembership: { status: 'incomplete', scope: 'supplied-captures-and-selected-transition', rows: [] },
    ownerPreservation: { status: 'incomplete', changedPaths: [], records: [], unavailable: [], unknownAssignments: [] },
    assignments: null, resources: { governance: null, allocation: null, closure: null }, diagnostics: [] };
  let budget, closure, request = null, impact = null, registryDocuments = null;
  const finish = () => forGate ? { core: result, request, impact, registryDocuments } : result;
  const roots = [];
  try {
    if (wire) rawInput = wireEnvelope(rawInput);
    budget = createSubjectValidationBudget(governanceLimits(rawInput));
    if (forGate) {
      const projected = gateProjection(rawInput, budget);
      rawInput = projected.input; impact = projected.impact;
    }
    const admitted = wire
      ? decodeSubjectReconsiderationInput(rawInput.repoRoot, { version: 1, before: rawInput.before, candidate: rawInput.candidate,
        operation: rawInput.operation, limits: rawInput.limits, evidence: rawInput.evidence }, { operationBudget: budget })
      : admitSubjectReconsiderationInput(rawInput, { operationBudget: budget });
    if (!admitted.ok) { result.diagnostics.push(...admitted.diagnostics); return finish(); }
    const input = admitted.input;
    if (forGate) request = input;
    result.inputDigest = admitted.inputDigest;
    closure = closureBudget(input.limits.closure);
    result.inputs = closure.admit({ before: input.before, candidate: input.candidate });
    result.operation = closure.admit(input.operation);
    for (const side of sides) {
      budget.charge('validationSteps', 1, 'reconsideration-commit-membership');
      requireThat(readCommittedTree(input.repoRoot, input[side].commit).tree === input[side].tree,
        'reconsideration-commit-tree', 'Each declared tree must belong to the exact supplied commit.');
    }
    requireThat(input.before.kitPath === input.candidate.kitPath, 'reconsideration-kit-path', 'The installation location cannot change.');
    await withTreeSnapshot(input.repoRoot, input.before.tree, async before => {
      roots.push([dirname(before.root), '<before-snapshot>']);
      await withTreeSnapshot(input.repoRoot, input.candidate.tree, async candidate => {
        roots.push([dirname(candidate.root), '<candidate-snapshot>']);
        const snapshots = { before, candidate }, models = {};
        for (const side of sides) {
          const kitRoot = locateKitRoot(snapshots[side].root);
          requireThat((relative(snapshots[side].root, kitRoot) || '.') === input[side].kitPath,
            'reconsideration-kit-path', 'Declared installation must equal the actual snapshot installation.');
          models[side] = loadStores(kitRoot);
          requireThat(models[side].ok, 'reconsideration-model-unavailable', 'Both actual snapshots must be healthy models.');
        }
        const pair = originalPair(input, budget), { id, proposal, subject, registryEvent } = input.operation;
        const proof = validateSubjectReconsiderationCreation({ beforeModel: models.before, candidateModel: models.candidate,
          beforeCaptures: pair, decisionCaptures: input.evidence.decisionCaptures, materialCaptures: input.evidence.materialCaptures,
          assessmentCaptures: input.evidence.assessmentCaptures.filter(value => value !== pair),
          operation: { id, proposal, subject, registryEvent }, allocationLimits: input.limits.allocation }, { operationBudget: budget });
        result.resources.allocation = proof.resources.allocation;
        if (!proof.ok) { result.diagnostics.push(...proof.diagnostics); return; }
        const files = actualFiles(input, snapshots, budget), file = name => repoPath(input.before.kitPath, name);
        const registry = files.pair(file('subjects/registry.yaml')), identity = files.pair(file('_identity.yaml'));
        for (const [part, actual] of [['registry', registry.before], ['identity', identity.before]]) {
          requireThat(same(actual.locator, pair[part].capture) && actual.objectFormat === pair[part].objectFormat
            && actual.bytes.equals(pair[part].bytes), 'reconsideration-original-before-membership', 'Original evidence must equal actual before bytes and full source locator.');
        }
        const prior = models.before.subjectRegistry.document, next = models.candidate.subjectRegistry.document, event = next.history.at(-1);
        if (forGate) registryDocuments = { before: prior, candidate: next };
        budget.charge('validationSteps', prior.subjects.length, 'reconsideration-complete-subject-preservation');
        const subjects = prior.subjects.filter(row => row.id !== proposal);
        subjects.push({ id: subject, ...event.rows[0].after, changes: [event.id] });
        requireThat(same(next, { ...prior, subjects, history: [...prior.history, event], revision: prior.revision + 1,
          hierarchyRevision: prior.hierarchyRevision + (event.rows[0].after.parent === undefined ? 0 : 1) }),
        'reconsideration-unrelated-registry-change', 'Only the exact selected consumption, fresh state and activation append may change the registry.');
        result.registry = closure.admit({ file: file('subjects/registry.yaml'), before: observed(registry.before),
          candidate: observed(registry.candidate), event: registryEvent });
        result.allocation = closure.admit({ proof: proof.allocation, before: observed(identity.before), candidate: observed(identity.candidate) });
        result.assessment = closure.admit(proof.assessment);
        const authorizer = files.pair(file(models.before.decisions.get(event.decision.id).file));
        requireThat(authorizer.before.bytes.equals(authorizer.candidate.bytes)
          && same(content(authorizer.before.locator), content(event.review.decisionCapture)),
        'reconsideration-authorizer-changed', 'The whole current authorizer file must remain equal to the selected reviewed bytes.');
        result.decision = closure.admit({ ref: event.decision, review: event.review,
          before: observed(authorizer.before), candidate: observed(authorizer.candidate) });
        evidenceMembership(input, files, budget, closure, result.sourceMembership);
        const paths = changedTreePaths(input.repoRoot, input.before.tree, input.candidate.tree).sort();
        requireThat(same(paths, [file('_identity.yaml'), file('subjects/registry.yaml')].sort()),
          'reconsideration-changed-paths', 'Exactly the registry and identity paths may change; no assignment event is created.');
        result.ownerPreservation.changedPaths = closure.admit(paths);
        ownerCensus(input, models, files, budget, closure, result.ownerPreservation);
        // Existing native whole-store validators are an explicit independent
        // check phase, not metered governance traversal or source truth.
        for (const side of sides) {
          const model = models[side], root = snapshots[side].root;
          const errors = runChecks(model, root).filter(row => row.severity === 'error');
          const values = validateValues(model, null, root), history = model.assignmentHistory;
          const chain = history ? validateAssignmentHistoryChain({ namespace: model.identity.namespace,
            baselines: history.baselines, events: history.events }) : null;
          requireThat(!errors.length && !values.findings.some(row => row.severity === 'error') && !values.hardErrors.length && (!chain || chain.ok),
            'reconsideration-structure-or-values', 'Actual stored structures, values and existing assignment history must pass.');
        }
        budget.assertActive();
      });
    });
    result.ok = result.diagnostics.length === 0 && result.ownerPreservation.status === 'passed';
  } catch (caught) {
    const error = adaptDocumentBudgetError(caught);
    if (!(error instanceof SubjectError || error instanceof CapturedInputError || error instanceof IdentityOperationError)) rethrowIfBug(error);
    result.ok = false;
    let message = error.message;
    for (const [root, replacement] of roots) message = message.replaceAll(root, replacement);
    result.diagnostics.push({ code: error.code ?? 'reconsideration-source-unavailable', path: '', message });
  } finally {
    result.resources.governance = budget ? { used: budget.used, failure: budget.failure } : null;
    result.resources.closure = closure?.report ?? null;
  }
  return finish();
}
