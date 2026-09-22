import { test } from 'node:test';
import assert from 'node:assert/strict';
import { indexSubjects } from '../payload/engine/lib/subjects.js';
import { projectSubjectTree, renderSubjectTree, deriveSubjectTreeArtifacts } from '../payload/engine/lib/subject-views.js';

const namespace = '12345678-1234-4234-8234-123456789abc';
const subject = (id, label, extra = {}) => ({
  id, label, definition: { text: `${label} meaning`, includes: [], excludes: [] },
  aliases: [], related: [], status: 'active', ...extra,
});
const index = (subjects) => {
  const result = indexSubjects({ schemaVersion: 1, namespace, revision: 3, hierarchyRevision: 2, subjects });
  assert.equal(result.ok, true);
  return result.registry;
};
const options = { budget: { nodes: 20, edges: 20, rows: 20 } };

test('structural tree uses complete semantic paths, ordered by labels then exact identity', () => {
  const records = [
    subject('S-000001', 'Red', { parent: 'S-000009' }),
    subject('S-000002', 'Culture', { related: [{ type: 'association', target: 'S-000009' }] }),
    subject('S-000003', 'Color', { definition: { text: 'Political affiliation', includes: [], excludes: [] } }),
    subject('S-000009', 'Color'),
  ];
  const tree = projectSubjectTree(index(records), options);
  assert.equal(tree.status, 'complete');
  assert.equal(tree.kind, 'semantic-tree');
  assert.deepEqual(tree.nodes.map(({ id, route }) => [id, route]), [
    ['S-000003', { version: 1, kind: 'semantic-path', subjects: ['S-000003'] }],
    ['S-000009', { version: 1, kind: 'semantic-path', subjects: ['S-000009'] }],
    ['S-000001', { version: 1, kind: 'semantic-path', subjects: ['S-000009', 'S-000001'] }],
    ['S-000002', { version: 1, kind: 'semantic-path', subjects: ['S-000002'] }],
  ]);
  assert.equal(tree.nodes[0].definition.text, 'Political affiliation');
  assert.deepEqual(tree.resources.used, { nodes: 5, edges: 1, rows: 4 });
  assert.deepEqual(projectSubjectTree(index([...records].reverse()), options), tree);
});

test('one global budget charges repeated ancestors and never promotes a partial suffix to a path', () => {
  const registry = index([
    subject('S-000001', 'Root'),
    subject('S-000002', 'Child', { parent: 'S-000001' }),
    subject('S-000003', 'Deep', { parent: 'S-000002' }),
  ]);
  const tree = projectSubjectTree(registry, { budget: { nodes: 4, edges: 3, rows: 9 } });
  assert.equal(tree.status, 'incomplete');
  assert.deepEqual(tree.resources.used, { nodes: 4, edges: 2, rows: 2 });
  assert.deepEqual(tree.nodes.map((node) => node.id), ['S-000001', 'S-000002']);
  assert.deepEqual(tree.unresolved, [{ id: 'S-000003', reason: 'node-budget', partialSuffix: ['S-000003'] }]);
  assert.deepEqual(tree.coverage, { total: 3, attempted: 3, rendered: 2, unvisited: 0 });
});

test('row limits preserve complete ancestor prefixes instead of rendering orphan children', () => {
  const registry = index([
    subject('S-000001', 'Child', { parent: 'S-000009' }),
    subject('S-000009', 'Root'),
  ]);
  const tree = projectSubjectTree(registry, { budget: { nodes: 20, edges: 20, rows: 1 } });
  assert.equal(tree.status, 'incomplete');
  assert.deepEqual(tree.nodes.map(({ id, route }) => [id, route.subjects]), [['S-000009', ['S-000009']]]);
  assert.equal(tree.unresolved[0].reason, 'row-budget');
  assert.deepEqual(tree.resources.used, { nodes: 2, edges: 1, rows: 1 });
});

test('unavailable registries and invalid options are failures, while a bounded empty registry is complete', () => {
  assert.throws(() => projectSubjectTree(null, options), { code: 'subjects-unavailable' });
  for (const invalid of [undefined, {}, { budget: { nodes: -1, edges: 1, rows: 1 } },
    { budget: { nodes: 1, edges: 1 } }, { budget: { nodes: 1, edges: 1, rows: 1, hidden: 1 } },
  ]) assert.throws(() => projectSubjectTree(index([]), invalid), { code: 'invalid-budget' });
  const empty = projectSubjectTree(index([]), { budget: { nodes: 0, edges: 0, rows: 0 } });
  assert.equal(empty.status, 'complete');
  assert.deepEqual(empty.nodes, []);
  assert.deepEqual(empty.resources.used, { nodes: 0, edges: 0, rows: 0 });
});

test('readable tree keeps all declared states visible and escapes authored labels', () => {
  const proposal = 'proposal:subject:12345678-1234-4234-8234-123456789abc';
  const tree = projectSubjectTree(index([
    subject('S-000001', 'Color'),
    subject('S-000002', '<red>\n色 [x]', { parent: 'S-000001', status: 'retired' }),
    subject(proposal, 'Draft', { status: 'proposed' }),
  ]), options);
  const rendered = renderSubjectTree(tree, { maxBytes: 2000 });
  assert.equal(rendered.status, 'complete');
  assert.equal(rendered.projectionStatus, 'complete');
  assert.equal(rendered.renderedRows, 3);
  assert.match(rendered.text, /Declared lifecycle; approval not checked/);
  assert.ok(rendered.text.includes('- Color `S-000001` [active]\n  - \\<red\\> 色 \\[x\\] `S-000002` [retired]\n'));
  assert.ok(rendered.text.includes(`- Draft \`${proposal}\` [proposed]`));
  assert.equal(rendered.usedBytes, Buffer.byteLength(rendered.text, 'utf8'));
});

test('byte limits are distinct from ancestry completeness and do not split a rendered row', () => {
  const tree = projectSubjectTree(index([subject('S-000001', '色')]), options);
  const full = renderSubjectTree(tree, { maxBytes: 2000 });
  const truncated = renderSubjectTree(tree, { maxBytes: full.usedBytes - 1 });
  assert.equal(truncated.status, 'incomplete');
  assert.equal(truncated.reason, 'byte-budget');
  assert.equal(truncated.projectionStatus, 'complete');
  assert.equal(truncated.renderedRows, 0);
  assert.equal(truncated.text.includes('S-000001'), false);
  assert.equal(truncated.usedBytes <= full.usedBytes - 1, true);
  assert.equal(renderSubjectTree(tree, { maxBytes: 0 }).text, '');
  assert.throws(() => renderSubjectTree(tree, {}), { code: 'invalid-budget' });
});

test('partial projection stays visibly partial even when every available row is rendered', () => {
  const tree = projectSubjectTree(index([subject('S-000001', 'Color')]), {
    budget: { nodes: 0, edges: 0, rows: 1 },
  });
  const rendered = renderSubjectTree(tree, { maxBytes: 2000 });
  assert.equal(rendered.status, 'complete', 'all available output rendered');
  assert.equal(rendered.projectionStatus, 'incomplete');
  assert.match(rendered.text, /Projection: incomplete/);
  assert.match(rendered.text, /S-000001.*node-budget/);
});

test('deep declared forest stops at the shared budget without recursive rendering or input changes', () => {
  const records = [];
  for (let i = 1; i <= 1200; i += 1) {
    const id = `S-${String(i).padStart(6, '0')}`;
    records.push(subject(id, `Level ${i}`, i === 1 ? {} : { parent: `S-${String(i - 1).padStart(6, '0')}` }));
  }
  const registry = index(records);
  const before = JSON.stringify(registry.document);
  const tree = projectSubjectTree(registry, { budget: { nodes: 12, edges: 12, rows: 12 } });
  assert.equal(tree.status, 'incomplete');
  assert.deepEqual(tree.nodes.map(({ id }) => id), ['S-000001', 'S-000002', 'S-000003', 'S-000004']);
  assert.equal(tree.resources.used.nodes, 12);
  assert.equal(renderSubjectTree(tree, { maxBytes: 1000 }).usedBytes <= 1000, true);
  tree.nodes[0].definition.text = 'edited view';
  assert.equal(JSON.stringify(registry.document), before);
});

const artifactOptions = { budget: { nodes: 20, edges: 20, rows: 20 }, maxBytes: 2000 };

test('complete structural tree produces a disposable registry-only artifact bundle', () => {
  const registry = index([subject('S-000001', 'Color')]);
  const result = deriveSubjectTreeArtifacts(registry, artifactOptions);
  assert.equal(result.status, 'complete');
  assert.deepEqual(result.artifacts.map(({ path }) => path), [
    'subjects/derived/tree.md', 'subjects/derived/metadata.json',
  ]);
  assert.match(result.artifacts[0].text, /Color `S-000001` \[active\]/);
  assert.deepEqual(JSON.parse(result.artifacts[1].text), result.metadata);
  assert.equal(result.metadata.inputScope, 'registry-only');
  assert.equal(result.metadata.consistency, 'captured-model');
  assert.equal(result.metadata.namespace, namespace);
  assert.deepEqual(Object.keys(result.metadata.inputs), ['registry']);
  assert.deepEqual(result.metadata.versions, { subjectSchema: 1, normalizer: 1, generator: 1 });
  assert.deepEqual(result.metadata.revisions, { registry: 3, hierarchy: 2 });
  assert.deepEqual(result.metadata.completion, { projection: 'complete', render: 'complete' });
  assert.equal(Object.hasOwn(result.metadata, 'today'), false);
  assert.deepEqual(deriveSubjectTreeArtifacts(registry, artifactOptions), result);
});

test('artifact fingerprint binds full registry history and rendering policy, even with unchanged revisions', () => {
  const registry = index([subject('S-000001', 'Color')]);
  const original = deriveSubjectTreeArtifacts(registry, artifactOptions);
  const changedHistory = indexSubjects({ ...registry.document, history: [{ review: 'review-a' }] }).registry;
  const history = deriveSubjectTreeArtifacts(changedHistory, artifactOptions);
  assert.notEqual(history.metadata.inputs.registry, original.metadata.inputs.registry);
  assert.notEqual(history.metadata.fingerprint, original.metadata.fingerprint);
  const policy = deriveSubjectTreeArtifacts(registry, { ...artifactOptions, maxBytes: 2100 });
  assert.notEqual(policy.metadata.fingerprint, original.metadata.fingerprint);
  assert.equal(policy.metadata.inputs.registry, original.metadata.inputs.registry);
  assert.ok(original.artifacts[0].text.includes(original.metadata.fingerprint));
  assert.equal(Buffer.byteLength(original.artifacts[0].text, 'utf8') <= artifactOptions.maxBytes, true);
});

test('an incomplete projection or rendering yields diagnostics without publishable artifacts', () => {
  const registry = index([subject('S-000001', 'Color')]);
  for (const constrained of [
    { ...artifactOptions, budget: { nodes: 0, edges: 0, rows: 1 } },
    { ...artifactOptions, maxBytes: 0 },
    { ...artifactOptions, maxBytes: 80 },
  ]) {
    const result = deriveSubjectTreeArtifacts(registry, constrained);
    assert.equal(result.status, 'incomplete');
    assert.deepEqual(result.artifacts, []);
    assert.equal(result.metadata.diagnostics.length > 0, true);
  }
  assert.throws(() => deriveSubjectTreeArtifacts(registry, { ...artifactOptions, today: '2026-09-19' }), { code: 'invalid-options' });
});

test('artifact rendering and digest use the same authoritative capture despite mutable derived maps', () => {
  const registry = index([subject('S-000001', 'Color'), subject('S-000002', 'Red', { parent: 'S-000001' })]);
  const original = deriveSubjectTreeArtifacts(registry, artifactOptions);
  registry.subjects.set('S-000001', { ...registry.subjects.get('S-000001'), label: 'Tampered derived label' });
  registry.parents.delete('S-000002');
  registry.children.set('S-000001', []);
  const actual = deriveSubjectTreeArtifacts(registry, artifactOptions);
  assert.deepEqual(actual, original);
  assert.equal(actual.artifacts[0].text.includes('Tampered'), false);
});
