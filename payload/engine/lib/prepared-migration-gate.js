/** Mechanical prepared-commit migration checks; no publication or retained crosswalk. */
import { spawnSync } from 'node:child_process';
import { relative } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { readCommittedTree, changedTreePaths, withTreeSnapshot } from './commit-snapshot.js';
import { captureCommittedFile, describeCandidateBytes } from './captured-source.js';
import { isCaptureLocator } from './capture-locator.js';
import { canonicalSha256 } from './canonical-json.js';
import { inventoryCommittedSource } from './identity-migration-source.js';
import { rewriteIdentityCandidate } from './identity-migration.js';
import { isIdentityUuid } from './record-identity.js';
import { EngineRefusal, rethrowIfBug } from './engine-refusal.js';
import { UsageError } from './usage-error.js';
import { loadStores } from './load-stores.js';
import { locateKitRoot } from './kit-root.js';
import { runChecks } from '../commands/validate.js';
import { validateValues } from '../commands/validate-values.js';
import { InstallationRefusal, validInstallationInput, planInstallationCutover } from './migration-installation.js';

const limitKeys = ['maxTreeEntries', 'maxTreeBytes', 'maxFileBytes', 'maxGitOutputBytes',
  'maxSourceDocuments', 'maxRecords', 'maxReferences', 'maxAdjudications', 'maxProseEdits', 'maxInputBytes'];
const checkIds = ['input', 'committed-pair', 'source-layout', 'candidate-layout', 'source-inventory',
  'rewrite', 'candidate-preservation', 'candidate-ledger', 'candidate-structural', 'candidate-values', 'temporary-disposal'];
const targetVersions = Object.freeze({ 'knowledge-leaf': 3, 'ontology-concept': 2, 'decision-entry': 2,
  catalog: 2, registry: 2, 'graduation-categories': 2, 'phoenix-event': 2, finding: 2, gap: 2, miss: 1 });
const plain = (v) => v !== null && typeof v === 'object' && [Object.prototype, null].includes(Object.getPrototypeOf(v));
const closed = (v, keys) => plain(v) && Reflect.ownKeys(v).length === keys.length && keys.every((key) => Object.hasOwn(v, key));
const text = (v) => typeof v === 'string' && v.length > 0 && !v.includes('\0') && Buffer.from(v).toString() === v;
const path = (v) => Array.isArray(v) && v.length > 0 && Array.from(v).every((p) => text(p) || (Number.isSafeInteger(p) && p >= 0));
const oid = (v) => typeof v === 'string' && /^(?:[0-9a-f]{40}|[0-9a-f]{64})(?![\s\S])/.test(v);
const snapshot = (v) => closed(v, ['commit', 'tree', 'kitPath']) && oid(v.commit) && oid(v.tree) && ['.', 'unknown-knowledge'].includes(v.kitPath);
const order = (a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b));

export const migrationMechanicalPolicy = values => Object.hasOwn(values ?? {}, 'installation')
  ? { id: 'installation-cutover-mechanical-v1', version: 1 } : { id: 'identity-migration-publication-v1', version: 1 };

class GateRefusal extends Error { constructor(code) { super(code); this.code = code; } }
const refuse = (code) => { throw new GateRefusal(code); };

function copyInput(input) {
  if (!closed(input, ['repoRoot', 'source', 'candidate', 'migrationInputs', 'limits']) || !text(input.repoRoot)
    || !snapshot(input.source) || !snapshot(input.candidate) || !closed(input.limits, limitKeys)
    || !limitKeys.every((key) => Number.isSafeInteger(input.limits[key]) && input.limits[key] > 0)) refuse('invalid-migration-input');
  const { limits, migrationInputs: values } = input;
  if (limits.maxFileBytes > Math.min(limits.maxGitOutputBytes, 64 * 1024 * 1024)) refuse('migration-limit-conflict');
  if (!closed(values, ['namespace', 'publication', 'proposals', 'declarations', 'adjudications', 'proseDecisions',
    ...(Object.hasOwn(values ?? {}, 'installation') ? ['installation'] : [])])
    || (Object.hasOwn(values, 'installation') && !validInstallationInput(values.installation))
    || !isIdentityUuid(values.namespace) || !closed(values.publication, ['id', 'review'])
    || !isIdentityUuid(values.publication.id) || !text(values.publication.review)
    || !['proposals', 'declarations', 'adjudications', 'proseDecisions'].every((key) => Array.isArray(values[key]))) refuse('invalid-migration-input');
  if (values.proposals.length + values.declarations.length + values.adjudications.length + values.proseDecisions.length > limits.maxAdjudications) refuse('migration-adjudication-budget');
  if (!Array.from(values.proposals).every((v) => closed(v, ['source', 'id']) && text(v.source) && text(v.id))
    || !Array.from(values.declarations).every((v) => closed(v, ['source', 'disposition']) && text(v.source) && v.disposition === 'allocate')
    || !Array.from(values.adjudications).every((v) => closed(v, ['file', 'path', 'target']) && text(v.file) && path(v.path) && text(v.target))) refuse('invalid-migration-input');
  let edits = 0;
  for (const value of values.proseDecisions) {
    if (!plain(value) || !text(value.file) || !path(value.path) || !text(value.review)) refuse('invalid-migration-input');
    if (value.action === 'preserve') {
      if (!closed(value, ['file', 'path', 'action', 'classification', 'review']) || value.classification !== 'non-operational-evidence') refuse('invalid-migration-input');
    } else if (value.action === 'rewrite') {
      if (!closed(value, ['file', 'path', 'action', 'review', 'edits']) || !Array.isArray(value.edits)
        || !value.edits.length || !Array.from(value.edits).every((e) => closed(e, ['start', 'end', 'expected', 'source'])
          && Number.isSafeInteger(e.start) && Number.isSafeInteger(e.end) && e.start >= 0 && e.end > e.start && text(e.expected) && text(e.source))) refuse('invalid-migration-input');
      edits += value.edits.length;
    } else refuse('invalid-migration-input');
  }
  if (edits > limits.maxProseEdits) refuse('migration-prose-budget');
  const serialized = JSON.stringify(values);
  if (Buffer.byteLength(serialized) > limits.maxInputBytes) refuse('migration-input-budget');
  return { repoRoot: input.repoRoot, source: { ...input.source }, candidate: { ...input.candidate },
    migrationInputs: JSON.parse(serialized), limits: { ...limits } };
}

/** Report only actual checks and safe non-mapping diagnostics; all temporary inputs remain private. */
export async function runPreparedMigrationGate(input) {
  const report = { version: 1, operation: 'identity-migration', source: null, candidate: null,
    objectFormat: null, validationInputDigest: null, mechanicalStatus: 'failed',
    checks: checkIds.map((id) => ({ id, status: 'not-performed', code: null, counts: {} })), scope: null,
    resources: { limits: null, sourceTree: null, candidateTree: null },
    impact: { status: 'not-performed', code: 'migration-impact-unavailable' }, publicationReady: false };
  if (Object.hasOwn(input?.migrationInputs ?? {}, 'installation')) { report.version = 2; report.installation = null; }
  let plan; let documents; let rewritten; let inventory; let active = 'input';
  const check = (id, passed, code = null, counts = {}) => {
    Object.assign(report.checks.find((row) => row.id === id), { status: passed ? 'passed' : 'failed', code, counts });
  };
  try {
    plan = copyInput(input); check('input', true);
    const { source, candidate, limits, repoRoot } = plan;
    report.source = { ...source }; report.candidate = { ...candidate }; report.resources.limits = { ...limits };
    report.validationInputDigest = canonicalSha256({ source, candidate, migrationInputs: plan.migrationInputs, limits,
      policy: migrationMechanicalPolicy(plan.migrationInputs) });
    const env = { ...process.env };
    for (const key of Object.keys(env)) if (key.startsWith('GIT_')) delete env[key];
    Object.assign(env, { GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_NO_REPLACE_OBJECTS: '1',
      GIT_NO_LAZY_FETCH: '1', GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0', GIT_LITERAL_PATHSPECS: '1' });
    const git = (args, bytes) => {
      const r = spawnSync('git', ['-c', 'core.fsmonitor=false', '-C', repoRoot, ...args], { env, input: bytes, maxBuffer: limits.maxGitOutputBytes });
      if (r.status !== 0 || r.error) refuse('migration-git-evidence-unavailable');
      return r.stdout;
    };
    active = 'committed-pair';
    let actualSource; let actualCandidate;
    try { actualSource = readCommittedTree(repoRoot, source.commit); actualCandidate = readCommittedTree(repoRoot, candidate.commit); }
    catch (error) { rethrowIfBug(error); refuse('migration-commit-evidence-unavailable'); }
    if (source.tree !== actualSource.tree || candidate.tree !== actualCandidate.tree || actualSource.objectFormat !== actualCandidate.objectFormat) refuse('migration-commit-tree-mismatch');
    report.objectFormat = actualSource.objectFormat;
    // Revision walking may honor repository grafts/shallow state; raw headers do not.
    const rawCommit = git(['cat-file', 'commit', candidate.commit]);
    const separator = rawCommit.indexOf('\n\n');
    if (separator < 0) refuse('migration-commit-evidence-unavailable');
    const headers = rawCommit.subarray(0, separator).toString().split('\n');
    if (!isDeepStrictEqual(headers.filter((row) => row.startsWith('tree ')), [`tree ${candidate.tree}`])) refuse('migration-commit-tree-mismatch');
    const parents = headers.filter((row) => row.startsWith('parent ')).map((row) => row.slice(7));
    if (!isDeepStrictEqual(parents, [source.commit])) refuse('migration-candidate-parent-mismatch');
    const width = report.objectFormat === 'sha1' ? 40 : 64;
    const entries = (tree) => {
      const bytes = git(['ls-tree', '-rz', '--full-tree', tree]); const value = bytes.toString();
      if (!Buffer.from(value).equals(bytes) || (value && !value.endsWith('\0'))) refuse('migration-tree-encoding');
      const rows = value ? value.slice(0, -1).split('\0') : [];
      if (rows.length > limits.maxTreeEntries) refuse('migration-tree-budget');
      const map = new Map();
      for (const row of rows) {
        const tab = row.indexOf('\t'); const [mode, type, blob] = row.slice(0, tab).split(' '); const file = row.slice(tab + 1);
        if (tab < 0 || type !== 'blob' || !['100644', '100755', '120000'].includes(mode)
          || blob.length !== width || !oid(blob) || !isCaptureLocator({ file, blob, sha256: '1'.repeat(64) })
          || file.split('/').some((part) => part.toLowerCase() === '.git') || map.has(file)) refuse('migration-tree-entry');
        map.set(file, { mode, blob });
      }
      let total = 0;
      if (map.size) {
        const sizes = git(['cat-file', '--batch-check=%(objectname) %(objecttype) %(objectsize)'],
          Buffer.from([...map.values()].map((v) => `${v.blob}\n`).join(''))).toString().trim().split('\n');
        if (sizes.length !== map.size) refuse('migration-object-evidence-unavailable');
        for (const [i, entry] of [...map.values()].entries()) {
          const [blob, type, sizeText] = sizes[i].split(' '); const size = Number(sizeText);
          if (blob !== entry.blob || type !== 'blob' || !/^(?:0|[1-9][0-9]*)$/.test(sizeText)
            || !Number.isSafeInteger(size) || size > limits.maxFileBytes) refuse('migration-file-budget');
          total += size;
          if (!Number.isSafeInteger(total) || total > limits.maxTreeBytes) refuse('migration-tree-budget');
        }
      }
      return { map, listingBytes: bytes.length, resources: { entries: map.size, bytes: total } };
    };
    const before = entries(source.tree); const after = entries(candidate.tree);
    // Shared readers use fixed buffers. Bound their complete listings before delegation.
    if (before.listingBytes + after.listingBytes > Math.min(limits.maxGitOutputBytes, 64 * 1024 * 1024)) refuse('migration-tree-listing-budget');
    report.resources.sourceTree = before.resources; report.resources.candidateTree = after.resources;
    check('committed-pair', true);
    active = 'source-layout';
    await withTreeSnapshot(repoRoot, source.tree, async ({ root: sourceRoot }) => {
      active = 'source-layout';
      if ((relative(sourceRoot, locateKitRoot(sourceRoot)) || '.') !== source.kitPath) refuse('migration-kit-layout-mismatch');
      check(active, true);
      active = 'candidate-layout';
      await withTreeSnapshot(repoRoot, candidate.tree, ({ root: candidateRoot }) => {
        active = 'candidate-layout'; const kitRoot = locateKitRoot(candidateRoot);
        if ((relative(candidateRoot, kitRoot) || '.') !== candidate.kitPath || candidate.kitPath !== source.kitPath) refuse('migration-kit-layout-mismatch');
        check(active, true); active = 'source-inventory';
        try { inventory = inventoryCommittedSource({ repoRoot, commit: source.commit, kitRoot: source.kitPath, adjudications: plan.migrationInputs.adjudications }); }
        catch (error) {
          // The committed inventory API uses UsageError for unsupported source states.
          // Translate only that boundary's deliberate refusal, never a programming error.
          if (error?.constructor !== UsageError) rethrowIfBug(error);
          refuse('migration-source-inventory-unavailable');
        }
        const sourceFiles = [...inventory.files, ...inventory.preservedFiles].map((row) => row.file).sort(order);
        if (sourceFiles.length > limits.maxSourceDocuments || inventory.records.length > limits.maxRecords || inventory.references.length > limits.maxReferences) refuse('migration-inventory-budget');
        report.scope = { coverage: 'committed-installation', sourceFiles,
          unclassifiedPaths: [...inventory.unclassifiedPaths], records: inventory.records.length,
          declaredOnly: inventory.records.filter((row) => row.availability === 'declared-only').length, references: inventory.references.length };
        check(active, inventory.ok && (plan.migrationInputs.installation || inventory.unclassifiedPaths.length === 0),
          inventory.ok ? (inventory.unclassifiedPaths.length && !plan.migrationInputs.installation ? 'migration-source-scope-incomplete' : null) : 'migration-source-inventory-invalid',
          { documents: sourceFiles.length, records: inventory.records.length, references: inventory.references.length, diagnostics: inventory.diagnostics.length });
        if (!inventory.ok) return;
        documents = inventory.files.map((file) => {
          const captured = captureCommittedFile({ repoRoot, commit: source.commit, file: file.file });
          if (captured.locator.blob !== file.blob || captured.locator.sha256 !== file.sha256 || captured.mode !== file.mode) refuse('migration-source-capture-mismatch');
          return { file: file.file, kind: file.kind, bytes: captured.bytes };
        });
        active = 'rewrite';
        rewritten = rewriteIdentityCandidate(documents, { ...plan.migrationInputs, targetVersions });
        check(active, rewritten.ok, rewritten.ok ? null : 'migration-rewrite-refused', { files: rewritten.files?.length ?? 0 });
        if (!rewritten.ok) return;
        active = 'candidate-preservation';
        const ledgerFile = source.kitPath === '.' ? '_identity.yaml' : `${source.kitPath}/_identity.yaml`;
        const ledgerEntry = after.map.get(ledgerFile);
        if (before.map.has(ledgerFile) || ledgerEntry?.mode !== '100644') refuse('migration-ledger-file-mismatch');
        const expected = new Map(before.map);
        for (const file of rewritten.files) {
          const prior = before.map.get(file.file);
          if (!prior || !['100644', '100755'].includes(prior.mode)) refuse('migration-source-mode-mismatch');
          expected.set(file.file, { mode: prior.mode, blob: describeCandidateBytes({ file: file.file, bytes: file.bytes, objectFormat: report.objectFormat }).blob });
        }
        // The newly created ledger has one fixed JSON-as-YAML encoding, no extra authored text.
        expected.set(ledgerFile, { mode: '100644', blob: describeCandidateBytes({ file: ledgerFile,
          bytes: Buffer.from(JSON.stringify(rewritten.identity)), objectFormat: report.objectFormat }).blob });
        if (plan.migrationInputs.installation) {
          const installation = planInstallationCutover({ input: plan.migrationInputs.installation, before: before.map, after: after.map,
            beforeRoot: sourceRoot, candidateRoot, source, candidate, objectFormat: report.objectFormat, inventory, documents,
            migrationInputs: plan.migrationInputs });
          for (const [file, value] of installation.updates) {
            if (value === null) expected.delete(file);
            else expected.set(file, { mode: value.mode, blob: describeCandidateBytes({ file, bytes: value.bytes, objectFormat: report.objectFormat }).blob });
          }
          report.installation = installation.report;
          report.scope = { ...report.scope, coverage: 'committed-installation-cutover', unclassifiedPaths: [],
            sourceFiles: installation.report.inventory.roles.filter(row => row.before !== null).map(row => row.file) };
        }
        const sorted = (map) => [...map].sort(([a], [b]) => order(a, b));
        const expectedPaths = [...new Set([...before.map.keys(), ...expected.keys()])]
          .filter((file) => !isDeepStrictEqual(expected.get(file), before.map.get(file))).sort(order);
        const sameTree = isDeepStrictEqual(sorted(expected), sorted(after.map));
        const changedCount = [...new Set([...before.map.keys(), ...after.map.keys()])]
          .filter((file) => !isDeepStrictEqual(before.map.get(file), after.map.get(file))).length;
        // Every added, changed and removed path must match the complete private plan.
        // Attribution also includes unchanged copy-source paths. A distribution
        // replacement can copy old modules into its offline compatibility tree.
        const actualPaths = sameTree ? changedTreePaths(repoRoot, source.tree, candidate.tree)
          .filter(file => !plan.migrationInputs.installation || !isDeepStrictEqual(before.map.get(file), after.map.get(file))).sort(order) : [];
        const preserved = sameTree && isDeepStrictEqual(expectedPaths, actualPaths);
        check(active, preserved, preserved ? null : 'migration-candidate-bytes-mismatch', { changedPaths: changedCount });
        active = 'candidate-ledger';
        const model = loadStores(kitRoot);
        const ledgerValid = model.ok && isDeepStrictEqual(model.identity, rewritten.identity);
        check(active, ledgerValid, ledgerValid ? null : 'migration-candidate-ledger-mismatch', { allocations: model.identity?.allocations?.length ?? 0 });
        if (!model.ok) return;
        active = 'candidate-structural'; const findings = runChecks(model, candidateRoot);
        const errors = findings.filter((row) => row.severity === 'error').length;
        check(active, errors === 0, errors ? 'migration-structural-findings' : null, { errors, warnings: findings.length - errors });
        active = 'candidate-values'; const values = validateValues(model, null, candidateRoot);
        const valueErrors = values.findings.filter((row) => row.severity === 'error').length;
        check(active, valueErrors === 0 && values.hardErrors.length === 0,
          valueErrors || values.hardErrors.length ? 'migration-value-findings' : null,
          { checked: values.checked.filter((row) => !row.skipped).length, skipped: values.checked.filter((row) => row.skipped).length,
            errors: valueErrors, hardErrors: values.hardErrors.length, warnings: values.findings.length - valueErrors });
      });
    });
    check('temporary-disposal', true);
    report.mechanicalStatus = report.checks.every((row) => row.status === 'passed') ? 'passed' : 'failed';
  } catch (error) {
    if (error instanceof GateRefusal) check(active, false, error.code);
    else if (/^snapshot cleanup failed/.test(error?.message ?? '')) {
      rethrowIfBug(error);
      check('temporary-disposal', false, 'migration-snapshot-cleanup-failed');
    } else if (error instanceof InstallationRefusal) {
      report.installation = { version: 1, status: 'failed', code: error.code };
      check(active, false, 'migration-installation-refused');
    } else if (error instanceof EngineRefusal || /^snapshot:/.test(error?.message ?? '')) {
      rethrowIfBug(error);
      check(active, false, 'migration-snapshot-evidence-unavailable');
    } else throw error;
  } finally {
    // Never return or persist the private correspondence-bearing inputs or rewrite state.
    documents = null; rewritten = null; inventory = null;
    if (plan) plan.migrationInputs = null;
    plan = null;
  }
  return report;
}
