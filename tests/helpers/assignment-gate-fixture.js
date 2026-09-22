import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { subjectQueryDiskFixture } from './subject-query-disk-fixture.js';
import { captureCommittedFile, describeCandidateBytes } from '../../payload/engine/lib/captured-source.js';
import { canonicalSha256 } from '../../payload/engine/lib/canonical-json.js';
import { sealAssignmentEvent } from './assignment-event-fixture.js';
import { loadStores } from '../../payload/engine/lib/load-stores.js';
import { runChecks } from '../../payload/engine/commands/validate.js';

export const eventId = '45678901-2345-4678-89ab-123456789abc';
export const noteInput = { date: '2026-09-19', author: 'steward', skill: 'kb-build' };
export function reviewNote(ids) { return { type: 'revision', date: noteInput.date,
  text: `Classification review by ${noteInput.author} using ${noteInput.skill}: subjects ${ids.length ? ids.join(', ') : 'explicit empty'}. Existing evidence metadata retained.` }; }

export function assignmentGateFixture(t, { nested = false, initialIds, afterIds = ['S-000001'], prepareBefore } = {}) {
  const f = subjectQueryDiskFixture(t, { nested });
  const kitPath = nested ? 'unknown-knowledge' : '.';
  const path = (file) => kitPath === '.' ? file : `${kitPath}/${file}`;
  const git = (...args) => {
    const result = spawnSync('git', ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', '-C', f.root, ...args], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr); return result.stdout.trim();
  };
  for (const [id, entry] of f.context.model.leaves) {
    const subjects = id === 'K-000001' ? initialIds : entry.record.subjects;
    const domain = id === 'K-000001' ? 'design-system' : 'elsewhere';
    f.put(entry.file, `---\nschema-version: 3\nid: ${id}\nheading: Retained ${id}\ndomain: world\ncitations: [{source: observed-source}]\nfacets: {stage: ${entry.record.facets.stage}, domain: ${domain}}\n${subjects === undefined ? '' : `subjects: ${JSON.stringify(subjects)}\n`}# retained\n---\nRetained body ${id}.\n`);
  }
  f.put('knowledge/_registries/domains.yaml', { 'schema-version': 2, store: 'knowledge', registry: 'domains', hierarchical: true,
    values: ['design-system', 'elsewhere', 'design-system/buttons', 'design-system-legacy'].map((value) => ({ value, warrant: 'Observed fixture scope', decision: 'D-000001' })) });
  prepareBefore?.(f);
  const beforeModel = loadStores(f.kitRoot);
  assert.equal(beforeModel.ok, true, JSON.stringify(beforeModel.diagnostics));
  assert.deepEqual(runChecks(beforeModel, f.root).filter(({ severity }) => severity === 'error'), []);
  git('init', '-q'); git('add', '.'); git('commit', '-qm', 'before');
  const commit = git('rev-parse', 'HEAD'); const tree = git('rev-parse', 'HEAD^{tree}');
  const namespace = beforeModel.identity.namespace;
  const ref = { namespace, kind: 'knowledge', id: 'K-000001' };
  const file = path(beforeModel.leaves.get(ref.id).file);
  const prior = captureCommittedFile({ repoRoot: f.root, commit, file });
  const decisionRef = { namespace, kind: 'decision', id: 'D-000001' };
  const decision = captureCommittedFile({ repoRoot: f.root, commit, file: path(beforeModel.decisions.get(decisionRef.id).file) });
  const beforeState = initialIds === undefined ? { state: 'unknown', reason: 'absent' } : { state: 'known', ids: initialIds };
  const changed = initialIds === undefined || JSON.stringify([...initialIds].sort()) !== JSON.stringify([...afterIds].sort());
  const beforeText = prior.bytes.toString();
  let next = initialIds === undefined ? beforeText.replace('# retained', `subjects: ${JSON.stringify(afterIds)}\n# retained`)
    : beforeText.replace(`subjects: ${JSON.stringify(initialIds)}`, `subjects: ${JSON.stringify(afterIds)}`);
  if (changed) next = next.replace('# retained', `notes:\n  - ${JSON.stringify(reviewNote(afterIds))}\n# retained`);
  f.put(beforeModel.leaves.get(ref.id).file, next);
  const event = sealAssignmentEvent({ 'schema-version': 1, event: eventId, namespace,
    scope: { kind: 'knowledge-domain', occupancy: 'allocated', field: 'facets.domain', match: 'exact', values: ['design-system'] },
    'before-input': { commit, tree, 'kit-path': kitPath }, decision: decisionRef,
    review: { reference: 'review:assignment', 'accepted-status': 'accepted', 'decision-capture': decision.locator,
      'decision-digest': canonicalSha256(beforeModel.decisions.get(decisionRef.id).record) },
    rows: [{ ref, before: beforeState, after: { state: 'known', ids: afterIds }, 'before-revision': 0, 'after-revision': Number(changed),
      disposition: changed ? 'changed' : 'unchanged', reason: 'Reviewed classification',
      'before-capture': prior.locator, 'after-capture': describeCandidateBytes({ file, bytes: Buffer.from(next), objectFormat: prior.objectFormat }) }] });
  const baseline = { 'schema-version': 1, namespace, baselines: [{ ref, state: beforeState, capture: prior.locator }] };
  const save = () => { f.put('subjects/_assignments/_baselines.yaml', baseline); f.put(`subjects/_assignments/${eventId}.yaml`, sealAssignmentEvent(event)); git('add', '.'); };
  save();
  const options = { repoRoot: f.root, eventId, reviewNote: { ...noteInput }, decisionCaptures: f.decisionCaptures,
    limits: { maxRecords: 100, maxCaptureBytes: 1000000, maxRedirects: 20 }, impact: { required: [] } };
  return { ...f, git, path, commit, tree, event, baseline, save, options, prior, beforeModel,
    read: (file) => readFileSync(join(f.kitRoot, file), 'utf8') };
}
