/** Actual committed K/O proposals; byte-planner evidence, not review approval. */
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { captureCommittedFile } from '../../payload/engine/lib/captured-source.js';
import { namespace, publication, nextPublication, limits } from './record-promotion-fixture.js';

export { namespace };
export function typedPromotionFixture(t, { kind = 'ontology', format = 'sha1', kitPath = '.', edit = () => {}, editFiles = () => {} } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'typed-promotion-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (key.startsWith('GIT_')) delete env[key];
  Object.assign(env, { GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' });
  const git = (...args) => execFileSync('/usr/bin/git', ['-C', root, ...args], { env });
  git('init', '-q', '-b', 'source', `--object-format=${format}`);
  git('config', 'user.name', 'Fixture'); git('config', 'user.email', 'fixture@example.test');
  const prefix = kind === 'ontology' ? 'O' : 'K';
  const proposals = ['33333333-3333-4333-8333-333333333333', '44444444-4444-4444-8444-444444444444']
    .map((uuid) => `proposal:${kind}:${uuid}`);
  const ids = [`${prefix}-000002`, `${prefix}-000003`];
  const filenames = kind === 'ontology' ? ['ontology/classes/material.yaml', 'ontology/classes/material.yaml']
    : ['knowledge/research/first.md', 'knowledge/research/second.md'];
  const records = kind === 'ontology' ? [
    { id: `${prefix}-000001`, term: 'Original', class: 'material', summary: 'Unchanged sibling', status: 'active' },
    ...proposals.map((id, i) => ({ id, term: `Material ${i}`, class: 'material', summary: 'Evidence π',
      status: i ? 'proposed' : 'draft', 'source-of-truth': ['src/anchor.txt'], 'last-verified': '2026-09-01',
      ...(i ? { subjects: [], 'used-by': [proposals[0]], 'confusable-with': [proposals[0]] } : {}) })),
  ] : proposals.map((id, i) => ({ 'schema-version': 3, id, domain: 'research', heading: `Evidence ${i}`,
    citations: [{ source: 'https://example.test/retained-source', accessed: '2026-09-01' }],
    facets: { stage: i ? 'proposed' : 'draft' }, verified: '2026-09-01', volatility: 'stable', edition: 1,
    provenance: { author: 'steward', 'skill-version': 'fixture-v1' },
    ...(i ? { subjects: [], relates: { 'depends-on': [proposals[0]], 'see-also': [proposals[0]],
      contradicts: [proposals[0]], supersedes: [proposals[0]] },
      'cross-references': { 'see-also': [proposals[0]], 'class-elsewhere': [proposals[0]] } } : {}) }));
  const identity = { 'schema-version': 1, 'identity-format': 1, namespace,
    allocations: [{ kind: 'decision', id: 'D-000001', state: 'allocated', publication },
      { kind, id: `${prefix}-000001`, state: 'allocated', publication }] };
  const authorizer = { id: 'D-000001', title: 'Retained direction', category: 'architecture', status: 'accepted',
    date: '2026-09-01', deciders: ['steward'], context: 'Original reasoning', decision: 'Keep evidence' };
  const catalog = { 'schema-version': 2, store: kind, entries: records.map((record, i) => ({ id: record.id,
    title: 'Material', file: kind === 'ontology' ? 'classes/material.yaml' : filenames[i].slice('knowledge/'.length) })) };
  const extras = {};
  edit({ records, catalog, identity, extras, proposals, authorizer });
  const json = (value) => JSON.stringify(value, null, 2);
  const files = { '_identity.yaml': '# original ledger\r\n' + json(identity) + '\r\n',
    'decisions/entries/authority.yaml': json({ 'schema-version': 2, entries: [authorizer] }) + '\n',
    'decisions/_catalog.yaml': json({ 'schema-version': 2, store: 'decisions', entries: [
      { id: authorizer.id, title: authorizer.title, file: 'entries/authority.yaml' }] }) + '\n',
    [`${kind}/_catalog.yaml`]: '# catalog π\r\n' + json(catalog) + '\r\n',
    [`${kind}/_rules.yaml`]: json({ 'schema-version': 1, store: kind, rules: [] }) + '\n' };
  if (kind === 'ontology') files[filenames[0]] = '# sibling bytes stay exact\r\n' + json({ 'schema-version': 2, entries: records }) + '\r\n';
  else {
    records.forEach((record, i) => { files[filenames[i]] = '\uFEFF---\r\n# original frontmatter π\r\n' + json(record)
      + '\r\n---\r\n\r\n# Retained body\r\nOriginal café evidence.\r\n'; });
    files['knowledge/_registries/stage.yaml'] = json({ 'schema-version': 2, store: 'knowledge', registry: 'stage',
      values: ['draft', 'proposed', 'verified'].map((value) => ({ value, warrant: 'Fixture lifecycle material', decision: authorizer.id })) }) + '\n';
  }
  Object.assign(files, extras);
  editFiles(files);
  const kitRoot = join(root, kitPath);
  for (const [file, bytes] of Object.entries(files)) {
    mkdirSync(dirname(join(kitRoot, file)), { recursive: true }); writeFileSync(join(kitRoot, file), bytes);
  }
  chmodSync(join(kitRoot, filenames[0]), 0o755);
  mkdirSync(join(root, 'src'), { recursive: true }); writeFileSync(join(root, 'src/anchor.txt'), 'actual artifact\n');
  if (kitPath !== '.') writeFileSync(join(root, '.unknown-knowledge.json'), JSON.stringify({ kitRoot: kitPath }));
  git('add', '.'); git('commit', '-qm', 'Typed proposal source');
  const commit = git('rev-parse', 'HEAD').toString().trim(); const tree = git('rev-parse', 'HEAD^{tree}').toString().trim();
  const repoFile = (file) => kitPath === '.' ? file : `${kitPath}/${file}`;
  const input = () => ({ version: 1, kind, repoRoot: root, source: { commit, tree, kitPath }, publication: { ...nextPublication },
    selected: proposals.map((key, i) => ({ proposalRef: { namespace, kind, key }, canonicalRef: { namespace, kind, id: ids[i] },
      targetLifecycle: kind === 'ontology' ? 'active' : 'verified',
      beforeCapture: captureCommittedFile({ repoRoot: root, commit, file: repoFile(filenames[i]) }).locator })).reverse(), limits: { ...limits } });
  return { root, kitRoot, kitPath, git, input, files, filenames, repoFile, records, identity, proposals, ids, commit };
}
