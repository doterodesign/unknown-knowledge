/** Actual on-disk canonical installation with captured review bytes and a proposal refusal candidate. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { loadStores } from '../../payload/engine/lib/load-stores.js';
import { canonicalSha256 } from '../../payload/engine/lib/canonical-json.js';
export const namespace = '12345678-1234-4234-8234-123456789abc';
export const eventId = '23456789-1234-4234-8234-123456789abc';
export const proposal = `proposal:subject:${namespace}`;
export const ref = (id) => ({ namespace, kind: 'decision', id });
export const stateOf = ({ id, changes, ...state }) => state;
export const digestEvent = ({ review, ...event }) => canonicalSha256(event);
const authoredKeys = { schemaVersion: 'schema-version', hierarchyRevision: 'hierarchy-revision',
  originDecision: 'origin-decision', acceptedStatus: 'accepted-status',
  decisionCapture: 'decision-capture', decisionDigest: 'decision-digest', changeDigest: 'change-digest', refusalAssessment: 'refusal-assessment', beforeRegistry: 'before-registry',
  documentDigest: 'document-digest', identityDigest: 'identity-digest', relevantRefusals: 'relevant-refusals' };
export function authored(value) {
  if (Array.isArray(value)) return value.map(authored);
  return value && typeof value === 'object'
    ? Object.fromEntries(Object.entries(value).map(([key, item]) => [authoredKeys[key] ?? key, authored(item)])) : value;
}

export function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'subject-suppression-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const records = ['D-000001', 'D-000002'].map((id) => ({ id, title: id, status: 'accepted',
    category: 'architecture', date: '2026-09-19', deciders: ['steward'],
    context: 'Captured proposal review', decision: 'Record the reviewed disposition' }));
  const file = 'decisions/entries/review.yaml';
  const bytes = Buffer.from(JSON.stringify({ 'schema-version': 2, entries: records }));
  const hash = (algorithm, value) => createHash(algorithm).update(value).digest('hex');
  const capture = { file, sha256: hash('sha256', bytes),
    blob: hash('sha1', Buffer.concat([Buffer.from(`blob ${bytes.length}\0`), bytes])) };
  const identity = { 'schema-version': 1, 'identity-format': 1, namespace,
    allocations: records.map(({ id }) => ({ kind: 'decision', id, state: 'allocated',
      publication: { id: eventId, review: 'review:identity' } })) };
  const draft = { id: proposal, label: 'Color', definition: { text: 'Visual perception', includes: [], excludes: [] },
    aliases: [{ label: 'Colour', locale: 'en' }], related: [], status: 'proposed', changes: [],
    originDecision: ref('D-000001'), warrant: { records: [{ ref: ref('D-000001'), capture }], sources: [] } };
  const before = { schemaVersion: 1, namespace, revision: 0, hierarchyRevision: 0, subjects: [draft], history: [] };
  const event = { id: eventId, action: 'suppress', decision: ref('D-000002'), reason: 'Not warranted for this scope',
    rows: [{ id: proposal, before: structuredClone(stateOf(draft)), after: { ...structuredClone(stateOf(draft)), status: 'suppressed',
      refusal: { decision: ref('D-000002'), reason: 'Not warranted for this scope' } } }] };
  event.review = { reference: 'review:refusal', acceptedStatus: 'accepted', decisionCapture: capture,
    decisionDigest: canonicalSha256(records[1]), changeDigest: digestEvent(event) };
  const candidate = { ...structuredClone(before), revision: 1,
    subjects: [{ id: proposal, ...structuredClone(event.rows[0].after), changes: [eventId] }], history: [event] };
  const put = (path, value) => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), Buffer.isBuffer(value) ? value : JSON.stringify(value));
  };
  put('_identity.yaml', identity);
  put('decisions/_catalog.yaml', { 'schema-version': 2, store: 'decisions',
    entries: records.map(({ id, title }) => ({ id, title, file: 'entries/review.yaml' })) });
  put(file, bytes);
  put('subjects/registry.yaml', authored(before));
  const model = loadStores(root);
  assert.equal(model.ok, true, JSON.stringify(model.diagnostics));
  return { root, before, candidate, model, identityIndex: model.identityIndex, put,
    decisionCaptures: [{ capture, bytes, objectFormat: 'sha1' }] };
}
