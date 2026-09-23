/** Low-level ref CAS only. This module does not authorize domain publication. */
import { spawn } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { EngineRefusal } from './engine-refusal.js';

const limitKeys = ['maxOutputBytes', 'maxCommandMilliseconds', 'maxTransactionMilliseconds', 'maxWorktrees'];
const closed = (v, keys) => v !== null && typeof v === 'object'
  && [Object.prototype, null].includes(Object.getPrototypeOf(v))
  && Reflect.ownKeys(v).length === keys.length && keys.every((key) => Object.hasOwn(v, key));
const fullOid = (v, width) => typeof v === 'string' && new RegExp(`^[0-9a-f]{${width}}(?![\\s\\S])`).test(v);
const sourceRef = /^refs\/heads\/[A-Za-z0-9][A-Za-z0-9._-]*(?:\/[A-Za-z0-9][A-Za-z0-9._-]*)*(?![\s\S])/;
const outputRef = /^refs\/unknown-knowledge\/candidates\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}(?![\s\S])/;
class Refusal extends EngineRefusal {
  constructor(code) { super(code); this.code = code; }
}
const refuse = (code) => { throw new Refusal(code); };
const environment = { PATH: '/usr/bin:/bin', HOME: '/dev/null', LC_ALL: 'C',
  GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', GIT_NO_REPLACE_OBJECTS: '1',
  GIT_NO_LAZY_FETCH: '1', GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0' };
const prefix = (root) => ['-c', 'core.hooksPath=/dev/null', '-c', 'core.fsmonitor=false', '-C', root];

function planInput(input) {
  if (!closed(input, ['repoRoot', 'source', 'output', 'candidateCommit', 'limits'])
    || typeof input.repoRoot !== 'string' || !input.repoRoot || input.repoRoot.includes('\0')
    || Buffer.from(input.repoRoot).toString('utf8') !== input.repoRoot
    || !closed(input.source, ['ref', 'expectedCommit']) || !closed(input.output, ['ref', 'expectedCommit'])
    || typeof input.source.ref !== 'string' || !sourceRef.test(input.source.ref)
    || typeof input.output.ref !== 'string' || !outputRef.test(input.output.ref)
    || ![input.source.expectedCommit, input.candidateCommit].every((value) => fullOid(value, 40) || fullOid(value, 64))
    || (input.output.expectedCommit !== null && !fullOid(input.output.expectedCommit, 40) && !fullOid(input.output.expectedCommit, 64))
    || !closed(input.limits, limitKeys)
    || !limitKeys.every((key) => Number.isSafeInteger(input.limits[key]) && input.limits[key] > 0)
    || input.limits.maxCommandMilliseconds > 2147483647
    || input.limits.maxTransactionMilliseconds > 2147483647) refuse('invalid-ref-transaction-input');
  return { ...input, source: { ...input.source }, output: { ...input.output }, limits: { ...input.limits } };
}

/** Exact tuple is retained for valid inputs, including an uncertain commit attempt. */
export async function compareAndSwapCandidateRef(input) {
  let plan;
  try { plan = planInput(input); } catch (error) {
    if (!(error instanceof Refusal)) throw error;
    return { outcome: 'not-committed', code: error.code };
  }
  const { repoRoot, source, output, candidateCommit, limits } = plan;
  const tuple = { source, output, candidateCommit };
  const deadline = Date.now() + limits.maxTransactionMilliseconds;
  const remaining = () => {
    const ms = deadline - Date.now();
    if (ms <= 0) refuse('ref-transaction-timeout');
    return Math.min(ms, limits.maxCommandMilliseconds);
  };
  async function git(args, allowed = [0]) {
    const timeout = remaining();
    return new Promise((resolve, reject) => {
      const child = spawn('/usr/bin/git', [...prefix(repoRoot), ...args], { env: environment, stdio: ['ignore', 'pipe', 'pipe'] });
      const chunks = []; let size = 0; let failure = null;
      const stop = (code) => { failure ??= code; child.kill('SIGKILL'); };
      const timer = setTimeout(() => stop('ref-command-timeout'), timeout);
      child.stdout.on('data', (bytes) => {
        size += bytes.length;
        if (size > limits.maxOutputBytes) stop('ref-output-budget'); else chunks.push(bytes);
      });
      child.stderr.on('data', (bytes) => {
        size += bytes.length; if (size > limits.maxOutputBytes) stop('ref-output-budget');
      });
      child.on('error', () => { failure ??= 'ref-command-failure'; });
      child.on('close', (status) => {
        clearTimeout(timer);
        if (failure || !allowed.includes(status)) { reject(new Refusal(failure ?? 'ref-command-failure')); return; }
        const bytes = Buffer.concat(chunks); const text = bytes.toString('utf8');
        if (!Buffer.from(text).equals(bytes)) { reject(new Refusal('ref-output-encoding')); return; }
        resolve({ status, text: text.replace(/\n$/, '') });
      });
    });
  }
  async function direct(ref) {
    if ((await git(['symbolic-ref', '--quiet', ref], [0, 1])).status !== 1) refuse('symbolic-ref');
  }
  async function worktrees() {
    const { text } = await git(['worktree', 'list', '--porcelain', '-z']);
    if (!text.endsWith('\0\0')) refuse('worktree-inventory-invalid');
    const records = text.slice(0, -2).split('\0\0');
    if (records.length > limits.maxWorktrees) refuse('worktree-budget');
    for (const record of records) {
      const fields = record.split('\0');
      if (!fields[0].startsWith('worktree ') || fields[0].length === 9
        || fields.some((field) => field === 'prunable' || field.startsWith('prunable '))) refuse('worktree-inventory-invalid');
      const heads = fields.filter((field) => field.startsWith('HEAD '));
      const branches = fields.filter((field) => field.startsWith('branch '));
      const bare = fields.includes('bare');
      if ((!bare && (heads.length !== 1 || !fullOid(heads[0].slice(5), width)))
        || branches.length > 1 || (!bare && branches.length === 0 && !fields.includes('detached'))) refuse('worktree-inventory-invalid');
      if (branches.includes(`branch ${output.ref}`)) refuse('output-checked-out');
    }
  }
  let width;
  try {
    const top = (await git(['rev-parse', '--show-toplevel'])).text;
    if (realpathSync(repoRoot) !== realpathSync(top)) refuse('ref-repository-root');
    width = { sha1: 40, sha256: 64 }[(await git(['rev-parse', '--show-object-format'])).text];
    if (!width || !fullOid(source.expectedCommit, width) || !fullOid(candidateCommit, width)
      || (output.expectedCommit !== null && !fullOid(output.expectedCommit, width))) refuse('ref-commit-oid');
    for (const ref of [source.ref, output.ref]) { await git(['check-ref-format', ref]); await direct(ref); }
    for (const commit of new Set([source.expectedCommit, candidateCommit, output.expectedCommit].filter(Boolean))) {
      if ((await git(['cat-file', '-t', commit])).text !== 'commit') refuse('ref-object-type');
    }
    const rawCandidate = (await git(['cat-file', 'commit', candidateCommit])).text;
    const headerEnd = rawCandidate.indexOf('\n\n');
    const parents = rawCandidate.slice(0, headerEnd).split('\n').filter((line) => line.startsWith('parent '));
    if (headerEnd < 0 || parents.length !== 1 || parents[0] !== `parent ${source.expectedCommit}`) refuse('candidate-parent-mismatch');
    if ((await git(['show-ref', '--verify', '--hash', source.ref])).text !== source.expectedCommit) refuse('source-ref-stale');
    // --exists distinguishes absent refs from malformed/read failures (Git >= 2.46).
    const present = (await git(['show-ref', '--exists', output.ref], [0, 2])).status === 0;
    if (output.expectedCommit === null ? present : !present
      || (await git(['show-ref', '--verify', '--hash', output.ref])).text !== output.expectedCommit) refuse('output-ref-stale');
    await worktrees();
  } catch (error) {
    if (!(error instanceof Refusal) && !['ENOENT', 'ENOTDIR', 'EACCES'].includes(error.code)) throw error;
    return { outcome: 'not-committed', code: error.code, ...tuple };
  }

  let commitSent = false; let acknowledged = false; let child;
  let timer; let fatal = null; let waiter = null; let buffered = ''; let bytesSeen = 0;
  let closedResolve;
  const closedPromise = new Promise((resolve) => { closedResolve = resolve; });
  const fail = (code) => {
    fatal ??= new Refusal(code);
    if (waiter) { const pending = waiter; waiter = null; pending.reject(fatal); }
    child?.kill('SIGKILL');
  };
  const next = () => {
    if (fatal) return Promise.reject(fatal);
    return new Promise((resolve, reject) => { waiter = { resolve, reject }; drain(); });
  };
  const drain = () => {
    const end = buffered.indexOf('\n');
    if (!waiter || end < 0) return;
    const line = buffered.slice(0, end); buffered = buffered.slice(end + 1);
    const pending = waiter; waiter = null; pending.resolve(line);
  };
  const command = async (record, ack) => {
    if (fatal) throw fatal;
    const commandTimer = setTimeout(() => fail('ref-command-timeout'), remaining());
    try {
      if (ack === 'commit: ok') commitSent = true;
      child.stdin.write(record);
      if (await next() !== ack) refuse('ref-transaction-protocol');
      if (ack === 'commit: ok') acknowledged = true;
    } finally { clearTimeout(commandTimer); }
  };
  try {
    remaining();
    child = spawn('/usr/bin/git', [...prefix(repoRoot), 'update-ref', '--no-deref', '--stdin', '-z'],
      { env: environment, stdio: ['pipe', 'pipe', 'pipe'] });
    timer = setTimeout(() => fail('ref-transaction-timeout'), deadline - Date.now());
    child.on('error', () => fail('ref-transaction-process'));
    child.stdin.on('error', () => fail('ref-transaction-input'));
    child.stdout.on('data', (bytes) => {
      bytesSeen += bytes.length;
      if (bytesSeen > limits.maxOutputBytes) { fail('ref-output-budget'); return; }
      buffered += bytes.toString('utf8'); drain();
    });
    child.stderr.on('data', (bytes) => {
      bytesSeen += bytes.length;
      if (bytesSeen > limits.maxOutputBytes) fail('ref-output-budget');
    });
    child.on('close', () => { closedResolve(); if (!acknowledged) fail('ref-transaction-closed'); });
    await command('start\0', 'start: ok');
    const change = output.expectedCommit === null
      ? `create ${output.ref}\0${candidateCommit}\0`
      : `update ${output.ref}\0${candidateCommit}\0${output.expectedCommit}\0`;
    await command(`verify ${source.ref}\0${source.expectedCommit}\0${change}prepare\0`, 'prepare: ok');
    // Git verify resolves a symref even with --no-deref. Locks now protect this check.
    await direct(source.ref); await direct(output.ref); await worktrees();
    await command('commit\0', 'commit: ok');
    child.stdin.end();
    await closedPromise;
    return { outcome: 'committed', code: fatal?.code ?? null, ...tuple };
  } catch (error) {
    child?.kill('SIGKILL');
    if (child) await closedPromise;
    if (!(error instanceof Refusal)) throw error;
    return { outcome: acknowledged ? 'committed' : commitSent ? 'unknown' : 'not-committed',
      code: error.code, ...tuple };
  } finally { clearTimeout(timer); }
}
