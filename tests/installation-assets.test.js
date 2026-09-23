import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { loadManifest, expandManifest } from '../cli/lib/copy-payload.js';
import { installationAssets } from '../payload/engine/lib/migration-installation.js';
import { rawSha256 } from '../payload/engine/lib/prepared-evidence.js';

test('installation asset policy matches actual unconditional manifest and immutable historical source', () => {
  // Original Git-blob equality was verified when freezing this policy. Pin those
  // exact bytes without requiring historical objects in a shallow CI checkout.
  assert.equal(rawSha256(readFileSync('payload/engine/policies/installation-assets.json')),
    '72d5861ce17a81a0652a72b246f6a89de731dadfa40f73533f36ea244bde23fb');
  assert.equal(installationAssets.sourceCommit, '08066b5f527b9d7d9705a3367bc26dcf080271ad');
  const root = resolve('.'), manifest = loadManifest(root);
  const selected = structuredClone(manifest);
  selected.sections.unconditional = Object.fromEntries(['protocol', 'hooks', 'templates', 'docs'].map(key => [key, manifest.sections.unconditional[key]]));
  selected.rootFiles = [];
  const actual = expandManifest(selected).map(row => ({ path: row.to, source: relative(resolve('payload'), row.from) }));
  assert.deepEqual(installationAssets.candidate, actual);
  for (const row of installationAssets.before) {
    const original = Buffer.from(row.base64, 'base64');
    assert.equal(row.sha256, rawSha256(original));
  }
  for (const [path, row] of Object.entries(installationAssets.wrappers)) {
    assert(row.before.includes('{{root}}/protocol/AGENTS.md'));
    assert(readFileSync(resolve('payload', path)).length > 0);
  }
});
