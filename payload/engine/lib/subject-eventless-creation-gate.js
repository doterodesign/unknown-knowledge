import { inspectSubjectCreationGateCore, inspectSubjectCreationGateCoreFromWire } from './subject-creation-core.js';
/** Fixed actual-Git eventless gate. Retained/publication authority remains separate. */
import { isDeepStrictEqual as same } from 'node:util';
import { lstatSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { inspectSubjectReconsiderationGateCore, inspectSubjectReconsiderationGateCoreFromWire } from './subject-reconsideration-core.js';
import { withTreeSnapshot } from './commit-snapshot.js';
import { locateKitRoot } from './kit-root.js';
import { describeCandidateBytes } from './captured-source.js';
import { canonicalJsonBytes, canonicalSha256, CapturedInputError } from './canonical-json.js';
import { readSourceFileSync, SourceBudgetError } from './source-budget.js';
import { createSubjectOperation, getSubjectOperationResources, getSubjectOperationUsage,
  admitSubjectOperationCapture, assertSubjectOperation, SubjectOperationError } from './subject-operation.js';
import { loadSubjectQueryContext } from './subject-query-context.js';
import { projectSubjectMaterialCaptures } from './subject-governance.js';
import { adaptDocumentBudgetError } from './subject-validation-budget.js';
import { SubjectError } from './subject-error.js';
import { rethrowIfBug } from './engine-refusal.js';
import { assessSubjectReconsiderationImpacts, assessSubjectCreationImpacts } from './subject-reconsideration-impact.js';

const requireThat = (condition, code, message) => { if (!condition) throw new SubjectError(code, message); };

/** No models, handles, callbacks, previous reports or operation budgets are accepted. */
export async function inspectSubjectReconsiderationGate(input) {
  return inspectGate(input, false);
}

/** Fixed wire route owns one bounded decode before the actual core/model work. */
export async function inspectSubjectReconsiderationGateFromWire(input) {
  return inspectGate(input, true);
}

async function inspectGate(input, wire, ordinary = false) {
  const result = { version: 1, kind: ordinary ? 'subject-creation-gate' : 'subject-reconsideration-gate', mode: ordinary ? 'read-only-prepared-creation' : 'read-only-prepared-reconsideration',
    ok: false, publicationReady: false, inputDigest: null, inputs: null, operation: null, core: null, sources: null,
    checks: [], assignments: null, impacts: null,
    resources: { core: null, contexts: { before: null, after: null }, closure: { used: { rows: 0, bytes: 0 }, failure: null } },
    diagnostics: [] };
  const operations = {}, roots = [];
  let closureLimits;
  const retain = value => {
    const usage = result.resources.closure, bytes = canonicalJsonBytes(value).length;
    const counter = usage.used.rows >= closureLimits.maxRows ? 'rows'
      : bytes > closureLimits.maxBytes - usage.used.bytes ? 'bytes' : null;
    if (counter) {
      usage.failure = { code: 'reconsideration-impact-closure-budget', counter, requested: counter === 'rows' ? 1 : bytes };
      throw new SubjectError(usage.failure.code, 'The next retained impact section exceeds closure capacity.');
    }
    usage.used.rows++; usage.used.bytes += bytes; return value;
  };
  try {
    const handoff = ordinary
      ? await (wire ? inspectSubjectCreationGateCoreFromWire(input) : inspectSubjectCreationGateCore(input))
      : await (wire ? inspectSubjectReconsiderationGateCoreFromWire(input) : inspectSubjectReconsiderationGateCore(input));
    const { core, request, impact, registryDocuments } = handoff;
    result.core = core; result.resources.core = core.resources;
    result.checks.push({ id: 'core', passed: core.ok });
    if (!core.ok) { result.diagnostics.push(...core.diagnostics); return result; }
    closureLimits = impact.closure;
    result.inputDigest = canonicalSha256({ core: core.inputDigest, impact });
    result.inputs = core.inputs; result.operation = core.operation;
    result.sources = { registryCapture: core.registry.candidate, identityCapture: core.allocation.candidate,
      registryEvents: [core.registry.event], assignmentEvent: null };
    for (const side of ['before', 'after']) operations[side] = createSubjectOperation(impact.contexts[side]);
    await withTreeSnapshot(request.repoRoot, request.before.tree, async original => {
      roots.push([dirname(original.root), '<before-impact-snapshot>']);
      await withTreeSnapshot(request.repoRoot, request.candidate.tree, async candidate => {
        roots.push([dirname(candidate.root), '<candidate-impact-snapshot>']);
        const snapshots = { before: original, after: candidate }, contexts = {}, bindings = {};
        for (const side of ['before', 'after']) {
          const coreSide = side === 'before' ? 'before' : 'candidate', operation = operations[side];
          const resources = getSubjectOperationResources(operation), budget = resources.subjectOperationBudget;
          const root = snapshots[side].root, descriptor = request[coreSide];
          const kitRoot = locateKitRoot(root, resources);
          requireThat((relative(root, kitRoot) || '.') === descriptor.kitPath,
            'reconsideration-impact-kit', 'Fresh installation must match the actual core snapshot.');
          const authority = {};
          for (const [part, evidence] of [['registry', core.registry[coreSide]], ['identity', core.allocation[coreSide]]]) {
            const file = join(root, evidence.capture.file), stat = lstatSync(file);
            requireThat(stat.isFile() && !stat.isSymbolicLink(), 'reconsideration-impact-file', 'Fresh authority must remain a regular file.');
            const bytes = readSourceFileSync(file, resources), objectFormat = descriptor.commit.length === 40 ? 'sha1' : 'sha256';
            const capture = { ...describeCandidateBytes({ file: evidence.capture.file, bytes, objectFormat }),
              source: { commit: descriptor.commit, tree: descriptor.tree } };
            admitSubjectOperationCapture(operation, { capture, bytes, objectFormat });
            const mode = stat.mode & 0o111 ? '100755' : '100644';
            requireThat(mode === evidence.mode && same(capture, evidence.capture),
              'reconsideration-impact-capture', 'Fresh authority bytes, modes and source must match the core.');
            authority[part] = { capture, mode };
          }
          const projection = side === 'before'
            ? projectSubjectMaterialCaptures({ registryDocument: registryDocuments.before,
              materialCaptures: request.evidence.materialCaptures }, { operationBudget: budget })
            : { selected: request.evidence.materialCaptures, excludedLocators: [] };
          bindings[side] = retain({ ...authority, excludedMaterialLocators: projection.excludedLocators });
          const loaded = loadSubjectQueryContext({ root, operation, ...request.evidence, materialCaptures: projection.selected });
          requireThat(loaded.ok, 'reconsideration-impact-context', JSON.stringify(loaded.diagnostics));
          const { context } = loaded;
          budget.guard(context.model.identity, 'reconsideration-impact-identity-binding');
          budget.guard(context.model.subjectRegistry.document, 'reconsideration-impact-registry-binding');
          requireThat(same(context.model.subjectRegistry.document, registryDocuments[coreSide])
            && canonicalSha256(context.model.identity) === core.allocation.proof[`${coreSide}IdentityDigest`],
          'reconsideration-impact-model-binding', 'Fresh context must own the exact core registry and allocated identity.');
          contexts[side] = { context, operation, capturedInputRef: core.inputDigest + ':' + coreSide };
        }
        result.checks.push({ id: 'binding', passed: true });
        const assessed = (ordinary ? assessSubjectCreationImpacts : assessSubjectReconsiderationImpacts)({ ...contexts, core, limits: impact });
        result.impacts = { bindings, reach: null, subjectTree: null, replays: null };
        for (const key of ['reach', 'subjectTree', 'replays']) {
          if (assessed[key]) result.impacts[key] = retain(assessed[key]);
          result.checks.push({ id: key, passed: assessed.checks[key] === true });
        }
        result.diagnostics.push(...assessed.diagnostics);
        for (const operation of Object.values(operations)) assertSubjectOperation(operation);
        requireThat(assessed.ok, 'reconsideration-impact-incomplete', 'All mandatory impacts must complete.');
      });
    });
    result.ok = true;
  } catch (caught) {
    const error = adaptDocumentBudgetError(caught);
    if (!(error instanceof SubjectError || error instanceof SubjectOperationError || error instanceof SourceBudgetError
      || error instanceof CapturedInputError)) rethrowIfBug(error);
    let message = error.message;
    for (const [path, replacement] of roots) message = message.replaceAll(path, replacement);
    result.diagnostics.push({ code: error.code ?? 'reconsideration-impact-unavailable', message });
    result.ok = false;
  } finally {
    for (const side of ['before', 'after']) if (operations[side]) result.resources.contexts[side] = getSubjectOperationUsage(operations[side]);
  }
  return result;
}

export async function inspectSubjectCreationGate(input) { return inspectGate(input, false, true); }
export async function inspectSubjectCreationGateFromWire(input) { return inspectGate(input, true, true); }
