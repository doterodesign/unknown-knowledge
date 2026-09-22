import { test } from 'node:test';
import assert from 'node:assert/strict';
import { indexSubjects, resolveSubject } from '../payload/engine/lib/subjects.js';

const namespace = '12345678-1234-4234-8234-123456789abc';
const proposal = `proposal:subject:${namespace}`;
const subject = (id, status = 'active', extra = {}) => ({ id, label: id,
  definition: { text: `Meaning of ${id}`, includes: [], excludes: [] },
  aliases: [], related: [], status, ...extra });
const registry = (...subjects) => indexSubjects({ schemaVersion: 1, namespace,
  revision: 0, hierarchyRevision: 0, subjects }).registry;

test('current resolution distinguishes active, proposed, suppressed and retired meanings', () => {
  const captured = registry(subject('S-000001'), subject(proposal, 'proposed'),
    subject('S-000002', 'suppressed'), subject('S-000003', 'retired'));
  const active = resolveSubject(captured, 'S-000001');
  assert.equal(active.status, 'resolved');
  assert.equal(active.id, 'S-000001');
  assert.equal(active.requestedId, active.id);
  assert.equal(active.policy, 'current');
  assert.deepEqual(active.redirects, []);
  for (const [id, code] of [[proposal, 'subject-proposed'], ['S-000002', 'subject-suppressed'],
    ['S-000003', 'subject-retired']]) {
    const result = resolveSubject(captured, id);
    assert.equal(result.status, 'unresolved');
    assert.equal(result.code, code);
    assert.equal(result.subject.id, id);
    assert.deepEqual(result.alternatives, []);
  }
});

test('historical resolution inspects original captured metadata without changing its declared state', () => {
  const captured = registry(subject('S-000001', 'retired'));
  const result = resolveSubject(captured, 'S-000001', { policy: 'historical' });
  assert.equal(result.status, 'resolved');
  assert.equal(result.id, 'S-000001');
  assert.equal(result.subject.status, 'retired');
  assert.deepEqual(result.redirects, []);
});

test('invalid and unknown identities and options remain typed failures', () => {
  const captured = registry(subject('S-000001'));
  assert.throws(() => resolveSubject(null, 'S-000001'), { code: 'subjects-unavailable' });
  assert.throws(() => resolveSubject(captured, ' S-000001'), { code: 'invalid-subject-id' });
  assert.throws(() => resolveSubject(captured, 'S-000009'), { code: 'unknown-subject' });
  for (const options of [null, { policy: 'latest' }, { asOf: 'yesterday' }]) {
    assert.throws(() => resolveSubject(captured, 'S-000001', options), { code: 'invalid-options' });
  }
});

test('equivalent policy follows explicit redirects and preserves every step', () => {
  const captured = registry(subject('S-000001', 'retired', {
    retirement: { kind: 'equivalent-merge', redirect: 'S-000002' },
  }), subject('S-000002', 'retired', {
    retirement: { kind: 'equivalent-merge', redirect: 'S-000003' },
  }), subject('S-000003'));
  assert.equal(resolveSubject(captured, 'S-000001').code, 'subject-retired');
  assert.equal(resolveSubject(captured, 'S-000001', { policy: 'historical' }).id, 'S-000001');
  const result = resolveSubject(captured, 'S-000001', { policy: 'equivalent' });
  assert.equal(result.status, 'resolved');
  assert.equal(result.requestedId, 'S-000001');
  assert.equal(result.id, 'S-000003');
  assert.equal(result.subject.id, 'S-000003');
  assert.deepEqual(result.redirects, [{ from: 'S-000001', to: 'S-000002' },
    { from: 'S-000002', to: 'S-000003' }]);
  const partial = resolveSubject(captured, 'S-000001', { policy: 'equivalent', budget: { redirects: 1 } });
  assert.equal(partial.status, 'unresolved');
  assert.equal(partial.code, 'redirect-budget');
  assert.deepEqual(partial.redirects, [{ from: 'S-000001', to: 'S-000002' }]);
  assert.equal(resolveSubject(captured, 'S-000001', { policy: 'equivalent', budget: { redirects: 2 } }).status,
    'resolved', 'exactly exhausted successful traversal is complete');
});

test('split alternatives remain unresolved and never become implicit membership', () => {
  const captured = registry(subject('S-000001', 'retired', {
    retirement: { kind: 'split', successors: ['S-000003', 'S-000002'] },
  }), subject('S-000002'), subject('S-000003'));
  for (const policy of ['current', 'equivalent']) {
    const result = resolveSubject(captured, 'S-000001', { policy });
    assert.equal(result.status, 'unresolved');
    assert.equal(result.code, 'subject-split');
    assert.deepEqual(result.alternatives, ['S-000002', 'S-000003']);
  }
});

test('corrupt redirects and malformed budgets are operation failures', () => {
  const retired = (id, redirect) => subject(id, 'retired', { retirement: { kind: 'equivalent-merge', redirect } });
  for (const [captured, code] of [
    [registry(retired('S-000001', 'S-000009')), 'unknown-subject'],
    [registry(retired('S-000001', 'S-000002'), retired('S-000002', 'S-000001')), 'redirect-cycle'],
    [registry(retired('S-000001', 's-000002')), 'invalid-retirement'],
  ]) {
    assert.throws(() => resolveSubject(captured, 'S-000001', { policy: 'equivalent' }), { code });
  }
  for (const budget of [null, {}, { redirects: -1 }, { redirects: 1.5 }, { redirects: 1, nodes: 2 }]) {
    assert.throws(() => resolveSubject(registry(subject('S-000001')), 'S-000001', { budget }), { code: 'invalid-budget' });
  }
});
