import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { versionAdvances } from '../scripts/check-pr-version.js';
import { load } from 'js-yaml';
import { scratchRepository } from './helpers/canonical.js';

test('PR version check runs without path filters and participates in the aggregate CI result', () => {
  const workflow = load(readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8'));
  const job = workflow.jobs['pr-version'];
  assert.equal(job.if, "github.event_name == 'pull_request'");
  assert.equal(job.needs, undefined);
  assert.equal(job.steps[0].with['fetch-depth'], 0);
  const check = job.steps.find((step) => step.run?.includes('check-pr-version.js'));
  assert.equal(check.env.PR_BASE_SHA, '${{ github.event.pull_request.base.sha }}');
  assert.equal(check.run, 'node scripts/check-pr-version.js "$PR_BASE_SHA"');
  assert.ok(workflow.jobs['ci-ok'].needs.includes('pr-version'));
});

test('PR versions advance stable or rc precedence without numeric precision loss', () => {
  for (const [before, after] of [['3.0.0-rc.1', '3.0.0-rc.2'], ['3.0.0-rc.9', '3.0.0-rc.10'],
    ['3.0.0-rc.2', '3.0.0'], ['3.0.0', '3.0.1'], ['3.0.0', '4.0.0-rc.1'],
    ['3.0.0-rc.9007199254740992', '3.0.0-rc.9007199254740993']]) {
    assert.equal(versionAdvances(before, after), true, `${before} → ${after}`);
  }
  for (const after of ['3.0.0', '3.0.0-rc.1', '2.9.9', '3.0.01', '3.0.1-beta.1', '3.0.1\n']) {
    assert.equal(versionAdvances('3.0.0', after), false, JSON.stringify(after));
  }
});

test('actual PR check requires a version advance, matching lock and changed versioned notes', (t) => {
  const version = '3.0.0-rc.1';
  const root = scratchRepository(t, { 'package.json': JSON.stringify({ version }),
    'package-lock.json': JSON.stringify({ version, packages: { '': { version } } }),
    'CHANGELOG.md': '## [3.0.0-rc.1] - Unreleased\n' }, { commit: true });
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  const write = (file, value) => writeFileSync(join(root, file), typeof value === 'string' ? value : JSON.stringify(value));
  const manifests = (version) => {
    write('package.json', { version });
    write('package-lock.json', { version, packages: { '': { version } } });
  };
  const base = git('rev-parse', 'HEAD');
  const script = fileURLToPath(new URL('../scripts/check-pr-version.js', import.meta.url));
  const run = (ref = base) => spawnSync(process.execPath, [script, ref], { cwd: root, encoding: 'utf8' });
  write('README.md', 'Documentation-only change');
  assert.equal(run().status, 1, 'docs-only changes still require a bump');
  manifests('3.0.0-rc.2');
  assert.equal(run().status, 1, 'unchanged notes refuse');
  write('CHANGELOG.md', '## [3.0.0-rc.2] - Unreleased\n\n- Document the change.\n');
  assert.equal(run().status, 0, run().stderr);
  write('package-lock.json', { version: '3.0.0-rc.2', packages: { '': { version: '3.0.0-rc.1' } } });
  assert.equal(run().status, 1, 'nested lock version must agree');
  manifests('3.0.0-rc.2');
  assert.equal(run('--help').status, 1, 'base must be an exact commit hash');
  assert.equal(run('0'.repeat(40)).status, 1, 'unavailable base cannot pass');
});
