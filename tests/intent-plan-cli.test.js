import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateIntentPlan } from '../payload/engine/lib/intent-plan.js';

const cli = fileURLToPath(new URL('../payload/engine/intent-plan.js', import.meta.url));
const run = (...args) => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });
function fixture(t, value) {
  const dir = mkdtempSync(join(tmpdir(), 'uk-intent-plan-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const file = join(dir, 'plan.json');
  writeFileSync(file, JSON.stringify(value));
  return file;
}
const request = () => ({
  version: 1, inputRef: 'synthetic:country', inventoryStatus: 'open',
  units: [{ key: 'country', sourceRef: 'request:country', disposition: 'unresolved' }],
  bindings: [], constraints: [], branches: [],
  requirements: [{ key: 'scope', unitKeys: ['country'], description: 'Preserve country limits in cited evidence.' }],
  clarifications: [{ key: 'which', unitKeys: ['country'], prompt: 'Which country is intended?' }],
});

test('invalid declared plan exits 2 with no handoff, not a clean result', (t) => {
  const value = request();
  value.units = [];
  const r = run(fixture(t, value), '--json');
  assert.equal(r.status, 2, r.stderr);
  assert.equal(JSON.parse(r.stdout).handoff, null);
});

test('real CLI matches domain result, preserves file, and labels open inventory', (t) => {
  const value = request();
  const file = fixture(t, value);
  const before = readFileSync(file);
  const r = run(file, '--json');
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(JSON.parse(r.stdout), validateIntentPlan(value));
  assert.equal(JSON.parse(r.stdout).readiness, 'inventory-open');
  assert.equal(r.stdout, run(file, '--json').stdout);
  assert.deepEqual(readFileSync(file), before);
  const human = run(file);
  assert.equal(human.status, 0, human.stderr);
  assert.match(human.stdout, /declared-inventory-only/);
  assert.match(human.stdout, /query validation: not-run/);
  assert.match(human.stdout, /target validation: not-run/);
  assert.match(human.stdout, /country limits/);
  assert.match(human.stdout, /unresolved/);
});

test('JSON syntax, read, usage and unexpected flags fail before handoff', (t) => {
  const file = fixture(t, {});
  writeFileSync(file, '{not json');
  for (const args of [[file, '--json'], [file + '.missing', '--json'], [], [file, 'second'], [file, '--execute'], [file, '--json=true']]) {
    const r = run(...args);
    assert.equal(r.status, 2, JSON.stringify(args));
    assert.equal(r.stdout, '');
    assert.ok(r.stderr.length > 0);
  }
});
