import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { inventoryCommittedSource } from '../../payload/engine/lib/identity-migration-source.js';
import { rewriteIdentityCandidate } from '../../payload/engine/lib/identity-migration.js';

export function semanticFixture(t, { nested = false, logs = false, history = false, amendSource, amendCandidate } = {}) {
  const base = realpathSync(mkdtempSync('/tmp/migration-semantic-')); t.after(() => rmSync(base, { recursive: true, force: true }));
  const root = join(base, 'repo'); const kitPath = nested ? 'unknown-knowledge' : '.'; const kit = join(root, kitPath);
  cpSync(resolve('tests/fixtures/migration-08066b5'), kit, { recursive: true });
  if (nested) renameSync(join(kit, 'src'), join(root, 'src'));
  // A distinct real source installation with all effective records; immutable historical fixture stays untouched.
  for (const file of ['knowledge/design-system/component-render-budget.md', 'knowledge/engineering/visual-regression-triage-playbook.md']) {
    const draft = join(kit, file);
    writeFileSync(draft, readFileSync(draft, 'utf8').replace('stage: draft', 'stage: verified'));
  }
  const related = join(kit, 'knowledge/design-system/component-render-budget.md');
  writeFileSync(related, readFileSync(related, 'utf8').replace('operations: [add-component]',
    'concepts: [K-102]\npaths: [src/feed/latency.ts]\nrelates:\n  see-also: [L-000117]\n  supersedes: [L-000117]\noperations: [add-component]'));
  if (logs) {
    mkdirSync(join(kit, 'logs/findings'), { recursive: true });
    writeFileSync(join(kit, 'logs/findings/source.yaml'), 'schema-version: 1\nconsulted: {concepts: [], leaves: []}\n');
  }
  if (history) {
    mkdirSync(join(kit, 'knowledge/_phoenix'), { recursive: true });
    writeFileSync(join(kit, 'knowledge/_phoenix/P-001.yaml'), `schema-version: 1
event: P-001
title: Retained classification history
decision: D-401
applied: "2026-08-17"
scope: {facet: facets.domain, values: [design-system]}
leaves:
  - {id: L-000213, to: design-system/components, why: Component material moved into its narrower domain.}
  - {id: L-000117, why: This leaf was reviewed and carried forward.}
`);
    writeFileSync(related, readFileSync(related, 'utf8').replace('edition: 1', 'edition: 2'));
    for (const kind of ['findings', 'gaps', 'misses']) mkdirSync(join(kit, 'logs', kind), { recursive: true });
    writeFileSync(join(kit, 'logs/findings/history.yaml'), `schema-version: 1
date: "2026-08-18"
trigger: retrieval-miss
summary: src/feed/latency.ts
consulted: {concepts: [K-102], leaves: [L-000213, L-000117]}
residue: [unmatched]
resolved-context: [add-component, K-102]
status: resolved
verified: "2026-08-19"
occurrences: ["2026-08-18"]
`);
    writeFileSync(join(kit, 'logs/gaps/history.yaml'), `schema-version: 1
date: "2026-08-18"
summary: src/feed/latency.ts
consulted: {concepts: [K-102], leaves: [L-000117]}
status: rejected
reason: The retained source path remains the agreed boundary.
`);
    writeFileSync(join(kit, 'logs/misses/history.yaml'), `schema-version: 1
date: "2026-08-18"
path: src/feed/latency.ts
shape: Function-local table
status: open
`);
  }
  amendSource?.(kit);
  const git = (...args) => { const r = spawnSync('/usr/bin/git', ['-C', root, ...args], { encoding: 'utf8',
    env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' } }); assert.equal(r.status, 0, r.stderr); return r.stdout.trim(); };
  git('init', '-q'); git('config', 'user.name', 'Fixture'); git('config', 'user.email', 'fixture@example.test');
  git('add', '.'); git('commit', '-qm', 'actual legacy source');
  const capture = () => ({ commit: git('rev-parse', 'HEAD'), tree: git('rev-parse', 'HEAD^{tree}'), kitPath });
  const source = capture(); const inventory = inventoryCommittedSource({ repoRoot: root, commit: source.commit, kitRoot: kitPath });
  assert.equal(inventory.ok, true); assert.deepEqual(inventory.unclassifiedPaths, []);
  const documents = inventory.files.map((row) => ({ file: row.file, kind: row.kind, bytes: readFileSync(join(root, row.file)) }));
  const migrationInputs = { namespace: '11111111-1111-4111-8111-111111111111',
    publication: { id: '22222222-2222-4222-8222-222222222222', review: 'PRIVATE semantic migration review' },
    proposals: [], declarations: [], adjudications: [], proseDecisions: inventory.reviewRequired.map((row) => ({ file: row.file, path: row.path,
      action: 'preserve', classification: 'non-operational-evidence', review: 'PRIVATE historical evidence review' })) };
  if (history) {
    const file = `${nested ? 'unknown-knowledge/' : ''}logs/findings/history.yaml`;
    const choice = migrationInputs.proseDecisions.find((row) => row.file === file && row.path[0] === 'resolved-context');
    const hint = inventory.reviewRequired.find((row) => row.file === file && row.path[0] === 'resolved-context');
    const sourceRecord = inventory.records.find((row) => row.kind === 'ontology' && row.id === 'K-102');
    assert(choice && hint && sourceRecord);
    delete choice.classification;
    choice.action = 'rewrite';
    choice.edits = [{ source: sourceRecord.key, expected: 'K-102', start: hint.span.start, end: hint.span.end }];
  }
  const targetVersions = { 'knowledge-leaf': 3, 'ontology-concept': 2, 'decision-entry': 2,
    catalog: 2, registry: 2, 'graduation-categories': 2, 'phoenix-event': 2, finding: 2, gap: 2, miss: 1 };
  const rewrite = rewriteIdentityCandidate(documents, { ...migrationInputs, targetVersions }); assert.equal(rewrite.ok, true, JSON.stringify(rewrite));
  for (const row of rewrite.files) writeFileSync(join(root, row.file), row.bytes);
  writeFileSync(join(kit, '_identity.yaml'), JSON.stringify(rewrite.identity));
  amendCandidate?.(kit);
  git('add', '.'); git('commit', '-qm', 'prepared identity candidate');
  const evidenceDirectory = join(base, 'evidence'); mkdirSync(evidenceDirectory, { mode: 0o700 });
  return { base, root, git, evidenceDirectory, source, candidate: capture(), migrationInputs,
    limits: { maxTreeEntries: 100, maxTreeBytes: 1000000, maxFileBytes: 100000, maxGitOutputBytes: 1000000,
      maxSourceDocuments: 100, maxRecords: 100, maxReferences: 500, maxAdjudications: 100, maxProseEdits: 100, maxInputBytes: 100000 },
    semantic: { today: '2026-09-01', requiredAdapters: ['md@1', 'txt@1'], limits: { maxCases: 500, maxInventoryBytes: 100000, maxGeneratedBytes: 1000000 } },
    runtimeLimits: { maxRuntimeFiles: 1500, maxRuntimeBytes: 30000000, maxOutputBytesPerCheck: 5000000, maxCheckMilliseconds: 60000 } };
}
