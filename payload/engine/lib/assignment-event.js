/** One final event metadata/projection contract; no evidence or scope approval. */
import { canonicalSha256 } from './canonical-json.js';
import { isCaptureLocator } from './capture-locator.js';
import { parseCanonicalId } from './record-identity.js';
import { ERROR_CODES, compare, validateStoreFile } from './validate-record.js';

export const ASSIGNMENT_EVENT_DIAGNOSTIC_CODES = Object.freeze([...ERROR_CODES,
  'assignment-event-scope', 'assignment-event-input', 'assignment-event-authorizer',
  'assignment-event-capture', 'assignment-event-candidate-digest', 'assignment-event-change-digest',
]);
const key = (ref) => JSON.stringify([ref.namespace, ref.kind, ref.id]);
const pathShape = (value) => typeof value === 'string' && value === value.trim() && value.length > 0
  && !/[\\\0]/.test(value) && !/^[a-zA-Z]:/.test(value)
  && value.split('/').every((part) => part !== '' && part !== '.' && part !== '..');

/** Digest complete qualified after-file witnesses, independent of row order. */
export function assignmentCandidateDigest(rows) {
  return canonicalSha256(rows.map((row) => ({ ref: row.ref, 'after-capture': row['after-capture'] }))
    .sort((a, b) => compare(key(a.ref), key(b.ref))));
}

/** Review is detached from its own body digest; final containing tree is external. */
export function assignmentEventDigest(event) {
  const { review, ...body } = event;
  return canonicalSha256(body);
}

/**
 * Validate declared metadata and semantic JSON bindings, not capture bytes,
 * current authorizer, selected universe, event row coverage, or human approval.
 * @param {unknown} event parsed v1 domain or v2 existing-record wire document
 * @returns {{ok:boolean,diagnostics:object[]}}
 */
export function validateAssignmentEventMetadata(event) {
  const kind = event?.['schema-version'] !== 2 ? 'assignment-event'
    : event.operation === 'canonical-creation' ? 'assignment-creation-event'
      : event.operation === 'subject-use-transition'
        ? event.scope?.action === 'retire' ? 'assignment-retirement-event'
          : event.scope?.action === 'split' ? 'assignment-split-event' : 'assignment-transition-event'
        : 'assignment-event-v2';
  const schema = validateStoreFile(kind, event);
  if (!schema.ok) return { ok: false, diagnostics: schema.errors };
  const diagnostics = [];
  const add = (code, path, message) => diagnostics.push({ code, path, message });
  const before = event['before-input'];
  if ((before['kit-path'] !== '.' && !pathShape(before['kit-path'])) || before.commit.length !== before.tree.length) {
    add('assignment-event-input', 'before-input', 'Before input requires normalized kit path and one Git object format.');
  }
  if (event['schema-version'] === 2) {
    const refs = event.operation === 'subject-use-transition' ? event.rows.map(({ ref }) => ref) : event.scope.refs;
    const rowKeys = event.rows.map(({ ref }) => key(ref));
    if (refs.some((ref) => ref.namespace !== event.namespace || !parseCanonicalId(ref.kind, ref.id).ok)
      || new Set(refs.map(key)).size !== refs.length || new Set(rowKeys).size !== rowKeys.length
      || JSON.stringify(refs.map(key).sort()) !== JSON.stringify(rowKeys.sort())) {
      add('assignment-event-scope', 'scope.refs', 'Typed scope must equal the exact unique qualified row set in this installation.');
    }
    if (event.operation === 'subject-use-transition'
      && ((event.scope.action === 'merge-equivalent'
        && (new Set(event.scope.absorbed).size !== event.scope.absorbed.length || event.scope.absorbed.includes(event.scope.survivor)))
        || new Set(event.scope['registry-events']).size !== event.scope['registry-events'].length)) {
      add('assignment-event-scope', 'scope', 'A lifecycle scope requires unique ordered registry events; merge participants also remain distinct.');
    }
    if (event.operation === 'subject-use-transition' && event.scope.action === 'split'
      && (event.scope['registry-events'].length !== 2
        || new Set(event.scope.successors).size !== event.scope.successors.length
        || event.scope.successors.includes(event.scope.subject)
        || event.rows.some((row, index) => index > 0 && key(event.rows[index - 1].ref) >= key(row.ref)))) {
      add('assignment-event-scope', 'scope', 'Split requires two distinct registry events, distinct successors excluding source, and rows in qualified owner order.');
    }
  } else if (new Set(event.scope.values).size !== event.scope.values.length || event.scope.values.some((value) => !pathShape(value))) {
    add('assignment-event-scope', 'scope.values', 'Scope requires distinct exact segment paths without normalization.');
  }
  if (event.decision.namespace !== event.namespace || event.decision.kind !== 'decision'
    || !parseCanonicalId('decision', event.decision.id).ok) {
    add('assignment-event-authorizer', 'decision', 'The authorizer must be an exact Decision in this installation.');
  }
  if (!isCaptureLocator(event.review['decision-capture'])) {
    add('assignment-event-capture', 'review.decision-capture', 'Invalid Decision capture locator.');
  }
  const files = { before: new Map(), after: new Map() };
  for (const [index, row] of event.rows.entries()) {
    for (const side of ['before', 'after']) {
      if (side === 'before' && event.operation === 'canonical-creation') continue;
      const capture = row[`${side}-capture`];
      if (!isCaptureLocator(capture) || (side === 'before'
        && (capture.source?.commit !== before.commit || capture.source?.tree !== before.tree))) {
        add('assignment-event-capture', `rows[${index}].${side}-capture`, 'Capture must match its exact declared input and locator shape.');
      }
      const existing = files[side].get(capture.file);
      if (existing && (existing.blob !== capture.blob || existing.sha256 !== capture.sha256)) {
        add('assignment-event-capture', `rows[${index}].${side}-capture`, 'One captured file cannot have conflicting byte identities on the same side.');
      }
      files[side].set(capture.file, capture);
    }
  }
  if (assignmentCandidateDigest(event.rows) !== event['candidate-records-digest']) {
    add('assignment-event-candidate-digest', 'candidate-records-digest', 'Digest differs from the complete qualified after-capture manifest.');
  }
  if (assignmentEventDigest(event) !== event.review['change-digest']) {
    add('assignment-event-change-digest', 'review.change-digest', 'Event body differs from the declared reviewed change digest.');
  }
  return { ok: diagnostics.length === 0,
    diagnostics: diagnostics.sort((a, b) => compare(a.path, b.path) || compare(a.code, b.code)) };
}

/** Keep the existing shared chain representation internal; no old wire reader. */
export function assignmentEventProjection(document) {
  return { 'schema-version': document['schema-version'], event: document.event, namespace: document.namespace,
    ...(document['schema-version'] === 2 ? { operation: document.operation } : {}),
    beforeInputRef: canonicalSha256(document['before-input']), candidateInputRef: document['candidate-records-digest'],
    rows: document.rows.map((row) => ({ ref: row.ref, before: row.before, after: row.after,
      beforeRevision: row['before-revision'], afterRevision: row['after-revision'],
      ...(document.operation === 'canonical-creation' ? { beforeCapture: row['before-capture'], afterCapture: row['after-capture'] } : {}),
      disposition: row.disposition, reason: row.reason })) };
}
