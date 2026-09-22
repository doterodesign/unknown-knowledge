/** Actual core-only split captures; selected-file/event P8 preservation is a separate obligation. */
import assert from 'node:assert/strict';
import { subjectSplitCoreFixture } from './subject-split-core-fixture.js';
import { queryBudgets } from './subject-query-fixture.js';
import { inspectSubjectSplitAssignmentScope } from '../../payload/engine/lib/subject-split-core.js';
import { loadSubjectQueryContext } from '../../payload/engine/lib/subject-query-context.js';
import { canonicalSha256 } from '../../payload/engine/lib/canonical-json.js';

export function subjectSplitReplayFixture(t, options = {}) {
  const f = subjectSplitCoreFixture(t, { recordFormat: 'block', ...options });
  const withInput = (fn) => f.withCoreInput(async (actual) => {
    const { core } = await inspectSubjectSplitAssignmentScope(actual);
    assert.equal(core.ok, true, JSON.stringify(core.diagnostics));
    const sides = {};
    for (const [side, name] of [['before', 'before'], ['after', 'candidate']]) {
      // Independent replay-phase contexts, as in the fixed retirement impact composition.
      const loaded = loadSubjectQueryContext({ root: actual[name].root, ...actual.evidence });
      assert.equal(loaded.ok, true, JSON.stringify(loaded.diagnostics));
      sides[side] = { capturedInputRef: canonicalSha256(core.inputs[name]), context: loaded.context };
    }
    return fn({ version: 1, ...sides, core,
      limits: { version: 1, maxSubjects: 100, maxEligibilityRedirects: 1000, maxCases: 2000, maxInventoryBytes: 5000000 },
      queryBudgets: { ...queryBudgets } }, actual);
  });
  return { ...f, withInput };
}
