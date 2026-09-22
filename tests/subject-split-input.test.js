import test from 'node:test';
import assert from 'node:assert/strict';
import { splitInput, splitRef } from './helpers/subject-split-input-fixture.js';
import { admitSubjectLifecycleInput } from '../payload/engine/lib/subject-lifecycle-input.js';
import { canonicalSha256 } from '../payload/engine/lib/canonical-json.js';

// Dynamic import keeps the preimplementation failure an assertion at the new boundary.
async function admit(input) {
  const api = await import('../payload/engine/lib/subject-lifecycle-input.js');
  assert.equal(typeof api.admitSubjectSplitInput, 'function', 'The separate split admission boundary must exist');
  return api.admitSubjectSplitInput(input);
}

test('split admission binds ordered zero/one/several choices and explicit roots without claiming actual closure', async () => {
  for (const subset of [[], ['S-000005'], ['S-000004', 'S-000006']]) {
    const input = splitInput(); input.operation.mappings[0].successors = subset;
    const result = await admit(input);
    assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
    const { subjectLifecycleInputWire } = await import('../payload/engine/lib/subject-lifecycle-input.js');
    assert.equal(result.inputDigest, canonicalSha256(subjectLifecycleInputWire(input)));
    assert.equal((await admit({ ...input, repoRoot: '/another/checkout' })).inputDigest, result.inputDigest);
    assert.deepEqual(result.input.operation.mappings[0].successors, subset);
    input.operation.successorParents[0].reason = 'later mutation';
    input.evidence.decisionCaptures[0].bytes.fill(0);
    assert.equal(result.input.operation.successorParents[0].reason, 'Independent root');
    assert.equal(result.input.evidence.decisionCaptures[0].bytes.toString(), 'retained evidence');
    assert.equal(Object.hasOwn(result, 'publicationReady'), false);
  }
});

test('eventless shape is admitted only with empty mappings; actual zero scope remains a core obligation', async () => {
  const input = splitInput(); input.operation.assignmentEvent = null; input.operation.mappings = [];
  assert.equal((await admit(input)).ok, true);
});

test('fixed split module preserves the shared wire and all typed review collections', async () => {
  const { admitSubjectSplitInput, subjectSplitInputWire } = await import('../payload/engine/lib/subject-split-input.js');
  const input = splitInput();
  input.operation.mappings = [['decision', 'D-000001'], ['knowledge', 'K-000001'], ['ontology', 'O-000001']]
    .map(([kind, id]) => ({ ref: splitRef(kind, id), successors: [], reason: 'Explicit withdrawal' }));
  input.operation.retainedUnknowns = [{ proposalRef: { namespace: splitRef().namespace, kind: 'knowledge',
    key: 'proposal:knowledge:55555555-5555-4555-8555-555555555555' }, reason: 'Keep absence unknown' }];
  input.operation.retainedHistoricalUses = [{ ref: splitRef('ontology', 'O-000002'), reason: 'Retain inactive source evidence' }];
  input.operation.retainedParents = [{ child: 'S-000002', parent: 'S-000001', reason: 'Keep the old narrower meaning' }];
  const result = admitSubjectSplitInput(input);
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  assert.equal(result.inputDigest, canonicalSha256(subjectSplitInputWire(input)));
  assert.deepEqual(result.input.operation, input.operation);
  const prior = result.inputDigest;
  input.operation.successorParents[0].reason = 'A different reviewed root rationale';
  assert.notEqual(admitSubjectSplitInput(input).inputDigest, prior);
});

test('source-centric inherited reviews admit fresh assigned successors without caller dispositions', async () => {
  const input = splitInput(); input.operation.retainedInheritedUses = [
    { ref: splitRef(), assignedSubject: 'S-000004', reason: 'Explicitly review introduced source exposure' },
  ];
  assert.equal((await admit(input)).ok, true);
  input.operation.retainedInheritedUses[0].disposition = 'retained';
  assert.equal((await admit(input)).ok, false);
});

test('legacy fixed family entrypoint cannot select split', () => {
  assert.equal(admitSubjectLifecycleInput(splitInput(), 'split').ok, false);
});

for (const width of [40, 64]) for (const side of ['before', 'candidate']) {
  test(`split refuses a newline-ended ${width}-character ${side} tree ID`, async () => {
    const input = splitInput();
    input[side].commit = 'a'.repeat(width); input[side].tree = 'b'.repeat(width - 1) + '\n';
    assert.equal((await admit(input)).ok, false);
  });
}

for (const [name, edit] of [
  ['one successor', v => { v.operation.successors.pop(); v.operation.successors.pop(); }],
  ['duplicate successor', v => { v.operation.successors[1] = v.operation.successors[0]; }],
  ['source successor', v => { v.operation.successors[0] = v.operation.subject; }],
  ['zero subject', v => { v.operation.subject = 'S-000000'; }],
  ['missing registry event', v => { v.operation.registryEvents.pop(); }],
  ['extra registry event', v => { v.operation.registryEvents.push({ ...v.operation.registryEvents[0] }); }],
  ['duplicate event ID', v => { v.operation.registryEvents[1].id = v.operation.registryEvents[0].id; }],
  ['newline event digest', v => { v.operation.registryEvents[0].changeDigest += '\n'; }],
  ['newline commit', v => { v.before.commit += '\n'; }],
  ['mixed native format', v => { v.before.tree = 'a'.repeat(64); }],
  ['foreign subset', v => { v.operation.mappings[0].successors = ['S-000009']; }],
  ['reversed subset', v => { v.operation.mappings[0].successors.reverse(); }],
  ['duplicate subset', v => { v.operation.mappings[0].successors = ['S-000004', 'S-000004']; }],
  ['duplicate mapping', v => { v.operation.mappings.push(structuredClone(v.operation.mappings[0])); }],
  ['unordered mappings', v => { v.operation.mappings.unshift({ ref: splitRef('knowledge', 'K-000002'), successors: [], reason: 'Reviewed' }); }],
  ['mistyped owner ID', v => { v.operation.mappings[0].ref.kind = 'ontology'; }],
  ['blank mapping reason', v => { v.operation.mappings[0].reason = '  '; }],
  ['null event with mappings', v => { v.operation.assignmentEvent = null; }],
  ['event with no mappings', v => { v.operation.mappings = []; }],
  ['omitted root', v => { v.operation.successorParents.shift(); }],
  ['implicit root', v => { delete v.operation.successorParents[0].parent; }],
  ['unordered parent rows', v => { v.operation.successorParents.reverse(); }],
  ['source parent', v => { v.operation.successorParents[0].parent = v.operation.subject; }],
  ['self parent', v => { v.operation.successorParents[0].parent = 'S-000004'; }],
  ['blank parent reason', v => { v.operation.successorParents[0].reason = ''; }],
  ['missing allocation', v => { delete v.limits.allocation; }],
  ['negative allocation', v => { v.limits.allocation.maxLedgerRows = -1; }],
  ['unsafe allocation', v => { v.limits.allocation.maxSuccessors = Number.MAX_SAFE_INTEGER + 1; }],
  ['candidate artifact cap in owner input', v => { v.limits.maxIdentityBytes = 100; }],
  ['foreign impact', v => { v.impact.policy = 'plain-retirement-impact-v1'; }],
  ['caller allocation proof', v => { v.allocation = { ok: true }; }],
  ['caller operation authority', v => { v.operation.approved = true; }],
  ['sparse mappings', v => { v.operation.mappings.length = 2; }],
  ['symbol metadata', v => { v.operation[Symbol('extra')] = true; }],
  ['nonenumerable reason', v => { Object.defineProperty(v.operation.mappings[0], 'reason', { enumerable: false }); }],
]) test(`closed split admission refuses ${name}`, async () => {
  const input = splitInput(); edit(input); const result = await admit(input);
  assert.equal(result.ok, false); assert.equal(result.input, null); assert.equal(result.inputDigest, null);
  assert.equal(result.diagnostics[0].code, 'invalid-subject-split-input');
});

test('malformed own-data inputs refuse before executing nested accessors', async () => {
  for (const target of ['operation', 'mapping', 'capture', 'source']) {
    const input = splitInput(); let reads = 0;
    const capture = input.evidence.decisionCaptures[0].capture;
    capture.source = { commit: 'a'.repeat(40), tree: 'b'.repeat(40) };
    const [object, key] = target === 'operation' ? [input, 'operation']
      : target === 'mapping' ? [input.operation.mappings[0], 'ref']
        : target === 'capture' ? [capture, 'blob'] : [capture.source, 'commit'];
    Object.defineProperty(object, key, { enumerable: true, get() { reads++; throw new Error('must not execute'); } });
    assert.equal((await admit(input)).ok, false); assert.equal(reads, 0);
  }
});
