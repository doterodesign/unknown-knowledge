/** Authored whole-record assignment state; no registry eligibility or I/O. */
import { parseCanonicalId, isIdentityUuid, RECORD_KINDS, recordIdentityMatches } from './record-identity.js';

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const compare = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const refKey = (ref) => JSON.stringify([ref.namespace, ref.kind, ref.id]);

/** @typedef {{code:string, path:string, message:string}} AssignmentDiagnostic */
/** @typedef {{state:'known', ids:string[]} | {state:'unknown', reason:'absent'} | {state:'invalid', diagnostics:AssignmentDiagnostic[]}} AssignmentState */
/** @typedef {import('./record-identity.js').RecordRef} RecordRef */

/**
 * Read a loader entry without filling in absent assignment metadata.
 * Canonical spelling is checked here; registry existence and lifecycle are
 * separate checks. A known list is recorded aboutness, never source proof.
 * @param {{record:object}} entry original kind-specific loader entry
 * @returns {AssignmentState}
 */
export function readAssignments(entry) {
  const record = entry?.record;
  if (!isObject(record)) {
    return { state: 'invalid', diagnostics: [{
      code: 'invalid-assignment-record', path: '', message: 'assignment metadata requires a readable record object',
    }] };
  }
  if (!Object.hasOwn(record, 'subjects')) return { state: 'unknown', reason: 'absent' };
  if (!Array.isArray(record.subjects)) {
    return { state: 'invalid', diagnostics: [{
      code: 'invalid-subjects', path: 'subjects', message: 'subjects must be an array of exact subject IDs',
    }] };
  }
  const seen = new Set();
  const diagnostics = [];
  for (let i = 0; i < record.subjects.length; i += 1) {
    const id = record.subjects[i];
    if (!parseCanonicalId('subject', id).ok) {
      diagnostics.push({ code: 'invalid-subject-id', path: `subjects[${i}]`, message: 'expected an exact canonical subject ID' });
    } else if (seen.has(id)) {
      diagnostics.push({ code: 'duplicate-subject', path: `subjects[${i}]`, message: 'subject is already assigned to this record' });
    } else seen.add(id);
  }
  return diagnostics.length > 0
    ? { state: 'invalid', diagnostics }
    : { state: 'known', ids: [...record.subjects] };
}

/**
 * Build a disposable direct index over captured typed current records.
 * Unknown metadata is retained separately; a missing posting proves nothing
 * about assignment presence. Any invalid or ambiguous input refuses the whole
 * index. Registry eligibility, captured-universe coverage, lifecycle filtering
 * and ancestry are deliberately not claims made by this projection.
 * @param {Iterable<{ref: RecordRef, entry: object}>} records
 * @returns {{ok:boolean, postings:Array<{subjectId:string, records:RecordRef[]}>, unknown:RecordRef[], diagnostics:object[]}}
 */
export function buildAssignmentIndex(records) {
  const rows = [];
  const diagnostics = [];
  const namespaces = new Set();
  const counts = new Map();
  for (const item of records) {
    const { ref, entry } = item ?? {};
    const validRef = isObject(ref) && RECORD_KINDS.includes(ref.kind)
      && isIdentityUuid(ref.namespace)
      && parseCanonicalId(ref.kind, ref.id).ok;
    const copiedRef = validRef ? { namespace: ref.namespace, kind: ref.kind, id: ref.id } : null;
    const location = {
      ref: copiedRef,
      ...(typeof entry?.file === 'string' ? { file: entry.file } : {}),
    };
    if (!validRef || !recordIdentityMatches(ref.kind, ref.id, entry)) {
      diagnostics.push({ ...location, code: 'invalid-record-ref', path: 'ref',
        message: 'expected an exact qualified current-record reference matching the authored record ID' });
      continue;
    }
    const key = refKey(copiedRef);
    namespaces.add(copiedRef.namespace);
    counts.set(key, (counts.get(key) ?? 0) + 1);
    const state = readAssignments(entry);
    if (state.state === 'invalid') {
      diagnostics.push(...state.diagnostics.map((diagnostic) => ({ ...location, ...diagnostic })));
    }
    rows.push({ key, ref: copiedRef, location, state });
  }
  rows.sort((a, b) => compare(a.key, b.key) || compare(a.location.file ?? '', b.location.file ?? ''));
  for (const row of rows) {
    if (counts.get(row.key) > 1) {
      diagnostics.push({ ...row.location, code: 'duplicate-record-ref', path: 'ref',
        message: 'multiple current records claim this qualified identity' });
    }
    if (namespaces.size > 1) {
      diagnostics.push({ ...row.location, code: 'mixed-namespace', path: 'ref.namespace',
        message: 'one assignment index cannot combine independently owned installation namespaces' });
    }
  }
  diagnostics.sort((a, b) => compare(a.ref ? refKey(a.ref) : '', b.ref ? refKey(b.ref) : '')
    || compare(a.file ?? '', b.file ?? '') || compare(a.path, b.path) || compare(a.code, b.code));
  if (diagnostics.length > 0) return { ok: false, postings: [], unknown: [], diagnostics };

  const bySubject = new Map();
  const unknown = [];
  for (const { ref, state } of rows) {
    if (state.state === 'unknown') {
      unknown.push(ref);
      continue;
    }
    for (const id of state.ids) {
      if (!bySubject.has(id)) bySubject.set(id, []);
      bySubject.get(id).push({ ...ref });
    }
  }
  const postings = [...bySubject.keys()].sort().map((subjectId) => ({
    subjectId, records: bySubject.get(subjectId),
  }));
  return { ok: true, postings, unknown, diagnostics: [] };
}
