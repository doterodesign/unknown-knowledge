/** Bounded read-only local observation; publication and external review remain separate. */
import { spawnSync } from 'node:child_process';
import { accessSync, constants, lstatSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { canonicalSha256 } from './canonical-json.js';
import { rawSha256, readRetainedPreparedEvidence } from './prepared-evidence.js';
import { executableSha256 } from './prepared-runtime.js';
import { readRetainedCandidateReview, verifyCandidateReviewEvidence } from './candidate-review.js';
import { matchesApprovedInstallationReview } from './migration-installation-report.js';
import { EngineRefusal } from './engine-refusal.js';

const closed = (v, keys) => v !== null && typeof v === 'object' && !Array.isArray(v)
  && Reflect.ownKeys(v).length === keys.length && keys.every(key => Object.hasOwn(v, key));
const limitKeys = ['maxFiles', 'maxBytes', 'maxOutputBytes', 'maxCommandMilliseconds'];
class ActivationRefusal extends EngineRefusal { constructor(code) { super(code); this.code = code; } }
const refuse = code => { throw new ActivationRefusal(code); };
const order = (a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b));

function observe(root, request, installation, approved, executables, limits) {
  const env = { ...process.env };
  if (Object.entries(env).some(([key, value]) => value && (/^(?:GIT_|LD_|DYLD_)/.test(key)
    || ['NODE_OPTIONS', 'NODE_PATH', 'KIT_DIR', 'UK_ROOT'].includes(key)))) refuse('activation-environment-unsupported');
  // These read-only plumbing commands do not invoke filters, hooks or client code.
  const git = args => {
    const result = spawnSync('/usr/bin/git', ['-c', 'core.fsmonitor=false', '-C', root, ...args],
      { env: { ...env, GIT_OPTIONAL_LOCKS: '0', GIT_NO_LAZY_FETCH: '1', GIT_TERMINAL_PROMPT: '0' },
        encoding: 'utf8', maxBuffer: limits.maxOutputBytes, timeout: limits.maxCommandMilliseconds });
    if (result.error || result.signal || result.status !== 0 || result.stderr) refuse('activation-git-unavailable');
    return result.stdout;
  };
  if (realpathSync(git(['rev-parse', '--show-toplevel']).trimEnd()) !== root
    || git(['rev-parse', '--verify', 'HEAD']).trimEnd() !== request.candidate.commit
    || git(['rev-parse', '--verify', request.publish.outputRef]).trimEnd() !== request.candidate.commit) refuse('activation-candidate-not-active');
  const hooks = git(['config', '--null', '--get-all', 'core.hooksPath']);
  if (hooks !== `${approved.review.activation.hooksPath}\0`) refuse('activation-hooks-path-mismatch');
  const hook = `${approved.review.activation.hooksPath}/pre-commit`;
  if (!installation.inventory.launches.some(edge => edge.file === hook && edge.form === 'shell-node'
    && edge.target === 'unknown-knowledge/engine/commit-check.js')) refuse('activation-hook-unsupported');
  let node = null;
  for (const directory of (env.PATH ?? '').split(':')) {
    if (!directory || !isAbsolute(directory)) refuse('activation-path-unsupported');
    const file = join(directory, 'node');
    try { accessSync(file, constants.X_OK); } catch { continue; }
    node = realpathSync(file); break;
  }
  if (!node || node !== executables.node.path || executableSha256(node) !== executables.node.sha256
    || realpathSync('/usr/bin/git') !== executables.git.path || executableSha256(realpathSync('/usr/bin/git')) !== executables.git.sha256) refuse('activation-executable-drift');
  const expected = installation.inventory.roles.filter(row => row.candidate).map(row => row.candidate);
  if (expected.length > limits.maxFiles) refuse('activation-capacity');
  const stage = git(['ls-files', '--stage', '-z']);
  const expectedStage = expected.map(row => `${row.mode} ${row.blob} 0\t${row.file}\0`).join('');
  if (stage !== expectedStage) refuse('activation-index-drift');
  const files = []; let size = 0; let entries = 0;
  const visit = (directory, prefix) => {
    for (const name of readdirSync(directory).sort(order)) {
      if (prefix === '' && name === '.git') continue;
      if (++entries > limits.maxFiles * 4) refuse('activation-capacity');
      const path = join(directory, name), relative = `${prefix}${name}`, stat = lstatSync(path);
      if (stat.isDirectory()) { visit(path, `${relative}/`); continue; }
      if (!stat.isFile() || files.length >= limits.maxFiles || stat.size > limits.maxBytes - size) refuse('activation-file-unavailable');
      const bytes = readFileSync(path); size += bytes.length;
      if (bytes.length !== stat.size || size > limits.maxBytes) refuse('activation-capacity');
      files.push({ file: relative, sha256: rawSha256(bytes), mode: (stat.mode & 0o111) ? '100755' : '100644', size: bytes.length });
    }
  };
  visit(root, ''); files.sort((a, b) => order(a.file, b.file));
  if (!isDeepStrictEqual(files, expected.map(({ file, sha256, mode, size }) => ({ file, sha256, mode, size })))) refuse('activation-live-tree-drift');
  if (!files.some(row => row.file === hook && row.mode === '100755')) refuse('activation-hook-not-executable');
  accessSync(join(root, hook), constants.X_OK);
  // Additional active hook names would be required consumers outside the supported form.
  if (readdirSync(join(root, approved.review.activation.hooksPath)).some(name => name !== 'pre-commit')) refuse('activation-hook-directory-unsupported');
  return { candidate: request.candidate, outputRef: request.publish.outputRef, inventoryDigest: installation.reviewDigest,
    hooksPath: approved.review.activation.hooksPath, preCommit: hook, node: { path: node, sha256: executables.node.sha256 },
    git: executables.git, filesDigest: canonicalSha256(files), files: files.length, bytes: size,
    environment: { PATH: env.PATH, scope: 'current-process', overrides: 'absent' } };
}

/** Review authenticity is supplied through the existing trusted orchestration boundary. */
export async function verifyMigrationActivation(input) {
  if (!closed(input, ['repoRoot', 'evidenceDirectory', 'validationBundleDigest', 'reviewBundleDigest', 'expectedRequestDigest',
    'approvedRuntimeProfile', 'approvedInstallationReview', 'migration', 'limits'])
    || !closed(input.limits, ['review', 'execution', 'observation']) || !closed(input.limits.observation, limitKeys)
    || !limitKeys.every(key => Number.isSafeInteger(input.limits.observation[key]) && input.limits.observation[key] > 0)
    || input.limits.observation.maxCommandMilliseconds > 600000) return { status: 'not-observed', code: 'activation-input' };
  const plan = structuredClone(input);
  try {
    const root = realpathSync(plan.repoRoot);
    const review = readRetainedCandidateReview({ evidenceDirectory: plan.evidenceDirectory, reviewBundleDigest: plan.reviewBundleDigest,
      validationBundleDigest: plan.validationBundleDigest, expectedRequestDigest: plan.expectedRequestDigest, limits: plan.limits.review });
    if (review.status !== 'verified' || review.request.operation !== 'identity-migration'
      || review.request.policy.id !== 'installation-cutover-publication-v1') refuse('activation-review-unavailable');
    const gate = review.request.operationEvidence.finalGate?.result;
    const installation = gate?.gate?.mechanical?.installation;
    if (gate?.status !== 'passed' || !matchesApprovedInstallationReview(plan.approvedInstallationReview, installation)) refuse('activation-role-review-unavailable');
    const request = review.request;
    const retained = readRetainedPreparedEvidence({ evidenceDirectory: plan.evidenceDirectory, bundleDigest: plan.validationBundleDigest,
      expected: { source: { commit: request.source.expectedCommit, tree: request.source.tree, kitPath: request.source.kitPath },
        candidate: request.candidate, operation: request.operation, runtimeDigest: request.runtimeDigest, reportDigest: request.evidence.reportDigest },
      limits: Object.fromEntries(['maxManifestBytes', 'maxArtifacts', 'maxArtifactBytes', 'maxTotalArtifactBytes'].map(key => [key, plan.limits.review[key]])) });
    if (retained.status !== 'verified') refuse('activation-evidence-unavailable');
    const first = observe(root, request, installation, plan.approvedInstallationReview, retained.runtimeManifest.executables, plan.limits.observation);
    // Independently replay the retained evidence/fresh owner before admitting an observation.
    const checked = await verifyCandidateReviewEvidence({ repoRoot: root, evidenceDirectory: plan.evidenceDirectory,
      request: review.request, approvedRuntimeProfile: plan.approvedRuntimeProfile, approvedInstallationReview: plan.approvedInstallationReview,
      migration: plan.migration, limits: plan.limits.review, executionLimits: plan.limits.execution });
    const second = observe(root, review.request, installation, plan.approvedInstallationReview, checked.retained.runtimeManifest.executables, plan.limits.observation);
    if (!isDeepStrictEqual(first, second)) refuse('activation-observation-drift');
    return { version: 1, status: 'observed', scope: 'bounded-local-installation', requestDigest: plan.expectedRequestDigest,
      reviewBundleDigest: plan.reviewBundleDigest, observation: second, observationDigest: canonicalSha256(second), futureState: 'not-guaranteed' };
  } catch (error) {
    if (!(error instanceof EngineRefusal) && !Number.isInteger(error?.errno)) throw error;
    return { status: 'not-observed', code: error.code ?? 'activation-evidence-unavailable' };
  }
}
