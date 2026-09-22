import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { preparedOperationEntrypoint } from '../payload/engine/lib/prepared-validation-policy.js';

export const splitPolicy = { id: 'subject-split-publication-v1', version: 1, impactPolicy: 'subject-split-impact-v1',
  requiredImpact: ['reach', 'subjectTree', 'representativeReplays', 'routes'], routeEvidence: 'runtime-capability' };

test('split registers only its fixed real prepared entrypoint and separate publication policy', () => {
  assert.deepEqual(preparedOperationEntrypoint('subject-split'), { id: 'operation', path: 'engine/lib/prepared-subject-split-check.js' });
  assert.equal(preparedOperationEntrypoint('split'), null);
  const policy = JSON.parse(readFileSync(new URL('../payload/engine/policies/candidate-publication.json', import.meta.url)));
  assert.deepEqual(policy.operations['subject-split'], splitPolicy);
});

test('actual runtime capture requires both real split workers', async t => {
  const fs = (await import('node:fs')).default;
  const { syncBuiltinESMExports } = await import('node:module');
  const { join } = await import('node:path');
  const { tmpdir } = await import('node:os');
  const { capturePreparedRuntime } = await import('../payload/engine/lib/prepared-runtime.js');
  const original = fs.readdirSync;
  for (const missing of ['prepared-subject-split-check.js', 'final-subject-split-check.js']) {
    const work = fs.mkdtempSync(join(tmpdir(), 'split-runtime-absence-')); t.after(() => fs.rmSync(work, { recursive: true, force: true }));
    let removed = false;
    fs.readdirSync = (path, ...args) => {
      const values = original(path, ...args);
      if (String(path).endsWith('/payload/engine/lib')) { removed = values.includes(missing); return values.filter(value => value !== missing); }
      return values;
    };
    syncBuiltinESMExports();
    try {
      assert.throws(() => capturePreparedRuntime(work, { maxRuntimeFiles: 3000, maxRuntimeBytes: 30000000, maxCheckMilliseconds: 60000 }, 'subject-split'), /split support is missing/);
      assert.equal(removed, true);
    } finally { fs.readdirSync = original; syncBuiltinESMExports(); }
  }
});
