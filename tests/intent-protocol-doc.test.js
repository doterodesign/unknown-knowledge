// These pins protect the shipped routing contract, not fresh-reader behavior.
// Subject CLI/registry tests separately exercise capability absence and refusal.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const protocol = name => readFileSync(new URL(`../payload/protocol/${name}`, import.meta.url), 'utf8')
  .replace(/\s+/g, ' ');

test('ordinary retrieval retains intent obligations without requiring the typed Subject workflow', () => {
  const intent = protocol('intent-retrieval.md');
  assert.match(intent, /Ordinary catalog, concept, Knowledge and Decision retrieval does not require a Subject registry, Subject lookup or version 1 plan/);
  assert.match(intent, /Geographic scope, evidence requirements and alternative meanings alone do not select the typed Subject path/);
  assert.match(intent, /Preserve every material entity, relation, direction, comparison, use context, geographic or temporal scope, and requested source standard/);
  assert.match(intent, /Keep uncertain or unsupported parts as unresolved units, clarifications or source requirements/);
  assert.match(intent, /For the typed Subject path, build the plan below/);
  // RESOLVE starts with ask; the typed path is reached only for governed Subject eligibility.
  assert.match(protocol('AGENTS.md').replace(/\s+/g, ' '), /For combined Subject constraints that need governed eligibility, follow \[Intent, query discovery and source review\]\(intent-retrieval\.md\)/);
});

test('Subject routing distinguishes actual optional authority from invalid or missing required capability', () => {
  const intent = protocol('intent-retrieval.md');
  assert.match(intent, /only when the request needs declared Subject identities, Subject-based bindings or governed Subject queries, and the selected installation provides that authority/);
  assert.match(intent, /inspect the exact `<kit-root>\/subjects\/registry\.yaml` path without recursive discovery/);
  assert.match(intent, /An absent authority is an unavailable optional capability, not an empty registry or a lookup with zero matches/);
  assert.match(intent, /A present malformed, unreadable or nonregular authority is a failure, not optional absence/);
  assert.match(intent, /If Subject semantics are required but the authority is absent, report that capability as unavailable; do not silently substitute ordinary retrieval/);
  assert.match(intent, /Do not invoke a Subject command merely to probe availability/);
});

test('routing never excuses an actual engine failure or dependent metadata after exit2', () => {
  const intent = protocol('intent-retrieval.md');
  assert.match(intent, /Inspect each engine result before launching the next dependent command/);
  assert.match(intent, /Any actual engine exit 2 stops the governed task immediately, including further metadata navigation in the same script/);
  assert.match(intent, /Select every canonical Ontology ID with `preflight\.js --concepts` and every canonical Knowledge ID with `--leaves`, using the current injected `--today`/);
  assert.match(intent, /An inaccessible source leaves its claim unverified, not disproved/);
});
