/** Actual fixed audit owners on disposable snapshot indexes; never client code. */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { load } from 'js-yaml';
import { canonicalJsonBytes } from './canonical-json.js';
import { executePreparedEngineCheck } from './prepared-engine-process.js';
import { EngineRefusal } from './engine-refusal.js';
import { buildSurveyMap } from '../commands/survey-map.js';
import { buildSurveyMap as historicalSurvey } from '../compatibility/identity-migration-08066b5/engine/commands/survey-map.js';

export class ConsumerProofRefusal extends EngineRefusal {
  constructor(code) { super(code); this.code = code; }
}
const refuse = (code = 'installation-consumer-shape') => { throw new ConsumerProofRefusal(code); };
const closed = (v, keys) => v !== null && typeof v === 'object' && !Array.isArray(v)
  && Object.keys(v).length === keys.length && keys.every(key => Object.hasOwn(v, key));

function auditIndex(root, limits) {
  if (existsSync(join(root, '.git'))) refuse();
  const env = { PATH: '/usr/bin:/bin', HOME: '/dev/null', LC_ALL: 'C', GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: '/dev/null', GIT_NO_REPLACE_OBJECTS: '1', GIT_NO_LAZY_FETCH: '1', GIT_TERMINAL_PROMPT: '0' };
  const git = args => {
    const result = spawnSync('git', ['-c', 'core.fsmonitor=false', '-c', 'core.hooksPath=/dev/null', '-c', 'core.attributesFile=/dev/null',
      '-C', root, ...args], { env, maxBuffer: limits.maxOutputBytesPerCheck, timeout: limits.maxCheckMilliseconds });
    if (result.status !== 0 || result.signal || result.error) refuse('installation-audit-index-unavailable');
  };
  git(['init', '--quiet', '--template=']);
  git(['config', 'core.fsmonitor', 'false']);
  git(['config', 'core.hooksPath', '/dev/null']);
  git(['add', '--all', '--force', '--', '.']);
}

function comparable(value, old, identity) {
  if (!closed(value, ['checks', 'scope', 'counts', 'findings', 'suppressions'])
    || !closed(value.suppressions, ['warnings', 'suppressed']) || !Array.isArray(value.findings)
    || !Array.isArray(value.suppressions.suppressed) || !Array.isArray(value.suppressions.warnings)) refuse();
  const row = original => {
    const item = structuredClone(original);
    if (item.code === 'stale-last-verified') {
      if (!closed(item, ['code', 'severity', 'concept', 'last-verified', 'days', 'stale-days', 'message'])) refuse();
      const id = (old ? identity.before : identity.candidate)('ontology', item.concept);
      if (!id) refuse(); item.concept = id;
    } else if (item.code === 'unmatched-anchor') {
      if (!closed(item, ['code', 'severity', 'path', 'kinds', 'message', 'draft'])) refuse();
      const draft = load(item.draft);
      if (draft.id !== (old ? 'K-XXX' : 'proposal:ontology:<lowercase-v4-uuid>')
        || draft.class !== (old ? 'TODO — owning class file; mint the id in its declared range (§3.5)'
          : 'TODO — owning classification; identity is independent of the class file')) refuse();
      // Exactly two intentionally changed vendor authoring prompts, not record aliases.
      item.draft = { ...draft, id: null, class: null };
    } else refuse();
    return item;
  };
  return { ...value, findings: value.findings.map(row), suppressions: { ...value.suppressions, suppressed: value.suppressions.suppressed.map(row) } };
}

export async function proveInstallationConsumers({ beforeRoot, candidateRoot, runtime, runtimeLimits, today, identity, maxBytes, kitPath }) {
  const result = { version: 1, status: 'complete', policy: 'installation-consumers-v1', before: null, candidate: null, surveys: {} };
  // The seeded profile has an explicit nested kit. Both fixed audit owners skip
  // this prefix, although their raw candidate count includes surveyed kit files.
  if (kitPath !== 'unknown-knowledge') refuse('installation-audit-layout-unsupported');
  for (const [side, root, kind] of [['before', beforeRoot, 'historical-audit'], ['candidate', candidateRoot, 'current-audit']]) {
    auditIndex(root, runtimeLimits);
    const output = await executePreparedEngineCheck(runtime.root, runtime.manifest, runtimeLimits, { kind, root, today });
    if (output.reason || output.signal || output.exitCode !== 0 || output.stderr.length) refuse('installation-audit-execution-unavailable');
    try { result[side] = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(output.stdout)); } catch { refuse(); }
    const survey = (side === 'before' ? historicalSurvey : buildSurveyMap)(root);
    result.surveys[side] = { candidates: survey.candidates, unsurveyed: survey.unsurveyed, scope: survey.scope };
    if (result[side].counts.candidates !== survey.candidates.length) refuse('installation-audit-count-unavailable');
  }
  const effectiveSurvey = side => ({ ...result.surveys[side],
    candidates: result.surveys[side].candidates.filter(row => row.path !== kitPath && !row.path.startsWith(`${kitPath}/`)) });
  if (!isDeepStrictEqual(effectiveSurvey('before'), effectiveSurvey('candidate'))) refuse('installation-audit-source-difference');
  const old = comparable(result.before, true, identity), next = comparable(result.candidate, false, identity);
  // Preserve raw observed counts above. Only the count of ignored kit anchors
  // can change; all effective inputs, results, warnings and order must agree.
  old.counts = { ...old.counts, candidates: 0 }; next.counts = { ...next.counts, candidates: 0 };
  if (!isDeepStrictEqual(old, next)) refuse('installation-audit-difference');
  if (canonicalJsonBytes(result).length > maxBytes) refuse('installation-consumer-budget');
  return result;
}
