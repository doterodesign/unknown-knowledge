import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { loadSubjectQueryContext } from '../payload/engine/lib/subject-query-context.js';
import { querySubjects } from '../payload/engine/lib/subject-query.js';
import { subjectQuery } from './helpers/subject-query-fixture.js';
import { subjectQueryDiskFixture } from './helpers/subject-query-disk-fixture.js';

test('context assembly uses actual root and nested loaders, real identity index and retained evidence', (t) => {
  for (const nested of [false, true]) {
    const fixture = subjectQueryDiskFixture(t, { nested });
    const loaded = loadSubjectQueryContext({ root: fixture.root, decisionCaptures: fixture.decisionCaptures });
    assert.equal(loaded.ok, true, JSON.stringify(loaded.diagnostics));
    const result = querySubjects(loaded.context, subjectQuery());
    assert.equal(result.status, 'complete');
    assert.equal(result.counts.knowledge.strict, 2);
  }
});

test('omitted retained evidence remains unavailable query verification, never current-source substitution', (t) => {
  const fixture = subjectQueryDiskFixture(t);
  const loaded = loadSubjectQueryContext({ root: fixture.root });
  assert.equal(loaded.ok, true);
  const result = querySubjects(loaded.context, subjectQuery());
  assert.equal(result.status, 'refused');
  assert.equal(result.diagnostics[0].code, 'governance-unavailable');
});

test('bad supplied evidence refuses context construction with the actual governance diagnostics', (t) => {
  const fixture = subjectQueryDiskFixture(t);
  fixture.decisionCaptures[0].bytes[0] ^= 1;
  const result = loadSubjectQueryContext({ root: fixture.root, decisionCaptures: fixture.decisionCaptures });
  assert.equal(result.ok, false);
  assert.equal(Object.hasOwn(result, 'context'), false);
  assert.equal(result.diagnostics[0].code, 'evidence-digest-mismatch');
});

test('missing optional authority and invalid model cannot appear as an empty executable context', (t) => {
  const fixture = subjectQueryDiskFixture(t);
  rmSync(join(fixture.kitRoot, 'knowledge'), { recursive: true });
  rmSync(join(fixture.kitRoot, 'subjects'), { recursive: true });
  let result = loadSubjectQueryContext({ root: fixture.root });
  assert.equal(result.ok, false);
  assert.equal(result.diagnostics[0].code, 'unavailable-subjects');
  rmSync(join(fixture.kitRoot, '_identity.yaml'));
  result = loadSubjectQueryContext({ root: fixture.root });
  assert.equal(result.ok, false);
  assert.equal(result.diagnostics[0].code, 'invalid-model');
});
