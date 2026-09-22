/** Actual historical/current operational readers; private expected bytes never escape. */
import { isDeepStrictEqual } from 'node:util';
import { createHash } from 'node:crypto';
import { canonicalJsonBytes } from './canonical-json.js';
import { EngineRefusal } from './engine-refusal.js';
import { captureCommittedFile } from './captured-source.js';
import { parseSource } from './yaml-source.js';
import { rewriteIdentityCandidate } from './identity-migration.js';
import { validateStoreFile } from './validate-record.js';
import { validateStoreFile as validateHistorical } from '../compatibility/identity-migration-08066b5/engine/lib/validate-record.js';
import { unaccountedEditions } from './phoenix.js';
import { unaccountedEditions as historicalEditions } from '../compatibility/identity-migration-08066b5/engine/lib/phoenix.js';

const roles = new Set(['phoenix-event', 'finding', 'gap', 'miss']);
const versions = { 'knowledge-leaf': 3, 'ontology-concept': 2, 'decision-entry': 2,
  catalog: 2, registry: 2, 'graduation-categories': 2, 'phoenix-event': 2, finding: 2, gap: 2, miss: 1 };
const refuse = () => { throw new EngineRefusal('migration operational history unavailable or changed'); };
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');

function references(kind, record, identity) {
  if (kind === 'phoenix-event') {
    identity('decision', record.decision);
    for (const row of record.leaves) identity('knowledge', row.id);
  } else if (kind === 'finding' || kind === 'gap') {
    for (const [field, space] of [['concepts', 'ontology'], ['leaves', 'knowledge']]) {
      for (const id of record.consulted?.[field] ?? []) identity(space, id);
    }
  }
}

function editions(model, validate) {
  const findings = validate(model);
  if (findings.length) refuse();
  // File order is independent of identity allocation; event/row order stays native.
  return { findings, leaves: [...model.leaves.values()].sort((a, b) => a.file < b.file ? -1 : a.file > b.file ? 1 : 0)
    .map(({ file, record }) => ({ file, id: record.id, edition: record.edition,
      events: [...model.phoenix.values()].filter((event) => event.rows.get(record.id)?.to !== undefined).map((event) => event.event) })) };
}

/** Called after fresh mechanical proof, inside the captured fixed worker. */
export function proveMigrationOperationalHistory({ repoRoot, source, candidate, documents, migrationInputs,
  beforeModel, candidateModel, identity, maxBytes }) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) refuse();
  // Reuse the exact source-span owner, including reviewed prose edits. This is
  // not a second ID replacer or permission to normalize arbitrary scalar text.
  const expected = rewriteIdentityCandidate(documents, { ...migrationInputs, targetVersions: versions });
  if (!expected.ok) refuse();
  const expectedFiles = new Map(expected.files.map((row) => [row.file, row]));
  const result = { policy: 'migration-operational-history-v1', status: 'complete', documents: [], editions: null };
  let remaining = maxBytes;
  for (const document of documents.filter((row) => roles.has(row.kind))) {
    const captured = captureCommittedFile({ repoRoot, commit: candidate.commit, file: document.file });
    if (!captured.bytes.equals(expectedFiles.get(document.file)?.bytes)) refuse();
    const before = parseSource(document).value;
    const after = parseSource({ ...document, bytes: captured.bytes }).value;
    const oldValidation = validateHistorical(document.kind, before);
    const newValidation = validateStoreFile(document.kind, after);
    if (!oldValidation.ok || !newValidation.ok) refuse();
    references(document.kind, before, identity.before);
    references(document.kind, after, identity.candidate);
    const row = { file: document.file, kind: document.kind,
      before: { sha256: hash(document.bytes), size: document.bytes.length, record: before, validation: oldValidation },
      candidate: { capture: captured.locator, size: captured.bytes.length, record: after, validation: newValidation },
      comparison: { status: 'complete', policy: 'mechanical-exact-source-spans' } };
    if (!isDeepStrictEqual(captured.locator.source, { commit: candidate.commit, tree: candidate.tree })) refuse();
    remaining -= canonicalJsonBytes(row).length;
    if (remaining < 0) refuse();
    result.documents.push(row);
  }
  const oldEditions = editions(beforeModel, historicalEditions);
  const newEditions = editions(candidateModel, unaccountedEditions);
  const mapped = oldEditions.leaves.map((row) => ({ ...row, id: identity.before('knowledge', row.id) }));
  for (const row of newEditions.leaves) identity.candidate('knowledge', row.id);
  if (!isDeepStrictEqual(mapped, newEditions.leaves)) refuse();
  result.editions = { before: oldEditions, candidate: newEditions, comparison: { status: 'complete' } };
  // Includes envelope overhead; allocations remain governed by the worker deadline/output cap.
  if (canonicalJsonBytes(result).length > maxBytes || source.kitPath !== candidate.kitPath) refuse();
  return result;
}
