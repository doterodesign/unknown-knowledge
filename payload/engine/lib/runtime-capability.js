/** Correspondence to separately approved runtime policy; never authenticates approval. */
import { isDeepStrictEqual } from 'node:util';
import { canonicalSha256, CapturedInputError } from './canonical-json.js';
import { isCaptureLocator } from './capture-locator.js';
import { readRetainedPreparedEvidence } from './prepared-evidence.js';

const scope = 'kit-managed-subject-route-persistence';
const profileId = 'subject-route-persistence-unsupported-v1';
const exclusions = Object.freeze(['caller-request-files', 'external-client-saved-routes', 'arbitrary-repository-json']);
const closed = (value, keys) => value !== null && typeof value === 'object' && !Array.isArray(value)
  && Reflect.ownKeys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const hash = (value) => typeof value === 'string' && /^[0-9a-f]{64}(?![\s\S])/.test(value);

function approvedShape(approved) {
  if (!closed(approved, ['digest', 'profile']) || !hash(approved.digest)) return false;
  const p = approved.profile;
  if (!closed(p, ['version', 'id', 'scope', 'persistence', 'managedPaths', 'exclusions', 'files'])
    || p.version !== 1 || p.id !== profileId || p.scope !== scope || p.persistence !== 'unsupported'
    || !isDeepStrictEqual(p.managedPaths, []) || !isDeepStrictEqual(p.exclusions, exclusions)
    || !Array.isArray(p.files)) return false;
  let previous = null;
  for (const row of p.files) {
    if (!closed(row, ['path', 'mode', 'size', 'sha256']) || row.mode !== 0o400
      || !Number.isSafeInteger(row.size) || row.size < 0 || !hash(row.sha256)
      || !isCaptureLocator({ file: row.path, blob: '1'.repeat(40), sha256: row.sha256 })
      || (previous !== null && Buffer.compare(Buffer.from(previous), Buffer.from(row.path)) >= 0)) return false;
    previous = row.path;
  }
  try { return canonicalSha256(p) === approved.digest; }
  catch (error) {
    if (!(error instanceof CapturedInputError) && !(error instanceof RangeError)) throw error;
    return false;
  }
}

/**
 * approvedProfile is independently reviewed trusted orchestration configuration,
 * outside the captured distribution. It is never an operation-plan override.
 * Actual readback supplies both file inventory and descriptors; a caller-created
 * verified object cannot replace it. Corruption retains the readback refusal.
 */
export function verifyRetainedRuntimeCapability(readbackInput, approvedProfile) {
  const retained = readRetainedPreparedEvidence(readbackInput);
  const common = { version: 1, kind: 'runtime-capability-evidence', scope,
    externalInventory: 'unknown', excludedScopes: [...exclusions],
    captures: retained.status === 'verified'
      ? { source: retained.manifest.source, candidate: retained.manifest.candidate } : null };
  const unavailable = (code) => ({ ...common, status: 'unavailable', persistence: null,
    supportedAuthorityPaths: null, runtimeProfile: null, runtimeDigest: null, diagnostics: [{ code }] });
  if (retained.status !== 'verified') return unavailable('retained-evidence-unavailable');
  if (approvedProfile === null) return unavailable('runtime-profile-unavailable');
  if (!approvedShape(approvedProfile)) return unavailable('runtime-profile-mismatch');
  if (!isDeepStrictEqual(approvedProfile.profile.files, retained.runtimeManifest.files)) {
    return unavailable('runtime-inventory-mismatch');
  }
  return { ...common, status: 'established', persistence: 'unsupported', supportedAuthorityPaths: [],
    runtimeProfile: { id: profileId, version: 1, digest: approvedProfile.digest },
    runtimeDigest: retained.manifest.runtimeDigest, diagnostics: [] };
}
