/** Exact installed-distribution and consumer byte plan. Review authority is external. */
import { readFileSync, readdirSync, lstatSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { load } from 'js-yaml';
import { canonicalJsonBytes, canonicalSha256 } from './canonical-json.js';
import { describeCandidateBytes } from './captured-source.js';
import { planIdentityCorrespondence } from './identity-migration.js';
import { parseSource } from './yaml-source.js';
import { EngineRefusal } from './engine-refusal.js';
import { rawSha256 } from './prepared-evidence.js';

export const installationAssets = JSON.parse(readFileSync(new URL('../policies/installation-assets.json', import.meta.url), 'utf8'));

export const installationLimits = ['maxConsumerFiles', 'maxConsumerBytes', 'maxConsumerEdits', 'maxActivationEdges', 'maxReviewBytes'];
const closed = (v, keys) => v !== null && typeof v === 'object' && !Array.isArray(v)
  && Reflect.ownKeys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k));
const text = v => typeof v === 'string' && v.length > 0 && !v.includes('\0') && Buffer.from(v).toString() === v;
const order = (a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b));
export class InstallationRefusal extends EngineRefusal {
  constructor(code) { super(code); this.code = code; }
}
const refuse = code => { throw new InstallationRefusal(code); };
const roles = ['non-consumer', 'seed-provenance', 'reviewed-text', 'ontology-rules', 'knowledge-rules', 'suppressions', 'launcher', 'seeded-wrapper', 'deactivated'];

export function validInstallationInput(value) {
  return closed(value, ['version', 'roles', 'launches', 'limits']) && value.version === 1
    && closed(value.limits, installationLimits) && installationLimits.every(k => Number.isSafeInteger(value.limits[k]) && value.limits[k] > 0)
    && Array.isArray(value.roles) && value.roles.length <= value.limits.maxConsumerFiles
    && value.roles.every(row => closed(row, ['file', 'role', 'disposition', 'reason', 'edits', 'bindings'])
      && text(row.file) && roles.includes(row.role) && ['preserve', 'rewrite', 'retire-ranges', 'remove'].includes(row.disposition)
      && text(row.reason) && Array.isArray(row.edits) && row.edits.every(edit => closed(edit, ['start', 'end', 'expected', 'source'])
        && Number.isSafeInteger(edit.start) && edit.start >= 0 && Number.isSafeInteger(edit.end) && edit.end > edit.start
        && text(edit.expected) && text(edit.source))
      && Array.isArray(row.bindings) && row.bindings.every(binding => closed(binding, ['index', 'kind', 'source'])
        && Number.isSafeInteger(binding.index) && binding.index >= 0 && ['literal', 'stale-concept'].includes(binding.kind)
        && (binding.kind === 'literal' ? binding.source === null : text(binding.source))))
    && Array.isArray(value.launches) && value.launches.length > 0 && value.launches.length <= value.limits.maxActivationEdges
    && value.launches.every(row => closed(row, ['file', 'form']) && text(row.file) && ['shell-node', 'package-script', 'agent-pointer', 'seeded-wrapper'].includes(row.form))
    && canonicalJsonBytes(value).length <= value.limits.maxReviewBytes;
}

function parserRoot() {
  let dir = dirname(createRequire(import.meta.url).resolve('js-yaml'));
  while (dir !== dirname(dir)) {
    if (lstatSync(join(dir, 'package.json'), { throwIfNoEntry: false })?.isFile()
      && JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).name === 'js-yaml') return dir;
    dir = dirname(dir);
  }
  refuse('cutover-parser-unavailable');
}

/** The current side comes from this actual trusted installation, never caller paths. */
export function installationDistribution(side, limits) {
  if (!['before', 'candidate'].includes(side)) refuse('cutover-runtime-side');
  const root = fileURLToPath(new URL(side === 'before' ? '../compatibility/identity-migration-08066b5/' : '../../', import.meta.url));
  const result = new Map(); let total = 0;
  const visit = (source, path) => {
    const stat = lstatSync(source);
    if (stat.isDirectory()) {
      for (const name of readdirSync(source).sort(order)) visit(join(source, name), `${path}/${name}`);
      return;
    }
    if (!stat.isFile() || result.size >= limits.maxConsumerFiles || stat.size > limits.maxConsumerBytes - total) refuse('cutover-runtime-capacity');
    const bytes = readFileSync(source); total += bytes.length;
    if (bytes.length !== stat.size || total > limits.maxConsumerBytes) refuse('cutover-runtime-drift');
    result.set(path, bytes);
  };
  for (const path of ['engine', 'schemas', 'package.json']) visit(join(root, path), path);
  visit(side === 'before' ? join(root, 'node_modules') : parserRoot(), side === 'before' ? 'node_modules' : 'node_modules/js-yaml');
  for (const asset of installationAssets[side]) {
    if (result.has(asset.path)) refuse('cutover-runtime-drift');
    if (side === 'candidate') visit(join(root, asset.source), asset.path);
    else {
      const bytes = Buffer.from(asset.base64, 'base64'); total += bytes.length;
      if (rawSha256(bytes) !== asset.sha256) refuse('cutover-runtime-drift');
      if (result.size >= limits.maxConsumerFiles || total > limits.maxConsumerBytes) refuse('cutover-runtime-capacity');
      result.set(asset.path, bytes);
    }
  }
  return result;
}

const wrapperSpec = file => ({ 'AGENTS.md': ['wrappers/pointer.md', true],
  '.github/copilot-instructions.md': ['wrappers/pointer.md', true], 'CLAUDE.md': ['wrappers/pointer.md', false],
  'GEMINI.md': ['wrappers/pointer.md', false], '.cursor/rules/unknown-knowledge.mdc': ['wrappers/cursor.mdc', false] })[file];
function wrapperBody(file, side) {
  const spec = wrapperSpec(file);
  if (!spec) refuse('cutover-launch-form');
  const template = side === 'before' ? installationAssets.wrappers[spec[0]].before
    : readFileSync(new URL(`../../${spec[0]}`, import.meta.url), 'utf8');
  const body = template.replaceAll('{{root}}', 'unknown-knowledge');
  return spec[1] ? `<!-- unknown-knowledge:begin -->\n${body.trimEnd()}\n<!-- unknown-knowledge:end -->\n` : body;
}
function replaceWrapper(file, bytes) {
  const old = wrapperBody(file, 'before'), next = wrapperBody(file, 'candidate');
  const source = bytes.toString();
  if (!wrapperSpec(file)[1]) {
    if (source !== old) refuse('cutover-launch-form');
    return Buffer.from(next);
  }
  if (source.split('<!-- unknown-knowledge:begin -->').length !== 2
    || source.split('<!-- unknown-knowledge:end -->').length !== 2 || !source.includes(old)) refuse('cutover-launch-form');
  return Buffer.from(source.replace(old, next));
}

function applyReferences(bytes, edits, correspondence) {
  const rows = [...edits].sort((a, b) => a.start - b.start); const chunks = []; let end = 0;
  for (const edit of rows) {
    const target = correspondence.find(row => row.source.key === edit.source);
    if (!closed(edit, ['start', 'end', 'expected', 'source']) || !target
      || !Number.isSafeInteger(edit.start) || !Number.isSafeInteger(edit.end) || edit.start < end || edit.end <= edit.start
      || edit.expected !== target.source.id || !bytes.subarray(edit.start, edit.end).equals(Buffer.from(edit.expected))) refuse('cutover-reference-span');
    chunks.push(bytes.subarray(end, edit.start), Buffer.from(target.target.id)); end = edit.end;
  }
  chunks.push(bytes.subarray(end)); return Buffer.concat(chunks);
}

function consumerBytes(row, bytes, correspondence) {
  if (row.role !== 'suppressions' && row.bindings.length) refuse('cutover-unused-bindings');
  if (row.role === 'deactivated') {
    if (row.disposition !== 'remove' || row.edits.length) refuse('cutover-removal-shape');
    return null;
  }
  if (row.role === 'seeded-wrapper') {
    if (row.disposition !== 'rewrite' || row.edits.length) refuse('cutover-role-disposition');
    return replaceWrapper(row.file, bytes);
  }
  if (row.role === 'ontology-rules') {
    if (row.disposition !== 'retire-ranges' || row.edits.length) refuse('cutover-rules-disposition');
    const value = load(bytes.toString());
    if (!closed(value, ['schema-version', 'store', 'rules']) || value['schema-version'] !== 1 || value.store !== 'ontology'
      || !Array.isArray(value.rules) || !value.rules.length || !value.rules.every(rule => closed(rule, ['class', 'id-range'])
        && text(rule.class) && Array.isArray(rule['id-range']) && rule['id-range'].length === 2
        && rule['id-range'].every(id => /^K-[0-9]+$/.test(id)))) refuse('cutover-rules-grammar');
    // This owner admits block-style range fields only; comments and all other bytes survive.
    let removed = 0;
    const output = bytes.toString().replace(/^[ \t]+id-range:[ \t]*\[K-[0-9]+,[ \t]*K-[0-9]+\][ \t]*\r?\n/gm, () => { removed += 1; return ''; });
    if (removed !== value.rules.length || !isDeepStrictEqual(load(output), { ...value, rules: value.rules.map(rule => ({ class: rule.class })) })) refuse('cutover-rules-span');
    return Buffer.from(output);
  }
  if (row.role === 'suppressions') {
    if (row.disposition !== 'rewrite' || row.edits.length) refuse('cutover-suppression-disposition');
    const parsed = parseSource({ file: row.file, kind: 'suppressions', bytes });
    if (!Array.isArray(parsed.value) || row.bindings.length !== parsed.value.length) refuse('cutover-suppression-coverage');
    const edits = [];
    for (const [i, entry] of parsed.value.entries()) {
      const binding = row.bindings[i];
      if (!closed(binding, ['index', 'kind', 'source']) || binding.index !== i || !['literal', 'stale-concept'].includes(binding.kind)) refuse('cutover-suppression-binding');
      if (binding.kind === 'literal') { if (binding.source !== null) refuse('cutover-suppression-binding'); continue; }
      const target = correspondence.find(item => item.source.key === binding.source);
      if (!target || target.source.kind !== 'ontology' || entry.term !== target.source.id || entry.sourcePath !== target.source.id) refuse('cutover-suppression-reference');
      for (const field of ['term', 'sourcePath']) {
        const span = parsed.spans.get(JSON.stringify([i, field]));
        if (!span || !bytes.subarray(span.start, span.end).equals(Buffer.from(target.source.id))) refuse('cutover-suppression-scalar');
        edits.push({ start: span.start, end: span.end, expected: target.source.id, source: binding.source });
      }
    }
    return applyReferences(bytes, edits, correspondence);
  }
  if (row.disposition === 'preserve' && row.edits.length === 0) return bytes;
  if (!['reviewed-text', 'knowledge-rules'].includes(row.role) || row.disposition !== 'rewrite') refuse('cutover-role-disposition');
  return applyReferences(bytes, row.edits, correspondence);
}

/** Supported literal local invocation forms; discovered code is never executed. */
export function installationLaunchEdges(file, form, bytes, kitPath) {
  const kit = kitPath === '.' ? '' : `${kitPath}/`;
  const entries = ['validate.js', 'validate-values.js', 'preflight.js', 'resolve.js', 'commit-check.js', 'reverse-staged.js', 'audit.js', 'derive.js', 'log-entry.js', 'phoenix.js', 'invoke.js'];
  const literal = command => {
    const entry = entries.find(name => command === `node ${kit}engine/${name} --root .`);
    if (!entry) refuse('cutover-launch-form');
    return { file, form, target: `${kit}engine/${entry}`, kitPath };
  };
  if (form === 'shell-node') {
    const match = /^#!\/bin\/sh\nexec ([^\n]+)\n$/.exec(bytes.toString());
    if (!match) refuse('cutover-launch-form');
    return [literal(match[1])];
  }
  if (form === 'package-script') {
    const value = JSON.parse(bytes.toString());
    if (!closed(value, ['private', 'scripts']) || value.private !== true || !closed(value.scripts, Object.keys(value.scripts))
      || !Object.keys(value.scripts).length) refuse('cutover-launch-form');
    return Object.entries(value.scripts).map(([script, command]) => ({ ...literal(command), script }));
  }
  if (form === 'agent-pointer') {
    if (bytes.toString() !== `Read ${kit}protocol/AGENTS.md before using this installation.\n`) refuse('cutover-launch-form');
    return [{ file, form, target: `${kit}protocol/AGENTS.md`, kitPath }];
  }
  if (form === 'seeded-wrapper') {
    const expected = wrapperBody(file, 'candidate'), source = bytes.toString();
    if (wrapperSpec(file)[1] ? source.split(expected).length !== 2
      || source.split('<!-- unknown-knowledge:begin -->').length !== 2
      || source.split('<!-- unknown-knowledge:end -->').length !== 2 : source !== expected) refuse('cutover-launch-form');
    return [{ file, form, target: `${kit}protocol/AGENTS.md`, kitPath }];
  }
  refuse('cutover-launch-form');
}

/** Derive safe evidence and private exact updates from complete committed entries. */
export function planInstallationCutover({ input, before, after, beforeRoot, candidateRoot, source, candidate, objectFormat, inventory, documents, migrationInputs }) {
  if (!validInstallationInput(input)) refuse('cutover-input');
  if (source.kitPath !== 'unknown-knowledge' || candidate.kitPath !== source.kitPath) refuse('cutover-seeded-layout');
  const { limits } = input; const prefix = source.kitPath === '.' ? '' : `${source.kitPath}/`;
  const beforeDist = installationDistribution('before', limits), afterDist = installationDistribution('candidate', limits);
  const automatic = new Set([...inventory.files, ...inventory.preservedFiles].map(row => row.file));
  const known = new Set(); const updates = new Map(); const rows = []; let total = 0;
  const capture = (file, side) => {
    const entry = (side === 'before' ? before : after).get(file);
    if (!entry) return null;
    if (!['100644', '100755'].includes(entry.mode)) refuse('cutover-file-kind');
    const bytes = readFileSync(join(side === 'before' ? beforeRoot : candidateRoot, file));
    total += bytes.length;
    if (total > limits.maxConsumerBytes) refuse('cutover-byte-capacity');
    const locator = describeCandidateBytes({ file, bytes, objectFormat });
    if (locator.blob !== entry.blob) refuse('cutover-capture-drift');
    return { bytes, row: { ...locator, mode: entry.mode, size: bytes.length } };
  };
  const record = (file, role, disposition, reason) => {
    if (known.has(file) || rows.length >= limits.maxConsumerFiles) refuse('cutover-role-coverage');
    known.add(file);
    const old = capture(file, 'before'), next = capture(file, 'candidate');
    rows.push({ file, role, disposition, reason, before: old?.row ?? null, candidate: next?.row ?? null });
    return { old, next };
  };
  const runtimeRows = [];
  for (const path of [...new Set([...beforeDist.keys(), ...afterDist.keys()])].sort(order)) {
    const file = `${prefix}${path}`;
    const { old, next } = record(file, 'installed-runtime', 'replace-distribution', null);
    if (Boolean(old) !== beforeDist.has(path) || (old && !old.bytes.equals(beforeDist.get(path)))
      || Boolean(next) !== afterDist.has(path) || (next && (!next.bytes.equals(afterDist.get(path)) || next.row.mode !== '100644'))) refuse('cutover-runtime-pair');
    updates.set(file, afterDist.has(path) ? { bytes: afterDist.get(path), mode: '100644' } : null);
    runtimeRows.push({ path, before: old?.row.sha256 ?? null, candidate: next?.row.sha256 ?? null });
  }
  const plan = planIdentityCorrespondence(documents, migrationInputs);
  if (!plan.ok) refuse('cutover-correspondence');
  const correspondence = plan.correspondence.map(row => ({ source: inventory.records.find(record => record.key === row.source), target: row.target }));
  let edits = 0;
  for (const row of input.roles) {
    if (known.has(row.file) || inventory.files.some(item => item.file === row.file)
      || ['engine/', 'schemas/', 'node_modules/'].some(path => row.file.startsWith(`${prefix}${path}`))) refuse('cutover-role-overlap');
    const fixedPath = { 'ontology-rules': 'ontology/_rules.yaml', 'knowledge-rules': 'knowledge/_rules.yaml',
      suppressions: 'suppressions.yaml', 'seed-provenance': 'kit.manifest.yaml' }[row.role];
    if (fixedPath && row.file !== `${prefix}${fixedPath}`) refuse('cutover-role-path');
    const requiredRole = { [`${prefix}ontology/_rules.yaml`]: 'ontology-rules', [`${prefix}knowledge/_rules.yaml`]: 'knowledge-rules',
      [`${prefix}suppressions.yaml`]: 'suppressions', [`${prefix}kit.manifest.yaml`]: 'seed-provenance' }[row.file];
    if (requiredRole && row.role !== requiredRole && (row.role !== 'deactivated' || requiredRole === 'seed-provenance')) refuse('cutover-role-path');
    edits += row.edits.length + row.bindings.length;
    if (edits > limits.maxConsumerEdits) refuse('cutover-edit-capacity');
    const { old, next } = record(row.file, row.role, row.disposition, row.reason);
    if (!old) refuse('cutover-role-source');
    let expected;
    try { expected = consumerBytes(row, old.bytes, correspondence); }
    catch (error) { if (error instanceof InstallationRefusal) throw error; refuse('cutover-consumer-grammar'); }
    if (expected === null ? next !== null : !next || !next.bytes.equals(expected) || next.row.mode !== old.row.mode) refuse('cutover-consumer-bytes');
    updates.set(row.file, expected === null ? null : { bytes: expected, mode: old.row.mode });
  }
  for (const file of automatic) if (!known.has(file)) record(file, 'existing-domain-owner', 'domain-proof', null);
  record(`${prefix}_identity.yaml`, 'identity-ledger', 'allocate', null);
  if ([...new Set([...before.keys(), ...after.keys()])].some(file => !known.has(file))) refuse('cutover-role-coverage');
  const edges = [];
  const launched = new Set();
  for (const launch of input.launches) {
    if (launched.has(launch.file) || !input.roles.some(row => row.file === launch.file && ['launcher', 'seeded-wrapper'].includes(row.role))) refuse('cutover-launch-coverage');
    launched.add(launch.file);
    const bytes = readFileSync(join(candidateRoot, launch.file));
    try { edges.push(...installationLaunchEdges(launch.file, launch.form, bytes, candidate.kitPath)); }
    catch (error) { if (error instanceof InstallationRefusal) throw error; refuse('cutover-launch-form'); }
  }
  if (input.roles.some(row => ['launcher', 'seeded-wrapper'].includes(row.role) && !launched.has(row.file)) || edges.length > limits.maxActivationEdges
    || edges.some(edge => !after.has(edge.target))) refuse('cutover-launch-coverage');
  const sorted = rows.sort((a, b) => order(a.file, b.file));
  const review = { version: 1, source, candidate, roles: sorted, launches: edges };
  if (canonicalJsonBytes(review).length > limits.maxReviewBytes) refuse('cutover-review-capacity');
  return { updates, report: { version: 1, status: 'complete', policy: 'installation-cutover-v1',
    reviewDigest: canonicalSha256(review), inventory: review, installedRuntime: canonicalSha256(runtimeRows),
    activation: 'not-observed', resources: { files: rows.length, bytes: total, edits, edges: edges.length } } };
}
