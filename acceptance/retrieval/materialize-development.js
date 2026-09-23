// Development data preparation only. This does not freeze a paired experiment.
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, cpSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

export const DEVELOPMENT_RUNTIME = 'd5b2d37db67111466cafbc87e0fd5a77b7bfedc7';
const repository = fileURLToPath(new URL('../..', import.meta.url));
const corpus = join(repository, 'acceptance/retrieval/development-v2');
const packet = join(corpus, 'curation-review');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const read = file => JSON.parse(readFileSync(file, 'utf8'));
const put = (file, value) => {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, typeof value === 'string' || Buffer.isBuffer(value) ? value : `${JSON.stringify(value, null, 2)}\n`);
};
const wireKeys = { schemaVersion: 'schema-version', hierarchyRevision: 'hierarchy-revision', originDecision: 'origin-decision',
  acceptedStatus: 'accepted-status', decisionCapture: 'decision-capture', decisionDigest: 'decision-digest', changeDigest: 'change-digest' };
function wire(value) {
  if (Array.isArray(value)) return value.map(wire);
  return value && typeof value === 'object'
    ? Object.fromEntries(Object.entries(value).map(([k, v]) => [wireKeys[k] ?? k, wire(v)])) : value;
}
function verifyPacket() {
  for (const row of read(join(packet, 'manifest.json')).files) {
    const bytes = readFileSync(join(packet, row.file));
    assert.equal(hash(bytes), row.sha256, row.file);
    assert.equal(bytes.length, row.bytes, row.file);
  }
  for (const row of read(join(corpus, 'source-freeze.json')).files) {
    assert.equal(hash(readFileSync(join(repository, row.file))), row.sha256, row.file);
  }
}
function verifyRuntime(runtime) {
  const tree = execFileSync('/usr/bin/git', ['--no-replace-objects', 'ls-tree', '-r', '-z', DEVELOPMENT_RUNTIME,
    '--', 'payload', 'cli', 'package.json', 'package-lock.json'], { cwd: repository, encoding: 'utf8' });
  return tree.split('\0').filter(Boolean).map(entry => {
    const [metadata, file] = entry.split('\t');
    const [mode, type, oid] = metadata.split(' ');
    assert(type === 'blob' && ['100644', '100755'].includes(mode));
    const bytes = readFileSync(join(runtime, file));
    assert.equal(createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex'), oid, file);
    return { file, sha256: hash(bytes) };
  });
}

/** Byte fidelity is separate from the extractor's unordered, comment-free line set. */
export function verifyDevelopmentSources(manifest) {
  const diagnostics = [];
  for (const installation of manifest.installations) {
    for (const record of installation.records) {
      for (const [field, expected] of [['source', record.originalSourceSha256], ['excerpt', record.excerptSha256]]) {
        const file = join(installation.root, record[field]);
        try {
          if (hash(readFileSync(file)) !== expected) diagnostics.push({ installation: installation.installation, id: record.id, field, code: 'source-byte-mismatch' });
        } catch (error) {
          diagnostics.push({ installation: installation.installation, id: record.id, field, code: error.code ?? 'source-read-failed' });
        }
      }
    }
  }
  return { ok: diagnostics.length === 0, diagnostics };
}

/** Prepare eight independently owned data fixtures with real captured evidence. */
export async function materializeDevelopment({ destination, runtime }) {
  destination = resolve(destination); runtime = resolve(runtime);
  assert(!existsSync(destination), 'destination must be fresh; never replace an earlier attempt');
  verifyPacket();
  const runtimeFiles = verifyRuntime(runtime);
  const lib = name => import(pathToFileURL(join(runtime, 'payload/engine/lib', `${name}.js`)));
  const { planAllocations, validateIdentityTransition } = await lib('identity-ledger');
  const { canonicalSha256 } = await lib('canonical-json');
  const { describeCandidateBytes } = await lib('captured-source');
  const { loadStores } = await lib('load-stores');
  const { evaluateSubjectGovernance, getSubjectGovernanceDescriptor, validateSubjectGovernanceCapture, validateSubjectTransition } = await lib('subject-governance');
  const { validateAssignments } = await lib('assignment-validation');
  const { runChecks } = await import(pathToFileURL(join(runtime, 'payload/engine/commands/validate.js')));
  const { validateValues } = await import(pathToFileURL(join(runtime, 'payload/engine/commands/validate-values.js')));
  const { KINDS } = await lib('extractor-kinds');
  const rows = read(join(packet, 'record-decisions.json')).records;
  const definitions = ['engineering-culture', 'policy-manufacturing', 'services-holding']
    .flatMap(name => read(join(packet, `curation-subjects-${name}.json`)).installations);
  mkdirSync(destination);
  const manifests = [];
  for (const definition of definitions) {
    const installation = definition.installation;
    const root = join(destination, installation);
    const kit = join(root, 'unknown-knowledge');
    const relevant = rows.filter(row => row.installation === installation);
    const namespace = randomUUID();
    const publication = { id: randomUUID(), review: 'simulated-fixture-curation:development-v2/P2-reviewed-editorial-1' };
    const before = { 'schema-version': 1, 'identity-format': 1, namespace, allocations: [] };
    const allocations = {};
    const ledger = structuredClone(before);
    for (const kind of ['ontology', 'knowledge', 'decision', 'subject']) {
      const count = kind === 'subject' ? definition.subjects.length
        : relevant.filter(row => row.curationDecision.kind === kind && row.curationDecision.identityPlan !== 'typed-proposal-key-no-canonical-allocation').length + (kind === 'decision' ? 1 : 0);
      if (!count) { allocations[kind] = []; continue; }
      const result = planAllocations(before, { kind, count, publication });
      assert(result.ok, JSON.stringify(result));
      allocations[kind] = result.ids;
      ledger.allocations.push(...result.ledger.allocations);
    }
    const identityCheck = validateIdentityTransition(before, ledger);
    assert(identityCheck.ok, JSON.stringify(identityCheck));
    const supportId = allocations.decision.at(-1);
    const supportFile = `decisions/entries/${supportId}.yaml`;
    const cursor = { ontology: 0, knowledge: 0, decision: 0 };
    const subjectIds = new Map(definition.subjects.map((subject, index) => [subject.key, allocations.subject[index]]));
    const rendered = relevant.map(row => {
      const kind = row.curationDecision.kind;
      const proposed = row.curationDecision.identityPlan === 'typed-proposal-key-no-canonical-allocation';
      const id = proposed ? `proposal:${kind}:${randomUUID()}` : allocations[kind][cursor[kind]++];
      const slug = proposed ? id.split(':').at(-1) : id;
      const file = kind === 'knowledge' ? `knowledge/${proposed ? 'proposals/' : ''}${slug}.md`
        : `${kind === 'decision' ? 'decisions/entries' : 'ontology/classes'}/${slug}.yaml`;
      const source = `sources/${row.source.file.includes('/pilot/') ? 'pilot' : 'development-v2'}/${row.source.file.split('/').at(-1)}`;
      const excerpt = `sources/passages/${row.source.passage}.txt`;
      const original = readFileSync(join(repository, row.source.file));
      assert.equal(hash(original), row.source.fileSha256);
      assert.equal(hash(Buffer.from(row.source.exactPassage)), row.source.passageSha256);
      put(join(root, source), original);
      put(join(root, excerpt), row.source.exactPassage);
      const historical = row.sourceStanding.semanticLifecycle === 'retired';
      const heading = `${historical ? 'Historical source report — retired or withdrawn: ' : kind === 'ontology' ? 'Source-text assertion: ' : 'Source report: '}${row.source.passage.replaceAll('-', ' ')}`;
      const subjects = row.assignment.mode === 'recorded'
        ? { subjects: row.assignment.subjectKeys.map(key => { assert(subjectIds.has(key)); return subjectIds.get(key); }) } : {};
      const caveat = 'Synthetic source fixture. Source-local identifiers quoted below are historical text, not runtime references. Curation verifies faithful source reporting only; it does not approve the described operation or fill missing scope.';
      let record;
      if (kind === 'knowledge') {
        record = { 'schema-version': 3, id, domain: installation, heading, ...subjects,
          citations: [{ source: `${source}#${row.source.passage}` }],
          facets: { stage: row.curationDecision.lifecycleTarget.value },
          verified: '2026-09-19', volatility: 'static',
          provenance: { author: 'simulated-fixture-curation', 'skill-version': 'development-v2-editorial-1' },
          notes: [{ type: 'scope', text: caveat }] };
        put(join(kit, file), `---\n${JSON.stringify(record, null, 2)}\n---\n\n# ${heading}\n\n${caveat}\n\n${row.source.exactPassage}`);
      } else if (kind === 'ontology') {
        const values = row.source.exactPassage.replace(/\r\n/g, '\n').split('\n').filter(line => line !== '' && !line.startsWith('#'));
        assert.equal(new Set(values).size, values.length, 'source line set must not hide duplicate values');
        assert.deepEqual(KINDS['test-lines'](row.source.exactPassage), values);
        record = { id, term: heading, class: 'source-text', summary: `Inspect ${source}#${row.source.passage} and its exact retained excerpt.`,
          definition: `${caveat} Assertion: the pointed excerpt contains the following line set. The extractor does not prove order, blank/comment preservation, software behavior or operational implementation; byte fidelity is separately captured.`,
          status: row.curationDecision.lifecycleTarget.value, ...subjects,
          'source-of-truth': [excerpt, source], 'last-verified': '2026-09-19',
          enumerates: [{ kind: 'test-lines', source: excerpt, values }] };
        put(join(kit, file), { 'schema-version': 2, entries: [record] });
      } else {
        record = { id, title: heading, category: 'governance', status: row.curationDecision.lifecycleTarget.value, ...subjects,
          date: '2026-09-19', deciders: ['simulated-source-transcription'],
          context: `${caveat} Original source: ${source}#${row.source.passage}.`, decision: row.source.exactPassage,
          consequences: 'Source standing and stated scope remain exactly as quoted. No precedence is inferred from this fixture capture date.' };
        put(join(kit, file), { 'schema-version': 2, entries: [record] });
      }
      return { row, kind, id, proposed, file, source, excerpt, heading, record };
    });
    const support = { id: supportId, title: 'Simulated fixture curation — representation and local subject meanings',
      category: 'governance', status: 'accepted', date: '2026-09-19', deciders: ['simulated-fixture-curator'],
      context: 'P2 independently reviewed the retained editorial packet. This is synthetic test curation, not authenticated human review or approval by a source owner.',
      decision: 'Approve only these exact source-reporting representations and local subject meanings for fixture preparation. Preserve nine absent assignment choices across the corpus, historical qualifications, independently scoped notebook claims and proposal/rejection standing. Related edges create no ancestry. Operational applicability is not established by classification or reporting verification.',
      consequences: 'Support metadata consumes reader budgets and needs an independent record judgment. No retrieval-quality or final-publication acceptance follows.',
      provenance: { author: 'simulated-fixture-curation', 'skill-version': 'development-v2-editorial-1' } };
    const supportBytes = Buffer.from(`${JSON.stringify({ 'schema-version': 2, entries: [support] }, null, 2)}\n`);
    put(join(kit, supportFile), supportBytes);
    const capture = describeCandidateBytes({ file: `unknown-knowledge/${supportFile}`, bytes: supportBytes, objectFormat: 'sha1' });
    const supportRef = { namespace, kind: 'decision', id: supportId };
    const eventId = randomUUID();
    const subjects = definition.subjects.map(subject => ({ id: subjectIds.get(subject.key), label: subject.label,
      definition: subject.definition, aliases: subject.aliases.map(({ evidence, ...alias }) => alias),
      ...(subject.parentKey ? { parent: subjectIds.get(subject.parentKey) } : {}),
      related: definition.related.filter(edge => edge.fromKey === subject.key).map(edge => ({ type: 'association', target: subjectIds.get(edge.toKey) })),
      status: 'active', originDecision: supportRef,
      warrant: { records: [{ ref: supportRef, capture }], sources: subject.warrant.map(ref => {
        const raw = readFileSync(join(repository, ref.source));
        const local = `sources/${ref.source.includes('/pilot/') ? 'pilot' : 'development-v2'}/${ref.source.split('/').at(-1)}`;
        put(join(root, local), raw);
        return { locator: `${local}#${ref.passage}`, revision: hash(raw) };
      }) } }));
    const event = { id: eventId, action: 'activate', decision: supportRef,
      rows: subjects.map(({ id, ...after }) => ({ id, before: null, after })),
      reason: 'Initial captured fixture vocabulary from reviewed source warrants; no historical governance or human authentication is inferred.' };
    event.review = { reference: 'simulated-fixture-curation:P2-reviewed-editorial-1', acceptedStatus: 'accepted',
      decisionCapture: capture, decisionDigest: canonicalSha256(support), changeDigest: canonicalSha256(event) };
    const document = { schemaVersion: 1, namespace, revision: 1,
      hierarchyRevision: subjects.some(subject => subject.parent) ? 1 : 0,
      subjects: subjects.map(subject => ({ ...subject, changes: [eventId] })), history: [event] };
    put(join(kit, '_identity.yaml'), ledger);
    put(join(kit, 'subjects/registry.yaml'), wire(document));
    for (const [kind, store] of [['knowledge', 'knowledge'], ['ontology', 'ontology'], ['decision', 'decisions']]) {
      const entries = rendered.filter(row => row.kind === kind).map(row => ({ id: row.id, title: row.heading, file: row.file.slice(store.length + 1) }));
      if (kind === 'decision') entries.push({ id: supportId, title: support.title, file: supportFile.slice(store.length + 1) });
      if (entries.length) put(join(kit, store, '_catalog.yaml'), { 'schema-version': 2, store, entries });
    }
    if (rendered.some(row => row.kind === 'knowledge')) put(join(kit, 'knowledge/_registries/stage.yaml'), {
      'schema-version': 2, store: 'knowledge', registry: 'stage', values: ['draft', 'proposed', 'verified']
        .map(value => ({ value, gloss: value, warrant: 'Simulated source-reporting lifecycle, not source-action approval.', decision: supportId })) });
    put(join(root, 'survey-scope.yaml'), { 'schema-version': 1, include: ['sources'], exclude: ['sources/private'] });
    const decisionCaptures = [{ capture, bytes: supportBytes, objectFormat: 'sha1' }];
    put(join(root, 'decision-captures.json'), [{ capture, bytesBase64: supportBytes.toString('base64'), objectFormat: 'sha1' }]);
    // Keep exact reviewed editorial bytes accessible as curation evidence, not runtime aliases.
    cpSync(join(packet, `curation-subjects-${installation === 'engineering' || installation === 'cultural-research' ? 'engineering-culture' : installation === 'policy' || installation === 'manufacturing' ? 'policy-manufacturing' : 'services-holding'}.json`), join(root, 'subject-editorial-capture.json'));
    const model = loadStores(kit);
    assert(model.ok, JSON.stringify(model.diagnostics));
    const governance = evaluateSubjectGovernance({ registry: model.subjectRegistry, identity: model.identity,
      identityIndex: model.identityIndex, decisionCaptures });
    assert(governance.ok, JSON.stringify(governance.diagnostics));
    const consistency = validateSubjectGovernanceCapture(governance.governance, { model });
    assert(consistency.ok, JSON.stringify(consistency.diagnostics));
    const subjectTransition = validateSubjectTransition({
      before: { schemaVersion: 1, namespace, revision: 0, hierarchyRevision: 0, subjects: [], history: [] },
      candidate: document, model, identityIndex: model.identityIndex, decisionCaptures,
    });
    assert(subjectTransition.ok, JSON.stringify(subjectTransition.diagnostics));
    const assignments = rendered.map(row => {
      const entry = row.proposed ? model.proposals[row.kind].get(row.id)
        : (row.kind === 'knowledge' ? model.leaves : row.kind === 'ontology' ? model.concepts : model.decisions).get(row.id);
      assert(entry, row.id);
      const reference = row.proposed ? { proposalRef: { namespace, kind: row.kind, key: row.id }, entry }
        : { ref: { namespace, kind: row.kind, id: row.id }, entry };
      const checked = validateAssignments(reference, governance.governance, { purpose: 'new-assignment', budget: { redirects: 100 } });
      assert(checked.ok, JSON.stringify(checked.diagnostics));
      return { id: row.id, state: checked.assignments.state, ok: checked.ok };
    });
    const structural = runChecks(model, root);
    assert(!structural.some(finding => finding.severity === 'error'), JSON.stringify(structural));
    const values = validateValues(model, null, root);
    assert.equal(values.hardErrors.length, 0, JSON.stringify(values));
    assert.equal(values.findings.length, 0, JSON.stringify(values));
    manifests.push({ installation, namespace, root, identityCheck, structural, values, assignments,
      subjectTransition: { ok: subjectTransition.ok, diagnostics: subjectTransition.diagnostics, scope: 'initial detached fixture transition; not a filesystem publication gate' },
      governance: getSubjectGovernanceDescriptor(governance.governance),
      support: [{ kind: 'decision', id: supportId, file: supportFile, judgment: 'pending-independent-record-review' }],
      records: rendered.map(({ row, kind, id, proposed, file, source, excerpt }) => ({
        attributionHandle: row.attributionHandle, kind, id, proposed, file, source, excerpt,
        originalSourceSha256: row.source.fileSha256, excerptSha256: row.source.passageSha256,
        recordSha256: hash(readFileSync(join(kit, file))) })) });
  }
  const result = { version: 'development-v2-materialization-1', status: 'Prepared data fixtures; independent actual-record review and final publication checks pending',
    runtimePin: DEVELOPMENT_RUNTIME, runtime, runtimeFiles, curationManifestSha256: hash(readFileSync(join(packet, 'manifest.json'))),
    boundary: 'Evaluator-only attribution inventory. Never load this manifest as a runtime ID correspondence. No paired experiment or final acceptance is claimed.', installations: manifests };
  assert.deepEqual(verifyRuntime(runtime), runtimeFiles);
  verifyPacket();
  assert(verifyDevelopmentSources(result).ok);
  put(join(destination, 'materialization.json'), result);
  return result;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [destination, runtime] = process.argv.slice(2);
  if (!destination || !runtime || process.argv.length !== 4) throw new Error('usage: node materialize-development.js DESTINATION PINNED_RUNTIME');
  const result = await materializeDevelopment({ destination, runtime });
  console.log(JSON.stringify({ installations: result.installations.length, records: result.installations.reduce((sum, i) => sum + i.records.length, 0), status: result.status }));
}
