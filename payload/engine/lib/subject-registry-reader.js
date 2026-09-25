/** Read the optional shared subject authority, never its disposable derived tree. */
import { readSourceFileSync, assertSourceBudget } from './source-budget.js';
import { guardCapturedDocument, getDocumentBudgetUsage } from './document-budget.js';
import { lstatSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { load, YAMLException } from 'js-yaml';
import { validateStoreFile, ERROR_CODES } from './validate-record.js';
import { selectSubjectValidationBudget } from './subject-validation-budget.js';
import { indexSubjects, SubjectError } from './subjects.js';
import { validateIdentityLedger } from './identity-ledger.js';

const file = 'subjects/registry.yaml';
export const SUBJECT_REGISTRY_DIAGNOSTIC_CODES = Object.freeze([...ERROR_CODES,
  'subject-registry-read-error', 'subject-registry-parse-error',
  'invalid-subject-registry', 'invalid-subject-id', 'invalid-subject-shape', 'duplicate-subject',
  'invalid-parent', 'self-parent', 'missing-parent', 'parent-cycle',
  'invalid-related', 'self-related', 'missing-related', 'duplicate-related',
  'invalid-identity-ledger', 'namespace-mismatch', 'invalid-subject-allocation',
  'invalid-history', 'invalid-history-forest', 'duplicate-event', 'invalid-authorizer', 'invalid-review',
  'change-digest-mismatch', 'invalid-warrant', 'invalid-reconsideration-evidence',
]);
const domainKeys = { 'schema-version': 'schemaVersion', 'hierarchy-revision': 'hierarchyRevision',
  'origin-decision': 'originDecision', 'accepted-status': 'acceptedStatus',
  'decision-capture': 'decisionCapture', 'decision-digest': 'decisionDigest', 'change-digest': 'changeDigest',
  'prior-refusal': 'priorRefusal', 'unchanged-meaning': 'unchangedMeaning',
  'refusal-assessment': 'refusalAssessment', 'reconsideration-assessment': 'reconsiderationAssessment',
  'before-registry': 'beforeRegistry',
  'document-digest': 'documentDigest', 'identity-digest': 'identityDigest', 'relevant-refusals': 'relevantRefusals' };

function toDomain(value) {
  if (Array.isArray(value)) return value.map(toDomain);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [domainKeys[key] ?? key, toDomain(item)]));
  }
  return value;
}

function checkDocumentBudget(budget, documentBudget) {
  if (documentBudget !== undefined) getDocumentBudgetUsage(documentBudget);
  if (budget && documentBudget !== undefined && budget.documentBudget !== documentBudget) {
    throw new SubjectError('ambiguous-document-budget', 'Subject and neutral guards must share one document allowance.');
  }
}

/** Parse captured authority bytes through the same schema/mapping path as disk reads. */
export function parseSubjectRegistry({ bytes, identity, budget, operationBudget, documentBudget }) {
  budget = selectSubjectValidationBudget(budget, operationBudget);
  checkDocumentBudget(budget, documentBudget);
  if (!Buffer.isBuffer(bytes)) throw new TypeError('Subject registry parsing requires raw Buffer bytes.');
  const finish = (registry, diagnostics = []) => ({ ok: diagnostics.length === 0,
    subjectRegistry: registry, diagnostics });
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch (error) {
    if (error.code !== 'ERR_ENCODING_INVALID_ENCODED_DATA') throw error;
    return finish(undefined, [{ code: 'subject-registry-parse-error', path: '', message: 'Subject registry is not valid UTF-8.' }]);
  }
  let document;
  try { document = load(text, { filename: file }); }
  catch (error) {
    if (!(error instanceof YAMLException)) throw error;
    return finish(undefined, [{ code: 'subject-registry-parse-error', path: '', message: error.message }]);
  }
  if (budget) budget.guard(document, 'parsed-registry');
  else if (documentBudget !== undefined) guardCapturedDocument(document, documentBudget, { phase: 'parsed-registry' });
  const shape = validateStoreFile('subject-registry', document);
  if (!shape.ok) return finish(undefined, shape.errors);
  budget?.charge('subjects', document.subjects.length, 'parsed-registry');
  const indexed = indexSubjects(toDomain(document));
  if (!indexed.ok) return finish(undefined, indexed.diagnostics);
  const allocation = checkSubjectAllocations(indexed.registry, identity);
  return finish(allocation.length ? undefined : indexed.registry, allocation);
}

/**
 * Subject IDs come from the installation's identity ledger, like record IDs.
 * The registry is an ordinary governed file: its change history is the Git
 * history of the file, reviewed like any other store change, so no recorded
 * event log is replayed here.
 */
function checkSubjectAllocations(registry, identity) {
  if (!validateIdentityLedger(identity).ok) {
    return [{ code: 'invalid-identity-ledger', path: '', message: 'The subject registry requires the validated installation identity ledger.' }];
  }
  if (identity.namespace !== registry.namespace) {
    return [{ code: 'namespace-mismatch', path: '', message: 'Registry and identity must share the exact installation namespace.' }];
  }
  const allocations = new Map(identity.allocations.filter((row) => row.kind === 'subject').map((row) => [row.id, row]));
  const diagnostics = [];
  for (const subject of registry.subjects.values()) {
    const allocation = allocations.get(subject.id);
    if (!allocation || allocation.state === 'cancelled' || (subject.status === 'active' && allocation.state !== 'allocated')) {
      diagnostics.push({ code: 'invalid-subject-allocation', path: '', message: `Subject ${subject.id} needs a matching allocation; active subjects must be allocated.` });
    }
  }
  return diagnostics;
}

/**
 * Absence is optional capability absence, never an empty registry. Present data
 * must pass the shipped schema, shared identity/metadata checks and real index.
 * Expected filesystem/YAML failures are diagnostics; programmer errors throw.
 * @param {{kitDir: string, identity: object}} input selected kit root and captured ledger
 * @returns {{ok: boolean, present: boolean, subjectRegistry: object|undefined, diagnostics: object[]}}
 */
export function readSubjectRegistry({ kitDir, identity, sourceBudget, documentBudget, operationBudget }) {
  const budget = selectSubjectValidationBudget(undefined, operationBudget);
  if (sourceBudget !== undefined) assertSourceBudget(sourceBudget);
  checkDocumentBudget(budget, documentBudget);
  const root = resolve(kitDir);
  if (!statSync(root).isDirectory()) throw new TypeError('Subject reader requires an existing kit directory.');
  const finish = (present, registry, errors = []) => ({ ok: errors.length === 0, present,
    subjectRegistry: registry, diagnostics: errors.map((error) => ({ severity: 'error', file, ...error })) });
  const readError = (message) => finish(true, undefined, [{ code: 'subject-registry-read-error', path: '', message }]);
  let bytes;
  try {
    if (!lstatSync(join(root, 'subjects')).isDirectory()) return readError('The subjects authority directory must be a regular directory.');
    const path = join(root, file);
    if (!lstatSync(path).isFile()) return readError('Subject authority must be an exact regular file.');
    bytes = readSourceFileSync(path, { sourceBudget });
  }
  catch (error) {
    if (!Number.isInteger(error.errno) || typeof error.code !== 'string') throw error;
    return error.code === 'ENOENT' ? finish(false, undefined)
      : readError(error.message);
  }
  const parsed = parseSubjectRegistry({ bytes, identity, budget, documentBudget });
  return finish(true, parsed.subjectRegistry, parsed.diagnostics);
}
