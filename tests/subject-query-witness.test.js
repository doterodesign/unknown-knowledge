import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { canonicalSha256 } from '../payload/engine/lib/canonical-json.js';
import { loadSubjectQueryContext } from '../payload/engine/lib/subject-query-context.js';
import { querySubjects } from '../payload/engine/lib/subject-query.js';
import { subjectQueryDiskFixture } from './helpers/subject-query-disk-fixture.js';
import { subjectQuery, queryBudgets, assigned } from './helpers/subject-query-fixture.js';
import { expandedQueryRow } from './helpers/subject-query-output.js';

const A = 'S-000001', B = 'S-000002', C = 'S-000003';
const wireKeys = { schemaVersion: 'schema-version', hierarchyRevision: 'hierarchy-revision',
  originDecision: 'origin-decision', acceptedStatus: 'accepted-status', decisionCapture: 'decision-capture',
  decisionDigest: 'decision-digest', changeDigest: 'change-digest' };
function wire(value) {
  if (Array.isArray(value)) return value.map(wire);
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [wireKeys[key] ?? key, wire(item)]));
}
const digestEvent = ({ review, ...event }) => canonicalSha256(event);

/** Author real reviewed history, then retain the same bytes the actual loader reads. */
function fixture(t, { equivalent = false } = {}) {
  const f = subjectQueryDiskFixture(t);
  const document = structuredClone(f.context.model.subjectRegistry.document);
  const creation = document.history[0];
  if (equivalent) {
    const before = structuredClone(creation.rows[0].after);
    const after = { ...before, status: 'retired', retirement: { kind: 'equivalent-merge', redirect: B } };
    const event = { id: '34567890-1234-4234-8234-123456789abc', action: 'merge-equivalent', decision: creation.decision,
      rows: [{ id: A, before, after }, { id: B, before: structuredClone(creation.rows[1].after),
        after: structuredClone(creation.rows[1].after), reason: 'Retain reviewed survivor' }], reason: 'Reviewed equivalence' };
    event.review = { ...creation.review, changeDigest: digestEvent(event) };
    document.history.push(event);
    document.subjects[0] = { id: A, ...after, changes: [creation.id, event.id] };
    document.subjects[1].changes.push(event.id);
    document.revision += 1;
  } else {
    // Independent authored topology: A <- B <- C. No query/traversal helper derives it.
    for (const [child, parent] of [[B, A], [C, B]]) {
      creation.rows.find(row => row.id === child).after.parent = parent;
      document.subjects.find(row => row.id === child).parent = parent;
    }
    creation.review.changeDigest = digestEvent(creation);
    document.hierarchyRevision = 1;
  }
  f.put('subjects/registry.yaml', wire(document));
  const registryBytes = readFileSync(join(f.kitRoot, 'subjects/registry.yaml'));
  const source = JSON.parse(registryBytes);
  const loaded = loadSubjectQueryContext({ root: f.root, decisionCaptures: f.decisionCaptures });
  assert.equal(loaded.ok, true, JSON.stringify(loaded.diagnostics));
  assert.deepEqual(wire(loaded.context.model.subjectRegistry.document), source);
  return { ...f, context: loaded.context, document, source, registryBytes };
}

// Test-only checker. It must reject corrupted output, not merely accept production output.
function checkWitness(f, result, row) {
  row = expandedQueryRow(result, row);
  assert.deepEqual(JSON.parse(f.registryBytes), wire(f.document));
  assert.equal(result.input.inputs.registry, canonicalSha256(f.document), 'captured forest binding');
  const { fingerprint, ...metadata } = result.input;
  assert.equal(fingerprint, canonicalSha256(metadata), 'input fingerprint');
  const forest = new Map(JSON.parse(f.registryBytes).subjects.map(subject => [subject.id, subject]));
  // Read the authored record bytes, not returned assignments or an index built by the evaluator.
  const record = JSON.parse(readFileSync(join(f.kitRoot, row.file), 'utf8').split('---\n')[1]);
  assert.equal(record.id, row.ref.id);
  assert.deepEqual(row.assignments, Object.hasOwn(record, 'subjects')
    ? { state: 'known', ids: record.subjects } : { state: 'unknown', reason: 'absent' });
  assert.deepEqual(row.sourcePointers, { sourceOfTruth: record['source-of-truth'] ?? null, citations: record.citations ?? null });
  for (const { capture, bytes } of f.decisionCaptures) {
    assert.equal(createHash('sha256').update(bytes).digest('hex'), capture.sha256);
    const decision = JSON.parse(bytes).entries[0];
    assert.equal(decision.status, 'accepted');
    for (const event of f.source.history) {
      assert.deepEqual(event.review['decision-capture'], capture);
      assert.equal(event.review['decision-digest'], canonicalSha256(decision));
    }
  }
  for (const event of f.document.history) assert.equal(event.review.changeDigest, digestEvent(event));
  const resolution = id => {
    const redirects = [];
    while (result.query.subjectPolicy === 'equivalent' && forest.get(id).status === 'retired') {
      assert.equal(forest.get(id).retirement.kind, 'equivalent-merge');
      const to = forest.get(id).retirement.redirect;
      assert.ok(redirects.length < forest.size, 'redirect cycle');
      redirects.push({ from: id, to });
      id = to;
    }
    return { id, redirects };
  };
  const matches = (candidate, asked, expansion) => {
    // Follow retained parent bytes upward, never a production expansion/index.
    const visited = new Set();
    let current = candidate;
    while (current !== asked && expansion === 'self-and-descendants') {
      if (!current) return false;
      assert.ok(!visited.has(current), 'captured ancestry cycle');
      visited.add(current);
      current = forest.get(current)?.parent;
    }
    return current === asked;
  };
  for (const assignment of row.assignmentSubjects) {
    const expected = resolution(assignment.originalId);
    assert.deepEqual(wire(assignment.outcome), { eligible: true, verification: 'verified', resolution: {
      status: 'resolved', requestedId: assignment.originalId, policy: result.query.subjectPolicy,
      subject: forest.get(expected.id), id: expected.id, redirects: expected.redirects,
    } }, 'entire outcome and warrant from original captured bytes');
  }
  for (const atom of row.witness.filter(node => node.op === 'assigned')) {
    const authored = atom.path.slice(1).split('/').reduce((value, key) => value[key], result.query);
    assert.equal(authored.op, atom.op);
    assert.equal(authored.subject, atom.subject);
    assert.equal(atom.expansion, result.query.expansion, 'authored expansion mode');
    assert.equal(atom.assignmentState, Object.hasOwn(record, 'subjects') ? 'known' : 'unknown');
    if (atom.assignmentState === 'unknown') {
      assert.equal(atom.truth, 'U');
      continue;
    }
    const asked = resolution(atom.subject);
    assert.equal(atom.resolvedSubject, asked.id);
    assert.deepEqual(atom.redirects, asked.redirects);
    for (const matched of atom.matchedSubjects) {
      assert.ok(record.subjects.includes(matched), 'matched ID must be a recorded assignment');
      const expected = resolution(matched);
      const checked = row.assignmentSubjects.find(subject => subject.originalId === matched);
      assert.equal(checked.outcome.eligible, true);
      assert.equal(checked.outcome.verification, 'verified');
      assert.equal(checked.outcome.resolution.id, expected.id, 'assignment redirect target');
      assert.deepEqual(checked.outcome.resolution.redirects, expected.redirects);
      assert.ok(matches(expected.id, asked.id, atom.expansion), 'direct match or actual captured descendant');
    }
    if (atom.truth === 'T') assert.ok(atom.matchedSubjects.length > 0, 'positive membership needs a match');
    if (atom.truth === 'F') {
      assert.equal(atom.matchedSubjects.length, 0);
      assert.equal(record.subjects.some(id => matches(resolution(id).id, asked.id, atom.expansion)), false,
        'recorded assignment actually matches; false membership is unjustified');
      assert.ok(atom.expansionComplete || record.subjects.length === 0, 'incomplete traversal cannot prove absence');
    }
    if (atom.truth === 'U') {
      assert.equal(atom.matchedSubjects.length, 0);
      assert.equal(atom.expansionComplete, false, 'known complete membership cannot be unknown');
      assert.ok(record.subjects.length > 0, 'known empty membership is false');
    }
  }
  // Independently evaluate possible Boolean worlds for each declared connective.
  // No production truth/predicate helper supplies expected composition.
  const witnesses = new Map(row.witness.map(node => [node.path, node]));
  assert.equal(witnesses.size, row.witness.length);
  for (const node of row.witness) {
    const authored = node.path.slice(1).split('/').reduce((value, key) => value[key], result.query);
    assert.equal(node.op, authored.op);
    assert.ok(['T', 'F', 'U'].includes(node.truth));
    if (node.op === 'all' || node.op === 'none') assert.equal(node.truth, node.op === 'all' ? 'T' : 'F');
    if (!['not', 'and', 'or'].includes(node.op)) continue;
    const paths = node.op === 'not' ? [`${node.path}/arg`]
      : authored.args.map((_, index) => `${node.path}/args/${index}`);
    const worlds = paths.map(path => {
      const truth = witnesses.get(path)?.truth;
      assert.ok(['T', 'F', 'U'].includes(truth), 'every compound child needs a witness');
      return truth === 'U' ? [false, true] : [truth === 'T'];
    });
    const outcomes = node.op === 'not' ? worlds[0].map(value => !value)
      : worlds.reduce((prior, next) => [...new Set(prior.flatMap(left => next.map(right =>
        node.op === 'and' ? left && right : left || right)))], [node.op === 'and']);
    const expected = outcomes.every(Boolean) ? 'T' : outcomes.every(value => !value) ? 'F' : 'U';
    assert.equal(node.truth, expected, 'compound truth must follow child witnesses');
  }
  assert.equal(row.truth, witnesses.get('/where').truth, 'row truth must match root witness');
}

test('independent witness checker rejects a fabricated matching assignment', t => {
  const f = fixture(t);
  const result = querySubjects(f.context, subjectQuery(assigned(A), { expansion: 'self-and-descendants' }));
  const row = structuredClone(result.groups.knowledge.strict.find(row => row.ref.id === 'K-000006'));
  row.witness[0].matchedSubjects = [A]; // This record actually authors C only.
  assert.throws(() => checkWitness(f, result, row), /recorded assignment/);
});

test('independent witness checker rejects fabricated nonmembership beneath a strict NOT', t => {
  const f = fixture(t);
  const positive = querySubjects(f.context, subjectQuery(assigned(A)));
  const negative = querySubjects(f.context, subjectQuery({ op: 'not', arg: assigned(A) }));
  for (const row of negative.groups.knowledge.strict) checkWitness(f, negative, row);
  // Supply the genuine positive row's complete evidence so this corruption
  // reaches the independent NOT proof check rather than failing reference lookup.
  Object.assign(negative.assignmentEvidence.outcomes, positive.assignmentEvidence.outcomes);
  const forged = structuredClone(positive.groups.knowledge.strict[0]);
  const atom = { ...forged.witness[0], path: '/where/arg', truth: 'F', matchedSubjects: [] };
  forged.witness = [{ path: '/where', op: 'not', truth: 'T' }, atom];
  assert.throws(() => checkWitness(f, negative, forged), /recorded assignment actually matches/);
  // Preserve the actual positive atom, but forge only its negation's truth.
  forged.witness[1] = { ...positive.groups.knowledge.strict[0].witness[0], path: '/where/arg' };
  assert.throws(() => checkWitness(f, negative, forged), /compound truth/);
});

test('actual direct, self and two-edge descendant matches have source-checkable witnesses', t => {
  const f = fixture(t);
  const direct = querySubjects(f.context, subjectQuery(assigned(A)));
  const descendants = querySubjects(f.context, subjectQuery(assigned(A), { expansion: 'self-and-descendants' }));
  assert.deepEqual(direct.groups.knowledge.strict.map(row => row.ref.id), ['K-000001', 'K-000002']);
  assert.deepEqual(descendants.groups.knowledge.strict.map(row => row.ref.id), ['K-000001', 'K-000002', 'K-000003', 'K-000006']);
  for (const result of [direct, descendants]) for (const row of result.groups.knowledge.strict) checkWitness(f, result, row);
  const deep = descendants.groups.knowledge.strict.find(row => row.ref.id === 'K-000006');
  assert.deepEqual(deep.witness[0].matchedSubjects, [C]);
  assert.equal(f.source.subjects.find(subject => subject.id === C).parent, B);
  assert.equal(f.source.subjects.find(subject => subject.id === B).parent, A);
  const invalid = structuredClone(deep);
  invalid.witness[0].expansion = 'direct';
  assert.throws(() => checkWitness(f, descendants, invalid), /expansion mode/);
  const stale = structuredClone(descendants);
  stale.input.inputs.registry = 'wrong-forest';
  assert.throws(() => checkWitness(f, stale, deep), /captured forest binding/);
});

test('repeated routes deduplicate records while preserving each authored predicate path and truth', t => {
  const f = fixture(t);
  const where = { op: 'and', args: [assigned(A), assigned(A)] };
  const result = querySubjects(f.context, subjectQuery(where, { expansion: 'self-and-descendants' }));
  assert.deepEqual(result.groups.knowledge.strict.map(row => row.ref.id), ['K-000001', 'K-000002', 'K-000003', 'K-000006']);
  for (const row of result.groups.knowledge.strict) {
    checkWitness(f, result, row);
    assert.deepEqual(row.witness.map(({ path, op, truth }) => [path, op, truth]),
      [['/where', 'and', 'T'], ['/where/args/0', 'assigned', 'T'], ['/where/args/1', 'assigned', 'T']]);
  }
  assert.equal(result.resources.used.hierarchyNodes, 3);
  assert.equal(result.resources.used.hierarchyEdges, 2);
});

test('equivalence keeps both query and assignment redirect provenance from retained history', t => {
  const f = fixture(t, { equivalent: true });
  const result = querySubjects(f.context, subjectQuery(assigned(A), { subjectPolicy: 'equivalent' }));
  assert.equal(result.status, 'complete');
  assert.deepEqual(result.groups.knowledge.strict.map(row => row.ref.id), ['K-000001', 'K-000002', 'K-000003']);
  for (const row of result.groups.knowledge.strict) checkWitness(f, result, row);
  const first = result.groups.knowledge.strict[0];
  assert.deepEqual(first.witness[0].redirects, [{ from: A, to: B }]);
  assert.deepEqual(first.witness[0].matchedSubjects, [A]);
  const invalid = structuredClone(result);
  invalid.assignmentEvidence.outcomes[A].resolution.id = C;
  assert.throws(() => checkWitness(f, invalid, invalid.groups.knowledge.strict[0]));
});

test('independent source oracle rejects corrupted shared evidence and record-local provenance', t => {
  const f = fixture(t);
  const baseline = querySubjects(f.context, subjectQuery({ op: 'all' }));
  for (const mutate of [
    result => { result.assignmentEvidence.namespace = 'foreign'; },
    result => { result.assignmentEvidence.policy = 'historical'; },
    result => { result.assignmentEvidence.outcomes[A].resolution.requestedId = B; },
    result => { delete result.assignmentEvidence.outcomes[A]; },
    result => { result.assignmentEvidence.outcomes[A].resolution.subject.warrant.records[0].capture.sha256 = 'corrupt'; },
    result => { result.assignmentEvidence.outcomes[A].resolution.redirects = [{ from: A, to: B }]; },
    result => { result.groups.knowledge.strict[1].assignments.ids.reverse(); },
    result => { result.groups.knowledge.strict[0].sourcePointers.citations = []; },
  ]) {
    const changed = structuredClone(baseline); mutate(changed);
    assert.throws(() => { for (const row of changed.groups.knowledge.strict) checkWitness(f, changed, row); });
  }
});

test('decisive OR retains an unknown operand instead of presenting it as proved membership', t => {
  const f = fixture(t);
  const result = querySubjects(f.context, subjectQuery({ op: 'or', args: [assigned(A), { op: 'all' }] }));
  assert.deepEqual(result.groups.knowledge.strict.map(row => row.ref.id),
    ['K-000001', 'K-000002', 'K-000003', 'K-000004', 'K-000005', 'K-000006']);
  for (const row of result.groups.knowledge.strict) checkWitness(f, result, row);
  const missing = result.groups.knowledge.strict.find(row => row.ref.id === 'K-000005');
  assert.deepEqual(missing.witness.map(({ path, op, truth }) => [path, op, truth]),
    [['/where', 'or', 'T'], ['/where/args/0', 'assigned', 'U'], ['/where/args/1', 'all', 'T']]);
  assert.deepEqual(missing.unknowns, [{ path: '/where/args/0', reason: 'missing-assignments' }]);
  assert.equal(result.coverage.predicateUnknownCount, 1);
});

test('incomplete expansion preserves witnessed positives but never manufactures a NOT match', t => {
  const f = fixture(t);
  const options = { expansion: 'self-and-descendants', possibleMatches: true,
    budgets: { ...queryBudgets, maxHierarchyNodes: 2, maxHierarchyEdges: 1 } };
  const positive = querySubjects(f.context, subjectQuery(assigned(A), options));
  assert.equal(positive.status, 'incomplete');
  assert.deepEqual(positive.groups.knowledge.strict.map(row => row.ref.id), ['K-000001', 'K-000002', 'K-000003']);
  for (const row of positive.groups.knowledge.strict) {
    checkWitness(f, positive, row);
    assert.equal(row.witness[0].expansionComplete, false);
  }
  const negative = querySubjects(f.context, subjectQuery({ op: 'not', arg: assigned(A) }, options));
  assert.deepEqual(negative.groups.knowledge.strict.map(row => row.ref.id), ['K-000004']);
  const unknown = negative.groups.knowledge.possible.find(row => row.ref.id === 'K-000006');
  checkWitness(f, negative, unknown);
  assert.deepEqual(unknown.witness.map(({ path, truth }) => [path, truth]), [['/where', 'U'], ['/where/arg', 'U']]);
  assert.equal(unknown.witness[1].reason, 'incomplete-hierarchy');
  const missing = negative.groups.knowledge.possible.find(row => row.ref.id === 'K-000005');
  assert.equal(missing.witness[1].reason, 'missing-assignments');
  assert.equal(missing.witness[0].truth, 'U');
  assert.equal(negative.coverage.rankComplete, false);
});

test('explanation withholding preserves counts and complete evaluation without emitting proof fragments', t => {
  const f = fixture(t);
  const query = subjectQuery(assigned(A), { expansion: 'self-and-descendants' });
  const full = querySubjects(f.context, query);
  const withheld = querySubjects(f.context, { ...query, budgets: { ...query.budgets, maxExplanationNodes: 0 } });
  assert.equal(withheld.status, 'complete');
  assert.deepEqual(withheld.counts, full.counts);
  assert.deepEqual(withheld.groups.knowledge.strict, []);
  assert.equal(withheld.coverage.evaluationComplete, true);
  assert.equal(withheld.coverage.explanationsComplete, false);
  assert.equal(withheld.resources.used.explanationNodes, 0);
  assert.deepEqual(readFileSync(join(f.kitRoot, 'subjects/registry.yaml')), f.registryBytes);
});
