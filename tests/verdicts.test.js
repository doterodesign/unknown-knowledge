// UCS-947 expands the importable verdict seam. CLI coverage continues to pin
// rendering, exit codes, logging, and the individual concept/leaf/time rules.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { loadStores } from '../payload/engine/lib/load-stores.js';
import { computeVerdicts } from '../payload/engine/lib/verdicts.js';

const fixture = (name) => fileURLToPath(new URL(`fixtures/preflight/${name}`, import.meta.url));

test('callers can compute a concept verdict directly from a loaded Store', () => {
  const repoRoot = fixture('clean');
  const result = computeVerdicts(loadStores(repoRoot), { concepts: ['K-100'], repoRoot });
  assert.equal(result.storeVerdict, 'trusted');
  assert.deepEqual(result.verdicts.map(({ concept, verdict }) => [concept, verdict]), [['K-100', 'trusted']]);
  assert.deepEqual(result.leafVerdicts, []);
});
