/** Actual committed retirement captures for replay tests; no assignment/publication proof. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { subjectQueryDiskFixture } from './subject-query-disk-fixture.js';
import { registryWire } from './equivalent-merge-fixture.js';
import { queryBudgets } from './subject-query-fixture.js';
import { canonicalSha256 } from '../../payload/engine/lib/canonical-json.js';
import { withTreeSnapshot } from '../../payload/engine/lib/commit-snapshot.js';
import { loadSubjectQueryContext } from '../../payload/engine/lib/subject-query-context.js';

export function retirementReplayFixture(t, { nested = false, descendants = false, unrelatedRetired = false,
  candidateActive = false, missingEvidence = false } = {}) {
  const f = subjectQueryDiskFixture(t, { nested, descendants });
  const kitPath = nested ? 'unknown-knowledge' : '.';
  const git = (...args) => {
    const result = spawnSync('/usr/bin/git', ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', '-C', f.root, ...args], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr); return result.stdout.trim();
  };
  const commit = (message) => {
    git('add', '.'); git('commit', '--allow-empty', '-qm', message);
    return { commit: git('rev-parse', 'HEAD'), tree: git('rev-parse', 'HEAD^{tree}'), kitPath };
  };
  const document = structuredClone(f.context.model.subjectRegistry.document);
  const retire = (subject, id) => {
    const index = document.subjects.findIndex((row) => row.id === subject);
    const { id: subjectId, changes, ...before } = document.subjects[index];
    const after = { ...structuredClone(before), status: 'retired', retirement: { kind: 'retire' } };
    const event = { id, action: 'retire', decision: document.history[0].decision,
      reason: 'Reviewed plain retirement fixture', rows: [{ id: subjectId, before, after }] };
    event.review = { ...document.history[0].review, changeDigest: canonicalSha256(event) };
    document.history.push(event); document.revision += 1;
    document.subjects[index] = { id: subjectId, ...after, changes: [...changes, id] };
    f.put('subjects/registry.yaml', registryWire(document));
  };
  const withdraw = (file) => {
    const parts = readFileSync(join(f.kitRoot, file), 'utf8').split('---\n');
    const record = JSON.parse(parts[1]);
    if (record.subjects) record.subjects = record.subjects.filter((id) => id !== 'S-000001');
    parts[1] = `${JSON.stringify(record)}\n`; f.put(file, parts.join('---\n'));
  };
  // Proposals remain out of this retirement's direct source-use scope.
  withdraw('knowledge/draft.md');
  if (unrelatedRetired) retire('S-000003', '44444444-4444-4444-8444-444444444444');
  git('init', '-q');
  const before = commit('actual before retirement');
  if (!candidateActive) retire('S-000001', '55555555-5555-4555-8555-555555555555');
  withdraw('knowledge/K-000001.md'); withdraw('knowledge/K-000002.md');
  const after = commit('actual candidate retirement');
  const withInput = (fn) => withTreeSnapshot(f.root, before.tree, (old) => withTreeSnapshot(f.root, after.tree, (next) => {
    const sides = {};
    for (const [side, descriptor, snapshot] of [['before', before, old], ['after', after, next]]) {
      const loaded = loadSubjectQueryContext({ root: snapshot.root, decisionCaptures: missingEvidence ? [] : f.decisionCaptures });
      assert.equal(loaded.ok, true, JSON.stringify(loaded.diagnostics));
      sides[side] = { capturedInputRef: descriptor.commit, context: loaded.context };
    }
    return fn({ version: 1, ...sides, source: 'S-000001',
      limits: { version: 1, maxSubjects: 100, maxEligibilityRedirects: 1000, maxCases: 1000, maxInventoryBytes: 5000000 },
      queryBudgets: { ...queryBudgets } });
  }));
  return { ...f, before, after, withInput };
}
