import process from 'node:process';
import { createSubjectOperation, parseSubjectOperationLimitsJson,
  assertSubjectOperation, writeSubjectOperationOutput } from '../lib/subject-operation.js';
import { reportSubjectOperationFailure } from '../lib/subject-operation-cli.js';
import { parseArgs as parseFlags, UsageError } from '../lib/cli.js';
import { EXIT_CODES } from '../lib/exit-codes.js';
import { querySubjects, querySubjectFiles, SUBJECT_QUERY_OUTPUT_VERSION } from '../lib/subject-query.js';
import { decodeDecisionCaptures, decodeAssessmentCaptures, decodeMaterialCaptures, loadSubjectQueryContext, SubjectQueryContextError, readSubjectQueryJson } from '../lib/subject-query-context.js';

export const USAGE = 'usage: node payload/engine/query-subjects.js --query <JSONfile> [--root <repo>] [--decision-captures <JSONfile>] [--assessment-captures <JSONfile>] [--material-captures <JSONfile>] [--counts] [--json] [--operation-limits-json <inlineJSON>]';

function human(result) {
  const lines = [`Subject query: ${result.status}`];
  for (const [store, counts] of Object.entries(result.counts ?? {})) {
    lines.push(`${store}: ${counts.strict} strict (${counts.basis}), `
      + `${counts.possible} possible (${counts.possibleBasis ?? counts.basis}), `
      + `${counts.excluded} excluded (${counts.basis}); `
      + `${counts.evaluated} evaluated, ${counts.unevaluated} unevaluated.`);
    if (Object.hasOwn(counts, 'scopeExcluded')) lines.push(`  ${counts.scopeExcluded} excluded by declared query scope.`);
    for (const category of ['strict', 'possible']) for (const row of result.groups?.[store]?.[category] ?? []) {
      lines.push(`  ${category}: ${row.ref?.id ?? row.proposalRef.key} — ${row.label}`);
    }
  }
  if (result.coverage?.pageTruncated) lines.push('Result page truncated; counts are independent of page length.');
  if (result.coverage?.explanationsComplete === false) lines.push('Some rows were withheld because their full explanations did not fit.');
  if (result.coverage?.evaluationComplete === false) lines.push('Evaluation incomplete; unvisited or unfinished work is not a negative match.');
  for (const diagnostic of [...(result.diagnostics ?? []), ...(result.contextDiagnostics ?? [])]) {
    lines.push(`${diagnostic.code}${diagnostic.message ? `: ${diagnostic.message}` : ''}`);
  }
  return `${lines.join('\n')}\n`;
}

export function main(argv, { reportErrors = false } = {}) {
  const { options } = parseFlags(argv, { boolean: ['json', 'counts', 'help'],
    value: ['root', 'query', 'decision-captures', 'assessment-captures', 'material-captures', 'operation-limits-json'], positionals: false });
  const operation = options['operation-limits-json'] === undefined ? undefined
    : createSubjectOperation(parseSubjectOperationLimitsJson(options['operation-limits-json']));
  try { return run(options, operation); }
  catch (error) {
    if (!operation || !reportErrors) throw error;
    return reportSubjectOperationFailure(operation, error);
  }
}

function run(options, operation) {
  const write = (text) => operation ? writeSubjectOperationOutput(operation, text) : process.stdout.write(text);
  if (options.help) { write(`${USAGE}\n`); return EXIT_CODES.CLEAN; }
  if (!options.query) throw new UsageError('Supply --query with an explicit query JSON file.');
  let result;
  const refused = (diagnostics) => ({ outputVersion: SUBJECT_QUERY_OUTPUT_VERSION,
    status: 'refused', groups: null, counts: null, diagnostics });
  try {
    if (operation) {
      result = querySubjectFiles(operation, { root: options.root ?? process.cwd(), queryFile: options.query,
        ...(options['decision-captures'] ? { decisionCapturesFile: options['decision-captures'] } : {}),
        ...(options['assessment-captures'] ? { assessmentCapturesFile: options['assessment-captures'] } : {}),
        ...(options['material-captures'] ? { materialCapturesFile: options['material-captures'] } : {}),
        collect: options.counts ? 'counts' : 'results' });
    } else {
      const query = readSubjectQueryJson(options.query, 'query', operation);
      const decisionCaptures = options['decision-captures']
        ? decodeDecisionCaptures(readSubjectQueryJson(options['decision-captures'], 'decision-captures', operation), { operation }) : [];
      const assessmentCaptures = options['assessment-captures']
        ? decodeAssessmentCaptures(readSubjectQueryJson(options['assessment-captures'], 'assessment-captures', operation), { operation }) : [];
      const materialCaptures = options['material-captures']
        ? decodeMaterialCaptures(readSubjectQueryJson(options['material-captures'], 'material-captures')) : [];
      const loaded = loadSubjectQueryContext({ root: options.root ?? process.cwd(), decisionCaptures, assessmentCaptures, materialCaptures, operation });
      if (!loaded.ok) result = refused(loaded.diagnostics);
      else {
        result = querySubjects(loaded.context, query, { collect: options.counts ? 'counts' : 'results', ...(operation ? { operation } : {}) });
        if (loaded.diagnostics.length) result = { ...result, contextDiagnostics: loaded.diagnostics };
      }
    }
  } catch (error) {
    if (!(error instanceof SubjectQueryContextError)) throw error;
    result = refused([{ code: error.code, path: '', message: error.message }]);
  }
  if (operation) assertSubjectOperation(operation);
  write(options.json ? `${JSON.stringify(result, null, 2)}\n` : human(result));
  return result.status === 'complete' ? EXIT_CODES.CLEAN : EXIT_CODES.FAILURE;
}
