/** Literal retained-evidence fixture using the real identity capture builder. */
import { createHash } from 'node:crypto';
import { canonicalSha256 } from '../../payload/engine/lib/canonical-json.js';
import { buildIdentityIndex } from '../../payload/engine/lib/record-identity-index.js';
const namespace = '12345678-1234-4234-8234-123456789abc';
const eventId = '23456789-1234-4234-8234-123456789abc';
const hash = (algorithm, value) => createHash(algorithm).update(value).digest('hex');
const digestEvent = ({ review, ...event }) => canonicalSha256(event);

export function subjectGovernanceFixture(currentStatus = 'accepted') {
  const ref = { namespace, kind: 'decision', id: 'D-000001' };
  const record = { id: ref.id, status: 'accepted', title: 'Approve this precise meaning' };
  const bytes = Buffer.from(JSON.stringify({ 'schema-version': 1, entries: [record] }));
  const file = 'decisions/entries/approval.yaml';
  const capture = { file, sha256: hash('sha256', bytes),
    blob: hash('sha1', Buffer.concat([Buffer.from(`blob ${bytes.length}\0`), bytes])) };
  const state = { label: 'Color', definition: { text: 'Visual perception', includes: [], excludes: [] },
    aliases: [], related: [], status: 'active', originDecision: ref,
    warrant: { records: [{ ref, capture }], sources: [] } };
  const event = { id: eventId, action: 'activate', decision: ref,
    rows: [{ id: 'S-000001', before: null, after: state }], reason: 'Establish reviewed classification' };
  event.review = { reference: 'review:approval', decisionDigest: canonicalSha256(record),
    changeDigest: digestEvent(event), acceptedStatus: 'accepted', decisionCapture: capture };
  const document = { schemaVersion: 1, namespace, revision: 1, hierarchyRevision: 0,
    subjects: [{ id: 'S-000001', ...state, changes: [eventId] }], history: [event] };
  const identity = { 'schema-version': 1, 'identity-format': 1, namespace,
    allocations: [{ id: ref.id, kind: 'decision', state: 'allocated',
      publication: { id: eventId, review: 'review:identity' } },
    ...['S-000001', 'S-000002'].map((id) => ({ id, kind: 'subject', state: 'allocated',
      publication: { id: eventId, review: 'review:identity' } }))] };
  const entry = { id: ref.id, file, record: { ...record, status: currentStatus } };
  const identityInput = { identity, identitySource: { file: '_identity.yaml', path: '' },
    records: [{ kind: 'decision', entry, locator: { file, path: 'entries[0]' } }], declarations: [] };
  return { document, identityInput, identityIndex: buildIdentityIndex(identityInput),
    decisionCaptures: [{ capture, bytes, objectFormat: 'sha1' }] };
}

