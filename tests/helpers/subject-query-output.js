/** Independent test decoder and serialized-node oracle, not a production helper. */
import assert from 'node:assert/strict';

export function expandedQueryRow(result, row) {
  assert.equal(result.outputVersion, 2);
  assert.equal(Object.hasOwn(row, 'assignmentSubjects'), false);
  const ids = row.assignments.state === 'known' ? row.assignments.ids : [];
  if (ids.length) {
    assert.deepEqual(Object.keys(result.assignmentEvidence).sort(), ['kind', 'namespace', 'outcomes', 'policy', 'purpose']);
    assert.equal(result.assignmentEvidence.namespace, (row.ref ?? row.proposalRef).namespace);
    assert.equal(result.assignmentEvidence.namespace, result.input.namespace);
    assert.equal(result.assignmentEvidence.kind, 'subject');
    assert.equal(result.assignmentEvidence.purpose, 'query');
    assert.equal(result.assignmentEvidence.policy, result.query.subjectPolicy);
  }
  return { ...row, assignmentSubjects: ids.map((id, index) => {
    assert.match(id, /^S-\d{6}$/);
    const outcome = result.assignmentEvidence.outcomes[id];
    assert.ok(outcome);
    assert.equal(outcome.eligible, true);
    assert.equal(outcome.verification, 'verified');
    assert.equal(outcome.resolution.requestedId, id);
    assert.equal(outcome.resolution.policy, result.query.subjectPolicy);
    assert.equal(outcome.resolution.status, 'resolved');
    assert.equal(outcome.resolution.id, outcome.resolution.subject.id);
    return { originalId: id, index, path: `subjects[${index}]`, outcome: structuredClone(outcome) };
  }) };
}

export function jsonNodes(value) {
  return 1 + (value !== null && typeof value === 'object'
    ? Object.values(value).reduce((total, child) => total + jsonNodes(child), 0) : 0);
}

export function queryExplanationNodes(result) {
  const ids = new Set();
  let total = result.assignmentEvidence ? jsonNodes(result.assignmentEvidence) : 0;
  for (const group of Object.values(result.groups ?? {})) for (const row of [...group.strict, ...group.possible]) {
    expandedQueryRow(result, row);
    for (const id of row.assignments.ids ?? []) ids.add(id);
    total += jsonNodes(Object.fromEntries(['witness', 'unknowns', 'assignments', 'applicability']
      .filter(key => Object.hasOwn(row, key)).map(key => [key, row[key]])));
  }
  assert.deepEqual(Object.keys(result.assignmentEvidence?.outcomes ?? {}).sort(), [...ids].sort(), 'no unused or absent outcomes');
  return total;
}
