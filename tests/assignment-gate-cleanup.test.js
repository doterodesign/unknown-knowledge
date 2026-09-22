import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { typedAssignmentFixture } from './helpers/typed-assignment-fixture.js';
import { runAssignmentGate, runPreparedAssignmentGate } from '../payload/engine/lib/assignment-gate.js';

for (const prepared of [false, true]) {
  test(`${prepared ? 'prepared' : 'staged'} assignment revokes success after actual snapshot cleanup fails`, async t => {
    const f = typedAssignmentFixture(t);
    const create = fs.mkdtempSync; const remove = fs.rmSync;
    const roots = []; let injected = false;
    fs.mkdtempSync = (...args) => {
      const root = create(...args);
      if (/unknown-knowledge-(?:tree|commit)-/.test(String(args[0]))) roots.push(root);
      return root;
    };
    fs.rmSync = (path, options) => {
      remove(path, options);
      if (!injected && roots.length >= 1 && path === roots[0]) {
        injected = true;
        throw new Error('one-shot cleanup failure after the completed assignment callback');
      }
    };
    syncBuiltinESMExports();
    let result;
    try { result = prepared ? await runPreparedAssignmentGate(f.prepared) : await runAssignmentGate(f.options); }
    finally { fs.mkdtempSync = create; fs.rmSync = remove; syncBuiltinESMExports(); }
    assert.equal(injected, true);
    assert.equal(result.checks.authorizer.status, 'passed');
    assert.equal(result.checks.impactPolicy.status, 'passed', 'the actual gate completed before cleanup');
    assert.equal(result.ok, false, 'a later cleanup failure must revoke the previous success flag');
    assert.equal(result.publicationReady, false);
    assert.equal(result.checks.source.status, 'failed');
    assert.ok(result.diagnostics.some(row => row.code === 'assignment-snapshot-unavailable'
      && row.message.includes('snapshot cleanup failed')));
    for (const root of roots) assert.equal(fs.existsSync(root), false, 'the injected failure leaves no temporary snapshot');
  });
}
