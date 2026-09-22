import test from 'node:test';
import assert from 'node:assert/strict';
import { subjectSplitCoreFixture } from './helpers/subject-split-core-fixture.js';
import { inspectSubjectSplitAssignmentScope } from '../payload/engine/lib/subject-split-core.js';
import { captureCommittedFile } from '../payload/engine/lib/captured-source.js';

for (const objectFormat of ['sha1', 'sha256']) {
  test(`split keeps original assessment provenance despite identical ${objectFormat} tree and bytes`, async t => {
    const f = subjectSplitCoreFixture(t, { objectFormat, nested: objectFormat === 'sha256' });
    const original = f.input.before;
    const otherCommit = f.git('commit-tree', original.tree, '-p', original.commit, '-m', 'Another source with the identical tree');
    assert.notEqual(otherCommit, original.commit);
    assert.equal(f.git('rev-parse', `${otherCommit}^{tree}`), original.tree);
    for (const name of ['registry', 'identity']) {
      const retained = f.beforeCaptures[name];
      const other = captureCommittedFile({ repoRoot: f.root, commit: otherCommit, file: retained.capture.file });
      assert.equal(other.locator.blob, retained.capture.blob);
      assert.equal(other.locator.sha256, retained.capture.sha256);
      assert.ok(other.bytes.equals(retained.bytes));
      assert.notDeepEqual(other.locator.source, retained.capture.source);
    }
    const bundle = await f.withCoreInput(input => inspectSubjectSplitAssignmentScope({ ...input,
      before: { ...input.before, descriptor: { ...original, commit: otherCommit } },
    }));
    assert.equal(bundle.core.ok, false);
    assert.equal(bundle.core.diagnostics[0].code, 'split-original-before-pair');
    assert.equal(bundle.candidateGovernance, null);
    assert.equal(bundle.core.resources.allocation, null);
    assert.equal(bundle.core.allocation, null);
  });
}
