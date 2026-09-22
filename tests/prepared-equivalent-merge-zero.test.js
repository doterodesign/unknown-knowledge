import test from 'node:test';
import assert from 'node:assert/strict';
import { equivalentMergeZeroReviewFixture, finalEquivalentMergeZeroFixture } from './helpers/equivalent-merge-zero-fixture.js';
import { recordApprovedCandidateReview } from '../payload/engine/lib/candidate-review.js';
import { publishPreparedCandidate } from '../payload/engine/lib/publish-prepared-candidate.js';
import { capturePreparedEquivalentMerge } from '../payload/engine/lib/prepared-equivalent-merge.js';
import { runFinalPreparedEquivalentMergeGate } from '../payload/engine/lib/final-prepared-equivalent-merge.js';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';

test('actual eventless merge runner final review and candidate-ref publication', async t => {
  const f = await equivalentMergeZeroReviewFixture(t);
  assert.equal(f.final.status, 'passed');
  assert.equal(f.final.gate.version, 3);
  assert.equal(f.final.gate.sources.assignmentEvent, null);
  assert.equal(f.retained.artifacts.some(row => row.file === 'checks/operation/event.yaml'), false);
  const saved = await recordApprovedCandidateReview(f.writer());
  assert.equal(saved.status, 'retained', JSON.stringify(saved));
  const published = await publishPreparedCandidate(f.publisher(saved));
  assert.equal(published.status, 'published', JSON.stringify(published));
  assert.equal(f.git('rev-parse', f.request.publish.outputRef), f.candidate.commit);
  const size = f.capture(f.candidate, 'subjects/registry.yaml').bytes.length;
  const captureInput = { root: f.root, source: f.source, candidate: f.candidate, gate: f.gate,
    gateInput: f.operationInputs.gateInput, captureLimits: { maxRegistryBytes: size, maxEventBytes: 1 } };
  const exact = capturePreparedEquivalentMerge(captureInput);
  assert.equal(exact.registry.length, size);
  assert.equal(exact.event, null);
  assert.throws(() => capturePreparedEquivalentMerge({ ...captureInput,
    captureLimits: { ...captureInput.captureLimits, maxRegistryBytes: size - 1 } }), /capture unavailable|capacity|byte limit/);
});

test('zero parent rejects a broken event symlink rather than retaining an absent event claim', async t => {
  const original = fs.lstatSync;
  let injected = false;
  fs.lstatSync = (path, ...args) => {
    if (!injected && /prepared-validation-[^/]+\/operation\.event$/.test(String(path))) {
      injected = true; fs.symlinkSync('absent-merge-event-target', path);
    }
    return original(path, ...args);
  };
  syncBuiltinESMExports();
  try {
    await assert.rejects(finalEquivalentMergeZeroFixture(t), /equivalent merge unexpected event capture/);
  } finally { fs.lstatSync = original; syncBuiltinESMExports(); }
  assert.equal(injected, true);
});

test('fresh final cleanup failure revokes eventless success after actual proof', async t => {
  const f = await finalEquivalentMergeZeroFixture(t), remove = fs.rmSync;
  let injected = false;
  fs.rmSync = (path, options) => {
    remove(path, options);
    if (!injected && /\/final-equivalent-merge-[^/]+$/.test(String(path))) {
      injected = true; const error = new Error('actual final cleanup fault'); error.code = 'EACCES'; error.errno = -13; throw error;
    }
  };
  syncBuiltinESMExports();
  let result;
  try { result = await runFinalPreparedEquivalentMergeGate(f.finalInput); }
  finally { fs.rmSync = remove; syncBuiltinESMExports(); }
  assert.equal(injected, true);
  assert.equal(result.gate.ok, true);
  assert.equal(result.status, 'failed');
  assert.equal(result.diagnostics.at(-1).code, 'merge-cleanup-failed');
});
