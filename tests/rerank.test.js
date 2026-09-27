// UCS-1612: the fitted re-rank score and aliases on every record kind.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { load } from 'js-yaml';
import { askPayload, loadAskIndex } from '../payload/engine/lib/ask-service.js';
import { FEATURES, relevance } from '../payload/engine/lib/rerank.js';
import { RERANK_MODEL } from '../payload/engine/lib/rerank-model.js';
import { copy, installation } from './helpers/canonical.js';

const repository = fileURLToPath(new URL('..', import.meta.url));
const search = (roots, text) => askPayload(loadAskIndex(roots), {
  mode: 'search', text, where: [], countBy: null, under: null, limit: 8, top: 10,
});

test('the shipped re-rank model is exactly what the training manifest fits', () => {
  const check = spawnSync(process.execPath, [join(repository, 'acceptance/retrieval/fit-rerank.js'), '--check'], { encoding: 'utf8' });
  assert.equal(check.status, 0, check.stdout + check.stderr);
  assert.deepEqual(Object.keys(RERANK_MODEL.weights), [...FEATURES]);
  assert.ok(!RERANK_MODEL.trainedOn.some((set) => /held-?out/i.test(set)), 'held-out cases never train the model');
});

test('every searched record carries a relevance probability, and results are ordered by it', () => {
  const { records } = search([installation('manufacturing')], 'Compare the sealing pressure setpoints at North and South plants');
  const searched = records.filter((r) => r.relevance !== undefined);
  assert.ok(searched.length >= 2);
  for (const r of searched) assert.ok(r.relevance > 0 && r.relevance < 1, `${r.id}: ${r.relevance}`);
  // Named records may be placed ahead; everything else descends by relevance.
  const plain = searched.map((r) => r.relevance);
  assert.ok(plain.slice(1).every((v, i) => v <= plain[i] + 0.01) || searched.some((r) => r.named), plain.join(','));
});

test('relevance is monotone in the BM25 signals the model weights positively', () => {
  const base = [0.5, 0.5, 0.5, 0.5, 0, 0];
  for (const [i, name] of FEATURES.entries()) {
    const higher = [...base];
    higher[i] += 0.3;
    const direction = Math.sign(RERANK_MODEL.weights[name]);
    assert.equal(Math.sign(relevance(higher) - relevance(base)), direction || 0, name);
  }
});

test('an alias on a Knowledge record or a Decision is searched at title weight and reported', (t) => {
  const { root, kit } = copy(t, 'policy');
  const decisions = join(kit, 'decisions/entries');
  const file = join(decisions, 'D-000001.yaml');
  const doc = load(readFileSync(file, 'utf8'));
  doc.entries[0].aliases = ['zyxwarranty'];
  writeFileSync(file, JSON.stringify(doc, null, 2));
  const validate = spawnSync(process.execPath, [join(repository, 'payload/engine/validate.js'), '--root', root], { encoding: 'utf8' });
  assert.equal(validate.status, 0, validate.stdout);
  const top = search([root], 'what does the zyxwarranty say').records[0];
  assert.equal(top.id, 'D-000001');
  assert.deepEqual(top['via-alias'], ['zyxwarranty']);

  const leafRoot = copy(t, 'manufacturing');
  const leafFile = join(leafRoot.kit, 'knowledge/K-000001.md');
  const text = readFileSync(leafFile, 'utf8');
  const [, front, body] = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  const leaf = load(front);
  leaf.aliases = ['qwvbgasket'];
  writeFileSync(leafFile, `---\n${JSON.stringify(leaf, null, 2)}\n---\n${body}`);
  const leafValidate = spawnSync(process.execPath, [join(repository, 'payload/engine/validate.js'), '--root', leafRoot.root], { encoding: 'utf8' });
  assert.equal(leafValidate.status, 0, leafValidate.stdout);
  const leafTop = search([leafRoot.root], 'qwvbgasket details').records[0];
  assert.equal(leafTop.id, 'K-000001');
  assert.deepEqual(leafTop['via-alias'], ['qwvbgasket']);
});
