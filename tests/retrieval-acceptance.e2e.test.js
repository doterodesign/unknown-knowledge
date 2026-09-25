import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { scoreTask } from '../acceptance/retrieval/evaluate.js';
import { BASELINE, prepareBaselineRuntime, materializeTask } from '../acceptance/retrieval/materialize.js';

// Literal judgments and hand-calculated gains are independent of any resolver.
const expected = {
  answerable: true,
  judgments: {
    knowledge: [
      { id: 'org/knowledge/K-000001', grade: 3, applicable: true },
      { id: 'org/knowledge/K-000002', grade: 2, applicable: true },
      { id: 'org/knowledge/K-000003', grade: 1, applicable: true },
      { id: 'org/knowledge/K-000004', grade: 3, applicable: false },
    ],
    decisions: [{ id: 'org/decisions/D-000001', grade: 3, applicable: true }],
  },
};

test('a missing execution stays missing, rather than a zero-recall run', () => {
  assert.deepEqual(scoreTask(expected), { status: 'missing', reason: 'execution-not-recorded' });
});

test('top ten is applied to ranks, not the relevant-record denominator', () => {
  const judgments = Array.from({ length: 11 }, (_, i) => ({ id: `org/knowledge/K-${i}`, grade: i === 10 ? 3 : 0, applicable: true }));
  const result = scoreTask({ answerable: true, judgments: { knowledge: judgments } },
    { rankings: { knowledge: judgments.map(row => row.id) } });
  assert.deepEqual(result.stores.knowledge.recall, { numerator: 0, denominator: 1, value: 0 });
  assert.equal(result.stores.knowledge.ndcg.value, 0);
});

test('missing per-store execution stays distinct from an explicitly empty ranking', () => {
  const result = scoreTask(expected, { rankings: { knowledge: [] } });
  assert.equal(result.status, 'partial');
  assert.deepEqual(result.stores.decisions, { status: 'missing', reason: 'ranking-not-recorded' });
  assert.deepEqual(result.stores.knowledge.recall, { numerator: 0, denominator: 2, value: 0 });
});

test('no-answer tasks retain undefined recall and nDCG even with background matches', () => {
  const result = scoreTask({ answerable: false, judgments: {
    knowledge: [{ id: 'background', grade: 1, applicable: true }],
  } }, { rankings: { knowledge: ['background'] } });
  assert.deepEqual(result.stores.knowledge.recall, { numerator: 0, denominator: 0, value: null });
  assert.equal(result.stores.knowledge.ndcg.value, null);
});

test('duplicate or unjudged ranked IDs cannot inflate or silently corrupt metrics', () => {
  for (const ids of [['org/knowledge/K-000001', 'org/knowledge/K-000001'], ['unjudged']]) {
    assert.throws(() => scoreTask(expected, { rankings: { knowledge: ids, decisions: [] } }), /duplicate|unjudged/);
  }
});

test('ambiguous duplicate judgments and grades outside the agreed rubric refuse scoring', () => {
  for (const judgments of [
    [{ id: 'same', grade: 2, applicable: true }, { id: 'same', grade: 3, applicable: true }],
    [{ id: 'bad-grade', grade: 4, applicable: true }],
  ]) {
    assert.throws(() => scoreTask({ answerable: true, judgments: { knowledge: judgments } },
      { rankings: { knowledge: [] } }), /duplicate|grade/);
  }
});

test('per-store recall uses all applicable grade 2–3 records; nDCG also values background', () => {
  const result = scoreTask(expected, { rankings: {
    knowledge: ['org/knowledge/K-000003', 'org/knowledge/K-000004', 'org/knowledge/K-000001'],
    decisions: ['org/decisions/D-000001'],
  } });
  assert.equal(result.status, 'scored');
  assert.deepEqual(result.stores.knowledge.recall, { numerator: 1, denominator: 2, value: 0.5 });
  // Rank 1 background = 1; inapplicable rank 2 = 0; rank 3 direct evidence = 7/2.
  assert.equal(result.stores.knowledge.ndcg.dcg, 4.5);
  const ideal = 7 + 3 / Math.log2(3) + 1 / 2;
  assert.equal(result.stores.knowledge.ndcg.idcg, ideal);
  assert.equal(result.stores.knowledge.ndcg.value, 4.5 / ideal);
  assert.deepEqual(result.stores.decisions.recall, { numerator: 1, denominator: 1, value: 1 });
  assert.equal(result.stores.decisions.ndcg.value, 1);
});

const bundleExpected = {
  ...expected,
  bundles: [[
    { id: 'org/knowledge/K-000001', passage: 'docs/evidence.md#claim' },
    { id: 'org/decisions/D-000001', passage: 'decisions/policy.yaml#scope' },
  ]],
};
const ranked = { knowledge: ['org/knowledge/K-000001'], decisions: ['org/decisions/D-000001'] };

test('a complete cross-store bundle requires inspected passages, not only ranked IDs', () => {
  const execute = inspected => scoreTask(bundleExpected, { rankings: ranked, inspected }).bundle;
  assert.deepEqual(execute([]), { numerator: 0, denominator: 1, value: 0 });
  assert.deepEqual(execute([
    { id: 'org/knowledge/K-000001', passages: ['docs/evidence.md#claim'] },
    { id: 'org/decisions/D-000001', passages: ['decisions/policy.yaml#wrong-section'] },
  ]), { numerator: 0, denominator: 1, value: 0 });
  assert.deepEqual(execute([
    { id: 'org/knowledge/K-000001', passages: ['docs/evidence.md#claim'] },
    { id: 'org/decisions/D-000001', passages: ['decisions/policy.yaml#scope'] },
  ]), { numerator: 1, denominator: 1, value: 1 });
});

test('alternative adequate bundles work without inventing a global cross-store rank', () => {
  const result = scoreTask({ ...bundleExpected, bundles: [...bundleExpected.bundles, [
    { id: 'org/knowledge/K-000002', passage: 'docs/combined.md#evidence' },
  ]] }, { rankings: ranked, inspected: [
    { id: 'org/knowledge/K-000002', passages: ['docs/combined.md#evidence'] },
  ] });
  // Host inspection may follow catalog recovery beyond the ranked list.
  assert.equal(result.bundle.value, 1);
});

test('missing inspection evidence and no-answer bundles remain undefined', () => {
  assert.deepEqual(scoreTask(bundleExpected, { rankings: ranked }).bundle,
    { status: 'missing', reason: 'inspection-not-recorded' });
  const result = scoreTask({ answerable: false, judgments: { knowledge: [] }, bundles: [] },
    { rankings: { knowledge: [] }, inspected: [] });
  assert.deepEqual(result.bundle, { numerator: 0, denominator: 0, value: null });
});

test('bundle inspection budget is ten total records across stores, never ten per store', () => {
  const judgments = {
    knowledge: Array.from({ length: 6 }, (_, i) => ({ id: `knowledge-${i}`, grade: 2, applicable: true })),
    decisions: Array.from({ length: 5 }, (_, i) => ({ id: `decisions-${i}`, grade: 2, applicable: true })),
  };
  const inspected = Object.values(judgments).flat().map(({ id }) => ({ id, passages: ['source'] }));
  assert.throws(() => scoreTask({ answerable: true, judgments, bundles: [[{ id: 'knowledge-0', passage: 'source' }]] },
    { rankings: { knowledge: [], decisions: [] }, inspected }), /ten.*records/);
});

test('duplicate or unjudged inspected records and empty adequate bundles refuse scoring', () => {
  const record = { id: 'org/knowledge/K-000001', passages: ['docs/evidence.md#claim'] };
  for (const inspected of [[record, record], [{ id: 'unjudged', passages: ['source'] }]]) {
    assert.throws(() => scoreTask(bundleExpected, { rankings: ranked, inspected }), /duplicate|unjudged/);
  }
  assert.throws(() => scoreTask({ ...bundleExpected, bundles: [[]] }, { rankings: ranked, inspected: [] }), /empty.*bundle/);
});

test('missing applicability and an unknown returned store refuse scoring', () => {
  assert.throws(() => scoreTask({ answerable: true, judgments: {
    knowledge: [{ id: 'unscoped', grade: 3 }],
  } }, { rankings: { knowledge: [] } }), /applicability/);
  assert.throws(() => scoreTask(expected, { rankings: { ...ranked, unexpected: [] } }), /unjudged store/);
});

test('no requested fact can coexist with useful evidence for a scoped abstention', () => {
  const result = scoreTask({ answerable: false, judgments: { decisions: [
    { id: 'engagement', grade: 3, applicable: true },
    { id: 'unresolved-agenda', grade: 2, applicable: true },
  ] }, bundles: [] }, { rankings: { decisions: ['engagement', 'unresolved-agenda'] }, inspected: [] });
  // These counts describe useful boundary evidence, not a defined factual recall.
  assert.deepEqual(result.stores.decisions.recall, { numerator: 2, denominator: 2, value: null });
  assert.equal(result.stores.decisions.ndcg.value, null);
  assert.equal(result.stores.decisions.ndcg.dcg, 7 + 3 / Math.log2(3));
  assert.deepEqual(result.bundle, { numerator: 0, denominator: 0, value: null });
});

test('an adequate bundle cannot name unjudged or inapplicable evidence', () => {
  for (const id of ['unjudged', 'org/knowledge/K-000004']) {
    assert.throws(() => scoreTask({ ...bundleExpected, bundles: [[{ id, passage: 'source' }]] },
      { rankings: ranked, inspected: [] }), /bundle.*evidence/);
  }
});

test('qualified identities distinguish equal local IDs in disconnected installations', () => {
  const result = scoreTask({ answerable: true, judgments: { knowledge: [
    { id: 'north/knowledge/K-000001', grade: 3, applicable: true },
    { id: 'south/knowledge/K-000001', grade: 0, applicable: false },
  ] } }, { rankings: { knowledge: ['south/knowledge/K-000001'] } });
  assert.deepEqual(result.stores.knowledge.recall, { numerator: 0, denominator: 1, value: 0 });
});

test('cross-store identity collisions and missing answerability cannot produce plausible scores', () => {
  const row = { id: 'ambiguous', grade: 3, applicable: true };
  assert.throws(() => scoreTask({ answerable: true, judgments: { knowledge: [row], decisions: [row] } },
    { rankings: { knowledge: [], decisions: [] } }), /duplicate judgment/);
  assert.throws(() => scoreTask({ judgments: {} }, { rankings: {} }), /answerability/);
});

test('the pinned original runtime loads a real decisions-only conflict fixture', async (t) => {
  const scratch = mkdtempSync(join(tmpdir(), 'retrieval-baseline-'));
  t.after(() => rmSync(scratch, { recursive: true, force: true }));
  const runtime = prepareBaselineRuntime(join(scratch, 'runtime'));
  const original = spawnSync('git', ['show', `${BASELINE}:payload/engine/commands/resolve.js`], { encoding: 'utf8' });
  assert.equal(original.status, 0, original.stderr);
  assert.equal(readFileSync(join(runtime, 'payload/engine/commands/resolve.js'), 'utf8'), original.stdout);
  const fixture = materializeTask('policy-01', join(scratch, 'policy'), runtime);
  const { loadStores } = await import(pathToFileURL(join(runtime, 'payload/engine/lib/load-stores.js')));
  const model = loadStores(join(fixture.roots[0].root, 'unknown-knowledge'));
  assert.equal(model.decisions.size, 5, 'all five independent source Decisions must be materialized');
  assert.equal(model.stores.ontology.present, false);
  assert.equal(model.stores.knowledge.present, false);
  assert.deepEqual(model.decisions.get('D-000002').record.supersedes, ['D-000001']);
  assert.deepEqual(model.decisions.get('D-000003').record.supersedes, ['D-000001']);
  const check = spawnSync(process.execPath, [join(runtime, 'payload/engine/validate.js'), '--root', fixture.roots[0].root, '--json'], { encoding: 'utf8' });
  assert.equal(check.status, 0, check.stdout + check.stderr);
});

test('all six organizations load in eight isolated original-format installations', async (t) => {
  const scratch = mkdtempSync(join(tmpdir(), 'retrieval-organizations-'));
  t.after(() => rmSync(scratch, { recursive: true, force: true }));
  const runtime = prepareBaselineRuntime(join(scratch, 'runtime'));
  const { loadStores } = await import(pathToFileURL(join(runtime, 'payload/engine/lib/load-stores.js')));
  const counts = {
    'engineering-01': [[5, 0, 0]],
    'cultural-research-01': [[0, 4, 1]],
    'policy-01': [[0, 0, 5]],
    'manufacturing-01': [[1, 4, 1]],
    'professional-services-01': [[0, 2, 3]],
    'holding-company-01': [[1, 0, 0], [1, 0, 0], [0, 1, 2]],
  };
  for (const [task, expectedCounts] of Object.entries(counts)) {
    const fixture = materializeTask(task, join(scratch, task), runtime);
    const models = fixture.roots.map(({ root }) => loadStores(join(root, 'unknown-knowledge')));
    assert.deepEqual(models.map(m => [m.concepts.size, m.leaves.size, m.decisions.size]), expectedCounts, task);
    for (const { root } of fixture.roots) {
      const checked = spawnSync(process.execPath, [join(root, 'unknown-knowledge/engine/validate.js'), '--root', root, '--json'], { encoding: 'utf8' });
      assert.equal(checked.status, 0, `${task}: ${checked.stdout}${checked.stderr}`);
      assert.deepEqual(readFileSync(join(root, 'unknown-knowledge/engine/commands/resolve.js')),
        readFileSync(join(runtime, 'payload/engine/commands/resolve.js')));
    }
    if (task === 'holding-company-01') {
      assert.deepEqual([...models[0].concepts.keys()], ['K-101']);
      assert.deepEqual([...models[1].concepts.keys()], ['K-101']);
      assert.notEqual(fixture.roots[0].namespace, fixture.roots[1].namespace);
      assert.match(fixture.prompt, /K-101/);
    }
    if (task === 'cultural-research-01') {
      assert.equal(models[0].leaves.get('L-000001').record.facets.stage, 'verified');
      assert.equal(models[0].leaves.get('L-000004').record.facets.stage, 'proposed');
      assert.deepEqual(models[0].leaves.get('L-000001').record.applies.jurisdictions, ['vietnam-adult-notifications']);
      assert.match(models[0].leaves.get('L-000001').body, /40 adults recruited in Vietnam/);
    }
  }
});

test('runtime drift refuses fixture preparation before creating an installation', (t) => {
  const scratch = mkdtempSync(join(tmpdir(), 'retrieval-runtime-drift-'));
  t.after(() => rmSync(scratch, { recursive: true, force: true }));
  const runtime = prepareBaselineRuntime(join(scratch, 'runtime'));
  writeFileSync(join(runtime, 'payload/engine/commands/resolve.js'), '// changed runtime\n');
  const destination = join(scratch, 'policy');
  assert.throws(() => materializeTask('policy-01', destination, runtime), /runtime.*drift/);
  assert.equal(existsSync(destination), false);
});

test('an added runtime module refuses fixture preparation before creating an installation', (t) => {
  const scratch = mkdtempSync(join(tmpdir(), 'retrieval-runtime-addition-'));
  t.after(() => rmSync(scratch, { recursive: true, force: true }));
  const runtime = prepareBaselineRuntime(join(scratch, 'runtime'));
  writeFileSync(join(runtime, 'payload/engine/added-module.js'), 'export const extra = true;\n');
  const destination = join(scratch, 'policy');
  assert.throws(() => materializeTask('policy-01', destination, runtime), /runtime.*drift/);
  assert.equal(existsSync(destination), false);
});

test('a real Git replacement cannot alter the pinned baseline export', async (t) => {
  const scratch = mkdtempSync(join(tmpdir(), 'retrieval-git-replace-'));
  t.after(() => rmSync(scratch, { recursive: true, force: true }));
  const repository = fileURLToPath(new URL('..', import.meta.url));
  const clone = join(scratch, 'repository');
  const git = (args, cwd = clone, raw = false) => {
    const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    return raw ? result.stdout : result.stdout.trim();
  };
  git(['clone', '--quiet', '--local', '--no-hardlinks', repository, clone], scratch);
  const resolver = 'payload/engine/commands/resolve.js';
  const original = git(['--no-replace-objects', 'show', `${BASELINE}:${resolver}`], clone, true);
  writeFileSync(join(clone, resolver), '// replacement resolver\n');
  git(['add', resolver]);
  git(['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid',
    'commit', '--quiet', '-m', 'Replacement fixture']);
  git(['replace', BASELINE, 'HEAD']);
  assert.equal(git(['show', `${BASELINE}:${resolver}`]), '// replacement resolver');
  // Exercise the current helper against the isolated replaced object database.
  const helper = 'acceptance/retrieval/materialize.js';
  writeFileSync(join(clone, helper), readFileSync(join(repository, helper)));
  symlinkSync(join(repository, 'node_modules'), join(clone, 'node_modules'), 'dir');
  const isolated = await import(pathToFileURL(join(clone, helper)));
  const runtime = isolated.prepareBaselineRuntime(join(scratch, 'runtime'));
  assert.ok(readFileSync(join(runtime, resolver), 'utf8') === original, 'export must contain the original resolver bytes');
  const fixture = isolated.materializeTask('policy-01', join(scratch, 'policy'), runtime);
  assert.equal(fixture.roots.length, 1);
});
