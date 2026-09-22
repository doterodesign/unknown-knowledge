import { lstatSync, readdirSync, readFileSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { parseArgs as parseFlags, UsageError, rethrowIfBug } from '../lib/cli.js';
import { readSourceFileSync } from '../lib/source-budget.js';
import { EngineRefusal } from '../lib/engine-refusal.js';
import { EXIT_CODES } from '../lib/exit-codes.js';
import { locateKitRoot } from '../lib/kit-root.js';
import { loadStores } from '../lib/load-stores.js';
import { deriveSubjectTreeArtifacts, SUBJECT_VIEW_DIRECTORY } from '../lib/subject-views.js';

export const USAGE = 'usage: node payload/engine/subject-view.js [--mode tree|route|contexts] [--root <dir>] [--json] (tree: [--check|--write|--delete], check/write require --max-nodes <n> --max-edges <n> --max-rows <n> --max-bytes <n>; route/contexts: --request <JSONfile> [--decision-captures <JSONfile>] [--assessment-captures <JSONfile>] [--material-captures <JSONfile>] [--operation-limits-json <inlineJSON>])';

function parseArgs(argv) {
  const { options } = parseFlags(argv, { boolean: ['check', 'write', 'delete', 'json'],
    value: ['root', 'mode', 'request', 'decision-captures', 'assessment-captures', 'material-captures', 'max-nodes', 'max-edges', 'max-rows', 'max-bytes', 'operation-limits-json'] });
  const mode = options.mode ?? 'tree';
  if (!['tree', 'route', 'contexts'].includes(mode)) throw new UsageError('Choose --mode tree, route or contexts.');
  if (mode !== 'tree') {
    if (['check', 'write', 'delete', 'max-nodes', 'max-edges', 'max-rows', 'max-bytes'].some((key) => Object.hasOwn(options, key))) {
      throw new UsageError('Route and contexts modes are read-only; tree verbs and generation limits are incompatible.');
    }
    if (!options.request) throw new UsageError('Route and contexts modes require --request <JSONfile>.');
    return { mode, root: resolve(options.root ?? '.'), json: !!options.json, operationLimits: options['operation-limits-json'],
      request: resolve(options.request), captures: options['decision-captures'] ? resolve(options['decision-captures']) : null,
      assessments: options['assessment-captures'] ? resolve(options['assessment-captures']) : null,
      materials: options['material-captures'] ? resolve(options['material-captures']) : null };
  }
  if (Object.hasOwn(options, 'operation-limits-json')) {
    throw new UsageError('Shared operation admission is supported only for route and contexts modes.');
  }
  if (['request', 'decision-captures', 'assessment-captures', 'material-captures'].some(key => Object.hasOwn(options, key))) {
    throw new UsageError('Tree mode does not accept query requests or evidence captures.');
  }
  if (['check', 'write', 'delete'].filter((key) => options[key]).length > 1) {
    throw new UsageError('Choose only one of --check, --write or --delete.');
  }
  const verb = options.delete ? 'delete' : options.write ? 'write' : 'check';
  const limits = {};
  for (const name of ['nodes', 'edges', 'rows', 'bytes']) {
    const value = options[`max-${name}`];
    if (verb === 'delete' && value === undefined) continue;
    if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)$/.test(value) || !Number.isSafeInteger(Number(value))) {
      throw new UsageError(`--max-${name} must be an explicit nonnegative safe integer.`);
    }
    limits[name] = Number(value);
  }
  return { mode, root: resolve(options.root ?? '.'), verb, json: !!options.json,
    projection: { budget: { nodes: limits.nodes, edges: limits.edges, rows: limits.rows }, maxBytes: limits.bytes } };
}

function readJson(path, host, phase) {
  let text;
  try {
    text = host ? readSourceFileSync(path, { ...host.api.getSubjectOperationResources(host.operation), encoding: 'utf8' })
      : readFileSync(path, 'utf8');
  } catch (error) {
    if (!host || !Number.isInteger(error.errno) || typeof error.code !== 'string') throw error;
    throw Object.assign(new EngineRefusal(`Cannot read view input: ${error.message}`), { code: 'view-input-read-error' });
  }
  try {
    const document = JSON.parse(text);
    if (host) host.api.guardSubjectOperationDocument(host.operation, document, phase);
    return document;
  }
  catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    throw new UsageError(`Invalid JSON input ${path}: ${error.message}`);
  }
}

function readRequest(options, host) {
  const request = readJson(options.request, host, 'parsed-view-request');
  const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
  const fields = options.mode === 'route' ? ['version', 'route', 'query', 'collect'] : ['version', 'query', 'contextBudgets'];
  if (!object(request) || request.version !== 1 || Object.keys(request).some((key) => !fields.includes(key))
    || !object(request.query)
    || (options.mode === 'route' && (!object(request.route) || Object.hasOwn(request.query, 'where')
      || (Object.hasOwn(request, 'collect') && !['results', 'counts'].includes(request.collect))))
    || (options.mode === 'contexts' && !object(request.contextBudgets))) {
    throw new UsageError(`Invalid ${options.mode} request: use the closed version 1 request envelope.`);
  }
  return request;
}

function emitQuery(options, payload, write) {
  if (options.json) { write(`${JSON.stringify(payload, null, 2)}\n`); return; }
  const result = payload.result;
  const lines = [`subject-view: ${options.mode} ${result?.status ?? payload.status}`];
  const describeCounts = (tally) => `strict ${tally.strict}, possible ${tally.possible} (${tally.basis}${tally.possibleBasis ? `; possible ${tally.possibleBasis}` : ''})`;
  if (result?.route) lines.push(`  ${result.route.kind}: ${result.route.subjects.join(' AND ')}`);
  const counts = result?.counts ?? result?.base?.counts;
  for (const [store, tally] of Object.entries(counts ?? {})) {
    lines.push(`  ${store}: ${describeCounts(tally)}`);
  }
  for (const categories of Object.values(result?.groups ?? {})) {
    for (const [category, rows] of Object.entries(categories)) for (const row of rows) {
      const ref = row.ref ?? row.proposalRef;
      const lifecycle = `lifecycle ${row.lifecycle.value ?? 'unrecorded'} (${row.lifecycle.basis})`;
      const applicability = row.applicability ? `; applicability ${row.applicability.scopeBasis}` : '';
      lines.push(`  ${category} ${ref.namespace}/${ref.kind}/${ref.id ?? ref.key}: ${row.label} (${row.file}); ${lifecycle}${applicability}`);
    }
  }
  if (result?.contexts) {
    lines.push(`  contexts: ${result.contexts.length}; enumeration complete: ${result.coverage.enumerationComplete}; counts complete: ${result.coverage.countsComplete}`);
    for (const row of result.contexts) {
      lines.push(`  ${row.subject}: ${row.status}`);
      for (const [store, tally] of Object.entries(row.counts ?? {})) lines.push(`    ${store}: ${describeCounts(tally)}`);
    }
  }
  for (const item of [...(payload.contextDiagnostics ?? []), ...(payload.diagnostics ?? []), ...(result?.diagnostics ?? [])]) {
    lines.push(`  ${item.code}: ${item.message ?? ''}`);
  }
  lines.push('Subject membership is recorded aboutness; inspect sources before relying on evidence.');
  write(`${lines.join('\n')}\n`);
}

async function queryMode(options, host) {
  const operation = host?.operation;
  const write = (text) => {
    if (!host) return process.stdout.write(text);
    host.api.assertSubjectOperation(operation);
    return host.api.writeSubjectOperationOutput(operation, text);
  };
  const request = readRequest(options, host);
  // Tree mode remains independent of query-module loading and governance input.
  const [{ decodeDecisionCaptures, decodeAssessmentCaptures, decodeMaterialCaptures, loadSubjectQueryContext }, { executeIntersectionRoute }, { countSubjectContexts }] = await Promise.all([
    import('../lib/subject-query-context.js'), import('../lib/subject-routes.js'), import('../lib/subject-contexts.js'),
  ]);
  const decisionCaptures = options.captures ? decodeDecisionCaptures(readJson(options.captures, host, 'parsed-decision-captures'), { operation }) : [];
  const assessmentCaptures = options.assessments ? decodeAssessmentCaptures(readJson(options.assessments, host, 'parsed-assessment-captures'), { operation }) : [];
  const materialCaptures = options.materials ? decodeMaterialCaptures(readJson(options.materials, host, 'parsed-material-captures'), host ? { operation } : {}) : [];
  const loaded = loadSubjectQueryContext({ root: options.root, decisionCaptures, assessmentCaptures, materialCaptures, operation });
  if (!loaded.ok) {
    emitQuery(options, { mode: options.mode, status: 'refused', diagnostics: loaded.diagnostics }, write);
    return EXIT_CODES.FAILURE;
  }
  const result = options.mode === 'route'
    ? executeIntersectionRoute(loaded.context, request.route, request.query, { collect: request.collect ?? 'results', operation })
    : countSubjectContexts(loaded.context, request.query, { budgets: request.contextBudgets, operation });
  emitQuery(options, { mode: options.mode, result, contextDiagnostics: loaded.diagnostics }, write);
  return result.status === 'complete' ? EXIT_CODES.CLEAN : EXIT_CODES.FAILURE;
}

/** Refuse links/special nodes before reading or replacing generated files. */
function existingArtifacts(root) {
  const directory = join(root, SUBJECT_VIEW_DIRECTORY);
  let info;
  try { info = lstatSync(directory); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
  if (!info.isDirectory()) throw new UsageError('subjects/derived must be a regular directory.');
  const pending = [SUBJECT_VIEW_DIRECTORY];
  const files = [];
  while (pending.length) {
    const relative = pending.pop();
    for (const entry of readdirSync(join(root, relative), { withFileTypes: true })) {
      const path = `${relative}/${entry.name}`;
      if (entry.isDirectory()) pending.push(path);
      else if (entry.isFile()) files.push(path);
      else throw new UsageError(`Generated artifacts must be regular files or directories: ${path}`);
    }
  }
  return files.sort();
}

function compareArtifacts(root, artifacts, existing) {
  const expected = new Set(artifacts.map(({ path }) => path));
  const findings = [];
  for (const artifact of artifacts) {
    let actual;
    try { actual = readFileSync(join(root, artifact.path), 'utf8'); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      findings.push({ code: 'subject-view-missing', file: artifact.path });
      continue;
    }
    if (actual !== artifact.text) findings.push({ code: 'subject-view-stale', file: artifact.path });
  }
  for (const path of existing) if (!expected.has(path)) findings.push({ code: 'subject-view-unexpected', file: path });
  return findings.map((finding) => ({ severity: 'error', ...finding }));
}

function emit(options, payload) {
  process.stdout.write(options.json ? `${JSON.stringify(payload, null, 2)}\n`
    : `subject-view: ${payload.verb} ${payload.status}; ${payload.findings.length} finding(s)\n`
      + [...payload.diagnostics, ...payload.findings].map((item) => `  ${item.code ?? item.reason} ${item.file ?? ''}\n`).join(''));
}

export async function main(argv, { reportErrors = false } = {}) {
  const options = parseArgs(argv);
  let host;
  if (options.operationLimits !== undefined) {
    // Import the query operation only after selecting a supported query mode.
    const [api, { reportSubjectOperationFailure }] = await Promise.all([
      import('../lib/subject-operation.js'), import('../lib/subject-operation-cli.js'),
    ]);
    host = { api, reportSubjectOperationFailure,
      operation: api.createSubjectOperation(api.parseSubjectOperationLimitsJson(options.operationLimits)) };
  }
  try {
    if (options.mode !== 'tree') return await queryMode(options, host);
    const model = loadStores(locateKitRoot(options.root));
    const payload = { verb: options.verb, directory: SUBJECT_VIEW_DIRECTORY,
      status: 'refused', findings: [], artifacts: [], diagnostics: model.diagnostics };
    if (!model.ok || !model.subjectRegistry) {
      if (model.ok) payload.diagnostics = [...model.diagnostics, { severity: 'error', code: 'subjects-unavailable',
        message: 'The installation has no subject registry capability.' }];
      emit(options, payload);
      return EXIT_CODES.FAILURE;
    }
    if (options.verb === 'delete') {
      existingArtifacts(model.root);
      rmSync(join(model.root, SUBJECT_VIEW_DIRECTORY), { recursive: true, force: true });
      emit(options, { ...payload, status: 'complete' });
      return EXIT_CODES.CLEAN;
    }
    const derived = deriveSubjectTreeArtifacts(model.subjectRegistry, options.projection);
    Object.assign(payload, { status: derived.status, metadata: derived.metadata,
      artifacts: derived.artifacts.map(({ path }) => path),
      diagnostics: [...model.diagnostics, ...derived.metadata.diagnostics] });
    if (derived.status !== 'complete') {
      emit(options, payload);
      return EXIT_CODES.FAILURE;
    }
    const existing = existingArtifacts(model.root);
    if (options.verb === 'write') {
      rmSync(join(model.root, SUBJECT_VIEW_DIRECTORY), { recursive: true, force: true });
      for (const artifact of derived.artifacts) {
        const path = join(model.root, artifact.path);
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, artifact.text);
      }
    } else payload.findings = compareArtifacts(model.root, derived.artifacts, existing);
    emit(options, payload);
    return payload.findings.length ? EXIT_CODES.FINDINGS : EXIT_CODES.CLEAN;
  } catch (error) {
    if (host) {
      if (!reportErrors) throw error;
      return host.reportSubjectOperationFailure(host.operation, error);
    }
    rethrowIfBug(error);
    process.stderr.write(`subject-view: ${error.message}\n`);
    return EXIT_CODES.FAILURE;
  }
}
