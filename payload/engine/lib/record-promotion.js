/** Typed promotion byte planning from actual committed source; never approval. */
import { lstatSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { parseEvents, getScalarValue, EVENT_ID, COLLECTION_STYLE, YAMLException } from 'js-yaml';
import { canonicalJsonBytes, canonicalSha256, CapturedInputError } from './canonical-json.js';
import { readCommittedTree, withTreeSnapshot } from './commit-snapshot.js';
import { captureCommittedFile } from './captured-source.js';
import { isCaptureLocator } from './capture-locator.js';
import { locateKitRoot } from './kit-root.js';
import { loadStores, REF_FIELDS, isPrePromotionStatus } from './load-stores.js';
import { iterateCurrentRecords, iterateProposalRecords, parseCanonicalId, parseProposalKey } from './record-identity.js';
import { getIdentityIndexDescriptor } from './record-identity-index.js';
import { planAllocations, validateIdentityTransition } from './identity-ledger.js';
import { parseRecordFile } from './record-file.js';
import { parseSource, SourceDocumentError } from './yaml-source.js';
import { createSourceBudget, readSourceFileSync, getSourceBudgetUsage, SourceBudgetError } from './source-budget.js';

const closed = (v, keys) => v !== null && typeof v === 'object' && !Array.isArray(v)
  && [Object.prototype, null].includes(Object.getPrototypeOf(v))
  && Reflect.ownKeys(v).length === keys.length && keys.every((key) => {
    const property = Object.getOwnPropertyDescriptor(v, key);
    return property?.enumerable && Object.hasOwn(property, 'value');
  });
const fullOid = (v) => typeof v === 'string' && /^(?:[0-9a-f]{40}|[0-9a-f]{64})(?![\s\S])/.test(v);
const order = (a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b));
const keyOf = (path) => JSON.stringify(path);
const at = (value, path) => path.reduce((row, key) => row?.[key], value);
const limitKeys = ['maxFiles', 'maxFileBytes', 'maxSourceBytes', 'maxPromotions'];
// Fixed installed policies, never caller-supplied field paths or lifecycle rules.
const policies = Object.freeze({
  decision: Object.freeze({ store: 'decisions', schema: 'decision-entry', space: 'decisions', lifecycle: Object.freeze(['status']), target: 'accepted' }),
  ontology: Object.freeze({ store: 'ontology', schema: 'ontology-concept', space: 'concepts', lifecycle: Object.freeze(['status']), target: 'active' }),
  knowledge: Object.freeze({ store: 'knowledge', schema: 'knowledge-leaf', space: 'leaves', lifecycle: Object.freeze(['facets', 'stage']), target: 'verified' }),
});
class PromotionRefusal extends Error {
  constructor(code, diagnostics = []) { super(code); this.code = code; this.diagnostics = diagnostics; }
}
const refuse = (code, file, path) => { throw new PromotionRefusal(code, file === undefined ? [] : [{ file, path }]); };

function admit(input, typed) {
  if (!closed(input, ['repoRoot', 'source', 'publication', 'selected', 'limits', ...(typed ? ['version', 'kind'] : [])])
    || (typed && (input.version !== 1 || !['ontology', 'knowledge'].includes(input.kind)))) refuse('invalid-promotion-input');
  const kind = typed ? input.kind : 'decision';
  if (typeof input.repoRoot !== 'string' || !input.repoRoot || input.repoRoot.includes('\0')
    || !closed(input.source, ['commit', 'tree', 'kitPath'])
    || !fullOid(input.source.commit) || !fullOid(input.source.tree)
    || !['.', 'unknown-knowledge'].includes(input.source.kitPath)
    || !closed(input.publication, ['id', 'review'])
    || typeof input.publication.id !== 'string' || typeof input.publication.review !== 'string'
    || !closed(input.limits, limitKeys)
    || !limitKeys.every((key) => Number.isSafeInteger(input.limits[key]) && input.limits[key] > 0)
    || input.limits.maxFileBytes > 64 * 1024 * 1024
    || !Array.isArray(input.selected) || Object.getPrototypeOf(input.selected) !== Array.prototype
    || !input.selected.length || input.selected.length > input.limits.maxPromotions
    || Reflect.ownKeys(input.selected).length !== input.selected.length + 1) {
    refuse('invalid-promotion-input');
  }
  for (let i = 0; i < input.selected.length; i += 1) {
    const property = Object.getOwnPropertyDescriptor(input.selected, String(i));
    if (!property?.enumerable || !Object.hasOwn(property, 'value')) refuse('invalid-promotion-input');
  }
  const seen = new Set(); const ids = new Set();
  for (const row of input.selected) {
    if (!closed(row, ['proposalRef', 'canonicalRef', 'targetLifecycle', 'beforeCapture'])
      || !closed(row.proposalRef, ['namespace', 'kind', 'key']) || row.proposalRef.kind !== kind
      || !parseProposalKey(kind, row.proposalRef.key).ok
      || !closed(row.canonicalRef, ['namespace', 'kind', 'id']) || row.canonicalRef.kind !== kind
      || !parseCanonicalId(kind, row.canonicalRef.id).ok || row.targetLifecycle !== policies[kind].target
      || typeof row.proposalRef.namespace !== 'string' || typeof row.canonicalRef.namespace !== 'string'
      || !closed(row.beforeCapture, ['file', 'blob', 'sha256', 'source'])
      || !closed(row.beforeCapture.source, ['commit', 'tree']) || !isCaptureLocator(row.beforeCapture)
      || seen.has(row.proposalRef.key) || ids.has(row.canonicalRef.id)) refuse('invalid-promotion-input');
    seen.add(row.proposalRef.key); ids.add(row.canonicalRef.id);
  }
  // The closed data-property checks above precede all copying. Captures here
  // contain only locators; no buffers, callbacks or models cross this boundary.
  const plan = JSON.parse(canonicalJsonBytes(input).toString());
  plan.kind = kind;
  plan.selected.sort((a, b) => order(a.proposalRef.key, b.proposalRef.key));
  return plan;
}

function captureFiles(root, limits, budget) {
  const files = new Map();
  const visit = (directory) => {
    for (const name of readdirSync(directory).sort(order)) {
      const path = join(directory, name); const file = relative(root, path); const stat = lstatSync(path);
      if (stat.isDirectory()) { visit(path); continue; }
      if (!stat.isFile()) refuse('promotion-source-not-regular', file, []);
      if (files.size >= limits.maxFiles || stat.size > limits.maxFileBytes) refuse('promotion-source-budget', file, []);
      files.set(file, { file, bytes: readSourceFileSync(path, { sourceBudget: budget }), patches: new Map() });
    }
  };
  visit(root);
  return files;
}

function patchScalar(document, path, after) {
  const span = document.parsed.spans.get(keyOf(path)); const before = at(document.parsed.value, path);
  if (!span || !['plain', 'single-quoted', 'double-quoted'].includes(span.style)
    || document.bytes.subarray(span.start, span.end).toString() !== before || /[\r\n]/.test(before)) {
    refuse('promotion-scalar-unsupported', document.file, path);
  }
  const previous = document.patches.get(keyOf(path));
  if (previous && previous.after !== after) refuse('promotion-patch-conflict', document.file, path);
  document.patches.set(keyOf(path), { ...span, path, after, bytes: Buffer.from(after) });
}

function applyPatches(document) {
  let end = document.bytes.length; const parts = [];
  for (const patch of [...document.patches.values()].sort((a, b) => b.start - a.start)) {
    if (patch.end > end) refuse('promotion-patch-conflict', document.file, patch.path);
    parts.unshift(patch.bytes, document.bytes.subarray(patch.end, end)); end = patch.start;
  }
  parts.unshift(document.bytes.subarray(0, end));
  const bytes = Buffer.concat(parts); const expected = structuredClone(document.parsed.value);
  for (const patch of document.patches.values()) at(expected, patch.path.slice(0, -1))[patch.path.at(-1)] = patch.after;
  if (!isDeepStrictEqual(parseSource({ ...document, bytes }).value, expected)) refuse('promotion-preservation-mismatch', document.file, []);
  return bytes;
}

/** Insert new rows before existing rows without reserializing any old bytes. */
function extendLedger(document, newRows) {
  const source = document.bytes.toString(); const events = parseEvents(source); let cursor = 2; let sequence;
  const skip = () => {
    const event = events[cursor++];
    if ([EVENT_ID.MAPPING, EVENT_ID.SEQUENCE].includes(event.type)) {
      while (events[cursor].type !== EVENT_ID.POP) skip(); cursor += 1;
    }
  };
  if (events[0]?.type !== EVENT_ID.DOCUMENT || events[1]?.type !== EVENT_ID.MAPPING) refuse('promotion-ledger-representation');
  while (events[cursor].type !== EVENT_ID.POP) {
    const key = events[cursor++];
    if (key.type !== EVENT_ID.SCALAR) refuse('promotion-ledger-representation');
    if (getScalarValue(source, key) === 'allocations') { sequence = events[cursor]; break; }
    skip();
  }
  if (sequence?.type !== EVENT_ID.SEQUENCE) refuse('promotion-ledger-representation');
  let position = sequence.start; let insert;
  if (sequence.style === COLLECTION_STYLE.FLOW && source[position] === '[') {
    position += 1;
    insert = newRows.map((row) => JSON.stringify(row)).join(',') + (document.parsed.value.allocations.length ? ',' : '');
  } else if (sequence.style === COLLECTION_STYLE.BLOCK && source[position] === '-') {
    const indent = source.slice(source.lastIndexOf('\n', position - 1) + 1, position);
    if (!/^ *$/.test(indent)) refuse('promotion-ledger-representation');
    const newline = source.includes('\r\n') ? '\r\n' : '\n';
    insert = newRows.map((row) => `- ${JSON.stringify(row)}${newline}${indent}`).join('');
  } else refuse('promotion-ledger-representation');
  const offset = Buffer.byteLength(source.slice(0, position));
  const bytes = Buffer.concat([document.bytes.subarray(0, offset), Buffer.from(insert), document.bytes.subarray(offset)]);
  const expected = { ...document.parsed.value, allocations: [...newRows, ...document.parsed.value.allocations] };
  if (!isDeepStrictEqual(parseSource({ ...document, bytes }).value, expected)) refuse('promotion-ledger-preservation');
  return { bytes, identity: expected };
}

async function planCaptured(plan) {
  const policy = policies[plan.kind];
  const pair = readCommittedTree(plan.repoRoot, plan.source.commit);
  if (pair.tree !== plan.source.tree) refuse('promotion-source-mismatch');
  return withTreeSnapshot(plan.repoRoot, pair.tree, ({ root }) => {
    const kitRoot = locateKitRoot(root);
    if (kitRoot !== join(root, plan.source.kitPath)) refuse('promotion-kit-mismatch');
    const budget = createSourceBudget({ maxSourceBytes: plan.limits.maxSourceBytes });
    const files = captureFiles(kitRoot, plan.limits, budget);
    const model = loadStores(kitRoot, { sourceBudget: budget });
    if (!model.ok || getIdentityIndexDescriptor(model.identityIndex).identityDigest !== canonicalSha256(model.identity)) refuse('promotion-unhealthy-source');
    if (!model.stores[policy.store].present) refuse('promotion-proposal-unavailable');
    for (const row of plan.selected) if (row.proposalRef.namespace !== model.identity.namespace
      || row.canonicalRef.namespace !== model.identity.namespace) refuse('promotion-namespace-mismatch');
    const allocation = planAllocations(model.identity, { kind: plan.kind, count: plan.selected.length, publication: plan.publication });
    if (!allocation.ok) throw new PromotionRefusal(allocation.code, allocation.diagnostics);
    if (plan.selected.some((row, i) => row.canonicalRef.id !== allocation.ids[i])) refuse('promotion-allocation-mismatch');
    const kinds = Object.entries({ knowledge: 'knowledge', ontology: 'ontology', decision: 'decisions' })
      .filter(([, store]) => model.stores[store].present).map(([kind]) => kind);
    const records = [...iterateCurrentRecords(model, { kinds }), ...iterateProposalRecords(model, { kinds })];
    for (const row of records) {
      const document = files.get(row.entry.file);
      if (!document) refuse('promotion-record-unavailable', row.entry.file, []);
      document.kind = { knowledge: 'knowledge-leaf', ontology: 'ontology-concept', decision: 'decision-entry' }[(row.ref ?? row.proposalRef).kind];
    }
    for (const document of files.values()) {
      if (/\.(?:ya?ml|json)$/.test(document.file) || document.kind === 'knowledge-leaf') document.parsed = parseSource(document);
    }
    const proposals = new Map(iterateProposalRecords(model, { kinds: [plan.kind] }).map((row) => [row.proposalRef.key, row]));
    const targets = new Map(plan.selected.map((row) => [row.proposalRef.key, row.canonicalRef.id]));
    const prefix = plan.source.kitPath === '.' ? '' : `${plan.source.kitPath}/`;
    const captures = new Map();
    const capture = (file) => {
      if (!captures.has(file)) {
        const actual = captureCommittedFile({ repoRoot: plan.repoRoot, commit: pair.commit, file: prefix + file });
        if (!actual.bytes.equals(files.get(file).bytes)) refuse('promotion-source-mismatch', file, []);
        captures.set(file, actual);
      }
      return captures.get(file);
    };
    for (const selected of plan.selected) {
      const proposal = proposals.get(selected.proposalRef.key);
      if (!proposal) refuse('promotion-proposal-unavailable');
      const document = files.get(proposal.entry.file);
      const parsed = parseRecordFile({ kind: plan.kind, file: document.file, text: document.bytes.toString() });
      if (!parsed.ok) refuse('promotion-unhealthy-source', document.file, []);
      const matches = parsed.occurrences.filter(({ entry }) => entry.id === selected.proposalRef.key);
      if (matches.length !== 1 || !isDeepStrictEqual(matches[0].entry, proposal.entry)) refuse('promotion-proposal-unavailable');
      const lifecycle = at(proposal.entry.record, policy.lifecycle);
      if (plan.kind === 'decision' ? lifecycle !== 'proposed' : !isPrePromotionStatus(lifecycle)) refuse('promotion-lifecycle-refused', document.file, []);
      if (!isDeepStrictEqual(capture(document.file).locator, selected.beforeCapture)) refuse('promotion-capture-mismatch', document.file, []);
      const owner = plan.kind === 'knowledge' ? [] : ['entries', parsed.document.entries.findIndex(({ id }) => id === selected.proposalRef.key)];
      patchScalar(document, [...owner, 'id'], selected.canonicalRef.id);
      patchScalar(document, [...owner, ...policy.lifecycle], selected.targetLifecycle);
      for (const field of REF_FIELDS[policy.schema]) {
        const path = Array.isArray(field.field) ? field.field : field.field.split('.');
        const value = at(proposal.entry.record, path);
        if (value === undefined) continue;
        for (const [i, target] of (field.scalar ? [value] : value).entries()) {
          if (field.space === policy.space && targets.has(target)) patchScalar(document,
            [...owner, ...path, ...(field.scalar ? [] : [i])], targets.get(target));
        }
      }
    }
    const catalog = files.get(`${policy.store}/_catalog.yaml`);
    if (catalog) catalog.parsed.value.entries.forEach((row, i) => {
      if (targets.has(row.id)) patchScalar(catalog, ['entries', i, 'id'], targets.get(row.id));
    });
    // Every parsed scalar outside the precise rewrite set remains outside scope.
    // Escaped YAML/JSON spellings are inspected after parsing, not just by grep.
    for (const document of files.values()) {
      for (const key of document.parsed?.spans.keys() ?? []) {
        const path = JSON.parse(key); const value = at(document.parsed.value, path);
        if (typeof value === 'string' && [...targets.keys()].some((id) => value.includes(id)) && !document.patches.has(key)) {
          refuse('promotion-reference-outside-scope', document.file, path);
        }
      }
      const masked = Buffer.from(document.bytes);
      for (const patch of document.patches.values()) masked.fill(32, patch.start, patch.end);
      if ([...targets.keys()].some((id) => masked.includes(Buffer.from(id)))) refuse('promotion-reference-outside-scope', document.file, ['$unclassified']);
    }
    const ledger = files.get('_identity.yaml');
    const newRows = allocation.ledger.allocations.slice(model.identity.allocations.length);
    const extended = extendLedger(ledger, newRows);
    if (!validateIdentityTransition(model.identity, extended.identity).ok) refuse('promotion-identity-transition');
    const changes = [];
    for (const document of files.values()) {
      if (document !== ledger && !document.patches.size) continue;
      const bytes = document === ledger ? extended.bytes : applyPatches(document);
      if (bytes.length > plan.limits.maxFileBytes) refuse('promotion-source-budget', document.file, []);
      const actual = capture(document.file);
      changes.push({ file: prefix + document.file, before: { mode: actual.mode, capture: actual.locator },
        after: { mode: actual.mode, bytes } });
    }
    changes.sort((a, b) => order(a.file, b.file));
    return { ok: true, publicationReady: false, source: { ...plan.source }, identity: extended.identity,
      createdRefs: plan.selected.map(({ canonicalRef }) => ({ ...canonicalRef })), changes,
      resources: { sourceReads: getSourceBudgetUsage(budget) } };
  });
}

/**
 * Proves only the selected record transformation and scanned committed scope.
 * Source budget covers snapshot scan and loader reads; native Git capture,
 * materialization and parser allocations retain their separate fixed limits.
 * Consumption/history, governance, final validation and publication remain gates.
 */
async function execute(input, typed) {
  try { return await planCaptured(admit(input, typed)); }
  catch (error) {
    if (error instanceof PromotionRefusal) return { ok: false, publicationReady: false, code: error.code, diagnostics: error.diagnostics ?? [] };
    if (error instanceof SourceBudgetError || error instanceof CapturedInputError || error instanceof SourceDocumentError || error instanceof YAMLException) {
      return { ok: false, publicationReady: false, code: error.code ?? 'promotion-source-unsupported', diagnostics: [] };
    }
    throw error;
  }
}

/** Existing Decisions-only contract: proposed to accepted, without version/kind. */
export async function planCapturedDecisionPromotion(input) {
  return execute(input, false);
}

/** Version 1 homogeneous K/O byte plan. Evidence, history and approval are separate gates. */
export async function planCapturedRecordPromotion(input) {
  return execute(input, true);
}
