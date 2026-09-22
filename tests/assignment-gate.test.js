import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runAssignmentGate } from '../payload/engine/lib/assignment-gate.js';
import { assignmentGateFixture, reviewNote } from './helpers/assignment-gate-fixture.js';
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { describeCandidateBytes, captureCommittedFile } from '../payload/engine/lib/captured-source.js';
import { sealAssignmentEvent } from './helpers/assignment-event-fixture.js';
import { subjectQuery } from './helpers/subject-query-fixture.js';

const code = (result, expected) => assert.ok(result.diagnostics.some(({ code }) => code === expected), JSON.stringify(result));
const editBefore = (f, id, replace) => {
  const file = f.context.model.leaves.get(id).file;
  f.put(file, replace(readFileSync(join(f.kitRoot, file), 'utf8')));
};
const editCandidate = (f, replace) => {
  const file = f.beforeModel.leaves.get('K-000001').file;
  f.put(file, replace(f.read(file)));
  f.event.rows[0]['after-capture'] = describeCandidateBytes({ file: f.path(file), bytes: Buffer.from(f.read(file)), objectFormat: f.prior.objectFormat });
  f.save();
};

test('actual staged trees pass bounded assignment checks while remaining nonpublication-ready', async (t) => {
  const f = assignmentGateFixture(t);
  const result = await runAssignmentGate(f.options);
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.publicationReady, false);
  assert.deepEqual(result.scope.refs, [f.event.rows[0].ref]);
  assert.equal(result.inputs.before.kind, 'commit');
  assert.equal(result.inputs.candidate.kind, 'tree');
  assert.equal(Object.hasOwn(result.inputs.candidate, 'commit'), false);
  assert.equal(result.checks.candidateCommitMembership.status, 'not-performed');
  assert.equal(result.checks.humanApproval.status, 'not-performed');
});

test('root and nested layouts preserve actual working tree and user index', async (t) => {
  const f = assignmentGateFixture(t, { nested: true });
  const file = join(f.kitRoot, f.beforeModel.leaves.get('K-000001').file);
  writeFileSync(file, readFileSync(file, 'utf8') + 'Unstaged user edit.\n');
  const index = readFileSync(join(f.root, '.git/index')); const bytes = readFileSync(file);
  const result = await runAssignmentGate(f.options);
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.inputs.before.kitPath, 'unknown-knowledge');
  assert.deepEqual(readFileSync(join(f.root, '.git/index')), index);
  assert.deepEqual(readFileSync(file), bytes);
});

test('unknown to explicit empty increments once without treating missing governance evidence as approval', async (t) => {
  const f = assignmentGateFixture(t, { afterIds: [] }); f.options.decisionCaptures = [];
  const result = await runAssignmentGate(f.options);
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(f.event.rows[0]['after-revision'], 1);
  assert.deepEqual(result.rows[0].eligibility.changes.newEffective, []);
  assert.equal(result.checks.humanApproval.status, 'not-performed');
});

test('unchanged carry and set reorder need no fabricated note or revision increment', async (t) => {
  for (const afterIds of [['S-000001', 'S-000002'], ['S-000002', 'S-000001']]) {
    const f = assignmentGateFixture(t, { initialIds: ['S-000001', 'S-000002'], afterIds });
    const result = await runAssignmentGate(f.options);
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(f.event.rows[0]['after-revision'], 0);
    assert.equal(f.event.rows[0].disposition, 'unchanged');
  }
});

test('an unchanged unknown assignment stays unknown without fabricating an empty list or note', async (t) => {
  const f = assignmentGateFixture(t);
  f.put(f.beforeModel.leaves.get('K-000001').file, f.prior.bytes);
  Object.assign(f.event.rows[0], { after: { state: 'unknown', reason: 'absent' }, 'after-revision': 0, disposition: 'unchanged',
    'after-capture': describeCandidateBytes({ file: f.event.rows[0]['after-capture'].file, bytes: f.prior.bytes, objectFormat: f.prior.objectFormat }) });
  f.save();
  const result = await runAssignmentGate(f.options);
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.deepEqual(result.rows[0].eligibility.candidate, { state: 'unknown', reason: 'absent' });
});

test('allocated missing payload is not excluded from the before scope universe', async (t) => {
  const f = assignmentGateFixture(t, { prepareBefore: (f) => {
    const identity = structuredClone(f.context.model.identity);
    identity.allocations.push({ ...identity.allocations.find(({ kind }) => kind === 'knowledge'), id: 'K-900001' });
    f.put('_identity.yaml', identity);
  } });
  code(await runAssignmentGate(f.options), 'assignment-payload-unavailable');
});

test('missing source metadata anywhere in allocated Knowledge refuses even outside the selected domain', async (t) => {
  const f = assignmentGateFixture(t, { prepareBefore: (f) => editBefore(f, 'K-000002', (s) => s.replace(', domain: elsewhere', '')) });
  code(await runAssignmentGate(f.options), 'assignment-source-metadata-unavailable');
});

test('subtree uses segment boundaries and omitted independently selected records refuse', async (t) => {
  for (const [domain, ok] of [['design-system-legacy', true], ['design-system/buttons', false]]) {
    const f = assignmentGateFixture(t, { prepareBefore: (f) => editBefore(f, 'K-000002', (s) => s.replace('domain: elsewhere', `domain: ${domain}`)) });
    f.event.scope.match = 'subtree'; f.save();
    const result = await runAssignmentGate(f.options);
    assert.equal(result.ok, ok, JSON.stringify(result));
    if (!ok) code(result, 'assignment-scope-mismatch');
  }
});

test('matched inactive or unknown lifecycle refuses instead of silently shrinking scope', async (t) => {
  for (const replacement of ['stage: draft, ', '']) {
    const f = assignmentGateFixture(t, { prepareBefore: (f) => editBefore(f, 'K-000001', (s) => s.replace('stage: verified, ', replacement)) });
    code(await runAssignmentGate(f.options), 'assignment-target-not-effective');
  }
});

test('an extra well-formed row outside the derived scope cannot expand the operation', async (t) => {
  const f = assignmentGateFixture(t);
  f.event.scope.values = ['elsewhere']; f.save();
  code(await runAssignmentGate(f.options), 'assignment-scope-mismatch');
});

test('an actual retained tracked chain accepts a second event without resetting its baseline', async (t) => {
  const f = assignmentGateFixture(t);
  f.git('commit', '-qm', 'retain first assignment event');
  const commit = f.git('rev-parse', 'HEAD'); const tree = f.git('rev-parse', 'HEAD^{tree}');
  const file = f.event.rows[0]['after-capture'].file;
  const prior = captureCommittedFile({ repoRoot: f.root, commit, file });
  const next = f.read(file).replace('subjects: ["S-000001"]', 'subjects: ["S-000001","S-000002"]')
    .replace('# retained', `  - ${JSON.stringify(reviewNote(['S-000001', 'S-000002']))}\n# retained`);
  f.put(file, next);
  const event = structuredClone(f.event);
  event.event = '56789012-3456-4789-89ab-123456789abc';
  event['before-input'] = { commit, tree, 'kit-path': '.' };
  Object.assign(event.rows[0], { before: { state: 'known', ids: ['S-000001'] }, after: { state: 'known', ids: ['S-000001', 'S-000002'] },
    'before-revision': 1, 'after-revision': 2, 'before-capture': prior.locator,
    'after-capture': describeCandidateBytes({ file, bytes: Buffer.from(next), objectFormat: prior.objectFormat }) });
  f.put(`subjects/_assignments/${event.event}.yaml`, sealAssignmentEvent(event)); f.git('add', '.');
  f.options.eventId = event.event;
  assert.equal((await runAssignmentGate(f.options)).ok, true);
  const baselineBytes = f.read('subjects/_assignments/_baselines.yaml');
  f.put('subjects/_assignments/_baselines.yaml', '\n' + baselineBytes); f.git('add', '.');
  code(await runAssignmentGate(f.options), 'assignment-baseline-bytes-changed');
  f.put('subjects/_assignments/_baselines.yaml', baselineBytes); f.git('add', '.');
  f.event.rows[0].reason = 'Altered retained explanation';
  f.put(`subjects/_assignments/${f.event.event}.yaml`, sealAssignmentEvent(f.event)); f.git('add', '.');
  code(await runAssignmentGate(f.options), 'assignment-history-not-append-only');
});

test('baseline adoption cannot silently expand the independently derived affected universe', async (t) => {
  const f = assignmentGateFixture(t);
  const entry = f.beforeModel.leaves.get('K-000002');
  const captured = captureCommittedFile({ repoRoot: f.root, commit: f.commit, file: entry.file });
  f.baseline.baselines.push({ ref: { ...f.event.rows[0].ref, id: entry.id }, state: { state: 'known', ids: entry.record.subjects }, capture: captured.locator });
  f.save();
  code(await runAssignmentGate(f.options), 'assignment-baseline-scope');
});

test('a new affected record appends a literal baseline suffix while retaining earlier history bytes', async (t) => {
  const f = assignmentGateFixture(t, { prepareBefore: (f) => editBefore(f, 'K-000002', (s) => s.replace('domain: elsewhere', 'domain: design-system/buttons')) });
  const baselineFile = 'subjects/_assignments/_baselines.yaml';
  const oldBytes = `schema-version: 1\nnamespace: ${f.event.namespace}\nbaselines:\n  - ${JSON.stringify(f.baseline.baselines[0])}\n`;
  f.put(baselineFile, oldBytes); f.git('add', '.'); f.git('commit', '-qm', 'retain block baseline');
  const commit = f.git('rev-parse', 'HEAD'); const tree = f.git('rev-parse', 'HEAD^{tree}');
  const entry = f.beforeModel.leaves.get('K-000002');
  const captured = captureCommittedFile({ repoRoot: f.root, commit, file: entry.file });
  const ref = { ...f.event.rows[0].ref, id: entry.id };
  const state = { state: 'known', ids: entry.record.subjects };
  const baseline = { ref, state, capture: captured.locator };
  const event = structuredClone(f.event); event.event = '67890123-4567-489a-89ab-123456789abc';
  event.scope.values = ['design-system/buttons']; event['before-input'] = { commit, tree, 'kit-path': '.' };
  event.rows = [{ ref, before: state, after: state, 'before-revision': 0, 'after-revision': 0, disposition: 'unchanged', reason: 'Reviewed unchanged classification',
    'before-capture': captured.locator, 'after-capture': describeCandidateBytes({ file: entry.file, bytes: captured.bytes, objectFormat: captured.objectFormat }) }];
  f.put(baselineFile, oldBytes + `  - ${JSON.stringify(baseline)}\n`);
  f.put(`subjects/_assignments/${event.event}.yaml`, sealAssignmentEvent(event)); f.git('add', '.');
  f.options.eventId = event.event;
  const result = await runAssignmentGate(f.options);
  assert.equal(result.ok, true, JSON.stringify(result));
  f.put(baselineFile, { ...f.baseline, baselines: [...f.baseline.baselines, baseline] }); f.git('add', '.');
  code(await runAssignmentGate(f.options), 'assignment-baseline-bytes-changed');
});

test('after capture hashes do not authorize body, BOM, metadata or note tampering', async (t) => {
  for (const mutate of [
    (s) => s.replace('Retained body', 'Changed body'),
    (s) => '\uFEFF' + s,
    (s) => s.replaceAll('\n', '\r\n'),
    (s) => s.replace('source: observed-source', 'source: different-source'),
    (s) => s.replace('using kb-build', 'using unrelated-skill'),
    (s) => s.replace('# retained', '# deleted rationale'),
  ]) {
    const f = assignmentGateFixture(t); editCandidate(f, mutate);
    code(await runAssignmentGate(f.options), 'assignment-preservation-failed');
  }
});

test('all changed paths are inspected including untouched-scope records and executable mode', async (t) => {
  const f = assignmentGateFixture(t);
  f.put('knowledge/K-000002.md', f.read('knowledge/K-000002.md') + 'Extra edit.\n'); f.git('add', '.');
  code(await runAssignmentGate(f.options), 'assignment-unselected-path-changed');
  const mode = assignmentGateFixture(t);
  mode.git('update-index', '--chmod=+x', mode.event.rows[0]['after-capture'].file);
  code(await runAssignmentGate(mode.options), 'assignment-file-mode-changed');
});

test('byte capture tampering and stale baseline adoption refuse independently', async (t) => {
  const f = assignmentGateFixture(t); f.event.rows[0]['after-capture'].sha256 = 'a'.repeat(64); f.save();
  code(await runAssignmentGate(f.options), 'assignment-record-capture-mismatch');
  const g = assignmentGateFixture(t); g.baseline.baselines[0].capture.blob = 'b'.repeat(40); g.save();
  code(await runAssignmentGate(g.options), 'assignment-adoption-mismatch');
});

test('current Decision status and digest must match captured review evidence', async (t) => {
  for (const field of ['decision-digest', 'accepted-status']) {
    const f = assignmentGateFixture(t);
    f.event.review[field] = field === 'accepted-status' ? 'addressed' : 'c'.repeat(64); f.save();
    code(await runAssignmentGate(f.options), 'assignment-authorizer-evidence');
  }
});

test('newly effective subjects require actual retained governance evidence', async (t) => {
  const f = assignmentGateFixture(t); f.options.decisionCaptures = [];
  code(await runAssignmentGate(f.options), 'assignment-ineligible');
});

test('record and byte budget exhaustion never becomes an empty complete scope', async (t) => {
  for (const [field, expected] of [['maxRecords', 'assignment-record-budget'], ['maxCaptureBytes', 'assignment-byte-budget']]) {
    const f = assignmentGateFixture(t); f.options.limits[field] = 0;
    const result = await runAssignmentGate(f.options); code(result, expected);
    assert.equal(result.ok, false); assert.equal(result.publicationReady, false);
  }
});

test('required missing views and partial actual route impact cannot be waived', async (t) => {
  const f = assignmentGateFixture(t); f.options.impact.required = ['regeneratedViews'];
  code(await runAssignmentGate(f.options), 'assignment-required-impact-incomplete');
  const { where, ...queryOptions } = subjectQuery();
  f.options.impact = { required: ['routes'], routes: {
    inventory: { version: 1, coverage: 'partial', routes: [{ id: 'color', route: { version: 1, kind: 'intersection', subjects: ['S-000001'] }, queryOptions }] },
    limits: { version: 1, maxRoutes: 2, maxPathNodes: 20, maxPathEdges: 20 } } };
  const result = await runAssignmentGate(f.options);
  code(result, 'assignment-required-impact-incomplete');
  assert.equal(result.optionalImpact.routes.status, 'incomplete');
  assert.equal(result.optionalImpact.routes.scope.declaredCoverage, 'partial');
});

test('invalid note, extra caller model and bogus budgets are refused before assembly', async (t) => {
  const f = assignmentGateFixture(t);
  for (const options of [
    { ...f.options, model: f.beforeModel },
    { ...f.options, reviewNote: { ...f.options.reviewNote, author: 'steward\nforged' } },
    { ...f.options, reviewNote: { ...f.options.reviewNote, date: '2026-02-31' } },
    { ...f.options, limits: { ...f.options.limits, maxRecords: -1 } },
  ]) code(await runAssignmentGate(options), 'invalid-assignment-gate-input');
});

test('real regenerated view impact preserves complete and partial byte-delta coverage', async (t) => {
  const f = assignmentGateFixture(t);
  f.options.impact = { required: ['regeneratedViews'], regeneratedViews: {
    inventory: { version: 1, coverage: 'complete', views: [{ id: 'tree', kind: 'subject-tree',
      options: { budget: { nodes: 100, edges: 100, rows: 100 }, maxBytes: 100000 } }] }, limits: { version: 1, maxViews: 1 } } };
  const result = await runAssignmentGate(f.options);
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.optionalImpact.regeneratedViews.status, 'complete');
  assert.ok(result.optionalImpact.regeneratedViews.views[0].delta.unchanged.length > 0);
  f.options.impact.regeneratedViews.inventory.coverage = 'partial';
  const partial = await runAssignmentGate(f.options);
  code(partial, 'assignment-required-impact-incomplete');
  assert.equal(partial.optionalImpact.regeneratedViews.views[0].delta.unchanged, null);
  assert.equal(partial.optionalImpact.regeneratedViews.views[0].delta.added, null);
});

test('ambiguous staged layout refuses with deterministic diagnostics without disposable paths', async (t) => {
  const f = assignmentGateFixture(t);
  f.put('unknown-knowledge/_identity.yaml', f.beforeModel.identity); f.git('add', '.');
  const first = await runAssignmentGate(f.options);
  const second = await runAssignmentGate(f.options);
  code(first, 'assignment-snapshot-unavailable');
  assert.deepEqual(first, second);
  assert.doesNotMatch(JSON.stringify(first), /unknown-knowledge-commit-/);
});

test('a missing before Knowledge store returns a typed scope refusal before strict iteration', async (t) => {
  const f = assignmentGateFixture(t);
  f.git('reset', '--hard', f.commit);
  rmSync(join(f.root, 'knowledge'), { recursive: true });
  f.git('add', '.'); f.git('commit', '-qm', 'missing before Knowledge payloads');
  const commit = f.git('rev-parse', 'HEAD'); const tree = f.git('rev-parse', 'HEAD^{tree}');
  f.event['before-input'] = { commit, tree, 'kit-path': '.' };
  f.event.rows[0]['before-capture'].source = { commit, tree };
  f.baseline.baselines[0].capture.source = { commit, tree };
  f.save();
  code(await runAssignmentGate(f.options), 'assignment-store-unavailable');
});
