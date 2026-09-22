import { test } from 'node:test';
import assert from 'node:assert/strict';
import { typedPromotionGateFixture } from './helpers/typed-promotion-gate-fixture.js';
import { runPreparedRecordPromotionGate } from '../payload/engine/lib/assignment-gate.js';
import { recordPromotionInputWire } from '../payload/engine/lib/record-promotion-input.js';
import { canonicalSha256 } from '../payload/engine/lib/canonical-json.js';

const fixture = (t, options = {}) => {
  const f = typedPromotionGateFixture(t, { ...options, kind: 'knowledge' });
  f.input.kind = 'knowledge';
  return f;
};
const detail = (r) => JSON.stringify({ checks: r.checks, diagnostics: r.diagnostics,
  assignment: r.assignment?.diagnostics, preflight: r.preflight, impacts: r.impacts?.diagnostics });

for (const format of ['sha1', 'sha256']) test(`actual ${format} Knowledge promotion proves verified leaves and classified genesis without Ontology`, async (t) => {
  const f = fixture(t, { format, nested: format === 'sha256' });
  const result = await runPreparedRecordPromotionGate(f.input);
  assert.equal(result.ok, true, detail(result));
  assert.equal(result.recordKind, 'knowledge');
  assert.equal(result.publicationReady, false);
  assert.equal(result.capabilities.before.ontology, false);
  assert.equal(result.capabilities.before.assignmentHistory, true);
  assert.equal(result.assignment.checks.humanApproval.status, 'not-performed');
  assert.equal(result.preflight.recordKind, 'knowledge');
  assert.equal(result.preflight.result.payload.mode, 'leaves');
  assert.deepEqual(result.preflight.result.payload.verdicts, []);
  const leaves = result.preflight.result.payload['leaf-verdicts'];
  assert.deepEqual(leaves.map(row => row.leaf).sort(), f.rows.map(row => row.canonicalRef.id).sort());
  assert.ok(leaves.every(row => row.stage === 'verified' && row.verdict === 'trusted' && row.time.verdict === 'trusted'));
  assert.equal(result.impacts.representativeReplays.status, 'complete');
  assert.equal(result.impacts.representativeReplays.resources.inventory.requiredCases, 144);
  assert.equal(result.impacts.reach.status, 'incomplete');
  assert.equal(result.impacts.unknownOwners.created.length, 1);
  assert.ok(result.impacts.unknownOwners.retained.some(({ ref }) => ref.kind === 'knowledge'));
  assert.equal(result.inputDigest, canonicalSha256(recordPromotionInputWire(f.input)));
  assert.deepEqual(result.promotion.createdRefs, f.rows.map(row => row.canonicalRef));
});

test('Knowledge without Subject authority still requires actual selected leaf preflight and canonical genesis', async (t) => {
  const f = fixture(t, { subjectAuthority: false, history: false });
  const result = await runPreparedRecordPromotionGate(f.input);
  assert.equal(result.ok, true, detail(result));
  assert.deepEqual(result.impacts.applicability, { kind: 'subject-registry-absent-both' });
  assert.deepEqual(result.impacts.required, []);
  assert.equal(result.preflight.result.payload.counts.trusted, 3);
  assert.equal(result.assignment.ok, true);
});

test('Knowledge gate refuses stale preserved evidence through actual selected preflight', async (t) => {
  const f = fixture(t, { verified: '2020-01-01' });
  const result = await runPreparedRecordPromotionGate(f.input);
  assert.equal(result.ok, false, detail(result));
  assert.equal(result.checks.preflight.status, 'failed', detail(result));
  assert.equal(result.preflight.result.payload.counts.stale, 3);
  assert.equal(result.impacts.representativeReplays, null);
});

test('Knowledge promotion preserves the existing static freshness exemption without refreshing the verification date', async (t) => {
  const f = fixture(t, { verified: '2020-01-01', volatility: 'static' });
  const result = await runPreparedRecordPromotionGate(f.input);
  assert.equal(result.ok, true, detail(result));
  assert.ok(result.preflight.result.payload['leaf-verdicts'].every(row => row.verdict === 'trusted'));
  assert.ok(result.preflight.result.payload['leaf-verdicts'].every(row => row.time.verdict === 'trusted'));
  assert.ok(result.preflight.result.payload['time-check'].startsWith(`checked against --today ${f.today} `));
  for (const source of f.sources) assert.match(f.read(source.file), /verified: "2020-01-01"/);
});

test('Knowledge authority vocabulary must load before the proposal source can pass structural checks', async (t) => {
  const f = fixture(t, { authorityRegistry: false });
  const result = await runPreparedRecordPromotionGate(f.input);
  assert.equal(result.ok, false, detail(result));
  assert.equal(result.checks.models.status, 'failed', detail(result));
  const source = result.assignment.diagnostics.find(row => row.code === 'assignment-structural-defects');
  assert.equal(source.side, 'before');
  assert.deepEqual(source.diagnostics.filter(row => row.code === 'missing-registry' && row.path === 'citations[0].authority')
    .map(row => row.id).sort(), f.rows.map(row => row.proposalRef.key).sort());
  assert.equal(result.preflight.result, null);
  assert.equal(result.impacts.representativeReplays, null);
});

test('Knowledge promotion cannot refresh citation dates or evidence in the identity/lifecycle transformation', async (t) => {
  const f = fixture(t);
  const file = f.sources[0].file;
  f.put(file, f.read(file).replace('Observed fixture source', 'Unreviewed replacement source'));
  f.save();
  const result = await runPreparedRecordPromotionGate(f.input);
  assert.equal(result.ok, false, detail(result));
  assert.equal(result.assignment.checks.preservation.status, 'failed', detail(result));
  assert.equal(result.preflight.result, null);
});

test('Knowledge genesis treats unchanged proposal Subject IDs as strict new assignments', async (t) => {
  const f = fixture(t, { retiredSubject: true });
  const result = await runPreparedRecordPromotionGate(f.input);
  assert.equal(result.ok, false, detail(result));
  assert.equal(result.assignment.checks.eligibility.status, 'failed', detail(result));
  assert.equal(result.impacts.representativeReplays, null);
});
