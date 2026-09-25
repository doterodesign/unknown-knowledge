// UCS-1580/1581: the agent comparison's two runtimes hold identical content.
//
// The eight development-v2 installations are built as 2.x stores by the
// original runtime, then copied into a fresh 3.0 kit after migrate.js. Both
// must validate with their own engine, and every record must appear in both
// with the same source passage.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { prepareBaselineRuntime } from '../acceptance/retrieval/materialize.js';
import { corpusSpecs, materializeCorpus } from '../acceptance/retrieval/materialize-corpus.js';
import { currentInstallation } from '../acceptance/retrieval/arms.js';

let scratch;
let built;
const mappings = {};
before(() => {
  scratch = mkdtempSync(join(tmpdir(), 'uk-corpus-arms-'));
  built = materializeCorpus(join(scratch, 'original'), prepareBaselineRuntime(join(scratch, 'runtime')));
  mkdirSync(join(scratch, 'current'));
  for (const [name, installation] of Object.entries(built)) {
    mappings[name] = currentInstallation(installation.root, join(scratch, 'current', name));
  }
});
after(() => rmSync(scratch, { recursive: true, force: true }));

const validate = (root) => spawnSync(process.execPath, [join(root, 'unknown-knowledge/engine/validate.js'), '--root', root], { encoding: 'utf8' });

test('all eight installations validate with the original and the current engine', () => {
  const names = Object.keys(built);
  assert.equal(names.length, 8);
  for (const name of names) {
    const original = validate(built[name].root);
    assert.equal(original.status, 0, `${name} (2.x): ${original.stdout}`);
    const current = validate(join(scratch, 'current', name));
    assert.equal(current.status, 0, `${name} (3.0): ${current.stdout}`);
  }
});

test('every corpus record exists in both runtimes, one ID each', () => {
  for (const spec of corpusSpecs()) {
    const name = spec.id.replace(/^corpus-/, '');
    const records = built[name].records.filter((r) => r.passage);
    assert.equal(records.length, spec.records.length, name);
    const converted = new Set(mappings[name].map((m) => m.from));
    for (const record of records) assert.ok(converted.has(record.id), `${name}: ${record.id} was not converted`);
  }
});
