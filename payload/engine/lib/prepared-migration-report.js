/** Closed transport/privacy contract of the released mechanical migration gate. */
import { isDeepStrictEqual } from 'node:util';
import { isCaptureLocator } from './capture-locator.js';
import { isInstallationReport } from './migration-installation-report.js';

const counts = [
  ['input', []], ['committed-pair', []], ['source-layout', []], ['candidate-layout', []],
  ['source-inventory', ['documents', 'records', 'references', 'diagnostics']], ['rewrite', ['files']],
  ['candidate-preservation', ['changedPaths']], ['candidate-ledger', ['allocations']],
  ['candidate-structural', ['errors', 'warnings']],
  ['candidate-values', ['checked', 'skipped', 'errors', 'hardErrors', 'warnings']], ['temporary-disposal', []],
];
const limitKeys = ['maxTreeEntries', 'maxTreeBytes', 'maxFileBytes', 'maxGitOutputBytes',
  'maxSourceDocuments', 'maxRecords', 'maxReferences', 'maxAdjudications', 'maxProseEdits', 'maxInputBytes'];
// This is the reviewed wire vocabulary, not an alternate domain evaluation.
const codes = new Set([
  'invalid-migration-input', 'migration-adjudication-budget', 'migration-candidate-bytes-mismatch',
  'migration-candidate-ledger-mismatch', 'migration-candidate-parent-mismatch', 'migration-commit-evidence-unavailable',
  'migration-commit-tree-mismatch', 'migration-file-budget', 'migration-git-evidence-unavailable',
  'migration-input-budget', 'migration-inventory-budget', 'migration-kit-layout-mismatch',
  'migration-ledger-file-mismatch', 'migration-limit-conflict', 'migration-object-evidence-unavailable',
  'migration-prose-budget', 'migration-rewrite-refused', 'migration-snapshot-cleanup-failed',
  'migration-snapshot-evidence-unavailable', 'migration-source-capture-mismatch', 'migration-source-inventory-invalid',
  'migration-source-inventory-unavailable', 'migration-source-mode-mismatch', 'migration-source-scope-incomplete',
  'migration-structural-findings', 'migration-tree-budget', 'migration-tree-encoding', 'migration-tree-entry',
  'migration-tree-listing-budget', 'migration-value-findings',
  'migration-installation-refused',
]);
const closed = (v, keys) => v !== null && typeof v === 'object' && !Array.isArray(v)
  && Object.keys(v).length === keys.length && keys.every((key) => Object.hasOwn(v, key));
const natural = (v) => Number.isSafeInteger(v) && v >= 0;
const counters = (v, keys) => closed(v, keys) && keys.every((key) => natural(v[key]));
const hash = (v) => typeof v === 'string' && /^[0-9a-f]{64}(?![\s\S])/.test(v);
const path = (file) => isCaptureLocator({ file, blob: '1'.repeat(40), sha256: '1'.repeat(64) });

/** Validate only the frozen safe report wire and injected descriptor bindings. */
export function isPreparedMigrationReport(value, expected) {
  if (!closed(value, ['version', 'operation', 'source', 'candidate', 'objectFormat', 'validationInputDigest',
    'mechanicalStatus', 'checks', 'scope', 'resources', 'impact', 'publicationReady', ...(value?.version === 2 ? ['installation'] : [])])
    || ![1, 2].includes(value.version) || value.operation !== 'identity-migration' || value.publicationReady !== false
    || !['passed', 'failed'].includes(value.mechanicalStatus) || ![null, 'sha1', 'sha256'].includes(value.objectFormat)
    || !Array.isArray(value.checks) || value.checks.length !== counts.length
    || !closed(value.resources, ['limits', 'sourceTree', 'candidateTree'])
    || !isDeepStrictEqual(value.impact, { status: 'not-performed', code: 'migration-impact-unavailable' })) return false;
  for (const [index, [id, keys]] of counts.entries()) {
    const check = value.checks[index];
    if (!closed(check, ['id', 'status', 'code', 'counts']) || check.id !== id
      || !['passed', 'failed', 'not-performed'].includes(check.status)) return false;
    if (check.status === 'passed') {
      if (check.code !== null || !counters(check.counts, keys)) return false;
    } else if (check.status === 'not-performed') {
      if (check.code !== null || !closed(check.counts, [])) return false;
    } else if (!codes.has(check.code) || !(closed(check.counts, []) || counters(check.counts, keys))) return false;
  }
  if ((value.mechanicalStatus === 'passed') !== value.checks.every(({ status }) => status === 'passed')) return false;
  if (value.version === 2 && (!isInstallationReport(value.installation, expected)
    || (value.mechanicalStatus === 'passed' && value.installation?.status !== 'complete'))) return false;
  if (value.source === null || value.candidate === null) {
    if (value.source !== null || value.candidate !== null || value.objectFormat !== null
      || value.validationInputDigest !== null || value.resources.limits !== null || value.checks[0].status !== 'failed') return false;
  } else if (!isDeepStrictEqual(value.source, expected.source) || !isDeepStrictEqual(value.candidate, expected.candidate)
    || !hash(value.validationInputDigest) || !closed(value.resources.limits, limitKeys)
    || !limitKeys.every((key) => natural(value.resources.limits[key]) && value.resources.limits[key] > 0)) return false;
  for (const side of ['sourceTree', 'candidateTree']) {
    if (value.resources[side] !== null && !counters(value.resources[side], ['entries', 'bytes'])) return false;
  }
  if (value.scope !== null && (!closed(value.scope, ['coverage', 'sourceFiles', 'unclassifiedPaths', 'records', 'declaredOnly', 'references'])
    || !['committed-installation', ...(value.version === 2 ? ['committed-installation-cutover'] : [])].includes(value.scope.coverage)
    || !['sourceFiles', 'unclassifiedPaths'].every((key) => Array.isArray(value.scope[key]) && value.scope[key].every(path))
    || !['records', 'declaredOnly', 'references'].every((key) => natural(value.scope[key])))) return false;
  return true;
}
