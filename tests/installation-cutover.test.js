import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { installationFixture as fixture } from './helpers/installation-cutover-fixture.js';
import { capturePreparedRuntime } from '../payload/engine/lib/prepared-runtime.js';
import { runPreparedMigrationGate } from '../payload/engine/lib/prepared-migration-gate.js';
import { runPreparedMigrationSemantics } from '../payload/engine/lib/prepared-migration-semantics.js';
import { isPreparedMigrationReport } from '../payload/engine/lib/prepared-migration-report.js';

test('installed cutover proves exact runtime replacement, range retirement and operational suppression conversion', async t => {
  const append = (_f, kit) => {
    const file = join(kit, 'suppressions.yaml');
    writeFileSync(file, readFileSync(file, 'utf8')
      + '- {term: literal-no-match, sourcePath: no-match.txt, reason: Preserve reviewed nonmatch, date: "2026-08-19"}\n'
      + '- {term: malformed, sourcePath: nowhere, reason: Preserve fail-open warning, date: invalid}\n');
  };
  const f = fixture(t, { before: append, after: append, roles(input) {
    input.roles.find(row => row.role === 'suppressions').bindings.push(
      { index: 1, kind: 'literal', source: null }, { index: 2, kind: 'literal', source: null });
  } });
  const result = await runPreparedMigrationGate({ repoRoot: f.root, source: f.source, candidate: f.candidate,
    migrationInputs: f.migrationInputs, limits: f.limits });
  assert.equal(result.mechanicalStatus, 'passed', JSON.stringify({ checks: result.checks, installation: result.installation?.code }));
  assert.equal(result.version, 2);
  assert.equal(result.installation.status, 'complete');
  assert(isPreparedMigrationReport(result, { source: f.source, candidate: f.candidate }));
  const work = join(f.base, 'semantic-runtime'); mkdirSync(work);
  const runtime = capturePreparedRuntime(work, f.runtimeLimits, 'identity-migration');
  const semantic = await runPreparedMigrationSemantics({ repoRoot: f.root, source: f.source, candidate: f.candidate,
    migrationInputs: f.migrationInputs, limits: f.limits, runtime, runtimeLimits: f.runtimeLimits, semantic: f.semantic });
  assert.equal(semantic.status, 'complete', JSON.stringify(semantic.diagnostics));
  assert.equal(semantic.version, 4);
  assert.equal(semantic.consumers.before.suppressions.suppressed[0].concept, 'K-102');
  assert.equal(semantic.consumers.candidate.suppressions.suppressed[0].concept, 'O-000001');
  assert.equal(semantic.consumers.before.suppressions.warnings.length, 1);
  assert.deepEqual(semantic.consumers.before.suppressions.warnings, semantic.consumers.candidate.suppressions.warnings);
});
