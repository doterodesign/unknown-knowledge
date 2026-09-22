/** Current-format on-disk query fixture, read by the actual target loader. */
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { subjectQueryFixture } from './subject-query-fixture.js';
import { getGovernedSubjectRegistry, evaluateSubjectGovernance } from '../../payload/engine/lib/subject-governance.js';
import { describeCandidateBytes } from '../../payload/engine/lib/captured-source.js';
import { canonicalSha256 } from '../../payload/engine/lib/canonical-json.js';
import { loadStores } from '../../payload/engine/lib/load-stores.js';

const wireKeys = { schemaVersion: 'schema-version', hierarchyRevision: 'hierarchy-revision', originDecision: 'origin-decision',
  acceptedStatus: 'accepted-status', decisionCapture: 'decision-capture', decisionDigest: 'decision-digest', changeDigest: 'change-digest' };
function wire(value) {
  if (Array.isArray(value)) return value.map(wire);
  if (value !== null && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [wireKeys[key] ?? key, wire(item)]));
  return value;
}

export function subjectQueryDiskFixture(t, { nested = false, descendants = false, objectFormat = 'sha1' } = {}) {
  assert.ok(['sha1', 'sha256'].includes(objectFormat), 'objectFormat must be sha1 or sha256.');
  const root = mkdtempSync(join(tmpdir(), 'subject-query-current-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const kitRoot = nested ? join(root, 'unknown-knowledge') : root;
  const base = subjectQueryFixture({ descendants });
  const document = structuredClone(getGovernedSubjectRegistry(base.subjectGovernance).document);
  const decision = { ...base.model.decisions.get('D-000001').record, category: 'architecture', date: '2026-09-19',
    deciders: ['steward'], context: 'Observed classification need', decision: 'Approve the reviewed subject meanings' };
  const bytes = Buffer.from(JSON.stringify({ 'schema-version': 2, entries: [decision] }));
  const decisionFile = 'decisions/entries/approval.yaml';
  const capture = describeCandidateBytes({ file: nested ? `unknown-knowledge/${decisionFile}` : decisionFile, bytes, objectFormat });
  const event = document.history[0];
  for (const row of event.rows) row.after.warrant.records[0].capture = capture;
  for (const subject of document.subjects) subject.warrant.records[0].capture = capture;
  const { review, ...eventData } = event;
  event.review = { ...review, decisionCapture: capture, decisionDigest: canonicalSha256(decision), changeDigest: canonicalSha256(eventData) };
  const put = (file, value) => {
    mkdirSync(join(kitRoot, file, '..'), { recursive: true });
    writeFileSync(join(kitRoot, file), typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value));
  };
  put('_identity.yaml', base.model.identity);
  put('subjects/registry.yaml', wire(document));
  put('decisions/_catalog.yaml', { 'schema-version': 2, store: 'decisions', entries: [
    { id: decision.id, title: decision.title, file: 'entries/approval.yaml' },
  ] });
  put(decisionFile, bytes);
  const entries = [];
  for (const entry of [...base.model.leaves.values(), ...base.model.proposals.knowledge.values()]) {
    const id = entry.record.id;
    const file = id.startsWith('proposal:') ? 'draft.md' : `${id}.md`;
    const record = { 'schema-version': 3, id, heading: entry.record.title, domain: 'world',
      citations: [{ source: 'observed-source' }], facets: entry.record.facets,
      ...(Object.hasOwn(entry.record, 'subjects') ? { subjects: entry.record.subjects } : {}) };
    put(`knowledge/${file}`, `---\n${JSON.stringify(record)}\n---\nObserved fixture content.\n`);
    entries.push({ id, title: record.heading, file });
  }
  put('knowledge/_catalog.yaml', { 'schema-version': 2, store: 'knowledge', entries });
  const jurisdictionDocument = { 'schema-version': 2, store: 'knowledge', registry: 'jurisdictions',
    values: ['eu-eaa', 'us-ca'].map((value) => ({ value, gloss: `Scope ${value}`, warrant: 'Reviewed fixture scope', decision: decision.id })) };
  put('knowledge/_registries/jurisdictions.yaml', jurisdictionDocument);
  put('knowledge/_registries/stage.yaml', { 'schema-version': 2, store: 'knowledge', registry: 'stage',
    values: ['draft', 'proposed', 'verified'].map((value) => ({ value, gloss: value, warrant: 'Reviewed fixture lifecycle', decision: decision.id })) });
  const decisionCaptures = [{ capture, bytes, objectFormat }];
  const capturesFile = join(root, 'decision-captures.json');
  writeFileSync(capturesFile, JSON.stringify([{ capture, bytesBase64: bytes.toString('base64'), objectFormat }]));
  const model = loadStores(kitRoot);
  assert.equal(model.ok, true, JSON.stringify(model.diagnostics));
  const checked = evaluateSubjectGovernance({ registry: model.subjectRegistry, identity: model.identity,
    identityIndex: model.identityIndex, decisionCaptures });
  assert.equal(checked.ok, true, JSON.stringify(checked.diagnostics));
  return { root, kitRoot, put, capturesFile, decisionCaptures, jurisdictionDocument, objectFormat,
    context: { model, subjectGovernance: checked.governance } };
}
