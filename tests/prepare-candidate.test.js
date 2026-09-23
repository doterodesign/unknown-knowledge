import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, symlinkSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { prepareCandidate, CandidateRefusal } from '../payload/engine/lib/prepare-candidate.js';
import { captureCommittedFile } from '../payload/engine/lib/captured-source.js';

const limits = { maxChanges: 10, maxFileBytes: 100000, maxTotalChangeBytes: 200000,
  maxTreeEntries: 100, maxTreeBytes: 1000000, maxGitOutputBytes: 1000000, maxCommitMessageBytes: 1000 };
const person = { name: 'Fixture Author', email: 'author@example.test', seconds: 1700000000, offset: '+0000' };
const metadata = () => ({ author: { ...person }, committer: { ...person }, message: 'Reviewed candidate\n' });

function fixture(t, objectFormat = 'sha1') {
  const root = mkdtempSync(join(tmpdir(), 'prepare-candidate-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (key.startsWith('GIT_')) delete env[key];
  env.GIT_CONFIG_GLOBAL = '/dev/null'; env.GIT_CONFIG_NOSYSTEM = '1';
  const git = (args, input) => {
    const result = spawnSync('git', ['-C', root, ...args], { env, input });
    assert.equal(result.status, 0, result.stderr.toString());
    return result.stdout;
  };
  const text = (...args) => git(args).toString().trim();
  git(['init', '-q', `--object-format=${objectFormat}`, '-b', 'source']);
  git(['config', 'user.name', 'Setup']); git(['config', 'user.email', 'setup@example.test']);
  mkdirSync(join(root, 'knowledge'));
  const file = 'knowledge/[literal]* Café.yaml';
  const bytes = Buffer.from('\uFEFF# original π\r\nvalue: before\r\n');
  writeFileSync(join(root, file), bytes);
  writeFileSync(join(root, 'retained.bin'), Buffer.from([0, 255, 13, 10, 128]));
  writeFileSync(join(root, 'executable'), '#!/bin/sh\n', { mode: 0o755 });
  git(['add', '.']); git(['commit', '-qm', 'source']);
  const commit = text('rev-parse', 'HEAD');
  const capture = captureCommittedFile({ repoRoot: root, commit, file });
  const input = () => ({ operation: 'identity-migration', repoRoot: root,
    source: { ref: 'refs/heads/source', expectedCommit: commit, kitPath: '.' },
    changes: [{ file, before: { mode: capture.mode, capture: capture.locator },
      after: { mode: capture.mode, bytes: Buffer.from('\uFEFF# original π\r\nvalue: after\r\n') } }],
    commit: metadata(), limits: { ...limits } });
  return { root, file, bytes, commit, capture, git, text, input };
}

for (const format of ['sha1', 'sha256']) {
  test(`isolated ${format} candidate preserves every unselected byte, mode, ref and dirty user state`, async (t) => {
    const f = fixture(t, format);
    writeFileSync(join(f.root, f.file), 'staged'); f.git(['add', '--', f.file]);
    writeFileSync(join(f.root, f.file), 'unstaged');
    writeFileSync(join(f.root, 'untracked'), 'private');
    const index = readFileSync(join(f.root, '.git/index'));
    const refs = f.git(['show-ref']);
    const input = f.input();
    const newFile = 'knowledge/new\nline.yaml';
    input.changes.push({ file: newFile, before: null, after: { mode: '100644', bytes: Buffer.from('new\0bytes') } });
    const result = await prepareCandidate(input);
    assert.equal(Object.hasOwn(result, 'publicationReady'), false);
    assert.deepEqual(result.files.map(({ file }) => file), [f.file, newFile].sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b))));
    assert.deepEqual(f.git(['show-ref']), refs);
    assert.deepEqual(readFileSync(join(f.root, '.git/index')), index);
    assert.equal(readFileSync(join(f.root, f.file), 'utf8'), 'unstaged');
    assert.equal(readFileSync(join(f.root, 'untracked'), 'utf8'), 'private');
    assert.equal(existsSync(join(f.root, newFile)), false);
    assert.equal(f.text('rev-parse', `${result.candidate.commit}^`), f.commit);
    assert.equal(f.text('rev-parse', `${result.candidate.commit}:retained.bin`), f.text('rev-parse', `${f.commit}:retained.bin`));
    assert.equal(f.text('ls-tree', result.candidate.tree, '--', 'executable'), f.text('ls-tree', `${f.commit}^{tree}`, '--', 'executable'));
    assert.deepEqual(captureCommittedFile({ repoRoot: f.root, commit: result.candidate.commit, file: f.file }).bytes, input.changes[0].after.bytes);
    assert.deepEqual(captureCommittedFile({ repoRoot: f.root, commit: result.candidate.commit, file: newFile }).bytes, Buffer.from('new\0bytes'));
    assert.equal((await prepareCandidate(f.input())).candidate.commit, (await prepareCandidate(f.input())).candidate.commit);
  });
}

test('preparation snapshots supplied byte buffers before awaiting materialization', async (t) => {
  const f = fixture(t); const input = f.input(); const expected = Buffer.from(input.changes[0].after.bytes);
  const pending = prepareCandidate(input); input.changes[0].after.bytes.fill(120);
  const result = await pending;
  assert.deepEqual(captureCommittedFile({ repoRoot: f.root, commit: result.candidate.commit, file: f.file }).bytes, expected);
});

test('source pin and ref grammar refuse aliases, drift, shorthand and revision expressions without moving refs', async (t) => {
  const f = fixture(t); f.git(['symbolic-ref', 'refs/heads/alias', 'refs/heads/source']);
  const refs = f.git(['show-ref']);
  for (const ref of ['HEAD', 'source', 'refs/tags/source', 'refs/heads/source~1', 'refs/heads/source\n', 'refs/heads/x..y', 'refs/heads/x.lock', 'refs/heads/alias']) {
    const input = f.input(); input.source.ref = ref;
    await assert.rejects(prepareCandidate(input), CandidateRefusal, ref);
  }
  const input = f.input(); input.source.expectedCommit = '1'.repeat(40);
  await assert.rejects(prepareCandidate(input), { code: 'candidate-source-drift' });
  assert.deepEqual(f.git(['show-ref']), refs);
});

test('before captures, modes and creates are bound to the committed source, not a planned label', async (t) => {
  const f = fixture(t);
  for (const mutate of [
    (p) => { p.changes[0].before.capture = { ...p.changes[0].before.capture, sha256: '0'.repeat(64) }; },
    (p) => { p.changes[0].before = null; },
    (p) => { p.changes[0].after.mode = '100755'; },
    (p) => { p.changes[0].after = null; },
    (p) => { p.changes[0].after.bytes = f.bytes; },
    (p) => { p.changes.push({ ...p.changes[0] }); },
    (p) => { p.changes.push({ file: `${f.file}/child`, before: null, after: { mode: '100644', bytes: Buffer.from('x') } }); },
    (p) => { p.changes = [{ file: 'knowledge', before: null, after: { mode: '100644', bytes: Buffer.from('x') } }]; },
  ]) {
    const input = f.input(); mutate(input); await assert.rejects(prepareCandidate(input), CandidateRefusal);
  }
  assert.equal(f.text('rev-parse', 'HEAD'), f.commit);
});

test('unsafe paths and malformed closed input fail before candidate assembly', async (t) => {
  const f = fixture(t);
  for (const file of ['../escape', '/absolute', 'C:/drive', 'knowledge/../other', '.git/config', 'x/.GIT/config', 'a\\b', 'a\0b']) {
    const input = f.input(); input.changes = [{ file, before: null, after: { mode: '100644', bytes: Buffer.from('x') } }];
    await assert.rejects(prepareCandidate(input), { code: 'invalid-candidate-change' });
  }
  for (const mutate of [
    (p) => { p.callback = () => {}; }, (p) => { p.changes = []; },
    (p) => { p.changes = Array(11).fill(p.changes[0]); },
    (p) => { p.changes[0].after.bytes = new Uint8Array([1, 2]); },
    (p) => { p.commit.author.offset = '+0000\n'; }, (p) => { p.commit.author.name = 'bad\nname'; },
    (p) => { p.commit.message = 'missing LF'; }, (p) => { p.commit.message = 'bad\0message\n'; },
    (p) => { p.limits.maxChanges = Infinity; }, (p) => { p.limits.maxTreeBytes = -1; },
  ]) { const input = f.input(); mutate(input); await assert.rejects(prepareCandidate(input), CandidateRefusal); }
});

test('explicit byte, tree, message and Git-output budgets refuse without touching refs or user index', async (t) => {
  const f = fixture(t); const refs = f.git(['show-ref']); const index = readFileSync(join(f.root, '.git/index'));
  for (const key of ['maxFileBytes', 'maxTotalChangeBytes', 'maxTreeEntries', 'maxTreeBytes', 'maxGitOutputBytes', 'maxCommitMessageBytes']) {
    const input = f.input(); input.limits[key] = 1;
    await assert.rejects(prepareCandidate(input), CandidateRefusal, key);
  }
  const metadataLimit = f.input(); metadataLimit.limits.maxGitOutputBytes = 1000;
  metadataLimit.limits.maxFileBytes = 1000;
  metadataLimit.commit.author.name = 'x'.repeat(1001);
  await assert.rejects(prepareCandidate(metadataLimit), { code: 'candidate-commit-budget' });
  assert.deepEqual(f.git(['show-ref']), refs); assert.deepEqual(readFileSync(join(f.root, '.git/index')), index);
});

test('shared capture and snapshot reads cannot exceed the declared Git output limit or fixed reader cap', async (t) => {
  const f = fixture(t); const refs = f.git(['show-ref']); const index = readFileSync(join(f.root, '.git/index'));
  const smallerOutput = f.input();
  smallerOutput.limits.maxGitOutputBytes = f.bytes.length - 1;
  smallerOutput.limits.maxFileBytes = f.bytes.length;
  assert.ok(f.capture.bytes.length > smallerOutput.limits.maxGitOutputBytes);
  await assert.rejects(prepareCandidate(smallerOutput), { code: 'candidate-limit-conflict' });
  const aboveSharedCap = f.input();
  aboveSharedCap.limits.maxGitOutputBytes = 65 * 1024 * 1024;
  aboveSharedCap.limits.maxFileBytes = 64 * 1024 * 1024 + 1;
  await assert.rejects(prepareCandidate(aboveSharedCap), { code: 'candidate-limit-conflict' });
  assert.deepEqual(f.git(['show-ref']), refs); assert.deepEqual(readFileSync(join(f.root, '.git/index')), index);
});

test('each materialized side corroborates its own kit layout before returning a commit', async (t) => {
  const f = fixture(t);
  const wrong = f.input(); wrong.source.kitPath = 'unknown-knowledge';
  await assert.rejects(prepareCandidate(wrong), { code: 'candidate-kit-layout' });
  const moved = f.input(); moved.changes.push({ file: '.unknown-knowledge.json', before: null,
    after: { mode: '100644', bytes: Buffer.from('{"kitRoot":"unknown-knowledge"}') } });
  await assert.rejects(prepareCandidate(moved), /selects a missing kit directory/);
  assert.equal(f.text('rev-parse', 'HEAD'), f.commit);
});

test('a nested installation and its committed explicit selector are checked on both sides', async (t) => {
  const f = fixture(t);
  mkdirSync(join(f.root, 'unknown-knowledge'));
  f.git(['mv', 'knowledge', 'unknown-knowledge/knowledge']);
  writeFileSync(join(f.root, '.unknown-knowledge.json'), '{"kitRoot":"unknown-knowledge"}\n');
  f.git(['add', '.unknown-knowledge.json']); f.git(['commit', '-qm', 'nested source']);
  const input = f.input(); input.source.expectedCommit = f.text('rev-parse', 'HEAD');
  input.source.kitPath = 'unknown-knowledge'; input.changes[0].file = `unknown-knowledge/${f.file}`;
  input.changes[0].before.capture = captureCommittedFile({ repoRoot: f.root,
    commit: input.source.expectedCommit, file: input.changes[0].file }).locator;
  const result = await prepareCandidate(input);
  assert.equal(result.source.kitPath, 'unknown-knowledge');
  assert.equal(result.candidate.kitPath, 'unknown-knowledge');
  assert.equal(f.text('rev-parse', 'HEAD'), input.source.expectedCommit);
});

test('Git config cannot sign, re-encode, filter or execute hooks while preparing raw bytes', async (t) => {
  const f = fixture(t);
  const marker = join(f.root, 'EXECUTED');
  writeFileSync(join(f.root, '.git/hooks/pre-commit'), `#!/bin/sh\ntouch '${marker}'\n`, { mode: 0o755 });
  f.git(['config', 'commit.gpgsign', 'true']); f.git(['config', 'gpg.program', '/missing/signer']);
  f.git(['config', 'i18n.commitEncoding', 'ISO-8859-1']);
  f.git(['config', 'filter.trap.clean', `touch '${marker}'`]);
  const input = f.input(); input.changes.push({ file: '.gitattributes', before: null,
    after: { mode: '100644', bytes: Buffer.from('* filter=trap\n') } });
  input.commit.message = 'Exact π message\n';
  const result = await prepareCandidate(input);
  assert.equal(existsSync(marker), false);
  assert.equal(f.git(['cat-file', 'commit', result.candidate.commit]).toString().endsWith('\n\nExact π message\n'), true);
});

test('ambient Git routing does not substitute another index, worktree or object store', async (t) => {
  const f = fixture(t); const input = f.input();
  const keys = ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_OBJECT_DIRECTORY', 'GIT_ALTERNATE_OBJECT_DIRECTORIES'];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  try {
    for (const key of keys) process.env[key] = join(f.root, 'does-not-exist');
    const result = await prepareCandidate(input); assert.equal(result.source.commit, f.commit);
  } finally {
    for (const key of keys) if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key];
  }
});

test('escaping symlink source evidence refuses through the shared raw materializer', async (t) => {
  const f = fixture(t); symlinkSync('/tmp', join(f.root, 'escape'));
  f.git(['add', 'escape']); f.git(['commit', '-qm', 'unsafe source']);
  const input = f.input(); input.source.expectedCommit = f.text('rev-parse', 'HEAD');
  input.changes[0].before.capture = captureCommittedFile({ repoRoot: f.root, commit: input.source.expectedCommit, file: f.file }).locator;
  await assert.rejects(prepareCandidate(input), /outside the candidate/);
  assert.equal(f.text('rev-parse', 'HEAD'), input.source.expectedCommit);
});
