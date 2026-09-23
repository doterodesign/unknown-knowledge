// Prebuilt qualification inputs only; generation is never part of measured work.
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, realpathSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

export const OPERATIONAL_RUNTIME = 'cf41e1111a6f45836b905fec36f103d7e00880cf';
export const queryBudgets = { version: 1, maxAstNodes: 64, maxAstDepth: 8,
  maxHierarchyNodes: 16384, maxHierarchyEdges: 16320, maxRedirects: 32,
  maxRecords: 1200, maxPredicateSteps: 76800, maxResultsPerStore: 10, maxExplanationNodes: 4096 };
export const contextBudgets = { version: 1, maxRecords: 1200, maxAssignments: 16000,
  maxHierarchyNodes: 4352, maxHierarchyEdges: 4096, maxRedirects: 32, maxContexts: 16 };
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const put = (file, value) => {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, typeof value === 'string' || Buffer.isBuffer(value) ? value : `${JSON.stringify(value)}\n`);
};
const files = root => readdirSync(root, { withFileTypes: true }).flatMap(entry => entry.isDirectory()
  ? files(join(root, entry.name)) : [join(root, entry.name)]);
// The suppression helper has no rename event and does not convert this key.
const renameWireKey = value => Array.isArray(value) ? value.map(renameWireKey)
  : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value)
    .map(([key, item]) => [key === 'unchangedMeaning' ? 'unchanged-meaning' : key, renameWireKey(item)])) : value;
function runtimeProvenance(runtime) {
  const tree = execFileSync('/usr/bin/git', ['--no-replace-objects', 'ls-tree', '-r', '-z', OPERATIONAL_RUNTIME,
    '--', 'payload', 'cli', 'package.json', 'package-lock.json', 'tests/helpers/subject-suppression-fixture.js'],
  { cwd: fileURLToPath(new URL('../..', import.meta.url)), encoding: 'utf8' });
  const tracked = tree.split('\0').filter(Boolean).map(entry => {
    const [metadata, file] = entry.split('\t');
    const [mode, type, oid] = metadata.split(' ');
    assert(type === 'blob' && ['100644', '100755'].includes(mode));
    const bytes = readFileSync(join(runtime, file));
    assert.equal(createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex'), oid, file);
    return { file, sha256: hash(bytes) };
  });
  return { tracked, node: { file: process.execPath, version: process.version, sha256: hash(readFileSync(process.execPath)) },
    dependencies: files(realpathSync(join(runtime, 'node_modules'))).map(file => ({ file, sha256: hash(readFileSync(file)) })) };
}

/** Construct ordinary supported histories; promotion and retirement are separate workloads. */
export async function prepareOperationalCase({ destination, runtime, shape = 'mixed', history = false,
  recordCount = 1000, assignmentMode = 'dense', bodyBytes = 256 }) {
  assert(['wide', 'deep', 'mixed'].includes(shape));
  assert(['dense', 'mixed', 'limited'].includes(assignmentMode));
  assert(Number.isInteger(recordCount) && recordCount >= 4 && recordCount <= 1200);
  assert(Number.isInteger(bodyBytes) && bodyBytes >= 64 && bodyBytes <= 16384);
  destination = resolve(destination); runtime = resolve(runtime);
  assert(!existsSync(destination), 'every preparation must have a fresh destination');
  const builderSha256 = hash(readFileSync(fileURLToPath(import.meta.url)));
  const provenance = runtimeProvenance(runtime);
  const lib = name => import(pathToFileURL(join(runtime, 'payload/engine/lib', `${name}.js`)));
  const { planAllocations, validateIdentityTransition } = await lib('identity-ledger');
  const { loadStores } = await lib('load-stores');
  const { canonicalSha256 } = await lib('canonical-json');
  const { describeCandidateBytes } = await lib('captured-source');
  const { evaluateSubjectGovernance, validateSubjectTransition } = await lib('subject-governance');
  const { validateAssignments } = await lib('assignment-validation');
  const { runChecks } = await import(pathToFileURL(join(runtime, 'payload/engine/commands/validate.js')));
  const { authored, stateOf, digestEvent } = await import(pathToFileURL(join(runtime, 'tests/helpers/subject-suppression-fixture.js')));
  const namespace = randomUUID();
  const publication = { id: randomUUID(), review: 'synthetic-operational-fixture' };
  const emptyLedger = { 'schema-version': 1, 'identity-format': 1, namespace, allocations: [] };
  const ledger = structuredClone(emptyLedger);
  const ids = {};
  const perStore = { knowledge: Math.floor(recordCount / 3), ontology: Math.floor(recordCount / 3) };
  perStore.decision = recordCount - perStore.knowledge - perStore.ontology;
  for (const kind of ['subject', 'knowledge', 'ontology', 'decision']) {
    const planned = planAllocations(emptyLedger, { kind, count: kind === 'subject' ? 256 : perStore[kind], publication });
    assert(planned.ok, JSON.stringify(planned));
    ledger.allocations.push(...planned.ledger.allocations); ids[kind] = planned.ids;
  }
  assert(validateIdentityTransition(emptyLedger, ledger).ok);
  const subjectIds = ids.subject;
  const subjectsFor = ordinal => {
    if (assignmentMode === 'mixed' && ordinal % 5 === 0) return null;
    if (assignmentMode === 'mixed' && ordinal % 5 === 1) return [];
    const width = assignmentMode === 'dense' ? 16 : 1;
    const span = assignmentMode === 'limited' ? 8 : 256;
    return Array.from({ length: width }, (_, i) => subjectIds[(ordinal * width + i) % span]);
  };
  const body = label => `${label}\n${'x'.repeat(bodyBytes - Buffer.byteLength(`${label}\n`))}`;
  const inventories = [];
  const assignedFiles = [];
  let ordinal = 0;
  let support;
  let supportBytes;
  let assignedSupport;
  let assignedSupportBytes;
  for (const kind of ['decision', 'knowledge', 'ontology']) {
    const store = kind === 'decision' ? 'decisions' : kind;
    const catalog = [];
    for (const id of ids[kind]) {
      const subjects = subjectsFor(ordinal++);
      const assignment = subjects === null ? {} : { subjects };
      const text = body(`Synthetic ${kind} ${id}`);
      const file = kind === 'knowledge' ? `${id}.md` : `${kind === 'ontology' ? 'classes' : 'entries'}/${id}.yaml`;
      let record;
      if (kind === 'knowledge') {
        record = { 'schema-version': 3, id, heading: `Fixture ${id}`, domain: 'operational',
          citations: [{ source: 'sources/warrant.txt' }], facets: { stage: 'verified' }, ...assignment };
        const { subjects: omitted, ...unassigned } = record;
        put(join(destination, store, file), `---\n${JSON.stringify(unassigned)}\n---\n${text}`);
        assignedFiles.push({ file: join(destination, store, file), value: `---\n${JSON.stringify(record)}\n---\n${text}` });
      } else if (kind === 'ontology') {
        record = { id, term: `Fixture ${id}`, class: 'operational-fixture', summary: 'Synthetic workload meaning',
          definition: text, status: 'active', 'source-of-truth': ['sources/warrant.txt'], 'last-verified': '2026-09-19', ...assignment };
        const { subjects: omitted, ...unassigned } = record;
        put(join(destination, store, file), { 'schema-version': 2, entries: [unassigned] });
        assignedFiles.push({ file: join(destination, store, file), value: { 'schema-version': 2, entries: [record] } });
      } else {
        record = { id, title: `Fixture ${id}`, status: 'accepted', category: 'governance', date: '2026-09-19',
          deciders: ['synthetic-workload-curator'], context: 'Synthetic structural workload; no organizational authority claimed.',
          decision: text, consequences: 'Approve only generated fixture meanings and explicit ordinary transitions.', ...assignment };
        const bytes = Buffer.from(`${JSON.stringify({ 'schema-version': 2, entries: [record] })}\n`);
        const { subjects: omitted, ...unassigned } = record;
        const beforeBytes = Buffer.from(`${JSON.stringify({ 'schema-version': 2, entries: [unassigned] })}\n`);
        put(join(destination, store, file), beforeBytes);
        assignedFiles.push({ file: join(destination, store, file), value: bytes });
        if (!support) { support = unassigned; supportBytes = beforeBytes; assignedSupport = record; assignedSupportBytes = bytes; }
      }
      catalog.push({ id, title: `Fixture ${id}`, file });
      inventories.push({ kind, store, id, subjects, file: `${store}/${file}`, bodyBytes: Buffer.byteLength(text) });
    }
    put(join(destination, store, '_catalog.yaml'), { 'schema-version': 2, store, entries: catalog });
  }
  put(join(destination, 'sources/warrant.txt'), 'Synthetic local workload vocabulary. Numbered dimensions are independent; explicit parent edges determine the generated hierarchy. This fixture makes no claim about a real organization.\n');
  put(join(destination, 'knowledge/_registries/stage.yaml'), { 'schema-version': 2, store: 'knowledge', registry: 'stage',
    values: ['verified'].map(value => ({ value, gloss: value, warrant: 'Synthetic workload', decision: support.id })) });
  put(join(destination, '_identity.yaml'), ledger);
  let capture = describeCandidateBytes({ file: `decisions/entries/${support.id}.yaml`, bytes: supportBytes, objectFormat: 'sha1' });
  const decisionCaptures = [{ capture, bytes: supportBytes, objectFormat: 'sha1' }];
  const decision = { namespace, kind: 'decision', id: support.id };
  let document = { schemaVersion: 1, namespace, revision: 0, hierarchyRevision: 0, subjects: [], history: [] };
  put(join(destination, 'subjects/registry.yaml'), authored(document));
  const transitions = [];
  function applyEvent(event) {
    const before = document;
    const beforeModel = loadStores(destination); assert(beforeModel.ok, JSON.stringify(beforeModel.diagnostics));
    event.review = { reference: `synthetic-workload:${event.id}`, acceptedStatus: 'accepted', decisionCapture: capture,
      decisionDigest: canonicalSha256(support), changeDigest: digestEvent(event) };
    const changed = new Map(event.rows.map(row => [row.id, row.after]));
    const retained = before.subjects.map(subject => changed.has(subject.id)
      ? { id: subject.id, ...changed.get(subject.id), changes: [...subject.changes, event.id] } : subject);
    const priorIds = new Set(before.subjects.map(subject => subject.id));
    const added = event.rows.filter(row => !priorIds.has(row.id)).map(row => ({ id: row.id, ...row.after, changes: [event.id] }));
    const candidate = { ...before, subjects: [...retained, ...added], history: [...before.history, event],
      revision: before.revision + 1,
      hierarchyRevision: before.hierarchyRevision + Number(event.rows.some(row => (row.before?.parent ?? null) !== (row.after.parent ?? null))) };
    const checked = validateSubjectTransition({ before, candidate, model: beforeModel, identityIndex: beforeModel.identityIndex, decisionCaptures });
    assert(checked.ok, JSON.stringify({ event: event.id, diagnostics: checked.diagnostics }));
    transitions.push({ id: event.id, action: event.action, rows: event.rows.length, beforeSha256: canonicalSha256(before),
      candidateSha256: canonicalSha256(candidate), ok: checked.ok, diagnostics: checked.diagnostics });
    document = candidate;
    put(join(destination, 'subjects/registry.yaml'), renameWireKey(authored(document)));
  }
  const parentIndex = index => {
    if (index === 0 || shape === 'wide') return null;
    if (shape === 'deep') return index <= 16 ? index - 1 : (index % 16);
    return index < 17 ? index - 1 : index < 128 ? Math.floor((index - 17) / 8) : 0;
  };
  applyEvent({ id: randomUUID(), action: 'activate', decision, reason: 'Initialize explicit synthetic local dimensions.',
    rows: subjectIds.map((id, index) => ({ id, before: null, after: {
      label: `Dimension ${index + 1}`, definition: { text: `Synthetic workload dimension ${index + 1}.`, includes: [], excludes: [] },
      aliases: [{ label: index < 2 ? 'Shared dimension' : `Alias ${index + 1}`, locale: 'en', context: `scope-${index + 1}` }],
      ...(parentIndex(index) === null ? {} : { parent: subjectIds[parentIndex(index)] }), related: [], status: 'active', originDecision: decision,
      warrant: { records: [{ ref: decision, capture }], sources: [{ locator: 'sources/warrant.txt', revision: hash(readFileSync(join(destination, 'sources/warrant.txt'))) }] },
    } })) });
  // Record assignments are authored only after the initial subject activation.
  // Preserve the original authorizer bytes and capture its newly assigned state
  // separately for later events; historical evidence never becomes a reread.
  for (const output of assignedFiles) put(output.file, output.value);
  support = assignedSupport;
  if (!supportBytes.equals(assignedSupportBytes)) {
    supportBytes = assignedSupportBytes;
    capture = describeCandidateBytes({ file: `decisions/entries/${support.id}.yaml`, bytes: supportBytes, objectFormat: 'sha1' });
    decisionCaptures.push({ capture, bytes: supportBytes, objectFormat: 'sha1' });
  }
  put(join(destination, 'decision-captures.json'), decisionCaptures.map(({ capture: locator, bytes, objectFormat }) =>
    ({ capture: locator, bytesBase64: bytes.toString('base64'), objectFormat })));
  if (history) for (let index = 0; index < 255; index++) {
    const action = ['rename', 'reparent', 'relate'][index % 3];
    const count = index === 254 ? 6 : 3;
    const rows = Array.from({ length: count }, (_, offset) => {
      const position = 128 + ((Math.floor(index / 3) * 6 + offset) % 128);
      const subject = document.subjects[position];
      const before = structuredClone(stateOf(subject));
      const after = structuredClone(before);
      if (action === 'rename') after.label = `Dimension ${position + 1}, spelling revision ${index + 1}`;
      if (action === 'reparent') after.parent = before.parent === subjectIds[0] ? subjectIds[1] : subjectIds[0];
      if (action === 'relate') after.related = before.related.length ? [] : [{ type: 'association', target: subjectIds[position - 128] }];
      assert.notDeepEqual(before, after);
      return { id: subject.id, before, after };
    });
    applyEvent({ id: randomUUID(), action, decision, rows, reason: `Meaningful synthetic ${action} event ${index + 1}.`,
      ...(action === 'rename' ? { unchangedMeaning: true } : {}) });
  }
  const model = loadStores(destination); assert(model.ok, JSON.stringify(model.diagnostics));
  const checked = evaluateSubjectGovernance({ registry: model.subjectRegistry, identity: model.identity, identityIndex: model.identityIndex, decisionCaptures });
  assert(checked.ok, JSON.stringify(checked.diagnostics));
  for (const record of inventories) {
    const entry = (record.kind === 'knowledge' ? model.leaves : record.kind === 'ontology' ? model.concepts : model.decisions).get(record.id);
    const check = validateAssignments({ ref: { namespace, kind: record.kind, id: record.id }, entry }, checked.governance,
      { purpose: 'new-assignment', budget: { redirects: 32 } });
    assert(check.ok, JSON.stringify(check.diagnostics));
  }
  const structural = runChecks(model, destination);
  assert(!structural.some(row => row.severity === 'error'), JSON.stringify(structural));
  assert.deepEqual(runtimeProvenance(runtime), provenance);
  assert.equal(hash(readFileSync(fileURLToPath(import.meta.url))), builderSha256);
  const summary = { runtimePin: OPERATIONAL_RUNTIME, builderSha256, provenance, root: destination, shape, history, assignmentMode, namespace,
    expected: { records: recordCount, perStore, subjects: 256, events: history ? 256 : 1, rows: history ? 1024 : 256,
      assignments: inventories.reduce((n, row) => n + (row.subjects?.length ?? 0), 0),
      absent: inventories.filter(row => row.subjects === null).length, empty: inventories.filter(row => row.subjects?.length === 0).length },
    inventories, transitions, structural, topology: document.subjects.map(({ id, parent }) => ({ id, ...(parent ? { parent } : {}) })),
    finalRegistrySha256: canonicalSha256(document),
    scope: 'Synthetic ordinary transitions individually validated against actual prior disk models. Baseline detached bootstrap uses preallocated subjects; not evidence for a future two-model activation gate. No publication, promotion, retirement or performance qualification.',
    files: files(destination).map(file => ({ file: file.slice(destination.length + 1), bytes: readFileSync(file).length, sha256: hash(readFileSync(file)) })) };
  assert.equal(document.history.length, summary.expected.events);
  assert.equal(document.history.reduce((n, event) => n + event.rows.length, 0), summary.expected.rows);
  return summary;
}

/** Independent truth expectations from authored membership and parent edges; no P4 calls. */
export function planOperationalQueries(fixture) {
  assert(fixture.expected.records <= contextBudgets.maxRecords && fixture.expected.assignments <= contextBudgets.maxAssignments,
    'this planner covers the admitted data envelope; above-limit cases need separate explicit expectations');
  const ids = fixture.topology.map(row => row.id);
  const parents = new Map(fixture.topology.map(row => [row.id, row.parent]));
  const ancestorOrSelf = (child, target) => {
    const seen = new Set();
    for (let cursor = child; cursor; cursor = parents.get(cursor)) {
      assert(!seen.has(cursor), 'fixture parent cycle'); seen.add(cursor);
      if (cursor === target) return true;
    }
    return false;
  };
  const assigned = subject => ({ op: 'assigned', subject });
  const evaluate = (node, subjects, expansion) => {
    if (node.op === 'all') return 'T';
    if (node.op === 'assigned') return subjects === null ? 'U'
      : subjects.some(id => expansion === 'direct' ? id === node.subject : ancestorOrSelf(id, node.subject)) ? 'T' : 'F';
    if (node.op === 'not') return { T: 'F', F: 'T', U: 'U' }[evaluate(node.arg, subjects, expansion)];
    const values = node.args.map(arg => evaluate(arg, subjects, expansion));
    if (node.op === 'and') return values.includes('F') ? 'F' : values.includes('U') ? 'U' : 'T';
    assert.equal(node.op, 'or');
    return values.includes('T') ? 'T' : values.includes('U') ? 'U' : 'F';
  };
  const atom = assigned(ids[0]);
  const grouped = widths => ({ op: 'and', args: widths.map(width =>
    ({ op: 'and', args: Array.from({ length: width }, () => assigned(ids[0])) })) });
  let depth8 = atom;
  for (let i = 0; i < 7; i++) depth8 = { op: 'not', arg: depth8 };
  const shapes = [
    { name: 'direct', where: atom, expansion: 'direct' },
    { name: 'descendant', where: atom, expansion: 'self-and-descendants' },
    { name: 'ancestor-topic', where: assigned(ids[7]), expansion: 'self-and-descendants' },
    { name: 'conjunction', where: { op: 'and', args: [atom, assigned(ids[1])] }, expansion: 'direct' },
    { name: 'disjunction', where: { op: 'or', args: [atom, assigned(ids[1])] }, expansion: 'direct' },
    { name: 'negation', where: { op: 'not', arg: atom }, expansion: 'self-and-descendants' },
    { name: 'context-base-62-nodes', where: grouped([14, 14, 14, 15]), expansion: 'direct' },
    { name: 'context-overflow-64-nodes', where: grouped([15, 15, 15, 14]), expansion: 'direct', contextRefused: true },
    { name: 'context-overflow-depth8', where: depth8, expansion: 'direct', contextRefused: true },
  ];
  return shapes.map(({ name, where, expansion, contextRefused = false }) => {
    const query = { version: 1, stores: ['knowledge', 'ontology', 'decisions'], view: 'current', where, expansion, budgets: { ...queryBudgets } };
    const expectedCounts = predicate => {
      const counts = Object.fromEntries(query.stores.map(store => [store, { strict: 0, possible: 0, excluded: 0 }]));
      for (const row of fixture.inventories) counts[row.store][{ T: 'strict', U: 'possible', F: 'excluded' }[evaluate(predicate, row.subjects, expansion)]]++;
      return counts;
    };
    const counts = expectedCounts(where);
    const mentioned = new Set();
    const visit = node => { if (node.op === 'assigned') mentioned.add(node.subject); if (node.arg) visit(node.arg); node.args?.forEach(visit); };
    visit(where);
    const candidates = new Set();
    for (const row of fixture.inventories) for (const subject of row.subjects ?? []) {
      candidates.add(subject);
      if (expansion === 'self-and-descendants') for (let parent = parents.get(subject); parent; parent = parents.get(parent)) candidates.add(parent);
    }
    for (const subject of mentioned) candidates.delete(subject);
    const unknownAssignments = fixture.inventories.filter(row => row.subjects === null).length;
    const refusal = contextRefused && candidates.size > 0;
    const candidateSubjects = [...candidates].sort();
    const contexts = refusal ? null : candidateSubjects.slice(0, contextBudgets.maxContexts).map(subject => ({ subject,
      counts: expectedCounts({ op: 'and', args: [where, assigned(subject)] }) }));
    return { name, query, contextOptions: { budgets: { ...contextBudgets } },
      expected: { queryStatus: 'complete', counts,
        contextStatus: refusal ? 'refused' : unknownAssignments || candidates.size > contextBudgets.maxContexts ? 'incomplete' : 'complete',
        knownCandidates: candidates.size, unknownAssignments,
        candidateSubjects, contexts,
        enumerationComplete: !unknownAssignments, countsComplete: !refusal && candidates.size <= contextBudgets.maxContexts,
        boundary: refusal ? 'Context wrapping adds two AST nodes and one depth; base query itself remains valid.' : 'Candidate cap and absent assignments remain explicit coverage limits.' } };
  });
}
