import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { join } from 'node:path';
import { canonicalSha256 } from '../payload/engine/lib/canonical-json.js';
import { verifyRetainedRuntimeCapability } from '../payload/engine/lib/runtime-capability.js';
import { fixture } from './helpers/prepared-evidence-fixture.js';

const scope = 'kit-managed-subject-route-persistence';
const exclusions = ['caller-request-files', 'external-client-saved-routes', 'arbitrary-repository-json'];
function approved(f) {
  // Explicit trusted test policy; production observation never self-approves.
  const profile = { version: 1, id: 'subject-route-persistence-unsupported-v1', scope,
    persistence: 'unsupported', managedPaths: [], exclusions, files: structuredClone(f.runtime.files) };
  return { digest: canonicalSha256(profile), profile };
}
function unavailable(result, code, captures) {
  assert.deepEqual(result, { version: 1, kind: 'runtime-capability-evidence', scope,
    externalInventory: 'unknown', excludedScopes: exclusions, captures,
    status: 'unavailable', persistence: null, supportedAuthorityPaths: null,
    runtimeProfile: null, runtimeDigest: null, diagnostics: [{ code }] });
}
test('only full independently approved claim/inventory match establishes narrow runtime capability', (t) => {
  const f = fixture(t); const { input } = f.save(); const policy = approved(f);
  const result = verifyRetainedRuntimeCapability(input, policy);
  assert.deepEqual(result, { version: 1, kind: 'runtime-capability-evidence', scope,
    externalInventory: 'unknown', excludedScopes: exclusions,
    captures: { source: input.expected.source, candidate: input.expected.candidate },
    status: 'established', persistence: 'unsupported', supportedAuthorityPaths: [],
    runtimeProfile: { id: policy.profile.id, version: 1, digest: policy.digest },
    runtimeDigest: input.expected.runtimeDigest, diagnostics: [] });
  assert.equal(Object.hasOwn(result, 'publicationReady'), false);
});
test('missing, malformed or altered profile claims remain unavailable with actual verified descriptors', (t) => {
  const f = fixture(t); const { input } = f.save();
  const captures = { source: input.expected.source, candidate: input.expected.candidate };
  unavailable(verifyRetainedRuntimeCapability(input, null), 'runtime-profile-unavailable', captures);
  for (const edit of [
    (p) => { p.digest = '0'.repeat(64); }, (p) => { p.extra = true; },
    (p) => { p.profile.scope = 'all-route-persistence'; },
    (p) => { p.profile.persistence = 'supported'; }, (p) => { p.profile.managedPaths = ['routes.json']; },
    (p) => { p.profile.exclusions = []; }, (p) => { p.profile.version = 2; },
    (p) => { p.profile.files.reverse(); }, (p) => { p.profile.files.push(p.profile.files[0]); },
  ]) {
    const p = approved(f); edit(p);
    if (p.digest !== '0'.repeat(64)) p.digest = canonicalSha256(p.profile);
    unavailable(verifyRetainedRuntimeCapability(input, p), 'runtime-profile-mismatch', captures);
  }
});
test('changed, omitted and added authority files invalidate the whole inventory match', (t) => {
  const f = fixture(t); const { input } = f.save();
  const captures = { source: input.expected.source, candidate: input.expected.candidate };
  for (const edit of [
    (p) => { p.files[0].sha256 = 'f'.repeat(64); }, (p) => { p.files[0].size += 1; },
    (p) => { p.files.pop(); },
    (p) => { p.files.push({ path: 'schemas/saved-routes.schema.json', mode: 0o400, size: 2, sha256: 'e'.repeat(64) }); },
  ]) {
    const p = approved(f); edit(p.profile); p.digest = canonicalSha256(p.profile);
    unavailable(verifyRetainedRuntimeCapability(input, p), 'runtime-inventory-mismatch', captures);
  }
  const bytes = Buffer.from('{}');
  const extra = { path: 'schemas/saved-routes.schema.json', mode: 0o400, size: bytes.length,
    sha256: '44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a' };
  const changed = f.save({ editRuntime: (r) => { r.files.push(extra); }, extraArtifacts: [{ file: `runtime/files/${extra.path}`, bytes }] });
  unavailable(verifyRetainedRuntimeCapability(changed.input, approved(f)), 'runtime-inventory-mismatch', captures);
});
test('actual readback corruption and expected binding mismatch throw, even without a profile', (t) => {
  const f = fixture(t); const { input } = f.save();
  assert.throws(() => verifyRetainedRuntimeCapability({ ...input, expected: { ...input.expected, runtimeDigest: '0'.repeat(64) } }, null));
  const marker = join(f.evidenceDirectory, 'bundles', `${input.bundleDigest}.json`);
  fs.chmodSync(marker, 0o600); fs.writeFileSync(marker, '{}'); fs.chmodSync(marker, 0o400);
  assert.throws(() => verifyRetainedRuntimeCapability(input, approved(f)), /bundle digest/);
});
test('uncertain durability yields null captures, never expected descriptors as evidence', (t) => {
  const f = fixture(t); const { input } = f.save(); const original = fs.fsyncSync;
  fs.fsyncSync = () => { throw Object.assign(new Error('fixture'), { code: 'EIO', errno: -5 }); };
  syncBuiltinESMExports();
  try { unavailable(verifyRetainedRuntimeCapability(input, approved(f)), 'retained-evidence-unavailable', null); }
  finally { fs.fsyncSync = original; syncBuiltinESMExports(); }
});
