/** Optional assignment history source; no current-state or publication claim. */
import { readSourceFileSync, assertSourceBudget } from './source-budget.js';
import { guardCapturedDocument, getDocumentBudgetUsage } from './document-budget.js';
import { closeSync, constants, fstatSync, lstatSync, openSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { load, YAMLException } from 'js-yaml';
import { compare, ERROR_CODES, validateStoreFile } from './validate-record.js';
import { isIdentityUuid } from './record-identity.js';
import { validateIdentityLedger } from './identity-ledger.js';
import { buildIdentityIndex, resolveRecord } from './record-identity-index.js';
import { validateAssignmentHistoryChain } from './subject-history.js';
import { ASSIGNMENT_EVENT_DIAGNOSTIC_CODES, assignmentEventProjection, validateAssignmentEventMetadata } from './assignment-event.js';

const directory = 'subjects/_assignments';
const manifest = `${directory}/_baselines.yaml`;
export const ASSIGNMENT_HISTORY_DIAGNOSTIC_CODES = Object.freeze([...new Set([...ERROR_CODES, ...ASSIGNMENT_EVENT_DIAGNOSTIC_CODES,
  'assignment-history-read-error', 'assignment-history-parse-error',
  'assignment-history-missing-baselines', 'assignment-history-unexpected-entry',
  'assignment-history-identity', 'assignment-history-namespace',
  'assignment-history-unallocated', 'assignment-history-event-name',
  'invalid-input', 'invalid-baseline', 'invalid-reference', 'duplicate-baseline', 'invalid-state', 'invalid-capture',
  'invalid-event', 'duplicate-event', 'duplicate-row', 'missing-baseline', 'missing-reason',
  'invalid-revision', 'invalid-disposition', 'history-fork', 'history-gap', 'stale-before',
  'invalid-creation-origin', 'invalid-creation-row', 'missing-creation-event',
])]);

const filesystemError = (error) => Number.isInteger(error?.errno) && typeof error.code === 'string';

/**
 * Read only the canonical history directory. Absence is not an empty tracked
 * universe; present sources must all validate before exposing any history.
 * Retired/cancelled ledger occupancy is inspectable without live payloads.
 *
 * Sources are parsed working-tree documents, not an immutable installation
 * snapshot. The unshipped v1 event's metadata/digests do not establish its
 * publication conditions. No Git/source membership, current
 * terminal-state, scope completeness or approval check occurs here.
 * @param {{kitDir:string,identity:object}} input actual kit root and captured P1 ledger
 * @returns {{ok:boolean,present:boolean,assignmentHistory?:object,diagnostics:object[]}}
 */
export function readAssignmentHistory({ kitDir, identity, sourceBudget, documentBudget }) {
  if (sourceBudget !== undefined) assertSourceBudget(sourceBudget);
  if (documentBudget !== undefined) getDocumentBudgetUsage(documentBudget);
  const root = resolve(kitDir);
  if (!statSync(root).isDirectory()) throw new TypeError('History reader requires an existing kit directory.');
  const diagnostics = [];
  const add = (file, code, path, message) => diagnostics.push({ severity: 'error', file, code, path, message });
  const finish = (present, assignmentHistory) => ({ ok: diagnostics.length === 0, present,
    ...(assignmentHistory && diagnostics.length === 0 ? { assignmentHistory } : {}),
    diagnostics: diagnostics.sort((a, b) => compare(a.file, b.file) || compare(a.path, b.path) || compare(a.code, b.code)) });
  const readError = (file, message) => add(file, 'assignment-history-read-error', '', message);
  for (const file of ['subjects', directory]) {
    try {
      if (!lstatSync(join(root, file)).isDirectory()) {
        readError(file, 'History authority directories must be regular directories, not symbolic links.');
        return finish(true);
      }
    } catch (error) {
      if (!filesystemError(error)) throw error;
      if (error.code === 'ENOENT') return finish(false);
      readError(file, error.message);
      return finish(true);
    }
  }
  let names;
  try { names = readdirSync(join(root, directory)).sort(compare); }
  catch (error) {
    if (!filesystemError(error)) throw error;
    readError(directory, error.message);
    return finish(true);
  }
  if (!names.includes('_baselines.yaml')) add(manifest, 'assignment-history-missing-baselines', '',
    'A present history directory must declare its adoption baselines.');
  for (const name of names) {
    if (name !== '_baselines.yaml' && (!name.endsWith('.yaml') || !isIdentityUuid(name.slice(0, -5)))) {
      add(`${directory}/${name}`, 'assignment-history-unexpected-entry', '', 'Expected _baselines.yaml or an exact lowercase event UUID.yaml file.');
    }
  }
  if (diagnostics.length) return finish(true);
  const ledger = validateIdentityLedger(identity);
  if (!ledger.ok) {
    for (const diagnostic of ledger.diagnostics) add('_identity.yaml', 'assignment-history-identity', diagnostic.path,
      `History requires a valid installation ledger (${diagnostic.code}).`);
    return finish(true);
  }
  const identityIndex = buildIdentityIndex({ identity, identitySource: { file: '_identity.yaml', path: '' }, records: [], declarations: [] });

  function read(file, kind) {
    let descriptor;
    let document;
    try {
      const path = join(root, file);
      if (!lstatSync(path).isFile()) {
        readError(file, 'History sources must be exact regular files, not symbolic links.');
        return null;
      }
      descriptor = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
      if (!fstatSync(descriptor).isFile()) {
        readError(file, 'History source changed to a nonregular file.');
        return null;
      }
      const bytes = readSourceFileSync(descriptor, { sourceBudget });
      const text = bytes.toString('utf8');
      if (!Buffer.from(text).equals(bytes)) {
        readError(file, 'History sources must contain valid UTF-8 bytes.');
        return null;
      }
      document = load(text, { filename: file });
    } catch (error) {
      if (error instanceof YAMLException) add(file, 'assignment-history-parse-error', '', error.message);
      else if (filesystemError(error)) readError(file, error.message);
      else throw error;
      return null;
    } finally {
      if (descriptor !== undefined) closeSync(descriptor);
    }
    if (documentBudget !== undefined) guardCapturedDocument(document, documentBudget, { phase: 'parsed-assignment-history' });
    const shape = kind === 'assignment-event' ? validateAssignmentEventMetadata(document) : validateStoreFile(kind, document);
    if (!shape.ok) {
      for (const diagnostic of shape.diagnostics ?? shape.errors) add(file, diagnostic.code, diagnostic.path, diagnostic.message);
      return null;
    }
    if (document.namespace !== identity.namespace) {
      add(file, 'assignment-history-namespace', 'namespace', 'History and captured ledger namespaces must agree.');
      return null;
    }
    return { file, document };
  }

  const baselineSource = read(manifest, 'assignment-baselines');
  const eventSources = [];
  for (const name of names.filter((name) => name !== '_baselines.yaml')) {
    const source = read(`${directory}/${name}`, 'assignment-event');
    if (!source) continue;
    if (source.document.event !== name.slice(0, -5)) {
      add(source.file, 'assignment-history-event-name', 'event', 'Event UUID must equal its exact filename.');
    }
    eventSources.push(source);
  }
  if (diagnostics.length) return finish(true);
  const baselines = baselineSource.document.baselines;
  const events = eventSources.map(({ document }) => assignmentEventProjection(document));
  const chain = validateAssignmentHistoryChain({ namespace: identity.namespace, baselines, events });
  for (const diagnostic of chain.diagnostics) {
    const eventPath = /^events\[(\d+)\](?:\.(.*))?$/.exec(diagnostic.path);
    add(eventPath ? eventSources[Number(eventPath[1])].file : manifest, diagnostic.code,
      eventPath ? eventPath[2] ?? '' : diagnostic.path, diagnostic.message);
  }
  if (diagnostics.length) return finish(true);
  const occupancy = [];
  for (const [index, baseline] of baselines.entries()) {
    const resolution = resolveRecord(identityIndex, baseline.ref);
    if (!resolution.allocation) add(manifest, 'assignment-history-unallocated', `baselines[${index}].ref`,
      'A history baseline requires an occupied canonical record identity in the captured ledger.');
    else occupancy.push({ ref: { ...baseline.ref }, state: resolution.allocation.state });
  }
  occupancy.sort((a, b) => compare(a.ref.kind, b.ref.kind) || compare(a.ref.id, b.ref.id));
  return finish(true, { mode: 'history-source', namespace: identity.namespace,
    sources: { baselines: baselineSource, events: eventSources }, baselines, events, revisions: chain.revisions, occupancy,
    chainCheck: 'passed', currentStateCheck: 'not-performed', captureVerification: 'not-performed',
    eventScopeCheck: 'not-performed', approvalCheck: 'not-performed', publicationReady: false });
}
