import { test } from 'node:test';
import assert from 'node:assert/strict';
import { subjectCreationFixture } from './helpers/subject-creation-fixture.js';
import { reconsiderationImpactLimits } from './helpers/subject-reconsideration-gate-fixture.js';
import { inspectSubjectCreationGate } from '../payload/engine/lib/subject-creation-gate.js';

for (const [name, options] of [['fresh', {}], ['promotion', { action: 'promote-proposal' }], ['union', { union: true }]]) {
  test(`actual eventless creation impacts: ${name}`, async t => {
    const f = subjectCreationFixture(t, options);
    const result = await inspectSubjectCreationGate({ ...f.input(), impact: reconsiderationImpactLimits() });
    assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
    assert.equal(result.assignments, null); assert.equal(result.sources.assignmentEvent, null);
    assert.equal(result.impacts.replays.policy.id, 'subject-creation-replay-v1');
    assert.equal(result.impacts.replays.coverage.assessmentComplete, true);
  });
}
