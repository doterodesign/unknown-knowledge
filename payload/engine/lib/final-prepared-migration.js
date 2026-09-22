/** Fresh final migration evidence with private input resupply and fixed runtime execution. */
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, relative } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { canonicalJsonBytes, canonicalSha256 } from './canonical-json.js';
import { EngineRefusal } from './engine-refusal.js';
import { readRetainedPreparedEvidence } from './prepared-evidence.js';
import { verifyRetainedRuntimeCapability } from './runtime-capability.js';
import { capturePreparedRuntime } from './prepared-runtime.js';
import { verifyMigrationHistoricalRuntime } from './migration-historical-runtime.js';
import { executePreparedWorker } from './prepared-worker-process.js';
import { isPreparedMigrationReport } from './prepared-migration-report.js';
import { migrationMechanicalPolicy } from './prepared-migration-gate.js';
import { matchesApprovedInstallationReview } from './migration-installation-report.js';

const policyBytes = readFileSync(new URL('../policies/candidate-publication.json', import.meta.url));
const policies = JSON.parse(policyBytes);
const closed = (v, keys) => v !== null && typeof v === 'object' && !Array.isArray(v)
  && Reflect.ownKeys(v).length === keys.length && keys.every((key) => Object.hasOwn(v, key));
const runtimeKeys = ['maxRuntimeFiles', 'maxRuntimeBytes', 'maxOutputBytesPerCheck', 'maxCheckMilliseconds'];
const within = (root, target) => { const rel = relative(root, target); return rel === '' || (!rel.startsWith('../') && rel !== '..' && !isAbsolute(rel)); };
function parse(bytes, canonical = true) {
  let value;
  try { value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { throw new EngineRefusal('invalid final migration JSON'); }
  if (canonical && !canonicalJsonBytes(value).equals(bytes)) throw new EngineRefusal('noncanonical final migration JSON');
  return value;
}

export async function runFinalPreparedMigrationGate(input) {
  const installation = Object.hasOwn(input?.migration?.migrationInputs ?? {}, 'installation');
  const policy = installation ? policies.installationCutover : policies.operations['identity-migration'];
  const result = { version: 1, kind: 'final-prepared-migration', policy: { id: policy.id, version: policy.version, digest: canonicalSha256(policy) },
    source: null, candidate: null, runtimeDigest: null, capability: null, gate: null, status: 'failed', diagnostics: [] };
  const fail = (code) => { result.diagnostics.push({ code }); return result; };
  if (installation) { result.version = 2; result.installationReviewDigest = null; }
  if (!closed(input, ['repoRoot', 'evidenceDirectory', 'validationBundleDigest', 'expected', 'approvedRuntimeProfile', 'limits', 'migration',
    ...(Object.hasOwn(input ?? {}, 'approvedInstallationReview') ? ['approvedInstallationReview'] : [])])
    || typeof input.repoRoot !== 'string' || !input.repoRoot || input.repoRoot.includes('\0')
    || !closed(input.limits, ['evidence', 'runtime']) || !closed(input.limits.runtime, runtimeKeys)
    || !runtimeKeys.every((key) => Number.isSafeInteger(input.limits.runtime[key]) && input.limits.runtime[key] > 0)
    || input.limits.runtime.maxCheckMilliseconds > 600000 || input.expected?.operation !== 'identity-migration'
    || !closed(input.migration, ['migrationInputs', 'limits', 'semantic'])) return fail('invalid-final-migration-input');
  const plan = structuredClone(input); let work = null;
  try {
    const readInput = { evidenceDirectory: plan.evidenceDirectory, bundleDigest: plan.validationBundleDigest,
      expected: plan.expected, limits: plan.limits.evidence };
    const retained = readRetainedPreparedEvidence(readInput);
    if (retained.status !== 'verified') return fail('final-migration-retention-unavailable');
    result.source = { ...retained.manifest.source }; result.candidate = { ...retained.manifest.candidate };
    if (!retained.artifacts.find((row) => row.file === 'runtime/files/engine/policies/candidate-publication.json')?.bytes.equals(policyBytes)) return fail('final-migration-policy-mismatch');
    const operation = retained.report.checks.find((row) => row.id === 'operation');
    const artifact = retained.artifacts.find((row) => row.file === operation?.result?.file);
    if (!artifact || operation.completion !== 'complete' || operation.status !== 'passed'
      || retained.report.provenance !== 'verified' || retained.report.runtimeVerification !== 'verified'
      || !retained.report.checks.filter(({ id }) => id !== 'operation').every((row) => row.status === 'passed'
        && row.completion === 'complete' && row.exitCode === 0)) return fail('final-migration-validation-incomplete');
    const originalGate = parse(artifact.bytes, false);
    if (!isPreparedMigrationReport(originalGate, plan.expected) || originalGate.mechanicalStatus !== 'passed') return fail('final-migration-mechanical-incomplete');
    if (originalGate.version !== (installation ? 2 : 1)) return fail('final-migration-profile-mismatch');
    if (installation) {
      if (!matchesApprovedInstallationReview(plan.approvedInstallationReview, originalGate.installation)) return fail('final-migration-installation-review-unavailable');
      result.installationReviewDigest = plan.approvedInstallationReview.digest;
    } else if (plan.approvedInstallationReview != null) return fail('final-migration-profile-mismatch');
    // A cheap private admission check precedes spawning; the child-owned gate digest is checked again below.
    const expectedInputDigest = canonicalSha256({ source: result.source, candidate: result.candidate,
      migrationInputs: plan.migration.migrationInputs, limits: plan.migration.limits,
      policy: migrationMechanicalPolicy(plan.migration.migrationInputs) });
    if (expectedInputDigest !== originalGate.validationInputDigest) return fail('final-migration-private-input-mismatch');
    const capability = verifyRetainedRuntimeCapability(readInput, plan.approvedRuntimeProfile);
    result.capability = { profileDigest: plan.approvedRuntimeProfile?.digest ?? null, resultDigest: canonicalSha256(capability) };
    if (capability.status !== 'established' || capability.persistence !== 'unsupported'
      || capability.scope !== 'kit-managed-subject-route-persistence' || capability.runtimeDigest !== retained.manifest.runtimeDigest
      || !isDeepStrictEqual(capability.captures, { source: result.source, candidate: result.candidate })) return fail('final-migration-capability-unavailable');
    plan.repoRoot = realpathSync(plan.repoRoot);
    work = mkdtempSync(join(realpathSync('/tmp'), 'final-migration-'));
    if (within(plan.repoRoot, work)) return fail('final-migration-runtime-overlap');
    const runtime = capturePreparedRuntime(work, plan.limits.runtime, 'identity-migration');
    if (Object.values(runtime.manifest.executables).some(({ path }) => within(plan.repoRoot, path))) return fail('final-migration-runtime-overlap');
    if (canonicalSha256(runtime.manifest) !== retained.manifest.runtimeDigest) return fail('final-migration-runtime-mismatch');
    const profile = verifyMigrationHistoricalRuntime(runtime);
    result.runtimeDigest = canonicalSha256(runtime.manifest);
    const jobFile = join(work, 'job.json');
    writeFileSync(jobFile, canonicalJsonBytes({ repoRoot: plan.repoRoot, source: result.source, candidate: result.candidate,
      migration: plan.migration, manifest: runtime.manifest, runtimeLimits: plan.limits.runtime }), { flag: 'wx', mode: 0o400 });
    const actual = await executePreparedWorker(runtime, jobFile, plan.limits.runtime, 'final-migration');
    rmSync(jobFile); // Private inputs disappear before any child output is admitted or retained.
    if (actual.error || actual.status !== 0 || actual.signal || actual.stderr.length) return fail('final-migration-worker-incomplete');
    verifyMigrationHistoricalRuntime(runtime);
    const output = parse(actual.stdout);
    if (!closed(output, ['version', 'gate']) || output.version !== 1
      || !closed(output.gate, ['version', 'kind', 'status', 'namespace', 'mechanical', 'runtimeDigest', 'historicalProfile', 'sourceProfile',
        'recipe', 'validation', 'operationalHistory', 'replays', 'generated', 'diagnostics', ...(installation ? ['consumers'] : [])]) || output.gate.version !== (installation ? 4 : 3)
      || output.gate.kind !== 'prepared-migration-semantics' || !Array.isArray(output.gate.diagnostics)
      || !isPreparedMigrationReport(output.gate.mechanical, plan.expected)
      || output.gate.mechanical.validationInputDigest !== originalGate.validationInputDigest
      || output.gate.runtimeDigest !== result.runtimeDigest || !isDeepStrictEqual(output.gate.historicalProfile, profile)) return fail('final-migration-output-invalid');
    result.gate = output.gate;
    if (installation && (!matchesApprovedInstallationReview(plan.approvedInstallationReview, result.gate.mechanical.installation)
      || result.gate.consumers?.status !== 'complete')) return fail('final-migration-installation-incomplete');
    if (result.gate.status !== 'complete' || result.gate.mechanical.mechanicalStatus !== 'passed'
      || result.gate.namespace !== plan.migration.migrationInputs.namespace
      || result.gate.recipe?.policy !== policy.semanticPolicy || result.gate.recipe.today !== plan.migration.semantic.today
      || result.gate.sourceProfile?.policy !== policy.sourceProfilePolicy || result.gate.sourceProfile.status !== 'complete'
      || !isDeepStrictEqual(result.gate.sourceProfile.before, result.gate.sourceProfile.candidate)
      || result.gate.operationalHistory?.policy !== policy.operationalHistoryPolicy
      || result.gate.operationalHistory.status !== 'complete'
      || result.gate.operationalHistory.editions?.comparison?.status !== 'complete'
      || result.gate.recipe.cases?.length !== result.gate.replays?.length || !result.gate.replays?.length
      || !result.gate.replays.every((row, i) => row.comparison?.status === 'complete'
        && isDeepStrictEqual(row.input, result.gate.recipe.cases[i]))
      || result.gate.validation?.length !== 4 || result.gate.generated?.comparison?.status !== 'complete'
      || !['before', 'candidate'].every((side) => isDeepStrictEqual(result.gate.generated[side]?.artifacts?.map((row) => row.path),
        ['knowledge/derived/index.json', 'knowledge/derived/tree.domain-form.md', 'knowledge/derived/tree.form-domain.md']))) return fail('final-migration-gate-incomplete');
    result.status = 'passed'; return result;
  } catch (error) {
    if (!(error instanceof EngineRefusal) && !Number.isInteger(error?.errno)) throw error;
    return fail('final-migration-evidence-unavailable');
  } finally {
    if (work) try { rmSync(work, { recursive: true, force: true }); }
    catch (error) {
      if (!Number.isInteger(error?.errno)) throw error;
      result.status = 'failed'; fail('final-migration-cleanup-failed');
    }
  }
}
