import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { fileURLToPath } from 'node:url';
import { canonicalJsonBytes } from '../payload/engine/lib/canonical-json.js';
import { runPreparedMigrationGate } from '../payload/engine/lib/prepared-migration-gate.js';
import { runPreparedCandidateChecks } from '../payload/engine/lib/prepared-validation.js';
import { readRetainedPreparedEvidence } from '../payload/engine/lib/prepared-evidence.js';

import { fixture, limits } from './helpers/prepared-migration-fixture.js';

for (const format of ['sha1', 'sha256']) test(`actual ${format} migration gate survives retained runner readback unchanged without private input artifacts`, async (t) => {
  const f = fixture(t, format); const inputBefore = structuredClone(f.input);
  const expected = await runPreparedMigrationGate(JSON.parse(canonicalJsonBytes({ repoRoot: f.root, source: f.input.source, candidate: f.input.candidate, ...f.input.operationInputs })));
  assert.equal(expected.mechanicalStatus, 'passed');
  const result = await runPreparedCandidateChecks(f.input);
  assert.deepEqual(result.report.checks.map((c) => c.status), ['passed', 'passed', 'passed']);
  assert.deepEqual(f.input, inputBefore);
  const reopened = readRetainedPreparedEvidence({ evidenceDirectory: f.evidence, bundleDigest: result.retention.bundleDigest,
    expected: { source: f.input.source, candidate: f.input.candidate, operation: f.input.operation,
      runtimeDigest: result.runtimeDigest, reportDigest: result.reportDigest },
    limits: { maxManifestBytes: 1000000, maxArtifacts: 2000, maxArtifactBytes: 20000000, maxTotalArtifactBytes: 40000000 } });
  assert.equal(reopened.status, 'verified');
  const operation = result.report.checks[2];
  const retained = reopened.artifacts.find((r) => r.file === operation.result.file).bytes;
  assert.deepEqual(retained, Buffer.from(`${JSON.stringify(expected)}\n`));
  assert.equal(Object.hasOwn(operation.invocation, 'injectedInputsDigest'), false);
  assert.equal(reopened.artifacts.some((r) => r.file === 'checks/operation/input.json'), false);
  for (const artifact of reopened.artifacts.filter((r) => !r.file.startsWith('runtime/'))) {
    assert.doesNotMatch(artifact.bytes.toString(), /PRIVATE REVIEW MATERIAL|D-9|proseDecisions/);
  }
  assert.equal(result.report.validationComplete, false); assert.equal(result.report.publicationReady, false);
});

test('migration transport refuses crash, stderr, duplicate keys and interrupted output before retaining any artifact', async (t) => {
  const shim = fileURLToPath(new URL('../payload/engine/lib/prepared-migration-check.js', import.meta.url));
  const originalRead = fs.readFileSync; const originalTemp = fs.mkdtempSync; const size = originalRead(shim).length;
  const original = originalRead(shim, 'utf8').replace(/^\/\*[^]*?\*\/\n/, '');
  const stdout = 'process.stdout.write(`${JSON.stringify(result)}\\n`);';
  const faults = [
    'throw new Error("PRIVATE REVIEW MATERIAL");',
    original.replace(stdout, 'process.stderr.write("PRIVATE REVIEW MATERIAL");' + stdout),
    original.replace(stdout, 'process.stdout.write(JSON.stringify(result).replace("{",\'{"version":"PRIVATE REVIEW MATERIAL",\')+"\\n");'),
    'process.stdout.write("PRIVATE REVIEW MATERIAL".repeat(10000));',
  ];
  for (const fault of faults) {
    assert.ok(Buffer.byteLength(fault) <= size, 'fault fits captured source size');
    const f = fixture(t); let ownedWork;
    fs.mkdtempSync = (prefix, ...args) => { const result = originalTemp(prefix, ...args);
      if (prefix.endsWith('/prepared-validation-')) ownedWork = result; return result; };
    fs.readFileSync = (path, ...args) => path === shim ? Buffer.from(fault.padEnd(size)) : originalRead(path, ...args);
    syncBuiltinESMExports();
    try { await assert.rejects(runPreparedCandidateChecks({ ...f.input, limits: { ...limits, maxOutputBytesPerCheck: 10000 } }),
      { code: 'unsafe-migration-output' }); }
    finally { fs.readFileSync = originalRead; fs.mkdtempSync = originalTemp; syncBuiltinESMExports(); }
    assert.deepEqual(fs.readdirSync(f.evidence), [], 'no blobs or completion markers installed');
    assert.ok(ownedWork); assert.equal(fs.existsSync(ownedWork), false, 'owned private job removed');
  }
});
