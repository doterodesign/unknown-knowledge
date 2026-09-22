import test from 'node:test';
import assert from 'node:assert/strict';
import { retirementInput } from './helpers/subject-retirement-input-fixture.js';
import { admitSubjectRetirementInput, subjectRetirementInputWire } from '../payload/engine/lib/subject-retirement-input.js';
import { canonicalSha256 } from '../payload/engine/lib/canonical-json.js';

const ref = (id) => ({ namespace: '11111111-1111-4111-8111-111111111111', kind: 'knowledge', id });

test('retirement admission binds both assignment branches and all reviewed retention intent without granting zero-use proof', () => {
  for (const eventless of [false, true]) {
    const input = retirementInput();
    if (eventless) input.operation.assignmentEvent = null;
    input.operation.retainedUnknowns = [{ ref: ref('K-000001'), reason: 'Retain classification uncertainty' }];
    input.operation.retainedHistoricalUses = [{ ref: ref('K-000002'), reason: 'Preserve inactive evidence' }];
    input.operation.retainedParents = [{ child: 'S-000002', parent: 'S-000001', reason: 'Preserve existing narrower meaning' }];
    input.operation.retainedInheritedUses = [{ ref: ref('K-000003'), assignedSubject: 'S-000002', reason: 'Retain descendant assignment' }];
    const admitted = admitSubjectRetirementInput(input);
    assert.equal(admitted.ok, true, JSON.stringify(admitted.diagnostics));
    assert.equal(admitted.inputDigest, canonicalSha256(subjectRetirementInputWire(input)));
    assert.equal(admitSubjectRetirementInput({ ...input, repoRoot: '/other/checkout' }).inputDigest, admitted.inputDigest);
    assert.equal(admitted.input.operation.assignmentEvent === null, eventless);
    input.operation.retainedParents[0].reason = 'Later mutation';
    input.evidence.decisionCaptures[0].bytes.fill(0);
    assert.equal(admitted.input.operation.retainedParents[0].reason, 'Preserve existing narrower meaning');
    assert.equal(admitted.input.evidence.decisionCaptures[0].bytes.toString(), 'retained evidence');
  }
});

for (const [name, change] of [
  ['foreign family fields', v => { v.operation.survivor = 'S-000002'; }],
  ['wrong action', v => { v.operation.action = 'merge-equivalent'; }],
  ['zero identity', v => { v.operation.subject = 'S-000000'; }],
  ['multiple registry events', v => { v.operation.registryEvents.push({ ...v.operation.registryEvents[0] }); }],
  ['missing assignment disposition', v => { delete v.operation.assignmentEvent; }],
  ['caller zero-use proof', v => { v.operation.zeroUse = true; }],
  ['missing closure capacity', v => { delete v.limits.closure.maxBytes; }],
  ['negative closure capacity', v => { v.limits.closure.maxRows = -1; }],
  ['unsafe closure capacity', v => { v.limits.closure.maxRows = Number.MAX_SAFE_INTEGER + 1; }],
  ['caller impact policy', v => { v.impact.policy = 'equivalent-merge-impact-v1'; }],
  ['caller route proof', v => { v.impact.routes.report = { ok: true }; }],
  ['unordered unknowns', v => { v.operation.retainedUnknowns = ['K-000002','K-000001'].map(id => ({ ref: ref(id), reason: 'Reviewed' })); }],
  ['duplicate history', v => { v.operation.retainedHistoricalUses = [1,2].map(() => ({ ref: ref('K-000001'), reason: 'Reviewed' })); }],
  ['proposal history', v => { v.operation.retainedHistoricalUses = [{ proposalRef: { namespace: ref('').namespace, kind: 'knowledge', key: 'proposal:knowledge:11111111-1111-4111-8111-111111111111' }, reason: 'Reviewed' }]; }],
  ['foreign parents', v => { v.operation.retainedParents = [{ child: 'S-000002', parent: 'S-000003', reason: 'Reviewed' }]; }],
  ['self parent', v => { v.operation.retainedParents = [{ child: 'S-000001', parent: 'S-000001', reason: 'Reviewed' }]; }],
  ['self inherited witness', v => { v.operation.retainedInheritedUses = [{ ref: ref('K-000001'), assignedSubject: 'S-000001', reason: 'Reviewed' }]; }],
  ['sparse retention', v => { v.operation.retainedParents.length = 1; }],
  ['empty rationale', v => { v.operation.retainedUnknowns = [{ ref: ref('K-000001'), reason: '  ' }]; }],
  ['extra ref property', v => { v.operation.retainedUnknowns = [{ ref: { ...ref('K-000001'), approved: true }, reason: 'Reviewed' }]; }],
]) test(`closed retirement admission refuses ${name}`, () => {
  const input = retirementInput(); change(input);
  const result = admitSubjectRetirementInput(input);
  assert.equal(result.ok, false); assert.equal(result.input, null); assert.equal(result.inputDigest, null);
  assert.equal(result.diagnostics[0].code, 'invalid-subject-retirement-input');
});
