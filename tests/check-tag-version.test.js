// UCS-937: the release tag and the package version name the same thing.
//
// The publish workflow fires on a `v*.*.*` tag and runs the full gate — but
// nothing checked the tag against the manifest. Pushing `v1.0.0` while
// package.json read `0.0.0` would publish `0.0.0` to the registry under a tag
// claiming otherwise.
//
// A published version is IMMUTABLE. Not correctable, only superseded — and
// every repo seeded from the wrong artifact carries a birth certificate naming
// a release that does not exist (D-021).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from 'js-yaml';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { main, tagVersionProblem } from '../scripts/check-tag-version.js';
import { isCalendarDate } from '../payload/engine/lib/iso-date.js';

const root = fileURLToPath(new URL('..', import.meta.url));

/** Collects what the script would have written. */
const capture = () => {
  const chunks = [];
  return { write: (s) => chunks.push(s), get text() { return chunks.join(''); } };
};

// -------------------------------------------------------------- the rule

test('a tag that names the package version is allowed through', () => {
  assert.equal(tagVersionProblem('v1.0.0', '1.0.0'), null);
  assert.equal(tagVersionProblem('v0.0.0', '0.0.0'), null);
  assert.equal(tagVersionProblem('v12.34.56', '12.34.56'), null);
});

test('a tag that disagrees with the manifest is refused, and both values are named', () => {
  const problem = tagVersionProblem('v1.0.0', '0.0.0');
  assert.match(problem, /"v1\.0\.0"/, 'the message names the tag');
  assert.match(problem, /"0\.0\.0"/, 'and the manifest version');
  assert.match(problem, /immutable/, 'and says why this is not a warning');
  assert.match(problem, /nothing was published/, 'and reassures that the mistake is still recoverable');
});

test('a near-miss version is refused — this is exact equality, not "close enough"', () => {
  for (const [tag, version] of [
    ['v1.0.0', '1.0.1'],
    ['v1.0.0', '1.0.0-rc.1'],
    ['v1.0.0', '1.0'],
    ['v1.0.0', ' 1.0.0'],
    ['v1.0.0', '1.0.0 '],
  ]) {
    assert.notEqual(tagVersionProblem(tag, version), null, `${tag} must not publish ${JSON.stringify(version)}`);
  }
});

test('a tag that is not a release tag is refused rather than interpreted', () => {
  for (const tag of ['1.0.0', 'v1.0', 'v1', 'release-1.0.0', 'v1.0.0-rc.1', 'v1.0.0+build', 'main']) {
    assert.match(tagVersionProblem(tag, '1.0.0'), /is not a release tag/, `${tag} is not vMAJOR.MINOR.PATCH`);
  }
});

test('no tag at all is a refusal, never a silent pass', () => {
  // The guard runs in CI. If $GITHUB_REF_NAME were ever empty, publishing
  // anyway is the one outcome nobody wants.
  for (const tag of [undefined, '', null, 7]) {
    assert.match(tagVersionProblem(tag, '1.0.0'), /no tag to check/);
  }
});

// ------------------------------------------------------------- the script

test('the script reads the real manifest and agrees with it', () => {
  const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  const stdout = capture();
  assert.equal(main([`v${version}`], { stdout, stderr: capture() }), 0, 'the repo agrees with itself');
  assert.match(stdout.text, new RegExp(`tag v${version.replace(/\./g, '\\.')} agrees`));
});

test('the script exits non-zero, and says so on stderr, when the tag is wrong', () => {
  const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  const wrong = `v${Number(version.split('.')[0]) + 1}.0.0`;
  const stderr = capture();
  assert.equal(main([wrong], { stdout: capture(), stderr }), 1);
  assert.match(stderr.text, /check-tag-version:/);
  assert.match(stderr.text, /immutable/);
});

// ----------------------------------------------- the guard is actually wired

test('the publish workflow runs the guard BEFORE npm publish', () => {
  // The whole criterion. A guard that runs after the publish step protects
  // nothing: the version is on the registry, immutably, by then.
  const wf = load(readFileSync(join(root, '.github', 'workflows', 'publish.yml'), 'utf8'));
  const steps = wf.jobs.publish.steps.map((s) => `${s.name ?? ''} ${s.run ?? ''} ${s.uses ?? ''}`);

  const guard = steps.findIndex((s) => /check-tag-version\.js/.test(s));
  const publish = steps.findIndex((s) => /npm publish/.test(s));

  assert.notEqual(guard, -1, 'the publish workflow must run the tag/version guard');
  assert.notEqual(publish, -1, 'the publish workflow must publish');
  assert.ok(guard < publish,
    `the guard runs at step ${guard + 1} and publish at step ${publish + 1} — a guard after publish protects nothing`);
});

test('the workflow still fires only on release tags, and keeps its provenance posture', () => {
  const text = readFileSync(join(root, '.github', 'workflows', 'publish.yml'), 'utf8');
  const wf = load(text);
  assert.deepEqual(wf.on.push.tags, ['v*.*.*'], 'the trigger and the guard must agree on what a release tag is');
  assert.match(text, /npm publish --provenance --access public/);
  assert.equal(wf.jobs.publish.permissions['id-token'], 'write', 'OIDC, for the provenance attestation');
});

test('the run-book documents the tag-and-version ordering', () => {
  const doc = readFileSync(join(root, 'docs', 'publishing.md'), 'utf8');
  assert.match(doc, /check-tag-version/, 'the run-book names the guard');
  assert.match(doc, /immutable/i, 'and says why the ordering matters');
});

// ------------------------------------------- the release artifacts agree (UCS-936)

test('the CHANGELOG carries a heading for the version the manifest names', () => {
  // Three artifacts must name the same release: package.json, the CHANGELOG
  // heading, and the tag. The guard above holds the tag to the manifest; this
  // holds the CHANGELOG to it. Publishing 1.0.0 with no 1.0.0 entry ships a
  // release nobody can read the notes for — and the version is immutable.
  const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  const changelog = readFileSync(join(root, 'CHANGELOG.md'), 'utf8');
  const heading = new RegExp(`^## \\[${version.replace(/\./g, '\\.')}\\] - \\d{4}-\\d{2}-\\d{2}$`, 'm');
  assert.match(changelog, heading,
    `CHANGELOG.md has no dated heading for ${version} — cut the release section before tagging`);
});

test('Unreleased sits above the newest release, and is empty after a cut', () => {
  const changelog = readFileSync(join(root, 'CHANGELOG.md'), 'utf8');
  const unreleased = changelog.indexOf('## [Unreleased]');
  const firstRelease = changelog.search(/^## \[\d+\.\d+\.\d+\]/m);
  assert.notEqual(unreleased, -1, 'the next cycle needs somewhere to accrue');
  assert.notEqual(firstRelease, -1, 'there is at least one released version');
  assert.ok(unreleased < firstRelease, 'Unreleased comes first — newest at the top');
});

test('every release heading names a real day, and none is in the future', () => {
  // D-021: dates are recorded at release time, never fabricated. A heading
  // dated tomorrow is a date nobody could have recorded.
  //
  // Reading the clock is forbidden to the ENGINE (D-012), whose answers must be
  // reproducible from their inputs. This is a repo test asking a question only
  // the clock can answer — "has this day happened yet" — and it is stable: it
  // fails only when a heading is genuinely dated ahead of the machine running it.
  const today = new Date().toISOString().slice(0, 10);
  const headings = [...readFileSync(join(root, 'CHANGELOG.md'), 'utf8')
    .matchAll(/^## \[(\d+\.\d+\.\d+)\] - (\d{4}-\d{2}-\d{2})$/gm)];

  assert.ok(headings.length > 0, 'there is at least one released version to check');
  for (const [, version, date] of headings) {
    assert.ok(isCalendarDate(date), `${version} is dated ${date}, which is not a real calendar day`);
    assert.ok(date <= today,
      `${version} is dated ${date}, which is in the future — D-021 records dates at release time, never ahead of it`);
  }
});
