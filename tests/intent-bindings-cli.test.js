import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, cpSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadStores } from '../payload/engine/lib/load-stores.js';
import { inspectIntentBindings } from '../payload/engine/lib/intent-bindings.js';

const repository = fileURLToPath(new URL('..', import.meta.url));
const command = join(repository, 'payload/engine/intent-plan.js');
const namespace = '12345678-1234-4234-8234-123456789abc';
const proposal = 'proposal:subject:23456789-1234-4234-8234-123456789abc';
const second = 'proposal:subject:33456789-1234-4234-8234-123456789abc';

function fixture(t, nested = false) {
  const root = mkdtempSync(join(tmpdir(), 'intent-bindings-cli-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const kit = nested ? join(root, 'unknown-knowledge') : root;
  const put = (name, data) => {
    const file = join(kit, name); mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, typeof data === 'string' ? data : JSON.stringify(data));
    return file;
  };
  put('_identity.yaml', { 'schema-version': 1, 'identity-format': 1, namespace,
    allocations: [{ kind: 'decision', id: 'D-000001', state: 'allocated', publication: {
      id: '43456789-1234-4234-8234-123456789abc', review: 'review:fixture' } }] });
  put('decisions/_catalog.yaml', { 'schema-version': 2, store: 'decisions', entries: [
    { id: 'D-000001', title: 'Navigation fixture', file: 'entries/review.yaml' }] });
  put('decisions/entries/review.yaml', { 'schema-version': 2, entries: [{ id: 'D-000001', title: 'Navigation fixture',
    status: 'accepted', category: 'architecture', date: '2026-09-19', deciders: ['fixture'],
    context: 'Inspect existing declared metadata.', decision: 'No source approval is claimed.' }] });
  const document = { 'schema-version': 1, namespace, revision: 0, 'hierarchy-revision': 0, history: [],
    subjects: [
      { id: proposal, label: 'Café', status: 'proposed', changes: [], related: [],
        definition: { text: 'A place serving coffee', includes: [], excludes: [] },
        aliases: [{ label: 'Bistro', locale: 'fr' }] },
      { id: second, label: 'Project Bistro', status: 'proposed', changes: [], related: [],
        definition: { text: 'An unrelated project name', includes: [], excludes: [] },
        aliases: [{ label: 'Bistro', locale: 'fr' }] },
    ] };
  put('subjects/registry.yaml', document);
  const plan = { version: 1, inputRef: 'request:place', inventoryStatus: 'declared-complete',
    units: [{ key: 'place', sourceRef: 'request:place', disposition: 'mapped' }],
    bindings: [{ key: 'place', unitKeys: ['place'], target: { namespace, kind: 'subject', id: proposal },
      label: 'Café', basis: 'alias', sourceRef: 'lookup:place' }], constraints: [], branches: [], clarifications: [],
    requirements: [{ key: 'source', unitKeys: ['place'], description: 'Read actual source support.' }] };
  const planFile = put('plan.json', plan);
  // Get expected capture metadata from the actual public lookup, not a fake DTO.
  const lookup = spawnSync(process.execPath, [join(repository, 'payload/engine/subject.js'), 'lookup', 'Bistro',
    '--locale', 'fr', '--root', root, '--json'], { encoding: 'utf8' });
  assert.equal(lookup.status, 0, lookup.stderr);
  const captured = JSON.parse(lookup.stdout);
  const requests = { 'lookup:place': { text: captured.input.text, options: captured.input.options,
    expected: { namespace: captured.context.namespace, revision: captured.context.registryRevision,
      normalizerVersion: captured.context.normalizer, documentSha256: captured.context.registryDigest } } };
  const requestsFile = put('requests.json', requests);
  const args = [planFile, '--inspect-bindings', '--root', root, '--lookup-requests', requestsFile, '--json'];
  const run = (argv = args, executable = command) => spawnSync(process.execPath, [executable, ...argv], { encoding: 'utf8' });
  return { root, kit, put, plan, document, planFile, requests, requestsFile, args, run };
}

for (const nested of [false, true]) test(`installed ${nested ? 'nested' : 'root'} binding inspection preserves actual homonyms and domain output`, t => {
  const f = fixture(t, nested); const model = loadStores(f.kit);
  const files = [f.planFile, f.requestsFile, join(f.kit, '_identity.yaml'), join(f.kit, 'subjects/registry.yaml')];
  const before = files.map(file => readFileSync(file));
  const r = f.run(); assert.equal(r.status, 0, r.stderr);
  const output = JSON.parse(r.stdout);
  assert.equal(output.mode, 'inspect-bindings');
  assert.deepEqual(output.result, inspectIntentBindings(f.plan, { subjectDocument: model.subjectRegistry.document,
    identityIndex: model.identityIndex, lookupRequests: f.requests }));
  assert.deepEqual(output.contextDiagnostics, model.diagnostics);
  const row = output.result.bindings[0];
  assert.equal(row.basisCheck, 'supported');
  assert.deepEqual(row.lookup.candidates.map(candidate => candidate.ref.id), [proposal, second]);
  assert.ok(row.lookup.candidates.every(candidate => candidate.status === 'proposed'));
  assert.equal(output.result.governanceValidation, 'not-run');
  assert.equal(output.result.queryValidation, 'not-run');
  assert.equal(r.stdout, f.run().stdout);
  files.forEach((file, i) => assert.deepEqual(readFileSync(file), before[i]));
  const human = f.run(f.args.filter(a => a !== '--json'));
  assert.equal(human.status, 0, human.stderr);
  assert.match(human.stdout, /captured-navigation-only/);
  assert.match(human.stdout, /unrelated project name/);
  assert.match(human.stdout, /source support/);
});

test('label normalization, unsupported claims, inference, stale and missing witnesses remain distinct', t => {
  const f = fixture(t);
  f.requests['lookup:place'].text = 'CAFE\u0301'; f.requests['lookup:place'].options = {};
  f.plan.bindings[0].basis = 'label';
  f.put('plan.json', f.plan); f.put('requests.json', f.requests);
  let r = f.run(); assert.equal(r.status, 0, r.stderr);
  assert.equal(JSON.parse(r.stdout).result.bindings[0].basisCheck, 'supported');
  for (const [basis, expected] of [['alias', 'unsupported'], ['inference', 'inference']]) {
    f.plan.bindings[0].basis = basis; f.put('plan.json', f.plan);
    r = f.run(); assert.equal(r.status, 0, r.stderr);
    assert.equal(JSON.parse(r.stdout).result.bindings[0].basisCheck, expected);
  }
  f.plan.bindings[0].basis = 'label'; f.put('plan.json', f.plan);
  f.document.subjects[0].definition.text = 'Changed meaning at the same declared revision';
  f.put('subjects/registry.yaml', f.document);
  r = f.run(); assert.equal(r.status, 0, r.stderr);
  assert.equal(JSON.parse(r.stdout).result.bindings[0].lookup.status, 'stale-context');
  assert.equal(JSON.parse(r.stdout).result.bindings[0].basisCheck, 'not-run');
  r = f.run(f.args.filter((a, i) => a !== '--lookup-requests' && f.args[i - 1] !== '--lookup-requests'));
  assert.equal(r.status, 0, r.stderr);
  assert.equal(JSON.parse(r.stdout).result.bindings[0].lookup.status, 'unavailable');
});

test('record-only navigation needs no subject registry and cannot certify record label claims', t => {
  const f = fixture(t);
  rmSync(join(f.kit, 'subjects'), { recursive: true });
  f.plan.bindings[0].target = { namespace, kind: 'decision', id: 'D-000001' };
  f.plan.bindings[0].label = 'Navigation fixture'; f.plan.bindings[0].basis = 'label'; f.put('plan.json', f.plan);
  let r = f.run(); assert.equal(r.status, 0, r.stderr);
  let row = JSON.parse(r.stdout).result.bindings[0];
  assert.equal(row.target.status, 'loaded');
  assert.equal(row.basisCheck, 'not-run');
  assert.equal(row.lookup.reason, 'record-label-lookup-not-supported');
  f.plan.bindings[0].target = { namespace, kind: 'subject', id: proposal }; f.put('plan.json', f.plan);
  r = f.run(); assert.equal(r.status, 0, r.stderr);
  row = JSON.parse(r.stdout).result.bindings[0];
  assert.equal(row.target.status, 'unavailable');
});

test('inspection distinguishes invalid plans, mode misuse, bad input and unavailable context', t => {
  const f = fixture(t);
  for (const extra of [['--validate-queries'], ['--execute-queries'], ['--admission', f.requestsFile],
    ['--execution-admission', f.requestsFile], ['--decision-captures', f.requestsFile], ['--assessment-captures', f.requestsFile]]) {
    const r = f.run([...f.args, ...extra]); assert.equal(r.status, 2); assert.equal(r.stdout, '');
  }
  for (const args of [[f.planFile, '--inspect-bindings'], [f.planFile, '--lookup-requests', f.requestsFile],
    [f.planFile, '--validate-queries', '--root', f.root, '--admission', f.requestsFile, '--lookup-requests', f.requestsFile]]) {
    const r = f.run(args); assert.equal(r.status, 2); assert.equal(r.stdout, '');
  }
  f.put('requests.json', '{"private-fragment": invalid}');
  let r = f.run(); assert.equal(r.status, 2); assert.equal(r.stdout, ''); assert.doesNotMatch(r.stderr, /private-fragment/);
  f.put('requests.json', f.requests); f.put('plan.json', {});
  r = f.run(); assert.equal(r.status, 2, r.stderr);
  assert.equal(JSON.parse(r.stdout).result.planValidation.valid, false);
  f.put('plan.json', f.plan); f.put('decisions/_catalog.yaml', { 'schema-version': 999 });
  r = f.run(); assert.equal(r.status, 2, r.stderr);
  const output = JSON.parse(r.stdout);
  assert.equal(output.mode, 'inspect-bindings'); assert.equal(output.result, null);
  assert.ok(output.diagnostics.some(d => d.code === 'invalid-model'));
});

test('copied inspection works and dependency failures do not affect structural mode', t => {
  const f = fixture(t, true);
  cpSync(join(repository, 'payload/engine'), join(f.kit, 'engine'), { recursive: true });
  cpSync(join(repository, 'payload/schemas'), join(f.kit, 'schemas'), { recursive: true });
  symlinkSync(join(repository, 'node_modules'), join(f.kit, 'node_modules'), 'dir');
  const installed = join(f.kit, 'engine/intent-plan.js');
  assert.equal(f.run(f.args, installed).status, 0);
  const loader = join(f.kit, 'engine/lib/load-stores.js');
  writeFileSync(loader, "throw new TypeError('injected binding loader bug');\n" + readFileSync(loader, 'utf8'));
  const failure = f.run(f.args, installed);
  assert.equal(failure.status, 2); assert.match(failure.stderr, /injected binding loader bug/);
  assert.equal(f.run([f.planFile, '--json'], installed).status, 0);
});
