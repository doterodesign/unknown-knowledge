// UCS-938: the glossary is held to the code, not to memory.
//
// D-002 recorded "the engine is TypeScript/Node with zero build step". The
// engine has been 27 JavaScript files and zero TypeScript files since the first
// commit — zero-build and TypeScript are mutually exclusive without a loader or
// a type-stripping runtime. The code chose correctly; the decision record never
// caught up, and CONTEXT.md repeated the claim.
//
// A kit whose entire purpose is catching conceptual drift was carrying some, in
// the one store it owns. These tests are the anchor that keeps it honest — the
// same relationship the kit asks of its clients: a claim, re-derived from the
// source of truth, and diffed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { load } from 'js-yaml';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const context = readFileSync(join(root, 'CONTEXT.md'), 'utf8');
const engineDir = join(root, 'payload', 'engine');

/** Every decision entry, by id. */
function decisions() {
  const dir = join(root, 'decisions', 'entries');
  const byId = new Map();
  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.yaml')) continue;
    for (const entry of load(readFileSync(join(dir, file), 'utf8')).entries) byId.set(entry.id, entry);
  }
  return byId;
}

// ------------------------------------------------- the decision matches the code

test('the engine is JavaScript, and no build step exists', () => {
  const ts = readdirSync(engineDir, { recursive: true }).filter((f) => String(f).endsWith('.ts'));
  const js = readdirSync(engineDir, { recursive: true }).filter((f) => String(f).endsWith('.js'));
  assert.deepEqual(ts, [], 'the engine carries no TypeScript');
  assert.ok(js.length >= 20, `the engine is JavaScript (${js.length} files)`);

  const { scripts } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  assert.ok(!Object.hasOwn(scripts, 'build'), 'zero build step — there is nothing to build');
});

test('D-002 is superseded, and its reasoning was preserved rather than rewritten', () => {
  const d002 = decisions().get('D-002');
  assert.equal(d002.status, 'superseded');
  assert.deepEqual(d002['superseded-by'], ['D-022']);
  // Status transitions never rewrite recorded reasoning (§3.3). The original
  // context and decision must still say what was decided, and why, in 2026-07.
  assert.match(d002.context, /Node is ubiquitous in CI/, 'the original context stands');
  assert.match(d002.decision, /TypeScript\/Node/, 'the original claim is preserved, not edited away');
  assert.equal(d002.date, '2026-07-07', 'the original date is untouched');
});

test('D-022 supersedes D-002 and carries its reasoning forward', () => {
  const d022 = decisions().get('D-022');
  assert.equal(d022.status, 'accepted');
  assert.deepEqual(d022.supersedes, ['D-002']);
  assert.deepEqual(d022['superseded-by'], []);
  assert.match(d022.decision, /JavaScript/);
  assert.match(d022.decision, /JSDoc/);
  assert.match(d022.decision, /zero build step/);
  // The reasoning that still holds, carried forward rather than reinvented.
  assert.match(d022.context, /Node is ubiquitous in CI/);
  assert.match(d022.context, /no binaries/);
});

test('the supersede chain resolves in both directions', () => {
  const byId = decisions();
  for (const [id, entry] of byId) {
    for (const target of entry.supersedes ?? []) {
      const other = byId.get(target);
      assert.ok(other, `${id} supersedes ${target}, which does not exist`);
      assert.ok((other['superseded-by'] ?? []).includes(id),
        `${id} supersedes ${target}, but ${target} does not point back — the mirror pair is half-written`);
      assert.equal(other.status, 'superseded', `${target} is superseded but does not say so`);
    }
    for (const target of entry['superseded-by'] ?? []) {
      assert.ok((byId.get(target)?.supersedes ?? []).includes(id), `${id} claims ${target} supersedes it, but ${target} does not`);
    }
  }
});

test('the catalog names every decision file, and every file is catalogued', () => {
  const catalog = load(readFileSync(join(root, 'decisions', '_catalog.yaml'), 'utf8'));
  const catalogued = new Set(catalog.entries.map((e) => e.id));
  for (const id of decisions().keys()) assert.ok(catalogued.has(id), `${id} is not in the catalog`);
  assert.ok(catalogued.has('D-022'), 'D-022 is catalogued');
});

// ---------------------------------------------- the glossary matches the code

test('the Engine term no longer claims TypeScript', () => {
  assert.doesNotMatch(context, /TypeScript/i,
    'CONTEXT.md must not claim a language the engine does not use');
  assert.match(context, /JavaScript \(ESM\) with JSDoc types/);
  assert.match(context, /D-022/, 'and it cites the decision that says so');
});

test('the Engine term names every shipped engine surface', () => {
  // The glossary listed four surfaces. Four more shipped after it was written —
  // including preflight, the one that computes Verdicts. Re-derive the list
  // from the code, the way the kit asks its clients to.
  const shipped = readdirSync(engineDir).filter((f) => f.endsWith('.js')).map((f) => f.replace(/\.js$/, ''));
  // Collapse the prose's line wrapping: where CONTEXT.md breaks a line is not
  // a fact about the engine.
  const term = /\*\*Engine\*\*[\s\S]*?\n\n/.exec(context)[0].replace(/\s+/g, ' ');

  /** What the glossary calls each surface. */
  const prose = {
    validate: 'structural validator',
    'validate-values': 'value validator',
    preflight: 'preflight',
    resolve: 'resolver',
    'survey-map': 'survey map',
    audit: 'reverse audit',
    'log-entry': 'log-entry helper',
  };
  for (const surface of shipped) {
    assert.ok(Object.hasOwn(prose, surface),
      `engine/${surface}.js shipped and the glossary has no name for it — teach CONTEXT.md the term`);
    assert.ok(term.includes(prose[surface]),
      `the Engine term never mentions the ${prose[surface]} (engine/${surface}.js)`);
  }
});

test('CONTEXT.md no longer speaks from before the repo existed', () => {
  assert.doesNotMatch(context, /moves to the `unknown-knowledge` repo when it exists/,
    'the repo exists; this file is in it');
});
