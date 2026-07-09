// UCS-941: Suppression behind its own seam, and each Finding carries its
// own identity.
//
// The identity used to be derived by a function that switched on the Finding's
// code. A third Finding code was one forgotten `if` away from being permanently
// unsuppressable — silently, and only once it reached a client's Store: the
// audit would run clean, the entry the steward wrote would be ignored, and the
// finding they had rejected would come back every single run.
//
// Now identity is stamped where the Finding is built, and a Finding without one
// is refused. The old suppression suite (tests/audit-suppressions.test.js)
// still exercises this through the CLI; these tests pin the seam directly.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  loadSuppressions,
  partitionBySuppression,
  suppressibleBy,
  suppressionEntryProblem,
  SUPPRESSION_FIELDS,
  SUPPRESSION_IDENTITY,
  SUPPRESSIONS_FILE,
} from '../payload/engine/lib/suppressions.js';

const entry = (over = {}) => ({
  term: 'markets', sourcePath: 'src/markets.ts', reason: 'not a concept', date: '2026-07-09', ...over,
});

/** A kit root holding the given suppressions.yaml text (or none at all). */
function kitRoot(t, text) {
  const dir = mkdtempSync(join(tmpdir(), 'uk-suppress-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  if (text !== undefined) writeFileSync(join(dir, SUPPRESSIONS_FILE), text);
  return dir;
}

// ------------------------------------------- identity travels with the finding

test('a finding carries the identity that would silence it', () => {
  const finding = suppressibleBy({ code: 'unmatched-anchor', path: 'src/markets.ts' },
    { term: 'markets', sourcePath: 'src/markets.ts' });
  assert.deepEqual(finding[SUPPRESSION_IDENTITY], { term: 'markets', sourcePath: 'src/markets.ts' });
  assert.equal(finding.code, 'unmatched-anchor', 'the finding is otherwise untouched');
});

test('the identity never reaches the wire — the JSON payload is a contract', () => {
  const finding = suppressibleBy({ code: 'stale-last-verified', concept: 'K-110' },
    { term: 'K-110', sourcePath: 'K-110' });
  assert.equal(JSON.stringify(finding), '{"code":"stale-last-verified","concept":"K-110"}');
  assert.deepEqual(Object.keys(finding), ['code', 'concept']);
});

test('the identity survives the spread that builds findings', () => {
  const finding = suppressibleBy({ code: 'x' }, { term: 't', sourcePath: 'p' });
  assert.deepEqual({ ...finding }[SUPPRESSION_IDENTITY], { term: 't', sourcePath: 'p' });
});

test('an identity must be nameable — an empty term or path is refused at the source', () => {
  for (const bad of [{ term: '', sourcePath: 'p' }, { term: 't', sourcePath: '' }, {}, null, undefined]) {
    assert.throws(() => suppressibleBy({ code: 'x' }, bad), /non-empty term and sourcePath/);
  }
});

// --------------------------------- a new Finding code cannot go unsuppressable

test('a finding with no identity is refused, not silently kept', () => {
  // The whole point of the seam. Under the old switch, an unrecognised code
  // fell through to the `stale-last-verified` branch and was matched against
  // `finding.concept` — undefined — so it could never be suppressed, and
  // nothing said so.
  const orphan = { code: 'some-new-code-someone-added', path: 'src/x.ts' };
  assert.throws(() => partitionBySuppression([orphan], []),
    /carries no suppression identity/,
    'a new Finding code must announce itself, loudly, the first time the audit runs');
});

test('the refusal names the code, so the fix is obvious', () => {
  assert.throws(() => partitionBySuppression([{ code: 'brand-new' }], []),
    /finding "brand-new" carries no suppression identity/);
});

test('nothing in the seam switches on a finding code', async () => {
  // Structural. The identity contract used to be stated twice — once in prose,
  // once in a switch — and the two could disagree. If a `finding.code ===`
  // comparison ever reappears here, the seam has grown the knowledge back.
  const source = await readFile(fileURLToPath(new URL('../payload/engine/lib/suppressions.js', import.meta.url)), 'utf8');
  assert.doesNotMatch(source, /finding\.code\s*===/, 'the seam must not know what Finding codes exist');
  assert.doesNotMatch(source, /['"]unmatched-anchor['"]/, 'the seam must not name a Finding code');
  assert.doesNotMatch(source, /['"]stale-last-verified['"]/, 'the seam must not name a Finding code');
});

test('the audit stamps every finding it builds, and derives no identity itself', async () => {
  const source = await readFile(fileURLToPath(new URL('../payload/engine/commands/audit.js', import.meta.url)), 'utf8');
  assert.doesNotMatch(source, /function suppressionIdentity/, 'the switch is gone, not moved');
  // Every `findings.push(` must go through the stamp.
  const pushes = source.match(/findings\.push\(/g) ?? [];
  const stamped = source.match(/findings\.push\(suppressibleBy\(/g) ?? [];
  assert.ok(pushes.length >= 2, 'the audit builds at least the two v1 finding codes');
  assert.equal(stamped.length, pushes.length,
    'a finding built without suppressibleBy() would crash the audit at partition time — stamp it where it is built');
});

// -------------------------------------------------- exact match, and only that

test('an entry suppresses a finding only when BOTH fields match exactly', () => {
  const finding = suppressibleBy({ code: 'unmatched-anchor' }, { term: 'markets', sourcePath: 'src/markets.ts' });
  const cases = [
    [entry(), 1, 'both fields equal'],
    [entry({ term: 'market' }), 0, 'term differs'],
    [entry({ sourcePath: 'src/Markets.ts' }), 0, 'path differs by case'],
    [entry({ sourcePath: 'src/markets.ts ' }), 0, 'path differs by trailing space'],
    [entry({ term: 'markets*' }), 0, 'no globs — a pattern is not a match (§11.1)'],
  ];
  for (const [e, expectSuppressed, why] of cases) {
    const { kept, suppressed } = partitionBySuppression([finding], [e]);
    assert.equal(suppressed.length, expectSuppressed, why);
    assert.equal(kept.length, 1 - expectSuppressed, why);
  }
});

test('partition preserves order, so both lists stay stable', () => {
  const findings = ['a', 'b', 'c', 'd'].map((p) => suppressibleBy({ code: 'unmatched-anchor', path: p }, { term: p, sourcePath: p }));
  const { kept, suppressed } = partitionBySuppression(findings, [entry({ term: 'b', sourcePath: 'b' }), entry({ term: 'd', sourcePath: 'd' })]);
  assert.deepEqual(kept.map((f) => f.path), ['a', 'c']);
  assert.deepEqual(suppressed.map((f) => f.path), ['b', 'd']);
});

test('no entries suppresses nothing', () => {
  const findings = [suppressibleBy({ code: 'x' }, { term: 't', sourcePath: 'p' })];
  assert.deepEqual(partitionBySuppression(findings, []), { kept: findings, suppressed: [] });
});

// ------------------------------------------------------------- it fails open

test('a missing file is a silent no-op', (t) => {
  assert.deepEqual(loadSuppressions(kitRoot(t)), { entries: [], warnings: [] });
});

test('an empty or comment-only file is a silent no-op, not a broken one', (t) => {
  // js-yaml raises "expected a document, but the input is empty" for all three
  // of these, so a steward who commented out their last suppression used to be
  // told their file was unparseable. Nothing is wrong with the file: it has no
  // entries, which is exactly what it says.
  for (const text of ['', '\n\n', '# every suppression was reconsidered\n', '   \n\t\n']) {
    assert.deepEqual(loadSuppressions(kitRoot(t, text)), { entries: [], warnings: [] },
      `an empty document must not warn: ${JSON.stringify(text)}`);
  }
  // A file that genuinely cannot be parsed still warns.
  assert.equal(loadSuppressions(kitRoot(t, '- term: [unclosed\n')).warnings.length, 1);
});

test('unparseable YAML warns and suppresses nothing — never an engine failure', (t) => {
  const { entries, warnings } = loadSuppressions(kitRoot(t, '- term: [unclosed\n'));
  assert.deepEqual(entries, [], 'a broken file must not be able to silence a finding');
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /unparseable YAML/);
  assert.match(warnings[0], /fails open, findings resurface/);
});

test('a document that is not a list warns and suppresses nothing', (t) => {
  const { entries, warnings } = loadSuppressions(kitRoot(t, 'term: markets\n'));
  assert.deepEqual(entries, []);
  assert.match(warnings[0], /must be a YAML list/);
});

test('one malformed entry is dropped; its neighbours still suppress', (t) => {
  // Fails open per ENTRY, not per file: a typo in the third entry must not
  // resurrect the findings the first two deliberately silenced.
  const text = [
    '- { term: a, sourcePath: a, reason: r, date: 2026-07-09 }',
    '- { term: b, sourcePath: b, reason: r, date: not-a-date }',
    '- { term: c, sourcePath: c, reason: r, date: 2026-07-09 }',
    '',
  ].join('\n');
  const { entries, warnings } = loadSuppressions(kitRoot(t, text));
  assert.deepEqual(entries.map((e) => e.term), ['a', 'c']);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /entry 2 ignored \(fails open, its finding resurfaces\)/);
  assert.match(warnings[0], /"date" must be an ISO date/);
});

test('the strict v1 entry shape: every field required, no extras, no expiry', () => {
  assert.equal(suppressionEntryProblem(entry()), null);
  assert.match(suppressionEntryProblem([]), /not a mapping/);
  assert.match(suppressionEntryProblem(null), /not a mapping/);
  assert.match(suppressionEntryProblem('x'), /not a mapping/);
  for (const field of SUPPRESSION_FIELDS) {
    assert.match(suppressionEntryProblem(entry({ [field]: '' })), new RegExp(`"${field}" must be a non-empty string`));
    assert.match(suppressionEntryProblem(entry({ [field]: '   ' })), new RegExp(`"${field}" must be a non-empty string`));
    assert.match(suppressionEntryProblem(entry({ [field]: 7 })), new RegExp(`"${field}" must be a non-empty string`));
  }
  // A field the entry author invented is refused, so `expires: 2027-01-01`
  // cannot look like it works while doing nothing (§11.1: no expiry).
  assert.match(suppressionEntryProblem(entry({ expires: '2027-01-01' })), /unknown field\(s\) "expires"/);
  assert.match(suppressionEntryProblem(entry({ pattern: '*' })), /no patterns, no expiry/);
});

test('a malformed entry never becomes an engine failure', (t) => {
  // Suppression is advisory-side. Every malformed shape returns warnings.
  for (const text of ['- 7\n', '- [a, b]\n', '- {}\n', 'null\n', '42\n']) {
    assert.doesNotThrow(() => loadSuppressions(kitRoot(t, text)), `loadSuppressions must not throw on ${JSON.stringify(text)}`);
  }
});
