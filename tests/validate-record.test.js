// KK-02 done-criterion: schema validation callable from the loader (KK-04).
// validate-record.js interprets the payload/schemas/ documents directly and
// layers on the §3.5 conventions that JSON Schema cannot express record-locally.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from 'js-yaml';
import {
  KINDS,
  validateRecord,
  validateStoreFile,
} from '../payload/engine/lib/validate-record.js';

function codesAt(result, path) {
  return result.errors.filter((e) => e.path === path).map((e) => e.code);
}

// ---------------------------------------------------------------- kinds

test('the six kinds cover §3.1–3.4 records plus the navigational grammar', () => {
  assert.deepEqual([...KINDS].sort(), [
    'catalog', 'decision-entry', 'finding', 'knowledge-leaf', 'ontology-concept', 'rules',
  ]);
});

test('unknown kind is a programmer error, not a diagnostic', () => {
  assert.throws(() => validateRecord('nonsense', {}), TypeError);
  assert.throws(() => validateStoreFile('nonsense', {}), TypeError);
});

// ---------------------------------------------------- ontology concept §3.1

const CONCEPT_YAML = `
id: K-210
term: Sport
class: 200-sportsbook
summary: A bettable sport offered by the sportsbook vertical.
definition: >
  Prose is navigation, never the fact.
aliases: [sport type]
source-of-truth: [src/verticals/sportsbook/sports/registry.ts]
owned-by: sportsbook
used-by: [K-220]
confusable-with: []
rationale: [D-004]
status: active
last-verified: "2026-07-07"
enumerates:
  - kind: ts-const-array
    source: src/verticals/sportsbook/sports/registry.ts
    symbol: SUPPORTED_SPORTS
    values: [nfl, nba, mlb, nhl, soccer, tennis]
`;

test('accepts the §3.1 canonical concept, parsed from real YAML', () => {
  const result = validateRecord('ontology-concept', load(CONCEPT_YAML));
  assert.deepEqual(result, { ok: true, errors: [] });
});

test('accepts a minimal concept (rung-4 prose, no pointers yet)', () => {
  const result = validateRecord('ontology-concept', {
    id: 'K-100', term: 'Vertical', class: '100-core',
    summary: 'A product vertical.', status: 'draft',
  });
  assert.equal(result.ok, true, JSON.stringify(result.errors));
});

test('malformed concept: useful path + code per defect', () => {
  const record = load(CONCEPT_YAML);
  delete record.term; //             missing required
  record.status = 'live'; //         outside the §3.5 lifecycle enum
  record.alias = ['typo']; //        unknown key (aliases misspelled)
  record.id = 'K210'; //             malformed id
  const result = validateRecord('ontology-concept', record);
  assert.equal(result.ok, false);
  assert.deepEqual(codesAt(result, 'term'), ['missing-required']);
  assert.deepEqual(codesAt(result, 'status'), ['invalid-enum-value']);
  assert.deepEqual(codesAt(result, 'alias'), ['unknown-property']);
  assert.deepEqual(codesAt(result, 'id'), ['pattern-mismatch']);
});

test('a non-object record is rejected at the root', () => {
  const result = validateRecord('ontology-concept', 'K-210');
  assert.equal(result.ok, false);
  assert.deepEqual(codesAt(result, ''), ['wrong-type']);
});

test('§3.5 YAML coercion trap: non-string enumerates scalars hard-error', () => {
  // Parsed with types intact: true → boolean, 1.0 → number, null stays null.
  const record = load(CONCEPT_YAML.replace(
    'values: [nfl, nba, mlb, nhl, soccer, tennis]',
    'values: [nfl, true, 1.0, null]',
  ));
  const result = validateRecord('ontology-concept', record);
  assert.equal(result.ok, false);
  for (const i of [1, 2, 3]) {
    const path = `enumerates[0].values[${i}]`;
    assert.deepEqual(codesAt(result, path), ['non-string-enumerates-value'], path);
  }
  assert.match(result.errors[0].message, /quote/i, 'message must carry the quote hint');
  assert.deepEqual(codesAt(result, 'enumerates[0].values[0]'), [], 'nfl is fine');
});

test('YAML 1.2 keeps no/on as strings — they validate; the check is on parsed types', () => {
  const record = load(CONCEPT_YAML.replace(
    'values: [nfl, nba, mlb, nhl, soccer, tennis]',
    'values: [no, on, "true"]',
  ));
  const result = validateRecord('ontology-concept', record);
  assert.equal(result.ok, true, JSON.stringify(result.errors));
});

test('§3.5 multi-entry source-of-truth: secondary entries are valid sources', () => {
  const record = load(CONCEPT_YAML);
  record['source-of-truth'] = [
    'src/verticals/sportsbook/sports/registry.ts', // primary owner
    'src/verticals/sportsbook/sports/index.ts', //   secondary reference
  ];
  record.enumerates[0].source = 'src/verticals/sportsbook/sports/index.ts';
  const result = validateRecord('ontology-concept', record);
  assert.deepEqual(result, { ok: true, errors: [] });
});

test('§3.5: an enumerates source not named in source-of-truth hard-errors', () => {
  const record = load(CONCEPT_YAML);
  record.enumerates[0].source = 'src/somewhere/else.ts';
  const result = validateRecord('ontology-concept', record);
  assert.equal(result.ok, false);
  assert.deepEqual(
    codesAt(result, 'enumerates[0].source'),
    ['enumerates-source-not-listed'],
  );
});

test('a descriptor without values is malformed — hard error, never skipped', () => {
  const record = load(CONCEPT_YAML);
  delete record.enumerates[0].values;
  const result = validateRecord('ontology-concept', record);
  assert.equal(result.ok, false);
  assert.deepEqual(codesAt(result, 'enumerates[0].values'), ['missing-required']);
});

// ------------------------------------------------------ decision entry §3.3

const DECISION_YAML = `
id: D-004
title: Three stores split by truth anchor
category: architecture
status: accepted
date: "2026-07-07"
deciders: [dimitri]
context: Merging the stores would merge their write gates.
decision: Split ontology, knowledge, decisions by who owns the fact.
consequences: Three catalogs, one navigational grammar.
supersedes: []
superseded-by: []
relates-to: { concepts: [], leaves: [], decisions: [] }
`;

test('accepts the §3.3 canonical decision entry', () => {
  const result = validateRecord('decision-entry', load(DECISION_YAML));
  assert.deepEqual(result, { ok: true, errors: [] });
});

test('§3.5: provisional date-suffixed draft ids are accepted', () => {
  const record = load(DECISION_YAML);
  record.id = 'D-2026-07-08-schema-split';
  record.status = 'proposed';
  const result = validateRecord('decision-entry', record);
  assert.equal(result.ok, true, JSON.stringify(result.errors));
});

test('decision category outside the closed set is rejected', () => {
  const record = load(DECISION_YAML);
  record.category = 'vibes';
  const result = validateRecord('decision-entry', record);
  assert.deepEqual(codesAt(result, 'category'), ['invalid-enum-value']);
});

test('relates-to is typed: unknown ref buckets are rejected', () => {
  const record = load(DECISION_YAML);
  record['relates-to'].tickets = ['KK-02'];
  const result = validateRecord('decision-entry', record);
  assert.deepEqual(codesAt(result, 'relates-to.tickets'), ['unknown-property']);
});

// ------------------------------------------------------ knowledge leaf §3.2

const LEAF_YAML = `
schema-version: 1
notation: "362.1"
domain: regulation
division: settlement
heading: ACH settlement windows
description: Prose is navigation, never the fact.
notes:
  - type: scope
    text: US-facing operators only.
  - type: revision
    date: "2026-07-07"
    text: Initial entry.
cross-references:
  class-elsewhere: []
  see-also: []
  including: []
citations:
  - source: NACHA operating rules 2026
    accessed: "2026-07-07"
terms: [ACH, settlement]
edition: 1
contributors: [dimitri]
`;

test('accepts the §3.2 canonical leaf front matter', () => {
  const result = validateRecord('knowledge-leaf', load(LEAF_YAML));
  assert.deepEqual(result, { ok: true, errors: [] });
});

test('§3.2: citations are REQUIRED — an unsourced claim is not promotable', () => {
  const record = load(LEAF_YAML);
  delete record.citations;
  assert.deepEqual(codesAt(validateRecord('knowledge-leaf', record), 'citations'), [
    'missing-required',
  ]);
  record.citations = [];
  assert.deepEqual(codesAt(validateRecord('knowledge-leaf', record), 'citations'), [
    'too-few-items',
  ]);
});

test('unquoted notation parses as a number and is rejected — quote it', () => {
  const record = load(LEAF_YAML.replace('notation: "362.1"', 'notation: 362.1'));
  const result = validateRecord('knowledge-leaf', record);
  assert.deepEqual(codesAt(result, 'notation'), ['wrong-type']);
});

// ------------------------------------------------------------- finding §3.4

const FINDING_YAML = `
schema-version: 1
date: "2026-07-07"
trigger: correction
session: claude-code/abc123
summary: User corrected the claimed sport list; concept K-210 was stale.
consulted: { concepts: [K-210], leaves: [] }
status: open
`;

test('accepts the §3.4 canonical finding fragment', () => {
  const result = validateRecord('finding', load(FINDING_YAML));
  assert.deepEqual(result, { ok: true, errors: [] });
});

test('finding trigger outside the five §3.4 triggers is rejected', () => {
  const record = load(FINDING_YAML);
  record.trigger = 'hunch';
  const result = validateRecord('finding', record);
  assert.deepEqual(codesAt(result, 'trigger'), ['invalid-enum-value']);
});

test('a finding fragment IS a store file: schema-version is required (§3.5)', () => {
  const record = load(FINDING_YAML);
  delete record['schema-version'];
  const result = validateStoreFile('finding', record);
  assert.deepEqual(codesAt(result, 'schema-version'), ['invalid-schema-version']);
});

// ------------------------------------------------- store-file envelope §3.5

test('entries files: schema-version + entries envelope, entries validated', () => {
  const doc = {
    'schema-version': 1,
    entries: [load(DECISION_YAML)],
  };
  assert.deepEqual(validateStoreFile('decision-entry', doc), { ok: true, errors: [] });
});

test('missing schema-version on a store file is a hard error', () => {
  const result = validateStoreFile('decision-entry', { entries: [] });
  assert.deepEqual(codesAt(result, 'schema-version'), ['invalid-schema-version']);
});

test('schema-version must be an integer ≥ 1 — "1" and 0 are both rejected', () => {
  for (const bad of ['1', 0, 1.5, null]) {
    const result = validateStoreFile('decision-entry', {
      'schema-version': bad,
      entries: [],
    });
    assert.deepEqual(
      codesAt(result, 'schema-version'),
      ['invalid-schema-version'],
      `schema-version: ${JSON.stringify(bad)}`,
    );
  }
});

test('entry defects surface with entries[i] paths and §3.5 checks applied', () => {
  const concept = load(CONCEPT_YAML);
  concept.enumerates[0].values = ['nfl', true];
  const result = validateStoreFile('ontology-concept', {
    'schema-version': 1,
    entries: [concept],
  });
  assert.equal(result.ok, false);
  assert.deepEqual(
    codesAt(result, 'entries[0].enumerates[0].values[1]'),
    ['non-string-enumerates-value'],
  );
});

test('errors are stable-sorted by path, then code (diffable output, PRD §5)', () => {
  const result = validateStoreFile('decision-entry', {
    entries: [{ id: 'X-1', status: 'maybe' }],
    stray: true,
  });
  const paths = result.errors.map((e) => `${e.path} ${e.code}`);
  assert.deepEqual(paths, [...paths].sort());
});
