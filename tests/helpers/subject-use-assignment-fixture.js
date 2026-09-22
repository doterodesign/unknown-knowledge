import { equivalentMergeFixture } from './equivalent-merge-fixture.js';
import { captureCommittedFile, describeCandidateBytes } from '../../payload/engine/lib/captured-source.js';
import { sealAssignmentEvent } from './assignment-event-fixture.js';
import { assignmentEventDigest } from '../../payload/engine/lib/assignment-event.js';

/** Real merge pair with supported Knowledge syntax and actual assignment history. */
export function subjectUseAssignmentFixture(t) {
  const f = equivalentMergeFixture(t);
  const selected = ['K-000001', 'K-000002'];
  const originals = selected.map((id) => captureCommittedFile({ repoRoot: f.root, commit: f.input.before.commit, file: `knowledge/${id}.md` }));
  const next = selected.map((id) => f.read(`knowledge/${id}.md`));
  const block = (text, note) => {
    const parts = text.split('---\n'); const record = JSON.parse(parts[1]);
    parts[1] = Object.entries(record).map(([key, value]) => `${key}: ${JSON.stringify(value)}\n`).join('');
    if (note) parts[1] += `notes:\n  - ${JSON.stringify(note)}\n`;
    return parts.join('---\n');
  };
  f.git('read-tree', f.input.before.tree);
  for (const original of originals) { f.put(original.locator.file, block(original.bytes.toString())); f.git('add', original.locator.file); }
  const tree = f.git('write-tree');
  f.input.before = { commit: f.git('commit-tree', tree, '-m', 'block syntax before'), tree, kitPath: '.' };
  f.git('read-tree', f.input.candidate.tree);
  const rows = selected.map((id, i) => {
    const file = `knowledge/${id}.md`; const before = JSON.parse(originals[i].bytes.toString().split('---\n')[1]);
    const after = JSON.parse(next[i].split('---\n')[1]);
    const note = { type: 'revision', date: f.input.reviewNote.date,
      text: `Classification review by ${f.input.reviewNote.author} using ${f.input.reviewNote.skill}: subjects ${after.subjects.join(', ')}. Existing evidence metadata retained.` };
    f.put(file, block(next[i], note));
    return { ref: { namespace: f.document.namespace, kind: 'knowledge', id },
      before: { state: 'known', ids: before.subjects }, after: { state: 'known', ids: after.subjects },
      'before-revision': 0, 'after-revision': 1, disposition: 'changed', reason: 'Apply the reviewed equivalent meaning',
      'before-capture': captureCommittedFile({ repoRoot: f.root, commit: f.input.before.commit, file }).locator,
      'after-capture': describeCandidateBytes({ file, bytes: Buffer.from(f.read(file)), objectFormat: originals[i].objectFormat }) };
  });
  const operation = f.input.operation;
  const event = { 'schema-version': 2, event: operation.assignmentEvent.id, namespace: f.document.namespace,
    operation: 'subject-use-transition', scope: { kind: 'subject-use-transition', operation: operation.id,
      action: operation.action, survivor: operation.survivor, absorbed: operation.absorbed,
      'registry-events': operation.registryEvents.map(({ id }) => id) },
    'before-input': { commit: f.input.before.commit, tree, 'kit-path': '.' }, decision: f.event.decision,
    review: { reference: f.event.review.reference, 'accepted-status': f.event.review.acceptedStatus,
      'decision-capture': f.event.review.decisionCapture, 'decision-digest': f.event.review.decisionDigest }, rows };
  const baseline = { 'schema-version': 1, namespace: f.document.namespace,
    baselines: rows.map((row) => ({ ref: row.ref, state: row.before, capture: row['before-capture'] })) };
  const save = () => {
    for (const row of event.rows) row['after-capture'] = describeCandidateBytes({ file: row['after-capture'].file,
      bytes: Buffer.from(f.read(row['after-capture'].file)), objectFormat: originals[0].objectFormat });
    const sealed = sealAssignmentEvent(event);
    f.put('subjects/_assignments/_baselines.yaml', baseline);
    f.put(`subjects/_assignments/${event.event}.yaml`, sealed);
    f.git('add', '.'); const tree = f.git('write-tree');
    f.input.candidate = { commit: f.git('commit-tree', tree, '-p', f.input.before.commit, '-m', 'reviewed joint merge'), tree, kitPath: '.' };
    operation.assignmentEvent.changeDigest = assignmentEventDigest(sealed);
    return f.input;
  };
  save(); return { ...f, assignmentEvent: event, baseline, save };
}
