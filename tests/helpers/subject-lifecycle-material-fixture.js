/** Shared actual reconsideration source setup for fixed lifecycle fixtures. */
import assert from 'node:assert/strict';
import { subjectReconsiderationGateFixture } from './subject-reconsideration-gate-fixture.js';
import { inspectSubjectReconsiderationGate } from '../../payload/engine/lib/subject-reconsideration-gate.js';
import { wire, digestEvent } from './subject-reconsideration-fixture.js';
export const lifecycleKnowledgeFile = (record, body, note) => '---\n' + Object.entries(record).map(([key, value]) => `${key}: ${JSON.stringify(value)}\n`).join('')
  + (note ? `notes:\n  - ${JSON.stringify(note)}\n` : '') + '---\n' + body;
const leaf = lifecycleKnowledgeFile;
export async function priorReconsideredLifecycleFixture(t, { objectFormat = 'sha1', nested = false,
  sourceMaterial = true, sourceLessMaterial = false, priorReconsideration = false } = {}) {
  const f = subjectReconsiderationGateFixture(t, { objectFormat, nested, sourceMaterial, priorReconsideration, beforeChange(h) {
    const file = 'knowledge/K-000002.md', parts = h.read(file).split('---');
    const record = JSON.parse(parts[1]); record.facets = { stage: 'verified' };
    h.put(file, leaf(record, parts.slice(2).join('---').replace(/^\n/, '')));
  } });
  if (sourceLessMaterial) {
    const retained = f.evidence.materialCaptures[0];
    const capture = structuredClone(retained.capture); delete capture.source;
    f.evidence.materialCaptures = [{ ...retained, capture }];
    const activation = f.candidateDocument.history.at(-1);
    const declarations = [...activation.reconsideration.records, ...activation.reconsideration.sources];
    assert.equal(declarations.length, 1); declarations[0].capture = capture;
    activation.review.changeDigest = digestEvent(activation);
    f.operation.registryEvent.changeDigest = activation.review.changeDigest;
    f.put('subjects/registry.yaml', wire(f.candidateDocument));
    Object.assign(f.candidate, f.commit('actual source-less material reconsideration'));
  }
  const reconsideration = await inspectSubjectReconsiderationGate(f.gateInput());
  assert.equal(reconsideration.ok, true, JSON.stringify(reconsideration.diagnostics));
  return { ...f, root: f.repoRoot, reconsideration };
}
