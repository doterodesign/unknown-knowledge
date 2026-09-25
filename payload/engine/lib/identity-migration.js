/** Offline 2.x -> 3.0 store conversion; never imported by canonical record lookup. */
import { YAMLException } from 'js-yaml';
import { parseSource, SourceDocumentError } from './yaml-source.js';
import { REF_FIELDS } from './load-stores.js';
import { planAllocations, validateIdentityLedger } from './identity-ledger.js';
import { isIdentityUuid, parseProposalKey } from './record-identity.js';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { posix } from 'node:path';
import { isCaptureLocator } from './capture-locator.js';

const RECORD_KINDS = Object.freeze({ 'decision-entry': 'decision', 'ontology-concept': 'ontology', 'knowledge-leaf': 'knowledge' });
const REF_KINDS = Object.freeze({ decisions: 'decision', concepts: 'ontology', leaves: 'knowledge' });
const AUXILIARY_KINDS = new Set(['catalog', 'registry', 'graduation-categories', 'phoenix-event', 'finding', 'gap', 'miss']);
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const keyOf = (value) => JSON.stringify(value);
/** Inventory exact source strings before any map can collapse duplicate IDs. */
export function inventorySourceDocuments(documents, { adjudications = [] } = {}) {
  const records = [];
  const declarations = [];
  const references = [];
  const diagnostics = [];
  const reviewRequired = [];
  const seenFiles = new Set();
  for (const input of [...documents].sort((a, b) => compare(a.file, b.file))) {
    const { file, kind } = input;
    if (seenFiles.has(file)) {
      diagnostics.push({ code: 'duplicate-source-file', file, path: [] });
      continue;
    }
    seenFiles.add(file);
    if (!Object.hasOwn(RECORD_KINDS, kind) && !AUXILIARY_KINDS.has(kind)) {
      diagnostics.push({ code: 'unsupported-source-kind', file, path: [], message: kind });
      continue;
    }
    let parsed;
    try {
      parsed = parseSource(input);
    } catch (error) {
      if (!(error instanceof SourceDocumentError) && !(error instanceof YAMLException)) throw error;
      diagnostics.push({ code: error.code ?? 'invalid-source-yaml', file, path: [], line: error.line ?? (error.mark?.line ?? 0) + 1, message: error.reason ?? error.message });
      continue;
    }
    const usedPaths = new Set();
    const addRef = (targetKind, id, path, { owner, use = 'navigation' } = {}) => {
      if (!targetKind || typeof id !== 'string' || !id || !parsed.spans.has(keyOf(path))) {
        diagnostics.push({ code: 'invalid-source-reference', file, path });
        return;
      }
      usedPaths.add(keyOf(path));
      references.push({ kind: targetKind, id, file, path, span: parsed.spans.get(keyOf(path)), owner, use });
    };
    if (AUXILIARY_KINDS.has(kind)) {
      const doc = parsed.value;
      const rowRefs = (field, idField, targetKind, use = 'navigation') => {
        if (!Array.isArray(doc?.[field])) {
          diagnostics.push({ code: 'invalid-source-records', file, path: [field] });
          return;
        }
        doc[field].forEach((row, i) => addRef(targetKind, row?.[idField], [field, i, idField], { use }));
      };
      if (kind === 'catalog') {
        const targetKind = { decisions: 'decision', ontology: 'ontology', knowledge: 'knowledge' }[doc?.store];
        rowRefs('entries', 'id', targetKind);
        for (const [i, row] of (Array.isArray(doc?.entries) ? doc.entries : []).entries()) {
          const path = ['entries', i, 'id'];
          const pending = row?.file === 'pending-import';
          const validTarget = typeof row?.file === 'string' && isCaptureLocator({ file: row.file, blob: '1'.repeat(40), sha256: '1'.repeat(64) });
          if (!targetKind || !file.endsWith(`${doc.store}/_catalog.yaml`)
            || (file !== `${doc.store}/_catalog.yaml` && !file.endsWith(`/${doc.store}/_catalog.yaml`))
            || typeof row?.id !== 'string' || !row.id || !parsed.spans.has(keyOf(path)) || !validTarget
            || (pending && (doc['schema-version'] !== 1 || typeof row.title !== 'string' || !row.title.trim()
              || Object.keys(row).some((key) => !['id', 'title', 'file'].includes(key))))) {
            diagnostics.push({ code: 'invalid-source-declaration', file, path });
            continue;
          }
          declarations.push({ kind: targetKind, id: row.id, file, path,
            span: parsed.spans.get(keyOf(path)),
            target: pending ? 'pending-import' : posix.join(posix.dirname(file), row.file),
            locator: { file, path: ['entries', i] } });
        }
      }
      if (kind === 'registry') rowRefs('values', 'decision', 'decision', 'authorizer');
      if (kind === 'graduation-categories') rowRefs('categories', 'decision', 'decision', 'authorizer');
      if (kind === 'phoenix-event') {
        addRef('decision', doc?.decision, ['decision'], { use: 'authorizer' });
        rowRefs('leaves', 'id', 'knowledge');
      }
      if (kind === 'finding' || kind === 'gap') {
        for (const [field, targetKind] of [['concepts', 'ontology'], ['leaves', 'knowledge']]) {
          const values = doc?.consulted?.[field];
          if (values === undefined) continue;
          if (!Array.isArray(values)) diagnostics.push({ code: 'invalid-source-reference', file, path: ['consulted', field] });
          else values.forEach((id, i) => addRef(targetKind, id, ['consulted', field, i]));
        }
      }
    }
    const rows = AUXILIARY_KINDS.has(kind) ? [] : kind === 'knowledge-leaf' ? [parsed.value] : parsed.value?.entries;
    if (!Array.isArray(rows)) {
      diagnostics.push({ code: 'invalid-source-records', file, path: ['entries'] });
      continue;
    }
    for (const [index, record] of rows.entries()) {
      const basePath = kind === 'knowledge-leaf' ? [] : ['entries', index];
      const path = [...basePath, 'id'];
      const span = parsed.spans.get(keyOf(path));
      if (typeof record?.id !== 'string' || !record.id || !span) {
        diagnostics.push({ code: 'invalid-source-id', file, path, line: span?.line });
        continue;
      }
      const source = { kind: RECORD_KINDS[kind], id: record.id, file, path };
      const lifecycle = kind === 'knowledge-leaf' ? record.facets?.stage : record.status;
      const proposalRequired = ['draft', 'proposed'].includes(lifecycle)
        || (kind === 'decision-entry' && lifecycle === 'rejected' && /^D-[0-9]{4}-[0-9]{2}-[0-9]{2}-/.test(record.id));
      const sourceKey = keyOf([source.kind, source.id, file, path]);
      records.push({ ...source, span, lifecycle, proposalRequired, key: sourceKey });
      usedPaths.add(keyOf(path));
      for (const field of REF_FIELDS[kind]) {
        const segments = Array.isArray(field.field) ? field.field : field.field.split('.');
        const values = segments.reduce((value, segment) => value?.[segment], record);
        if (values === undefined) continue;
        const fieldPath = [...basePath, ...segments];
        if (!field.scalar && !Array.isArray(values)) {
          diagnostics.push({ code: 'invalid-source-reference', file, path: fieldPath });
          continue;
        }
        for (const [refIndex, id] of (field.scalar ? [values] : values).entries()) {
          const refPath = field.scalar ? fieldPath : [...fieldPath, refIndex];
          addRef(REF_KINDS[field.space], id, refPath, {
            owner: sourceKey,
            use: kind === 'knowledge-leaf' && segments.join('.') === 'relates.depends-on' ? 'dependency' : 'navigation',
          });
        }
      }
    }
    // Hints for human classification, never automatic old-ID inference or a
    // claim that arbitrary external consumers have been exhaustively found.
    for (const [pathKey, span] of parsed.spans) {
      if (usedPaths.has(pathKey)) continue;
      const path = JSON.parse(pathKey);
      const value = path.reduce((row, part) => row?.[part], parsed.value);
      if (typeof value === 'string' && /\b[KLOD]-[\w-]+/.test(value)) {
        reviewRequired.push({ file, path, span, reason: 'untyped-possible-reference' });
      }
    }
    if (parsed.body && /\b[KLOD]-[\w-]+/.test(parsed.body.text)) {
      reviewRequired.push({ file, path: ['$body'], span: parsed.body.span, reason: 'untyped-possible-reference' });
    }
  }
  const declarationGroups = new Map();
  for (const declaration of declarations) {
    const identity = keyOf([declaration.kind, declaration.id]);
    if (!declarationGroups.has(identity)) declarationGroups.set(identity, []);
    declarationGroups.get(identity).push(declaration);
  }
  for (const group of declarationGroups.values()) {
    if (group.length !== 1) {
      for (const row of group) diagnostics.push({ code: 'duplicate-source-declaration', file: row.file, path: row.path });
      continue;
    }
    const row = group[0];
    const payloads = records.filter((record) => record.kind === row.kind && record.id === row.id);
    if (row.target === 'pending-import' && payloads.length === 0) {
      records.push({ kind: row.kind, id: row.id, file: row.file, path: row.path, span: row.span,
        availability: 'declared-only', lifecycle: null, proposalRequired: false,
        declaration: { target: row.target, locator: row.locator },
        key: keyOf([row.kind, row.id, row.file, row.path]) });
    } else if (row.target === 'pending-import' || payloads.some((record) => record.file !== row.target)) {
      diagnostics.push({ code: 'source-declaration-target-mismatch', file: row.file, path: row.path });
    } else if (payloads.length === 0) {
      diagnostics.push({ code: 'unsupported-missing-declaration-target', file: row.file, path: row.path });
    }
  }
  records.sort((a, b) => compare(a.kind, b.kind) || compare(a.id, b.id) || compare(a.key, b.key));
  const byIdentity = new Map();
  for (const record of records) {
    const identity = keyOf([record.kind, record.id]);
    if (byIdentity.has(identity)) diagnostics.push({ code: 'duplicate-source-id', severity: 'warning', file: record.file, path: record.path });
    if (!byIdentity.has(identity)) byIdentity.set(identity, []);
    byIdentity.get(identity).push(record);
  }
  const usedAdjudications = new Set();
  for (const ref of references) {
    const targets = byIdentity.get(keyOf([ref.kind, ref.id])) ?? [];
    const choices = adjudications.filter((row) => row.file === ref.file && keyOf(row.path) === keyOf(ref.path));
    choices.forEach((choice) => usedAdjudications.add(choice));
    if (choices.length) {
      if (choices.length === 1 && targets.some((record) => record.key === choices[0].target)) {
        ref.status = 'adjudicated';
        ref.target = choices[0].target;
        continue;
      }
      diagnostics.push({ code: 'invalid-reference-adjudication', file: ref.file, path: ref.path });
      ref.status = 'invalid-adjudication';
      continue;
    }
    ref.status = targets.length === 1 ? 'resolved' : targets.length ? 'ambiguous' : 'missing';
    if (targets.length === 1) ref.target = targets[0].key;
    else diagnostics.push({ code: `${ref.status}-source-reference`, file: ref.file, path: ref.path });
  }
  for (const choice of adjudications) {
    if (!usedAdjudications.has(choice)) diagnostics.push({ code: 'unused-reference-adjudication', file: choice.file, path: choice.path });
  }
  return { ok: !diagnostics.some((item) => item.severity !== 'warning'), coverage: 'supplied-documents-only', records, declarations, references, reviewRequired, diagnostics };
}

/** Private offline planning result; callers must discard correspondence. */
export function planIdentityCorrespondence(documents, options) {
  const inventory = inventorySourceDocuments(documents, options);
  if (!inventory.ok) return { ok: false, code: 'invalid-source-inventory', diagnostics: inventory.diagnostics };
  const before = { 'schema-version': 1, 'identity-format': 1, namespace: options.namespace, allocations: [] };
  const checked = validateIdentityLedger(before);
  if (!checked.ok) return { ok: false, code: 'invalid-cutover-identity', diagnostics: checked.diagnostics };
  if (!isIdentityUuid(options.publication?.id) || typeof options.publication?.review !== 'string' || !options.publication.review.trim()) {
    return { ok: false, code: 'invalid-cutover-publication' };
  }
  const declarationChoices = options.declarations ?? [];
  if (!Array.isArray(declarationChoices)) return { ok: false, code: 'invalid-declaration-disposition' };
  const declared = new Map(inventory.records.filter((record) => record.availability === 'declared-only').map((record) => [record.key, record]));
  const allocatedDeclarations = new Set();
  for (const choice of declarationChoices) {
    if (!choice || typeof choice !== 'object' || Array.isArray(choice)
      || Object.keys(choice).length !== 2 || !Object.hasOwn(choice, 'source') || !Object.hasOwn(choice, 'disposition')
      || !declared.has(choice.source) || allocatedDeclarations.has(choice.source)) {
      return { ok: false, code: 'invalid-declaration-disposition' };
    }
    if (choice.disposition === 'proposal'
      || ['knowledge', 'ontology', 'decision', 'subject'].some((kind) => parseProposalKey(kind, declared.get(choice.source).id).ok)) {
      return { ok: false, code: 'declared-only-proposal-unsupported' };
    }
    if (choice.disposition !== 'allocate') return { ok: false, code: 'invalid-declaration-disposition' };
    allocatedDeclarations.add(choice.source);
  }
  if (allocatedDeclarations.size !== declared.size) return { ok: false, code: 'declaration-disposition-required' };
  const proposals = new Map();
  const proposalIds = new Set();
  for (const choice of options.proposals ?? []) {
    const record = inventory.records.find((row) => row.key === choice.source);
    if (!record?.proposalRequired || proposals.has(choice.source) || proposalIds.has(choice.id)
      || !parseProposalKey(record.kind, choice.id).ok) {
      return { ok: false, code: 'invalid-proposal-disposition' };
    }
    proposals.set(choice.source, choice.id);
    proposalIds.add(choice.id);
  }
  if (inventory.records.some((record) => record.proposalRequired && !proposals.has(record.key))) {
    return { ok: false, code: 'proposal-disposition-required' };
  }
  const sources = new Map(inventory.records.map((record) => [record.key, record]));
  const dependencies = inventory.references.filter((ref) => ['dependency', 'authorizer'].includes(ref.use));
  const unavailable = dependencies.filter((ref) => sources.get(ref.target)?.availability === 'declared-only');
  if (unavailable.length) return { ok: false, code: 'source-dependency-payload-unavailable',
    diagnostics: unavailable.map((ref) => ({ code: 'source-dependency-payload-unavailable', file: ref.file, path: ref.path })) };
  const rejected = dependencies.filter((ref) => ['rejected', 'suppressed'].includes(sources.get(ref.target)?.lifecycle));
  if (rejected.length) return {
    ok: false, code: 'rejected-source-dependency',
    diagnostics: rejected.map((ref) => ({ code: 'rejected-source-dependency', file: ref.file, path: ref.path })),
  };
  const blocked = dependencies.filter((ref) =>
    sources.get(ref.target)?.proposalRequired && !sources.get(ref.owner)?.proposalRequired);
  if (blocked.length) return {
    ok: false, code: 'effective-proposal-dependency',
    diagnostics: blocked.map((ref) => ({ code: 'effective-proposal-dependency', file: ref.file, path: ref.path })),
  };
  const correspondence = [];
  const allocations = [];
  for (const kind of ['decision', 'knowledge', 'ontology']) {
    const records = inventory.records.filter((record) => record.kind === kind);
    const finalCount = records.filter((record) => !record.proposalRequired).length;
    let ids = [];
    if (finalCount) {
      const plan = planAllocations(before, { kind, count: finalCount, publication: options.publication });
      if (!plan.ok) return plan;
      allocations.push(...plan.ledger.allocations);
      ids = plan.ids;
    }
    let finalIndex = 0;
    records.forEach((record) => correspondence.push({
      source: record.key,
      target: { namespace: options.namespace, kind, id: record.proposalRequired ? proposals.get(record.key) : ids[finalIndex++] },
    }));
  }
  const ledger = { ...before, allocations };
  const valid = validateIdentityLedger(ledger);
  if (!valid.ok) return { ok: false, code: 'invalid-cutover-identity', diagnostics: valid.diagnostics };
  const targets = new Map(correspondence.map((row) => [row.source, row.target]));
  const references = inventory.references.map((ref) => ({
    file: ref.file, path: ref.path, span: ref.span, target: targets.get(ref.target),
    use: ref.use, targetLifecycle: sources.get(ref.target)?.lifecycle,
    inspectionOnly: ['rejected', 'suppressed'].includes(sources.get(ref.target)?.lifecycle),
  }));
  return { ok: true, publicationReady: false, correspondence, ledger, references, reviewRequired: inventory.reviewRequired };
}

// Representation versions agreed with the target runtime. Declaring these does
// not activate its schemas or substitute for validating the complete candidate.
export const TARGET_VERSIONS = Object.freeze({
  'knowledge-leaf': 3, 'ontology-concept': 2, 'decision-entry': 2,
  catalog: 2, registry: 2, 'graduation-categories': 2, 'phoenix-event': 2,
  finding: 2, gap: 2, miss: 1,
});
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const setAt = (value, path, replacement) => {
  const parent = path.slice(0, -1).reduce((row, part) => row[part], value);
  parent[path.at(-1)] = replacement;
};

/**
 * Pure offline representation rewrite over original UTF-8 buffers. Never
 * promotes lifecycle or serializes YAML. The old-to-new mapping is returned for
 * display only; nothing retains it in the converted installation. Unknown
 * extensions, external consumers and target validation stay with the caller.
 */
export function rewriteIdentityCandidate(documents, options) {
  const refuse = (code, details = {}) => ({ ok: false, publicationReady: false, code, ...details });
  if (!isDeepStrictEqual(options.targetVersions, TARGET_VERSIONS)) return refuse('unsupported-target-versions');
  if (documents.length === 0) return refuse('empty-source-documents');
  const inventory = inventorySourceDocuments(documents, options);
  const plan = planIdentityCorrespondence(documents, options);
  if (!plan.ok) return { ...plan, publicationReady: false };
  const targets = new Map(plan.correspondence.map((row) => [row.source, row.target.id]));
  const records = new Map(inventory.records.map((row) => [row.key, row]));
  const inputs = new Map(documents.map((input) => {
    const parsed = parseSource(input);
    return [input.file, { ...input, parsed, expected: structuredClone(parsed.value), patches: [], prosePaths: [] }];
  }));
  const diagnostics = [];
  const scalarPatch = (file, path, span, before, after) => {
    const input = inputs.get(file);
    const raw = input.bytes.subarray(span.start, span.end).toString('utf8');
    if (!['plain', 'single-quoted', 'double-quoted'].includes(span.style) || raw !== String(before) || /[\r\n]/.test(raw)) {
      diagnostics.push({ code: 'unsupported-scalar-rewrite', file, path, line: span.line });
      return;
    }
    input.patches.push({ start: span.start, end: span.end, bytes: Buffer.from(String(after)) });
    setAt(input.expected, path, after);
  };
  for (const input of inputs.values()) {
    const path = ['schema-version'];
    const span = input.parsed.spans.get(keyOf(path));
    const sourceVersion = input.kind === 'knowledge-leaf' ? 2 : 1;
    if (!span || input.parsed.value?.['schema-version'] !== sourceVersion) {
      diagnostics.push({ code: 'unsupported-source-version', file: input.file, path });
    } else scalarPatch(input.file, path, span, sourceVersion, TARGET_VERSIONS[input.kind]);
  }
  // A declaration's ID is already patched through its catalog reference below.
  for (const record of inventory.records) if (record.availability !== 'declared-only') {
    scalarPatch(record.file, record.path, record.span, record.id, targets.get(record.key));
  }
  for (const ref of inventory.references) scalarPatch(ref.file, ref.path, ref.span, ref.id, targets.get(ref.target));
  if (diagnostics.length) return refuse('unsupported-source-rewrite', { diagnostics });

  const decisions = options.proseDecisions ?? [];
  const usedDecisions = new Set();
  for (const hint of inventory.reviewRequired) {
    const choices = decisions.filter((choice) => choice.file === hint.file && keyOf(choice.path) === keyOf(hint.path));
    if (choices.length !== 1) return refuse(choices.length ? 'duplicate-prose-adjudication' : 'prose-adjudication-required', { reviewRequired: inventory.reviewRequired });
    const choice = choices[0];
    usedDecisions.add(choice);
    if (typeof choice.review !== 'string' || !choice.review.trim()) return refuse('unreviewed-prose-adjudication');
    if (choice.action === 'preserve') {
      if (choice.classification !== 'non-operational-evidence' || Object.hasOwn(choice, 'edits')) return refuse('invalid-prose-preservation');
      continue;
    }
    if (choice.action !== 'rewrite' || !Array.isArray(choice.edits) || !choice.edits.length) return refuse('invalid-prose-adjudication');
    const input = inputs.get(hint.file);
    for (const edit of choice.edits) {
      const source = records.get(edit.source);
      const atBoundary = (offset) => offset < 0 || offset >= input.bytes.length
        || !/[A-Za-z0-9_:-]/.test(String.fromCharCode(input.bytes[offset]));
      if (!source || typeof edit.expected !== 'string' || edit.expected !== source.id
        || !Number.isSafeInteger(edit.start) || !Number.isSafeInteger(edit.end)
        || edit.start < hint.span.start || edit.end > hint.span.end || edit.start >= edit.end
        || !atBoundary(edit.start - 1) || !atBoundary(edit.end)
        || !input.bytes.subarray(edit.start, edit.end).equals(Buffer.from(edit.expected))) {
        return refuse('invalid-prose-edit', { diagnostics: [{ code: 'invalid-prose-edit', file: hint.file, path: hint.path }] });
      }
      input.patches.push({ start: edit.start, end: edit.end, bytes: Buffer.from(targets.get(edit.source)) });
    }
    if (hint.path[0] !== '$body') input.prosePaths.push(hint.path);
  }
  if (usedDecisions.size !== decisions.length) return refuse('unused-prose-adjudication');

  const files = [];
  for (const input of [...inputs.values()].sort((a, b) => compare(a.file, b.file))) {
    const patches = input.patches.sort((a, b) => a.start - b.start || a.end - b.end);
    const chunks = [];
    let end = 0;
    for (const patch of patches) {
      if (patch.start < end) return refuse('overlapping-source-edits', { diagnostics: [{ code: 'overlapping-source-edits', file: input.file }] });
      chunks.push(input.bytes.subarray(end, patch.start), patch.bytes);
      end = patch.end;
    }
    chunks.push(input.bytes.subarray(end));
    const bytes = Buffer.concat(chunks);
    let candidate;
    try {
      candidate = parseSource({ ...input, bytes });
    } catch (error) {
      if (!(error instanceof SourceDocumentError) && !(error instanceof YAMLException)) throw error;
      return refuse('invalid-rewritten-source', { diagnostics: [{ code: 'invalid-rewritten-source', file: input.file }] });
    }
    // Only reviewed prose scalar values may differ from the exact expected
    // identity/version tree. Every byte outside the declared patches is copied.
    for (const path of input.prosePaths) {
      const value = path.reduce((row, part) => row?.[part], candidate.value);
      if (typeof value !== 'string') return refuse('rewritten-prose-type-change');
      setAt(input.expected, path, value);
    }
    if (!isDeepStrictEqual(candidate.value, input.expected)) return refuse('rewritten-content-change', { diagnostics: [{ code: 'rewritten-content-change', file: input.file }] });
    files.push({ file: input.file, kind: input.kind, beforeSha256: sha256(input.bytes), sha256: sha256(bytes), bytes });
  }
  return {
    ok: true, publicationReady: false, coverage: 'supplied-documents-only',
    targetValidation: 'pending', targetVersions: { ...TARGET_VERSIONS },
    files, identity: plan.ledger, reviewRequired: [], diagnostics: inventory.diagnostics,
    mapping: plan.correspondence.map(({ source, target }) => {
      const record = records.get(source);
      return { kind: record.kind, from: record.id, to: target.id, file: record.file };
    }),
  };
}

/** The 2.x store document kind at a kit-relative path, or null. */
export function sourceKind(path) {
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

const TOKEN_CHAR = /[A-Za-z0-9_:-]/;

/**
 * Byte ranges in `bytes[start, end)` where `token` stands alone as a word. A
 * token inside a path (`knowledge/L-1.md`) is a file name, not a citation.
 */
function tokenRanges(bytes, start, end, token) {
  const needle = Buffer.from(token);
  const char = (at) => at >= 0 && at < bytes.length ? String.fromCharCode(bytes[at]) : '';
  const ranges = [];
  for (let at = bytes.indexOf(needle, start); at >= 0 && at + needle.length <= end; at = bytes.indexOf(needle, at + 1)) {
    const after = at + needle.length;
    if (TOKEN_CHAR.test(char(at - 1)) || TOKEN_CHAR.test(char(after))) continue;
    if (char(at - 1) === '/' || (char(after) === '.' && /[A-Za-z0-9]/.test(char(after + 1)))) continue;
    ranges.push([at, after]);
  }
  return ranges;
}

/**
 * One-shot conversion of complete 2.x store documents with no manual choices:
 * draft and proposed records get fresh proposal keys, pending-import catalog
 * rows get permanent IDs, and a prose mention that exactly names one record is
 * rewritten with its citation. A mention naming no record, or several, stays as
 * written and is reported. Refuses (ok: false) on any source defect, such as a
 * duplicate ID or a citation that names no record.
 *
 * @param {{file: string, kind: string, bytes: Buffer}[]} documents
 * @param {{namespace: string, publication: {id: string, review: string}, proposalKey: (kind: string) => string}} options
 */
export function convertStoreDocuments(documents, { namespace, publication, proposalKey }) {
  const inventory = inventorySourceDocuments(documents);
  if (!inventory.ok) return { ok: false, code: 'invalid-source-inventory', diagnostics: inventory.diagnostics };
  const payloads = inventory.records.filter((record) => record.availability !== 'declared-only');
  const byId = new Map();
  for (const record of inventory.records) byId.set(record.id, [...(byId.get(record.id) ?? []), record]);
  const bytesOf = new Map(documents.map((input) => [input.file, input.bytes]));
  const prose = [];
  const kept = [];
  const proseDecisions = inventory.reviewRequired.map((hint) => {
    const bytes = bytesOf.get(hint.file);
    const edits = [];
    for (const [id, records] of byId) {
      const ranges = tokenRanges(bytes, hint.span.start, hint.span.end, id);
      if (!ranges.length) continue;
      if (records.length !== 1) {
        kept.push({ file: hint.file, path: hint.path, id, reason: 'ambiguous-record-id' });
        continue;
      }
      for (const [start, end] of ranges) edits.push({ source: records[0].key, expected: id, start, end });
    }
    if (!edits.length) {
      kept.push({ file: hint.file, path: hint.path, reason: 'no-record-id' });
      return { file: hint.file, path: hint.path, action: 'preserve', classification: 'non-operational-evidence', review: 'migrate.js: names no record' };
    }
    prose.push({ file: hint.file, path: hint.path, ids: [...new Set(edits.map((edit) => edit.expected))] });
    return { file: hint.file, path: hint.path, action: 'rewrite', edits, review: 'migrate.js: exact record ID mention' };
  });
  const result = rewriteIdentityCandidate(documents, {
    namespace, publication, targetVersions: TARGET_VERSIONS, proseDecisions,
    proposals: payloads.filter((record) => record.proposalRequired).map((record) => ({ source: record.key, id: proposalKey(record.kind) })),
    declarations: inventory.records.filter((record) => record.availability === 'declared-only')
      .map((record) => ({ source: record.key, disposition: 'allocate' })),
  });
  if (!result.ok) return result;
  // Report only mentions whose ID actually changed; a 2.x decision may already
  // have a canonical-shaped ID that keeps its spelling.
  const changed = new Set(result.mapping.filter((row) => row.from !== row.to).map((row) => row.from));
  const rewritten = prose.map((row) => ({ ...row, ids: row.ids.filter((id) => changed.has(id)) })).filter((row) => row.ids.length);
  return { ok: true, files: result.files, identity: result.identity, mapping: result.mapping, prose: rewritten, kept, diagnostics: result.diagnostics };
}
