import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, readdirSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { subjectQueryDiskFixture } from './helpers/subject-query-disk-fixture.js';
import { subjectQuery, queryBudgets } from './helpers/subject-query-fixture.js';
import { loadSubjectQueryContext } from '../payload/engine/lib/subject-query-context.js';
import { executeIntersectionRoute } from '../payload/engine/lib/subject-routes.js';
import { countSubjectContexts } from '../payload/engine/lib/subject-contexts.js';

const cli = fileURLToPath(new URL('../payload/engine/subject-view.js', import.meta.url));
const generationLimits = ['--max-nodes', '20', '--max-edges', '20', '--max-rows', '10', '--max-bytes', '10000'];
const contextBudgets = { version: 1, maxRecords: 30, maxAssignments: 50, maxHierarchyNodes: 30,
  maxHierarchyEdges: 30, maxRedirects: 30, maxContexts: 10 };
function fixture(t, nested = false) {
  const f = subjectQueryDiskFixture(t, { nested });
  const entry = f.context.model.leaves.get('K-000005');
  f.put(entry.file, `---\n${JSON.stringify({ ...entry.record, subjects: [] })}\n---\n${entry.body}\n`);
  const { where, ...query } = subjectQuery(undefined, { view: 'all' });
  const route = { version: 1, kind: 'intersection', subjects: ['S-000001'] };
  const routeRequest = { version: 1, route, query };
  const contextRequest = { version: 1, query: { ...query, where }, contextBudgets };
  const run = (...args) => spawnSync(process.execPath, [cli, '--root', f.root, '--json', ...args],
    { encoding: 'utf8', timeout: 20000 });
  const request = (mode, value, { evidence = true, extra = [] } = {}) => {
    const path = join(f.root, `${mode}-request.json`);
    writeFileSync(path, JSON.stringify(value));
    return run('--mode', mode, '--request', path,
      ...(evidence ? ['--decision-captures', f.capturesFile] : []), ...extra);
  };
  return { ...f, run, request, routeRequest, contextRequest };
}

function authoredBytes(root) {
  const paths = ['_identity.yaml'];
  const pending = ['knowledge', 'decisions', 'subjects'];
  while (pending.length) {
    const relative = pending.pop();
    for (const entry of readdirSync(join(root, relative), { withFileTypes: true })) {
      const path = `${relative}/${entry.name}`;
      if (path === 'subjects/derived') continue;
      if (entry.isDirectory()) pending.push(path);
      else paths.push(path);
    }
  }
  return paths.sort().map((path) => [path, readFileSync(join(root, path)).toString('hex')]);
}

test('governed route and context CLI preserve real results through generation, deletion and fresh reload', (t) => {
  for (const nested of [false, true]) {
    const f = fixture(t, nested);
    const authored = authoredBytes(f.kitRoot);
    const inspect = () => {
      const loaded = loadSubjectQueryContext({ root: f.root, decisionCaptures: f.decisionCaptures });
      assert.equal(loaded.ok, true, JSON.stringify(loaded.diagnostics));
      const route = f.request('route', f.routeRequest);
      const contexts = f.request('contexts', f.contextRequest);
      assert.equal(route.status, 0, route.stderr);
      assert.equal(contexts.status, 0, contexts.stderr);
      const routeOutput = JSON.parse(route.stdout);
      const contextOutput = JSON.parse(contexts.stdout);
      assert.equal(routeOutput.mode, 'route');
      assert.equal(contextOutput.mode, 'contexts');
      assert.deepEqual(routeOutput.result, executeIntersectionRoute(loaded.context, f.routeRequest.route, f.routeRequest.query));
      assert.deepEqual(contextOutput.result, countSubjectContexts(loaded.context, f.contextRequest.query, { budgets: contextBudgets }));
      assert.deepEqual(routeOutput.result.groups.knowledge.strict.map(({ ref, proposalRef }) => ref?.id ?? proposalRef.key).sort(),
        ['K-000001', 'K-000002', 'proposal:knowledge:11111111-1111-4111-8111-111111111111']);
      const proposal = routeOutput.result.groups.knowledge.strict.find(({ identityType }) => identityType === 'proposal');
      assert.equal(Object.hasOwn(proposal, 'ref'), false);
      assert.deepEqual(contextOutput.result.contexts.map(({ subject, counts }) => [subject, counts.knowledge.strict]),
        [['S-000002', 1], ['S-000003', 1]]);
      return { route: routeOutput.result, contexts: contextOutput.result,
        identity: loaded.context.model.identity, registry: loaded.context.model.subjectRegistry.document };
    };
    const before = inspect();
    const written = f.run('--write', ...generationLimits);
    assert.equal(written.status, 0, written.stderr);
    const tree = readFileSync(join(f.kitRoot, 'subjects/derived/tree.md'), 'utf8');
    const metadata = readFileSync(join(f.kitRoot, 'subjects/derived/metadata.json'), 'utf8');
    assert.deepEqual(inspect(), before);
    assert.equal(f.run('--delete').status, 0);
    assert.equal(existsSync(join(f.kitRoot, 'subjects/derived')), false);
    assert.deepEqual(inspect(), before);
    assert.deepEqual(authoredBytes(f.kitRoot), authored, 'identity, history, classifications and evidence bytes remain unchanged');
    assert.equal(f.run('--write', ...generationLimits).status, 0);
    assert.equal(readFileSync(join(f.kitRoot, 'subjects/derived/tree.md'), 'utf8'), tree);
    assert.equal(readFileSync(join(f.kitRoot, 'subjects/derived/metadata.json'), 'utf8'), metadata);
  }
});

test('route count mode and reversed route preserve complete IDs and ranks in actual CLI', (t) => {
  const f = fixture(t);
  f.routeRequest.route.subjects.push('S-000002');
  const first = JSON.parse(f.request('route', f.routeRequest).stdout).result;
  f.routeRequest.route.subjects.reverse();
  const second = JSON.parse(f.request('route', f.routeRequest).stdout).result;
  assert.deepEqual(first.groups.knowledge.strict.map(({ ref, rank }) => ({ ref, rank })),
    second.groups.knowledge.strict.map(({ ref, rank }) => ({ ref, rank })));
  assert.deepEqual(second.groups.knowledge.strict.map(({ ref }) => ref.id), ['K-000002']);
  const counts = JSON.parse(f.request('route', { ...f.routeRequest, collect: 'counts' }).stdout).result;
  assert.equal(counts.groups, null);
  assert.deepEqual(counts.counts, first.counts);
});

test('context scope counts preserve P4 applicability and captured vocabulary fingerprint', (t) => {
  const f = fixture(t);
  const entry = f.context.model.leaves.get('K-000002');
  f.put(entry.file, `---\n${JSON.stringify({ ...entry.record, applies: { jurisdictions: ['us-ca'] } })}\n---\n${entry.body}\n`);
  f.contextRequest.query.applicability = { profile: 'legacy-jurisdictions-v1', mode: 'any', jurisdictions: ['eu-eaa'] };
  f.contextRequest.query.budgets = { ...queryBudgets, maxResultsPerStore: 0, maxExplanationNodes: 0 };
  const output = f.request('contexts', f.contextRequest);
  assert.equal(output.status, 0, output.stderr);
  const result = JSON.parse(output.stdout).result;
  assert.deepEqual(result.contexts.map(({ counts }) => [counts.knowledge.strict, counts.knowledge.scopeExcluded]), [[0, 1], [0, 1]]);
  assert.ok(result.contexts.every(({ input }) => /^[a-f0-9]{64}$/.test(input.inputs.jurisdictions)));
});

test('query modes refuse missing retained evidence and expose partial domains with exit 2', (t) => {
  const f = fixture(t);
  const missing = f.request('route', f.routeRequest, { evidence: false });
  assert.equal(missing.status, 2);
  assert.equal(JSON.parse(missing.stdout).result.diagnostics[0].code, 'governance-unavailable');
  const partial = f.request('route', { ...f.routeRequest,
    query: { ...f.routeRequest.query, budgets: { ...queryBudgets, maxRecords: 1 } } });
  assert.equal(partial.status, 2);
  assert.equal(JSON.parse(partial.stdout).result.status, 'incomplete');
  const partialContexts = f.request('contexts', { ...f.contextRequest, contextBudgets: { ...contextBudgets, maxContexts: 1 } });
  assert.equal(partialContexts.status, 2);
  assert.equal(JSON.parse(partialContexts.stdout).result.coverage.countsComplete, false);
  rmSync(join(f.kitRoot, '_identity.yaml'));
  const invalid = f.request('route', f.routeRequest);
  const payload = JSON.parse(invalid.stdout);
  assert.equal(invalid.status, 2);
  assert.equal(payload.status, 'refused');
  assert.equal(Object.hasOwn(payload, 'result'), false, 'loader failure cannot masquerade as an executed query');
  assert.ok(payload.diagnostics.length);
});

test('incompatible flags and malformed closed requests refuse before model loading or mutation', (t) => {
  const f = fixture(t);
  f.put('subjects/derived/sentinel.txt', 'preserve');
  for (const extra of [['--write'], ['--delete'], ['--check'], ['--max-nodes', '20'], ['unexpected']]) {
    const result = f.run('--mode', 'route', '--request', '/nonexistent/request.json', ...extra);
    assert.equal(result.status, 2);
    assert.doesNotMatch(result.stderr, /ENOENT/);
    assert.equal(readFileSync(join(f.kitRoot, 'subjects/derived/sentinel.txt'), 'utf8'), 'preserve');
  }
  rmSync(join(f.kitRoot, '_identity.yaml'));
  for (const [mode, request] of [['route', { ...f.routeRequest, extra: true }],
    ['contexts', { ...f.contextRequest, version: 2 }], ['route', { ...f.routeRequest, collect: 'invalid' }],
    ['route', { ...f.routeRequest, collect: null }]]) {
    const result = f.request(mode, request);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /request/);
  }
});

test('query input syntax and capture transport errors remain ordinary refusals', (t) => {
  const f = fixture(t);
  writeFileSync(join(f.root, 'broken.json'), '{bad json');
  const malformed = f.run('--mode', 'route', '--request', join(f.root, 'broken.json'));
  assert.equal(malformed.status, 2);
  assert.match(malformed.stderr, /Invalid JSON/);
  assert.doesNotMatch(malformed.stderr, /internal failure/);
  writeFileSync(f.capturesFile, JSON.stringify([{ bytesBase64: 'junk' }]));
  const capture = f.request('route', f.routeRequest);
  assert.equal(capture.status, 2);
  assert.match(capture.stderr, /Decision capture/);
  assert.doesNotMatch(capture.stderr, /internal failure/);
});

test('route and context CLI preserve unsupported cross-run cursor refusals', (t) => {
  const f = fixture(t);
  const authored = authoredBytes(f.kitRoot);
  for (const [mode, request] of [['route', f.routeRequest], ['contexts', f.contextRequest]]) {
    const output = f.request(mode, { ...request, query: { ...request.query, cursor: 'prior-invocation' } });
    assert.equal(output.status, 2, output.stderr);
    const result = JSON.parse(output.stdout).result;
    assert.equal(result.status, 'refused');
    assert.ok(result.diagnostics.some(({ code }) => code === 'unsupported-cursor'));
    if (mode === 'route') {
      assert.equal(result.groups, null);
      assert.equal(result.counts, null);
    } else {
      assert.equal(result.contexts, null);
      assert.equal(result.resources.queries.calls, 1, 'only the refused base call runs');
    }
  }
  assert.deepEqual(authoredBytes(f.kitRoot), authored);
  assert.equal(existsSync(join(f.kitRoot, 'subjects/derived')), false);
});

test('human query output identifies route kinds, typed candidates and context counts', (t) => {
  const f = fixture(t);
  for (const [mode, request] of [['route', f.routeRequest], ['contexts', f.contextRequest]]) {
    const path = join(f.root, `${mode}.json`);
    writeFileSync(path, JSON.stringify(request));
    const result = spawnSync(process.execPath, [cli, '--root', f.root, '--mode', mode,
      '--request', path, '--decision-captures', f.capturesFile], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    if (mode === 'route') {
      assert.match(result.stdout, /intersection: S-000001/);
      assert.match(result.stdout, /knowledge\/K-000002/);
    } else {
      assert.match(result.stdout, /S-000002: complete\n\s+knowledge: strict 1/);
      assert.match(result.stdout, /enumeration complete: true; counts complete: true/);
    }
  }
});

test('human route rows retain actual lifecycle and applicability bases without changing domain output', (t) => {
  const f = fixture(t);
  const entry = f.context.model.leaves.get('K-000001');
  f.put(entry.file, `---\n${JSON.stringify({ ...entry.record, applies: { jurisdictions: ['eu-eaa'] } })}\n---\n${entry.body}\n`);
  f.routeRequest.query.applicability = { profile: 'legacy-jurisdictions-v1', mode: 'any', jurisdictions: ['eu-eaa'] };
  const baseline = JSON.parse(f.request('route', f.routeRequest).stdout).result;
  const path = join(f.root, 'route-request.json');
  const run = () => spawnSync(process.execPath, [cli, '--root', f.root, '--mode', 'route', '--request', path,
    '--decision-captures', f.capturesFile], { encoding: 'utf8' });
  const all = run();
  assert.equal(all.status, 0, all.stderr);
  assert.match(all.stdout, /knowledge\/K-000001:.*lifecycle verified \(all-valid-lifecycle\).*applicability declared-jurisdictions/);
  assert.match(all.stdout, /knowledge\/K-000002:.*applicability legacy-unrestricted-default/);
  assert.match(all.stdout, /proposal:knowledge:.*lifecycle proposed \(all-valid-lifecycle\).*applicability legacy-unrestricted-default/);
  assert.deepEqual(JSON.parse(f.request('route', f.routeRequest).stdout).result, baseline);
  f.routeRequest.query.view = 'current';
  writeFileSync(path, JSON.stringify(f.routeRequest));
  const current = run();
  assert.equal(current.status, 0, current.stderr);
  assert.match(current.stdout, /lifecycle verified \(lifecycle-only\)/);
  assert.doesNotMatch(current.stdout, /proposal:knowledge:/);
});
