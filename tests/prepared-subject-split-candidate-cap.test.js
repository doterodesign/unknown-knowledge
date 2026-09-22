import test from 'node:test';
import assert from 'node:assert/strict';
import { subjectSplitAssignmentFixture } from './helpers/subject-split-assignment-fixture.js';
import { runPreparedSubjectSplitGate } from '../payload/engine/lib/subject-split-gate.js';
import { subjectSplitInputWire } from '../payload/engine/lib/subject-split-input.js';
import { withTreeSnapshot } from '../payload/engine/lib/commit-snapshot.js';
import { capturePreparedSubjectSplit } from '../payload/engine/lib/prepared-subject-split.js';

test('candidate identity capacity does not impose a new cap on original evidence', async t => {
  const f = subjectSplitAssignmentFixture(t, { zero: true, beforeChange(h) {
    h.put('_identity.yaml', `# ${'x'.repeat(32768)}\n${h.read('_identity.yaml')}`);
  } });
  const gate = await runPreparedSubjectSplitGate(f.input);
  assert.equal(gate.ok, true, JSON.stringify(gate.diagnostics));
  const gateInput = subjectSplitInputWire(f.input);
  const identity = Buffer.from(f.read('_identity.yaml'));
  const original = gateInput.evidence.assessmentCaptures.find(pair =>
    pair.identity.capture.source.commit === f.input.before.commit);
  assert.ok(original);
  assert.ok(Buffer.from(original.identity.bytesBase64, 'base64').length > identity.length);
  await withTreeSnapshot(f.root, f.input.candidate.tree, ({ root }) => {
    const request = { root, source: f.input.before, candidate: f.input.candidate, gate, gateInput,
      captureLimits: { maxRegistryBytes: Buffer.byteLength(f.read('subjects/registry.yaml')),
        maxIdentityBytes: identity.length, maxEventBytes: 1 } };
    assert.deepEqual(capturePreparedSubjectSplit(request).identity, identity);
    assert.throws(() => capturePreparedSubjectSplit({ ...request,
      captureLimits: { ...request.captureLimits, maxIdentityBytes: identity.length - 1 } }), /prepared subject split/);
  });
});
