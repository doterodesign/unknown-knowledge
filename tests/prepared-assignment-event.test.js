import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { join } from 'node:path';
import { assignmentGateFixture } from './helpers/assignment-gate-fixture.js';
import { assignmentEventDigest } from '../payload/engine/lib/assignment-event.js';
import { withTreeSnapshot } from '../payload/engine/lib/commit-snapshot.js';
import { capturePreparedAssignmentEvent } from '../payload/engine/lib/prepared-assignment-event.js';

async function captured(t, fn) {
  const f = assignmentGateFixture(t);
  const tree = f.git('write-tree'); const commit = f.git('commit-tree', tree, '-p', f.commit, '-m', 'candidate');
  const source = { commit: f.commit, tree: f.tree, kitPath: '.' }; const candidate = { commit, tree, kitPath: '.' };
  const eventId = f.options.eventId; const file = `subjects/_assignments/${eventId}.yaml`;
  const gate = { mode: 'read-only-prepared-assignment', inputs: { before: { kind: 'commit', ...source }, candidate: { kind: 'commit', ...candidate } },
    checks: { source: { status: 'passed' }, history: { status: 'passed' } },
    eventSource: { file, eventId, eventDigest: assignmentEventDigest(f.event), candidate } };
  await withTreeSnapshot(f.root, tree, ({ root }) => fn({ root, file, gate, input: { root, source, candidate, eventId, maxEventBytes: 100000, gate } }));
}
test('actual candidate snapshot event retains exact bytes and binds full source hint', async (t) => {
  await captured(t, ({ root, file, gate, input }) => {
    const bytes = fs.readFileSync(join(root, file));
    const result = capturePreparedAssignmentEvent({ ...input, maxEventBytes: bytes.length });
    assert.deepEqual(result, { eventSource: gate.eventSource, bytes });
  });
});
test('missing/mismatched selection and tiny cap never return partial bytes or allocate a read', async (t) => {
  await captured(t, ({ input }) => {
    for (const edit of [
      (g) => { g.eventSource = null; }, (g) => { g.eventSource.file = 'other.yaml'; },
      (g) => { g.eventSource.eventDigest = '0'.repeat(64); }, (g) => { g.eventSource.candidate.tree = '0'.repeat(40); },
      (g) => { g.checks.history.status = 'failed'; }, (g) => { g.inputs.candidate.commit = '0'.repeat(40); },
    ]) {
      const gate = structuredClone(input.gate); edit(gate);
      assert.equal(capturePreparedAssignmentEvent({ ...input, gate }), null);
    }
    const original = fs.readSync; let reads = 0;
    fs.readSync = (...args) => { reads++; return original(...args); }; syncBuiltinESMExports();
    try { assert.equal(capturePreparedAssignmentEvent({ ...input, maxEventBytes: 1 }), null); }
    finally { fs.readSync = original; syncBuiltinESMExports(); }
    assert.equal(reads, 0);
  });
});
test('malformed bytes, symlink sources and changed event bodies refuse capture', async (t) => {
  await captured(t, ({ root, file, input }) => {
    const path = join(root, file); const original = fs.readFileSync(path);
    for (const bytes of [Buffer.from([0xff]), Buffer.from('event: [unclosed'), Buffer.from('event: wrong')]) {
      fs.writeFileSync(path, bytes); assert.equal(capturePreparedAssignmentEvent(input), null);
    }
    fs.writeFileSync(path, original); fs.renameSync(path, `${path}.actual`); fs.symlinkSync(`${path}.actual`, path);
    assert.equal(capturePreparedAssignmentEvent(input), null);
  });
});
