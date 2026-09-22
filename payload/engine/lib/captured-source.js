/** Raw retained file evidence, independent of identity migration and governance. */
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { isCaptureLocator } from './capture-locator.js';

const formats = Object.freeze({ sha1: 40, sha256: 64 });
const digest = (algorithm, bytes) => createHash(algorithm).update(bytes).digest('hex');
const blobHash = (algorithm, bytes) => createHash(algorithm)
  .update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
const oid = (value, length) => typeof value === 'string'
  && value.length === length && /^[0-9a-f]+(?![\s\S])/.test(value);

/** Describe exact new candidate bytes, without claiming retained membership. */
export function describeCandidateBytes({ file, bytes, objectFormat }) {
  if (!Object.hasOwn(formats, objectFormat) || !Buffer.isBuffer(bytes)) {
    throw new TypeError('capture requires Buffer bytes and explicit sha1 or sha256 objectFormat');
  }
  const locator = { file, blob: blobHash(objectFormat, bytes), sha256: digest('sha256', bytes) };
  if (!isCaptureLocator(locator)) throw new TypeError('capture requires a canonical repository-relative file');
  return locator;
}

/**
 * Verify byte integrity only. A supplied source pair does not prove membership,
 * availability, accepted lifecycle, or human approval. Never parses the bytes.
 */
export function verifyCapturedBytes({ locator, bytes, objectFormat }) {
  const diagnostics = [];
  if (!Object.hasOwn(formats, objectFormat)) diagnostics.push({ code: 'invalid-capture-object-format' });
  if (!Buffer.isBuffer(bytes)) diagnostics.push({ code: 'invalid-capture-bytes' });
  if (!isCaptureLocator(locator)) diagnostics.push({ code: 'invalid-capture-locator' });
  if (diagnostics.length) return { ok: false, diagnostics, evidence: 'byte-integrity-only' };
  if (locator.blob.length !== formats[objectFormat]) diagnostics.push({ code: 'capture-object-format-mismatch' });
  if (digest('sha256', bytes) !== locator.sha256) diagnostics.push({ code: 'capture-sha256-mismatch' });
  if (blobHash(objectFormat, bytes) !== locator.blob) diagnostics.push({ code: 'capture-blob-mismatch' });
  return { ok: diagnostics.length === 0, diagnostics, evidence: 'byte-integrity-only' };
}

/**
 * Establish the regular file's membership in an available immutable commit.
 * Reads raw objects; never checkout filters, worktree/index bytes, or the network.
 * Missing retained objects are explicit failures, never reconstructed evidence.
 */
export function captureCommittedFile({ repoRoot, commit, file }) {
  const env = { ...process.env, GIT_NO_REPLACE_OBJECTS: '1', GIT_NO_LAZY_FETCH: '1', GIT_OPTIONAL_LOCKS: '0', GIT_LITERAL_PATHSPECS: '1' };
  for (const key of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_COMMON_DIR', 'GIT_OBJECT_DIRECTORY', 'GIT_ALTERNATE_OBJECT_DIRECTORIES', 'GIT_GLOB_PATHSPECS', 'GIT_NOGLOB_PATHSPECS', 'GIT_ICASE_PATHSPECS']) delete env[key];
  const git = (...args) => {
    const result = spawnSync('git', ['-c', 'core.fsmonitor=false', '-C', repoRoot, ...args], { env, maxBuffer: 64 * 1024 * 1024 });
    if (result.status !== 0) throw new Error(`source capture: git ${args[0]} failed: ${result.error?.message ?? result.stderr.toString().trim()}`);
    return result.stdout;
  };
  const top = git('rev-parse', '--show-toplevel').toString().replace(/\n$/, '');
  if (realpathSync(repoRoot) !== realpathSync(top)) throw new Error('source capture requires the Git repository root');
  const objectFormat = git('rev-parse', '--show-object-format').toString().trim();
  if (!Object.hasOwn(formats, objectFormat) || !oid(commit, formats[objectFormat])) {
    throw new Error('source capture requires a full lowercase commit object ID in the repository object format');
  }
  // Reuse the locator's path contract before passing a path to Git.
  describeCandidateBytes({ file, bytes: Buffer.alloc(0), objectFormat });
  if (git('cat-file', '-t', commit).toString().trim() !== 'commit') throw new Error('source capture requires a commit object');
  const tree = git('rev-parse', `${commit}^{tree}`).toString().trim();
  const listing = git('ls-tree', '-rz', '--full-tree', tree, '--', file);
  const text = listing.toString('utf8');
  if (!Buffer.from(text).equals(listing)) throw new Error('source capture: non-UTF-8 Git path');
  const entries = text.split('\0').filter(Boolean);
  if (entries.length !== 1) throw new Error(`source capture: unavailable regular file ${JSON.stringify(file)}`);
  const entry = entries[0];
  const tab = entry.indexOf('\t');
  const [mode, type, blob] = entry.slice(0, tab).split(' ');
  if (entry.slice(tab + 1) !== file || type !== 'blob' || !['100644', '100755'].includes(mode)) {
    throw new Error(`source capture: ${JSON.stringify(file)} must be an exact regular committed file`);
  }
  const bytes = git('cat-file', 'blob', blob);
  const locator = { file, blob, sha256: digest('sha256', bytes), source: { commit, tree } };
  const checked = verifyCapturedBytes({ locator, bytes, objectFormat });
  if (!checked.ok) throw new Error(`source capture integrity failure: ${checked.diagnostics.map((row) => row.code).join(', ')}`);
  return { locator, mode, bytes, objectFormat };
}
