/** Actual typed proposal/candidate snapshots; handwritten candidate bytes are inputs, never planner proof. */
import assert from 'node:assert/strict';
import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { load } from 'js-yaml';
import { subjectQueryDiskFixture } from './subject-query-disk-fixture.js';
import { subjectQueryFixture } from './subject-query-fixture.js';
import { sealAssignmentEvent } from './assignment-event-fixture.js';
import { getGovernedSubjectRegistry } from '../../payload/engine/lib/subject-governance.js';
import { captureCommittedFile, describeCandidateBytes } from '../../payload/engine/lib/captured-source.js';
import { canonicalSha256 } from '../../payload/engine/lib/canonical-json.js';
import { planAllocations } from '../../payload/engine/lib/identity-ledger.js';

const today = '2026-09-20';
const eventId = '77777777-7777-4777-8777-777777777777';
const priorEventId = '88888888-8888-4888-8888-888888888888';
const publication = { id: '55555555-5555-4555-8555-555555555555', review: 'review:typed-promotion' };
const wireKeys = { schemaVersion: 'schema-version', hierarchyRevision: 'hierarchy-revision', originDecision: 'origin-decision',
  acceptedStatus: 'accepted-status', decisionCapture: 'decision-capture', decisionDigest: 'decision-digest', changeDigest: 'change-digest' };
const wire = (value) => Array.isArray(value) ? value.map(wire) : value && typeof value === 'object'
  ? Object.fromEntries(Object.entries(value).map(([key, item]) => [wireKeys[key] ?? key, wire(item)])) : value;
const entryFile = (entries) => `{"schema-version":2,"entries":[\n${entries.map((entry) => JSON.stringify(entry)).join(',\n')}\n]}\n`;
const leafFile = (record) => '---\n' + Object.entries(record).map(([key, value]) => `${key}: ${JSON.stringify(value)}\n`).join('')
  + '# Evidence remains unchanged.\n---\nObserved π source evidence.\n';
const baselineRows = (rows) => rows.map((row) => `  - ${JSON.stringify(row)}\n`).join('');

export function typedPromotionFixture(t, { kind = 'ontology', format = 'sha1', nested = false, history = true,
  verified = today, volatility = 'stable', sourcePath = 'src/owned.js', authorityRegistry = true, subjectAuthority = true, unknownSibling = false, retiredSubject = false,
  companionStores, retainedDecisionOwners = false, editDecisionSource } = {}) {
  assert.ok(['ontology', 'knowledge', 'decision'].includes(kind));
  assert.ok(['sha1', 'sha256'].includes(format));
  // D-only controls: omitted companions preserve the original D+K fixture.
  assert.ok(kind === 'decision' || (companionStores === undefined && !retainedDecisionOwners && editDecisionSource === undefined));
  const companions = kind === 'decision' ? companionStores ?? ['knowledge'] : null;
  if (companions) assert.ok(Array.isArray(companions) && new Set(companions).size === companions.length
    && companions.every(store => ['knowledge', 'ontology'].includes(store)));
  assert.ok(editDecisionSource === undefined || typeof editDecisionSource === 'function');
  const f = subjectQueryDiskFixture(t, { nested, descendants: true });
  const kitPath = nested ? 'unknown-knowledge' : '.';
  const path = (file) => kitPath === '.' ? file : `${kitPath}/${file}`;
  const read = (file) => readFileSync(join(f.kitRoot, file), 'utf8');
  const env = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' };
  for (const key of Object.keys(env)) if (key.startsWith('GIT_') && !['GIT_CONFIG_GLOBAL', 'GIT_CONFIG_NOSYSTEM'].includes(key)) delete env[key];
  const git = (...args) => execFileSync('/usr/bin/git', ['-C', f.root, ...args], { env }).toString().trim();
  const descriptor = (commit) => ({ commit, tree: git('rev-parse', `${commit}^{tree}`), kitPath });
  const commit = (message) => { git('add', '.'); git('commit', '-qm', message); return descriptor(git('rev-parse', 'HEAD')); };
  const contentCapture = (file) => describeCandidateBytes({ file: path(file), bytes: Buffer.from(read(file)), objectFormat: format });
  const identity = structuredClone(f.context.model.identity);
  if (!subjectAuthority) {
    assert.equal(history, false, 'Absent-authority source fixture starts without prior governed history.');
    identity.allocations = identity.allocations.filter(({ kind }) => kind !== 'subject');
    for (const entry of [...f.context.model.leaves.values(), ...f.context.model.proposals.knowledge.values()]) {
      const { subjects, ...record } = entry.record;
      f.put(entry.file, leafFile(record));
    }
  }
  const namespace = identity.namespace;
  // Introducing a governed authority vocabulary also validates older citations.
  // Prepare valid original records before either capture; promotion never repairs them.
  if (kind === 'knowledge' && authorityRegistry) for (const entry of [...f.context.model.leaves.values(), ...f.context.model.proposals.knowledge.values()]) {
    const parts = read(entry.file).split('---\n'); const record = load(parts[1]);
    record.citations = record.citations.map((citation) => ({ ...citation, authority: 'vendor-doc' }));
    parts[1] = `${JSON.stringify(record)}\n`; f.put(entry.file, parts.join('---\n'));
  }
  const authorizer = structuredClone(f.context.model.decisions.get('D-000001').record);
  const authorizerFile = 'decisions/entries/approval.yaml';
  const store = kind === 'decision' ? 'decisions' : kind;
  const catalogFile = `${store}/_catalog.yaml`;
  const subjects = [undefined, [], subjectAuthority ? ['S-000001', 'S-000002'] : []];
  const keys = ['33333333-3333-4333-8333-333333333333', '44444444-4444-4444-8444-444444444444',
    '66666666-6666-4666-8666-666666666666'].map((id) => `proposal:${kind}:${id}`);
  const sources = keys.map((id, index) => {
    const status = kind === 'decision' || index !== 0 ? 'proposed' : 'draft';
    const classification = subjects[index] === undefined ? {} : { subjects: subjects[index] };
    const record = kind === 'knowledge'
      ? { 'schema-version': 3, id, heading: `Evidence ${index}`, domain: 'world', facets: { stage: status },
        citations: [{ source: 'Observed fixture source', authority: 'vendor-doc', accessed: today }],
        verified, volatility, ...classification }
      : kind === 'ontology'
        ? { id, term: `Concept ${index}`, class: 'general', summary: 'Observed source meaning', status,
          'source-of-truth': [path(sourcePath)], 'last-verified': today, ...classification }
        : { ...authorizer, id, title: `Decision ${index}`, status, ...classification };
    return { record, file: kind === 'knowledge' ? `knowledge/promotion-${index}.md`
      : kind === 'ontology' ? 'ontology/classes/promotion.yaml' : authorizerFile };
  });
  const catalog = f.context.model.stores[store]?.present ? JSON.parse(read(catalogFile)) : { 'schema-version': 2, store, entries: [] };
  const siblings = [];
  if (unknownSibling) {
    assert.equal(kind, 'ontology');
    siblings.push({ id: 'O-000001', term: 'Retained unknown owner', class: 'general', summary: 'Keep original classification unknown',
      status: 'active', 'source-of-truth': [path('src/owned.js')], 'last-verified': today });
    identity.allocations.push({ kind, id: 'O-000001', state: 'allocated', publication: identity.allocations[0].publication });
    catalog.entries.push({ id: 'O-000001', title: siblings[0].term, file: 'classes/promotion.yaml' });
  }
  const retainedDecisions = retainedDecisionOwners ? [
    { ...structuredClone(authorizer), id: 'D-000002', title: 'Retained known-empty Decision', subjects: [] },
    { ...structuredClone(authorizer), id: 'D-000003', title: 'Retained unknown Decision' },
  ] : [];
  for (const record of retainedDecisions) {
    identity.allocations.push({ kind: 'decision', id: record.id, state: 'allocated', publication: identity.allocations[0].publication });
    catalog.entries.push({ id: record.id, title: record.title, file: authorizerFile.slice('decisions/'.length) });
  }
  // A prior D revision lives in a separate file: its authorizer never changes.
  const decisionHistory = kind === 'decision' && !companions.includes('knowledge') && history;
  const priorFile = decisionHistory ? 'decisions/entries/prior-history.yaml' : 'knowledge/K-000001.md';
  const priorRef = { namespace, kind: decisionHistory ? 'decision' : 'knowledge', id: decisionHistory ? 'D-000004' : 'K-000001' };
  if (decisionHistory) {
    const record = { ...structuredClone(authorizer), id: priorRef.id, title: 'Prior independently reviewed classification', subjects: ['S-000001'] };
    identity.allocations.push({ kind: 'decision', id: record.id, state: 'allocated', publication: identity.allocations[0].publication });
    catalog.entries.push({ id: record.id, title: record.title, file: priorFile.slice('decisions/'.length) });
    f.put(priorFile, `schema-version: 2\nentries:\n  - id: ${JSON.stringify(record.id)}\n`
      + Object.entries(record).filter(([key]) => key !== 'id').map(([key, value]) => `    ${key}: ${JSON.stringify(value)}\n`).join(''));
  }
  // Negative source cases are authored before any Git or governance capture.
  editDecisionSource?.({ sources, authorizer, retainedDecisions, identity, put: f.put });
  sources.forEach(({ record }, index) => { subjects[index] = record.subjects; });
  catalog.entries.push(...sources.map(({ record, file }) => ({ id: record.id,
    title: record.heading ?? record.term ?? record.title, file: file.slice(store.length + 1) })));
  f.put(catalogFile, catalog);
  if (kind === 'knowledge' && authorityRegistry) f.put('knowledge/_registries/authority-tiers.yaml', {
    'schema-version': 2, store: 'knowledge', registry: 'authority-tiers',
    values: [{ value: 'vendor-doc', gloss: 'Original vendor documentation', warrant: 'Reviewed evidence tier', decision: 'D-000001' }],
  });
  if (kind === 'knowledge') for (const row of sources) f.put(row.file, leafFile(row.record));
  else f.put(sources[0].file, entryFile([...(kind === 'decision' ? [authorizer, ...retainedDecisions] : siblings), ...sources.map(({ record }) => record)]));
  f.put('src/owned.js', 'export const retainedEvidence = true;\n');
  if (kind === 'decision' && !companions.includes('knowledge')) {
    rmSync(join(f.kitRoot, 'knowledge'), { recursive: true });
    identity.allocations = identity.allocations.filter(row => row.kind !== 'knowledge');
  }
  if (kind === 'decision' && companions.includes('ontology')) {
    const record = { id: 'O-000001', term: 'Retained artifact', class: 'general', summary: 'Unchanged companion store',
      status: 'active', 'source-of-truth': [path('src/owned.js')], 'last-verified': today,
      subjects: subjectAuthority ? ['S-000001'] : [] };
    identity.allocations.push({ kind: 'ontology', id: record.id, state: 'allocated', publication: identity.allocations[0].publication });
    f.put('ontology/classes/retained.yaml', entryFile([record]));
    f.put('ontology/_catalog.yaml', { 'schema-version': 2, store: 'ontology', entries: [
      { id: record.id, title: record.term, file: 'classes/retained.yaml' },
    ] });
  }
  f.put('_identity.yaml', identity);

  // Rebind the real governance fixture to this actual Decision file and Git object format.
  const document = structuredClone(getGovernedSubjectRegistry(retiredSubject
    ? subjectQueryFixture({ descendants: true, equivalent: true }).subjectGovernance : f.context.subjectGovernance).document);
  const approvalBytes = Buffer.from(read(authorizerFile));
  const approvalCapture = contentCapture(authorizerFile);
  for (const subject of document.subjects) subject.warrant.records[0].capture = approvalCapture;
  for (const event of document.history) {
    for (const row of event.rows) for (const state of [row.before, row.after]) if (state) state.warrant.records[0].capture = approvalCapture;
    const { review, ...body } = event;
    event.review = { ...review, decisionCapture: approvalCapture, decisionDigest: canonicalSha256(authorizer), changeDigest: canonicalSha256(body) };
  }
  if (subjectAuthority) f.put('subjects/registry.yaml', wire(document));
  else rmSync(join(f.kitRoot, 'subjects/registry.yaml'));
  const evidence = { decisionCaptures: [{ capture: approvalCapture, bytes: approvalBytes, objectFormat: format }], assessmentCaptures: [] };
  if (history && !decisionHistory) f.put(priorFile, leafFile(JSON.parse(read(priorFile).split('---\n')[1])));
  git('init', '-q', '-b', 'source', `--object-format=${format}`);
  git('config', 'user.name', 'Fixture'); git('config', 'user.email', 'fixture@example.test');
  const seed = commit('actual typed proposals and governance');
  const baseline = { 'schema-version': 1, namespace, baselines: [] };
  let priorEvent = null;
  if (history) {
    const file = priorFile;
    const beforeCapture = captureCommittedFile({ repoRoot: f.root, commit: seed.commit, file: path(file) }).locator;
    const note = { type: 'revision', date: today,
      text: 'Classification review by steward using typed-classification: subjects S-000002. Existing evidence metadata retained.' };
    f.put(file, decisionHistory ? read(file).replace('subjects: ["S-000001"]', 'subjects: ["S-000002"]')
      : read(file).replace('subjects: ["S-000001"]', 'subjects: ["S-000002"]')
        .replace('# Evidence remains unchanged.', `notes:\n  - ${JSON.stringify(note)}\n# Evidence remains unchanged.`));
    const ref = priorRef;
    priorEvent = sealAssignmentEvent({ 'schema-version': 2, event: priorEventId, namespace, operation: 'existing-subjects',
      scope: { kind: 'typed-records', refs: [ref] }, 'before-input': { commit: seed.commit, tree: seed.tree, 'kit-path': kitPath },
      decision: { namespace, kind: 'decision', id: 'D-000001' },
      review: { reference: 'review:prior-classification', 'accepted-status': 'accepted', 'decision-capture': approvalCapture,
        'decision-digest': canonicalSha256(authorizer) }, rows: [{ ref, before: { state: 'known', ids: ['S-000001'] },
        after: { state: 'known', ids: ['S-000002'] }, 'before-capture': beforeCapture, 'after-capture': contentCapture(file),
        'before-revision': 0, 'after-revision': 1, disposition: 'changed', reason: 'Retain prior reviewed classification' }] });
    baseline.baselines.push({ ref, state: priorEvent.rows[0].before, capture: beforeCapture });
    f.put('subjects/_assignments/_baselines.yaml', `schema-version: 1\nnamespace: ${namespace}\nbaselines:\n${baselineRows(baseline.baselines)}`);
    f.put(`subjects/_assignments/${priorEventId}.yaml`, priorEvent);
  }
  const before = history ? commit('retained actual prior assignment history') : seed;
  const baselineBefore = history ? read('subjects/_assignments/_baselines.yaml') : null;
  const allocation = planAllocations(identity, { kind, count: sources.length, publication });
  assert.equal(allocation.ok, true, JSON.stringify(allocation));
  const targetLifecycle = { knowledge: 'verified', ontology: 'active', decision: 'accepted' }[kind];
  const rows = sources.map(({ record, file }, index) => ({
    proposalRef: { namespace, kind, key: record.id }, canonicalRef: { namespace, kind, id: allocation.ids[index] }, targetLifecycle,
    beforeCapture: captureCommittedFile({ repoRoot: f.root, commit: before.commit, file: path(file) }).locator,
  }));
  const candidateRecords = sources.map(({ record }, index) => ({ ...record, id: rows[index].canonicalRef.id,
    ...(kind === 'knowledge' ? { facets: { ...record.facets, stage: targetLifecycle } } : { status: targetLifecycle }) }));
  if (kind === 'decision') {
    // Independently authored expected D reference changes, never planner output.
    const targets = new Map(rows.map(row => [row.proposalRef.key, row.canonicalRef.id]));
    const rewrite = values => values.map(value => targets.get(value) ?? value);
    for (const record of candidateRecords) {
      for (const field of ['supersedes', 'superseded-by']) if (Array.isArray(record[field])) record[field] = rewrite(record[field]);
      if (Array.isArray(record['relates-to']?.decisions)) record['relates-to'] = {
        ...record['relates-to'], decisions: rewrite(record['relates-to'].decisions),
      };
    }
  }
  const sourceFiles = new Map(sources.map(({ file }) => [file, read(file)]));
  for (const [file, text] of sourceFiles) {
    let bytes = text;
    sources.forEach((source, index) => {
      if (source.file !== file) return;
      bytes = bytes.replace(kind === 'knowledge' ? leafFile(source.record) : JSON.stringify(source.record),
        kind === 'knowledge' ? leafFile(candidateRecords[index]) : JSON.stringify(candidateRecords[index]));
    });
    f.put(file, bytes);
  }
  let catalogBytes = read(catalogFile);
  rows.forEach((row) => { catalogBytes = catalogBytes.replace(JSON.stringify(row.proposalRef.key), JSON.stringify(row.canonicalRef.id)); });
  f.put(catalogFile, catalogBytes);
  const newRows = allocation.ledger.allocations.slice(identity.allocations.length);
  f.put('_identity.yaml', read('_identity.yaml').replace('"allocations":[', `"allocations":[${newRows.map((row) => JSON.stringify(row)).join(',')},`));
  const event = { 'schema-version': 2, event: eventId, namespace, operation: 'canonical-creation',
    scope: { kind: 'typed-records', refs: rows.map(({ canonicalRef }) => canonicalRef) },
    'before-input': { commit: before.commit, tree: before.tree, 'kit-path': kitPath },
    decision: { namespace, kind: 'decision', id: 'D-000001' },
    review: { reference: publication.review, 'accepted-status': 'accepted',
      'decision-capture': captureCommittedFile({ repoRoot: f.root, commit: before.commit, file: path(authorizerFile) }).locator,
      'decision-digest': canonicalSha256(authorizer) },
    rows: rows.map(({ canonicalRef }, index) => ({ ref: canonicalRef, before: null, 'before-capture': null, 'before-revision': null,
      after: subjects[index] === undefined ? { state: 'unknown', reason: 'absent' } : { state: 'known', ids: subjects[index] },
      'after-capture': contentCapture(sources[index].file), 'after-revision': 0, disposition: 'created', reason: 'Review canonical creation' })) };
  const oldBaselineCount = baseline.baselines.length;
  const save = () => {
    event.rows.forEach((row, index) => { row['after-capture'] = contentCapture(sources[index].file); });
    baseline.baselines.splice(oldBaselineCount, baseline.baselines.length, ...event.rows.map((row) => ({
      ref: row.ref, state: row.after, capture: row['after-capture'], origin: { kind: 'creation', event: eventId } })));
    f.put('subjects/_assignments/_baselines.yaml', (baselineBefore ?? `schema-version: 1\nnamespace: ${namespace}\nbaselines:\n`)
      + baselineRows(baseline.baselines.slice(oldBaselineCount)));
    f.put(`subjects/_assignments/${eventId}.yaml`, sealAssignmentEvent(event));
    git('add', '.'); const tree = git('write-tree');
    return { commit: git('commit-tree', tree, '-p', before.commit, '-m', 'actual typed canonical genesis'), tree, kitPath };
  };
  const candidate = save();
  return { ...f, git, path, read, before, candidate, seed, rows, event, baseline, baselineBefore, priorEvent,
    evidence, sourceFiles, sources, candidateRecords, namespace, kind, format, today, publication, save,
    authorizer, authorizerFile, retainedDecisions, companionStores: companions, priorRef,
    plannerInput: { version: 1, kind, repoRoot: f.root, source: before, publication, selected: rows,
      limits: { maxFiles: 100, maxFileBytes: 100000, maxSourceBytes: 5000000, maxPromotions: 10 } } };
}
