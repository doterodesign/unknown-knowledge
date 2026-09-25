// The guarantees the engine keeps, pinned on the one shared fixture.
//
// Each test names one guarantee and asserts the specific diagnostic that
// enforces it, never a total error count, so the tests keep holding while the
// governance machinery around them is removed (P-UCS-60). Tests marked `todo`
// pin a guarantee the current engine does not enforce yet; they run and
// report until the engine enforces them.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadStores } from '../payload/engine/lib/load-stores.js';
import { locateKitRoot } from '../payload/engine/lib/kit-root.js';
import { loadAskIndex } from '../payload/engine/lib/ask-service.js';
import { aggregate } from '../payload/engine/lib/aggregate.js';
import { INSTALLATIONS, installation, copy, repository, git, readJson, writeJson } from './helpers/canonical.js';

const engine = (name) => fileURLToPath(new URL(`../payload/engine/${name}`, import.meta.url));
const node = (script, ...args) => spawnSync(process.execPath, [engine(script), ...args], { encoding: 'utf8' });
const errorCodes = (root) => new Set(loadStores(locateKitRoot(root)).diagnostics
  .filter((d) => d.severity === 'error').map((d) => d.code));
const edit = (file, from, to) => {
  const text = readFileSync(file, 'utf8');
  assert.ok(text.includes(from), `${file} contains ${from}`);
  writeFileSync(file, text.replace(from, to));
};
const registry = (kit, change) => {
  const file = join(kit, 'subjects/registry.yaml');
  const value = readJson(file);
  change(value, (id) => value.subjects.find((s) => s.id === id));
  writeJson(file, value);
};

test('every canonical installation loads without errors', () => {
  for (const name of INSTALLATIONS) assert.deepEqual([...errorCodes(installation(name))], [], name);
});

// ------------------------------------------------------------------ identity

test('a record must hold an allocated ID: a new ID with no ledger row refuses', (t) => {
  const { root, kit } = copy(t, 'engineering');
  writeFileSync(join(kit, 'knowledge/K-000099.md'),
    readFileSync(join(kit, 'knowledge/K-000001.md'), 'utf8').replace('"id": "K-000001"', '"id": "K-000099"'));
  const catalog = readJson(join(kit, 'knowledge/_catalog.yaml'));
  catalog.entries.push({ id: 'K-000099', title: 'New', file: 'K-000099.md' });
  writeJson(join(kit, 'knowledge/_catalog.yaml'), catalog);
  assert.ok(errorCodes(root).has('invalid-identity'));
});

test('two records cannot share an ID', (t) => {
  const { root, kit } = copy(t, 'engineering');
  writeFileSync(join(kit, 'knowledge/K-copy.md'), readFileSync(join(kit, 'knowledge/K-000001.md')));
  assert.ok(errorCodes(root).has('duplicate-id'));
});

test('an allocation row cannot be deleted while its record exists', (t) => {
  const { root, kit } = copy(t, 'engineering');
  const ledger = readJson(join(kit, '_identity.yaml'));
  ledger.allocations = ledger.allocations.filter((row) => row.id !== 'K-000007');
  writeJson(join(kit, '_identity.yaml'), ledger);
  assert.ok(errorCodes(root).has('invalid-identity'));
});

test('an ID is allocated once: a duplicate ledger row refuses', (t) => {
  const { root, kit } = copy(t, 'engineering');
  const ledger = readJson(join(kit, '_identity.yaml'));
  ledger.allocations.push({ ...ledger.allocations.find((row) => row.id === 'K-000007') });
  writeJson(join(kit, '_identity.yaml'), ledger);
  assert.ok(errorCodes(root).has('invalid-identity-ledger'));
});

test('proposal keys never consume allocations', (t) => {
  // manufacturing carries a draft proposal with no ledger row and loads clean.
  const ledger = readJson(join(installation('manufacturing'), 'unknown-knowledge/_identity.yaml'));
  assert.ok(ledger.allocations.every((row) => !row.id.startsWith('proposal:')));
  const proposals = [...loadStores(locateKitRoot(installation('manufacturing'))).proposals.knowledge.keys()];
  assert.ok(proposals.length > 0);
  // A proposal key in the ledger is refused.
  const { root, kit } = copy(t, 'engineering');
  const edited = readJson(join(kit, '_identity.yaml'));
  edited.allocations.push({ ...edited.allocations[0], id: 'proposal:knowledge:0b1e7c1e-5f7a-4b9e-9c1a-2d3e4f5a6b7c', kind: 'knowledge' });
  writeJson(join(kit, '_identity.yaml'), edited);
  assert.ok(errorCodes(root).has('invalid-identity-ledger'));
});

for (const state of ['retired', 'cancelled']) {
  test(`a live record cannot hold a ${state} ID`, (t) => {
    const { root, kit } = copy(t, 'engineering');
    const ledger = readJson(join(kit, '_identity.yaml'));
    Object.assign(ledger.allocations.find((row) => row.id === 'K-000001'), { state, reason: 'withdrawn' });
    writeJson(join(kit, '_identity.yaml'), ledger);
    assert.ok(errorCodes(root).has('invalid-identity'));
  });
}

// ------------------------------------------------------------------ subjects

const subjectCases = [
  ['a parent cycle', 'parent-cycle', (r, s) => { s('S-000001').parent = 'S-000005'; }],
  ['a duplicate Subject ID', 'duplicate-subject', (r, s) => { r.subjects.push({ ...s('S-000019') }); }],
  ['more than one parent', 'wrong-type', (r, s) => { s('S-000005').parent = ['S-000004', 'S-000003']; }],
  ['a parent that does not exist', 'missing-parent', (r, s) => { s('S-000005').parent = 'S-000999'; }],
];
for (const [what, code, change] of subjectCases) {
  test(`the Subject registry refuses ${what}`, (t) => {
    const { root, kit } = copy(t, 'engineering');
    registry(kit, change);
    assert.ok(errorCodes(root).has(code), code);
  });
}

test('a record cannot be assigned a Subject the registry does not hold', (t) => {
  const { root, kit } = copy(t, 'engineering');
  edit(join(kit, 'knowledge/K-000002.md'), '"S-000013"', '"S-000999"');
  assert.ok(errorCodes(root).has('unknown-subject'));
});

test('a record cannot stay assigned to a retired Subject', (t) => {
  const { root, kit } = copy(t, 'engineering');
  registry(kit, (r, s) => { s('S-000013').status = 'retired'; });
  assert.ok(errorCodes(root).has('retired-subject-assigned'));
});

test('the registry is an ordinary governed file: plain edits validate', (t) => {
  const { root, kit } = copy(t, 'engineering');
  registry(kit, (r, s) => {
    s('S-000019').label = 'Engineering vocabulary';
    s('S-000019').aliases = [{ label: 'Terminology', locale: 'en' }];
    s('S-000011').parent = 'S-000004';
  });
  assert.deepEqual([...errorCodes(root)], []);
});

test('retiring a Subject validates when its records are reassigned in the same change', (t) => {
  const { root, kit } = copy(t, 'engineering');
  const assigned = [];
  for (const name of ['knowledge', 'ontology/classes', 'decisions/entries']) {
    const dir = join(kit, name);
    for (const file of readdirSync(dir).filter((f) => /\.(md|yaml)$/.test(f))) {
      const path = join(dir, file);
      if (readFileSync(path, 'utf8').includes('"S-000013"')) assigned.push(path);
    }
  }
  assert.ok(assigned.length > 0, 'some record is assigned S-000013');
  registry(kit, (r, s) => { s('S-000013').status = 'retired'; });
  for (const path of assigned) edit(path, '"S-000013"', '"S-000001"');
  assert.deepEqual([...errorCodes(root)], []);
});

test('related links never create ancestry', () => {
  const root = installation('engineering');
  const { index } = loadAskIndex([root]);
  const reg = loadStores(locateKitRoot(root)).subjectRegistry;
  const ancestors = (id) => { const out = []; for (let p = reg.parents.get(id); p; p = reg.parents.get(p)) out.push(p); return out; };
  const [holder, link] = [...reg.subjects.values()].flatMap((s) => (s.related ?? []).map((l) => [s.id, l])).find(([id, l]) => !ancestors(id).includes(l.target));
  assert.ok(holder, 'the fixture has a related link outside the parent chain');
  const selected = aggregate(index, { where: [{ field: 'subject', value: link.target }], countBy: 'kind' });
  const onlyHolder = index.docs.filter((d) => {
    const subjects = d.record.subjects ?? [];
    return subjects.includes(holder) && !subjects.some((s) => s === link.target || ancestors(s).includes(link.target));
  });
  assert.ok(onlyHolder.length > 0, 'some record reaches the target only through the related link');
  const selectedIds = new Set(index.docs.filter((d) => (d.record.subjects ?? []).some((s) => s === link.target || ancestors(s).includes(link.target))).map((d) => d.id));
  assert.equal(selected.selected, selectedIds.size);
  for (const d of onlyHolder) assert.equal(selectedIds.has(d.id), false, d.id);
});

// ------------------------------------------------------------------ exit codes and determinism

test('validators exit 0 when clean, 1 on findings and 2 when the check never ran', (t) => {
  assert.equal(node('validate.js', '--root', installation('engineering')).status, 0);
  assert.equal(node('validate-values.js', '--root', installation('engineering')).status, 0);

  const drift = copy(t, 'engineering');
  edit(join(drift.root, 'sources/passages/css-export.txt'), '`--accent-soft`', '`--accent-muted`');
  assert.equal(node('validate-values.js', '--root', drift.root).status, 1);

  const broken = copy(t, 'engineering');
  writeFileSync(join(broken.kit, 'knowledge/K-copy.md'), readFileSync(join(broken.kit, 'knowledge/K-000001.md')));
  assert.equal(node('validate.js', '--root', broken.root).status, 2);
});

test('the same stores give byte-identical output, wherever they live', (t) => {
  const moved = copy(t, 'policy');
  for (const args of [['validate.js', '--json'], ['ask.js', 'retention interval policy', '--json'], ['preflight.js', '--json', '--today', '2026-09-24']]) {
    const [script, ...rest] = args;
    const here = node(script, ...rest, '--root', installation('policy'));
    assert.equal(here.stdout, node(script, ...rest, '--root', installation('policy')).stdout, `${script} rerun`);
    assert.equal(here.stdout, node(script, ...rest, '--root', moved.root).stdout, `${script} moved`);
  }
});

// ------------------------------------------------------------------ commit gate

test('the commit gate checks the staged snapshot, not the working tree', async (t) => {
  await t.test('invalid unstaged bytes do not block a valid commit', (t) => {
    const { root, kit } = repository(t, 'engineering');
    writeFileSync(join(kit, 'knowledge/K-copy.md'), readFileSync(join(kit, 'knowledge/K-000001.md')));
    assert.equal(node('commit-check.js', '--root', root).status, 0);
  });
  await t.test('invalid staged bytes block even when the working tree is repaired', (t) => {
    const { root, kit } = repository(t, 'engineering');
    const copyFile = join(kit, 'knowledge/K-copy.md');
    writeFileSync(copyFile, readFileSync(join(kit, 'knowledge/K-000001.md')));
    git(root, 'add', copyFile);
    writeFileSync(copyFile, '');
    assert.notEqual(node('commit-check.js', '--root', root).status, 0);
  });
});
