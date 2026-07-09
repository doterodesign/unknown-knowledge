// UCS-950: the scanner the structural pins are built on.
//
// A regex found catch blocks by scanning to the first `\n  }`. Nested catches
// made it swallow their enclosing try, so the OUTER catch — the one that
// returns the exit code — was never seen. `cli/commands/init-copy.js` sat
// unpinned behind that bug, and the pin stayed green when its guard was
// deleted. These tests pin the replacement against exactly those shapes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { catchBlocks } from './lib/catch-blocks.js';

test('a nested catch does not hide its enclosing one', () => {
  const source = `
function main() {
  try {
    seed();
    try {
      wrap();
    } catch (error) {
      annotate(error);
      throw error;
    }
  } catch (error) {
    report(error);
    return FAILURE;
  }
}`;
  const blocks = catchBlocks(source);
  assert.equal(blocks.length, 2, 'both catches are found');
  assert.ok(blocks.some((b) => /annotate/.test(b) && !/return FAILURE/.test(b)), 'the inner catch stands alone');
  assert.ok(blocks.some((b) => /return FAILURE/.test(b)), 'the outer catch — the one that decides the exit code — is seen');
});

test('a brace inside a template substitution does not end the block', () => {
  const source = 'try { a(); } catch (error) { write(`x: ${o.m} ${f({ a: 1 })}`); return FAILURE; }';
  const [block] = catchBlocks(source);
  assert.match(block, /return FAILURE/, 'the block runs to its real closing brace');
});

test('braces inside strings, comments and template literals are not braces', () => {
  const source = [
    'try { a(); } catch (error) {',
    '  const s = "}";',
    "  const t = '}';",
    '  // }',
    '  /* } */',
    '  const u = `}`;',
    '  return FAILURE;',
    '}',
  ].join('\n');
  const [block] = catchBlocks(source);
  assert.match(block, /return FAILURE/);
});

test('an escaped quote does not end a string early', () => {
  const source = 'try { a(); } catch (error) { const s = "a\\"}"; return FAILURE; }';
  const [block] = catchBlocks(source);
  assert.match(block, /return FAILURE/);
});

test('a bare catch, with no binding, is still a catch', () => {
  const source = 'try { a(); } catch { return FAILURE; }';
  assert.equal(catchBlocks(source).length, 1);
});

test('the word "catch" in a comment or string is not a catch block', () => {
  const source = '// catch (error) {\nconst s = "catch (error) {";\n';
  // Both are inside a comment/string, so nothing balanced follows them as code.
  // The scanner may not find a block; what it must never do is throw or hang.
  assert.doesNotThrow(() => catchBlocks(source));
});

test('an unterminated block yields nothing rather than hanging', () => {
  assert.deepEqual(catchBlocks('try { a(); } catch (error) { return FAILURE;'), []);
});

test('every catch in a real command surface is found', async () => {
  const { readFile } = await import('node:fs/promises');
  const { fileURLToPath } = await import('node:url');
  const source = await readFile(fileURLToPath(new URL('../cli/commands/init-copy.js', import.meta.url)), 'utf8');
  const fatal = catchBlocks(source).filter((b) => /EXIT_CODES\.FAILURE/.test(b));
  // The regex this replaced found ZERO of these — the file was unpinned.
  assert.equal(fatal.length, 1, 'init-copy has exactly one catch that decides the exit code, and it is visible');
  assert.match(fatal[0], /rethrowIfBug\(error\)/);
});
