import assert from 'node:assert/strict';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { semanticFixture } from './migration-semantic-fixture.js';
import { capturePreparedRuntime } from '../../payload/engine/lib/prepared-runtime.js';
import { inventoryCommittedSource } from '../../payload/engine/lib/identity-migration-source.js';
import { rewriteIdentityCandidate } from '../../payload/engine/lib/identity-migration.js';
import { installationAssets, installationDistribution } from '../../payload/engine/lib/migration-installation.js';

/** An actual installed runtime pair, not a caller's runtime label. */
export function installationFixture(t, options = {}) {
  const f = semanticFixture(t, { nested: true, history: true });
  f.git('checkout', '--detach', f.source.commit);
  const kit = join(f.root, f.source.kitPath);
  const old = resolve('payload/engine/compatibility/identity-migration-08066b5');
  const concept = join(kit, 'ontology/classes/100-feed.yaml');
  writeFileSync(concept, readFileSync(concept, 'utf8').replace('status: active', 'status: active\n    last-verified: "2000-01-01"'));
  for (const path of ['engine', 'schemas', 'package.json', 'node_modules']) cpSync(join(old, path), join(kit, path), { recursive: true });
  for (const asset of installationAssets.before) {
    const target = join(kit, asset.path); mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, Buffer.from(asset.base64, 'base64'));
  }
  writeFileSync(join(f.root, 'AGENTS.md'), `Keep client guidance unchanged.\n\n<!-- unknown-knowledge:begin -->\n${installationAssets.wrappers['wrappers/pointer.md'].before.replaceAll('{{root}}', 'unknown-knowledge').trimEnd()}\n<!-- unknown-knowledge:end -->\n`);
  writeFileSync(join(kit, 'kit.manifest.yaml'), 'schema-version: 1\nkit-version: "2.1.0"\n');
  mkdirSync(join(f.root, '.hooks'));
  writeFileSync(join(f.root, '.hooks/pre-commit'), '#!/bin/sh\nexec node unknown-knowledge/engine/commit-check.js --root .\n', { mode: 0o755 });
  writeFileSync(join(kit, 'ontology/_rules.yaml'), 'schema-version: 1\nstore: ontology\nrules:\n  - class: 100-feed\n    id-range: [K-100, K-199]\n');
  writeFileSync(join(kit, 'suppressions.yaml'), '- {term: K-102, sourcePath: K-102, reason: Reviewed retained staleness, date: "2026-08-19"}\n');
  options.before?.(f, kit);
  f.git('add', '.'); f.git('commit', '-qm', 'installed legacy runtime and operational consumers');
  f.source = { ...f.source, commit: f.git('rev-parse', 'HEAD'), tree: f.git('rev-parse', 'HEAD^{tree}') };
  const inventory = inventoryCommittedSource({ repoRoot: f.root, commit: f.source.commit, kitRoot: f.source.kitPath });
  const documents = inventory.files.map(row => ({ file: row.file, kind: row.kind, bytes: readFileSync(join(f.root, row.file)) }));
  const rewrite = rewriteIdentityCandidate(documents, { ...f.migrationInputs, targetVersions: {
    'knowledge-leaf': 3, 'ontology-concept': 2, 'decision-entry': 2, catalog: 2, registry: 2,
    'graduation-categories': 2, 'phoenix-event': 2, finding: 2, gap: 2, miss: 1 } });
  assert.equal(rewrite.ok, true, JSON.stringify(rewrite));
  for (const row of rewrite.files) writeFileSync(join(f.root, row.file), row.bytes);
  writeFileSync(join(kit, '_identity.yaml'), JSON.stringify(rewrite.identity));
  const work = join(f.base, 'distribution'); mkdirSync(work);
  capturePreparedRuntime(work, f.runtimeLimits, 'identity-migration');
  for (const path of ['engine', 'schemas', 'package.json', 'node_modules']) rmSync(join(kit, path), { recursive: true });
  for (const [path, bytes] of installationDistribution('candidate', { maxConsumerFiles: 4000, maxConsumerBytes: 50000000 })) {
    const target = join(kit, path); mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, bytes);
  }
  writeFileSync(join(f.root, 'AGENTS.md'), `Keep client guidance unchanged.\n\n<!-- unknown-knowledge:begin -->\n${readFileSync('payload/wrappers/pointer.md', 'utf8').replaceAll('{{root}}', 'unknown-knowledge').trimEnd()}\n<!-- unknown-knowledge:end -->\n`);
  writeFileSync(join(kit, 'ontology/_rules.yaml'), 'schema-version: 1\nstore: ontology\nrules:\n  - class: 100-feed\n');
  writeFileSync(join(kit, 'suppressions.yaml'), '- {term: O-000001, sourcePath: O-000001, reason: Reviewed retained staleness, date: "2026-08-19"}\n');
  options.after?.(f, kit);
  f.git('add', '.'); f.git('commit', '-qm', 'complete installed canonical pair');
  f.candidate = { ...f.candidate, commit: f.git('rev-parse', 'HEAD'), tree: f.git('rev-parse', 'HEAD^{tree}') };
  const role = (file, kind, disposition, bindings = []) => ({ file, role: kind, disposition,
    reason: 'Fixture independent semantic review only', edits: [], bindings });
  f.migrationInputs.installation = { version: 1, roles: [
    role('src/feed/latency.ts', 'non-consumer', 'preserve'),
    role('unknown-knowledge/kit.manifest.yaml', 'seed-provenance', 'preserve'),
    role('unknown-knowledge/ontology/_rules.yaml', 'ontology-rules', 'retire-ranges'),
    role('unknown-knowledge/suppressions.yaml', 'suppressions', 'rewrite', [{ index: 0, kind: 'stale-concept',
      source: inventory.records.find(row => row.kind === 'ontology' && row.id === 'K-102').key }]),
    role('.hooks/pre-commit', 'launcher', 'preserve'),
    role('AGENTS.md', 'seeded-wrapper', 'rewrite'),
  ], launches: [{ file: '.hooks/pre-commit', form: 'shell-node' }, { file: 'AGENTS.md', form: 'seeded-wrapper' }],
  limits: { maxConsumerFiles: 4000, maxConsumerBytes: 50000000, maxConsumerEdits: 1000, maxActivationEdges: 100, maxReviewBytes: 3000000 } };
  options.roles?.(f.migrationInputs.installation, inventory);
  f.limits = { ...f.limits, maxTreeEntries: 4000, maxTreeBytes: 50000000, maxFileBytes: 1000000,
    maxGitOutputBytes: 50000000, maxInputBytes: 3000000 };
  return f;
}
