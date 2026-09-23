/** Fixed trusted distribution capture. Native host libraries remain a host trust boundary. */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { closeSync, constants, fstatSync, lstatSync, mkdirSync, openSync, readFileSync,
  readSync, readdirSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EngineRefusal } from './engine-refusal.js';
import { rawSha256 } from './prepared-evidence.js';
import { VALIDATION_ENTRYPOINTS, preparedOperationEntrypoint } from './prepared-validation-policy.js';
export { VALIDATION_ENTRYPOINTS, ASSIGNMENT_ENTRYPOINT, MIGRATION_ENTRYPOINT, EQUIVALENT_MERGE_ENTRYPOINT, SUBJECT_RETIREMENT_ENTRYPOINT, SUBJECT_SPLIT_ENTRYPOINT, SUBJECT_RECONSIDERATION_ENTRYPOINT, SUBJECT_METADATA_ENTRYPOINT, SUBJECT_PROPOSAL_SUPPRESSION_ENTRYPOINT, PROMOTION_ENTRYPOINT, RECORD_PROMOTION_ENTRYPOINT } from './prepared-validation-policy.js';
const refuse = (message) => { throw new EngineRefusal(`prepared runtime: ${message}`); };

/** Stream executable bytes so a large Node binary is not a document allocation. */
export function executableSha256(path) {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    if (!fstatSync(fd).isFile()) refuse('executable is not a regular file');
    const hash = createHash('sha256'); const buffer = Buffer.alloc(64 * 1024);
    let size;
    while ((size = readSync(fd, buffer, 0, buffer.length, null)) !== 0) hash.update(buffer.subarray(0, size));
    return hash.digest('hex');
  } finally { closeSync(fd); }
}

export function verifyPreparedRuntime(root, manifest) {
  for (const item of manifest.files) {
    const path = join(root, item.path); const stat = lstatSync(path);
    if (!stat.isFile() || (stat.mode & 0o777) !== item.mode || stat.size !== item.size
      || rawSha256(readFileSync(path)) !== item.sha256) refuse('captured distribution drift');
  }
  for (const item of Object.values(manifest.executables)) {
    if (executableSha256(item.path) !== item.sha256) refuse('trusted host executable drift');
  }
}

function packageRoot() {
  let dir = dirname(createRequire(import.meta.url).resolve('js-yaml'));
  while (dir !== dirname(dir)) {
    const file = join(dir, 'package.json');
    if (lstatSync(file, { throwIfNoEntry: false })?.isFile()
      && JSON.parse(readFileSync(file, 'utf8')).name === 'js-yaml') return dir;
    dir = dirname(dir);
  }
  refuse('actual js-yaml package root unavailable');
}

/** Paths/executables come from this module's installation, never operation input. */
export function capturePreparedRuntime(work, limits, operation) {
  const operationEntry = preparedOperationEntrypoint(operation);
  if (!operationEntry) refuse('unsupported prepared operation');
  if (!['darwin', 'linux'].includes(process.platform)) refuse('only the frozen POSIX host policy is supported');
  const root = join(work, 'runtime');
  for (const path of [root, join(work, 'bin'), join(work, 'home'), join(work, 'config'), join(work, 'tmp')]) {
    mkdirSync(path, { mode: 0o700 });
  }
  const paths = { node: realpathSync(process.execPath), git: realpathSync('/usr/bin/git') };
  for (const [name, path] of Object.entries(paths)) symlinkSync(path, join(work, 'bin', name));
  const env = {
    PATH: join(work, 'bin'), HOME: join(work, 'home'), XDG_CONFIG_HOME: join(work, 'config'),
    TMPDIR: join(work, 'tmp'), TMP: join(work, 'tmp'), TEMP: join(work, 'tmp'),
    LANG: 'C', LC_ALL: 'C', TZ: 'UTC', GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_SYSTEM: '/dev/null', GIT_CONFIG_GLOBAL: '/dev/null', GIT_NO_REPLACE_OBJECTS: '1',
    GIT_NO_LAZY_FETCH: '1', GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0',
  };
  const probe = (path, args) => {
    const result = spawnSync(path, args, { env, cwd: work, encoding: 'utf8', maxBuffer: 8192, timeout: limits.maxCheckMilliseconds });
    if (result.status !== 0 || result.error || result.signal) {
      const error = new EngineRefusal(`prepared runtime: trusted executable probe failed (${path} ${args.join(' ')}; exit=${result.status}; signal=${result.signal}; error=${result.error?.code ?? 'none'})`);
      error.code = 'prepared-runtime-probe-failed';
      error.probe = { executable: path, arguments: [...args], exitCode: result.status, signal: result.signal,
        errorCode: result.error?.code ?? null, errorMessage: result.error?.message ?? null,
        stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
      throw error;
    }
    return result.stdout.trim();
  };
  const executables = {};
  for (const [name, path] of Object.entries(paths)) {
    const sha256 = executableSha256(path);
    executables[name] = { path, sha256, version: probe(path, ['--version']) };
    if (executableSha256(path) !== sha256) refuse('executable changed during probe');
  }
  env.GIT_EXEC_PATH = realpathSync(probe(paths.git, ['--exec-path']));
  executables.git.execPath = env.GIT_EXEC_PATH;
  const files = []; const artifacts = []; let total = 0;
  const copy = (source, destination) => {
    const stat = lstatSync(source);
    if (stat.isDirectory()) {
      mkdirSync(destination, { recursive: true, mode: 0o700 });
      for (const name of readdirSync(source).sort()) copy(join(source, name), join(destination, name));
      return;
    }
    if (!stat.isFile()) refuse('trusted distribution contains a symlink or special file');
    total += stat.size;
    if (files.length >= limits.maxRuntimeFiles || !Number.isSafeInteger(total) || total > limits.maxRuntimeBytes) {
      refuse('trusted distribution exceeds explicit runtime limits');
    }
    const bytes = readFileSync(source);
    if (bytes.length !== stat.size) refuse('trusted distribution changed while captured');
    mkdirSync(dirname(destination), { recursive: true, mode: 0o700 });
    writeFileSync(destination, bytes, { flag: 'wx', mode: 0o400 });
    const path = relative(root, destination);
    files.push({ path, mode: 0o400, size: bytes.length, sha256: rawSha256(bytes) });
    artifacts.push({ file: `runtime/files/${path}`, bytes });
  };
  const trusted = fileURLToPath(new URL('../../', import.meta.url));
  for (const name of ['engine', 'schemas', 'package.json']) copy(join(trusted, name), join(root, name));
  if (operation === 'identity-migration') {
    const assets = JSON.parse(readFileSync(join(trusted, 'engine/policies/installation-assets.json'), 'utf8'));
    for (const source of [...new Set([...assets.candidate.map(row => row.source), ...Object.keys(assets.wrappers)])]) {
      copy(join(trusted, source), join(root, source));
    }
  }
  copy(packageRoot(), join(root, 'node_modules/js-yaml'));
  files.sort((a, b) => Buffer.compare(Buffer.from(a.path), Buffer.from(b.path)));
  if (['subject-assignment', 'ordinary-promotion', 'typed-record-promotion'].includes(operation) && !files.some(({ path }) => path === 'engine/lib/assignment-gate.js')) {
    refuse('released prepared assignment gate is missing from this trusted distribution');
  }
  if (operation === 'identity-migration' && !files.some(({ path }) => path === 'engine/lib/prepared-migration-gate.js')) {
    refuse('released prepared migration gate is missing from this trusted distribution');
  }
  if (operation === 'subject-equivalent-merge' && !files.some(({ path }) => path === 'engine/lib/subject-equivalent-merge-gate.js')) {
    refuse('released prepared equivalent merge gate is missing from this trusted distribution');
  }
  if (operation === 'subject-retirement' && !['subject-retirement-gate.js', 'prepared-subject-retirement.js',
    'prepared-subject-retirement-check.js', 'final-subject-retirement-check.js'].every(name => files.some(({ path }) => path === `engine/lib/${name}`))) {
    refuse('released prepared subject retirement support is missing from this trusted distribution');
  }
  if (operation === 'subject-split' && !['subject-split-gate.js', 'prepared-subject-split.js',
    'prepared-subject-split-check.js', 'final-subject-split-check.js'].every(name => files.some(({ path }) => path === `engine/lib/${name}`))) {
    refuse('released prepared subject split support is missing from this trusted distribution');
  }
  const entrypoints = [...VALIDATION_ENTRYPOINTS, operationEntry];
  if (operation === 'subject-creation' && !['subject-creation-gate.js', 'prepared-subject-creation.js',
    'prepared-subject-creation-check.js', 'final-subject-creation-check.js'].every(name => files.some(({ path }) => path === `engine/lib/${name}`))) {
    refuse('released prepared creation support is missing from this trusted distribution');
  }
  if (operation === 'subject-reconsideration' && !['subject-reconsideration-gate.js', 'prepared-subject-reconsideration.js',
    'prepared-subject-reconsideration-check.js', 'final-subject-reconsideration-check.js'].every(name => files.some(({ path }) => path === `engine/lib/${name}`))) {
    refuse('released prepared reconsideration support is missing from this trusted distribution');
  }
  if (operation === 'subject-proposal-suppression' && !['subject-metadata-gate.js', 'prepared-subject-metadata.js',
    'prepared-subject-proposal-suppression-check.js', 'final-subject-proposal-suppression-check.js'].every(name => files.some(({ path }) => path === `engine/lib/${name}`))) {
    refuse('released prepared proposal suppression support is missing from this trusted distribution');
  }
  if (operation === 'subject-metadata' && !['subject-metadata-gate.js', 'prepared-subject-metadata.js',
    'prepared-subject-metadata-check.js', 'final-subject-metadata-check.js'].every(name => files.some(({ path }) => path === `engine/lib/${name}`))) {
    refuse('released prepared metadata support is missing from this trusted distribution');
  }
  const manifest = { version: 1, identityFormat: 1, environmentPolicy: 'posix-fixed-v1',
    host: { platform: process.platform, arch: process.arch }, files, executables,
    entrypoints: entrypoints.map((entry) => ({ ...entry, sha256: files.find(({ path }) => path === entry.path).sha256 })),
    operation: { status: 'available' } };
  verifyPreparedRuntime(root, manifest);
  return { root, env, manifest, artifacts };
}
