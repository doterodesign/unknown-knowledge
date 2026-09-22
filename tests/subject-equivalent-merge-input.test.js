import test from 'node:test';
import assert from 'node:assert/strict';
import { admitEquivalentMergeInput } from '../payload/engine/lib/subject-equivalent-merge-input.js';
import { canonicalSha256 } from '../payload/engine/lib/canonical-json.js';
import { mergeInput } from './helpers/equivalent-merge-input-fixture.js';


test('admission detaches all intent/evidence and binds the exact existing wire representation', () => {
  const input = mergeInput(); const admitted = admitEquivalentMergeInput(input);
  assert.equal(admitted.ok, true, JSON.stringify(admitted.diagnostics));
  const { repoRoot, ...semantic } = input;
  const wire = { version: 1, ...semantic, evidence: { decisionCaptures: input.evidence.decisionCaptures.map(({ capture, bytes, objectFormat }) =>
    ({ capture, bytesBase64: bytes.toString('base64'), objectFormat })), assessmentCaptures: [] } };
  assert.equal(admitted.inputDigest, canonicalSha256(wire));
  assert.equal(admitEquivalentMergeInput({ ...input, repoRoot: '/another/checkout' }).inputDigest, admitted.inputDigest);
  input.operation.absorbed[0] = 'S-000003'; input.evidence.decisionCaptures[0].bytes.fill(0);
  assert.equal(admitted.input.operation.absorbed[0], 'S-000001');
  assert.equal(admitted.input.evidence.decisionCaptures[0].bytes.toString(), 'retained evidence');
  assert.ok(Buffer.isBuffer(admitted.input.evidence.decisionCaptures[0].bytes));
});

for (const [name, change] of [
  ['caller success flag', (v) => { v.ok = true; }],
  ['caller inventory', (v) => { v.impact.routes = { kind: 'captured-inventory', inventory: { version: 1, coverage: 'complete', routes: [] } }; }],
  ['null route', (v) => { v.impact.routes = null; }],
  ['mixed route', (v) => { v.impact.routes.inventory = []; }],
  ['omitted route', (v) => { delete v.impact.routes; }],
  ['null assignment', (v) => { v.operation.assignmentEvent = null; }],
  ['multiple sources', (v) => { v.operation.absorbed.push('S-000003'); }],
  ['same survivor', (v) => { v.operation.survivor = 'S-000001'; }],
  ['digest newline suffix', (v) => { v.operation.registryEvents[0].changeDigest += '\n'; }],
  ['missing capacity', (v) => { delete v.limits.inventory.maxRecordVisits; }],
  ['unused route capacity', (v) => { v.limits.routes = { version: 1, maxRoutes: 0 }; }],
  ['sparse capture array', (v) => { v.evidence.decisionCaptures.length += 1; }],
  ['duplicate unknown', (v) => { const row = { ref: { namespace: v.operation.id, kind: 'decision', id: 'D-000001' }, reason: 'Unclassified' };
    v.operation.retainedUnknowns = [row, structuredClone(row)]; }],
]) test(`closed merge admission refuses ${name}`, () => {
  const input = mergeInput(); change(input); const result = admitEquivalentMergeInput(input);
  assert.equal(result.ok, false); assert.equal(result.input, null); assert.equal(result.inputDigest, null);
});
