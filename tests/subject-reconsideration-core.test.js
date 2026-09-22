import { test } from 'node:test';
import assert from 'node:assert/strict';
import { subjectReconsiderationCoreFixture } from './helpers/subject-reconsideration-core-fixture.js';
import { validateSubjectReconsiderationCreation } from '../payload/engine/lib/subject-governance.js';
import { changedTreePaths } from '../payload/engine/lib/commit-snapshot.js';
import { admitSubjectReconsiderationInput } from '../payload/engine/lib/subject-reconsideration-input.js';
import { createSubjectValidationBudget } from '../payload/engine/lib/subject-validation-budget.js';
import { subjectReconsiderationInputWire } from '../payload/engine/lib/subject-reconsideration-input.js';
import { inspectSubjectReconsiderationCore } from '../payload/engine/lib/subject-reconsideration-core.js';
import { canonicalSha256, canonicalJsonBytes } from '../payload/engine/lib/canonical-json.js';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { wire, digestEvent } from './helpers/subject-reconsideration-fixture.js';
import { validateValues } from '../payload/engine/commands/validate-values.js';
import { runChecks } from '../payload/engine/commands/validate.js';

const captured = input => [...input.evidence.decisionCaptures,
  ...input.evidence.assessmentCaptures.flatMap(pair => [pair.registry, pair.identity]), ...input.evidence.materialCaptures];
const inspect = input => inspectSubjectReconsiderationCore(input);

function rebindOriginalPair(f, change) {
  f.put('_identity.yaml', f.beforeIdentity); f.put('subjects/registry.yaml', wire(f.beforeDocument));
  change();
  const before = f.commit('actual altered original corpus');
  const pair = { registry: f.capture(before, 'subjects/registry.yaml'), identity: f.capture(before, '_identity.yaml') };
  const document = structuredClone(f.candidateDocument), event = document.history.at(-1);
  event.reconsiderationAssessment.scope.beforeRegistry.capture = pair.registry.capture;
  event.review.changeDigest = digestEvent(event);
  f.put('_identity.yaml', f.candidateIdentity); f.put('subjects/registry.yaml', wire(document));
  const candidate = f.commit('candidate preserving altered original corpus');
  return f.input({ before, candidate, evidence: { ...f.evidence, assessmentCaptures: [pair] },
    operation: { ...f.operation, registryEvent: { id: event.id, changeDigest: event.review.changeDigest } } });
}

test('direct admission detaches each caller byte buffer, locator and metadata', t => {
  const f = subjectReconsiderationCoreFixture(t);
  const original = f.input(), allowance = createSubjectValidationBudget(f.limits.governance);
  const admitted = admitSubjectReconsiderationInput(original, { operationBudget: allowance });
  assert.equal(admitted.ok, true, JSON.stringify(admitted.diagnostics));
  const expected = subjectReconsiderationInputWire(admitted.input);
  for (const raw of captured(original)) { raw.bytes.fill(0); raw.capture.file = 'changed.txt'; }
  original.operation.subject = 'S-000099';
  assert.deepEqual(subjectReconsiderationInputWire(admitted.input), expected);
  assert.equal(admitted.inputDigest, canonicalSha256(expected));
});

test('raw copy reservation is exact-fit and refuses one-short before Buffer.from', t => {
  const f = subjectReconsiderationCoreFixture(t), input = f.input();
  const sum = captured(input).reduce((total, value) => total + value.bytes.length, 0);
  const enough = createSubjectValidationBudget({ ...f.limits.governance, maxCaptureBytes: sum });
  assert.equal(admitSubjectReconsiderationInput(input, { operationBudget: enough }).ok, true);
  assert.equal(enough.used.captureBytes, sum);
  const last = input.evidence.materialCaptures[0].bytes;
  const original = Buffer.from;
  let lastCopies = 0;
  Buffer.from = function(value, ...args) { if (value === last) lastCopies += 1; return original(value, ...args); };
  const short = createSubjectValidationBudget({ ...f.limits.governance, maxCaptureBytes: sum - 1 });
  let result;
  try { result = admitSubjectReconsiderationInput(input, { operationBudget: short }); }
  finally { Buffer.from = original; }
  assert.equal(result.ok, false); assert.equal(lastCopies, 0);
  assert.equal(short.failure.phase, 'reconsideration-input-owned-copy');
  assert.equal(short.failure.counter, 'captureBytes');
});

test('authentic active admission precedes caller traversal', t => {
  const f = subjectReconsiderationCoreFixture(t);
  let reads = 0;
  const trapped = { get limits() { reads += 1; throw new Error('do not read'); } };
  for (const options of [undefined, {}, { operationBudget: undefined }, { operationBudget: {} }]) {
    assert.equal(admitSubjectReconsiderationInput(trapped, options).ok, false);
  }
  const exhausted = createSubjectValidationBudget({ ...f.limits.governance, maxValidationSteps: 0 });
  assert.throws(() => exhausted.charge('validationSteps', 1, 'fixture-exhaustion'));
  assert.equal(admitSubjectReconsiderationInput(trapped, { operationBudget: exhausted }).ok, false);
  assert.equal(reads, 0);
});

test('closed input and dense arrays reject executable or omitted wire fields', async t => {
  const f = subjectReconsiderationCoreFixture(t);
  const copy = () => ({ ...f.input(), before: { ...f.before }, candidate: { ...f.candidate },
    operation: structuredClone(f.operation), evidence: { ...f.evidence, materialCaptures: [...f.evidence.materialCaptures] },
    limits: structuredClone(f.limits) });
  assert.equal((await inspect(copy())).ok, true, 'The exact unmutated copy retains real Buffer captures.');
  const attacks = [
    input => { input.core = { ok: true }; },
    input => { input.operation.assignmentEvent = {}; },
    input => { input.evidence.materialCaptures = null; },
    input => { input.evidence.materialCaptures = undefined; },
    input => { input.evidence.materialCaptures = new Array(1); },
    input => { input.evidence.materialCaptures[Symbol.iterator] = () => { throw new Error('iterator'); }; },
    input => { Object.defineProperty(input.operation, 'subject', { get() { throw new Error('getter'); }, enumerable: true }); },
    input => { Object.defineProperty(input.before, 'tree', { value: input.before.tree, enumerable: false }); },
    input => { input.limits.governance = 1; },
    input => { input.before.commit += '\n'; },
    input => { input.candidate.tree += '\n'; },
    input => { input.before.commit = Object.defineProperty({}, 'length', { get() { throw new Error('hidden scalar getter'); } }); },
  ];
  for (const attack of attacks) {
    const input = copy();
    attack(input);
    const result = await inspect(input);
    assert.equal(result.ok, false); assert.equal(result.allocation, null);
    assert.ok(['invalid-subject-reconsideration-input', 'invalid-subject-input'].includes(result.diagnostics[0].code), JSON.stringify(result.diagnostics));
  }
});

test('actual physical capture bytes have an independent sum and exact capacity boundary', async t => {
  const f = subjectReconsiderationCoreFixture(t), positive = await inspect(f.input());
  assert.equal(positive.ok, true, JSON.stringify(positive.diagnostics));
  const inputBytes = captured(f.input()).reduce((sum, capture) => sum + capture.bytes.length, 0);
  const files = new Set([f.files.registry, f.files.identity, ...positive.ownerPreservation.records.map(row => row.before.capture.file)]);
  const actual = new Map(); let materialized = 0;
  for (const side of ['before', 'candidate']) for (const file of files) {
    const bytes = f.git('show', `${f[side].commit}:${file}`);
    // git helper trims text; raw Buffer reads below preserve the complete bytes.
    assert.ok(bytes.length > 0);
    const kitRelative = f[side].kitPath === '.' ? file : file.slice(f[side].kitPath.length + 1);
    const capture = f.capture(f[side], kitRelative);
    actual.set(JSON.stringify([f[side].commit, file]), capture.bytes.length);
    materialized += capture.bytes.length;
  }
  for (const capture of captured(f.input())) {
    const { commit } = capture.capture.source;
    actual.set(JSON.stringify([commit, capture.capture.file]), capture.bytes.length);
  }
  const expected = inputBytes + [...actual.values()].reduce((sum, length) => sum + length, 0) + materialized;
  assert.equal(positive.resources.governance.used.captureBytes, expected);
  const limits = structuredClone(f.limits); limits.governance.maxCaptureBytes = expected;
  assert.equal((await inspect(f.input({ limits }))).ok, true);
  limits.governance.maxCaptureBytes -= 1;
  const short = await inspect(f.input({ limits }));
  assert.equal(short.ok, false);
  assert.equal(short.resources.governance.failure.counter, 'captureBytes');
  assert.equal(short.resources.governance.failure.phase, 'raw-captures');
});

test('Buffer property work has an exact fit and a one-short named refusal', t => {
  const f = subjectReconsiderationCoreFixture(t), input = f.input();
  const only = input.evidence.decisionCaptures[0];
  input.evidence = { decisionCaptures: [only], assessmentCaptures: [], materialCaptures: [] };
  const steps = only.bytes.length + 4;
  const enough = createSubjectValidationBudget({ ...f.limits.governance, maxValidationSteps: steps });
  assert.equal(admitSubjectReconsiderationInput(input, { operationBudget: enough }).ok, true);
  assert.equal(enough.used.validationSteps, steps);
  const short = createSubjectValidationBudget({ ...f.limits.governance, maxValidationSteps: steps - 1 });
  assert.equal(admitSubjectReconsiderationInput(input, { operationBudget: short }).ok, false);
  assert.equal(short.failure.phase, 'reconsideration-input-buffer-properties');
  assert.equal(short.used.captureBytes, only.bytes.length, 'reservation occurred, but no successful-copy proof');
});

for (const options of [{ objectFormat: 'sha1', stores: 'decision' }, { objectFormat: 'sha1', stores: 'knowledge' },
  { objectFormat: 'sha256', nested: true, stores: 'ontology' }, { objectFormat: 'sha256', nested: true, stores: 'all', parent: true, related: true }]) {
  test(`actual stored census ${options.objectFormat}/${options.stores} preserves known and missing metadata`, async t => {
    const f = subjectReconsiderationCoreFixture(t, options), result = await inspect(f.input());
    assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
    assert.equal(result.ownerPreservation.status, 'passed'); assert.equal(result.assignments, null);
    for (const row of result.ownerPreservation.records) {
      assert.equal(row.before.mode, row.candidate.mode);
      assert.equal(row.before.capture.sha256, row.candidate.capture.sha256);
      assert.notEqual(row.assignments.state, 'invalid');
    }
    if (options.stores === 'all' || options.stores === 'knowledge') {
      const missing = result.ownerPreservation.records.find(row => row.ref?.id === 'K-000002');
      assert.deepEqual(missing.assignments, { state: 'unknown', reason: 'absent' });
      assert.equal(missing.lifecycle.state, 'unknown');
      assert.ok(result.ownerPreservation.unknownAssignments.some(row => row.ref?.id === 'K-000002'));
    }
  });
}

test('actual commits ignore and preserve dirty checkout and index state', async t => {
  const f = subjectReconsiderationCoreFixture(t);
  f.put('subjects/registry.yaml', 'uncommitted invalid registry');
  f.put('material.txt', 'staged material change'); f.git('add', f.before.kitPath === '.' ? 'material.txt' : `${f.before.kitPath}/material.txt`);
  const status = f.git('status', '--porcelain=v1'), diff = f.git('diff', '--cached', '--binary');
  const result = await inspect(f.input());
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  assert.equal(f.git('status', '--porcelain=v1'), status); assert.equal(f.git('diff', '--cached', '--binary'), diff);
  assert.equal(f.read('subjects/registry.yaml'), 'uncommitted invalid registry');
});

test('wrong actual tree, kit selection and original pair cannot be repaired', async t => {
  const f = subjectReconsiderationCoreFixture(t);
  for (const input of [f.input({ candidate: { ...f.candidate, tree: f.before.tree } }),
    f.input({ before: { ...f.before, kitPath: 'unknown-knowledge' } }),
    f.input({ evidence: { ...f.evidence, assessmentCaptures: [] } }),
    f.input({ evidence: { ...f.evidence, assessmentCaptures: [f.beforeCaptures, f.beforeCaptures] } })]) {
    const result = await inspect(input); assert.equal(result.ok, false); assert.equal(result.allocation, null);
  }
});

test('native sole-Subject plan rejects extra K allocation and preserves native admission resources', async t => {
  const f = subjectReconsiderationCoreFixture(t);
  const identity = structuredClone(f.candidateIdentity);
  identity.allocations.push({ kind: 'knowledge', id: 'K-000003', state: 'allocated', publication: identity.allocations[0].publication });
  f.put('_identity.yaml', identity);
  const candidate = f.commit('forbidden other native allocation');
  const result = await inspect(f.input({ candidate }));
  assert.equal(result.ok, false); assert.equal(result.allocation, null);
  assert.ok(result.resources.allocation); assert.ok(result.diagnostics.some(row => /allocation/.test(row.code)));
  const limits = structuredClone(f.limits); limits.allocation.maxLedgerRows = 0;
  const bounded = await inspect(f.input({ limits }));
  assert.equal(bounded.ok, false); assert.ok(bounded.resources.allocation.failure);
});

for (const change of ['owner', 'empty-event', 'mode', 'registry-metadata']) {
  test(`actual ${change} mutation refuses fixed preservation`, async t => {
    const f = subjectReconsiderationCoreFixture(t);
    if (change === 'owner') f.put('knowledge/K-000001.md', f.read('knowledge/K-000001.md').replace('"subjects":[]', '"subjects":["S-000001"]'));
    if (change === 'empty-event') f.put('subjects/empty-event.json', '{}');
    if (change === 'mode') f.git('update-index', '--chmod=+x', f.files.identity);
    if (change === 'registry-metadata') {
      const document = structuredClone(f.candidateDocument); document.edition = 'unrelated';
      f.put('subjects/registry.yaml', wire(document));
    }
    let candidate;
    if (change === 'mode') {
      f.git('commit', '-qm', 'changed authority mode');
      candidate = { ...f.candidate, commit: f.git('rev-parse', 'HEAD'), tree: f.git('rev-parse', 'HEAD^{tree}') };
    } else candidate = f.commit(`forbidden ${change} delta`);
    const result = await inspect(f.input({ candidate }));
    assert.equal(result.ok, false, JSON.stringify(result));
  });
}

test('closure rows and bytes are exact admitted proof sums, excluding framing', async t => {
  const f = subjectReconsiderationCoreFixture(t), positive = await inspect(f.input());
  assert.equal(positive.ok, true, JSON.stringify(positive.diagnostics));
  const rows = [positive.inputs, positive.operation, positive.registry, positive.allocation, positive.assessment, positive.decision,
    ...positive.sourceMembership.rows, positive.ownerPreservation.changedPaths, ...positive.ownerPreservation.records,
    ...positive.ownerPreservation.unavailable, ...positive.ownerPreservation.unknownAssignments];
  const expected = { rows: rows.length, bytes: rows.reduce((sum, row) => sum + canonicalJsonBytes(row).length, 0) };
  assert.deepEqual(positive.resources.closure.used, expected);
  const limits = structuredClone(f.limits); limits.closure = { maxRows: expected.rows, maxBytes: expected.bytes };
  assert.equal((await inspect(f.input({ limits }))).ok, true);
  for (const field of ['maxRows', 'maxBytes']) {
    const short = structuredClone(limits); short.closure[field] -= 1;
    const result = await inspect(f.input({ limits: short }));
    assert.equal(result.ok, false); assert.equal(result.resources.closure.failure.limit, field);
  }
});

test('snapshot cleanup failure after complete proof revokes success and removes temporary roots', async t => {
  const f = subjectReconsiderationCoreFixture(t), create = fs.mkdtempSync, remove = fs.rmSync;
  const roots = []; let injected = false;
  fs.mkdtempSync = (...args) => { const root = create(...args); if (String(args[0]).includes('unknown-knowledge-tree-')) roots.push(root); return root; };
  fs.rmSync = (path, options) => { remove(path, options); if (!injected && roots.length === 2 && path === roots[1]) {
    injected = true; throw new Error('one-shot core cleanup fault');
  } };
  syncBuiltinESMExports(); let result;
  try { result = await inspect(f.input()); }
  finally { fs.mkdtempSync = create; fs.rmSync = remove; syncBuiltinESMExports(); }
  assert.equal(injected, true); assert.equal(result.ownerPreservation.status, 'passed');
  assert.equal(result.ok, false); assert.equal(result.publicationReady, false);
  assert.ok(result.diagnostics.some(row => row.message.includes('snapshot cleanup failed')));
  for (const root of roots) assert.equal(fs.existsSync(root), false);
});

test('caller mutation when snapshot materialization begins cannot change admitted proof', async t => {
  const f = subjectReconsiderationCoreFixture(t), input = f.input(), create = fs.mkdtempSync;
  let injected = false;
  fs.mkdtempSync = (...args) => {
    if (!injected && String(args[0]).includes('unknown-knowledge-tree-')) {
      injected = true;
      for (const capture of captured(input)) { capture.bytes.fill(0); capture.capture.file = 'mutation'; }
      input.operation.subject = 'S-000099';
    }
    return create(...args);
  };
  syncBuiltinESMExports(); let result;
  try { result = await inspect(input); }
  finally { fs.mkdtempSync = create; syncBuiltinESMExports(); }
  assert.equal(injected, true); assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  assert.equal(result.operation.subject, 'S-000001');
});

test('zero-byte raw rows still require population admission before locators', t => {
  const f = subjectReconsiderationCoreFixture(t), input = f.input();
  input.evidence.decisionCaptures = []; input.evidence.assessmentCaptures = [];
  let reads = 0;
  input.evidence.materialCaptures = Array.from({ length: 30 }, () => ({
    get capture() { reads += 1; throw new Error('do not inspect rows'); }, bytes: Buffer.alloc(0), objectFormat: 'sha1' }));
  const allowance = createSubjectValidationBudget({ ...f.limits.governance, maxValidationSteps: 10 });
  const result = admitSubjectReconsiderationInput(input, { operationBudget: allowance });
  assert.equal(result.ok, false); assert.equal(reads, 0);
  assert.equal(allowance.failure.phase, 'reconsideration-input-capture-rows');
});

test('admission refuses a Buffer own length getter without executing it', t => {
  const f = subjectReconsiderationCoreFixture(t);
  const input = f.input();
  const bytes = input.evidence.decisionCaptures[0].bytes;
  const length = bytes.length;
  let reads = 0;
  Object.defineProperty(bytes, 'length', { get() { reads += 1; return length; } });
  const result = admitSubjectReconsiderationInput(input, { operationBudget: createSubjectValidationBudget(f.limits.governance) });
  assert.equal(reads, 0, 'raw Buffer metadata must not execute');
  assert.equal(result.ok, false);
});

test('fixed-width input hashes refuse a trailing newline replacing a hex digit', t => {
  const f = subjectReconsiderationCoreFixture(t);
  for (const field of ['commit', 'tree']) {
    const input = f.input({ before: { ...f.before, [field]: f.before[field].slice(0, -1) + '\n' } });
    const result = admitSubjectReconsiderationInput(input, { operationBudget: createSubjectValidationBudget(f.limits.governance) });
    assert.equal(result.ok, false, `strict ${field} admission`);
  }
});

test('actual deprecated owner value warnings preserve the ordinary nonblocking policy', async t => {
  const f = subjectReconsiderationCoreFixture(t, { beforeChange({ read, put }) {
    const doc = JSON.parse(read('ontology/classes/owners.yaml'));
    doc.entries[0].status = 'deprecated';
    doc.entries[0]['source-of-truth'] = ['src/values.txt'];
    doc.entries[0].enumerates = [{ kind: 'test-lines', source: 'src/values.txt', values: ['original'] }];
    put('src/values.txt', 'original\nextra\n'); put('ontology/classes/owners.yaml', doc);
  } });
  const control = validateValues(f.beforeModel, null, f.repoRoot);
  assert.equal(control.hardErrors.length, 0);
  assert.ok(control.findings.length > 0);
  assert.ok(control.findings.every(row => row.severity === 'warning'));
  assert.deepEqual(runChecks(f.beforeModel, f.repoRoot).filter(row => row.severity === 'error'), []);
  const result = await inspect(f.input());
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
});

for (const state of ['allocated', 'retired', 'cancelled']) {
  for (const declared of [false, true]) {
    test(`unloaded ${state} occupancy ${declared ? 'with pending declaration refuses' : 'without declaration is preserved'}`, async t => {
      const f = subjectReconsiderationCoreFixture(t, { beforeChange({ read, put, beforeIdentity }) {
        beforeIdentity.allocations.push({ kind: 'knowledge', id: 'K-000003', state,
          publication: beforeIdentity.allocations[0].publication, ...(state === 'allocated' ? {} : { reason: 'Prior removal' }) });
        if (declared) {
          const catalog = JSON.parse(read('knowledge/_catalog.yaml'));
          catalog.entries.push({ id: 'K-000003', title: 'Missing declared leaf', file: 'pending-import' });
          put('knowledge/_catalog.yaml', catalog);
        }
      } });
      assert.equal(f.beforeModel.ok, true);
      assert.deepEqual(runChecks(f.beforeModel, f.repoRoot).filter(row => row.severity === 'error'), []);
      const result = await inspect(f.input());
      assert.equal(result.ok, !declared, JSON.stringify(result.diagnostics));
      if (!declared) {
        assert.ok(result.ownerPreservation.unavailable.some(row => row.ref.id === 'K-000003'
          && row.resolution === (state === 'allocated' ? 'missing' : 'retired')));
        assert.equal(result.ownerPreservation.records.some(row => row.ref?.id === 'K-000003'), false);
      } else assert.ok(result.diagnostics.some(row => row.code === 'reconsideration-owner-coverage'));
    });
  }
}

test('pending missing proposal declaration is already refused by the actual loader', async t => {
  const f = subjectReconsiderationCoreFixture(t);
  const input = rebindOriginalPair(f, () => {
    const catalog = JSON.parse(f.read('knowledge/_catalog.yaml'));
    catalog.entries.push({ id: 'proposal:knowledge:a2000000-0000-4000-8000-000000000090', title: 'Pending proposal', file: 'pending-import' });
    f.put('knowledge/_catalog.yaml', catalog);
  });
  const result = await inspect(input);
  assert.equal(result.ok, false);
  assert.ok(result.diagnostics.some(row => row.code === 'reconsideration-model-unavailable'));
  assert.equal(result.allocation, null, 'No claim that catalog census was reached.');
});

test('stored proposal and inactive records remain in complete owner preservation', async t => {
  const id = 'proposal:knowledge:a2000000-0000-4000-8000-000000000090';
  const f = subjectReconsiderationCoreFixture(t, { archivedPrior: true, beforeChange({ read, put }) {
    const catalog = JSON.parse(read('knowledge/_catalog.yaml'));
    catalog.entries.push({ id, title: 'Actual proposal', file: 'draft.md' });
    put('knowledge/_catalog.yaml', catalog);
    const stages = JSON.parse(read('knowledge/_registries/stage.yaml'));
    stages.values.push({ ...stages.values[0], value: 'draft' }); put('knowledge/_registries/stage.yaml', stages);
    put('knowledge/draft.md', `---\n${JSON.stringify({ 'schema-version': 3, id, heading: 'Draft', domain: 'world', subjects: [],
      facets: { stage: 'draft' }, citations: [{ source: 'Retained' }] })}\n---\nDraft body.\n`);
  } });
  const result = await inspect(f.input());
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  const proposal = result.ownerPreservation.records.find(row => row.proposalRef?.key === id);
  assert.equal(proposal.lifecycle.state, 'unpublished'); assert.deepEqual(proposal.assignments, { state: 'known', ids: [] });
  assert.equal(result.ownerPreservation.records.find(row => row.ref?.id === 'D-000002').lifecycle.state, 'non-effective');
});

for (const subjects of [null, ['S-000001', 'S-000001'], ['invalid'], ['S-000001']]) {
  test(`unchanged malformed or fresh assignment ${JSON.stringify(subjects)} is never an empty owner`, async t => {
    const f = subjectReconsiderationCoreFixture(t);
    const input = rebindOriginalPair(f, () => f.put('knowledge/K-000001.md',
      f.read('knowledge/K-000001.md').replace('"subjects":[]', `"subjects":${JSON.stringify(subjects)}`)));
    const result = await inspect(input);
    assert.equal(result.ok, false);
    assert.ok(result.diagnostics.some(row => ['reconsideration-model-unavailable', 'reconsideration-fresh-subject-assigned',
      'reconsideration-owner-assignments', 'reconsideration-owner-structure'].includes(row.code)), JSON.stringify(result.diagnostics));
  });
}

test('error-severity value drift still refuses after complete stored owner census', async t => {
  const f = subjectReconsiderationCoreFixture(t, { beforeChange({ read, put }) {
    const doc = JSON.parse(read('ontology/classes/owners.yaml'));
    doc.entries[0]['source-of-truth'] = ['src/values.txt'];
    doc.entries[0].enumerates = [{ kind: 'test-lines', source: 'src/values.txt', values: ['original'] }];
    put('src/values.txt', 'original\nextra\n'); put('ontology/classes/owners.yaml', doc);
  } });
  assert.ok(validateValues(f.beforeModel, null, f.repoRoot).findings.some(row => row.severity === 'error'));
  const result = await inspect(f.input());
  assert.equal(result.ownerPreservation.status, 'passed'); assert.equal(result.ok, false);
  assert.ok(result.diagnostics.some(row => row.code === 'reconsideration-structure-or-values'));
});

test('actual literal Git pair has healthy model proof and exactly two changed files', t => {
  const f = subjectReconsiderationCoreFixture(t);
  const result = validateSubjectReconsiderationCreation({ beforeModel: f.beforeModel, candidateModel: f.candidateModel,
    beforeCaptures: f.beforeCaptures, decisionCaptures: f.evidence.decisionCaptures, materialCaptures: f.evidence.materialCaptures,
    operation: { id: f.operation.id, proposal: f.operation.proposal, subject: f.operation.subject, registryEvent: f.operation.registryEvent },
    allocationLimits: f.limits.allocation, budget: f.limits.governance });
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  assert.deepEqual(result.allocation.ids, ['S-000001']);
  assert.deepEqual(changedTreePaths(f.repoRoot, f.before.tree, f.candidate.tree).sort(), [f.files.identity, f.files.registry].sort());
});

test('fixed actual-Git core proves the literal zero-assignment reconsideration', async t => {
  const f = subjectReconsiderationCoreFixture(t);
  const { inspectSubjectReconsiderationCore } = await import('../payload/engine/lib/subject-reconsideration-core.js');
  const result = await inspectSubjectReconsiderationCore(f.input());
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  assert.equal(result.publicationReady, false);
  assert.equal(result.assignments, null);
  assert.deepEqual(result.allocation.proof.ids, ['S-000001']);
});
