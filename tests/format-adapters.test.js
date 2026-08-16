// UCS-1153: format adapters -> one IR (md, txt, html, pdf).
//
// The claims this file pins, and how each fails if broken:
//
//   1. FIXTURE PAIRS. Every registered adapter ships a sample -> EXPECTED.yaml
//      pair in the extractor-fixture shape, and the pair round-trips exactly.
//      A sample and its expectation cannot rot apart, and an adapter cannot
//      land without the template a client copies to author their own (D-005).
//   2. DETERMINISM AT THE SEAM. Same input bytes, same IR bytes — asserted by
//      repeated runs over every sample, and across separate processes. A map
//      built twice from one document must be the same map, or nothing
//      downstream can be diffed (D-012).
//   3. THE OUT-OF-ENVELOPE HARD ERROR. An unsupported format exits 2 with
//      conduct and emits NO partial IR (golden). This is the claim the whole
//      ticket exists for: a best-effort partial parse poisons what the team
//      believes was reviewed, which is worse than no review (D-005/D-012).
//   4. LEXICAL ONLY. The adapters execute nothing — asserted structurally for
//      the pdf adapter in particular, the one most tempted toward a
//      subprocess (D-014).
//
// Tested through both seams: the library directly (the recipes are pure), and
// the CLI process (exit codes and output ARE the contract).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { load } from 'js-yaml';
import {
  ADAPTERS, BLOCK_KINDS, CONDUCT, SUPPORTED, AdaptError, UnsupportedFormatError,
  adapt, adapterFor,
} from '../payload/engine/lib/format-adapters.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const pairsRoot = join(root, 'payload', 'adapter-fixtures');
const FORMATS = ['html', 'md', 'pdf', 'txt']; // sorted: the directory listing's order

function runCli(...args) {
  return spawnSync(process.execPath, [join(root, 'payload/engine/ingest.js'), ...args],
    { encoding: 'utf8', timeout: 20_000 });
}

const samplePath = (format, file) => join(pairsRoot, format, file);
const expectationOf = (format) => load(readFileSync(join(pairsRoot, format, 'EXPECTED.yaml'), 'utf8'));

// ------------------------------------------- 1. the shipped fixture pairs

test('every adapter ships a fixture pair, and every pair names a registered adapter', () => {
  const dirs = readdirSync(pairsRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory()).map((d) => d.name).sort();
  assert.deepEqual(dirs, FORMATS, 'the shipped pairs and the registry must be the same set');
  assert.deepEqual(Object.keys(ADAPTERS).sort(), FORMATS);
  assert.deepEqual([...SUPPORTED], FORMATS);
  for (const format of FORMATS) {
    assert.ok(ADAPTERS[format], `adapter ${format} must be registered`);
    assert.equal(typeof ADAPTERS[format].version, 'number', `${format} must carry a version`);
    assert.ok(ADAPTERS[format].version >= 1);
  }
});

test('each shipped pair round-trips: the adapter produces EXACTLY the expected IR', () => {
  for (const format of FORMATS) {
    const expected = expectationOf(format);
    assert.equal(expected.format, format, `${format}/EXPECTED.yaml must name its own format`);
    const ir = adapt(samplePath(format, expected.file), readFileSync(samplePath(format, expected.file)));

    assert.equal(ir.adapter, expected.adapter, `${format}: adapter provenance drifted`);
    assert.equal(ir.hash, expected.hash, `${format}: the sample's bytes changed without the expectation`);
    // Order is CONTRACT for the IR (unlike the extractor pairs' value sets):
    // the blocks are a sequence, and a coverage map reads them in order.
    assert.deepEqual(
      ir.blocks.map((b) => ({ kind: b.kind, ...(b.level === undefined ? {} : { level: b.level }), text: b.text, locator: b.locator })),
      expected.blocks.map((b) => ({ kind: b.kind, ...(b.level === undefined ? {} : { level: b.level }), text: b.text, locator: b.locator })),
      `${format}: sample and EXPECTED.yaml have rotted apart`,
    );
  }
});

test('every block carries a kind from the closed taxonomy and a locator that points somewhere', () => {
  for (const format of FORMATS) {
    const expected = expectationOf(format);
    const ir = adapt(samplePath(format, expected.file), readFileSync(samplePath(format, expected.file)));
    for (const b of ir.blocks) {
      assert.ok(BLOCK_KINDS.includes(b.kind), `${format}: unknown block kind ${JSON.stringify(b.kind)}`);
      assert.equal(typeof b.text, 'string');
      assert.notEqual(b.text, '', `${format}: a block with no text is not content`);
      if (format === 'pdf') {
        // A PDF is not line-addressable, so it gets the coordinates it has.
        assert.ok(Number.isInteger(b.locator.page) && b.locator.page >= 1, 'pdf locator needs a page');
        assert.ok(Number.isInteger(b.locator.object) && b.locator.object >= 1, 'pdf locator needs an object ordinal');
      } else {
        assert.ok(Number.isInteger(b.locator.line) && b.locator.line >= 1, `${format} locator needs a line`);
        assert.ok(b.locator.endLine >= b.locator.line, `${format} locator's span must not run backwards`);
      }
    }
  }
});

test('the fixture pairs are the authoring template: the README teaches the shape, and ships', () => {
  const readme = readFileSync(join(pairsRoot, 'README.md'), 'utf8');
  assert.match(readme, /D-014/, 'the authoring guide must state the no-execution rule');
  assert.match(readme, /hard error/i, 'the authoring guide must state the never-a-partial rule');
  const manifest = readFileSync(join(root, 'cli', 'kit.manifest.yaml'), 'utf8');
  assert.match(manifest, /from: adapter-fixtures/, 'the pairs must ship with the kit (the template a client copies)');
});

// ------------------------------------------------ 2. determinism at the seam

test('determinism: adapting the same bytes repeatedly yields byte-identical IR', () => {
  for (const format of FORMATS) {
    const expected = expectationOf(format);
    const path = samplePath(format, expected.file);
    const bytes = readFileSync(path);
    const first = JSON.stringify(adapt(path, bytes));
    for (let run = 0; run < 5; run += 1) {
      // Fresh bytes each run: nothing may be cached across calls either.
      assert.equal(JSON.stringify(adapt(path, readFileSync(path))), first,
        `${format}: run ${run + 2} produced different IR from run 1`);
    }
  }
});

test('determinism holds across PROCESSES — no wall clock, no enumeration order, no randomness', () => {
  for (const format of FORMATS) {
    const path = samplePath(format, expectationOf(format).file);
    const a = runCli(path, '--json');
    const b = runCli(path, '--json');
    assert.equal(a.status, 0, a.stderr);
    assert.equal(a.stdout, b.stdout, `${format}: two processes disagreed about the same document`);
    assert.doesNotMatch(a.stdout, /\d{4}-\d{2}-\d{2}T/, `${format}: the IR carries a timestamp`);
  }
});

test('the IR is provenance-stamped with the adapter version — a map names the recipe that built it', () => {
  for (const format of FORMATS) {
    const path = samplePath(format, expectationOf(format).file);
    const ir = JSON.parse(runCli(path, '--json').stdout);
    assert.equal(ir.adapter, `${format}@${ADAPTERS[format].version}`);
    assert.match(ir.hash, /^fnv1a64:[0-9a-f]{16}$/, 'the content hash dedupes resubmissions');
  }
});

test('the content hash tracks the BYTES: one changed character changes it, identical bytes do not', () => {
  const a = adapt('a.txt', Buffer.from('one block of prose\n'));
  const same = adapt('other-name.txt', Buffer.from('one block of prose\n'));
  const changed = adapt('a.txt', Buffer.from('one block of prosE\n'));
  assert.equal(a.hash, same.hash, 'the same bytes under a different name are the same document');
  assert.notEqual(a.hash, changed.hash);
});

// --------------------------------- 3. the out-of-envelope hard error (golden)

test('golden: an unsupported format exits 2, names the format, and states the conduct', () => {
  const r = runCli(join(pairsRoot, '..', 'engine', 'lib', 'format-adapters.js'), '--json');
  // (A .js submission is as unsupported as a .docx — the point is the seam.)
  assert.equal(r.status, 2, 'an unsupported format is an exit-2 hard error');

  const docx = runCli('Q3_roadmap.docx', '--json');
  assert.equal(docx.status, 2);
  assert.equal(docx.stdout, '', 'NO partial IR may be emitted — stdout must be empty');
  assert.match(docx.stderr, /no format adapter for '\.docx'/, 'the refusal names the format');
  assert.match(docx.stderr, /out-of-envelope input/);
  // The conduct IS the deliverable of the hard error: a refusal that only says
  // "no" leaves the submitter stuck. Pinned in full, in order.
  assert.ok(docx.stderr.includes(CONDUCT), `the conduct block is missing or reworded:\n${docx.stderr}`);
  assert.match(CONDUCT, /convert to md \/ txt \/ html \/ pdf and resubmit/);
  assert.match(CONDUCT, /or author an adapter/);
  assert.match(CONDUCT, /scanned\/image content: convert upstream/);
  // A stack trace would bury the conduct: this is a considered refusal, not a bug.
  assert.doesNotMatch(docx.stderr, /internal failure/);
  assert.doesNotMatch(docx.stderr, /at \w+ \(/);
});

test('the refusal is by EXTENSION, never content sniffing — a renamed file fails on its own terms', () => {
  // Guessing a grammar from lookalike bytes is the confident-wrong-parse class
  // (the call lib/extractor-kinds.js makes for strings-keys).
  assert.throws(() => adapterFor('report.docx'), UnsupportedFormatError);
  assert.throws(() => adapterFor('scan.png'), UnsupportedFormatError);
  assert.throws(() => adapterFor('notes'), /a file with no extension/);
  for (const format of FORMATS) {
    for (const extension of ADAPTERS[format].extensions) {
      assert.equal(adapterFor(`doc${extension}`).name, format);
      assert.equal(adapterFor(`DOC${extension.toUpperCase()}`).name, format, 'extension match is case-insensitive');
    }
  }
  // A directory named like a document must not fool the dispatch.
  assert.throws(() => adapterFor('archive.md/notes'), UnsupportedFormatError);
});

test('an empty or structureless document is a hard error, never an empty IR', () => {
  // An empty IR would report a reviewed document as covered — the false
  // all-clear this whole seam exists to prevent.
  assert.throws(() => adapt('empty.md', Buffer.from('')), AdaptError);
  assert.throws(() => adapt('blank.txt', Buffer.from('\n\n   \n')), /no blocks/);
  const r = runCli(join(root, 'payload/adapter-fixtures/md/EXPECTED.yaml'));
  assert.equal(r.status, 2, 'a .yaml submission has no adapter');
});

test('within-format envelopes hard-error too: the discipline is not only about formats', () => {
  assert.throws(() => adapt('x.md', Buffer.from('# Title\n\n```js\nunterminated\n')),
    /unterminated code fence/);
  assert.throws(() => adapt('x.html', Buffer.from('<p>never closed')),
    /never closed/);
  assert.throws(() => adapt('x.html', Buffer.from('<p>caf&eacute; au lait</p>')),
    /named entity "&eacute;" is outside this adapter's envelope/);
});

test('golden: the pdf adapter refuses every shape outside its declared envelope, naming what it hit', () => {
  const pdf = (body) => Buffer.from(`%PDF-1.4\n${body}`, 'latin1');
  const cases = [
    ['encrypted', pdf('1 0 obj\n<< /Type /Catalog /Encrypt 9 0 R >>\nendobj\n'), /ENCRYPTED/],
    ['custom font encoding', pdf('1 0 obj\n<< /Encoding << /Differences [1 /a] >> >>\nendobj\n'), /custom font encoding/],
    ['unsupported filter', pdf('1 0 obj\n<< /Type /Page /Contents 2 0 R >>\nendobj\n2 0 obj\n<< /Length 4 /Filter /LZWDecode >>\nstream\nabcd\nendstream\nendobj\n'), /\/LZWDecode/],
    ['no extractable text', pdf('1 0 obj\n<< /Type /Page /Contents 2 0 R >>\nendobj\n2 0 obj\n<< /Length 31 >>\nstream\nq 100 0 0 100 0 0 cm /Im0 Do Q\nendstream\nendobj\n'), /NO extractable text/],
    ['not a pdf at all', Buffer.from('PK a zip renamed\n', 'latin1'), /does not begin with the %PDF- header/],
  ];
  for (const [why, bytes, expected] of cases) {
    assert.throws(() => adapt('doc.pdf', bytes), expected, `pdf must refuse: ${why}`);
    // And never a partial: no IR escapes any of these.
    assert.throws(() => adapt('doc.pdf', bytes), (error) =>
      error instanceof UnsupportedFormatError || error instanceof AdaptError, `${why}: wrong error class`);
  }
});

test('the scanned-page refusal states the upstream-conversion conduct — the case it exists for', () => {
  const scanned = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Page /Contents 2 0 R >>\nendobj\n2 0 obj\n<< /Length 31 >>\nstream\nq 100 0 0 100 0 0 cm /Im0 Do Q\nendstream\nendobj\n', 'latin1');
  assert.throws(() => adapt('scan.pdf', scanned), (error) => {
    assert.match(error.message, /scanned images/);
    assert.match(error.message, /convert upstream \(probabilistic\), then resubmit/);
    return true;
  });
});

// ------------------------------------------------------- 4. lexical only (D-014)

test('the adapters are LEXICAL ONLY: no subprocess, no network, no eval anywhere in the module', () => {
  const source = readFileSync(join(root, 'payload/engine/lib/format-adapters.js'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '') // comments are prose, not code
    .replace(/^\s*\/\/.*$/gm, '');

  // The pdf adapter is the one most tempted toward `pdftotext`. It must not be.
  assert.doesNotMatch(source, /node:child_process|child_process/, 'no subprocess (D-014)');
  assert.doesNotMatch(source, /\beval\s*\(|new Function\s*\(/, 'no eval (D-014)');
  assert.doesNotMatch(source, /node:http|node:https|fetch\s*\(|node:net|node:dgram/, 'no network (D-014)');
  assert.doesNotMatch(source, /node:vm|node:worker_threads/, 'no sandboxed execution either');
  // Nothing is imported dynamically, so no client path can become a specifier.
  assert.doesNotMatch(source, /\bimport\s*\(/, 'no dynamic import (D-014)');

  // The import list is an allowlist: zlib for FlateDecode (stdlib
  // DECOMPRESSION, not execution — it cannot run code from the document) and
  // the engine's own refusal type. Any other import is a new capability that
  // has to be argued for.
  const imports = [...source.matchAll(/^import\s[^;]*?from\s+'([^']+)';/gm)].map((m) => m[1]);
  assert.deepEqual(imports.sort(), ['./engine-refusal.js', 'node:zlib']);

  // The engine's zero-runtime-dependency rule (D-022): js-yaml is the only
  // runtime dep, and the adapters do not even need that.
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  assert.deepEqual(Object.keys(pkg.dependencies), ['js-yaml'], 'the pdf adapter added a dependency');
});

test('the adapters never touch the filesystem — the caller owns the one read', () => {
  // A recipe that read files itself could be pointed anywhere, and could not be
  // proven deterministic. Purity is what makes the fixture pairs meaningful.
  const source = readFileSync(join(root, 'payload/engine/lib/format-adapters.js'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(source, /node:fs|readFileSync|writeFileSync/, 'adapters take bytes, not paths');
});

test('html nesting: the CHILD kind wins, and a direct list item is still a list-item', () => {
  // `<li><p>x</p></li>` is ONE block, and it is a paragraph: the block IS a
  // paragraph, and its list membership is outline structure the IR flattens.
  // Emitting the parent's kind would mean labeling text with an ancestor that
  // does not directly contain it, with no principled stopping point upward.
  const ir = adapt('x.html', Buffer.from('<ul><li><p>nested</p></li><li>direct</li></ul>'));
  assert.deepEqual(ir.blocks.map((b) => [b.kind, b.text]), [
    ['paragraph', 'nested'],
    ['list-item', 'direct'],
  ]);
});

test('html code blocks keep their whitespace byte-exact — stripping a tag adds no indentation', () => {
  // Inline markup elsewhere becomes a space so `a<br>b` does not fuse into
  // "ab"; inside <pre> that same space would be indentation the source never
  // had, and whitespace is content in code.
  const plain = adapt('x.html', Buffer.from('<pre>line one\n  indented</pre>'));
  const wrapped = adapt('x.html', Buffer.from('<pre><code>line one\n  indented</code></pre>'));
  assert.equal(plain.blocks[0].text, 'line one\n  indented');
  assert.equal(wrapped.blocks[0].text, 'line one\n  indented',
    'a <code> wrapper must not introduce a leading space');
  assert.equal(adapt('x.html', Buffer.from('<p>a<br>b</p>')).blocks[0].text, 'a b',
    'outside code, a stripped tag still separates words');
});

test('html: script and style bodies never reach the IR — a lexicon must not match on CSS or JS', () => {
  const html = Buffer.from([
    '<html><head><style>h1 { content: "poison"; }</style></head><body>',
    '<script>var poison = "poison";</script>',
    '<p>real prose</p>',
    '</body></html>',
  ].join('\n'));
  const ir = adapt('x.html', html);
  assert.deepEqual(ir.blocks.map((b) => b.text), ['real prose']);
  assert.doesNotMatch(JSON.stringify(ir), /poison/, 'script/style content leaked into the IR');
});

// ------------------------------------------------------------- the CLI surface

test('the CLI adapts a document to IR on stdout and exits 0', () => {
  const r = runCli(samplePath('md', 'sample.md'), '--json');
  assert.equal(r.status, 0, r.stderr);
  const ir = JSON.parse(r.stdout);
  assert.equal(ir.adapter, 'md@1');
  assert.equal(ir.blocks[0].kind, 'heading');
  // The human rendering names the locator in the format's own scheme.
  const human = runCli(samplePath('pdf', 'sample.pdf'));
  assert.equal(human.status, 0, human.stderr);
  assert.match(human.stdout, /p1#1\s+paragraph/, 'pdf locators render as page#object');
});

test('usage errors exit 2: no document, two documents, an unknown flag, a missing file', () => {
  for (const args of [[], ['a.md', 'b.md'], ['--nope', 'x.md'], ['--json']]) {
    assert.equal(runCli(...args).status, 2, `expected usage failure for ${JSON.stringify(args)}`);
  }
  const missing = runCli(join(root, 'no', 'such', 'file.md'));
  assert.equal(missing.status, 2);
  assert.match(missing.stderr, /cannot read/);
  assert.equal(missing.stdout, '');
});
