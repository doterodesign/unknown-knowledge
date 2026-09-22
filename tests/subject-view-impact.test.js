import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compareSubjectTreeViews } from '../payload/engine/lib/subject-view-impact.js';
import { deriveSubjectTreeArtifacts } from '../payload/engine/lib/subject-views.js';
import { subjectQueryDiskFixture } from './helpers/subject-query-disk-fixture.js';
import { indexSubjects } from '../payload/engine/lib/subjects.js';
import { evaluateSubjectGovernance } from '../payload/engine/lib/subject-governance.js';
import { canonicalSha256 } from '../payload/engine/lib/canonical-json.js';
import { loadSubjectQueryContext } from '../payload/engine/lib/subject-query-context.js';

const options = { budget: { nodes: 30, edges: 30, rows: 10 }, maxBytes: 10000 };
const view = (id = 'tree', overrides = {}) => ({ id, kind: 'subject-tree', options: { ...options, ...overrides } });
const digest = (text) => createHash('sha256').update(text, 'utf8').digest('hex');
function setup(t) {
  const fixture = subjectQueryDiskFixture(t);
  const input = { version: 1, before: { capturedInputRef: 'before', context: fixture.context },
    after: { capturedInputRef: 'after', context: fixture.context },
    inventory: { version: 1, coverage: 'complete', views: [view()] }, limits: { version: 1, maxViews: 10 } };
  function change(action, fields) {
    const document = structuredClone(fixture.context.model.subjectRegistry.document);
    const subject = document.subjects[0];
    const { id, changes, ...before } = subject;
    const after = { ...structuredClone(before), ...fields };
    const event = { id: '34567890-1234-4234-8234-123456789abc', action,
      decision: document.history[0].decision, rows: [{ id, before, after }],
      reason: 'Reviewed fixture change', unchangedMeaning: true };
    event.review = { ...document.history[0].review, changeDigest: canonicalSha256(event) };
    document.history.push(event);
    document.subjects[0] = { id, ...after, changes: [...changes, event.id] };
    document.revision += 1;
    const indexed = indexSubjects(document);
    assert.equal(indexed.ok, true, JSON.stringify(indexed.diagnostics));
    const model = { ...fixture.context.model, subjectRegistry: indexed.registry };
    const checked = evaluateSubjectGovernance({ registry: indexed.registry, identity: model.identity,
      identityIndex: model.identityIndex, decisionCaptures: fixture.decisionCaptures });
    assert.equal(checked.ok, true, JSON.stringify(checked.diagnostics));
    input.after.context = { model, subjectGovernance: checked.governance };
  }
  return { fixture, input, change };
}

test('actual factory artifacts retain raw text, UTF-8 hashes, metadata and complete unchanged deltas', (t) => {
  const f = setup(t);
  const result = compareSubjectTreeViews(f.input);
  assert.equal(result.status, 'complete');
  const row = result.views[0];
  const actual = deriveSubjectTreeArtifacts(f.fixture.context.model.subjectRegistry, options);
  assert.deepEqual(row.before.metadata, actual.metadata);
  assert.deepEqual(row.before.artifacts, actual.artifacts.map((artifact) => ({ ...artifact,
    sha256: digest(artifact.text), byteLength: Buffer.byteLength(artifact.text, 'utf8') })));
  assert.deepEqual(row.after, row.before);
  assert.equal(row.delta.status, 'exact');
  for (const key of ['added', 'removed', 'changed']) assert.deepEqual(row.delta[key], []);
  assert.deepEqual(row.delta.unchanged.map(({ path }) => path), ['subjects/derived/metadata.json', 'subjects/derived/tree.md']);
  assert.equal(result.resources.derivations.calls, 2);
  assert.equal(result.resources.derivations.unreportedCalls, 0);
  assert.equal(result.resources.derivations.used.projectionNodes, actual.metadata.resources.projection.used.nodes * 2);
  assert.equal(result.resources.derivations.used.renderBytes, actual.metadata.resources.render.usedBytes * 2);
  assert.equal(result.resources.artifactBytes, actual.artifacts.reduce((sum, { text }) => sum + Buffer.byteLength(text), 0) * 2);
  assert.equal(existsSync(join(f.fixture.kitRoot, 'subjects/derived')), false);
});

test('rename and definition history changes compare artifact bytes without claiming semantic changes', (t) => {
  for (const action of ['rename', 'clarify']) {
    const f = setup(t);
    f.change(action, action === 'rename' ? { label: 'Colour 🌈' }
      : { definition: { text: 'Clarified color wording', includes: [], excludes: [] } });
    const result = compareSubjectTreeViews(f.input);
    assert.equal(result.status, 'complete');
    const row = result.views[0];
    assert.equal(row.delta.basis, 'artifact-path-and-bytes');
    assert.equal(row.delta.changed.length, 2);
    assert.deepEqual(row.delta.added, []);
    assert.deepEqual(row.delta.removed, []);
    for (const artifact of row.after.artifacts) assert.equal(artifact.sha256, digest(artifact.text));
    assert.notEqual(row.before.metadata.fingerprint, row.after.metadata.fingerprint);
    if (action === 'clarify') assert.equal(row.before.artifacts[0].text.split('\n').slice(1).join('\n'),
      row.after.artifacts[0].text.split('\n').slice(1).join('\n'));
  }
});

test('row, traversal and byte loss retain actual counters but never manufacture empty exact deltas', (t) => {
  for (const overrides of [{ budget: { nodes: 0, edges: 0, rows: 10 } },
    { budget: { nodes: 30, edges: 30, rows: 0 } }, { maxBytes: 0 }, { maxBytes: 200 }]) {
    const f = setup(t); f.input.inventory.views = [view('limited', overrides)];
    const result = compareSubjectTreeViews(f.input);
    assert.equal(result.status, 'incomplete');
    const row = result.views[0];
    assert.equal(row.before.status, 'incomplete');
    assert.deepEqual(row.before.artifacts, []);
    assert.equal(row.delta.status, 'unavailable');
    for (const key of ['added', 'removed', 'changed', 'unchanged']) assert.equal(row.delta[key], null);
    assert.equal(result.resources.derivations.calls, 2);
    assert.equal(result.resources.derivations.unreportedCalls, 0);
    assert.equal(result.coverage.artifactDeltasComplete, false);
  }
});

test('absent, empty and partial inventories cannot be conflated', (t) => {
  const f = setup(t);
  for (const inventory of [undefined, null]) {
    const result = compareSubjectTreeViews({ ...f.input, inventory });
    assert.equal(result.status, 'not-assessed');
    assert.equal(result.views, null);
    assert.equal(result.input, null);
    assert.equal(result.coverage.unassessedViewIds, null);
  }
  f.input.inventory.views = [];
  const empty = compareSubjectTreeViews(f.input);
  assert.equal(empty.status, 'complete');
  assert.equal(empty.resources.derivations.calls, 0);
  f.input.inventory.coverage = 'partial';
  assert.equal(compareSubjectTreeViews(f.input).status, 'incomplete');
  f.input.inventory.views = [view()];
  const partial = compareSubjectTreeViews(f.input);
  assert.equal(partial.views[0].before.status, 'complete');
  assert.equal(partial.views[0].delta.unchanged, null);
});

test('a complete before build and incomplete after build never imply file removal', (t) => {
  const f = setup(t);
  const document = structuredClone(f.fixture.context.model.subjectRegistry.document);
  f.input.inventory.views = [view('tree', { budget: { nodes: 30, edges: 30, rows: document.subjects.length } })];
  document.subjects.push({ id: 'proposal:subject:11111111-1111-4111-8111-111111111111', label: 'Z draft',
    status: 'proposed', definition: { text: 'Draft subject', includes: [], excludes: [] },
    aliases: [], related: [], changes: [] });
  const indexed = indexSubjects(document);
  assert.equal(indexed.ok, true, JSON.stringify(indexed.diagnostics));
  const model = { ...f.fixture.context.model, subjectRegistry: indexed.registry };
  const checked = evaluateSubjectGovernance({ registry: indexed.registry, identity: model.identity,
    identityIndex: model.identityIndex, decisionCaptures: f.fixture.decisionCaptures });
  assert.equal(checked.ok, true, JSON.stringify(checked.diagnostics));
  f.input.after.context = { model, subjectGovernance: checked.governance };
  const result = compareSubjectTreeViews(f.input);
  assert.equal(result.status, 'incomplete');
  assert.equal(result.views[0].before.status, 'complete');
  assert.equal(result.views[0].after.status, 'incomplete');
  assert.equal(result.views[0].delta.removed, null);
  assert.equal(result.views[0].delta.reasons[0].side, 'after');
});

test('both authentic model bindings are mandatory even for complete empty inventory', (t) => {
  for (const views of [[], [view()]]) for (const side of ['before', 'after']) {
    const f = setup(t); f.input.inventory.views = views;
    const context = f.input[side].context;
    f.input[side].context = { ...context, model: { ...context.model, identityIndex: {} } };
    const result = compareSubjectTreeViews(f.input);
    assert.equal(result.status, 'refused');
    assert.equal(result.views, null);
    assert.equal(result.diagnostics[0].side, side);
  }
});

test('view pair limits report every remaining ID and canonical ordering preserves determinism', (t) => {
  const f = setup(t); f.input.inventory.views = [view('z'), view('a'), view('m')];
  f.input.limits.maxViews = 1;
  const result = compareSubjectTreeViews(f.input);
  assert.equal(result.status, 'incomplete');
  assert.deepEqual(result.coverage.unassessedViewIds, ['m', 'z']);
  assert.equal(result.views[0].id, 'a');
  assert.equal(result.resources.derivations.calls, 2);
  f.input.inventory.views.reverse();
  assert.deepEqual(compareSubjectTreeViews(f.input), result);
  f.input.limits.maxViews = 0;
  const zero = compareSubjectTreeViews(f.input);
  assert.equal(zero.resources.derivations.calls, 0);
  assert.deepEqual(zero.coverage.unassessedViewIds, ['a', 'm', 'z']);
});

test('closed DTO, unique IDs and all explicit budgets are required', (t) => {
  const f = setup(t);
  for (const patch of [{ version: 2 }, { extra: true }, { limits: { version: 1, maxViews: -1 } },
    ...[[view(), view()], [{ ...view(), kind: 'unknown' }], [view('bad', { maxBytes: -1 })],
      [view('bad', { budget: { nodes: 1, rows: 1 } })], [{ ...view(), extra: true }], [view('bad', { extra: true })]]
      .map((views) => ({ inventory: { ...f.input.inventory, views } }))]) {
    const result = compareSubjectTreeViews({ ...f.input, ...patch });
    assert.equal(result.status, 'refused');
    assert.equal(result.views, null);
  }
});

test('comparison does not mutate inputs and fingerprints bind options and captures', (t) => {
  const f = setup(t);
  const snapshot = JSON.stringify(f.fixture.context.model.subjectRegistry.document);
  const original = compareSubjectTreeViews(f.input);
  f.input.inventory.views = [view('tree', { maxBytes: 11000 })];
  assert.notEqual(compareSubjectTreeViews(f.input).input.fingerprint, original.input.fingerprint);
  f.change('rename', { label: 'Colour' });
  assert.notEqual(compareSubjectTreeViews(f.input).input.after.registryDigest, original.input.after.registryDigest);
  assert.equal(JSON.stringify(f.fixture.context.model.subjectRegistry.document), snapshot);
});

test('actual CLI generated file bytes equal comparator output in root and nested installations', (t) => {
  const cli = fileURLToPath(new URL('../payload/engine/subject-view.js', import.meta.url));
  for (const nested of [false, true]) {
    const f = subjectQueryDiskFixture(t, { nested });
    const result = compareSubjectTreeViews({ version: 1,
      before: { capturedInputRef: 'before', context: f.context }, after: { capturedInputRef: 'after', context: f.context },
      inventory: { version: 1, coverage: 'complete', views: [view()] }, limits: { version: 1, maxViews: 1 } });
    assert.equal(result.status, 'complete');
    const run = spawnSync(process.execPath, [cli, '--root', f.root, '--write', '--max-nodes', '30',
      '--max-edges', '30', '--max-rows', '10', '--max-bytes', '10000', '--json'], { encoding: 'utf8', timeout: 20000 });
    assert.equal(run.status, 0, run.stderr);
    for (const artifact of result.views[0].after.artifacts) {
      const bytes = readFileSync(join(f.kitRoot, artifact.path));
      assert.equal(bytes.toString('utf8'), artifact.text);
      assert.equal(digest(bytes), artifact.sha256);
      assert.equal(bytes.length, artifact.byteLength);
    }
  }
});

test('different authentic installation namespaces are refused', (t) => {
  const f = setup(t); const foreign = subjectQueryDiskFixture(t);
  const old = foreign.context.model.identity.namespace;
  const namespace = '87654321-1234-4234-8234-123456789abc';
  const document = JSON.parse(JSON.stringify(foreign.context.model.subjectRegistry.document).replaceAll(old, namespace));
  for (const event of document.history) { const { review, ...data } = event; event.review.changeDigest = canonicalSha256(data); }
  const keys = { schemaVersion: 'schema-version', hierarchyRevision: 'hierarchy-revision', originDecision: 'origin-decision',
    acceptedStatus: 'accepted-status', decisionCapture: 'decision-capture', decisionDigest: 'decision-digest', changeDigest: 'change-digest' };
  const wire = (value) => Array.isArray(value) ? value.map(wire) : value !== null && typeof value === 'object'
    ? Object.fromEntries(Object.entries(value).map(([key, item]) => [keys[key] ?? key, wire(item)])) : value;
  foreign.put('_identity.yaml', { ...foreign.context.model.identity, namespace });
  foreign.put('subjects/registry.yaml', wire(document));
  const loaded = loadSubjectQueryContext({ root: foreign.root, decisionCaptures: foreign.decisionCaptures });
  assert.equal(loaded.ok, true, JSON.stringify(loaded.diagnostics));
  f.input.after.context = loaded.context;
  const result = compareSubjectTreeViews(f.input);
  assert.equal(result.status, 'refused');
  assert.equal(result.diagnostics[0].code, 'namespace-mismatch');
});

test('unexpected access errors propagate as programming failures', (t) => {
  const f = setup(t); const bug = new TypeError('unexpected capture access');
  f.input.before.context = { subjectGovernance: f.fixture.context.subjectGovernance, get model() { throw bug; } };
  assert.throws(() => compareSubjectTreeViews(f.input), (error) => error === bug);
});
