/** Isolated committed byte changes. Never updates refs or certifies publication. */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { EngineRefusal } from './engine-refusal.js';
import { isCaptureLocator } from './capture-locator.js';
import { captureCommittedFile, describeCandidateBytes } from './captured-source.js';
import { withTreeSnapshot } from './commit-snapshot.js';
import { locateKitRoot } from './kit-root.js';

const modes = ['100644', '100755'];
const limitKeys = ['maxChanges', 'maxFileBytes', 'maxTotalChangeBytes', 'maxTreeEntries',
  'maxTreeBytes', 'maxGitOutputBytes', 'maxCommitMessageBytes'];
const closed = (value, keys) => value !== null && typeof value === 'object'
  && !Array.isArray(value) && Object.keys(value).length === keys.length
  && keys.every((key) => Object.hasOwn(value, key));
const utf8 = (value) => typeof value === 'string' && Buffer.from(value).toString('utf8') === value;
const fullOid = (value, length) => typeof value === 'string' && value.length === length
  && /^[0-9a-f]+(?![\s\S])/.test(value);
const ordered = (a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b));

export class CandidateRefusal extends EngineRefusal {
  name = 'CandidateRefusal';
  constructor(code, detail) { super(`${code}: ${detail}`); this.code = code; }
}
const refuse = (code, detail) => { throw new CandidateRefusal(code, detail); };

function validateInput(input) {
  if (!closed(input, ['operation', 'repoRoot', 'source', 'changes', 'commit', 'limits'])
    || !['identity-migration', 'subject-assignment'].includes(input.operation)
    || !utf8(input.repoRoot) || input.repoRoot.includes('\0') || !input.repoRoot
    || !closed(input.source, ['ref', 'expectedCommit', 'kitPath'])
    || !['.', 'unknown-knowledge'].includes(input.source.kitPath)
    || typeof input.source.ref !== 'string'
    || !/^refs\/heads\/[A-Za-z0-9][A-Za-z0-9._-]*(?:\/[A-Za-z0-9][A-Za-z0-9._-]*)*(?![\s\S])/.test(input.source.ref)
    || !closed(input.limits, limitKeys)
    || !limitKeys.every((key) => Number.isSafeInteger(input.limits[key]) && input.limits[key] > 0)
    || !Array.isArray(input.changes) || input.changes.length === 0
    || input.changes.length > input.limits.maxChanges
    || !closed(input.commit, ['author', 'committer', 'message'])) {
    refuse('invalid-candidate-input', 'Expected the closed preparation input and explicit positive limits.');
  }
  // Shared raw capture/materialization readers have a fixed 64 MiB output cap.
  // Bound every blob before delegation, including a caller's smaller Git cap.
  if (input.limits.maxFileBytes > Math.min(input.limits.maxGitOutputBytes, 64 * 1024 * 1024)) {
    refuse('candidate-limit-conflict', 'File limit must fit both the declared Git output limit and shared reader cap.');
  }
  const commit = { ...input.commit };
  for (const role of ['author', 'committer']) {
    const person = commit[role];
    if (!closed(person, ['name', 'email', 'seconds', 'offset'])
      || !['name', 'email'].every((key) => utf8(person[key]) && person[key].trim() === person[key]
        && person[key].length > 0 && !/[\0\r\n<>]/.test(person[key]))
      || !Number.isSafeInteger(person.seconds) || person.seconds < 0
      || typeof person.offset !== 'string' || !/^[+-](?:0\d|1[0-4])[0-5]\d(?![\s\S])/.test(person.offset)
      || (person.offset.slice(1, 3) === '14' && person.offset.slice(3) !== '00')) {
      refuse('invalid-commit-metadata', `Invalid explicit ${role}.`);
    }
    commit[role] = { ...person };
  }
  if (!utf8(commit.message) || commit.message.includes('\0') || !commit.message.endsWith('\n')
    || !commit.message.trim() || Buffer.byteLength(commit.message) > input.limits.maxCommitMessageBytes) {
    refuse('invalid-commit-metadata', 'Message must be bounded exact UTF-8 text ending in LF.');
  }
  let total = 0;
  const seen = new Set();
  const changes = input.changes.map((change) => {
    if (!closed(change, ['file', 'before', 'after'])
      || !utf8(change.file)
      || !isCaptureLocator({ file: change.file, blob: '1'.repeat(40), sha256: '1'.repeat(64) })
      || change.file.split('/').some((part) => part.toLowerCase() === '.git')
      || seen.has(change.file) || !closed(change.after, ['mode', 'bytes'])
      || !modes.includes(change.after.mode) || !Buffer.isBuffer(change.after.bytes)
      || change.after.bytes.length > input.limits.maxFileBytes
      || (change.before !== null && (!closed(change.before, ['mode', 'capture'])
        || !modes.includes(change.before.mode) || !isCaptureLocator(change.before.capture)
        || !change.before.capture.source || change.before.capture.file !== change.file))) {
      refuse('invalid-candidate-change', 'Changes require unique regular-file creates/rewrites and exact before captures.');
    }
    seen.add(change.file); total += change.after.bytes.length;
    if (!Number.isSafeInteger(total) || total > input.limits.maxTotalChangeBytes) {
      refuse('candidate-change-budget', 'Candidate bytes exceed the supplied aggregate limit.');
    }
    return { file: change.file,
      before: change.before === null ? null : { mode: change.before.mode,
        capture: { ...change.before.capture, source: { ...change.before.capture.source } } },
      after: { mode: change.after.mode, bytes: Buffer.from(change.after.bytes) } };
  }).sort((a, b) => ordered(a.file, b.file));
  for (const file of seen) {
    const parts = file.split('/');
    while (parts.length > 1) {
      parts.pop();
      if (seen.has(parts.join('/'))) refuse('candidate-path-conflict', 'Changed paths overlap as file and directory.');
    }
  }
  return { ...input, source: { ...input.source }, limits: { ...input.limits }, commit, changes };
}

/** Build one immutable commit from committed bytes; caller retains all domain gates. */
export async function prepareCandidate(input) {
  const plan = validateInput(input);
  const { source, changes, limits } = plan;
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (key.startsWith('GIT_')) delete env[key];
  Object.assign(env, { GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1',
    GIT_NO_REPLACE_OBJECTS: '1', GIT_NO_LAZY_FETCH: '1', GIT_OPTIONAL_LOCKS: '0', GIT_LITERAL_PATHSPECS: '1' });
  const git = (args, bytes, allowedStatus = 0) => {
    const result = spawnSync('git', ['-c', 'core.fsmonitor=false', '-c', 'core.splitIndex=false',
      '-c', 'core.sparseCheckout=false', '-c', 'index.sparse=false', '-c', 'commit.gpgsign=false',
      '-c', 'i18n.commitEncoding=UTF-8',
      '-C', plan.repoRoot, ...args], { env, input: bytes, maxBuffer: limits.maxGitOutputBytes });
    if (result.status !== allowedStatus) refuse('candidate-git-failure',
      `${args[0]} failed: ${result.error?.message ?? result.stderr?.toString().trim() ?? result.signal}`);
    return result.stdout;
  };
  const output = (args, bytes) => git(args, bytes).toString('utf8').replace(/\n$/, '');
  const top = output(['rev-parse', '--show-toplevel']);
  if (realpathSync(plan.repoRoot) !== realpathSync(top)) refuse('candidate-repository-root', 'Use the actual repository root.');
  const objectFormat = output(['rev-parse', '--show-object-format']);
  const width = { sha1: 40, sha256: 64 }[objectFormat];
  if (!width || !fullOid(source.expectedCommit, width)) refuse('candidate-source-oid', 'Source requires a full commit OID in the repository object format.');
  git(['check-ref-format', source.ref]);
  git(['symbolic-ref', '--quiet', source.ref], undefined, 1);
  if (output(['show-ref', '--verify', '--hash', source.ref]) !== source.expectedCommit) refuse('candidate-source-drift', 'Source ref does not name the expected commit.');
  if (output(['cat-file', '-t', source.expectedCommit]) !== 'commit') refuse('candidate-source-type', 'Source must be a commit.');
  const sourceTree = output(['rev-parse', `${source.expectedCommit}^{tree}`]);

  function entries(tree) {
    const bytes = git(['ls-tree', '-rz', '--full-tree', tree]);
    const text = bytes.toString('utf8');
    if (!Buffer.from(text).equals(bytes) || (text && !text.endsWith('\0'))) refuse('candidate-tree-encoding', 'Tree paths must be exact UTF-8.');
    const lines = text ? text.slice(0, -1).split('\0') : [];
    if (lines.length > limits.maxTreeEntries) refuse('candidate-tree-budget', 'Tree exceeds the supplied entry limit.');
    const records = new Map();
    for (const line of lines) {
      const tab = line.indexOf('\t');
      const [mode, type, blob] = line.slice(0, tab).split(' ');
      const file = line.slice(tab + 1);
      if (tab < 0 || type !== 'blob' || ![...modes, '120000'].includes(mode)
        || !fullOid(blob, width) || records.has(file)
        || !isCaptureLocator({ file, blob, sha256: '1'.repeat(64) })
        || file.split('/').some((part) => part.toLowerCase() === '.git')) {
        refuse('candidate-tree-entry', 'Tree contains an unsupported path, type, or mode.');
      }
      records.set(file, { mode, blob });
    }
    if (records.size) {
      const inputBytes = Buffer.from([...records.values()].map(({ blob }) => `${blob}\n`).join(''));
      const sizes = output(['cat-file', '--batch-check=%(objectname) %(objecttype) %(objectsize)'], inputBytes).split('\n');
      if (sizes.length !== records.size) refuse('candidate-object-metadata', 'Incomplete object size evidence.');
      let total = 0;
      for (const [i, entry] of [...records.values()].entries()) {
        const [blob, type, sizeText] = sizes[i].split(' ');
        const size = Number(sizeText);
        if (blob !== entry.blob || type !== 'blob' || !/^(?:0|[1-9][0-9]*)$/.test(sizeText)
          || !Number.isSafeInteger(size) || size > limits.maxFileBytes) refuse('candidate-file-budget', 'A tree blob exceeds the supplied file limit.');
        total += size;
        if (!Number.isSafeInteger(total) || total > limits.maxTreeBytes) refuse('candidate-tree-budget', 'Tree exceeds the supplied aggregate byte limit.');
      }
    }
    return records;
  }

  const before = entries(sourceTree);
  const expected = new Map(before);
  const files = [];
  for (const change of changes) {
    const previous = before.get(change.file);
    if (change.before === null) {
      if (previous || [...before.keys()].some((file) => file.startsWith(`${change.file}/`) || change.file.startsWith(`${file}/`))) {
        refuse('candidate-create-conflict', 'Create requires an absent path without a file/directory collision.');
      }
    } else {
      if (!previous || !modes.includes(previous.mode) || previous.mode !== change.before.mode
        || previous.mode !== change.after.mode) refuse('candidate-before-mode', 'Existing regular-file mode must be preserved.');
      const captured = captureCommittedFile({ repoRoot: plan.repoRoot, commit: source.expectedCommit, file: change.file });
      if (!isDeepStrictEqual(captured.locator, change.before.capture)) refuse('candidate-before-capture', 'Before capture must match the exact committed source file.');
      if (captured.bytes.equals(change.after.bytes)) refuse('candidate-no-op', 'A rewrite must change bytes.');
    }
    const afterCapture = describeCandidateBytes({ file: change.file, bytes: change.after.bytes, objectFormat });
    expected.set(change.file, { mode: change.after.mode, blob: afterCapture.blob });
    files.push({ file: change.file, before: change.before, after: { mode: change.after.mode, capture: afterCapture } });
  }

  async function checkLayout(tree) {
    await withTreeSnapshot(plan.repoRoot, tree, ({ root }) => {
      const actual = relative(root, locateKitRoot(root)) || '.';
      if (actual !== source.kitPath) refuse('candidate-kit-layout', 'Snapshot layout does not corroborate the selected kitPath.');
    });
  }
  await checkLayout(sourceTree);
  const temporary = mkdtempSync(join(tmpdir(), 'unknown-knowledge-candidate-'));
  try {
    env.GIT_INDEX_FILE = join(temporary, 'index');
    git(['read-tree', sourceTree]);
    for (const [i, change] of changes.entries()) {
      const blob = output(['hash-object', '-w', '--stdin'], change.after.bytes);
      if (blob !== files[i].after.capture.blob) refuse('candidate-blob-mismatch', 'Git did not store the exact supplied bytes.');
      git(['update-index', '-z', '--index-info'], Buffer.from(`${change.after.mode} ${blob}\t${change.file}\0`));
    }
    const tree = output(['write-tree']);
    const actual = entries(tree);
    const sorted = (map) => [...map].sort(([a], [b]) => ordered(a, b));
    if (!isDeepStrictEqual(sorted(actual), sorted(expected))) refuse('candidate-tree-mismatch', 'The complete tree differs from the declared byte changes.');
    await checkLayout(tree);
    for (const role of ['author', 'committer']) {
      const person = plan.commit[role]; const prefix = `GIT_${role.toUpperCase()}`;
      env[`${prefix}_NAME`] = person.name; env[`${prefix}_EMAIL`] = person.email;
      env[`${prefix}_DATE`] = `@${person.seconds} ${person.offset}`;
    }
    const identity = (role) => {
      const person = plan.commit[role];
      return `${role} ${person.name} <${person.email}> ${person.seconds} ${person.offset}\n`;
    };
    const expectedCommitBytes = Buffer.from(`tree ${tree}\nparent ${source.expectedCommit}\n`
      + identity('author') + identity('committer') + '\n' + plan.commit.message);
    if (expectedCommitBytes.length > limits.maxGitOutputBytes) {
      refuse('candidate-commit-budget', 'Full commit metadata and message exceed the supplied verification byte limit.');
    }
    const commit = output(['commit-tree', tree, '-p', source.expectedCommit], Buffer.from(plan.commit.message));
    if (!fullOid(commit, width) || output(['rev-parse', `${commit}^{tree}`]) !== tree) refuse('candidate-commit-mismatch', 'Candidate commit does not name the verified tree.');
    if (!git(['cat-file', 'commit', commit]).equals(expectedCommitBytes)) {
      refuse('candidate-commit-metadata', 'Git commit bytes differ from the injected metadata and message.');
    }
    return { operation: plan.operation, objectFormat,
      source: { ref: source.ref, commit: source.expectedCommit, tree: sourceTree, kitPath: source.kitPath },
      candidate: { commit, tree, kitPath: source.kitPath }, files };
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}
