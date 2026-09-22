/** Closed first-branch promotion input; no caller proof objects. */
import { canonicalSha256 } from './canonical-json.js';
import { isIdentityUuid, parseCanonicalId, parseProposalKey } from './record-identity.js';
import { isCaptureLocator } from './capture-locator.js';
import { isCalendarDate } from './iso-date.js';

const closed = (value, keys) => value !== null && typeof value === 'object'
  && [Object.prototype, null].includes(Object.getPrototypeOf(value))
  && Reflect.ownKeys(value).length === keys.length && keys.every((key) => {
    const field = Object.getOwnPropertyDescriptor(value, key); return field?.enumerable && Object.hasOwn(field, 'value');
  });
const dense = (value) => Array.isArray(value) && Object.getPrototypeOf(value) === Array.prototype
  && Reflect.ownKeys(value).length === value.length + 1
  && Array.from({ length: value.length }, (_, i) => {
    const field = Object.getOwnPropertyDescriptor(value, String(i)); return field?.enumerable && Object.hasOwn(field, 'value');
  }).every(Boolean);
const oid = (value) => typeof value === 'string' && /^(?:[0-9a-f]{40}|[0-9a-f]{64})(?![\s\S])/.test(value);
const text = (value) => typeof value === 'string' && value === value.trim() && value.length > 0 && !/[\x00-\x1f\x7f]/.test(value);
const descriptor = (value) => closed(value, ['commit', 'tree', 'kitPath']) && oid(value.commit) && oid(value.tree)
  && value.commit.length === value.tree.length && ['.', 'unknown-knowledge'].includes(value.kitPath);
const capacities = (value, keys, minimum) => closed(value, keys)
  && keys.every((key) => Number.isSafeInteger(value[key]) && value[key] >= minimum);

export function decisionPromotionInputWire(input) {
  const { repoRoot, ...operation } = input; return { version: 1, ...structuredClone(operation) };
}

export function admitDecisionPromotionInput(input) {
  const fail = () => ({ ok: false, input: null, inputDigest: null });
  if (!closed(input, ['repoRoot', 'before', 'candidate', 'publication', 'promotion', 'eventId', 'reviewNote', 'limits'])
    || !text(input.repoRoot) || !descriptor(input.before) || !descriptor(input.candidate)
    || !closed(input.publication, ['id', 'review']) || !isIdentityUuid(input.publication.id) || !text(input.publication.review)
    || !isIdentityUuid(input.eventId) || !closed(input.reviewNote, ['date', 'author', 'skill'])
    || !isCalendarDate(input.reviewNote.date) || !text(input.reviewNote.author) || input.reviewNote.author.length > 160
    || !text(input.reviewNote.skill) || input.reviewNote.skill.length > 160
    || !closed(input.limits, ['promotion', 'assignments'])
    || !capacities(input.limits.promotion, ['maxFiles', 'maxFileBytes', 'maxSourceBytes', 'maxPromotions'], 1)
    || input.limits.promotion.maxFileBytes > 64 * 1024 * 1024
    || !capacities(input.limits.assignments, ['maxRecords', 'maxCaptureBytes', 'maxRedirects'], 0)
    || !closed(input.promotion, ['version', 'rows']) || input.promotion.version !== 1
    || !dense(input.promotion.rows) || !input.promotion.rows.length) return fail();
  const proposals = new Set(); const refs = new Set();
  for (const row of input.promotion.rows) {
    if (!closed(row, ['proposalRef', 'canonicalRef', 'targetLifecycle', 'beforeCapture'])
      || !closed(row.proposalRef, ['namespace', 'kind', 'key']) || row.proposalRef.kind !== 'decision'
      || !isIdentityUuid(row.proposalRef.namespace) || !parseProposalKey('decision', row.proposalRef.key).ok
      || !closed(row.canonicalRef, ['namespace', 'kind', 'id']) || row.canonicalRef.kind !== 'decision'
      || !isIdentityUuid(row.canonicalRef.namespace) || !parseCanonicalId('decision', row.canonicalRef.id).ok
      || row.targetLifecycle !== 'accepted' || !closed(row.beforeCapture, ['file', 'blob', 'sha256', 'source'])
      || !closed(row.beforeCapture.source, ['commit', 'tree']) || !isCaptureLocator(row.beforeCapture)
      || proposals.has(row.proposalRef.key) || refs.has(row.canonicalRef.id)) return fail();
    proposals.add(row.proposalRef.key); refs.add(row.canonicalRef.id);
  }
  const detached = structuredClone(input);
  return { ok: true, input: detached, inputDigest: canonicalSha256(decisionPromotionInputWire(detached)) };
}
