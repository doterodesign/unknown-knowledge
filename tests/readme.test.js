// The README makes claims about the engine. They are held to the code.
//
// The root README had drifted twice over: it called the engine "TypeScript/Node"
// (D-002, superseded by D-022 — the engine has always been JavaScript), and it
// promised that "full client-facing documentation lands with KK-24/KK-28",
// which shipped some time ago.
//
// The seeded README was worse: it linked every client repo to
// github.com/unknown-creatives/unknown-knowledge, which 404s.
//
// A front page nobody checks is a front page that lies. These tests re-derive
// its claims from the source, the way the kit asks its clients to.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXIT_CODES } from '../payload/engine/lib/exit-codes.js';
import { KINDS } from '../payload/engine/lib/extractor-kinds.js';
import { ANCHOR_SIGNATURES } from '../payload/engine/lib/anchor-signatures.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const readme = readFileSync(join(root, 'README.md'), 'utf8');
const seededReadme = readFileSync(join(root, 'payload', 'docs', 'README.md'), 'utf8');

test('the README does not claim the engine is TypeScript', () => {
  // D-022 supersedes D-002. TypeScript may appear as a STACK the extractors
  // read; it may never appear as the language the engine is written in.
  assert.doesNotMatch(readme, /engine[^.]*TypeScript|TypeScript\/Node/i,
    'the engine is JavaScript with JSDoc types (D-022)');
  assert.match(readme, /JavaScript with JSDoc types/);
});

test('the README names every engine surface, and invents none', () => {
  const shipped = readdirSync(join(root, 'payload', 'engine'))
    .filter((f) => f.endsWith('.js'))
    .sort();
  for (const surface of shipped) {
    assert.ok(readme.includes(`\`${surface}\``),
      `engine/${surface} ships and the README never mentions it`);
  }
  // And nothing it names has since been deleted.
  for (const [, named] of readme.matchAll(/\|\s*`([a-z-]+\.js)`\s*\|/g)) {
    assert.ok(shipped.includes(named), `the README documents ${named}, which no longer exists`);
  }
  // The prose spells the number out; a digit here would fail on style, not fact.
  const words = { 6: 'Six', 7: 'Seven', 8: 'Eight', 9: 'Nine' };
  assert.ok(words[shipped.length], `teach this test the word for ${shipped.length}`);
  assert.match(readme, new RegExp(`${words[shipped.length]} command-line surfaces`, 'i'),
    `the README must say how many surfaces there are (${shipped.length})`);
});

test('the README states the exit-code contract the engine actually implements', () => {
  assert.equal(EXIT_CODES.CLEAN, 0);
  assert.equal(EXIT_CODES.FINDINGS, 1);
  assert.equal(EXIT_CODES.FAILURE, 2);
  // The distinction the whole contract rests on: 1 means the check RAN.
  assert.match(readme, /`1`\s*\|\s*the check ran and \*\*found something\*\*/);
  assert.match(readme, /`2`\s*\|\s*the check \*\*did not run\*\*/);
});

test('the README counts the extractor kinds correctly', () => {
  const registered = Object.keys(KINDS).length;
  const proposable = new Set(ANCHOR_SIGNATURES.map((s) => s.kind)).size;
  const words = { 12: 'Twelve', 13: 'Thirteen', 14: 'Fourteen' };
  assert.ok(words[registered], `teach this test the word for ${registered}`);
  assert.match(readme, new RegExp(`${words[registered]} extractor kinds ship`, 'i'),
    `${registered} kinds are registered`);
  assert.match(readme, new RegExp(`${words[proposable]} of them the survey map can`, 'i'),
    `${proposable} kinds carry an anchor signature`);
});

test('the README makes no promise that has already been kept', () => {
  // "Full client-facing documentation lands with KK-24/KK-28." It landed.
  assert.doesNotMatch(readme, /lands with KK-/, 'a shipped promise is not a promise');
});

test('the README claims only one subprocess, and that is true', () => {
  assert.match(readme, /the one subprocess it\s+runs is `git ls-files`/);
  const engineDir = join(root, 'payload', 'engine');
  const spawners = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) { walk(path); continue; }
      if (entry.name.endsWith('.js') && /node:child_process/.test(readFileSync(path, 'utf8'))) spawners.push(entry.name);
    }
  };
  walk(engineDir);
  assert.deepEqual(spawners, ['survey-map.js'], 'only the survey map spawns anything (D-014)');
});

test('the seeded README links somewhere that exists', () => {
  // It shipped `github.com/unknown-creatives/unknown-knowledge`, which 404s,
  // into every client repo. The npm SCOPE `@unknown-creatives` is reserved and
  // legitimate (D-017); the GitHub org is not.
  assert.doesNotMatch(seededReadme, /github\.com\/unknown-creatives/,
    'that GitHub organisation does not exist');
  assert.match(seededReadme, /github\.com\/doterodesign\/unknown-knowledge/);
});

test('no shipped payload file links to the non-existent GitHub org', () => {
  const offenders = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) { walk(path); continue; }
      if (/github\.com\/unknown-creatives/.test(readFileSync(path, 'utf8'))) offenders.push(path.slice(root.length));
    }
  };
  walk(join(root, 'payload'));
  assert.deepEqual(offenders, [], `these seeded files link to a 404: ${offenders.join(', ')}`);
});
