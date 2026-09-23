import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { canonicalJsonBytes } from '../../payload/engine/lib/canonical-json.js';
import { artifactCapture, rawSha256, retainPreparedEvidence } from '../../payload/engine/lib/prepared-evidence.js';

export const limits = { maxManifestBytes: 100_000, maxArtifacts: 30, maxArtifactBytes: 100_000, maxTotalArtifactBytes: 1_000_000 };
export function fixture(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'prepared-readback-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const path of ['repo', 'runtime', 'evidence']) mkdirSync(join(root, path), { mode: 0o700 });
  const evidenceDirectory = join(root, 'evidence');
  const source = { commit: '1'.repeat(40), tree: '2'.repeat(40), kitPath: '.' };
  const baseArtifacts = []; const files = []; const entrypoints = [];
  for (const [id, path] of [['structural', 'engine/validate.js'], ['values', 'engine/validate-values.js']]) {
    const bytes = Buffer.from(`// captured fixture for ${id}\n`);
    baseArtifacts.push({ file: `runtime/files/${path}`, bytes });
    files.push({ path, mode: 0o400, size: bytes.length, sha256: rawSha256(bytes) });
    entrypoints.push({ id, path, sha256: rawSha256(bytes) });
  }
  files.sort((a, b) => Buffer.compare(Buffer.from(a.path), Buffer.from(b.path)));
  const runtime = { version: 1, identityFormat: 1, environmentPolicy: 'posix-fixed-v1', host: { platform: process.platform, arch: process.arch },
    files, entrypoints, operation: { status: 'unavailable' }, executables: {
      node: { path: '/trusted/node', version: 'fixture-node', sha256: 'a'.repeat(64) },
      git: { path: '/usr/bin/git', version: 'fixture-git', sha256: 'b'.repeat(64), execPath: '/trusted/git-core' },
    } };
  const capture = (file, text) => { const bytes = Buffer.from(text); baseArtifacts.push({ file, bytes }); return artifactCapture(file, bytes); };
  const empty = { status: 'not-performed', completion: 'unavailable', exitCode: null, signal: null, stdout: null, stderr: null, result: null };
  const report = { version: 1, source, candidate: source, operation: 'identity-migration', runtimeDigest: '',
    checks: [
      { id: 'structural', status: 'failed', completion: 'complete', exitCode: 2, signal: null, result: null,
        stdout: capture('checks/structural/stdout', '\uFEFFraw\r\n'), stderr: capture('checks/structural/stderr', 'actual diagnostic\n') },
      { id: 'values', ...empty }, { id: 'operation', ...empty },
    ], execution: { exitCode: 0, signal: null, stdout: capture('execution/stdout', ''), stderr: capture('execution/stderr', '') },
    validationComplete: false, publicationReady: false };
  const save = ({ editRuntime, editReport, extraArtifacts = [] } = {}) => {
    const r = structuredClone(runtime); editRuntime?.(r);
    const runtimeBytes = canonicalJsonBytes(r); const runtimeDigest = rawSha256(runtimeBytes);
    const result = structuredClone(report); result.runtimeDigest = runtimeDigest; editReport?.(result);
    const reportBytes = canonicalJsonBytes(result); const reportDigest = rawSha256(reportBytes);
    const expected = { source, candidate: source, operation: 'identity-migration', runtimeDigest, reportDigest };
    const artifacts = [...baseArtifacts, ...extraArtifacts,
      { file: 'runtime/manifest.json', bytes: runtimeBytes }, { file: 'report.json', bytes: reportBytes }];
    const retained = retainPreparedEvidence({ evidenceDirectory, repoRoot: join(root, 'repo'), runtimeRoot: join(root, 'runtime'), binding: expected, artifacts });
    assert.equal(retained.status, 'retained');
    return { input: { evidenceDirectory, bundleDigest: retained.bundleDigest, expected, limits: { ...limits } }, report: result, artifacts };
  };
  return { root, evidenceDirectory, runtime, save };
}

