/** Hand-authored P8 history over one actual original split capture pair. */
import { load } from 'js-yaml';
import { subjectSplitCoreFixture } from './subject-split-core-fixture.js';
import { describeCandidateBytes } from '../../payload/engine/lib/captured-source.js';
import { sealAssignmentEvent } from './assignment-event-fixture.js';
import { assignmentEventDigest } from '../../payload/engine/lib/assignment-event.js';

const baselineFile = 'subjects/_assignments/_baselines.yaml';
const baselineText = baseline => `schema-version: 1\nnamespace: ${JSON.stringify(baseline.namespace)}\nbaselines:\n`
  + baseline.baselines.map(row => `  - ${JSON.stringify(row)}\n`).join('');
const reviewFor = event => ({ reference: event.review.reference, 'accepted-status': event.review.acceptedStatus,
  'decision-capture': event.review.decisionCapture, 'decision-digest': event.review.decisionDigest });

export function subjectSplitAssignmentFixture(t, { tracked = false, beforeChange, candidateChange, ...options } = {}) {
  let assignmentEvent = null; let baseline = null; let priorEvent = null; let priorInput = null;
  const f = subjectSplitCoreFixture(t, { ...options, recordFormat: 'block',
    beforeChange(h) {
      beforeChange?.(h);
      if (!tracked) return;
      const seed = h.commit('actual original classifications before tracking');
      const rows = h.owners.map(owner => {
        const captured = h.capture(seed, owner.file);
        return { ref: owner.ref, before: { state: 'known', ids: owner.before }, after: { state: 'known', ids: owner.before },
          'before-revision': 0, 'after-revision': 0, disposition: 'unchanged', reason: 'Retain the original classification',
          'before-capture': captured.capture,
          'after-capture': describeCandidateBytes({ file: captured.capture.file, bytes: captured.bytes, objectFormat: captured.objectFormat }) };
      });
      priorEvent = sealAssignmentEvent({ 'schema-version': 2, event: '44444444-4444-4444-8444-444444444444', namespace: h.ref('K-000001').namespace,
        operation: 'existing-subjects', scope: { kind: 'typed-records', refs: rows.map(row => row.ref) },
        'before-input': { commit: seed.commit, tree: seed.tree, 'kit-path': seed.kitPath },
        decision: h.split.decision, review: reviewFor(h.split), rows });
      baseline = { 'schema-version': 1, namespace: priorEvent.namespace,
        baselines: rows.map(row => ({ ref: row.ref, state: row.before, capture: row['before-capture'] })) };
      h.put(baselineFile, baselineText(baseline));
      h.put(`subjects/_assignments/${priorEvent.event}.yaml`, priorEvent);
      priorInput = { seed, eventId: priorEvent.event };
    },
    candidateChange(h) {
      if (h.operation.assignmentEvent === null) { candidateChange?.(h); return; }
      for (const owner of h.owners.filter(owner => owner.ref.kind === 'knowledge')) h.editKnowledge(owner.file, record => {
        record.notes = [...(record.notes ?? []), { type: 'revision', date: h.input.reviewNote.date,
          text: `Classification review by ${h.input.reviewNote.author} using ${h.input.reviewNote.skill}: subjects ${record.subjects.length ? record.subjects.join(', ') : 'explicit empty'}. Existing evidence metadata retained.` }];
      });
      const rows = h.operation.mappings.map(mapping => {
        const owner = h.owners.find(owner => owner.ref.kind === mapping.ref.kind && owner.ref.id === mapping.ref.id);
        const captured = h.capture(h.input.before, owner.file);
        const text = h.read(owner.file);
        const record = owner.ref.kind === 'knowledge' ? load(text.split('---\n')[1]) : load(text).entries.find(row => row.id === owner.ref.id);
        return { ref: mapping.ref, before: { state: 'known', ids: [...owner.before] }, after: { state: 'known', ids: [...record.subjects] },
          'before-revision': 0, 'after-revision': 1, disposition: 'changed', reason: mapping.reason,
          'before-capture': captured.capture,
          'after-capture': describeCandidateBytes({ file: captured.capture.file, bytes: Buffer.from(text), objectFormat: captured.objectFormat }) };
      });
      const op = h.operation;
      assignmentEvent = { 'schema-version': 2, event: op.assignmentEvent.id, namespace: h.document.namespace,
        operation: 'subject-use-transition', scope: { kind: 'subject-use-transition', operation: op.id, action: 'split',
          subject: op.subject, successors: op.successors, 'registry-events': op.registryEvents.map(row => row.id) },
        'before-input': { commit: h.input.before.commit, tree: h.input.before.tree, 'kit-path': h.input.before.kitPath },
        decision: h.split.decision, review: reviewFor(h.split), rows };
      baseline ??= { 'schema-version': 1, namespace: h.document.namespace,
        baselines: rows.map(row => ({ ref: row.ref, state: row.before, capture: row['before-capture'] })) };
      h.put(baselineFile, baselineText(baseline));
      assignmentEvent = sealAssignmentEvent(assignmentEvent);
      h.put(`subjects/_assignments/${assignmentEvent.event}.yaml`, assignmentEvent);
      op.assignmentEvent.changeDigest = assignmentEventDigest(assignmentEvent);
      candidateChange?.({ ...h, assignmentEvent, baseline, priorEvent });
    } });
  const save = ({ refreshCaptures = true } = {}) => {
    if (assignmentEvent) {
      if (refreshCaptures) for (const row of assignmentEvent.rows) {
        const file = f.input.before.kitPath === '.' ? row['after-capture'].file : row['after-capture'].file.slice(f.input.before.kitPath.length + 1);
        row['after-capture'] = describeCandidateBytes({ file: row['after-capture'].file, bytes: Buffer.from(f.read(file)), objectFormat: options.objectFormat ?? 'sha1' });
      }
      assignmentEvent = sealAssignmentEvent(assignmentEvent);
      f.put(baselineFile, baselineText(baseline));
      f.put(`subjects/_assignments/${assignmentEvent.event}.yaml`, assignmentEvent);
      f.operation.assignmentEvent.changeDigest = assignmentEventDigest(assignmentEvent);
    }
    f.input.candidate = f.commit('actual split assignment candidate edits');
    return f.input;
  };
  if (priorInput) priorInput = { repoRoot: f.root, before: priorInput.seed, candidate: f.input.before, eventId: priorInput.eventId,
    reviewNote: f.input.reviewNote, selection: priorEvent.scope, decisionCaptures: f.input.evidence.decisionCaptures,
    limits: f.input.limits.assignments, impact: { required: [] } };
  return { ...f, get assignmentEvent() { return assignmentEvent; }, baseline, priorEvent, priorInput, save };
}
