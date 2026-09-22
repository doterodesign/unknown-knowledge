import assert from 'node:assert/strict';
import { test } from 'node:test';
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { EngineRefusal } from '../payload/engine/lib/engine-refusal.js';
import { executePreparedEngineCheck } from '../payload/engine/lib/prepared-engine-process.js';

const manifest = { executables: { node: { path: process.execPath } } };
const limits = { maxCheckMilliseconds: 1000, maxOutputBytesPerCheck: 1000 };
const ordinary = { kind: 'ordinary-historical', root: '/fixed-source', today: '2026-09-12' };

test('unsupported selectors, executable overrides and flag-shaped queries refuse before spawning', async (t) => {
  const original = childProcess.spawn; let attempted = 0;
  childProcess.spawn = () => { attempted += 1; throw new Error('unexpected spawn'); };
  syncBuiltinESMExports();
  t.after(() => { childProcess.spawn = original; syncBuiltinESMExports(); });
  for (const check of [
    { kind: '../unapproved', root: '/fixed-source' },
    { kind: 'structural', root: '/fixed-source', executable: '/unapproved' },
    { ...ordinary, request: { kind: 'query', value: '--doc=/outside-scope' } },
    { ...ordinary, request: { kind: 'query', value: '--root=/outside-scope' } },
    { ...ordinary, request: { kind: 'document', value: '../../unapproved.md' } },
  ]) await assert.rejects(executePreparedEngineCheck('/captured-runtime', manifest, limits, check), EngineRefusal);
  assert.equal(attempted, 0);
});

test('flag-shaped authored path is carried as one literal flag value, in the existing process group', async (t) => {
  const original = childProcess.spawn; let observed; const stopped = new Error('observed only');
  childProcess.spawn = (...args) => { observed = args; throw stopped; };
  syncBuiltinESMExports();
  t.after(() => { childProcess.spawn = original; syncBuiltinESMExports(); });
  await assert.rejects(executePreparedEngineCheck('/captured-runtime', manifest, limits,
    { ...ordinary, request: { kind: 'path', value: '--doc=outside.md' } }), (error) => error === stopped);
  assert.equal(observed[0], process.execPath);
  assert.deepEqual(observed[1], ['/captured-runtime/engine/compatibility/identity-migration-08066b5/engine/resolve.js',
    '--json', '--root', '/fixed-source', '--today', '2026-09-12', '--path=--doc=outside.md']);
  assert.equal(Object.hasOwn(observed[2], 'detached'), false);
  assert.equal(Object.hasOwn(observed[2], 'shell'), false);
});
