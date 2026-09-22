/** Structural source fixture, not verified capture or approval evidence. */
import { canonicalSha256 } from '../../payload/engine/lib/canonical-json.js';

export const assignmentBeforeInput = Object.freeze({ commit: 'c'.repeat(40), tree: 'd'.repeat(40), 'kit-path': '.' });

export function sealAssignmentEvent(value) {
  const event = structuredClone(value);
  const key = (ref) => JSON.stringify([ref.namespace, ref.kind, ref.id]);
  event['candidate-records-digest'] = canonicalSha256(event.rows.map((row) => ({ ref: row.ref, 'after-capture': row['after-capture'] }))
    .sort((a, b) => key(a.ref) < key(b.ref) ? -1 : key(a.ref) > key(b.ref) ? 1 : 0));
  const { review, ...body } = event;
  event.review = { ...review, 'change-digest': canonicalSha256(body) };
  return event;
}

export function assignmentEventFixture({ namespace, event, rows }) {
  const fileFor = { knowledge: 'knowledge/one.md', ontology: 'ontology/classes/one.yaml', decision: 'decisions/entries/direction.yaml' };
  return sealAssignmentEvent({
    'schema-version': 1, event, namespace,
    scope: { kind: 'knowledge-domain', occupancy: 'allocated', field: 'facets.domain', match: 'exact', values: ['design-system'] },
    'before-input': { ...assignmentBeforeInput },
    decision: { namespace, kind: 'decision', id: 'D-000001' },
    review: { reference: 'fixture:classification-review', 'accepted-status': 'accepted',
      'decision-capture': { file: 'decisions/entries/direction.yaml', blob: 'a'.repeat(40), sha256: 'b'.repeat(64),
        source: { commit: assignmentBeforeInput.commit, tree: assignmentBeforeInput.tree } },
      'decision-digest': 'e'.repeat(64) },
    rows: rows.map((row) => ({ ...row,
      'before-capture': { file: fileFor[row.ref.kind], blob: 'a'.repeat(40), sha256: 'b'.repeat(64),
        source: { commit: assignmentBeforeInput.commit, tree: assignmentBeforeInput.tree } },
      'after-capture': { file: fileFor[row.ref.kind], blob: 'e'.repeat(40), sha256: 'f'.repeat(64) },
    })),
  });
}
