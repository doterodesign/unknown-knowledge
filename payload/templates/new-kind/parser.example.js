#!/usr/bin/env node
/**
 * new-kind drafting template — parser skeleton (PRD §5.2 DRAFT step).
 *
 * This file demonstrates the SHAPE of an extractor-kind parser using a
 * deliberately trivial demo kind, `line-list`: a plain-text file whose value
 * set is one `- value` line per value. Copy it, rename the kind, and replace
 * the extraction logic — keep the contract:
 *
 *   1. PURE + DETERMINISTIC: source text in, value set out. No imports of
 *      repo content, no eval, no spawn, no network, no wall clock (D-014 —
 *      the engine only ever *reads* the anchor lexically).
 *   2. HARD-ERROR, NEVER GUESS: anything the recipe can't parse is a thrown
 *      error, not a skipped line. A recipe that can't parse errors loudly
 *      instead of hiding (PRD §5).
 *   3. DECLARE A SYNTACTIC ENVELOPE: hard-error when out-of-envelope
 *      sentinels appear in the matched span. A confident wrong parse is a
 *      false all-clear — the D-005/D-012 failure class.
 *   4. VALUES ARE STRINGS, compared byte-exact and case-sensitive, as sets
 *      (§3.5): emit strings; order is irrelevant; duplicates in source are
 *      the caller's finding, so emit them as read.
 *
 * D-005 applies to this file's whole lifecycle: drafted in a session, it is
 * NEVER wired into the validator in that session. It enters through GATE —
 * a PR carrying this parser, its fixture (fixture/sample.list →
 * fixture/EXPECTED.yaml), and a demo run against the live anchor the miss
 * recorded. See payload/protocol/new-kind-pipeline.md.
 */
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import process from 'node:process';

/** Rename per kind: lowercase, digits, hyphens (enumerates `kind` pattern). */
export const KIND = 'line-list';

// The envelope, stated as data so the fixture and the review can see it:
// blank lines and `#` comments are ignored; `- value` lines emit a value;
// ANY other line is an out-of-envelope sentinel and hard-errors.
const VALUE_LINE = /^- (\S.*)$/;
const IGNORED_LINE = /^(\s*|#.*)$/;

/**
 * Extract the value set from one anchor's source text.
 *
 * @param {string} text the anchor file's content (read lexically, never imported)
 * @param {string} [file] anchor path, for error messages only
 * @returns {string[]} values as read (strings; caller compares as a set)
 */
export function extractValues(text, file = '<anchor>') {
  const values = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const match = VALUE_LINE.exec(line);
    if (match) {
      values.push(match[1]);
    } else if (!IGNORED_LINE.test(line)) {
      // Out-of-envelope sentinel: hard-error loudly, never skip (PRD §5).
      throw new Error(`${file}:${i + 1}: line is outside the ${KIND} envelope (expected blank, "#" comment, or "- value"): ${JSON.stringify(line)}`);
    }
  }
  if (values.length === 0) {
    // A pointer at a file with no values is the wrong-pointer signature —
    // an empty claim silently passing would be a false all-clear.
    throw new Error(`${file}: no ${KIND} values found — wrong pointer, or the anchor is no longer reified`);
  }
  return values;
}

// Demo-run CLI (the third DRAFT artifact): run the draft against the live
// anchor the miss recorded and attach the output to the GATE PR.
//   node parser.example.js <anchor-path>
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const file = process.argv[2];
  if (!file) {
    process.stderr.write(`usage: node parser.example.js <anchor-path>\n`);
    process.exitCode = 2;
  } else {
    try {
      const values = extractValues(readFileSync(file, 'utf8'), file);
      console.log(JSON.stringify({ kind: KIND, file, values }, null, 2));
    } catch (error) {
      process.stderr.write(`${KIND}: ${error.message}\n`);
      process.exitCode = 2; // a check that never ran is a blocking defect
    }
  }
}
