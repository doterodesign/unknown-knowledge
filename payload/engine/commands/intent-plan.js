import { resolve } from 'node:path';
import { readSourceFileSync } from '../lib/source-budget.js';
import { parseArgs as parseFlags, rethrowIfBug, UsageError } from '../lib/cli.js';
import { EXIT_CODES } from '../lib/exit-codes.js';
import { validateIntentPlan } from '../lib/intent-plan.js';

export const USAGE = 'usage: node payload/engine/intent-plan.js <plan.json> [--json] [--inspect-bindings --root <repo> [--lookup-requests <requests.json>] | --validate-queries --root <repo> --admission <policy.json> | --execute-queries --root <repo> --admission <policy.json> --execution-admission <policy.json>] [--decision-captures <captures.json>] [--assessment-captures <captures.json>] [--material-captures <captures.json>] [--operation-limits-json <inlineJSON>]';
const standardWrite = text => process.stdout.write(text);

function readJson(file, role, bounded) {
  const path = resolve(file);
  let content;
  try {
    content = readSourceFileSync(path, { ...(bounded ? bounded.api.getSubjectOperationResources(bounded.operation) : {}), encoding: 'utf8' });
  } catch (error) {
    rethrowIfBug(error);
    throw new UsageError(`cannot read ${role} file (${error.code ?? 'read failure'})`);
  }
  try {
    const document = JSON.parse(content);
    if (bounded) bounded.api.guardSubjectOperationDocument(bounded.operation, document, `parsed-${role.replaceAll(' ', '-')}`);
    return document;
  } catch (error) {
    // A JSON parser's message can contain request text; do not echo it.
    if (!(error instanceof SyntaxError)) throw error;
    throw new UsageError(`${role} file is not valid JSON`);
  }
}

function emit(result, json, envelope = result, write = standardWrite) {
  if (json) write(`${JSON.stringify(envelope, null, 2)}\n`);
  else {
    const queryMode = envelope !== result;
    const lines = [
      `intent plan: ${result.valid ? 'valid' : 'invalid'} (${result.validationScope})`,
      `readiness: ${result.readiness}`,
      ...(queryMode ? [
        `query validation: ${result.queryValidation}; admission: ${result.admission.status}`,
        `execution: ${result.execution}; binding validation: ${result.bindingValidation}; evidence review: ${result.evidenceReview}`,
        'Query validation checks support and declared provenance; execution and source review remain pending.',
        ...envelope.contextDiagnostics.map(d => `context ${d.path || '/'}: ${d.code} — ${d.message}`),
      ] : [
        'query validation: not-run; target validation: not-run',
        'Structural validation does not establish complete intent, executable queries or source support.',
      ]),
      ...result.diagnostics.map((d) => `${d.path || '/'}: ${d.code} — ${d.message}`),
    ];
    if (result.handoff) {
      lines.push('Transient handoff — evidence requirements remain pending:', JSON.stringify(result.handoff, null, 2));
    }
    write(`${lines.join('\n')}\n`);
  }
  return result.valid ? EXIT_CODES.CLEAN : EXIT_CODES.FAILURE;
}

function emitExecution(result, json, contextDiagnostics, write = standardWrite) {
  if (json) write(`${JSON.stringify({ mode: 'execute-queries', result, contextDiagnostics }, null, 2)}\n`);
  else write([
    `intent plan execution: ${result.status}`,
    `readiness: ${result.readiness}`,
    `query validation: ${result.validation?.queryValidation ?? 'not-run'}; execution: ${result.execution}`,
    `validation admission: ${result.admission.validation.status}; execution admission: ${result.admission.execution.status}`,
    'Binding validation and source review remain pending. Execution does not establish evidence adequacy.',
    ...contextDiagnostics.map(d => `context ${d.path || '/'}: ${d.code} — ${d.message}`),
    ...result.diagnostics.map(d => `${d.path || '/'}: ${d.code} — ${d.message}`),
    'Branch results for inspection:', JSON.stringify(result.branches, null, 2),
  ].join('\n') + '\n');
  return result.status === 'complete' ? EXIT_CODES.CLEAN : EXIT_CODES.FAILURE;
}

function refuseContext(diagnostics, json, mode, write = standardWrite) {
  const envelope = { mode, result: null, diagnostics };
  if (json) write(`${JSON.stringify(envelope, null, 2)}\n`);
  else write([`intent plan: ${mode === 'inspect-bindings' ? 'binding' : 'query'} context unavailable`,
    'query validation: not-run; execution: not-run; binding validation: not-run; evidence review: not-run',
    ...diagnostics.map(d => `${d.path || '/'}: ${d.code} — ${d.message}`),
  ].join('\n') + '\n');
  return EXIT_CODES.FAILURE;
}

async function inspectBindings(plan, options) {
  const lookupRequests = options['lookup-requests'] ? readJson(options['lookup-requests'], 'lookup requests') : undefined;
  const [{ loadStores }, { locateKitRoot }, { inspectIntentBindings }] = await Promise.all([
    import('../lib/load-stores.js'), import('../lib/kit-root.js'), import('../lib/intent-bindings.js'),
  ]);
  let model;
  try { model = loadStores(locateKitRoot(resolve(options.root))); }
  catch (error) {
    rethrowIfBug(error);
    return refuseContext([{ code: 'binding-context-unavailable', path: '', message: error.message }], options.json, 'inspect-bindings');
  }
  if (!model.ok) return refuseContext([{ code: 'invalid-model', path: '', message: 'The captured installation is not structurally healthy.' },
    ...model.diagnostics], options.json, 'inspect-bindings');
  const result = inspectIntentBindings(plan, { identityIndex: model.identityIndex,
    subjectDocument: model.subjectRegistry?.document, lookupRequests });
  if (options.json) process.stdout.write(`${JSON.stringify({ mode: 'inspect-bindings', result, contextDiagnostics: model.diagnostics }, null, 2)}\n`);
  else process.stdout.write([
    `intent binding inspection: ${result.inspectionScope}`,
    `plan: ${result.planValidation.valid ? 'valid' : 'invalid'}; readiness: ${result.planValidation.readiness}`,
    `query validation: ${result.queryValidation}; governance validation: ${result.governanceValidation}`,
    'Inspection does not establish intent completeness, approval or source support. Read every binding outcome.',
    ...model.diagnostics.map(d => `context ${d.path || '/'}: ${d.code} — ${d.message}`),
    ...result.planValidation.diagnostics.map(d => `${d.path || '/'}: ${d.code} — ${d.message}`),
    JSON.stringify(result.bindings, null, 2),
  ].join('\n') + '\n');
  return result.planValidation.valid ? EXIT_CODES.CLEAN : EXIT_CODES.FAILURE;
}

/** Explicit inspection/query modes reuse owning modules; no mode persists a plan. */
export async function main(argv, { reportErrors = false } = {}) {
  const { options, positionals } = parseFlags(argv, { boolean: ['json', 'inspect-bindings', 'validate-queries', 'execute-queries'],
    value: ['root', 'lookup-requests', 'admission', 'execution-admission', 'decision-captures', 'assessment-captures', 'material-captures', 'operation-limits-json'], positionals: true });
  let bounded;
  if (options['operation-limits-json'] !== undefined) {
    // Default structural mode does not import query/governance/YAML modules.
    const [api, { reportSubjectOperationFailure }] = await Promise.all([
      import('../lib/subject-operation.js'), import('../lib/subject-operation-cli.js'),
    ]);
    bounded = { api, operation: api.createSubjectOperation(api.parseSubjectOperationLimitsJson(options['operation-limits-json'])),
      reportSubjectOperationFailure };
  }
  try { return await run(options, positionals, bounded); }
  catch (error) {
    if (!bounded || !reportErrors) throw error;
    return bounded.reportSubjectOperationFailure(bounded.operation, error);
  }
}

async function run(options, positionals, bounded) {
  const operation = bounded?.operation;
  const write = text => {
    if (!bounded) return standardWrite(text);
    bounded.api.assertSubjectOperation(operation);
    return bounded.api.writeSubjectOperationOutput(operation, text);
  };
  if (positionals.length !== 1) throw new UsageError('name exactly one transient JSON plan file');
  const inspectionMode = options['inspect-bindings'] === true;
  const executionMode = options['execute-queries'] === true;
  if (['inspect-bindings', 'validate-queries', 'execute-queries'].filter(key => options[key]).length > 1) {
    throw new UsageError('choose exactly one inspection or query mode');
  }
  const queryMode = options['validate-queries'] === true || executionMode;
  if (bounded && !queryMode) throw new UsageError('--operation-limits-json requires a context-backed query mode');
  const mode = executionMode ? 'execute-queries' : 'validate-queries';
  if (!queryMode && ['admission', 'decision-captures', 'assessment-captures', 'material-captures', 'execution-admission'].some(key => Object.hasOwn(options, key))) {
    throw new UsageError('query context and admission flags require --validate-queries or --execute-queries');
  }
  if (!queryMode && !inspectionMode && Object.hasOwn(options, 'root')) {
    throw new UsageError('--root requires --validate-queries or --execute-queries or --inspect-bindings');
  }
  if (!inspectionMode && Object.hasOwn(options, 'lookup-requests')) throw new UsageError('--lookup-requests requires --inspect-bindings');
  if (inspectionMode && !options.root) throw new UsageError('--inspect-bindings requires explicit --root');
  if (executionMode && !options['execution-admission']) {
    throw new UsageError('--execute-queries requires explicit --execution-admission');
  }
  if (!executionMode && Object.hasOwn(options, 'execution-admission')) {
    throw new UsageError('--execution-admission requires --execute-queries');
  }
  if (queryMode && (!options.root || !options.admission)) {
    throw new UsageError('query modes require explicit --root and --admission');
  }
  const plan = readJson(positionals[0], 'plan', bounded);
  if (inspectionMode) return inspectBindings(plan, options);
  if (!queryMode) return emit(validateIntentPlan(plan), options.json);
  const admission = readJson(options.admission, 'admission', bounded);
  const executionAdmission = executionMode ? readJson(options['execution-admission'], 'execution admission', bounded) : null;
  const captured = options['decision-captures'] ? readJson(options['decision-captures'], 'Decision captures', bounded) : [];
  const assessments = options['assessment-captures'] ? readJson(options['assessment-captures'], 'assessment captures', bounded) : [];
  const materials = options['material-captures'] ? readJson(options['material-captures'], 'material captures', bounded) : [];
  // Structural mode remains independent of YAML and query/governance modules.
  const [{ decodeDecisionCaptures, decodeAssessmentCaptures, decodeMaterialCaptures, loadSubjectQueryContext, SubjectQueryContextError }, { validateIntentQueryPlan, executeIntentQueryPlan }] = await Promise.all([
    import('../lib/subject-query-context.js'), import('../lib/intent-query-plan.js'),
  ]);
  let decisionCaptures, assessmentCaptures, materialCaptures;
  try {
    decisionCaptures = decodeDecisionCaptures(captured, { operation });
    assessmentCaptures = decodeAssessmentCaptures(assessments, { operation });
    materialCaptures = options['material-captures'] ? decodeMaterialCaptures(materials, bounded ? { operation } : {}) : [];
  }
  catch (error) {
    if (!(error instanceof SubjectQueryContextError)) throw error;
    return refuseContext([{ code: error.code, path: '', message: error.message }], options.json, mode, write);
  }
  const loaded = loadSubjectQueryContext({ root: resolve(options.root), decisionCaptures, assessmentCaptures, materialCaptures, operation });
  if (!loaded.ok) return refuseContext(loaded.diagnostics, options.json, mode, write);
  if (executionMode) return emitExecution(executeIntentQueryPlan(plan, loaded.context,
    { admission, executionAdmission, ...(bounded ? { operation } : {}) }), options.json, loaded.diagnostics, write);
  const result = validateIntentQueryPlan(plan, loaded.context, { admission, ...(bounded ? { operation } : {}) });
  return emit(result, options.json, { mode: 'validate-queries', result, contextDiagnostics: loaded.diagnostics }, write);
}
