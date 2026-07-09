// Find `catch` blocks by balancing braces, not by regex (UCS-950).
//
// The structural pins ask a question about EVERY catch that decides a command's
// exit code: does it rethrow a bug before speaking for it? A regex like
//
//     /\} catch \(error\) \{[\s\S]*?\n  \}/g
//
// answers a different question. It stops at the first line that happens to be
// `  }`, so a NESTED catch swallows the rest of its enclosing try, and the outer
// catch — the one that actually returns the exit code — is never scanned at all.
// That is not hypothetical: it left `cli/commands/init-copy.js` entirely
// unpinned, and the pin stayed green when its guard was deleted.
//
// Braces inside strings, template literals, comments and regex literals are not
// braces. This scanner skips them, so a `${...}` in an error message cannot end
// a block early.

/**
 * Every `catch (...) { ... }` body in `source`, brace-balanced.
 *
 * @param {string} source JavaScript source text
 * @returns {string[]} each catch body, braces included
 */
export function catchBlocks(source) {
  const blocks = [];
  const re = /\bcatch\s*(?:\([^)]*\))?\s*\{/g;
  let match;
  while ((match = re.exec(source)) !== null) {
    const open = source.indexOf('{', match.index);
    const end = matchingBrace(source, open);
    if (end === -1) continue;
    blocks.push(source.slice(open, end + 1));
  }
  return blocks;
}

/** Index of the `}` closing the `{` at `open`, or -1. */
function matchingBrace(source, open) {
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '/' && source[i + 1] === '/') { i = skipTo(source, i, '\n'); continue; }
    if (ch === '/' && source[i + 1] === '*') { i = source.indexOf('*/', i + 2) + 1; if (i === 0) return -1; continue; }
    if (ch === '"' || ch === "'") { i = skipString(source, i, ch); continue; }
    if (ch === '`') { i = skipTemplate(source, i); continue; }
    if (ch === '{') depth += 1;
    else if (ch === '}') { depth -= 1; if (depth === 0) return i; }
  }
  return -1;
}

const skipTo = (s, i, ch) => { const j = s.indexOf(ch, i); return j === -1 ? s.length : j; };

/** Index of the closing quote of the string opened at `i`. */
function skipString(s, i, quote) {
  for (let j = i + 1; j < s.length; j += 1) {
    if (s[j] === '\\') { j += 1; continue; }
    if (s[j] === quote) return j;
  }
  return s.length;
}

/** Index of the closing backtick, stepping over `${ ... }` substitutions. */
function skipTemplate(s, i) {
  for (let j = i + 1; j < s.length; j += 1) {
    if (s[j] === '\\') { j += 1; continue; }
    if (s[j] === '`') return j;
    if (s[j] === '$' && s[j + 1] === '{') {
      const end = matchingBrace(s, j + 1);
      if (end === -1) return s.length;
      j = end;
    }
  }
  return s.length;
}
