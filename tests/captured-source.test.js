import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describeCandidateBytes, verifyCapturedBytes, captureCommittedFile } from '../payload/engine/lib/captured-source.js';

function repository(t, objectFormat = 'sha1') {
  const root = mkdtempSync(join(tmpdir(), 'captured-source-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const env = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' };
  for (const key of ['GIT_DIR', 'GIT_INDEX_FILE', 'GIT_WORK_TREE', 'GIT_COMMON_DIR']) delete env[key];
  const git = (...args) => {
    const result = spawnSync('git', ['-C', root, ...args], { env, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  git('init', '-q', `--object-format=${objectFormat}`);
  git('config', 'user.name', 'Fixture'); git('config', 'user.email', 'fixture@example.test');
  const file = '[evidence]*.bin';
  const bytes = Buffer.from([0, 255, 13, 10, 0, 128]);
  writeFileSync(join(root, file), bytes);
  symlinkSync(file, join(root, 'link'));
  git('add', '.'); git('commit', '-qm', 'source');
  return { root, git, file, bytes, commit: git('rev-parse', 'HEAD') };
}

for (const objectFormat of ['sha1', 'sha256']) {
  test(`capture verifies exact committed binary bytes and literal path in ${objectFormat} repository`, (t) => {
    const { root, git, file, bytes, commit } = repository(t, objectFormat);
    writeFileSync(join(root, file), 'staged'); git('add', '--', file);
    writeFileSync(join(root, file), 'working');
    writeFileSync(join(root, 'private'), 'untracked');
    const index = readFileSync(join(root, '.git/index'));
    const capture = captureCommittedFile({ repoRoot: root, commit, file });
    assert.deepEqual(capture.bytes, bytes);
    assert.equal(capture.objectFormat, objectFormat);
    assert.deepEqual(capture.locator, {
      ...describeCandidateBytes({ file, bytes, objectFormat }),
      source: { commit, tree: git('rev-parse', `${commit}^{tree}`) },
    });
    assert.equal(capture.locator.blob, git('rev-parse', `${commit}:${file}`));
    assert.deepEqual(verifyCapturedBytes({ ...capture }), { ok: true, diagnostics: [], evidence: 'byte-integrity-only' });
    assert.deepEqual(readFileSync(join(root, '.git/index')), index);
    assert.equal(readFileSync(join(root, file), 'utf8'), 'working');
    assert.equal(readFileSync(join(root, 'private'), 'utf8'), 'untracked');
    assert.equal(git('rev-parse', 'HEAD'), commit);
  });
}

test('byte verification refuses changed bytes, malformed locators and implicit object formats', () => {
  const bytes = Buffer.from('original\r\n');
  const objectFormat = 'sha1';
  const locator = describeCandidateBytes({ file: 'record.yaml', bytes, objectFormat });
  assert.equal(Object.hasOwn(locator, 'source'), false);
  for (const input of [
    { locator, bytes: Buffer.from('changed'), objectFormat },
    { locator: { ...locator, file: '../escape' }, bytes, objectFormat },
    { locator: { ...locator, blob: '0'.repeat(40) }, bytes, objectFormat },
    { locator: { ...locator, sha256: '0'.repeat(64) }, bytes, objectFormat },
    { locator, bytes },
    { locator, bytes, objectFormat: 'sha256' },
    { locator, bytes: new Uint8Array(bytes), objectFormat },
    { locator: { ...locator, source: { commit: '0'.repeat(64), tree: '0'.repeat(64) } }, bytes, objectFormat },
  ]) assert.equal(verifyCapturedBytes(input).ok, false);
  const forgedMembership = { ...locator, source: { commit: '0'.repeat(40), tree: '0'.repeat(40) } };
  assert.deepEqual(verifyCapturedBytes({ locator: forgedMembership, bytes, objectFormat }),
    { ok: true, diagnostics: [], evidence: 'byte-integrity-only' });
});

test('committed capture refuses missing objects/files, directories, symlinks and moving source refs', (t) => {
  const { root, file, commit } = repository(t);
  for (const choice of [
    { commit: 'HEAD', file }, { commit: '0'.repeat(40), file },
    { commit, file: 'missing' }, { commit, file: 'link' }, { commit, file: '.' },
    { commit, file: '../outside' }, { commit, file: '/absolute' },
  ]) assert.throws(() => captureCommittedFile({ repoRoot: root, ...choice }));
});

test('committed capture ignores replacement objects instead of rewriting historical evidence', (t) => {
  const { root, git, file, bytes, commit } = repository(t);
  writeFileSync(join(root, file), 'replacement');
  git('add', '.'); git('commit', '-qm', 'replacement');
  git('replace', commit, git('rev-parse', 'HEAD'));
  assert.deepEqual(captureCommittedFile({ repoRoot: root, file, commit }).bytes, bytes);
});
