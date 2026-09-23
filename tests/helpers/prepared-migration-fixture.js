import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { inventorySourceDocuments, rewriteIdentityCandidate } from '../../payload/engine/lib/identity-migration.js';

const gateLimits = { maxTreeEntries: 100, maxTreeBytes: 1000000, maxFileBytes: 100000,
  maxGitOutputBytes: 1000000, maxSourceDocuments: 20, maxRecords: 20, maxReferences: 50,
  maxAdjudications: 20, maxProseEdits: 20, maxInputBytes: 100000 };
export const limits = { maxRuntimeFiles: 1000, maxRuntimeBytes: 20000000, maxOutputBytesPerCheck: 1000000, maxCheckMilliseconds: 10000 };
export function fixture(t, format = 'sha1') {
  const base = fs.realpathSync(fs.mkdtempSync('/tmp/migration-runner-test-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const root = join(base, 'repo'); const evidence = join(base, 'evidence');
  fs.mkdirSync(root); fs.mkdirSync(evidence, { mode: 0o700 });
  const env = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' };
  const git = (...args) => { const r = spawnSync('/usr/bin/git', ['-C', root, ...args], { env, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr); return r.stdout.trim(); };
  const put = (file, bytes) => { fs.mkdirSync(dirname(join(root, file)), { recursive: true }); fs.writeFileSync(join(root, file), bytes); };
  git('init', '-q', `--object-format=${format}`); git('config', 'user.name', 'Fixture'); git('config', 'user.email', 'fixture@example.test');
  const documents = [{ file: 'decisions/_catalog.yaml', kind: 'catalog', bytes: Buffer.from(
    'schema-version: 1\nstore: decisions\nentries: [{id: D-9, title: Direction, file: pending-import}]\n') }];
  put(documents[0].file, documents[0].bytes); git('add', '.'); git('commit', '-qm', 'source');
  const descriptor = () => ({ commit: git('rev-parse', 'HEAD'), tree: git('rev-parse', 'HEAD^{tree}'), kitPath: '.' });
  const source = descriptor();
  const migrationInputs = { namespace: '11111111-1111-4111-8111-111111111111',
    publication: { id: '22222222-2222-4222-8222-222222222222', review: 'PRIVATE REVIEW MATERIAL' },
    proposals: [], declarations: inventorySourceDocuments(documents).records.map((r) => ({ source: r.key, disposition: 'allocate' })),
    adjudications: [], proseDecisions: [] };
  const targetVersions = { 'knowledge-leaf': 3, 'ontology-concept': 2, 'decision-entry': 2,
    catalog: 2, registry: 2, 'graduation-categories': 2, 'phoenix-event': 2, finding: 2, gap: 2, miss: 1 };
  const rewritten = rewriteIdentityCandidate(documents, { ...migrationInputs, targetVersions });
  assert.equal(rewritten.ok, true);
  for (const row of rewritten.files) put(row.file, row.bytes);
  put('_identity.yaml', JSON.stringify(rewritten.identity)); git('add', '.'); git('commit', '-qm', 'candidate');
  return { evidence, root, input: { repoRoot: root, source, candidate: descriptor(), operation: 'identity-migration',
    operationInputs: { migrationInputs, limits: gateLimits }, evidenceDirectory: evidence, limits } };
}
