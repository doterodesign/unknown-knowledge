// KK-27 governance test: audit is proposal-first by design — never a CI gate.
// The reverse audit grows the map by drafting concepts for human review;
// presenting it as a blocking check would flip the whole protocol from
// proposal-first to gate-first. This grep-style sweep pins that rule to every
// SHIPPED file (payload/ — engine, protocol docs, templates, wrappers, plus
// the user-facing README): audit language may never be gating language.
//
// Two targeted assertions against the real risk:
//   1. --fail-on-findings is a HUMAN opt-in. Any shipped file that mentions
//      the flag must, in the same file, carry the "never" framing (never a
//      CI default / never a gate) — so no doc or template can quietly
//      recommend it as a CI default.
//   2. No shipped line may pair audit with gate words (blocking, CI gate,
//      must pass, required check, fail the build) unless the same line
//      negates them (never/not/non-/advisory). Line-level on purpose: the
//      risk is a sentence recommending gating, not the words existing apart.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));

/** Shipped surface: everything under payload/ + the user-facing README. */
function shippedFiles() {
  const out = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.isFile()) out.push(path);
    }
  };
  walk(join(repoRoot, 'payload'));
  out.push(join(repoRoot, 'README.md'));
  return out.sort();
}

const GATE_WORDS = /\b(blocking|CI gate|gate the|must pass|required check|fails? the build)\b/i;
// Negation must sit ON the gate phrase (within a few words before it), not
// merely anywhere on the line — "audit is a required check; do not skip
// other steps" must still fail the sweep.
const NEGATED = /\b(never|not|no|isn't|aren't|non|nor)\b(?:\W+\w+){0,3}?\W+(a\s+|the\s+)?(blocking|CI gate|gate the|must pass|required check|fails? the build)|\b(non-blocking|advisory|never)\b(?:\W+\w+){0,2}?\W*$|\b(blocking|CI gate|gate)\b.{0,30}\b(never|advisory|non-blocking)\b/i;

test('shipped files mentioning --fail-on-findings always carry the never-a-CI-default framing', () => {
  let mentioned = 0;
  for (const file of shippedFiles()) {
    const text = readFileSync(file, 'utf8');
    if (!text.includes('--fail-on-findings')) continue;
    mentioned += 1;
    assert.match(
      text, /\bnever\b/i,
      `${relative(repoRoot, file)} mentions --fail-on-findings without the "never a CI default" framing — audit is proposal-first by design, never a CI gate`,
    );
  }
  // The sweep must be exercising something real: audit.js itself documents the flag.
  assert.ok(mentioned >= 1, 'sweep found no shipped mention of --fail-on-findings — did the flag or layout move?');
});

test('no shipped line presents audit as a blocking check or CI gate', () => {
  for (const file of shippedFiles()) {
    const lines = readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, i) => {
      if (!/\baudit/i.test(line) || !GATE_WORDS.test(line)) return;
      assert.ok(
        NEGATED.test(line),
        `${relative(repoRoot, file)}:${i + 1} pairs audit with gating language and no negation — audit is proposal-first by design, never a CI gate:\n  ${line.trim()}`,
      );
    });
  }
});
