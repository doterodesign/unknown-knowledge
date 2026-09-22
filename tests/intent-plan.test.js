import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateIntentPlan } from '../payload/engine/lib/intent-plan.js';

// Source-first development example: a request about red's perceptual effect
// in an unspecified country. Culture is not an explicit requirement.
function plan() {
  return {
    version: 1, inputRef: 'synthetic:red-perception', inventoryStatus: 'declared-complete',
    units: [
      { key: 'red', sourceRef: 'request:red', disposition: 'mapped' },
      { key: 'effect', sourceRef: 'request:effect', disposition: 'mapped' },
      { key: 'country', sourceRef: 'request:country', disposition: 'unresolved' },
    ],
    bindings: [{ key: 'color', unitKeys: ['red'], target: { kind: 'subject', id: 'S-000001' },
      label: 'Color', basis: 'label', sourceRef: 'lookup:color' }],
    constraints: [{ key: 'color-filter', unitKeys: ['red'], origin: 'explicit',
      bindingKeys: ['color'], queryRefs: [{ branch: 'strict', path: '/where' }], requirementKeys: ['red-source'] }],
    requirements: [
      { key: 'red-source', unitKeys: ['red'], description: 'Source addresses red, not another color.' },
      { key: 'effect-source', unitKeys: ['effect'], description: 'Source supports perceptual effect and its direction.' },
      { key: 'country-source', unitKeys: ['country'], description: 'Keep country-specific source limits; no regional generalization.' },
    ],
    branches: [{ key: 'strict', unitKeys: ['red'], kind: 'strict',
      query: { version: 1, where: { op: 'assigned', subject: 'S-000001' } }, assumptions: [], relaxes: [] }],
    clarifications: [{ key: 'which-country', unitKeys: ['country'], prompt: 'Which country is intended?' }],
  };
}

test('a mapped material unit cannot disappear from the query/evidence handoff', () => {
  const p = plan();
  p.requirements = p.requirements.filter((r) => r.key !== 'effect-source');
  const result = validateIntentPlan(p);
  assert.equal(result.valid, false);
  assert.ok(result.diagnostics.some((d) => d.code === 'uncovered-unit' && d.path === '/units/1'));
  assert.equal(result.handoff, null);
});

test('valid handoff preserves residual requirements, uncertainty and query limitations without mutation', () => {
  const p = plan();
  const before = structuredClone(p);
  const result = validateIntentPlan(p);
  assert.equal(result.valid, true);
  assert.equal(result.validationScope, 'declared-inventory-only');
  assert.equal(result.queryValidation, 'not-run');
  assert.equal(result.targetValidation, 'not-run');
  assert.equal(result.readiness, 'unresolved-intent');
  assert.deepEqual(result.handoff.requirements, before.requirements);
  assert.deepEqual(result.handoff.units, before.units);
  assert.deepEqual(p, before);
  result.handoff.requirements[0].description = 'changed output';
  assert.deepEqual(p, before, 'handoff cannot mutate the accepted input');
  assert.deepEqual(validateIntentPlan(p), validateIntentPlan(p));
});

test('open inventory remains open, and absent/empty inventory never passes', () => {
  const p = plan();
  p.inventoryStatus = 'open';
  assert.equal(validateIntentPlan(p).readiness, 'inventory-open');
  for (const units of [undefined, []]) {
    p.units = units;
    assert.equal(validateIntentPlan(p).valid, false);
  }
});

test('a candidate binding alone does not discharge mapped intent', () => {
  const p = plan();
  p.constraints = [];
  p.requirements = p.requirements.filter((r) => r.key !== 'red-source');
  assert.equal(validateIntentPlan(p).valid, false);
});

test('unresolved intent must reach clarification, alternative or evidence review', () => {
  const p = plan();
  p.clarifications = [];
  p.requirements = p.requirements.filter((r) => r.key !== 'country-source');
  assert.equal(validateIntentPlan(p).valid, false);
  p.branches.push({ key: 'country-alternative', unitKeys: ['country'], kind: 'alternative',
    query: { where: { op: 'all' } }, assumptions: ['Country remains unspecified; inspect country-limited sources.'], relaxes: [] });
  assert.equal(validateIntentPlan(p).valid, true);
  assert.equal(validateIntentPlan(p).readiness, 'unresolved-intent');
});

test('query references use exact branch-qualified JSON Pointers and own properties', () => {
  const p = plan();
  p.branches[0].query = JSON.parse('{"a/b":{"~key":[{"value":1}]}}');
  p.constraints[0].queryRefs[0].path = '/a~1b/~0key/0/value';
  assert.equal(validateIntentPlan(p).valid, true);
  for (const path of ['/missing', '/__proto__', '/a~2b', '/a~1b/~0key/01', '/a~1b/~0key/length']) {
    p.constraints[0].queryRefs[0].path = path;
    assert.equal(validateIntentPlan(p).valid, false, path);
  }
  p.constraints[0].queryRefs[0] = { branch: 'missing', path: '' };
  assert.equal(validateIntentPlan(p).valid, false);
});

test('recovery retains relaxed units and constraints, separate from strict branch', () => {
  const p = plan();
  p.branches.push({ key: 'broad', unitKeys: ['red'], kind: 'recovery', baseBranch: 'strict',
    query: { where: { op: 'all' } }, assumptions: ['Broader discovery only; red evidence still required.'], relaxes: ['color-filter'] });
  const result = validateIntentPlan(p);
  assert.equal(result.valid, true);
  assert.deepEqual(result.handoff.branches[1].relaxes, ['color-filter']);
  assert.deepEqual(result.handoff.requirements, p.requirements);
  for (const patch of [{ relaxes: [] }, { baseBranch: 'broad' }, { unitKeys: ['effect'] }, { relaxes: ['nonexistent'] }, { assumptions: [] }]) {
    const bad = structuredClone(p);
    Object.assign(bad.branches[1], patch);
    assert.equal(validateIntentPlan(bad).valid, false, JSON.stringify(patch));
  }
});

test('malformed shapes, orphan references and disguised grammatical intent refuse', () => {
  const mutations = [
    (p) => { p.version = 2; },
    (p) => { p.rawQuestion = 'not part of this contract'; },
    (p) => { p.units[0].disposition = 'grammatical'; },
    (p) => { p.units[1].key = 'red'; },
    (p) => { p.constraints[0].origin = 'certain'; },
    (p) => { p.constraints[0].bindingKeys = ['missing']; },
    (p) => { p.constraints[0].queryRefs = []; p.constraints[0].requirementKeys = []; },
    (p) => { p.constraints[0].requirementKeys = ['effect-source']; },
    (p) => { p.requirements[0].unitKeys = ['red', 'red']; },
    (p) => { p.branches[0].relaxes = ['color-filter']; },
    (p) => { p.branches.push({ ...p.branches[0], key: 'second-strict' }); },
  ];
  for (const mutate of mutations) {
    const p = plan(); mutate(p);
    assert.equal(validateIntentPlan(p).valid, false, mutate.toString());
  }
});

test('structural readiness does not claim opaque query or target support', () => {
  const p = plan();
  p.units[2].disposition = 'mapped';
  p.clarifications = [];
  p.branches[0].query.where = { op: 'future-unsupported-operation' };
  p.bindings[0].target = { unknownTargetShape: 'not resolved by this slice' };
  const result = validateIntentPlan(p);
  assert.equal(result.valid, true);
  assert.equal(result.readiness, 'ready-for-query-validation');
  assert.equal(result.queryValidation, 'not-run');
  assert.equal(result.targetValidation, 'not-run');
});

test('non-JSON, cyclic and sparse input refuses without executing getters', () => {
  for (const value of [null, [], 2, 'plan']) assert.equal(validateIntentPlan(value).valid, false);
  const p = plan();
  p.branches[0].query.self = p;
  assert.equal(validateIntentPlan(p).valid, false);
  const getter = plan();
  Object.defineProperty(getter, 'unexpected', { enumerable: true, get() { throw new Error('must not execute'); } });
  assert.equal(validateIntentPlan(getter).valid, false);
  const sparse = plan();
  sparse.branches[0].query = { args: new Array(2) };
  sparse.constraints[0].queryRefs[0].path = '';
  assert.equal(validateIntentPlan(sparse).valid, false);
});

test('diagnostic paths escape literal slash and tilde field names as JSON Pointer segments', () => {
  const p = plan();
  p.units[0]['a/b~c'] = 'unknown';
  const result = validateIntentPlan(p);
  assert.equal(result.valid, false);
  assert.deepEqual(result.diagnostics.map((d) => [d.code, d.path]), [
    ['unknown-field', '/units/0/a~1b~0c'],
  ]);
  const root = plan();
  root['~/'] = 'unknown';
  assert.equal(validateIntentPlan(root).diagnostics[0].path, '/~0~1');
});
