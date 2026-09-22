/** Read-only Git capture for offline migration, separate from current lookup. */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, realpathSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inventorySourceDocuments } from './identity-migration.js';
import { UsageError } from './usage-error.js';
import { verifyCapturedBytes } from './captured-source.js';
import { YAMLException } from 'js-yaml';
import { parseSource, SourceDocumentError } from './yaml-source.js';

const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const ordinaryArtifacts = new Set(['knowledge/derived/index.json',
  'knowledge/derived/tree.domain-form.md', 'knowledge/derived/tree.form-domain.md']);
const rulesPath = /^(ontology|knowledge)\/_rules\.yaml$/;

/** Fixed non-rewritten roles; unknown rules never become an ignored file. */
function preservedRole(path, bytes) {
  if (ordinaryArtifacts.has(path)) return 'ordinary-generated-artifact';
  const match = rulesPath.exec(path);
  if (!match) return null;
  let value;
  try { ({ value } = parseSource({ file: path, kind: 'rules', bytes })); }
  catch (error) {
    if (error instanceof SourceDocumentError || error instanceof YAMLException) return null;
    throw error;
  }
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === 3 && value['schema-version'] === 1
    && value.store === match[1] && Array.isArray(value.rules) && value.rules.length === 0
    ? 'empty-store-rules' : null;
}

function sourceKind(path) {
  if (/^(ontology|knowledge|decisions)\/_catalog\.yaml$/.test(path)) return 'catalog';
  if (/^ontology\/classes\/[^/]+\.yaml$/.test(path)) return 'ontology-concept';
  if (/^decisions\/entries\/[^/]+\.yaml$/.test(path)) return 'decision-entry';
  if (/^decisions\/_registries\/graduation-categories\.yaml$/.test(path)) return 'graduation-categories';
  if (/^(ontology|knowledge|decisions)\/_registries\/[^/]+\.yaml$/.test(path)) return 'registry';
  if (/^knowledge\/_phoenix\/[^/]+\.yaml$/.test(path)) return 'phoenix-event';
  if (path.startsWith('knowledge/') && path.endsWith('.md') && !path.startsWith('knowledge/derived/')
    && path.slice('knowledge/'.length).split('/').every((part) => !part.startsWith('_'))) return 'knowledge-leaf';
  const log = /^logs\/(findings|gaps|misses)\/[^/]+\.yaml$/.exec(path);
  return log ? { findings: 'finding', gaps: 'gap', misses: 'miss' }[log[1]] : null;
}

/** Pin the installed implementation and parser, not a caller's claimed digest. */
export function migrationRuntimeDigest() {
  const payload = fileURLToPath(new URL('../../', import.meta.url));
  const files = [];
  function visit(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name < b.name ? -1 : 1)) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile()) files.push([relative(payload, path), hash(readFileSync(path))]);
      else throw new Error(`unsupported runtime file: ${path}`);
    }
  }
  visit(join(payload, 'engine'));
  visit(join(payload, 'schemas'));
  files.push(['package.json', hash(readFileSync(join(payload, 'package.json')))]);
  files.push(['js-yaml', hash(readFileSync(new URL(import.meta.resolve('js-yaml'))))]);
  return hash(JSON.stringify(files));
}

/** Capture only committed source records. No write-tree/index/checkout operation. */
export function inventoryCommittedSource({ repoRoot, commit, kitRoot, adjudications = [] }) {
  if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(commit ?? '')) throw new UsageError('--source requires a full lowercase commit object ID');
  if (!['.', 'unknown-knowledge'].includes(kitRoot)) throw new UsageError('--kit-root must explicitly name . or unknown-knowledge');
  const env = { ...process.env, GIT_NO_REPLACE_OBJECTS: '1', GIT_NO_LAZY_FETCH: '1', GIT_OPTIONAL_LOCKS: '0' };
  for (const key of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_COMMON_DIR']) delete env[key];
  const git = (...args) => {
    const result = spawnSync('git', ['-c', 'core.fsmonitor=false', '-C', repoRoot, ...args], { env, maxBuffer: 64 * 1024 * 1024 });
    if (result.status !== 0) throw new Error(`source capture: git ${args[0]} failed: ${result.error?.message ?? result.stderr.toString().trim()}`);
    return result.stdout;
  };
  if (realpathSync(repoRoot) !== realpathSync(git('rev-parse', '--show-toplevel').toString().trim())) throw new UsageError('--root must be the Git repository root');
  if (git('cat-file', '-t', commit).toString().trim() !== 'commit') throw new UsageError('--source must identify a commit object');
  const tree = git('rev-parse', `${commit}^{tree}`).toString().trim();
  const objectFormat = git('rev-parse', '--show-object-format').toString().trim();
  const listing = git('ls-tree', '-rz', '--full-tree', tree);
  const listingText = listing.toString('utf8');
  if (!Buffer.from(listingText).equals(listing)) throw new Error('source capture: non-UTF-8 Git paths are unsupported');
  const entries = listingText.split('\0').filter(Boolean).map((line) => {
    const tab = line.indexOf('\t');
    const [mode, type, oid] = line.slice(0, tab).split(' ');
    return { path: line.slice(tab + 1), mode, type, oid };
  });
  const prefix = kitRoot === '.' ? '' : `${kitRoot}/`;
  const selection = entries.find((entry) => entry.path === '.unknown-knowledge.json');
  if (selection) {
    if (selection.mode !== '100644' && selection.mode !== '100755') throw new Error('source capture: layout selection must be a regular file');
    const config = JSON.parse(git('cat-file', 'blob', selection.oid).toString());
    if (!config || Object.keys(config).length !== 1 || config.kitRoot !== kitRoot) throw new UsageError('--kit-root disagrees with committed .unknown-knowledge.json');
  }
  if (entries.some((entry) => entry.path === `${prefix}_identity.yaml`)) throw new UsageError('identity authority already present; source cutover is already applied or requires review');
  const documents = [];
  const files = [];
  const preservedFiles = [];
  const unclassifiedPaths = [];
  for (const entry of entries) {
    if (!entry.path.startsWith(prefix)) continue;
    const path = entry.path.slice(prefix.length);
    const kind = sourceKind(path);
    if (!kind && !ordinaryArtifacts.has(path) && !rulesPath.test(path)) {
      if (/^(?:ontology|knowledge|decisions|subjects|logs|reviews)\//.test(path) || /^(?:protocol|templates|hooks)\//.test(path) || path === 'suppressions.yaml') unclassifiedPaths.push(entry.path);
      continue;
    }
    if (entry.type !== 'blob' || !['100644', '100755'].includes(entry.mode)) throw new Error(`source capture: ${entry.path} must be a regular committed file`);
    const bytes = git('cat-file', 'blob', entry.oid);
    const locator = { file: entry.path, blob: entry.oid, sha256: hash(bytes), source: { commit, tree } };
    const verified = verifyCapturedBytes({ locator, bytes, objectFormat });
    if (!verified.ok) throw new Error(`source capture integrity failure: ${verified.diagnostics.map((row) => row.code).join(', ')}`);
    if (!kind) {
      const role = preservedRole(path, bytes);
      if (role) preservedFiles.push({ file: entry.path, role, blob: locator.blob, sha256: locator.sha256, mode: entry.mode });
      else unclassifiedPaths.push(entry.path);
      continue;
    }
    documents.push({ file: entry.path, kind, bytes });
    files.push({ file: entry.path, kind, blob: locator.blob, sha256: locator.sha256, mode: entry.mode });
  }
  if (documents.length === 0) throw new UsageError('no source store documents at the selected committed kit root');
  const inventory = inventorySourceDocuments(documents, { adjudications });
  return {
    ...inventory,
    source: { commit, tree, kitRoot },
    runtimeDigest: migrationRuntimeDigest(),
    files,
    preservedFiles,
    unclassifiedPaths,
    excludedLocalState: ['index', 'worktree', 'untracked'],
    publicationReady: false,
  };
}
