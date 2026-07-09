/**
 * Extractor-kind registry (KK-07 frame; KK-08 TS/JS kinds). Each kind is a
 * small deterministic recipe `extract(text, descriptor) -> string[]` that
 * re-derives a claimed value set from a reified anchor. The contract
 * (payload/templates/new-kind/parser.example.js teaches it):
 *
 *   1. PURE + DETERMINISTIC — source text in, value set out. Lexical parsing
 *      only: the engine never executes client code (D-014).
 *   2. HARD-ERROR, NEVER GUESS — anything the recipe cannot parse throws,
 *      never a skipped span (PRD §5).
 *   3. DECLARED SYNTACTIC ENVELOPE — out-of-envelope sentinels in the matched
 *      span (TS spread / computed keys / re-exports, template interpolation,
 *      escape sequences) throw EnvelopeError: a confident wrong parse is a
 *      false all-clear, the D-005/D-012 failure class.
 *   4. VALUES ARE STRINGS, byte-exact, case-sensitive, as sets (§3.5) —
 *      duplicates are emitted as read; the caller's diff makes the finding.
 *
 * Facets: each kind documents which facet of the anchor it emits. Where an
 * anchor legitimately carries two (ts-enum member names vs raw values), the
 * descriptor pins one with `emit:`.
 *
 * Parsing is regex-level by design (PRD §5.1): the TS kinds share a tiny
 * string/comment-aware token walk — no AST, no resolver, single file only.
 */

/** The matched span contains a sentinel the kind's grammar cannot see past. */
export class EnvelopeError extends Error {}
/** The recipe could not read a value set out of the source at all. */
export class ExtractError extends Error {}

// ------------------------------------------------------------- token walking

/**
 * Lexically tokenize a TS/JS span into strings, identifiers, numbers, and
 * punctuation, skipping comments. String tokens carry decoded === raw source
 * bytes between the quotes: a backslash escape means the runtime value's
 * bytes differ from their source spelling, so the claim could never be
 * byte-matched honestly (§3.5) — that is an out-of-envelope sentinel, not a
 * decoding exercise. Template literals with `${` interpolation are sentinels
 * for the same reason: the value is not lexically knowable.
 */
function tokenize(span, context) {
  const tokens = [];
  let i = 0;
  while (i < span.length) {
    const ch = span[i];
    if (/\s/.test(ch)) { i += 1; continue; }
    if (ch === '/' && span[i + 1] === '/') {
      const nl = span.indexOf('\n', i);
      i = nl === -1 ? span.length : nl + 1;
      continue;
    }
    if (ch === '/' && span[i + 1] === '*') {
      const end = span.indexOf('*/', i + 2);
      if (end === -1) throw new ExtractError(`${context}: unterminated block comment`);
      i = end + 2;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      let j = i + 1;
      while (j < span.length && span[j] !== ch) {
        if (span[j] === '\\') {
          throw new EnvelopeError(`${context}: string literal carries an escape sequence (${JSON.stringify(span.slice(i, j + 2))}…) — its runtime bytes differ from their source spelling, so the value could never byte-match its claim (§3.5); out of this kind's envelope`);
        }
        if (ch === '`' && span[j] === '$' && span[j + 1] === '{') {
          throw new EnvelopeError(`${context}: template literal interpolation ("\${") — the value is not lexically knowable; a confident wrong parse is a false all-clear (PRD §5.1)`);
        }
        j += 1;
      }
      if (j >= span.length) throw new ExtractError(`${context}: unterminated string literal`);
      tokens.push({ type: 'string', value: span.slice(i + 1, j) });
      i = j + 1;
      continue;
    }
    if (/[A-Za-z_$]/.test(ch)) {
      let j = i + 1;
      while (j < span.length && /[\w$]/.test(span[j])) j += 1;
      tokens.push({ type: 'ident', value: span.slice(i, j) });
      i = j;
      continue;
    }
    if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(span[i + 1] ?? ''))) {
      let j = i + 1;
      while (j < span.length && /[\w.]/.test(span[j])) j += 1;
      tokens.push({ type: 'number', value: span.slice(i, j) });
      i = j;
      continue;
    }
    if (ch === '.' && span[i + 1] === '.' && span[i + 2] === '.') {
      tokens.push({ type: 'punct', value: '...' });
      i += 3;
      continue;
    }
    tokens.push({ type: 'punct', value: ch });
    i += 1;
  }
  return tokens;
}

/**
 * Walk from an opening delimiter to its balanced close, string/comment-aware,
 * returning the inner span. `start` indexes the opening delimiter itself.
 */
function balancedSpan(text, start, open, close, context) {
  let depth = 0;
  let i = start;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '/' && text[i + 1] === '/') {
      const nl = text.indexOf('\n', i);
      i = nl === -1 ? text.length : nl + 1;
      continue;
    }
    if (ch === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2);
      if (end === -1) throw new ExtractError(`${context}: unterminated block comment`);
      i = end + 2;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      let j = i + 1;
      while (j < text.length && text[j] !== ch) {
        if (text[j] === '\\') j += 1; // span walk only; escapes sentinel later
        j += 1;
      }
      if (j >= text.length) throw new ExtractError(`${context}: unterminated string literal`);
      i = j + 1;
      continue;
    }
    if (ch === open) depth += 1;
    else if (ch === close) {
      depth -= 1;
      if (depth === 0) return text.slice(start + 1, i);
    }
    i += 1;
  }
  throw new ExtractError(`${context}: unbalanced ${JSON.stringify(open)}…${JSON.stringify(close)} — the declaration never closes`);
}

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * A symbol that is only RE-EXPORTED here is an out-of-envelope sentinel, not
 * a miss: parsing is lexical and single-file, so following the chain would be
 * resolution, and extracting nothing would be a confident wrong parse.
 */
function requireDeclaration(text, symbol, kind, matched) {
  if (matched !== null) return matched;
  const reExport = new RegExp(`export\\s*(?:type\\s*)?\\{[^}]*\\b${escapeRegExp(symbol)}\\b[^}]*\\}\\s*from\\b`);
  if (reExport.test(text) || /export\s*\*\s*from\b/.test(text)) {
    throw new EnvelopeError(`"${symbol}" is not declared in this file — it is (or may be) re-exported from another module, and ${kind} parses lexically, single-file only (PRD §5.1): resolving the chain is out of the envelope`);
  }
  throw new ExtractError(`no ${kind} declaration of "${symbol}" found — wrong pointer, or the anchor is no longer reified`);
}

/** Require the descriptor's `symbol:` — these kinds anchor to a declaration. */
function requireSymbol(descriptor, kind) {
  const symbol = descriptor.symbol;
  if (typeof symbol !== 'string' || symbol === '') {
    throw new ExtractError(`${kind} requires a "symbol:" naming the declaration to read`);
  }
  return symbol;
}

/** Find `export const <symbol>` and the value expression opener after `=`. */
function exportedConstOpener(text, symbol, kind) {
  const decl = new RegExp(`(?:^|[\\n;])\\s*export\\s+const\\s+${escapeRegExp(symbol)}\\b`).exec(text);
  requireDeclaration(text, symbol, kind, decl);
  const eq = text.indexOf('=', decl.index + decl[0].length);
  if (eq === -1) throw new ExtractError(`declaration of "${symbol}" carries no initializer — nothing to extract`);
  let i = eq + 1;
  while (i < text.length && /\s/.test(text[i])) i += 1;
  return { opener: text[i], at: i };
}

// ------------------------------------------------------------------ the kinds

/**
 * `ts-const-array` — string elements of an exported `const` array literal
 * (facet: the element strings). Works for plain JS too: kinds describe
 * declaration shape, not file type. Envelope: string literals, commas, and
 * comments inside the brackets; spread (`...`) and any non-string member are
 * sentinels — a spread hides members no lexical parse can see.
 */
function tsConstArray(text, descriptor) {
  const symbol = requireSymbol(descriptor, 'ts-const-array');
  const { opener, at } = exportedConstOpener(text, symbol, 'ts-const-array');
  if (opener !== '[') {
    throw new ExtractError(`"${symbol}" is not initialized with an array literal — out of ts-const-array's reach`);
  }
  const tokens = tokenize(balancedSpan(text, at, '[', ']', symbol), symbol);
  const values = [];
  for (const t of tokens) {
    if (t.type === 'string') { values.push(t.value); continue; }
    if (t.type === 'punct' && t.value === ',') continue;
    if (t.type === 'punct' && t.value === '...') {
      throw new EnvelopeError(`"${symbol}" spreads another array ("...") — the full member set is not lexically knowable; extracting the literal members would be a confident wrong parse (PRD §5.1)`);
    }
    throw new EnvelopeError(`"${symbol}" carries a non-string-literal member (${JSON.stringify(t.value)}) — outside the ts-const-array envelope (string literals and commas only)`);
  }
  return values;
}

/**
 * `ts-union` — string-literal members of a `type X = 'a' | 'b'` union
 * (facet: the member strings). Envelope: string literals joined by `|`,
 * leading pipe and interleaved comments allowed; any identifier member is a
 * type reference this single-file grammar cannot resolve — sentinel. A
 * symbol that is only re-exported here is a sentinel, never followed.
 */
function tsUnion(text, descriptor) {
  const symbol = requireSymbol(descriptor, 'ts-union');
  const decl = new RegExp(`(?:^|[\\n;])\\s*(?:export\\s+)?type\\s+${escapeRegExp(symbol)}\\s*=`).exec(text);
  requireDeclaration(text, symbol, 'ts-union', decl);
  const start = decl.index + decl[0].length;
  // The union ends at the first `;` outside strings/comments (or EOF).
  let end = text.length;
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '/' && text[i + 1] === '/') { const nl = text.indexOf('\n', i); i = nl === -1 ? text.length : nl; continue; }
    if (ch === '/' && text[i + 1] === '*') { const e = text.indexOf('*/', i + 2); if (e === -1) throw new ExtractError(`${symbol}: unterminated block comment`); i = e + 1; continue; }
    if (ch === "'" || ch === '"' || ch === '`') { let j = i + 1; while (j < text.length && text[j] !== ch) j += text[j] === '\\' ? 2 : 1; i = j; continue; }
    if (ch === ';') { end = i; break; }
  }
  const tokens = tokenize(text.slice(start, end), symbol);
  const values = [];
  let expectValue = true;
  for (const t of tokens) {
    if (t.type === 'punct' && t.value === '|') { expectValue = true; continue; }
    if (t.type === 'string' && expectValue) { values.push(t.value); expectValue = false; continue; }
    throw new EnvelopeError(`type "${symbol}" carries a non-string-literal union member (${JSON.stringify(t.value)}) — a type reference or operator this lexical, single-file grammar cannot resolve; outside the ts-union envelope`);
  }
  if (values.length === 0) {
    throw new ExtractError(`type "${symbol}" has no string-literal members — nothing ts-union can extract`);
  }
  return values;
}

/**
 * `ts-enum` — members of a TS `enum` declaration. TWO legitimate facets:
 * member NAMES and raw string VALUES; the descriptor pins one with
 * `emit: names` (the default) or `emit: values` (§3.5). Envelope: plain or
 * string-literal member names, optional string initializers; computed names
 * and non-string initializers under `emit: values` are sentinels.
 */
function tsEnum(text, descriptor) {
  const symbol = requireSymbol(descriptor, 'ts-enum');
  const emit = descriptor.emit ?? 'names';
  if (emit !== 'names' && emit !== 'values') {
    throw new ExtractError(`ts-enum emits "names" or "values" — descriptor says emit: ${JSON.stringify(descriptor.emit)}; pin one legitimate facet (§3.5)`);
  }
  const decl = new RegExp(`(?:^|[\\n;])\\s*(?:export\\s+)?(?:declare\\s+)?(?:const\\s+)?enum\\s+${escapeRegExp(symbol)}\\s*\\{`).exec(text);
  requireDeclaration(text, symbol, 'ts-enum', decl);
  const open = decl.index + decl[0].length - 1;
  const tokens = tokenize(balancedSpan(text, open, '{', '}', symbol), symbol);
  const values = [];
  let i = 0;
  while (i < tokens.length) {
    const name = tokens[i];
    if (!(name.type === 'ident' || name.type === 'string')) {
      throw new EnvelopeError(`enum "${symbol}" carries a computed or unreadable member name (${JSON.stringify(name.value)}) — outside the ts-enum envelope`);
    }
    i += 1;
    let initializer = null;
    if (tokens[i]?.type === 'punct' && tokens[i].value === '=') {
      initializer = tokens[i + 1];
      if (!initializer || initializer.type !== 'string' || (tokens[i + 2] && !(tokens[i + 2].type === 'punct' && tokens[i + 2].value === ','))) {
        throw new EnvelopeError(`enum "${symbol}" member ${JSON.stringify(name.value)} has a non-string or computed initializer — its value is not lexically knowable; outside the ts-enum envelope`);
      }
      i += 2;
    }
    if (emit === 'values') {
      if (!initializer) {
        throw new EnvelopeError(`enum "${symbol}" member ${JSON.stringify(name.value)} has no string initializer, but the descriptor pins emit: values — the raw value (TS auto-numbers) is not a string set (§3.5)`);
      }
      values.push(initializer.value);
    } else {
      values.push(name.value);
    }
    if (tokens[i]?.type === 'punct' && tokens[i].value === ',') i += 1;
    else if (i < tokens.length) {
      throw new EnvelopeError(`enum "${symbol}": unexpected ${JSON.stringify(tokens[i].value)} after member ${JSON.stringify(name.value)} — outside the ts-enum envelope`);
    }
  }
  if (values.length === 0) throw new ExtractError(`enum "${symbol}" has no members — nothing to extract`);
  return values;
}

/**
 * `ts-object-keys` — top-level keys of an exported object literal (facet:
 * the key strings; nested objects/arrays are values, never keys). Reads
 * .ts/.tsx/.js/.jsx alike — only the named symbol's span counts, so JSX
 * inline object literals elsewhere never match. Envelope: bare or quoted
 * keys with `:` values, shorthand properties; computed keys (`[expr]`) and
 * spread at the top level are sentinels — the key set would not be lexically
 * knowable.
 */
function tsObjectKeys(text, descriptor) {
  const symbol = requireSymbol(descriptor, 'ts-object-keys');
  const { opener, at } = exportedConstOpener(text, symbol, 'ts-object-keys');
  if (opener !== '{') {
    throw new ExtractError(`"${symbol}" is not initialized with an object literal — out of ts-object-keys's reach`);
  }
  const tokens = tokenize(balancedSpan(text, at, '{', '}', symbol), symbol);
  const values = [];
  let i = 0;
  while (i < tokens.length) {
    const key = tokens[i];
    if (key.type === 'punct' && key.value === '[') {
      throw new EnvelopeError(`"${symbol}" carries a computed key ("[…]") — the key set is not lexically knowable; extracting the literal keys would be a confident wrong parse (PRD §5.1)`);
    }
    if (key.type === 'punct' && key.value === '...') {
      throw new EnvelopeError(`"${symbol}" spreads another object ("...") — the full key set is not lexically knowable (PRD §5.1)`);
    }
    if (!(key.type === 'ident' || key.type === 'string')) {
      throw new EnvelopeError(`"${symbol}" carries an unreadable key (${JSON.stringify(key.value)}) — outside the ts-object-keys envelope`);
    }
    values.push(key.value);
    i += 1;
    const next = tokens[i];
    if (!next || (next.type === 'punct' && next.value === ',')) { i += 1; continue; } // shorthand
    if (!(next.type === 'punct' && next.value === ':')) {
      throw new EnvelopeError(`"${symbol}" key ${JSON.stringify(key.value)} is not a plain \`key: value\` or shorthand property — outside the ts-object-keys envelope`);
    }
    // Skip the value: walk to the next comma at depth 0, tracking nesting.
    i += 1;
    let depth = 0;
    while (i < tokens.length) {
      const t = tokens[i];
      if (t.type === 'punct' && '{[('.includes(t.value)) depth += 1;
      else if (t.type === 'punct' && '}])'.includes(t.value)) depth -= 1;
      else if (t.type === 'punct' && t.value === ',' && depth === 0) break;
      i += 1;
    }
    i += 1; // past the comma (or EOF: trailing comma optional)
  }
  if (values.length === 0) throw new ExtractError(`"${symbol}" has no keys — nothing to extract`);
  return values;
}

/**
 * Shared JSON body: parse (JSON.parse is lexical — data, never code),
 * navigate the optional dotted path, and return the target object's keys
 * (facet: key strings). RFC 8259 duplicate keys collapse last-wins inside
 * JSON.parse, so a duplicated key is invisible to these kinds — JSON is the
 * one grammar here where the parse itself defines away the duplicate.
 */
function jsonKeysAt(text, path, kind) {
  let data;
  try {
    data = JSON.parse(text);
  } catch (error) {
    throw new ExtractError(`source is not valid JSON: ${error.message}`);
  }
  let target = data;
  const crumbs = [];
  for (const step of path) {
    crumbs.push(step);
    if (typeof target !== 'object' || target === null || Array.isArray(target) || !Object.hasOwn(target, step)) {
      throw new ExtractError(`path "${crumbs.join('.')}" not found in the JSON document — wrong pointer, or the block moved`);
    }
    target = target[step];
  }
  if (typeof target !== 'object' || target === null || Array.isArray(target)) {
    throw new ExtractError(`${kind} needs an object at ${path.length ? `path "${path.join('.')}"` : 'the top level'}, found ${Array.isArray(target) ? 'an array' : JSON.stringify(target === null ? null : typeof target)}`);
  }
  return Object.keys(target);
}

/** `json-keys` — top-level keys of a JSON document (facet: key strings). */
function jsonKeys(text) {
  return jsonKeysAt(text, [], 'json-keys');
}

/**
 * `json-map-keys` — keys of the object at the descriptor's dotted `symbol:`
 * path (e.g. `symbol: dependencies` in package.json). Facet: key strings.
 */
function jsonMapKeys(text, descriptor) {
  const symbol = requireSymbol(descriptor, 'json-map-keys');
  return jsonKeysAt(text, symbol.split('.'), 'json-map-keys');
}

// ---------------------------------------------------------------- the registry

/**
 * Kind name -> recipe. KK-08 registers the TS/JS + JSON kinds (PRD §5.1);
 * KK-09 (Swift/config) and KK-10 (dir-modules) extend this; clients author
 * later kinds through the §5.2 pipeline (D-005: only vendored, versioned,
 * test-covered kinds ever run).
 */
export const KINDS = Object.freeze({
  /**
   * Newline-delimited value list: one value per line, byte-exact (no
   * trimming beyond the newline), `#` comment lines and blank lines skipped.
   * Envelope: a line opening with `@if` marks conditional inclusion this
   * grammar cannot evaluate — hard error, never a guess. (KK-07's dispatch-
   * proving kind; kept registered for registry/test files that really are
   * newline-delimited.)
   */
  'test-lines': (text) => {
    const values = [];
    for (const line of text.replace(/\r\n/g, '\n').split('\n')) {
      if (line === '' || line.startsWith('#')) continue;
      if (/^@if\b/.test(line)) {
        throw new EnvelopeError(`out-of-envelope sentinel "${line}" — conditional inclusion is outside this kind's grammar; a confident wrong parse is a false all-clear (PRD §5)`);
      }
      values.push(line);
    }
    return values;
  },
  'ts-const-array': tsConstArray,
  'ts-union': tsUnion,
  'ts-enum': tsEnum,
  'ts-object-keys': tsObjectKeys,
  'json-keys': jsonKeys,
  'json-map-keys': jsonMapKeys,
});
