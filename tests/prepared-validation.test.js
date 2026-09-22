import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { runPreparedCandidateChecks } from '../payload/engine/lib/prepared-validation.js';
import { retainPreparedEvidence, readRetainedPreparedEvidence, rawSha256 } from '../payload/engine/lib/prepared-evidence.js';
import { canonicalJsonBytes, canonicalSha256 } from '../payload/engine/lib/canonical-json.js';

const migrationInputs = { namespace: 'invalid-test-input', publication: { id: '22222222-2222-4222-8222-222222222222', review: 'private fixture review' }, proposals: [], declarations: [], adjudications: [], proseDecisions: [] };
const migrationLimits = { maxTreeEntries: 100, maxTreeBytes: 1000000, maxFileBytes: 100000, maxGitOutputBytes: 1000000, maxSourceDocuments: 20, maxRecords: 20, maxReferences: 50, maxAdjudications: 20, maxProseEdits: 20, maxInputBytes: 100000 };
const limits = { maxRuntimeFiles: 1000, maxRuntimeBytes: 20_000_000, maxOutputBytesPerCheck: 1_000_000, maxCheckMilliseconds: 10_000 };
function fixture(t, format = 'sha1') {
  const base = realpathSync(mkdtempSync(join(tmpdir(), 'prepared-validation-test-')));
  const root = join(base, 'repo'); const evidence = join(base, 'evidence');
  mkdirSync(root); mkdirSync(evidence, { mode: 0o700 });
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const env = { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' };
  for (const key of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_OBJECT_DIRECTORY', 'GIT_ALTERNATE_OBJECT_DIRECTORIES']) delete env[key];
  const git = (...args) => {
    const r = spawnSync('/usr/bin/git', ['-C', root, ...args], { env, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr); return r.stdout.trim();
  };
  const put = (file, value) => { mkdirSync(dirname(join(root, file)), { recursive: true }); writeFileSync(join(root, file), typeof value === 'string' ? value : JSON.stringify(value)); };
  git('init', '-q', `--object-format=${format}`); git('config', 'user.name', 'Runner Test'); git('config', 'user.email', 'runner@example.test');
  put('_identity.yaml', { 'schema-version': 1, 'identity-format': 1,
    namespace: '11111111-1111-4111-8111-111111111111', allocations: [] });
  git('add', '.'); git('commit', '-qm', 'canonical source');
  const descriptor = () => ({ commit: git('rev-parse', 'HEAD'), tree: git('rev-parse', 'HEAD^{tree}'), kitPath: '.' });
  const source = descriptor();
  const input = () => ({ repoRoot: root, source, candidate: descriptor(), operation: 'identity-migration', operationInputs: { migrationInputs, limits: migrationLimits },
    evidenceDirectory: evidence, limits: { ...limits } });
  return { base, root, evidence, put, git, source, input };
}
function bundle(f, result) {
  assert.equal(result.retention.status, 'retained');
  const bytes = readFileSync(join(f.evidence, 'bundles', `${result.retention.bundleDigest}.json`));
  assert.equal(rawSha256(bytes), result.retention.bundleDigest);
  const manifest = JSON.parse(bytes);
  assert.deepEqual(bytes, canonicalJsonBytes(manifest));
  for (const row of manifest.artifacts) {
    const artifact = readFileSync(join(f.evidence, 'blobs/sha256', row.sha256));
    assert.equal(artifact.length, row.size); assert.equal(rawSha256(artifact), row.sha256);
  }
  return { manifest, read: (file) => readFileSync(join(f.evidence, 'blobs/sha256', manifest.artifacts.find((row) => row.file === file).sha256)) };
}

test('real fixed validators use exact commits and trusted captured code, preserving dirty checkout and hostile ambient env', async (t) => {
  const f = fixture(t);
  const marker = join(f.base, 'EXECUTED');
  f.put('engine/validate.js', `import{writeFileSync}from'node:fs';writeFileSync(${JSON.stringify(marker)},'unsafe');process.exit(0);`);
  f.put('package.json', { type: 'module', scripts: { test: `touch ${marker}` } });
  f.git('add', '.'); f.git('commit', '-qm', 'candidate with untrusted engine');
  const input = f.input();
  f.put('_identity.yaml', 'dirty staged bytes'); f.git('add', '_identity.yaml');
  f.put('_identity.yaml', 'dirty working bytes'); f.put('untracked', 'keep');
  const index = readFileSync(join(f.root, '.git/index')); const refs = f.git('show-ref');
  const keys = ['NODE_OPTIONS', 'NODE_PATH', 'GIT_DIR', 'GIT_INDEX_FILE', 'LD_PRELOAD', 'DYLD_INSERT_LIBRARIES', 'TMPDIR', 'TMP', 'TEMP'];
  const saved = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  let result;
  try {
    for (const key of keys) process.env[key] = '/unavailable/hostile-injection';
    result = await runPreparedCandidateChecks(input);
  } finally { for (const key of keys) if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key]; }
  assert.equal(result.report.provenance, 'verified');
  assert.deepEqual(result.report.checks.map((c) => c.status), ['passed', 'passed', 'failed'], JSON.stringify(result.report));
  assert.deepEqual(result.report.checks.map((c) => c.exitCode), [0, 0, 1]);
  assert.equal(result.report.publicationReady, false); assert.equal(result.report.validationComplete, false);
  assert.equal(existsSync(marker), false);
  assert.deepEqual(readFileSync(join(f.root, '.git/index')), index); assert.equal(f.git('show-ref'), refs);
  assert.equal(readFileSync(join(f.root, '_identity.yaml'), 'utf8'), 'dirty working bytes');
  assert.equal(readFileSync(join(f.root, 'untracked'), 'utf8'), 'keep');
  const b = bundle(f, result);
  const reopened = readRetainedPreparedEvidence({ evidenceDirectory: f.evidence, bundleDigest: result.retention.bundleDigest,
    expected: { source: input.source, candidate: input.candidate, operation: input.operation,
      runtimeDigest: result.runtimeDigest, reportDigest: result.reportDigest },
    limits: { maxManifestBytes: 1_000_000, maxArtifacts: 2000, maxArtifactBytes: 20_000_000, maxTotalArtifactBytes: 40_000_000 } });
  assert.equal(reopened.status, 'verified'); assert.deepEqual(reopened.report, result.report);
  assert.equal(b.manifest.reportDigest, canonicalSha256(result.report));
  assert.deepEqual(JSON.parse(b.read('report.json')), result.report);
  const runtime = JSON.parse(b.read('runtime/manifest.json'));
  assert.equal(runtime.environmentPolicy, 'posix-fixed-v1');
  assert.equal(runtime.executables.git.path, realpathSync('/usr/bin/git'));
  assert.ok(runtime.files.some(({ path }) => path === 'node_modules/js-yaml/dist/js-yaml.mjs'));
  for (const check of result.report.checks.slice(0, 2)) assert.deepEqual(b.read(check.result.file), b.read(check.stdout.file));
  assert.deepEqual(readdirSync(join(f.evidence, '.staging')), []);
});

test('actual failed canonical validation retains exit codes and raw diagnostics with SHA256 commits', async (t) => {
  const f = fixture(t, 'sha256');
  f.put('_identity.yaml', { 'schema-version': 999 }); f.git('add', '.'); f.git('commit', '-qm', 'invalid candidate');
  const result = await runPreparedCandidateChecks(f.input());
  assert.deepEqual(result.report.checks.slice(0, 2).map((c) => [c.status, c.exitCode]), [['failed', 2], ['failed', 2]], JSON.stringify(result.report));
  const b = bundle(f, result);
  assert.match(b.read('checks/structural/stderr').toString(), /store loader reported/);
  assert.equal(result.report.checks[0].result, null);
  assert.ok(JSON.parse(b.read('checks/values/result'))['hard-errors'].length > 0);
});

test('mismatched provenance and output exhaustion cannot become successful evidence', async (t) => {
  const f = fixture(t);
  const mismatch = f.input(); mismatch.candidate.tree = '0'.repeat(40);
  const refused = await runPreparedCandidateChecks(mismatch);
  assert.equal(refused.report.provenance, 'unverified');
  assert.ok(refused.report.checks.every(({ status }) => status === 'not-performed'));
  bundle(f, refused);
  const bounded = f.input(); bounded.limits.maxOutputBytesPerCheck = 10;
  const before = readdirSync(join(f.evidence, 'bundles'));
  await assert.rejects(runPreparedCandidateChecks(bounded), { code: 'unsafe-migration-output' });
  assert.deepEqual(readdirSync(join(f.evidence, 'bundles')), before);
});

test('runtime/input limits and unsupported operation input are rejected without claiming check results', async (t) => {
  const f = fixture(t);
  const excess = f.input(); excess.limits.maxRuntimeFiles = 1;
  await assert.rejects(runPreparedCandidateChecks(excess), /runtime limits/);
  const crosswalk = f.input(); crosswalk.operationInputs = { correspondence: [{ old: 'D-1', new: 'D-000001' }] };
  await assert.rejects(runPreparedCandidateChecks(crosswalk), /closed migration or assignment inputs/);
  const extra = f.input(); extra.command = 'client-test';
  await assert.rejects(runPreparedCandidateChecks(extra), /expected exact commits/);
  assert.deepEqual(readdirSync(f.evidence), []);
});

test('retention is idempotent, refuses existing corrupt blobs and never follows a substituted blob symlink', (t) => {
  const f = fixture(t);
  const runtimeRoot = join(f.base, 'runtime'); mkdirSync(runtimeRoot);
  const bytes = Buffer.from('exact raw evidence\r\n');
  const args = { evidenceDirectory: f.evidence, repoRoot: f.root, runtimeRoot,
    binding: { source: f.source, candidate: f.source, operation: 'identity-migration', runtimeDigest: 'a'.repeat(64), reportDigest: 'b'.repeat(64) },
    artifacts: [{ file: 'checks/structural/stdout', bytes }] };
  const first = retainPreparedEvidence(args);
  assert.deepEqual(retainPreparedEvidence(args), first);
  const blob = join(f.evidence, 'blobs/sha256', rawSha256(bytes));
  chmodSync(blob, 0o600); writeFileSync(blob, Buffer.from('changed')); chmodSync(blob, 0o400);
  assert.throws(() => retainPreparedEvidence(args), /existing retained bytes/);
  assert.equal(readFileSync(blob, 'utf8'), 'changed');
  rmSync(blob); symlinkSync(join(f.base, 'outside'), blob);
  assert.throws(() => retainPreparedEvidence(args), { code: 'ELOOP' });
  assert.equal(existsSync(join(f.base, 'outside')), false);
});

test('uncertain completion fsync keeps its immutable marker and returns reconciliation coordinates', async (t) => {
  const fs = (await import('node:fs')).default;
  const { syncBuiltinESMExports } = await import('node:module');
  const f = fixture(t); const runtimeRoot = join(f.base, 'runtime'); mkdirSync(runtimeRoot);
  const args = { evidenceDirectory: f.evidence, repoRoot: f.root, runtimeRoot,
    binding: { source: f.source, candidate: f.source, operation: 'identity-migration', runtimeDigest: 'a'.repeat(64), reportDigest: 'b'.repeat(64) },
    artifacts: [{ file: 'report.json', bytes: Buffer.from('{"actual":"evidence"}') }] };
  const original = fs.fsyncSync;
  fs.fsyncSync = (fd) => {
    const dir = join(f.evidence, 'bundles');
    if (existsSync(dir) && fs.fstatSync(fd).ino === fs.statSync(dir).ino) throw Object.assign(new Error('simulated fsync failure'), { code: 'EIO' });
    return original(fd);
  };
  syncBuiltinESMExports();
  let result;
  try { result = retainPreparedEvidence(args); }
  finally { fs.fsyncSync = original; syncBuiltinESMExports(); }
  assert.equal(result.status, 'retention-unknown'); assert.equal(result.code, 'EIO');
  assert.ok(existsSync(join(f.evidence, 'bundles', `${result.bundleDigest}.json`)));
  assert.deepEqual(retainPreparedEvidence(args), { status: 'retained', bundleDigest: result.bundleDigest });
});

test('actual child exit 7 and timeout survive the worker without normalization or false success', async (t) => {
  const { capturePreparedRuntime } = await import('../payload/engine/lib/prepared-runtime.js');
  const f = fixture(t); const work = join(f.base, 'worker'); mkdirSync(work, { mode: 0o700 });
  const runtime = capturePreparedRuntime(work, limits, 'identity-migration');
  // Faults live in an explicitly captured trusted test distribution, never the candidate.
  for (const [path, text] of [
    ['engine/validate.js', 'process.stderr.write("actual exit seven");process.exitCode=7;'],
    ['engine/validate-values.js', 'setInterval(()=>{},1000);'],
  ]) {
    const file = join(runtime.root, path); chmodSync(file, 0o600); writeFileSync(file, text); chmodSync(file, 0o400);
    const row = runtime.manifest.files.find((row) => row.path === path);
    row.size = Buffer.byteLength(text); row.sha256 = rawSha256(Buffer.from(text));
    runtime.manifest.entrypoints.find((row) => row.path === path).sha256 = row.sha256;
  }
  const jobFile = join(work, 'job.json');
  writeFileSync(jobFile, canonicalJsonBytes({ repoRoot: f.root, source: f.source, candidate: f.source,
    operation: 'identity-migration', operationInputs: { migrationInputs, limits: migrationLimits },
    manifest: runtime.manifest, limits: { ...limits, maxCheckMilliseconds: 3000 } }));
  const result = spawnSync(runtime.manifest.executables.node.path, [join(runtime.root, 'engine/lib/prepared-validation-worker.js'), jobFile],
    { env: runtime.env, cwd: runtime.root, timeout: 30_000 });
  assert.equal(result.status, 0, result.stderr?.toString());
  const report = JSON.parse(readFileSync(join(work, 'worker-report.json')));
  assert.equal(report.checks[0].exitCode, 7); assert.equal(report.checks[0].status, 'failed');
  assert.equal(readFileSync(join(work, report.checks[0].stderr), 'utf8'), 'actual exit seven');
  assert.equal(report.checks[1].reason, 'timeout'); assert.equal(report.checks[1].status, 'failed');
  assert.equal(report.checks[1].completion, 'interrupted'); assert.equal(report.checks[1].signal, 'SIGKILL');
  const badFile = join(runtime.root, 'engine/lib/kit-root.js');
  const bug = 'export function locateKitRoot(){throw new TypeError("unexpected fixture bug");}';
  chmodSync(badFile, 0o600); writeFileSync(badFile, bug); chmodSync(badFile, 0o400);
  const row = runtime.manifest.files.find(({ path }) => path === 'engine/lib/kit-root.js');
  row.size = Buffer.byteLength(bug); row.sha256 = rawSha256(Buffer.from(bug));
  const job = JSON.parse(readFileSync(jobFile)); job.manifest = runtime.manifest;
  writeFileSync(jobFile, canonicalJsonBytes(job));
  const crashed = spawnSync(runtime.manifest.executables.node.path, [join(runtime.root, 'engine/lib/prepared-validation-worker.js'), jobFile],
    { env: runtime.env, cwd: runtime.root, timeout: 30_000 });
  assert.equal(crashed.status, 1);
  assert.match(crashed.stderr.toString(), /TypeError: unexpected fixture bug/);
  assert.match(crashed.stderr.toString(), /at locateKitRoot/);
});

test('retention staging cleanup failure is diagnosed without losing completed evidence', async (t) => {
  const fs = (await import('node:fs')).default;
  const { syncBuiltinESMExports } = await import('node:module');
  const f = fixture(t); const runtimeRoot = join(f.base, 'runtime'); mkdirSync(runtimeRoot);
  const args = { evidenceDirectory: f.evidence, repoRoot: f.root, runtimeRoot,
    binding: { source: f.source, candidate: f.source, operation: 'identity-migration', runtimeDigest: 'a'.repeat(64), reportDigest: 'b'.repeat(64) },
    artifacts: [{ file: 'report.json', bytes: Buffer.from('{}') }] };
  const original = fs.rmSync;
  fs.rmSync = (path, options) => {
    if (String(path).includes('/.staging/run-')) throw Object.assign(new Error('simulated staging cleanup failure'), { code: 'EACCES' });
    return original(path, options);
  };
  syncBuiltinESMExports();
  let result;
  try { result = retainPreparedEvidence(args); }
  finally { fs.rmSync = original; syncBuiltinESMExports(); }
  assert.equal(result.status, 'retained'); assert.deepEqual(result.cleanup, { status: 'failed', code: 'EACCES' });
  assert.ok(existsSync(join(f.evidence, 'bundles', `${result.bundleDigest}.json`)));
});
