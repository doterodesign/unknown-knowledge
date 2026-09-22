import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { installationFixture } from './helpers/installation-cutover-fixture.js';
import { runPreparedMigrationGate } from '../payload/engine/lib/prepared-migration-gate.js';
import { isPreparedMigrationReport } from '../payload/engine/lib/prepared-migration-report.js';

const role = (file, kind, disposition, edits = [], bindings = []) => ({ file, role: kind, disposition,
  reason: 'Synthetic exact consumer review; not production approval', edits, bindings });
const run = f => runPreparedMigrationGate({ repoRoot: f.root, source: f.source, candidate: f.candidate,
  migrationInputs: f.migrationInputs, limits: f.limits });

test('complete installation inventory binds exact reviewed references, real deactivation and private choices', async t => {
  const f = installationFixture(t, {
    before(f, kit) {
      writeFileSync(join(kit, 'knowledge/_rules.yaml'), 'schema-version: 1\nstore: knowledge\nrules:\n  - consult: K-102\n    literal: K-102\n');
      mkdirSync(join(f.root, '.consumers'));
      writeFileSync(join(f.root, '.consumers/opaque.cfg'), 'serialized reader with no identifier-shaped text\n');
      writeFileSync(join(kit, 'suppressions.yaml'), '- {term: K-102, sourcePath: K-102, reason: Keep stale, date: "2026-08-19"}\n- {term: K-102, sourcePath: docs/K-102.txt, reason: Literal anchor key, date: "2026-08-19"}\n');
    },
    after(f, kit) {
      writeFileSync(join(kit, 'knowledge/_rules.yaml'), 'schema-version: 1\nstore: knowledge\nrules:\n  - consult: O-000001\n    literal: K-102\n');
      rmSync(join(f.root, '.consumers/opaque.cfg'));
      writeFileSync(join(kit, 'suppressions.yaml'), '- {term: O-000001, sourcePath: O-000001, reason: Keep stale, date: "2026-08-19"}\n- {term: K-102, sourcePath: docs/K-102.txt, reason: Literal anchor key, date: "2026-08-19"}\n');
    },
    roles(input, inventory) {
      const source = inventory.records.find(row => row.kind === 'ontology' && row.id === 'K-102').key;
      const original = 'schema-version: 1\nstore: knowledge\nrules:\n  - consult: K-102\n    literal: K-102\n';
      const start = Buffer.from(original.slice(0, original.indexOf('K-102'))).length;
      input.roles.push(role('unknown-knowledge/knowledge/_rules.yaml', 'knowledge-rules', 'rewrite', [{ start, end: start + 5, expected: 'K-102', source }]));
      input.roles.push(role('.consumers/opaque.cfg', 'deactivated', 'remove'));
      input.roles.find(row => row.role === 'suppressions').bindings.push({ index: 1, kind: 'literal', source: null });
    },
  });
  const original = structuredClone(f.migrationInputs);
  const good = await run(f); assert.equal(good.mechanicalStatus, 'passed', JSON.stringify(good.checks));
  assert(isPreparedMigrationReport(good, f));
  assert(good.installation.inventory.roles.every(row => !Object.hasOwn(row, 'edits') && !Object.hasOwn(row, 'bindings')));
  assert(!JSON.stringify(good).includes('"correspondence"'));
  const cases = [
    ['unknown outside-kit consumer cannot disappear from inventory', input => { input.roles = input.roles.filter(row => row.file !== '.consumers/opaque.cfg'); }, 'cutover-role-coverage'],
    ['preservation claim cannot authorize actual deletion', input => { const row = input.roles.find(row => row.file === '.consumers/opaque.cfg'); row.role = 'non-consumer'; row.disposition = 'preserve'; }, 'cutover-consumer-bytes'],
    ['wrong exact spelling cannot bind a numerically similar identity', input => { input.roles.find(row => row.role === 'knowledge-rules').edits[0].expected = 'K-0102'; }, 'cutover-reference-span'],
    ['literal suppression cannot authorize a stale-concept rewrite', input => { input.roles.find(row => row.role === 'suppressions').bindings[0] = { index: 0, kind: 'literal', source: null }; }, 'cutover-consumer-bytes'],
    ['known suppression owner cannot be relabeled non-consumer', input => { input.roles.find(row => row.role === 'suppressions').role = 'non-consumer'; }, 'cutover-role-path'],
    ['uncovered launcher refuses', input => { input.launches = input.launches.filter(row => row.file !== '.hooks/pre-commit'); }, 'cutover-launch-coverage'],
    ['consumer byte budget refuses', input => { input.limits.maxConsumerBytes = 1; }, 'cutover-runtime-capacity'],
    ['exact role cannot override installed engine ownership', input => { input.roles.push(role('unknown-knowledge/engine/resolve.js', 'non-consumer', 'preserve')); }, 'cutover-role-overlap'],
  ];
  for (const [name, mutate, code] of cases) await t.test(name, async () => {
    f.migrationInputs = structuredClone(original); mutate(f.migrationInputs.installation);
    const result = await run(f);
    assert.equal(result.mechanicalStatus, 'failed'); assert.equal(result.installation?.code, code, JSON.stringify(result.checks));
    assert(isPreparedMigrationReport(result, f));
  });
  f.migrationInputs = original;
  const path = join(f.root, 'unknown-knowledge/engine/resolve.js');
  writeFileSync(path, readFileSync(path, 'utf8') + '\n// unreviewed installed change\n');
  f.git('add', '.'); f.git('commit', '--amend', '--no-edit', '--quiet');
  f.candidate = { ...f.candidate, commit: f.git('rev-parse', 'HEAD'), tree: f.git('rev-parse', 'HEAD^{tree}') };
  const mixed = await run(f); assert.equal(mixed.installation?.code, 'cutover-runtime-pair');
});

test('unsupported source rule, suppression and customized vendor grammars refuse without partial migration', async t => {
  for (const [name, path, bytes, code] of [
    ['unknown rule field', 'ontology/_rules.yaml', 'schema-version: 1\nstore: ontology\nrules:\n  - class: 100-feed\n    id-range: [K-100, K-199]\n    arbitrary: active-policy\n', 'cutover-rules-grammar'],
    ['unadmitted flow-style range policy', 'ontology/_rules.yaml', 'schema-version: 1\nstore: ontology\nrules: [{class: 100-feed, id-range: [K-100, K-199]}]\n', 'cutover-rules-span'],
    ['malformed source suppression syntax', 'suppressions.yaml', '[unterminated\n', 'cutover-consumer-grammar'],
    ['customized installed protocol', 'protocol/AGENTS.md', 'Custom active authoring instructions.\n', 'cutover-runtime-pair'],
  ]) await t.test(name, async () => {
    const f = installationFixture(t, { before(_f, kit) { writeFileSync(join(kit, path), bytes); } });
    const index = readFileSync(join(f.root, '.git/index'));
    const report = await run(f);
    assert.equal(report.mechanicalStatus, 'failed'); assert.equal(report.installation?.code, code, JSON.stringify(report.checks));
    assert.deepEqual(readFileSync(join(f.root, '.git/index')), index);
  });
});
