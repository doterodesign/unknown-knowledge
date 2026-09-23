/** Closed safe wire; binding is not human semantic review or actual execution. */
import { isDeepStrictEqual } from 'node:util';
import { canonicalSha256 } from './canonical-json.js';
import { isCaptureLocator } from './capture-locator.js';

const closed = (v, keys) => v !== null && typeof v === 'object' && !Array.isArray(v)
  && Reflect.ownKeys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k));
const hash = v => typeof v === 'string' && /^[0-9a-f]{64}$/.test(v);
const text = v => typeof v === 'string' && v.length > 0 && !v.includes('\0');
const nat = v => Number.isSafeInteger(v) && v >= 0;
const kinds = ['installed-runtime', 'existing-domain-owner', 'identity-ledger', 'non-consumer', 'seed-provenance',
  'reviewed-text', 'ontology-rules', 'knowledge-rules', 'suppressions', 'launcher', 'seeded-wrapper', 'deactivated'];
const dispositions = ['replace-distribution', 'domain-proof', 'allocate', 'preserve', 'rewrite', 'retire-ranges', 'remove'];
const codes = new Set(['cutover-input', 'cutover-parser-unavailable', 'cutover-runtime-side', 'cutover-runtime-capacity',
  'cutover-runtime-drift', 'cutover-reference-span', 'cutover-unused-bindings', 'cutover-removal-shape', 'cutover-rules-disposition',
  'cutover-rules-grammar', 'cutover-rules-span', 'cutover-suppression-disposition', 'cutover-suppression-coverage',
  'cutover-suppression-binding', 'cutover-suppression-reference', 'cutover-suppression-scalar', 'cutover-role-disposition',
  'cutover-launch-form', 'cutover-file-kind', 'cutover-byte-capacity', 'cutover-capture-drift', 'cutover-role-coverage',
  'cutover-runtime-pair', 'cutover-correspondence', 'cutover-role-overlap', 'cutover-edit-capacity', 'cutover-role-source',
  'cutover-consumer-bytes', 'cutover-launch-coverage', 'cutover-review-capacity', 'cutover-role-path', 'cutover-seeded-layout', 'cutover-consumer-grammar']);
const capture = (v, file) => v === null || (closed(v, ['file', 'blob', 'sha256', 'mode', 'size'])
  && v.file === file && isCaptureLocator({ file: v.file, blob: v.blob, sha256: v.sha256 })
  && ['100644', '100755'].includes(v.mode) && nat(v.size));

export function isInstallationReport(value, expected) {
  if (value === null) return true;
  if (closed(value, ['version', 'status', 'code']) && value.version === 1 && value.status === 'failed') return codes.has(value.code);
  if (!closed(value, ['version', 'status', 'policy', 'reviewDigest', 'inventory', 'installedRuntime', 'activation', 'resources'])
    || value.version !== 1 || value.status !== 'complete' || value.policy !== 'installation-cutover-v1'
    || !hash(value.reviewDigest) || !hash(value.installedRuntime) || value.activation !== 'not-observed'
    || !closed(value.resources, ['files', 'bytes', 'edits', 'edges']) || !Object.values(value.resources).every(nat)) return false;
  const inv = value.inventory;
  if (!closed(inv, ['version', 'source', 'candidate', 'roles', 'launches']) || inv.version !== 1
    || !isDeepStrictEqual(inv.source, expected.source) || !isDeepStrictEqual(inv.candidate, expected.candidate)
    || !Array.isArray(inv.roles) || inv.roles.length !== value.resources.files || !Array.isArray(inv.launches)
    || inv.launches.length !== value.resources.edges || !inv.launches.length) return false;
  let previous = null;
  for (const row of inv.roles) {
    if (!closed(row, ['file', 'role', 'disposition', 'reason', 'before', 'candidate']) || !text(row.file)
      || (previous !== null && Buffer.compare(Buffer.from(previous), Buffer.from(row.file)) >= 0)
      || !kinds.includes(row.role) || !dispositions.includes(row.disposition) || !(row.reason === null || text(row.reason))
      || !capture(row.before, row.file) || !capture(row.candidate, row.file) || (!row.before && !row.candidate)) return false;
    previous = row.file;
  }
  for (const edge of inv.launches) {
    if (!closed(edge, ['file', 'form', 'target', 'kitPath', ...(Object.hasOwn(edge, 'script') ? ['script'] : [])])
      || !['shell-node', 'package-script', 'agent-pointer', 'seeded-wrapper'].includes(edge.form) || !text(edge.file) || !text(edge.target)
      || (edge.form === 'package-script') !== Object.hasOwn(edge, 'script')
      || edge.kitPath !== expected.candidate.kitPath || (Object.hasOwn(edge, 'script') && !text(edge.script))
      || !inv.roles.some(row => row.file === edge.file && ['launcher', 'seeded-wrapper'].includes(row.role) && row.candidate)
      || !inv.roles.some(row => row.file === edge.target && row.candidate)) return false;
  }
  return canonicalSha256(inv) === value.reviewDigest;
}

/** Independently supplied trusted orchestration configuration, as with runtime policy. */
export function matchesApprovedInstallationReview(approved, report) {
  return report?.status === 'complete' && closed(approved, ['digest', 'review']) && hash(approved.digest)
    && closed(approved.review, ['version', 'source', 'candidate', 'inventoryDigest', 'activation']) && approved.review.version === 1
    && closed(approved.review.activation, ['hooksPath', 'externalConsumers', 'environment'])
    && typeof approved.review.activation.hooksPath === 'string'
    && /^(?:[A-Za-z0-9_-]|\.[A-Za-z0-9_-])[A-Za-z0-9_./-]*$/.test(approved.review.activation.hooksPath)
    && approved.review.activation.hooksPath.split('/').every(part => part && part !== '.' && part !== '..' && part !== '.git')
    && approved.review.activation.externalConsumers === 'none'
    && approved.review.activation.environment === 'current-process'
    && isDeepStrictEqual(approved.review.source, report.inventory.source)
    && isDeepStrictEqual(approved.review.candidate, report.inventory.candidate)
    && approved.review.inventoryDigest === report.reviewDigest && canonicalSha256(approved.review) === approved.digest;
}
