/** Private POSIX retention protocol for the fixed prepared-validation bundle. */
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { syncDirectory, directory, readOwnedFile, verifyFile, finalizedFile, install } from './prepared-evidence-files.js';
import { createHash } from 'node:crypto';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { canonicalJsonBytes, CapturedInputError } from './canonical-json.js';
import { EngineRefusal } from './engine-refusal.js';
import { isDeepStrictEqual } from 'node:util';
import { VALIDATION_ENTRYPOINTS, preparedOperationEntrypoint } from './prepared-validation-policy.js';

export const rawSha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
export const artifactCapture = (file, bytes) => ({ kind: 'detached-artifact', file,
  size: bytes.length, sha256: rawSha256(bytes) });
const within = (root, path) => { const rel = relative(root, path); return rel === '' || (!rel.startsWith('../') && rel !== '..' && !isAbsolute(rel)); };
const refuse = (message) => { throw new EngineRefusal(`prepared evidence: ${message}`); };
/** A completed bundle is only the no-replace, fsynced manifest plus verified blobs. */
export function retainPreparedEvidence({ evidenceDirectory, repoRoot, runtimeRoot, binding, artifacts }) {
  if (!['darwin', 'linux'].includes(process.platform)) refuse('unsupported retention platform');
  const requestedRoot = resolve(evidenceDirectory);
  directory(requestedRoot);
  const root = realpathSync(requestedRoot);
  if (within(realpathSync(repoRoot), root) || within(realpathSync(runtimeRoot), root)) {
    refuse('evidence root must be an explicit nonsymlink managed directory outside the repository and runtime');
  }
  for (const part of ['.staging', 'blobs', 'blobs/sha256', 'bundles']) directory(join(root, part), true);
  // Persist directory entries as well as file contents before acknowledging retention.
  syncDirectory(root); syncDirectory(join(root, 'blobs'));
  const stage = mkdtempSync(join(root, '.staging/run-'));
  const rows = []; const seen = new Set(); let bundleDigest = null; let markerAttempted = false;
  let result; let failure;
  try {
    for (const { file, bytes } of artifacts) {
      if (typeof file !== 'string' || !file || file.split('/').some((part) => !part || part === '.' || part === '..')
        || /[\\\0]/.test(file) || isAbsolute(file) || seen.has(file) || !Buffer.isBuffer(bytes)) refuse('invalid logical artifact');
      seen.add(file);
      const { kind, ...row } = artifactCapture(file, bytes);
      const stagingFile = join(stage, String(rows.length));
      finalizedFile(stagingFile, bytes);
      install(stagingFile, join(root, 'blobs/sha256', row.sha256), bytes);
      rows.push(row);
    }
    syncDirectory(join(root, 'blobs/sha256'));
    rows.sort((a, b) => Buffer.compare(Buffer.from(a.file), Buffer.from(b.file)));
    const bytes = canonicalJsonBytes({ version: 1, ...binding, artifacts: rows });
    bundleDigest = rawSha256(bytes);
    const stagedManifest = join(stage, 'manifest');
    finalizedFile(stagedManifest, bytes);
    for (const item of artifacts) verifyFile(join(root, 'blobs/sha256', rawSha256(item.bytes)), item.bytes);
    markerAttempted = true;
    const marker = join(root, 'bundles', `${bundleDigest}.json`);
    install(stagedManifest, marker, bytes);
    syncDirectory(join(root, 'bundles'));
    verifyFile(marker, bytes);
    for (const item of artifacts) verifyFile(join(root, 'blobs/sha256', rawSha256(item.bytes)), item.bytes);
    return result = { status: 'retained', bundleDigest };
  } catch (error) {
    failure = error;
    if (markerAttempted) return result = { status: 'retention-unknown', bundleDigest, code: error.code ?? error.name };
    throw error;
  } finally {
    // Final blobs/markers never participate in cleanup, including uncertain completion.
    try { rmSync(stage, { recursive: true, force: true }); }
    catch (error) { (result ?? failure).cleanup = { status: 'failed', code: error.code ?? error.name }; }
  }
}

const closed = (value, keys) => value !== null && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const hash = (value) => typeof value === 'string' && /^[0-9a-f]{64}(?![\s\S])/.test(value);
const logicalFile = (value) => typeof value === 'string' && value.length > 0
  && Buffer.from(value).toString('utf8') === value && !isAbsolute(value) && !/^[A-Za-z]:|[\\\0]/.test(value)
  && value.split('/').every((part) => part && part !== '.' && part !== '..');
const natural = (value) => Number.isSafeInteger(value) && value >= 0;
const descriptor = (value) => closed(value, ['commit', 'tree', 'kitPath'])
  && ['.', 'unknown-knowledge'].includes(value.kitPath)
  && ['commit', 'tree'].every((key) => typeof value[key] === 'string' && /^(?:[0-9a-f]{40}|[0-9a-f]{64})(?![\s\S])/.test(value[key]));
const bindings = ['source', 'candidate', 'operation', 'runtimeDigest', 'reportDigest'];

function canonicalDocument(bytes) {
  let value;
  try { value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { refuse('retained document is not valid UTF-8 JSON'); }
  let canonical;
  try { canonical = canonicalJsonBytes(value); }
  catch (error) {
    if (error instanceof CapturedInputError || error instanceof RangeError) refuse('retained JSON cannot be canonicalized');
    throw error;
  }
  if (!canonical.equals(bytes)) refuse('retained document is not exact canonical JSON');
  return value;
}

function validateRuntimeManifest(runtime, artifacts, operation) {
  if (!closed(runtime, ['version', 'identityFormat', 'environmentPolicy', 'host', 'files', 'executables', 'entrypoints', 'operation'])
    || runtime.version !== 1 || runtime.identityFormat !== 1 || runtime.environmentPolicy !== 'posix-fixed-v1'
    || !closed(runtime.host, ['platform', 'arch']) || !['darwin', 'linux'].includes(runtime.host.platform)
    || typeof runtime.host.arch !== 'string' || !runtime.host.arch
    || !Array.isArray(runtime.files) || !closed(runtime.executables, ['node', 'git'])
    || !Array.isArray(runtime.entrypoints) || !closed(runtime.operation, ['status'])
    || !['available', 'unavailable'].includes(runtime.operation.status)
    || (['subject-assignment', 'subject-equivalent-merge', 'subject-retirement', 'subject-split', 'subject-reconsideration', 'subject-metadata', 'subject-proposal-suppression', 'subject-creation', 'ordinary-promotion', 'typed-record-promotion'].includes(operation) && runtime.operation.status !== 'available')) refuse('invalid retained runtime manifest');
  for (const [name, executable] of Object.entries(runtime.executables)) {
    if (!closed(executable, ['path', 'sha256', 'version', ...(name === 'git' ? ['execPath'] : [])])
      || typeof executable.path !== 'string' || !isAbsolute(executable.path) || !hash(executable.sha256)
      || typeof executable.version !== 'string' || !executable.version
      || (name === 'git' && (typeof executable.execPath !== 'string' || !isAbsolute(executable.execPath)))) refuse('invalid retained executable descriptor');
  }
  const files = new Map(); let previous = null;
  for (const row of runtime.files) {
    if (!closed(row, ['path', 'mode', 'size', 'sha256']) || !logicalFile(row.path) || row.mode !== 0o400
      || !natural(row.size) || !hash(row.sha256) || files.has(row.path)
      || (previous !== null && Buffer.compare(Buffer.from(previous), Buffer.from(row.path)) >= 0)) refuse('invalid or duplicate runtime file row');
    previous = row.path;
    const artifact = artifacts.get(`runtime/files/${row.path}`);
    if (!artifact || artifact.size !== row.size || artifact.sha256 !== row.sha256) refuse('runtime file does not match its retained artifact');
    files.set(row.path, row);
  }
  for (const file of artifacts.keys()) if (file.startsWith('runtime/files/') && !files.has(file.slice('runtime/files/'.length))) {
    refuse('retained runtime file is absent from runtime manifest');
  }
  const fixed = [...VALIDATION_ENTRYPOINTS, ...(runtime.operation.status === 'available'
    ? [preparedOperationEntrypoint(operation)] : [])];
  if (runtime.entrypoints.length !== fixed.length) refuse('retained entrypoint inventory differs from fixed policy');
  for (const [index, expected] of fixed.entries()) {
    const row = runtime.entrypoints[index];
    if (!closed(row, ['id', 'path', 'sha256']) || row.id !== expected.id || row.path !== expected.path
      || !hash(row.sha256) || files.get(row.path)?.sha256 !== row.sha256) refuse('retained entrypoint differs from fixed captured file');
  }
}

function validateReportCaptures(report, artifacts, manifest) {
  if (!report || typeof report !== 'object' || Array.isArray(report) || report.version !== 1
    || !['source', 'candidate', 'operation', 'runtimeDigest'].every((key) => isDeepStrictEqual(report[key], manifest[key]))) {
    refuse('retained report bindings differ from bundle');
  }
  // This examines detached artifact locators only. Git source captures and the
  // operation result's domain references are not reinterpreted as file paths.
  const pending = [report];
  while (pending.length) {
    const value = pending.pop();
    if (value === null || typeof value !== 'object') continue;
    if (value.kind === 'detached-artifact') {
      if (!closed(value, ['kind', 'file', 'size', 'sha256'])) refuse('invalid detached report capture');
      const artifact = artifacts.get(value.file);
      if (!artifact || artifact.size !== value.size || artifact.sha256 !== value.sha256) refuse('report capture differs from retained artifact');
    } else for (const child of Object.values(value)) pending.push(child);
  }
  if (!Array.isArray(report.checks) || report.checks.length !== 3 || !report.execution || typeof report.execution !== 'object') refuse('missing fixed check or execution captures');
  for (const [index, id] of ['structural', 'values', 'operation'].entries()) {
    const check = report.checks[index];
    if (!check || check.id !== id) refuse('invalid fixed report check inventory');
    for (const field of ['stdout', 'stderr', 'result']) {
      if (check[field] !== null && check[field]?.kind !== 'detached-artifact') refuse('invalid report check capture');
    }
  }
  for (const field of ['stdout', 'stderr']) if (report.execution[field]?.kind !== 'detached-artifact') refuse('missing execution capture');
}

/**
 * Bounded integrity/durability readback of this runner's validation bundles.
 * Never authenticates an author, evaluates domain acceptance, or publishes refs.
 */
export function readRetainedPreparedEvidence(input) {
  const limitKeys = ['maxManifestBytes', 'maxArtifacts', 'maxArtifactBytes', 'maxTotalArtifactBytes'];
  if (!closed(input, ['evidenceDirectory', 'bundleDigest', 'expected', 'limits'])
    || typeof input.evidenceDirectory !== 'string' || !input.evidenceDirectory || input.evidenceDirectory.includes('\0')
    || !hash(input.bundleDigest) || !closed(input.expected, bindings)
    || !descriptor(input.expected.source) || !descriptor(input.expected.candidate)
    || !preparedOperationEntrypoint(input.expected.operation)
    || !hash(input.expected.runtimeDigest) || !hash(input.expected.reportDigest)
    || !closed(input.limits, limitKeys) || !limitKeys.every((key) => natural(input.limits[key]) && input.limits[key] > 0)) refuse('invalid bounded readback input');
  if (!['darwin', 'linux'].includes(process.platform)) refuse('unsupported readback platform');
  let durability = false;
  try {
    const requested = resolve(input.evidenceDirectory); directory(requested);
    const root = realpathSync(requested);
    for (const part of ['blobs', 'blobs/sha256', 'bundles']) directory(join(root, part));
    const marker = join(root, 'bundles', `${input.bundleDigest}.json`);
    const bytes = readOwnedFile(marker, input.limits.maxManifestBytes);
    if (rawSha256(bytes) !== input.bundleDigest) refuse('bundle digest differs from its actual manifest bytes');
    const manifest = canonicalDocument(bytes);
    if (!closed(manifest, ['version', ...bindings, 'artifacts']) || manifest.version !== 1
      || !bindings.every((key) => isDeepStrictEqual(manifest[key], input.expected[key]))
      || !Array.isArray(manifest.artifacts) || manifest.artifacts.length > input.limits.maxArtifacts) refuse('invalid or mismatched retained manifest');
    const artifacts = new Map(); let total = 0; let previous = null;
    // Validate the whole inventory and aggregate budget before any blob read.
    for (const row of manifest.artifacts) {
      if (!closed(row, ['file', 'size', 'sha256']) || !logicalFile(row.file) || !natural(row.size) || !hash(row.sha256)
        || row.size > input.limits.maxArtifactBytes || artifacts.has(row.file)
        || (previous !== null && Buffer.compare(Buffer.from(previous), Buffer.from(row.file)) >= 0)) refuse('invalid, over-budget or duplicate artifact row');
      previous = row.file; total += row.size;
      if (!Number.isSafeInteger(total) || total > input.limits.maxTotalArtifactBytes) refuse('aggregate artifact byte limit exceeded');
      artifacts.set(row.file, { ...row });
    }
    for (const artifact of artifacts.values()) {
      artifact.bytes = readOwnedFile(join(root, 'blobs/sha256', artifact.sha256), artifact.size);
      if (artifact.bytes.length !== artifact.size || rawSha256(artifact.bytes) !== artifact.sha256) refuse('retained artifact bytes differ from manifest');
    }
    const runtimeArtifact = artifacts.get('runtime/manifest.json'); const reportArtifact = artifacts.get('report.json');
    if (!runtimeArtifact || !reportArtifact || runtimeArtifact.sha256 !== manifest.runtimeDigest
      || reportArtifact.sha256 !== manifest.reportDigest) refuse('missing or mismatched runtime/report artifact');
    const runtimeManifest = canonicalDocument(runtimeArtifact.bytes); const report = canonicalDocument(reportArtifact.bytes);
    validateRuntimeManifest(runtimeManifest, artifacts, manifest.operation);
    validateReportCaptures(report, artifacts, manifest);
    durability = true;
    for (const artifact of artifacts.values()) verifyFile(join(root, 'blobs/sha256', artifact.sha256), artifact.bytes, true);
    syncDirectory(join(root, 'blobs/sha256'));
    verifyFile(marker, bytes, true); syncDirectory(join(root, 'bundles'));
    return { status: 'verified', bundleDigest: input.bundleDigest, manifest, runtimeManifest, report, artifacts: [...artifacts.values()] };
  } catch (error) {
    if (durability && Number.isInteger(error?.errno)) return { status: 'retention-unknown', bundleDigest: input.bundleDigest, code: error.code };
    if (Number.isInteger(error?.errno)) throw new EngineRefusal(`prepared evidence: retained object unavailable (${error.code})`, { cause: error });
    throw error;
  }
}
