import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadStores } from '../payload/engine/lib/load-stores.js';
import { writeFileSync, openSync, closeSync, readSync, readdirSync, statSync } from 'node:fs';
import { createSourceBudget, readSourceFileSync, getSourceBudgetUsage, SourceBudgetError } from '../payload/engine/lib/source-budget.js';
import { createDocumentBudget, getDocumentBudgetUsage, DocumentBudgetError } from '../payload/engine/lib/document-budget.js';
import { parseRecordFile, parseYamlDocument } from '../payload/engine/lib/record-file.js';
import { locateKitRoot } from '../payload/engine/lib/kit-root.js';
import { copy } from './helpers/canonical.js';

test('loader rejects a forged source allowance before loading any input', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'source-budget-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  assert.throws(() => loadStores(root, { sourceBudget: Object.freeze({}) }),
    (error) => error.code === 'invalid-source-budget');
});



function fileFixture(t, bytes = 'abcde') {
  const root = mkdtempSync(join(tmpdir(), 'source-budget-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const file = join(root, 'input'); writeFileSync(file, bytes);
  return { root, file };
}

test('source limits are explicit and authentic; copies cannot spend an allowance', (t) => {
  for (const limits of [{}, { maxSourceBytes: -1 }, { maxSourceBytes: 1.5 }, { maxSourceBytes: Infinity }, { maxSourceBytes: 1, extra: 0 }]) {
    assert.throws(() => createSourceBudget(limits), { code: 'invalid-source-budget' });
  }
  const { file } = fileFixture(t);
  const sourceBudget = createSourceBudget({ maxSourceBytes: 5 });
  assert.equal(Object.isFrozen(sourceBudget), true);
  assert.throws(() => readSourceFileSync(file, { sourceBudget: { ...sourceBudget } }), { code: 'invalid-source-budget' });
  assert.equal(getSourceBudgetUsage(sourceBudget).sourceBytes, 0);
});

test('actual source bytes count repeated reads, with exact EOF and no refund after failure', (t) => {
  const { file } = fileFixture(t);
  const sourceBudget = createSourceBudget({ maxSourceBytes: 10 });
  assert.equal(readSourceFileSync(file, { sourceBudget, encoding: 'utf8' }), 'abcde');
  assert.equal(readSourceFileSync(file, { sourceBudget }).toString(), 'abcde');
  assert.equal(getSourceBudgetUsage(sourceBudget).sourceBytes, 10);
  assert.throws(() => readSourceFileSync(file, { sourceBudget }), { code: 'source-budget-exhausted' });
  const usage = getSourceBudgetUsage(sourceBudget); usage.sourceBytes = 0; usage.failure.code = 'changed';
  writeFileSync(file, '');
  assert.throws(() => readSourceFileSync(file, { sourceBudget }), { code: 'source-budget-exhausted' });
  assert.equal(getSourceBudgetUsage(sourceBudget).sourceBytes, 10);
});

test('one-over source reads no extra probe byte and reports consumed versus attempted work', (t) => {
  const { file } = fileFixture(t);
  const sourceBudget = createSourceBudget({ maxSourceBytes: 4 });
  assert.throws(() => readSourceFileSync(file, { sourceBudget }), SourceBudgetError);
  assert.deepEqual(getSourceBudgetUsage(sourceBudget), { sourceBytes: 4, failure: {
    code: 'source-budget-exhausted', counter: 'sourceBytes', phase: 'source-read', attemptedBytes: 1,
  } });
});

test('zero allowance admits an empty regular file and rejects nonempty or nonregular input', (t) => {
  const { file, root } = fileFixture(t, '');
  const sourceBudget = createSourceBudget({ maxSourceBytes: 0 });
  assert.deepEqual(readSourceFileSync(file, { sourceBudget }), Buffer.alloc(0));
  assert.throws(() => readSourceFileSync(root, { sourceBudget }), { code: 'invalid-source-file' });
  writeFileSync(file, 'x');
  assert.throws(() => readSourceFileSync(file, { sourceBudget }), { code: 'source-budget-exhausted' });
  assert.equal(getSourceBudgetUsage(sourceBudget).sourceBytes, 0);
});

test('bounded fd reads start at zero and preserve caller position and ownership', (t) => {
  const { file } = fileFixture(t);
  const fd = openSync(file, 'r'); t.after(() => closeSync(fd));
  const byte = Buffer.alloc(1); readSync(fd, byte, 0, 1, null); assert.equal(byte.toString(), 'a');
  const sourceBudget = createSourceBudget({ maxSourceBytes: 10 });
  assert.equal(readSourceFileSync(fd, { sourceBudget }).toString(), 'abcde');
  readSync(fd, byte, 0, 1, null); assert.equal(byte.toString(), 'b');
  assert.equal(readSourceFileSync(fd, { sourceBudget }).toString(), 'abcde');
  assert.equal(getSourceBudgetUsage(sourceBudget).sourceBytes, 10);
});

test('chunk boundaries preserve bytes without exceeding the source allowance', (t) => {
  const bytes = Buffer.alloc(65539, 0xa7); const { file } = fileFixture(t, bytes);
  const sourceBudget = createSourceBudget({ maxSourceBytes: bytes.length });
  assert.deepEqual(readSourceFileSync(file, { sourceBudget }), bytes);
  assert.equal(getSourceBudgetUsage(sourceBudget).sourceBytes, bytes.length);
});

test('actual loader counts ledger, registry, record, catalog, and history source bytes cumulatively', (t) => {
  const f = copy(t, 'engineering');
  const sum = (dir) => readdirSync(dir).reduce((total, name) => {
    const path = join(dir, name); const stat = statSync(path);
    return total + (stat.isDirectory() ? sum(path) : name === 'decision-captures.json' ? 0 : stat.size);
  }, 0);
  const expected = sum(f.kit);
  const sourceBudget = createSourceBudget({ maxSourceBytes: expected * 2 });
  for (let i = 1; i <= 2; i += 1) {
    const model = loadStores(f.kit, { sourceBudget });
    assert.equal(model.ok, true, JSON.stringify(model.diagnostics));
    assert.equal(getSourceBudgetUsage(sourceBudget).sourceBytes, expected * i);
  }
  assert.throws(() => loadStores(f.kit, { sourceBudget }), { code: 'source-budget-exhausted' });
});

test('layout read and subsequent loader share one allowance; exhaustion is never layout ambiguity', (t) => {
  const f = copy(t, 'engineering');
  const bytes = JSON.stringify({ kitRoot: 'unknown-knowledge' });
  writeFileSync(join(f.root, '.unknown-knowledge.json'), bytes);
  const sourceBudget = createSourceBudget({ maxSourceBytes: Buffer.byteLength(bytes) });
  const root = locateKitRoot(f.root, { sourceBudget }); assert.equal(root, f.kit);
  assert.throws(() => loadStores(root, { sourceBudget }), { code: 'source-budget-exhausted' });
  const short = createSourceBudget({ maxSourceBytes: Buffer.byteLength(bytes) - 1 });
  assert.throws(() => locateKitRoot(f.root, { sourceBudget: short }), { code: 'source-budget-exhausted' });
});

test('parsed aliases consume repeated document visits before validation and escape parse diagnostics', () => {
  const documentBudget = createDocumentBudget({ maxDocumentNodes: 6, maxDocumentTextUnits: 100 });
  const diagnostics = [];
  assert.throws(() => parseYamlDocument('alias.yaml', 'a: &shared [1, 2]\nb: *shared\n', diagnostics, { documentBudget }), DocumentBudgetError);
  assert.deepEqual(diagnostics, []);
  assert.equal(getDocumentBudgetUsage(documentBudget).documentNodes, 6);
});

test('Knowledge body text is charged before schema validation, with UTF-16 units', () => {
  const body = '😀z';
  const documentBudget = createDocumentBudget({ maxDocumentNodes: 1, maxDocumentTextUnits: 2 });
  assert.throws(() => parseRecordFile({ kind: 'knowledge', file: 'x.md', text: `---\n{}\n---\n${body}`, documentBudget }),
    (error) => error instanceof DocumentBudgetError && error.phase === 'parsed-knowledge-body' && error.counter === 'documentTextUnits');
  assert.equal(body.length, 3);
});

test('loader shares the authentic document guard across every parsed source', (t) => {
  const f = copy(t, 'engineering');
  const documentBudget = createDocumentBudget({ maxDocumentNodes: 1, maxDocumentTextUnits: 100000 });
  assert.throws(() => loadStores(f.kit, { documentBudget }), { code: 'document-budget-exhausted' });
  assert.equal(getDocumentBudgetUsage(documentBudget).documentNodes, 1);
});
