import { load } from 'js-yaml';
import { subjectRetirementCoreFixture } from './subject-retirement-core-fixture.js';
import { captureCommittedFile, describeCandidateBytes } from '../../payload/engine/lib/captured-source.js';
import { sealAssignmentEvent } from './assignment-event-fixture.js';
import { assignmentEventDigest } from '../../payload/engine/lib/assignment-event.js';

const entries = rows => 'schema-version: 2\nentries:\n' + rows.map(record => Object.entries(record)
  .map(([key,value],index) => `${index ? '    ' : '  - '}${key}: ${JSON.stringify(value)}\n`).join('')).join('');
const leaf = (record, body, note) => '---\n' + Object.entries(record).map(([key,value]) => `${key}: ${JSON.stringify(value)}\n`).join('')
  + (note ? `notes:\n  - ${JSON.stringify(note)}\n` : '') + '---\n' + body;

/** Independent exact record edits, baseline and nonempty event over a real retirement pair. */
export function subjectRetirementAssignmentFixture(t, options = {}) {
  const f = subjectRetirementCoreFixture(t, options);
  if (options.zero && !options.tracked) return { ...f, assignmentEvent: null, baseline: null, save: () => f.input };
  const kind = options.kind ?? 'knowledge';
  const files = kind === 'knowledge' ? ['knowledge/K-000001.md', 'knowledge/K-000002.md'] : [f.typedFile];
  if (kind !== 'knowledge' && options.includeKnowledge) files.push('knowledge/K-000001.md', 'knowledge/K-000002.md');
  const fileKind = file => file.startsWith('knowledge/') ? 'knowledge' : kind;
  const repoPath = file => f.input.before.kitPath === '.' ? file : `${f.input.before.kitPath}/${file}`;
  const kitPath = file => f.input.before.kitPath === '.' ? file : file.slice(f.input.before.kitPath.length + 1);
  const originals = files.map(file => captureCommittedFile({ repoRoot: f.root, commit: f.input.before.commit, file: repoPath(file) }));
  const candidates = files.map(file => f.read(file));
  const parse = (text, kind) => kind === 'knowledge' ? [load(text.split('---\n')[1])] : load(text).entries;
  const body = text => text.split('---\n').slice(2).join('---\n');
  f.git('read-tree', f.input.before.tree);
  files.forEach((file,index) => {
    const kind = fileKind(file);
    const text = originals[index].bytes.toString(); const records = parse(text, kind);
    f.put(file, kind === 'knowledge' ? leaf(records[0], body(text)) : entries(records));
    f.git('add', repoPath(file));
  });
  const beforeTree = f.git('write-tree');
  f.input.before = { ...f.input.before, tree: beforeTree, commit: f.git('commit-tree', beforeTree, '-m', 'original supported retirement spans') };
  let priorInput = null; let priorEvent = null; let priorBaseline = null;
  if (options.tracked) {
    const seed = { ...f.input.before };
    const priorRows = files.flatMap((file,index) => parse(originals[index].bytes.toString(), fileKind(file))
      .filter(record => options.zero || record.subjects?.includes(f.input.operation.subject)).map(record => ({
        ref: { namespace: f.document.namespace, kind: fileKind(file), id: record.id },
        before: { state: 'known', ids: record.subjects }, after: { state: 'known', ids: record.subjects },
        'before-revision': 0, 'after-revision': 0, disposition: 'unchanged', reason: 'Review and retain the existing classification',
        'before-capture': captureCommittedFile({ repoRoot: f.root, commit: seed.commit, file: repoPath(file) }).locator,
        'after-capture': describeCandidateBytes({ file: repoPath(file), bytes: Buffer.from(f.read(file)), objectFormat: originals[index].objectFormat }),
      })));
    priorEvent = sealAssignmentEvent({ 'schema-version': 2, event: '44444444-4444-4444-8444-444444444444', namespace: f.document.namespace,
      operation: 'existing-subjects', scope: { kind: 'typed-records', refs: priorRows.map(({ref}) => ref) },
      'before-input': { commit: seed.commit, tree: seed.tree, 'kit-path': seed.kitPath }, decision: f.event.decision,
      review: { reference: f.event.review.reference, 'accepted-status': f.event.review.acceptedStatus,
        'decision-capture': f.event.review.decisionCapture, 'decision-digest': f.event.review.decisionDigest }, rows: priorRows });
    priorBaseline = { 'schema-version': 1, namespace: f.document.namespace,
      baselines: priorRows.map(row => ({ ref: row.ref, state: row.before, capture: row['before-capture'] })) };
    f.put('subjects/_assignments/_baselines.yaml', priorBaseline);
    f.put(`subjects/_assignments/${priorEvent.event}.yaml`, priorEvent);
    f.git('add', repoPath('subjects/_assignments/_baselines.yaml'), repoPath(`subjects/_assignments/${priorEvent.event}.yaml`));
    const tree = f.git('write-tree');
    f.input.before = { ...seed, tree, commit: f.git('commit-tree', tree, '-p', seed.commit, '-m', 'actual prior classification review') };
    priorInput = { repoRoot: f.root, before: seed, candidate: { ...f.input.before }, eventId: priorEvent.event,
      reviewNote: f.input.reviewNote, decisionCaptures: f.input.evidence.decisionCaptures, limits: f.input.limits.assignments,
      selection: priorEvent.scope, impact: { required: [] } };
  }
  f.git('read-tree', f.input.candidate.tree);
  if (options.zero) {
    // Only registry changes: retain the real earlier review and its block sources.
    f.git('add', '.'); const tree = f.git('write-tree');
    f.input.candidate = { ...f.input.candidate, tree,
      commit: f.git('commit-tree', tree, '-p', f.input.before.commit, '-m', 'eventless retirement with actual prior history') };
    return { ...f, assignmentEvent: null, baseline: priorBaseline, priorInput, priorEvent, save: () => f.input };
  }
  const rows = [];
  files.forEach((file,index) => {
    const kind = fileKind(file);
    const prior = parse(originals[index].bytes.toString(), kind); const next = parse(candidates[index], kind);
    const note = kind === 'knowledge' ? { type: 'revision', date: f.input.reviewNote.date,
      text: `Classification review by ${f.input.reviewNote.author} using ${f.input.reviewNote.skill}: subjects ${next[0].subjects.length ? next[0].subjects.join(', ') : 'explicit empty'}. Existing evidence metadata retained.` } : null;
    f.put(file, kind === 'knowledge' ? leaf(next[0], body(candidates[index]), note) : entries(next));
    for (const before of prior.filter(record => record.subjects?.includes(f.input.operation.subject))) {
      const after = next.find(record => record.id === before.id);
      rows.push({ ref: { namespace: f.document.namespace, kind, id: before.id },
        before: { state: 'known', ids: before.subjects }, after: { state: 'known', ids: after.subjects },
        'before-revision': 0, 'after-revision': 1,
        disposition: 'changed', reason: 'Withdraw only the retired Subject',
        'before-capture': captureCommittedFile({ repoRoot: f.root, commit: f.input.before.commit, file: repoPath(file) }).locator,
        'after-capture': describeCandidateBytes({ file: repoPath(file), bytes: Buffer.from(f.read(file)), objectFormat: originals[index].objectFormat }) });
    }
  });
  const op = f.input.operation;
  const event = { 'schema-version': 2, event: op.assignmentEvent.id, namespace: f.document.namespace,
    operation: 'subject-use-transition', scope: { kind: 'subject-use-transition', operation: op.id,
      action: 'retire', subject: op.subject, 'registry-events': op.registryEvents.map(({id}) => id) },
    'before-input': { commit: f.input.before.commit, tree: f.input.before.tree, 'kit-path': f.input.before.kitPath },
    decision: f.event.decision, review: { reference: f.event.review.reference, 'accepted-status': f.event.review.acceptedStatus,
      'decision-capture': f.event.review.decisionCapture, 'decision-digest': f.event.review.decisionDigest }, rows };
  const baseline = priorBaseline ?? { 'schema-version': 1, namespace: f.document.namespace,
    baselines: rows.map(row => ({ ref: row.ref, state: row.before, capture: row['before-capture'] })) };
  const save = () => {
    for (const row of event.rows) row['after-capture'] = describeCandidateBytes({ file: row['after-capture'].file,
      bytes: Buffer.from(f.read(kitPath(row['after-capture'].file))), objectFormat: originals[0].objectFormat });
    const sealed = sealAssignmentEvent(event);
    f.put('subjects/_assignments/_baselines.yaml', baseline);
    f.put(`subjects/_assignments/${event.event}.yaml`, sealed);
    f.git('add', '.'); const tree = f.git('write-tree');
    f.input.candidate = { ...f.input.candidate, tree, commit: f.git('commit-tree', tree, '-p', f.input.before.commit, '-m', 'exact retirement withdrawal history') };
    op.assignmentEvent.changeDigest = assignmentEventDigest(sealed); return f.input;
  };
  save(); return { ...f, assignmentEvent: event, baseline, priorInput, priorEvent, save };
}
