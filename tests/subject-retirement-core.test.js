import test from 'node:test';
import assert from 'node:assert/strict';
import { subjectRetirementCoreFixture } from './helpers/subject-retirement-core-fixture.js';
import { inspectSubjectRetirementAssignmentScope } from '../payload/engine/lib/subject-retirement-core.js';
import { canonicalJsonBytes, canonicalSha256 } from '../payload/engine/lib/canonical-json.js';
import { registryWire } from './helpers/equivalent-merge-fixture.js';
import { changedTreePaths } from '../payload/engine/lib/commit-snapshot.js';
import { captureCommittedFile } from '../payload/engine/lib/captured-source.js';
import { chmodSync } from 'node:fs';
import { join } from 'node:path';

const inspect = (f) => f.withCoreInput(inspectSubjectRetirementAssignmentScope);
const refused = (result, code) => {
  assert.equal(result.ok, false);
  assert.equal(result.diagnostics[0]?.code, code, JSON.stringify(result.diagnostics));
  assert.notEqual(result.authoredReferenceClosure.status, 'complete');
};

for (const validSource of [false, true]) test(`zero retirement ${validSource ? 'verifies' : 'refuses false'} review Decision source membership despite valid matching evidence bytes`, async (t) => {
  let historical;
  const f = subjectRetirementCoreFixture(t, { zero: true, nested: true,
    candidateChange: ({ root, git, event, decisionCaptures }) => {
      historical = captureCommittedFile({ repoRoot: root, commit: git('rev-parse', 'HEAD'),
        file: event.review.decisionCapture.file });
      const capture = structuredClone(historical.locator);
      if (!validSource) capture.source.tree = git('rev-parse', 'HEAD:unknown-knowledge/decisions');
      // Only the new retirement review changes; original registry evidence stays literal.
      event.review.decisionCapture = capture;
      decisionCaptures.push({ capture, bytes: historical.bytes, objectFormat: historical.objectFormat });
    } });
  assert.equal(f.event.review.decisionCapture.source.commit, f.input.before.commit);
  assert.equal(f.input.operation.assignmentEvent, null);
  assert.deepEqual(f.document.history[0].review.decisionCapture, f.input.evidence.decisionCaptures[0].capture);
  const result = await inspect(f);
  if (!validSource) {
    assert.notEqual(f.event.review.decisionCapture.source.tree, f.input.before.tree);
    refused(result, 'retirement-authorizer-source');
    assert.equal(result.decision, null);
    assert.equal(result.inventory, null);
    const registryBytes = ['before', 'candidate'].reduce((sum, side) => sum + captureCommittedFile({
      repoRoot: f.root, commit: f.input[side].commit, file: 'unknown-knowledge/subjects/registry.yaml',
    }).bytes.length, 0);
    const evidenceBytes = f.input.evidence.decisionCaptures.reduce((sum, row) => sum + row.bytes.length, 0);
    assert.equal(result.resources.governance.used.captureBytes,
      registryBytes + evidenceBytes + 3 * historical.bytes.length,
      'two current authorizer captures and one independent historical capture are charged');
    f.input.limits.governance.maxCaptureBytes = result.resources.governance.used.captureBytes - 1;
    const short = await inspect(f); refused(short, 'subject-validation-budget');
    assert.equal(short.resources.governance.failure.attempted, historical.bytes.length);
    assert.equal(short.resources.governance.failure.remaining, historical.bytes.length - 1);
    return;
  }
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  assert.deepEqual(result.decision.decisionCapture, historical.locator);
  assert.deepEqual(result.assignments, []);
  f.input.limits.governance.maxCaptureBytes = result.resources.governance.used.captureBytes;
  assert.equal((await inspect(f)).ok, true, 'actual capture allowance admits exact fit');
  f.input.limits.governance.maxCaptureBytes -= 1;
  const short = await inspect(f); refused(short, 'subject-validation-budget');
  assert.equal(short.resources.governance.failure.counter, 'captureBytes');
});

test('actual plain retirement preserves meaning and withdraws exactly the effective direct source IDs', async (t) => {
  const f = subjectRetirementCoreFixture(t);
  const result = await f.withCoreInput(inspectSubjectRetirementAssignmentScope);
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  assert.deepEqual(result.assignments.map(({ ref, after }) => [ref.id, after.ids]), [
    ['K-000001', []], ['K-000002', ['S-000002']],
  ]);
  assert.equal(result.authoredReferenceClosure.status, 'complete');
  assert.equal(result.authoredReferenceClosure.semanticCompleteness, 'unknown');
  assert.equal(result.inventory.status, 'incomplete');
  assert.equal(result.registry.events[0].changeDigest, f.input.operation.registryEvents[0].changeDigest);
  assert.deepEqual(await inspect(f), result, 'actual rerun remains deterministic');
});

for (const kind of ['ontology', 'decision']) test(`actual grouped ${kind} owners retain ordered unrelated IDs and known empty`, async (t) => {
  const f = subjectRetirementCoreFixture(t, { kind }); const result = await inspect(f);
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  assert.deepEqual(result.assignments.map(({ ref, after }) => [ref.kind, after.ids]), [
    [kind, []], [kind, ['S-000003', 'S-000002']],
  ]);
});

test('actual zero-use retirement keeps historical owners, unknowns and registry-only changed paths', async (t) => {
  const f = subjectRetirementCoreFixture(t, { zero: true, historical: true, nested: true });
  const result = await inspect(f); assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  assert.deepEqual(result.assignments, []); assert.equal(f.input.operation.assignmentEvent, null);
  assert.equal(result.authoredReferenceClosure.retainedHistoricalUses.length, 1);
  const row = result.authoredReferenceClosure.retainedHistoricalUses[0];
  assert.equal(row.beforeRecord.lifecycle.state, 'non-effective');
  assert.deepEqual(row.beforeRecord.assignments, { state: 'known', ids: ['S-000001'] });
  assert.equal(row.beforeRecord.capture.sha256, row.candidateRecord.capture.sha256);
  assert.deepEqual(changedTreePaths(f.root, f.input.before.tree, f.input.candidate.tree), ['unknown-knowledge/subjects/registry.yaml']);
});

test('zero effective direct uses neither require nor exclude retained descendant witnesses', async (t) => {
  const f = subjectRetirementCoreFixture(t, { zero: true, child: true }); const result = await inspect(f);
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  assert.deepEqual(result.assignments, []);
  assert.equal(result.authoredReferenceClosure.retainedInheritedUses[0].disposition, 'retained');
});

test('null assignment event intent is required iff the actual selected set is empty', async (t) => {
  const positive = subjectRetirementCoreFixture(t); positive.input.operation.assignmentEvent = null;
  refused(await inspect(positive), 'retirement-assignment-event-intent');
  const zero = subjectRetirementCoreFixture(t, { zero: true });
  zero.input.operation.assignmentEvent = { id: '33333333-3333-4333-8333-333333333333', changeDigest: 'b'.repeat(64) };
  refused(await inspect(zero), 'retirement-assignment-event-intent');
});

test('exact union retains existing witnesses and exposes a selected source-plus-child witness', async (t) => {
  const f = subjectRetirementCoreFixture(t, { child: true, sameOwner: true }); const result = await inspect(f);
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  const rows = result.authoredReferenceClosure.retainedInheritedUses;
  assert.equal(rows.length, 3);
  const exposed = rows.find(({ ref }) => ref.id === 'K-000002');
  assert.deepEqual(Object.keys(exposed).sort(), ['ref', 'assignedSubject', 'reason', 'beforeRecord', 'candidateRecord',
    'beforeWitness', 'candidateWitness', 'disposition'].sort());
  assert.equal(exposed.beforeWitness, null); assert.equal(exposed.disposition, 'exposed-by-direct-withdrawal');
  assert.deepEqual(exposed.beforeRecord.assignments.ids, ['S-000003', 'S-000001', 'S-000002']);
  assert.deepEqual(exposed.candidateRecord.assignments.ids, ['S-000003', 'S-000002']);
  assert.deepEqual(exposed.candidateWitness.path, ['S-000001', 'S-000003']);
  assert.notEqual(exposed.beforeRecord.capture.sha256, exposed.candidateRecord.capture.sha256);
  assert.equal(rows.find(({ ref }) => ref.id === 'K-000003').disposition, 'retained');
  const parent = result.authoredReferenceClosure.retainedParents[0];
  assert.equal(parent.beforeWitness.source, 'S-000003'); assert.equal(parent.candidateWitness.target, 'S-000001');
});

test('omitted, extra and duplicate historical/parent/inherited dispositions refuse exact closure', async (t) => {
  const f = subjectRetirementCoreFixture(t, { child: true, sameOwner: true, historical: true });
  for (const [field, code] of [['retainedHistoricalUses', 'retirement-retained-historical-scope'],
    ['retainedParents', 'retirement-retained-parent-scope'], ['retainedInheritedUses', 'retirement-retained-inherited-scope']]) {
    const original = structuredClone(f.input.operation[field]);
    f.input.operation[field] = []; refused(await inspect(f), code);
    f.input.operation[field] = [...original, original[0]]; refused(await inspect(f), code);
    f.input.operation[field] = original;
  }
});

test('retained incident source-to-parent edge permits only its expected declared-status change', async (t) => {
  const f = subjectRetirementCoreFixture(t, { beforeChange: ({ document, put }) => {
    document.subjects[0].parent = 'S-000003'; document.history[0].rows[0].after.parent = 'S-000003';
    document.hierarchyRevision += 1;
    const { review, ...body } = document.history[0]; review.changeDigest = canonicalSha256(body);
    put('subjects/registry.yaml', registryWire(document));
  } });
  f.input.operation.retainedParents = [{ child: 'S-000001', parent: 'S-000003', reason: 'Retain original parent' }];
  const result = await inspect(f); assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  const row = result.authoredReferenceClosure.retainedParents[0];
  assert.equal(row.beforeWitness.declaredStatus, 'active'); assert.equal(row.candidateWitness.declaredStatus, 'retired');
});

for (const [field, code] of [['source', 'retirement-source-use-unsupported'], ['descendant', 'retirement-inherited-use-unsupported']]) {
  test(`an actual proposal ${field} use refuses even when left unchanged`, async (t) => {
    const f = subjectRetirementCoreFixture(t, { child: field === 'descendant', beforeChange: ({ replaceSubjects }) =>
      replaceSubjects('knowledge/draft.md', [field === 'source' ? 'S-000001' : 'S-000003']) });
    refused(await inspect(f), code);
  });
}

test('unknown assignment disposition omission and absent-to-empty substitution refuse', async (t) => {
  const f = subjectRetirementCoreFixture(t); f.input.operation.retainedUnknowns.pop();
  refused(await inspect(f), 'retirement-retained-unknown-scope');
  const changed = subjectRetirementCoreFixture(t, { candidateChange: ({ replaceSubjects }) => replaceSubjects('knowledge/K-000005.md', []) });
  refused(await inspect(changed), 'retirement-retained-unknown-scope');
});

for (const mode of [false, true]) test(`historical whole-file ${mode ? 'mode' : 'content'} change refuses`, async (t) => {
  const f = subjectRetirementCoreFixture(t, { historical: true, candidateChange: ({ put, read, kitRoot }) => {
    if (mode) chmodSync(join(kitRoot, 'knowledge/K-000004.md'), 0o755);
    else put('knowledge/K-000004.md', `${read('knowledge/K-000004.md')}Changed original history.\n`);
  } });
  refused(await inspect(f), 'retirement-retained-historical-changed');
});

test('unknown and authorizer whole-file changes remain protected', async (t) => {
  const unknown = subjectRetirementCoreFixture(t, { candidateChange: ({ put, read }) => put('knowledge/K-000005.md', `${read('knowledge/K-000005.md')}Changed\n`) });
  refused(await inspect(unknown), 'retirement-retained-unknown-changed');
  const authorizer = subjectRetirementCoreFixture(t, { candidateChange: ({ put, read }) => put('decisions/entries/approval.yaml', `${read('decisions/entries/approval.yaml')}\n`) });
  refused(await inspect(authorizer), 'retirement-authorizer-changed');
});

test('source withdrawal cannot change lifecycle or reorder unrelated membership', async (t) => {
  const reordered = subjectRetirementCoreFixture(t, { sameOwner: true, candidateChange: ({ replaceSubjects }) =>
    replaceSubjects('knowledge/K-000002.md', ['S-000002', 'S-000003']) });
  refused(await inspect(reordered), 'retirement-assignment-substitution');
  const lifecycle = subjectRetirementCoreFixture(t, { candidateChange: ({ editKnowledge }) =>
    editKnowledge('knowledge/K-000001.md', (record) => { record.facets.stage = 'draft'; }) });
  refused(await inspect(lifecycle), 'retirement-assignment-substitution');
});

test('a disappearing descendant witness and an unrelated new descendant assignment refuse', async (t) => {
  const missing = subjectRetirementCoreFixture(t, { child: true, candidateChange: ({ replaceSubjects }) => replaceSubjects('knowledge/K-000003.md', []) });
  refused(await inspect(missing), 'retirement-retained-inherited-changed');
  const added = subjectRetirementCoreFixture(t, { child: true, candidateChange: ({ replaceSubjects }) => replaceSubjects('knowledge/K-000004.md', ['S-000003']) });
  added.input.operation.retainedInheritedUses.push({ ref: added.ref('K-000004'), assignedSubject: 'S-000003', reason: 'Cannot bless a new use' });
  refused(await inspect(added), 'retirement-retained-inherited-changed');
});

test('incomplete inventory and absent participant evidence never establish closure', async (t) => {
  const f = subjectRetirementCoreFixture(t); f.input.limits.inventory.maxRecordVisits = 1;
  refused(await inspect(f), 'retirement-inventory-incomplete');
  const missing = subjectRetirementCoreFixture(t); missing.input.evidence.decisionCaptures = [];
  refused(await inspect(missing), 'retirement-participant-evidence');
});

test('actual closure rows and bytes have exact-fit/one-short limits with retained partial failure evidence', async (t) => {
  const f = subjectRetirementCoreFixture(t, { child: true, sameOwner: true, historical: true });
  const complete = await inspect(f); assert.equal(complete.ok, true, JSON.stringify(complete.diagnostics));
  const closure = complete.authoredReferenceClosure;
  const rows = [...closure.retainedUnknowns, ...closure.retainedHistoricalUses, ...closure.retainedParents,
    ...closure.retainedInheritedUses, ...complete.assignments];
  assert.deepEqual(complete.resources.closure, { used: { rows: rows.length,
    bytes: rows.reduce((sum, row) => sum + canonicalJsonBytes(row).length, 0) }, failure: null });
  const { used } = complete.resources.closure;
  f.input.limits.closure = { maxRows: used.rows, maxBytes: used.bytes };
  assert.equal((await inspect(f)).ok, true);
  for (const field of ['maxRows', 'maxBytes']) {
    f.input.limits.closure = { maxRows: used.rows, maxBytes: used.bytes }; f.input.limits.closure[field] -= 1;
    const result = await inspect(f); refused(result, 'retirement-closure-budget');
    assert.equal(result.resources.closure.failure.limit, field);
    assert.ok(result.resources.closure.failure.requested > 0);
  }
});

test('historical and unknown recaptures consume the actual governance capture allowance', async (t) => {
  const f = subjectRetirementCoreFixture(t, { historical: true }); const result = await inspect(f);
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  f.input.limits.governance.maxCaptureBytes = result.resources.governance.used.captureBytes;
  assert.equal((await inspect(f)).ok, true);
  f.input.limits.governance.maxCaptureBytes -= 1;
  const short = await inspect(f); refused(short, 'subject-validation-budget');
  assert.equal(short.resources.governance.failure.counter, 'captureBytes');
});

test('actual incident associations refuse without silently rewriting the retained metadata', async (t) => {
  const f = subjectRetirementCoreFixture(t, { beforeChange: ({ document, put }) => {
    document.subjects[0].related = [{ type: 'association', target: 'S-000003' }];
    document.history[0].rows[0].after.related = structuredClone(document.subjects[0].related);
    const { review, ...body } = document.history[0]; review.changeDigest = canonicalSha256(body);
    put('subjects/registry.yaml', registryWire(document));
  } });
  refused(await inspect(f), 'retirement-graph-use-unsupported');
});

test('an actual historical equivalent redirect into the source refuses plain retirement', async (t) => {
  const f = subjectRetirementCoreFixture(t, { beforeChange: ({ document, put }) => {
    const state = ({ id, changes, ...row }) => structuredClone(row);
    const source = document.subjects.find(({ id }) => id === 'S-000002');
    const target = document.subjects.find(({ id }) => id === 'S-000001');
    const event = { id: '66666666-6666-4666-8666-666666666666', action: 'merge-equivalent', decision: document.history[0].decision,
      reason: 'Historical equivalent meaning', rows: [
        { id: source.id, before: state(source), after: { ...state(source), status: 'retired', retirement: { kind: 'equivalent-merge', redirect: target.id } } },
        { id: target.id, before: state(target), after: state(target), reason: 'Preserve survivor' },
      ] };
    event.review = { ...document.history[0].review, changeDigest: canonicalSha256(event) };
    for (const row of event.rows) {
      const index = document.subjects.findIndex(({ id }) => id === row.id);
      document.subjects[index] = { id: row.id, ...row.after, changes: [...document.subjects[index].changes, event.id] };
    }
    document.history.push(event); document.revision += 1; put('subjects/registry.yaml', registryWire(document));
  } });
  refused(await inspect(f), 'retirement-graph-use-unsupported');
});

for (const kind of ['ontology', 'decision']) test(`an unknown ${kind} sibling protects the entire selected file`, async (t) => {
  const f = subjectRetirementCoreFixture(t, { kind, beforeChange: ({ typedFile, read, put }) => {
    const document = JSON.parse(read(typedFile)); delete document.entries[1].subjects; put(typedFile, document);
  } });
  f.input.operation.retainedUnknowns.push({ ref: f.ref(kind === 'ontology' ? 'O-000002' : 'D-000003'), reason: 'Retain absent sibling' });
  refused(await inspect(f), 'retirement-retained-unknown-changed');
});

for (const kind of ['ontology', 'decision']) test(`an inactive ${kind} sibling protects its whole file even with unchanged entry bytes`, async (t) => {
  const f = subjectRetirementCoreFixture(t, { kind, beforeChange: ({ typedFile, read, put }) => {
    const document = JSON.parse(read(typedFile)); document.entries[1].status = kind === 'ontology' ? 'deprecated' : 'archived';
    document.entries[1].subjects = ['S-000001']; put(typedFile, document);
  }, candidateChange: ({ typedFile, read, put }) => {
    const document = JSON.parse(read(typedFile)); document.entries[1].subjects = ['S-000001']; put(typedFile, document);
  } });
  f.input.operation.retainedHistoricalUses = [{ ref: f.ref(kind === 'ontology' ? 'O-000002' : 'D-000003'), reason: 'Keep inactive sibling' }];
  refused(await inspect(f), 'retirement-retained-historical-changed');
});

test('retirement binds its actual event, original subject, registry mode and committed tree', async (t) => {
  const f = subjectRetirementCoreFixture(t);
  const digest = f.input.operation.registryEvents[0].changeDigest;
  f.input.operation.registryEvents[0].changeDigest = 'a'.repeat(64);
  refused(await inspect(f), 'retirement-event-mismatch');
  f.input.operation.registryEvents[0].changeDigest = digest; f.input.operation.subject = 'S-000002';
  refused(await inspect(f), 'retirement-meaning-changed');
  f.input.operation.subject = 'S-000001';
  refused(await f.withCoreInput((input) => inspectSubjectRetirementAssignmentScope({ ...input,
    before: { ...input.before, descriptor: { ...input.before.descriptor, tree: input.candidate.descriptor.tree } } })), 'retirement-tree-mismatch');
  const mode = subjectRetirementCoreFixture(t, { candidateChange: ({ kitRoot }) => chmodSync(join(kitRoot, 'subjects/registry.yaml'), 0o755) });
  refused(await inspect(mode), 'retirement-registry-mode-changed');
});

for (const kind of ['ontology', 'decision']) for (const zero of [false, true]) {
  test(`actual ${kind === 'ontology' ? 'O+D without K' : 'D-only'} ${zero ? 'zero' : 'positive'} retirement keeps the absent Knowledge store absent`, async (t) => {
    const f = subjectRetirementCoreFixture(t, { kind, zero, child: true, knowledgePresent: false });
    const result = await inspect(f); assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
    for (const side of ['before', 'candidate']) {
      assert.deepEqual(result.inventory.coverage[side].stores.find(({ kind }) => kind === 'knowledge'),
        { kind: 'knowledge', status: 'absent', allocations: 0 });
      assert.equal(result.inventory.coverage[side].stores.find(({ kind }) => kind === 'ontology').status,
        kind === 'ontology' ? 'present' : 'absent');
      assert.equal(result.inventory.coverage[side].stores.find(({ kind }) => kind === 'decision').status, 'present');
    }
    assert.equal(result.inventory.records.some((row) => (row.ref ?? row.proposalRef).kind === 'knowledge'), false);
    assert.deepEqual(result.authoredReferenceClosure.retainedUnknowns.map(({ ref }) => [ref.kind, ref.id]), [['decision', 'D-000001']]);
    assert.equal(result.assignments.length, zero ? 0 : 2);
    assert.equal(result.authoredReferenceClosure.retainedInheritedUses.length, zero ? 0 : 1);
    if (zero) {
      assert.equal(f.input.operation.assignmentEvent, null);
      assert.deepEqual(changedTreePaths(f.root, f.input.before.tree, f.input.candidate.tree), ['subjects/registry.yaml']);
    } else {
      assert.ok(result.assignments.every(({ ref }) => ref.kind === kind));
      assert.equal(result.authoredReferenceClosure.retainedInheritedUses[0].disposition, 'exposed-by-direct-withdrawal');
    }
  });
}
