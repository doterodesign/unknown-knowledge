import { test } from 'node:test';
import assert from 'node:assert/strict';
import childProcess, { spawnSync } from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, chmodSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compareAndSwapCandidateRef } from '../payload/engine/lib/candidate-ref-transaction.js';

const outputRef = 'refs/unknown-knowledge/candidates/12345678-1234-4123-8123-123456789abc';
const limits = { maxOutputBytes: 100000, maxCommandMilliseconds: 3000,
  maxTransactionMilliseconds: 15000, maxWorktrees: 10 };
function fixture(t, format = 'sha1') {
  const root = mkdtempSync(join(tmpdir(), 'candidate-cas-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const env = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' };
  for (const key of Object.keys(env)) if (key.startsWith('GIT_') && !['GIT_CONFIG_GLOBAL', 'GIT_CONFIG_NOSYSTEM'].includes(key)) delete env[key];
  const git = (args, input) => {
    const r = spawnSync('/usr/bin/git', ['-C', root, ...args], { env, input });
    assert.equal(r.status, 0, r.stderr.toString()); return r.stdout;
  };
  const text = (...args) => git(args).toString().trim();
  git(['init', '-q', '-b', 'source', `--object-format=${format}`]);
  git(['config', 'user.name', 'Fixture']); git(['config', 'user.email', 'fixture@example.test']);
  writeFileSync(join(root, 'file'), 'source'); git(['add', '.']); git(['commit', '-qm', 'source']);
  const source = text('rev-parse', 'HEAD');
  const candidate = git(['commit-tree', `${source}^{tree}`, '-p', source], 'candidate\n').toString().trim();
  const input = () => ({ repoRoot: root, source: { ref: 'refs/heads/source', expectedCommit: source },
    output: { ref: outputRef, expectedCommit: null }, candidateCommit: candidate, limits: { ...limits } });
  return { root, git, text, source, candidate, input };
}
function interceptSpawn(t, intercept) {
  const original = childProcess.spawn;
  childProcess.spawn = (...args) => intercept(original, args);
  syncBuiltinESMExports();
  t.after(() => { childProcess.spawn = original; syncBuiltinESMExports(); });
}
for (const format of ['sha1', 'sha256']) {
  test(`${format}: create and update are real CAS and preserve dirty user state`, async (t) => {
    const f = fixture(t, format);
    writeFileSync(join(f.root, 'file'), 'staged'); f.git(['add', '.']);
    writeFileSync(join(f.root, 'file'), 'dirty'); writeFileSync(join(f.root, 'untracked'), 'private');
    const index = readFileSync(join(f.root, '.git/index'));
    const first = await compareAndSwapCandidateRef(f.input());
    assert.equal(first.outcome, 'committed', JSON.stringify(first));
    assert.equal(f.text('rev-parse', outputRef), f.candidate);
    const input = f.input(); input.output.expectedCommit = f.candidate;
    input.candidateCommit = f.git(['commit-tree', `${f.source}^{tree}`, '-p', f.source], 'second\n').toString().trim();
    assert.equal((await compareAndSwapCandidateRef(input)).outcome, 'committed');
    assert.equal(f.text('rev-parse', outputRef), input.candidateCommit);
    assert.equal(f.text('rev-parse', 'HEAD'), f.source);
    assert.deepEqual(readFileSync(join(f.root, '.git/index')), index);
    assert.equal(readFileSync(join(f.root, 'file'), 'utf8'), 'dirty');
    assert.equal(readFileSync(join(f.root, 'untracked'), 'utf8'), 'private');
  });
}
test('stale source and stale output refuse without ref changes', async (t) => {
  const f = fixture(t);
  const input = f.input(); input.source.expectedCommit = f.candidate;
  assert.equal((await compareAndSwapCandidateRef(input)).outcome, 'not-committed');
  f.git(['update-ref', outputRef, f.source]);
  const refs = f.git(['show-ref']);
  assert.equal((await compareAndSwapCandidateRef(f.input())).outcome, 'not-committed');
  const stale = f.input(); stale.output.expectedCommit = f.candidate;
  assert.equal((await compareAndSwapCandidateRef(stale)).outcome, 'not-committed');
  assert.deepEqual(f.git(['show-ref']), refs);
});
test('directness includes dangling symbolic output refs', async (t) => {
  const f = fixture(t);
  f.git(['symbolic-ref', outputRef, 'refs/heads/missing']);
  assert.equal((await compareAndSwapCandidateRef(f.input())).outcome, 'not-committed');
  assert.equal(f.text('symbolic-ref', outputRef), 'refs/heads/missing');
  f.git(['symbolic-ref', 'refs/heads/alias', 'refs/heads/source']);
  const input = f.input(); input.source.ref = 'refs/heads/alias';
  assert.equal((await compareAndSwapCandidateRef(input)).outcome, 'not-committed');
});
test('output named by a worktree HEAD refuses', async (t) => {
  const f = fixture(t); f.git(['update-ref', outputRef, f.source]);
  f.git(['symbolic-ref', 'HEAD', outputRef]);
  const input = f.input(); input.output.expectedCommit = f.source;
  assert.equal((await compareAndSwapCandidateRef(input)).outcome, 'not-committed');
  assert.equal(f.text('rev-parse', outputRef), f.source);
});
test('client reference-transaction hooks are disabled', async (t) => {
  const f = fixture(t); const marker = join(f.root, 'hook-ran');
  const hook = join(f.root, '.git/hooks/reference-transaction');
  writeFileSync(hook, `#!/bin/sh\ntouch '${marker}'\nexit 1\n`); chmodSync(hook, 0o755);
  assert.equal((await compareAndSwapCandidateRef(f.input())).outcome, 'committed');
  assert.equal(existsSync(marker), false);
});
test('symbolic source introduced immediately before prepare is rejected under locks', async (t) => {
  const f = fixture(t); f.git(['update-ref', 'refs/heads/target', f.source]);
  interceptSpawn(t, (original, args) => {
    const child = original(...args);
    if (args[1].includes('update-ref')) {
      const write = child.stdin.write.bind(child.stdin);
      child.stdin.write = (chunk, ...rest) => {
        if (String(chunk).includes('prepare\0')) f.git(['symbolic-ref', 'refs/heads/source', 'refs/heads/target']);
        return write(chunk, ...rest);
      };
    }
    return child;
  });
  const result = await compareAndSwapCandidateRef(f.input());
  assert.equal(result.outcome, 'not-committed');
  assert.equal(f.text('symbolic-ref', 'refs/heads/source'), 'refs/heads/target');
  assert.equal(f.text('for-each-ref', '--format=%(refname)', outputRef), '');
});
test('lost commit acknowledgement returns unknown without compensating ref rewrite', async (t) => {
  const f = fixture(t);
  interceptSpawn(t, (original, args) => {
    const child = original(...args);
    if (args[1].includes('update-ref')) {
      const emit = child.stdout.emit.bind(child.stdout);
      child.stdout.emit = (name, bytes, ...rest) => name === 'data' && bytes.includes(Buffer.from('commit: ok'))
        ? true : emit(name, bytes, ...rest);
    }
    return child;
  });
  const input = f.input(); input.limits.maxTransactionMilliseconds = 2000;
  const result = await compareAndSwapCandidateRef(input);
  assert.equal(result.outcome, 'unknown');
  assert.deepEqual(result.source, input.source); assert.deepEqual(result.output, input.output);
  assert.equal(result.candidateCommit, f.candidate);
  assert.equal(f.text('rev-parse', outputRef), f.candidate);
});
test('closed inputs and budgets refuse before publication', async (t) => {
  const f = fixture(t);
  for (const mutate of [
    (p) => { p.output.ref = 'refs/heads/other'; },
    (p) => { p.source.ref = 'refs/heads/x..y'; },
    (p) => { p.output.ref += '\n'; },
    (p) => { p.source.expectedCommit = 'HEAD'; },
    (p) => { p.extra = true; },
    (p) => { p.limits.maxOutputBytes = 0; },
    (p) => { p.limits.maxOutputBytes = 1; },
    (p) => { p.limits.maxWorktrees = 0; },
  ]) {
    const input = f.input(); mutate(input);
    assert.equal((await compareAndSwapCandidateRef(input)).outcome, 'not-committed');
  }
  assert.equal(f.text('for-each-ref', '--format=%(refname)', outputRef), '');
});

for (const changed of ['source', 'output']) test(`${changed} drift before prepare fails the atomic transaction`, async (t) => {
  const f = fixture(t);
  interceptSpawn(t, (original, args) => {
    const child = original(...args);
    if (args[1].includes('update-ref')) {
      const write = child.stdin.write.bind(child.stdin);
      child.stdin.write = (chunk, ...rest) => {
        if (String(chunk).includes('prepare\0')) f.git(['update-ref', changed === 'source' ? 'refs/heads/source' : outputRef, f.candidate]);
        return write(chunk, ...rest);
      };
    }
    return child;
  });
  assert.equal((await compareAndSwapCandidateRef(f.input())).outcome, 'not-committed');
  assert.equal(f.text('rev-parse', 'refs/heads/source'), changed === 'source' ? f.candidate : f.source);
  assert.equal(f.text('for-each-ref', '--format=%(objectname)', outputRef), changed === 'output' ? f.candidate : '');
});
test('worktree HEAD guard runs again after prepare', async (t) => {
  const f = fixture(t);
  f.git(['update-ref', outputRef, f.source]);
  interceptSpawn(t, (original, args) => {
    const child = original(...args);
    if (args[1].includes('update-ref')) {
      const write = child.stdin.write.bind(child.stdin);
      child.stdin.write = (chunk, ...rest) => {
        if (String(chunk).includes('prepare\0')) f.git(['symbolic-ref', 'HEAD', outputRef]);
        return write(chunk, ...rest);
      };
    }
    return child;
  });
  const input = f.input(); input.output.expectedCommit = f.source;
  const result = await compareAndSwapCandidateRef(input);
  assert.equal(result.outcome, 'not-committed'); assert.equal(result.code, 'output-checked-out');
  assert.equal(f.text('rev-parse', outputRef), f.source);
});
test('process loss before prepare is definitely not committed', async (t) => {
  const f = fixture(t);
  interceptSpawn(t, (original, args) => {
    const child = original(...args);
    if (args[1].includes('update-ref')) child.kill('SIGKILL');
    return child;
  });
  assert.equal((await compareAndSwapCandidateRef(f.input())).outcome, 'not-committed');
  assert.equal(f.text('for-each-ref', '--format=%(refname)', outputRef), '');
});
test('linked worktrees participate in the output HEAD guard and count budget', async (t) => {
  const f = fixture(t); const linked = join(f.root, 'linked');
  f.git(['worktree', 'add', '-q', '--detach', linked, f.source]);
  const input = f.input(); input.limits.maxWorktrees = 1;
  assert.equal((await compareAndSwapCandidateRef(input)).code, 'worktree-budget');
  f.git(['update-ref', outputRef, f.source]);
  f.git(['-C', linked, 'symbolic-ref', 'HEAD', outputRef]);
  const named = f.input(); named.output.expectedCommit = f.source;
  assert.equal((await compareAndSwapCandidateRef(named)).code, 'output-checked-out');
  assert.equal(f.text('rev-parse', outputRef), f.source);
});

test('candidate requires exactly the raw source parent, including under repository grafts', async (t) => {
  const f = fixture(t);
  const unrelated = f.git(['commit-tree', `${f.source}^{tree}`], 'unrelated root\n').toString().trim();
  const input = f.input(); input.candidateCommit = unrelated;
  // Revision walking would see the forged parent, but raw commit headers cannot.
  writeFileSync(join(f.root, '.git/info/grafts'), `${unrelated} ${f.source}\n`);
  const refused = await compareAndSwapCandidateRef(input);
  assert.equal(refused.outcome, 'not-committed'); assert.equal(refused.code, 'candidate-parent-mismatch');
  assert.equal(f.text('for-each-ref', '--format=%(refname)', outputRef), '');
});
