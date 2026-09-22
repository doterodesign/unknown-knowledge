import { equivalentMergeFixture, registryWire } from './equivalent-merge-fixture.js';
import { captureCommittedFile, describeCandidateBytes } from '../../payload/engine/lib/captured-source.js';
import { parseRecordFile } from '../../payload/engine/lib/record-file.js';
import { canonicalSha256 } from '../../payload/engine/lib/canonical-json.js';
import { readAssignments } from '../../payload/engine/lib/subject-assignments.js';
import { sealAssignmentEvent } from './assignment-event-fixture.js';
import { assignmentEventDigest } from '../../payload/engine/lib/assignment-event.js';

const yaml = (entries) => 'schema-version: 2\nentries:\n' + entries.map((entry) => Object.entries(entry)
  .map(([key, value], i) => `${i === 0 ? '  - ' : '    '}${key}: ${JSON.stringify(value)}\n`).join('')).join('');

/** Actual grouped K/O/D merge pair; protection conflicts remain real file conflicts. */
export function typedEquivalentMergeFixture(t, { kinds = ['knowledge', 'ontology', 'decision'], nested = false,
  unknownSibling = null, authorizer = null, inactive = null, tracked = false, beforeChange } = {}) {
  const files = { ontology: 'ontology/classes/merge.yaml', decision: authorizer ? 'decisions/entries/approval.yaml' : 'decisions/entries/merge.yaml' };
  const typed = {}; const selected = [];
  const f = equivalentMergeFixture(t, { nested,
    beforeChange: ({ context, put, read, replaceSubjects, decisionCaptures }) => {
      if (!kinds.includes('knowledge')) {
        replaceSubjects('knowledge/K-000001.md', []); replaceSubjects('knowledge/K-000002.md', ['S-000002', 'S-000003']);
      }
      const identity = structuredClone(context.model.identity);
      for (const kind of ['ontology', 'decision']) {
        const store = kind === 'decision' ? 'decisions' : kind;
        const ids = kind === 'ontology' ? ['O-000001', 'O-000002', 'O-000003'] : ['D-000002', 'D-000003', 'D-000004'];
        const entries = ids.map((id, i) => ({ ...(kind === 'ontology'
          ? { id, term: id, class: 'general', summary: `Retained ${id}`, status: inactive === kind && i === 0 ? 'deprecated' : 'active',
            'source-of-truth': [nested ? 'unknown-knowledge/src/owned.js' : 'src/owned.js'], 'last-verified': '2026-09-19' }
          : { id, title: id, category: 'architecture', date: '2026-09-19', deciders: ['steward'],
            status: inactive === kind && i === 0 ? 'archived' : i === 1 ? 'addressed' : 'accepted',
            context: `Retained ${id}`, decision: 'Preserve this reasoning' }),
          ...(unknownSibling === kind && i === 2 ? {} : { subjects: kinds.includes(kind) && i < 2
            ? i === 0 ? ['S-000001'] : ['S-000003', 'S-000001', 'S-000002'] : [] }) }));
        if (kind === 'decision' && authorizer) {
          const approval = JSON.parse(read(files.decision)).entries[0];
          if (authorizer === 'self') approval.subjects = ['S-000001'];
          entries.unshift(approval);
        }
        typed[kind] = entries;
        put(files[kind], yaml(entries));
        const catalog = kind === 'decision' ? JSON.parse(read('decisions/_catalog.yaml')) : { 'schema-version': 2, store, entries: [] };
        catalog.entries.push(...ids.map((id) => ({ id, title: id, file: files[kind].slice(store.length + 1) })));
        put(`${store}/_catalog.yaml`, catalog);
        identity.allocations.push(...ids.map((id) => ({ kind, id, state: 'allocated', publication: identity.allocations[0].publication })));
        if (kinds.includes(kind)) selected.push(...ids.slice(0, 2).map((id) => ({ kind, id, file: files[kind] })));
      }
      if (authorizer) {
        const bytes = Buffer.from(read(files.decision));
        const capture = describeCandidateBytes({ file: nested ? `unknown-knowledge/${files.decision}` : files.decision, bytes, objectFormat: 'sha1' });
        const document = structuredClone(context.model.subjectRegistry.document);
        for (const subject of document.subjects) subject.warrant.records[0].capture = capture;
        for (const row of document.history[0].rows) row.after.warrant.records[0].capture = capture;
        const { review, ...body } = document.history[0];
        document.history[0].review = { ...review, decisionCapture: capture, decisionDigest: canonicalSha256(typed.decision[0]), changeDigest: canonicalSha256(body) };
        put('subjects/registry.yaml', registryWire(document));
        decisionCaptures.splice(0, decisionCaptures.length, { capture, bytes, objectFormat: 'sha1' });
        if (authorizer === 'self') selected.push({ kind: 'decision', id: 'D-000001', file: files.decision });
      }
      put('_identity.yaml', identity); put('src/owned.js', 'export const retained = true;\n');
      beforeChange?.({ put, read, replaceSubjects });
    },
    candidateChange: ({ put, replaceSubjects }) => {
      if (!kinds.includes('knowledge')) {
        replaceSubjects('knowledge/K-000001.md', []); replaceSubjects('knowledge/K-000002.md', ['S-000002', 'S-000003']);
      }
      for (const kind of ['ontology', 'decision']) put(files[kind], yaml(typed[kind].map((entry) => {
        if (!selected.some(({ id }) => id === entry.id)) return entry;
        return { ...entry, subjects: entry.subjects.includes('S-000002') ? entry.subjects.filter((id) => id !== 'S-000001')
          : entry.subjects.map((id) => id === 'S-000001' ? 'S-000002' : id) };
      })));
    },
  });
  const path = (file) => nested ? `unknown-knowledge/${file}` : file;
  if (kinds.includes('knowledge')) selected.push(...['K-000001', 'K-000002'].map((id) => ({ kind: 'knowledge', id, file: `knowledge/${id}.md` })));
  // Give Knowledge the supported block syntax without rewriting any O/D bytes.
  const knowledge = selected.filter(({ kind }) => kind === 'knowledge');
  const afterKnowledge = knowledge.map(({ file }) => f.read(file));
  const block = (text, note) => {
    const parts = text.split('---\n'); const record = JSON.parse(parts[1]);
    parts[1] = Object.entries(record).map(([key, value]) => `${key}: ${JSON.stringify(value)}\n`).join('');
    if (note) parts[1] += `notes:\n  - ${JSON.stringify(note)}\n`;
    return parts.join('---\n');
  };
  f.git('read-tree', f.input.before.tree);
  for (const { file } of knowledge) {
    const captured = captureCommittedFile({ repoRoot: f.root, commit: f.input.before.commit, file: path(file) });
    f.put(file, block(captured.bytes.toString())); f.git('add', path(file));
  }
  const tree = f.git('write-tree');
  f.input.before = { commit: f.git('commit-tree', tree, '-m', 'typed merge before'), tree, kitPath: f.input.before.kitPath };
  f.git('read-tree', f.input.candidate.tree);
  for (const [i, { file }] of knowledge.entries()) {
    const ids = JSON.parse(afterKnowledge[i].split('---\n')[1]).subjects;
    f.put(file, block(afterKnowledge[i], { type: 'revision', date: f.input.reviewNote.date,
      text: `Classification review by ${f.input.reviewNote.author} using ${f.input.reviewNote.skill}: subjects ${ids.join(', ')}. Existing evidence metadata retained.` }));
  }
  const rows = selected.map(({ kind, id, file }) => {
    const before = captureCommittedFile({ repoRoot: f.root, commit: f.input.before.commit, file: path(file) });
    const entry = (text) => parseRecordFile({ kind, file, text }).occurrences.find(({ entry }) => entry.record.id === id).entry;
    return { ref: { namespace: f.document.namespace, kind, id }, before: readAssignments(entry(before.bytes.toString())),
      after: readAssignments(entry(f.read(file))), 'before-revision': 0, 'after-revision': 1,
      disposition: 'changed', reason: 'Apply the reviewed equivalent meaning', 'before-capture': before.locator,
      'after-capture': describeCandidateBytes({ file: path(file), bytes: Buffer.from(f.read(file)), objectFormat: 'sha1' }) };
  });
  const operation = f.input.operation;
  if (authorizer === 'self') operation.retainedUnknowns = operation.retainedUnknowns.filter(({ ref }) => ref.id !== 'D-000001');
  if (unknownSibling) operation.retainedUnknowns.push({ ref: { namespace: f.document.namespace, kind: unknownSibling,
    id: unknownSibling === 'ontology' ? 'O-000003' : 'D-000004' }, reason: 'Retain the unclassified sibling' });
  const event = { 'schema-version': 2, event: operation.assignmentEvent.id, namespace: f.document.namespace,
    operation: 'subject-use-transition', scope: { kind: 'subject-use-transition', operation: operation.id, action: operation.action,
      survivor: operation.survivor, absorbed: operation.absorbed, 'registry-events': operation.registryEvents.map(({ id }) => id) },
    'before-input': { commit: f.input.before.commit, tree, 'kit-path': f.input.before.kitPath }, decision: f.event.decision,
    review: { reference: f.event.review.reference, 'accepted-status': f.event.review.acceptedStatus,
      'decision-capture': f.event.review.decisionCapture, 'decision-digest': f.event.review.decisionDigest }, rows };
  const baseline = { 'schema-version': 1, namespace: f.document.namespace,
    baselines: rows.map((row) => ({ ref: row.ref, state: row.before, capture: row['before-capture'] })) };
  const baselineWire = (value) => `schema-version: 1\nnamespace: ${value.namespace}\nbaselines:\n`
    + value.baselines.map((row) => `  - ${JSON.stringify(row)}\n`).join('');
  if (tracked) {
    const row = rows.find(({ ref }) => ref.kind !== 'knowledge');
    const file = selected.find(({ id }) => id === row.ref.id).file;
    const candidateText = f.read(file);
    const original = captureCommittedFile({ repoRoot: f.root, commit: f.input.before.commit, file: path(file) });
    const parsed = parseRecordFile({ kind: row.ref.kind, file, text: original.bytes.toString() });
    f.git('read-tree', f.input.before.tree);
    f.put(file, yaml(parsed.document.entries.map((entry) => entry.id === row.ref.id ? { ...entry, subjects: [] } : entry)));
    f.git('add', path(file)); const pastTree = f.git('write-tree');
    const pastCommit = f.git('commit-tree', pastTree, '-m', 'prior unclassified explicit-empty record');
    const priorCapture = captureCommittedFile({ repoRoot: f.root, commit: pastCommit, file: path(file) });
    const oldBaseline = { ref: row.ref, state: { state: 'known', ids: [] }, capture: priorCapture.locator };
    const oldEvent = sealAssignmentEvent({ ...event, event: '77777777-7777-4777-8777-777777777777', operation: 'existing-subjects',
      scope: { kind: 'typed-records', refs: [row.ref] }, 'before-input': { commit: pastCommit, tree: pastTree, 'kit-path': f.input.before.kitPath },
      rows: [{ ...row, before: oldBaseline.state, after: row.before,
        'before-capture': priorCapture.locator, 'after-capture': describeCandidateBytes({ file: path(file), bytes: original.bytes, objectFormat: 'sha1' }) }] });
    f.git('read-tree', f.input.before.tree);
    f.put('subjects/_assignments/_baselines.yaml', baselineWire({ ...baseline, baselines: [oldBaseline] }));
    f.put(`subjects/_assignments/${oldEvent.event}.yaml`, oldEvent);
    f.git('add', path('subjects/_assignments')); const trackedTree = f.git('write-tree');
    f.input.before = { ...f.input.before, commit: f.git('commit-tree', trackedTree, '-p', pastCommit, '-m', 'tracked typed before'), tree: trackedTree };
    event['before-input'] = { commit: f.input.before.commit, tree: trackedTree, 'kit-path': f.input.before.kitPath };
    for (const entry of rows) entry['before-capture'] = captureCommittedFile({ repoRoot: f.root, commit: f.input.before.commit, file: entry['before-capture'].file }).locator;
    baseline.baselines = [oldBaseline, ...rows.filter((entry) => entry !== row).map((entry) => ({ ref: entry.ref, state: entry.before, capture: entry['before-capture'] }))];
    row['before-revision'] = 1; row['after-revision'] = 2;
    f.put(file, candidateText);
    f.git('read-tree', f.input.candidate.tree);
  }
  const save = () => {
    for (const row of event.rows) {
      const file = row['after-capture'].file;
      row['after-capture'] = describeCandidateBytes({ file, bytes: Buffer.from(f.read(nested ? file.slice('unknown-knowledge/'.length) : file)), objectFormat: 'sha1' });
    }
    const sealed = sealAssignmentEvent(event);
    f.put('subjects/_assignments/_baselines.yaml', baselineWire(baseline)); f.put(`subjects/_assignments/${event.event}.yaml`, sealed);
    f.git('add', '.'); const tree = f.git('write-tree');
    f.input.candidate = { commit: f.git('commit-tree', tree, '-p', f.input.before.commit, '-m', 'typed joint merge'), tree, kitPath: f.input.before.kitPath };
    operation.assignmentEvent.changeDigest = assignmentEventDigest(sealed); return f.input;
  };
  save(); return { ...f, files, path, assignmentEvent: event, baseline, save };
}
