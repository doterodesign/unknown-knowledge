/** Independent parent-boundary tests; child results always originate in real workers. */
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { syncBuiltinESMExports } from 'node:module';
import { subjectSplitAssignmentFixture } from './helpers/subject-split-assignment-fixture.js';
import { subjectSplitInputWire } from '../payload/engine/lib/subject-split-input.js';
import { runPreparedSubjectSplitGate } from '../payload/engine/lib/subject-split-gate.js';
import { runPreparedCandidateChecks } from '../payload/engine/lib/prepared-validation.js';
import { readRetainedPreparedEvidence } from '../payload/engine/lib/prepared-evidence.js';
import { EngineRefusal } from '../payload/engine/lib/engine-refusal.js';

const runtimeLimits = { maxRuntimeFiles: 3000, maxRuntimeBytes: 30000000,
  maxOutputBytesPerCheck: 20000000, maxCheckMilliseconds: 60000 };
const evidenceLimits = { maxManifestBytes: 2000000, maxArtifacts: 4000,
  maxArtifactBytes: 30000000, maxTotalArtifactBytes: 200000000 };
const authorityNames = ['registry', 'identity', 'event'];
const member = (retained, name) => retained.artifacts.find(row => row.file === `checks/operation/${name}`);

function fixture(t, options = {}) {
  const f = subjectSplitAssignmentFixture(t, options);
  const evidenceDirectory = fs.mkdtempSync(join(f.root, '..', 'split-parent-review-'));
  t.after(() => fs.rmSync(evidenceDirectory, { recursive: true, force: true }));
  const operationInputs = { gateInput: subjectSplitInputWire(f.input), captureLimits: {
    maxRegistryBytes: Buffer.byteLength(f.read('subjects/registry.yaml')),
    maxIdentityBytes: Buffer.byteLength(f.read('_identity.yaml')),
    maxEventBytes: options.zero ? 1 : Buffer.byteLength(f.read(`subjects/_assignments/${f.operation.assignmentEvent.id}.yaml`)),
  } };
  const input = { repoRoot: f.root, source: f.input.before, candidate: f.input.candidate,
    operation: 'subject-split', operationInputs, limits: runtimeLimits, evidenceDirectory };
  return { ...f, ownerInput: f.input, input };
}

function readback(f, result) {
  assert.equal(result.retention.status, 'retained', JSON.stringify(result));
  return readRetainedPreparedEvidence({ evidenceDirectory: f.input.evidenceDirectory,
    bundleDigest: result.retention.bundleDigest, expected: {
      source: f.input.source, candidate: f.input.candidate, operation: 'subject-split',
      runtimeDigest: result.runtimeDigest, reportDigest: result.reportDigest,
    }, limits: evidenceLimits });
}

function assertOwnerSuccess(retained) {
  const operation = retained.report.checks.find(row => row.id === 'operation');
  assert.equal(operation.status, 'passed', JSON.stringify(operation));
  assert.equal(operation.exitCode, 0);
  assert.equal(operation.completion, 'complete');
  assert.equal(JSON.parse(member(retained, 'result').bytes).ok, true);
}

// Intercept only the parent process after the real child has completed. Never
// replace child execution or manufacture a successful owner report.
async function atParentRead(f, change, { grow = null, onRetainRead } = {}) {
  const original = Object.fromEntries(['readFileSync', 'openSync', 'readSync', 'closeSync', 'rmSync',
    'writeFileSync', 'chmodSync', 'appendFileSync', 'unlinkSync', 'symlinkSync', 'mkdirSync'].map(key => [key, fs[key]]));
  const observation = { entered: false, reads: {}, modes: {}, work: null };
  const descriptors = new Map(); let grown = false;
  const enter = path => {
    if (!observation.entered && basename(String(path)) === 'worker-report.json') {
      observation.entered = true; observation.work = dirname(String(path));
      const bytes = original.readFileSync(path);
      const report = JSON.parse(bytes);
      const result = original.readFileSync(join(observation.work, 'operation.result'));
      const stdout = original.readFileSync(join(observation.work, 'operation.stdout'));
      assert.deepEqual(result, stdout, 'real child result must preserve exact emitted bytes');
      observation.owner = JSON.parse(result); observation.emitted = result;
      observation.operation = structuredClone(report.checks.find(row => row.id === 'operation'));
      change?.({ work: observation.work, report, owner: observation.owner, original, observation });
    }
  };
  fs.readFileSync = (path, ...args) => {
    enter(path);
    if (observation.entered && dirname(String(path)) === observation.work
      && /^operation\.(stdout|result|stderr)$/.test(basename(String(path)))) {
      onRetainRead?.({ path: String(path), original, observation });
    }
    return original.readFileSync(path, ...args);
  };
  fs.openSync = (path, ...args) => {
    enter(path);
    const fd = original.openSync(path, ...args);
    const name = basename(String(path));
    if (dirname(String(path)) === observation.work && /^operation\.(registry|identity|event)$/.test(name)) {
      descriptors.set(fd, name);
      observation.modes[name] = fs.fstatSync(fd).mode & 0o777;
    }
    return fd;
  };
  fs.readSync = (fd, ...args) => {
    const name = descriptors.get(fd);
    if (name) {
      observation.reads[name] = (observation.reads[name] ?? 0) + 1;
      if (grow === name && !grown) {
        grown = true;
        const path = join(observation.work, name);
        original.chmodSync(path, 0o600); original.appendFileSync(path, '\n'); original.chmodSync(path, 0o400);
      }
    }
    return original.readSync(fd, ...args);
  };
  fs.closeSync = fd => { descriptors.delete(fd); return original.closeSync(fd); };
  syncBuiltinESMExports();
  try { return { result: await runPreparedCandidateChecks(f.input), observation }; }
  catch (error) { return { error, observation }; }
  finally { Object.assign(fs, original); syncBuiltinESMExports(); }
}

function assertRefused(attempt) {
  assert.equal(attempt.observation.entered, true, 'actual worker boundary must be reached');
  assert.ok(attempt.error instanceof EngineRefusal || Number.isInteger(attempt.error?.errno),
    attempt.error?.stack ?? 'runner unexpectedly acknowledged altered evidence');
  assert.equal(attempt.result, undefined);
}

test('independent control: actual successful split owner reaches exact-cap parent retention', async t => {
  const f = fixture(t);
  const owner = await runPreparedSubjectSplitGate(f.ownerInput);
  assert.equal(owner.ok, true, JSON.stringify(owner.diagnostics));
  const retained = readback(f, await runPreparedCandidateChecks(f.input));
  assertOwnerSuccess(retained);
  for (const name of authorityNames) assert.ok(member(retained, `${name}.yaml`));
});

test('parent admits each exact artifact cap and rejects physical oversize before reading bytes', async t => {
  const f = fixture(t);
  const control = await atParentRead(f);
  assert.ifError(control.error); assertOwnerSuccess(readback(f, control.result));
  for (const name of authorityNames) {
    assert.equal(control.observation.modes[`operation.${name}`], 0o400);
    assert.ok(control.observation.reads[`operation.${name}`] > 0);
    await t.test(`${name}: one byte over physical cap`, async () => {
      const attempt = await atParentRead(f, ({ work, original, owner }) => {
        assert.equal(owner.ok, true);
        const path = join(work, `operation.${name}`);
        original.chmodSync(path, 0o600); original.appendFileSync(path, '\n'); original.chmodSync(path, 0o400);
      });
      assertRefused(attempt);
      assert.equal(attempt.observation.reads[`operation.${name}`] ?? 0, 0, 'fstat cap must precede byte read');
    });
  }
  const growth = await atParentRead(f, undefined, { grow: 'operation.identity' });
  assertRefused(growth);
  assert.ok(growth.observation.reads['operation.identity'] > 0, 'growth is injected after fstat admission');
});

test('parent requires owned regular mode-0400 authority files and never follows artifact symlinks', async t => {
  const f = fixture(t);
  assertOwnerSuccess(readback(f, await runPreparedCandidateChecks(f.input)));
  for (const [name, form] of [['registry', 'mode'], ['identity', 'directory'], ['event', 'symlink'], ['identity', 'broken-symlink']]) {
    await t.test(`${name}: ${form}`, async () => {
      const attempt = await atParentRead(f, ({ work, original, owner }) => {
        assert.equal(owner.ok, true);
        const path = join(work, `operation.${name}`);
        if (form === 'mode') original.chmodSync(path, 0o600);
        else {
          original.unlinkSync(path);
          if (form === 'directory') original.mkdirSync(path, { mode: 0o700 });
          else original.symlinkSync(form === 'symlink' ? join(work, 'operation.result') : join(work, 'absent-target'), path);
        }
      });
      assertRefused(attempt);
      assert.equal(attempt.observation.reads[`operation.${name}`] ?? 0, 0);
    });
  }
});

test('zero parent forbids even empty event artifacts and broken symlinks', async t => {
  const f = fixture(t, { zero: true });
  const retained = readback(f, await runPreparedCandidateChecks(f.input));
  assertOwnerSuccess(retained); assert.equal(member(retained, 'event.yaml'), undefined);
  for (const form of ['empty', 'broken-symlink']) await t.test(form, async () => {
    const attempt = await atParentRead(f, ({ work, original, owner }) => {
      assert.equal(owner.ok, true); assert.equal(owner.sources.assignmentEvent, null);
      const path = join(work, 'operation.event');
      if (form === 'empty') original.writeFileSync(path, '', { flag: 'wx', mode: 0o400 });
      else original.symlinkSync(join(work, 'absent-event'), path);
    });
    assertRefused(attempt);
  });
});

test('authentic failed owner retains exact exit-1 diagnostic bytes without authority artifacts', async t => {
  const f = fixture(t);
  // A real closed-input budget refusal, with healthy actual committed models.
  f.input.operationInputs.gateInput.limits.closure.maxRows = 1;
  const control = await atParentRead(f);
  assert.ifError(control.error);
  assert.equal(control.observation.owner.ok, false);
  assert.ok(control.observation.owner.diagnostics.length > 0);
  assert.equal(control.observation.operation.exitCode, 1);
  assert.equal(control.observation.operation.completion, 'complete');
  assert.deepEqual(control.observation.emitted, Buffer.from(`${JSON.stringify(control.observation.owner)}\n`));
  const retained = readback(f, control.result);
  assert.deepEqual(member(retained, 'result').bytes, control.observation.emitted);
  assert.deepEqual(member(retained, 'stdout').bytes, control.observation.emitted);
  for (const name of authorityNames) assert.equal(member(retained, `${name}.yaml`), undefined);

  const cases = [
    ['exit zero contradicts failed owner', ({ report }) => {
      const row = report.checks.find(row => row.id === 'operation'); row.exitCode = 0; row.status = 'passed';
    }],
    ['interrupted owner is not diagnostic completion', ({ report }) => {
      const row = report.checks.find(row => row.id === 'operation'); row.completion = 'interrupted'; row.signal = 'SIGTERM';
    }],
    ['malformed worker check row cannot throw through the refusal boundary', ({ report }) => {
      report.checks[0] = null;
    }],
    ['result differs from exact stdout', ({ work, original }) => {
      original.chmodSync(join(work, 'operation.result'), 0o600);
      original.appendFileSync(join(work, 'operation.result'), '\n');
      original.chmodSync(join(work, 'operation.result'), 0o400);
    }],
    ['matching malformed stdout and result', ({ work, original }) => {
      for (const name of ['stdout', 'result']) {
        const path = join(work, `operation.${name}`); original.chmodSync(path, 0o600);
        original.writeFileSync(path, '{'); original.chmodSync(path, 0o400);
      }
    }],
    ['invalid failed-report diagnostic shape', ({ work, original, owner }) => {
      owner.diagnostics = null;
      for (const name of ['stdout', 'result']) {
        const path = join(work, `operation.${name}`); original.chmodSync(path, 0o600);
        original.writeFileSync(path, `${JSON.stringify(owner)}\n`); original.chmodSync(path, 0o400);
      }
    }],
    ['unexpected failed-owner identity artifact', ({ work, original }) => {
      original.writeFileSync(join(work, 'operation.identity'), '', { flag: 'wx', mode: 0o400 });
    }],
    ['unexpected failed-owner broken registry symlink', ({ work, original }) => {
      original.symlinkSync(join(work, 'absent-registry'), join(work, 'operation.registry'));
    }],
  ];
  for (const [name, change] of cases) await t.test(name, async () => {
    const attempt = await atParentRead(f, context => {
      assert.equal(context.owner.ok, false); assert.equal(context.observation.operation.exitCode, 1);
      change(context);
      const path = join(context.work, 'worker-report.json');
      context.original.chmodSync(path, 0o600);
      context.original.writeFileSync(path, JSON.stringify(context.report));
      context.original.chmodSync(path, 0o400);
    });
    assertRefused(attempt);
  });
});

test('complete successful owner cannot be transported as diagnostic exit one', async t => {
  const f = fixture(t);
  assertOwnerSuccess(readback(f, await runPreparedCandidateChecks(f.input)));
  const attempt = await atParentRead(f, ({ work, report, owner, original }) => {
    assert.equal(owner.ok, true);
    const row = report.checks.find(row => row.id === 'operation'); row.exitCode = 1; row.status = 'failed'; row.reason = 'nonzero-exit';
    for (const name of authorityNames) original.unlinkSync(join(work, `operation.${name}`));
    const path = join(work, 'worker-report.json'); original.chmodSync(path, 0o600);
    original.writeFileSync(path, JSON.stringify(report)); original.chmodSync(path, 0o400);
  });
  assertRefused(attempt);
});

test('retention uses the already validated diagnostic stream buffers, not later physical rereads', async t => {
  const f = fixture(t);
  f.input.operationInputs.gateInput.limits.closure.maxRows = 1;
  const control = await atParentRead(f);
  assert.ifError(control.error); assert.equal(control.observation.operation.exitCode, 1);
  assert.deepEqual(member(readback(f, control.result), 'result').bytes, control.observation.emitted);
  let mutated = false;
  const attempt = await atParentRead(f, undefined, { onRetainRead({ original, observation }) {
    if (mutated) return;
    mutated = true;
    const replacement = Buffer.from(`${JSON.stringify({ ...observation.owner, diagnostics: [{ code: 'unverified-second-read' }] })}\n`);
    for (const name of ['stdout', 'result', 'stderr']) {
      const path = join(observation.work, `operation.${name}`); original.chmodSync(path, 0o600);
      original.writeFileSync(path, name === 'stderr' ? 'late unverified stderr\n' : replacement);
      original.chmodSync(path, 0o400);
    }
  } });
  assert.ifError(attempt.error);
  const retained = readback(f, attempt.result);
  assert.deepEqual(member(retained, 'result').bytes, attempt.observation.emitted,
    `retained result must equal verified child bytes (late mutation reached=${mutated})`);
  assert.deepEqual(member(retained, 'stdout').bytes, attempt.observation.emitted);
  assert.equal(member(retained, 'stderr').bytes.length, 0);
});

for (const zero of [false, true]) test(`parent cleanup refuses acknowledgement after actual ${zero ? 'zero' : 'positive'} retention without deleting evidence`, async t => {
  const f = fixture(t, { zero });
  const remove = fs.rmSync; let injected = false; let bundle;
  fs.rmSync = (path, options) => {
    remove(path, options);
    if (!injected && basename(String(path)).startsWith('prepared-validation-')) {
      const manifests = fs.readdirSync(join(f.input.evidenceDirectory, 'bundles'));
      assert.equal(manifests.length, 1, 'actual bundle must already be finalized');
      const file = manifests[0]; const bytes = fs.readFileSync(join(f.input.evidenceDirectory, 'bundles', file));
      bundle = { file, bytes, manifest: JSON.parse(bytes) }; injected = true;
      throw Object.assign(new Error('independent post-retention cleanup failure'), { errno: -13, code: 'EACCES' });
    }
  };
  syncBuiltinESMExports();
  try {
    await assert.rejects(runPreparedCandidateChecks(f.input), error => error instanceof EngineRefusal && /cleanup/i.test(error.message));
  } finally { fs.rmSync = remove; syncBuiltinESMExports(); }
  assert.equal(injected, true);
  assert.deepEqual(fs.readFileSync(join(f.input.evidenceDirectory, 'bundles', bundle.file)), bundle.bytes);
  const { source, candidate, operation, runtimeDigest, reportDigest } = bundle.manifest;
  const retained = readRetainedPreparedEvidence({ evidenceDirectory: f.input.evidenceDirectory,
    bundleDigest: bundle.file.slice(0, -5), expected: { source, candidate, operation, runtimeDigest, reportDigest }, limits: evidenceLimits });
  assertOwnerSuccess(retained);
  assert.equal(Object.hasOwn(retained.report, 'cleanup'), false, 'retained bundle is not a parent-cleanup attestation');
});
