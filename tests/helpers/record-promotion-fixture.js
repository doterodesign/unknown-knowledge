/** Actual committed Decision proposals shared by promotion integration tests. */
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { captureCommittedFile } from '../../payload/engine/lib/captured-source.js';

export const namespace = '11111111-1111-4111-8111-111111111111';
export const publication = { id: '22222222-2222-4222-8222-222222222222', review: 'review:initial' };
export const nextPublication = { id: '55555555-5555-4555-8555-555555555555', review: 'review:promotion' };
export const p1 = 'proposal:decision:33333333-3333-4333-8333-333333333333';
export const p2 = 'proposal:decision:44444444-4444-4444-8444-444444444444';
export const file = 'decisions/entries/direction.yaml';
const record = (id, status) => ({ id, title: 'Direction', category: 'architecture', status,
  date: '2026-09-19', deciders: ['steward'], context: 'Original π reasoning', decision: 'Retain evidence' });
export const limits = { maxFiles: 100, maxFileBytes: 100000, maxSourceBytes: 1000000, maxPromotions: 10 };

export function fixture(t, { format = 'sha1', edit = () => {}, ledgerText } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'record-promotion-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (key.startsWith('GIT_')) delete env[key];
  Object.assign(env, { GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' });
  const git = (...args) => execFileSync('/usr/bin/git', ['-C', root, ...args], { env });
  git('init', '-q', '-b', 'source', `--object-format=${format}`);
  git('config', 'user.name', 'Fixture'); git('config', 'user.email', 'fixture@example.test');
  const identity = { 'schema-version': 1, 'identity-format': 1, namespace,
    allocations: [{ kind: 'decision', id: 'D-000001', state: 'allocated', publication }] };
  const records = { 'schema-version': 2, entries: [record('D-000001', 'accepted'),
    { ...record(p2, 'proposed'), subjects: [], 'relates-to': { decisions: [p1] } }, record(p1, 'proposed')] };
  const catalog = { 'schema-version': 2, store: 'decisions', entries: records.entries.map(({ id }) =>
    ({ id, title: 'Direction', file: 'entries/direction.yaml' })) };
  const extras = {};
  edit({ identity, records, catalog, extras });
  const files = { '_identity.yaml': '# ledger comment\r\n' + JSON.stringify(identity, null, 2) + '\r\n',
    [file]: '# preserved π comment\r\n' + JSON.stringify(records, null, 2) + '\r\n',
    'decisions/_catalog.yaml': '# catalog comment\n' + JSON.stringify(catalog, null, 2) + '\n', ...extras };
  if (ledgerText) files['_identity.yaml'] = ledgerText(identity);
  for (const [name, bytes] of Object.entries(files)) {
    mkdirSync(dirname(join(root, name)), { recursive: true }); writeFileSync(join(root, name), bytes);
  }
  git('add', '.'); git('commit', '-qm', 'source');
  const commit = git('rev-parse', 'HEAD').toString().trim();
  const tree = git('rev-parse', 'HEAD^{tree}').toString().trim();
  const capture = captureCommittedFile({ repoRoot: root, commit, file });
  const input = () => ({ repoRoot: root, source: { commit, tree, kitPath: '.' },
    publication: { ...nextPublication }, selected: [[p2, 'D-000003'], [p1, 'D-000002']].map(([key, id]) => ({
      proposalRef: { namespace, kind: 'decision', key }, canonicalRef: { namespace, kind: 'decision', id },
      targetLifecycle: 'accepted', beforeCapture: structuredClone(capture.locator),
    })), limits: { ...limits } });
  return { root, git, input, files, identity, records, commit };
}

