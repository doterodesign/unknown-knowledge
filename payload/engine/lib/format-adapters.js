/**
 * Format-adapter registry (UCS-1153) — every submission becomes ONE IR.
 *
 * The pipeline ingests documents in several shapes (md, txt, html, pdf) and
 * must reason over all of them identically. An adapter is the seam that makes
 * that possible: a small deterministic recipe `adapt(text|bytes) -> Block[]`
 * that normalizes a source document into ORDERED BLOCKS WITH KINDS AND SOURCE
 * LOCATORS, and nothing else. Everything downstream (UCS-1156's coverage map)
 * reads the IR, never the original bytes.
 *
 * The contract is the extractor-kind contract, deliberately (lib/extractor-
 * kinds.js teaches the original; the shipped adapter pairs carry the shape):
 *
 *   1. PURE + DETERMINISTIC — source in, blocks out. Same input bytes produce
 *      the same IR bytes, every run: no wall clock, no filesystem, no
 *      enumeration order, no randomness. Pinned by repeated-run tests.
 *   2. LEXICAL ONLY — no client-code execution, no subprocess, no network,
 *      no eval (D-014). An adapter reads bytes and returns data. `zlib` is
 *      the one decode primitive used (pdf FlateDecode); it is stdlib
 *      decompression, not execution.
 *   3. HARD-ERROR, NEVER A PARTIAL — a format with no adapter, or content
 *      outside an adapter's declared envelope, throws. A silent partial parse
 *      poisons what the team believes was reviewed: the coverage map would
 *      report a document as covered when half of it was never read. That is
 *      the D-005/D-012 false-all-clear failure class, and it is worse than no
 *      check at all.
 *   4. VERSIONED — each adapter carries a VERSION surfaced in the IR
 *      (`adapter: "md@1"`), so a map's provenance names the exact recipe that
 *      produced it (D-005-style trust). Bump rules below.
 *
 * SCOPE: deterministic text only. Scanned pages and images are converted
 * UPSTREAM by the agent (a probabilistic act) and resubmitted as a text
 * artifact — this pipeline never guesses at pixels.
 *
 * VERSION BUMP RULES. The version is a promise about IR bytes:
 *   - BUMP when the same input would now produce different IR — a new block
 *     kind, a changed locator scheme, different splitting or ordering. A
 *     coverage map built under md@1 and one built under md@2 are not
 *     comparable, and the version is what says so.
 *   - DO NOT bump for a widened envelope that leaves previously-accepted
 *     input byte-identical (accepting a shape that used to hard-error is
 *     additive: nothing that parsed before changes).
 *   - Bumping requires updating the adapter's fixture pair in the same
 *     commit; tests pin sample -> EXPECTED.yaml, so the pair can never rot
 *     apart from the recipe.
 */
import { inflateSync } from 'node:zlib';
import { EngineRefusal } from './engine-refusal.js';

/**
 * Both adapter failures are ANTICIPATED REFUSALS, not bugs, so both extend
 * `EngineRefusal` (lib/engine-refusal.js): the surface reports them as a clean
 * message with conduct and exits 2, rather than letting the harness print a
 * stack trace. An unsupported format is a condition the engine reached on
 * purpose — the refusal IS the feature — and a stack trace would bury the
 * conduct the submitter needs to read.
 */
/** The submission's format has no adapter, or its content is out of envelope. */
export class UnsupportedFormatError extends EngineRefusal {
  name = 'UnsupportedFormatError';
}
/** The adapter could not read a document out of the source at all. */
export class AdaptError extends EngineRefusal {
  name = 'AdaptError';
}

/**
 * The conduct an out-of-envelope submission must state (PRD §5.1). A refusal
 * that only says "no" leaves the submitter stuck, so the error names every
 * legitimate way forward — convert, author an adapter, or (for scanned input)
 * convert upstream and resubmit the text. This text is a golden: tests pin it,
 * because the conduct IS the deliverable of the hard error.
 */
export const CONDUCT = [
  'conduct:',
  '  1. convert to md / txt / html / pdf and resubmit',
  '  2. or author an adapter — versioned code + fixture (sample -> expected IR),',
  '     same pattern as extractor kinds; the miss feeds the adapter backlog',
  '  3. scanned/image content: convert upstream (probabilistic), then resubmit',
  '     the text artifact — this pipeline only ingests deterministic text',
].join('\n');

/**
 * The IR block kinds — the whole taxonomy, closed on purpose.
 *
 * These are the distinctions a coverage map needs to reason about richness:
 * a heading anchors a section, a paragraph carries prose, a list-item is a
 * discrete assertion, code is content no lexicon should tokenize as prose,
 * and a table-row is tabular data. A format that cannot distinguish some of
 * these (plain text has no headings) simply emits fewer kinds — it never
 * invents structure it cannot see. Adding a kind is an IR change: every
 * adapter's version bumps, because downstream consumers keyed on the old set.
 */
export const BLOCK_KINDS = Object.freeze(['heading', 'paragraph', 'list-item', 'code', 'table-row']);

/**
 * Normalize line endings without changing the line COUNT: locators are
 * line-based and must index the source the reader will open. A lone \r
 * (classic Mac) is a line break the reader's editor shows as one, so it
 * counts; \r\n is one break, not two.
 */
const splitLines = (text) => text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');

/**
 * A block, canonical shape. Keys are emitted in this fixed order so the IR
 * serializes byte-identically regardless of construction order.
 *
 * @param {string} kind one of BLOCK_KINDS
 * @param {string} text the block's text content, already normalized
 * @param {object} locator where in the source it came from
 */
function block(kind, text, locator) {
  return { kind, text, locator };
}

/**
 * Collapse a block's inline whitespace to single spaces and trim.
 *
 * The IR is for lexical scanning, not re-rendering: a paragraph wrapped across
 * four source lines is ONE assertion, and a downstream phrase match must not
 * miss it because a newline fell mid-phrase. The locator preserves where the
 * text lives, so nothing about the source is lost — only its line wrapping,
 * which was never content.
 */
const flatten = (text) => text.replace(/\s+/g, ' ').trim();

// ------------------------------------------------------------------ markdown

/** Closing fences, by opening marker. Fixed patterns, compiled once. */
const CLOSING_BACKTICK_FENCE = /^\s*`{3,}\s*$/;
const CLOSING_TILDE_FENCE = /^\s*~{3,}\s*$/;

/**
 * `md@1` — CommonMark-subset structure: ATX headings, fenced code, list items,
 * table rows, paragraphs. Locator: `{ line, endLine }`, 1-based inclusive,
 * indexing the ORIGINAL source lines.
 *
 * Envelope (what this adapter claims to read):
 *   - ATX headings (`#`..`######`) — the `level` rides on the block.
 *   - Fenced code blocks (``` or ~~~). Content is emitted verbatim, NOT
 *     flattened: whitespace is semantic in code, and a lexicon must be able
 *     to tell code from prose. An unterminated fence is a hard error — the
 *     rest of the document would silently become code, which is exactly the
 *     kind of confident wrong parse that poisons a coverage map.
 *   - List items (`-`, `*`, `+`, or `1.`), one block each, nesting flattened:
 *     the IR records the assertion, not the outline depth.
 *   - Table rows (`| a | b |`), one block each; the delimiter row (`|---|`)
 *     is presentation and is dropped.
 *   - Everything else is a paragraph, broken on blank lines.
 * Setext headings (underlined with === or ---) are deliberately NOT read as
 * headings: `---` is also a thematic break and a frontmatter fence, and
 * guessing between them is the confident-wrong-parse failure class. They
 * parse as paragraphs — visible content, honestly labeled, never invented
 * structure.
 */
function adaptMarkdown(text) {
  const lines = splitLines(text);
  const blocks = [];
  let paragraph = null;

  const flushParagraph = () => {
    if (paragraph === null) return;
    const body = flatten(paragraph.text);
    // A "paragraph" of only whitespace is not content; dropping it invents
    // nothing and hides nothing.
    if (body !== '') blocks.push(block('paragraph', body, { line: paragraph.line, endLine: paragraph.endLine }));
    paragraph = null;
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const at = i + 1;

    const fence = /^\s*(```+|~~~+)(.*)$/.exec(line);
    if (fence) {
      flushParagraph();
      // The two closing patterns are fixed, so they are built once at module
      // load rather than recompiled for every line of every fenced block.
      const closing = fence[1][0] === '`' ? CLOSING_BACKTICK_FENCE : CLOSING_TILDE_FENCE;
      const body = [];
      let j = i + 1;
      let closed = false;
      for (; j < lines.length; j += 1) {
        if (closing.test(lines[j])) { closed = true; break; }
        body.push(lines[j]);
      }
      if (!closed) {
        throw new AdaptError(`md: unterminated code fence opened at line ${at} — the rest of the document would silently become code, and a partial IR poisons what the reader believes was reviewed (PRD §5.1)`);
      }
      blocks.push(block('code', body.join('\n'), { line: at, endLine: j + 1 }));
      i = j;
      continue;
    }

    const heading = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
    if (heading) {
      flushParagraph();
      const b = block('heading', flatten(heading[2]), { line: at, endLine: at });
      b.level = heading[1].length;
      blocks.push(b);
      continue;
    }

    if (/^\s*$/.test(line)) { flushParagraph(); continue; }

    const item = /^\s*(?:[-*+]|\d+[.)])\s+(.*)$/.exec(line);
    if (item) {
      flushParagraph();
      blocks.push(block('list-item', flatten(item[1]), { line: at, endLine: at }));
      continue;
    }

    if (/^\s*\|.*\|\s*$/.test(line)) {
      flushParagraph();
      // The delimiter row carries no content — it is table syntax.
      if (!/^\s*\|[\s:|-]+\|\s*$/.test(line)) {
        const cells = line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(flatten);
        blocks.push(block('table-row', cells.join(' | '), { line: at, endLine: at }));
      }
      continue;
    }

    if (paragraph === null) paragraph = { text: line, line: at, endLine: at };
    else { paragraph.text += ` ${line}`; paragraph.endLine = at; }
  }
  flushParagraph();
  return blocks;
}

// ---------------------------------------------------------------- plain text

/**
 * `txt@1` — blank-line-separated paragraphs, and nothing else.
 *
 * Plain text has no marked-up structure, so this adapter INVENTS NONE: every
 * block is a paragraph. Reading indented lines as code, or short lines as
 * headings, would be a guess dressed as structure, and a coverage map built on
 * guessed headings reports sections that do not exist. Degraded structure,
 * identical process — the map is bounded by content richness, and txt is the
 * honest floor. Locator: `{ line, endLine }`, 1-based inclusive.
 */
function adaptText(text) {
  const lines = splitLines(text);
  const blocks = [];
  let current = null;
  const flush = () => {
    if (current === null) return;
    const body = flatten(current.text);
    if (body !== '') blocks.push(block('paragraph', body, { line: current.line, endLine: current.endLine }));
    current = null;
  };
  for (let i = 0; i < lines.length; i += 1) {
    if (/^\s*$/.test(lines[i])) { flush(); continue; }
    if (current === null) current = { text: lines[i], line: i + 1, endLine: i + 1 };
    else { current.text += ` ${lines[i]}`; current.endLine = i + 1; }
  }
  flush();
  return blocks;
}

// ----------------------------------------------------------------------- html

/** Elements whose CONTENT is not document text — never emitted, never scanned. */
const HTML_SKIP = new Set(['script', 'style', 'noscript', 'template', 'svg', 'head']);

/** Tag -> block kind. Everything else is structural or inline. */
const HTML_BLOCK_TAGS = new Map([
  ['h1', 'heading'], ['h2', 'heading'], ['h3', 'heading'],
  ['h4', 'heading'], ['h5', 'heading'], ['h6', 'heading'],
  ['p', 'paragraph'], ['li', 'list-item'],
  ['pre', 'code'], ['tr', 'table-row'],
  ['blockquote', 'paragraph'],
]);

/**
 * The five XML/HTML named entities plus the numeric forms — the whole set this
 * adapter decodes. A document using any other named entity (`&nbsp;`,
 * `&mdash;`) is OUT OF ENVELOPE rather than silently passed through as literal
 * `&nbsp;` text: the block's text would not be the text a reader sees, and a
 * lexicon matching against it would silently miss. The full HTML5 entity table
 * is ~2200 names; shipping a partial one that quietly mis-decodes is worse
 * than refusing, and this is a zero-dependency engine (D-022).
 */
function decodeEntities(text, context) {
  return text.replace(/&(#\d+|#[xX][0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g, (whole, body) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X'
        ? Number.parseInt(body.slice(2), 16)
        : Number.parseInt(body.slice(1), 10);
      if (!Number.isInteger(code) || code < 0 || code > 0x10FFFF) {
        throw new UnsupportedFormatError(`html: ${context}: numeric entity "${whole}" is not a valid code point — out of the html adapter's envelope`);
      }
      return String.fromCodePoint(code);
    }
    switch (body) {
      case 'amp': return '&';
      case 'lt': return '<';
      case 'gt': return '>';
      case 'quot': return '"';
      case 'apos': return "'";
      default:
        throw new UnsupportedFormatError(`html: ${context}: named entity "${whole}" is outside this adapter's envelope (&amp; &lt; &gt; &quot; &apos; and numeric forms only) — passing it through as literal text would make the block's text differ from what a reader sees, so a lexicon would silently miss it; convert the document or author a widened adapter (PRD §5.1)`);
    }
  });
}

/**
 * `html@1` — lexical tag walk, no DOM, no execution. Locator: `{ line,
 * endLine }`, 1-based inclusive, from the byte offset of the element's open
 * and close tags.
 *
 * Envelope: the block elements in HTML_BLOCK_TAGS, whose text content becomes
 * one block each. Content of script/style/head is dropped entirely — it is
 * code and metadata, never document prose, and feeding it to a lexicon would
 * manufacture matches from CSS selectors.
 *
 * NESTING: CHILD KIND WINS. A block element opening inside another closes its
 * parent, and the text belongs to the innermost element — so `<li><p>x</p></li>`
 * emits ONE block of kind `paragraph`, not `list-item`. The block IS a
 * paragraph; its list membership is outline structure, and the IR flattens
 * outline structure by design (the md adapter flattens list nesting the same
 * way). Emitting the parent's kind would mean choosing an ancestor's label for
 * text it does not directly contain, and with arbitrary nesting there is no
 * principled stopping point up that chain. A list item whose text is direct
 * (`<li>x</li>`) still emits `list-item` — the common case is unaffected.
 *
 * D-014, restated for the format most likely to carry it: this adapter NEVER
 * executes anything. `<script>` bodies are discarded as text; no DOM is built;
 * no resource is fetched; a `src`/`href` is inert. The document is bytes.
 *
 * Out of envelope: an unclosed block element (the block's extent would be a
 * guess), and any named entity outside the five XML ones (see decodeEntities).
 */
function adaptHtml(text) {
  const source = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Newline offsets ONCE, then binary search per lookup. Rescanning from the
  // start for every locator is O(document x blocks) — quadratic on exactly the
  // large documents this seam exists to handle.
  const newlines = [];
  for (let i = source.indexOf('\n'); i !== -1; i = source.indexOf('\n', i + 1)) newlines.push(i);
  /** 1-based line containing `offset`: 1 + how many newlines precede it. */
  const lineAt = (offset) => {
    let low = 0;
    let high = newlines.length;
    while (low < high) {
      const mid = (low + high) >> 1;
      if (newlines[mid] < offset) low = mid + 1;
      else high = mid;
    }
    return low + 1;
  };

  const blocks = [];
  const open = []; // stack of { tag, kind, textStart, tagStart }
  let i = 0;
  let skipDepth = 0;
  let skipTag = null;

  const emit = (frame, closeAt) => {
    const raw = source.slice(frame.textStart, closeAt);
    // Cell boundaries are content in a table row: without them "Field Meaning"
    // reads as one phrase. The separator matches the markdown adapter's, so a
    // table row means the same thing in the IR whatever format it arrived in.
    const celled = frame.kind === 'table-row'
      ? raw.replace(/<\/t[dh]>\s*<t[dh][^>]*>/gi, ' | ')
      : raw;
    // Strip any nested inline markup: the IR carries text, not markup. The
    // space keeps `a<br>b` from fusing into "ab"; in CODE it would instead
    // introduce indentation the source never had, so a code block strips the
    // tag outright and its whitespace stays byte-exact.
    const stripped = frame.kind === 'code'
      ? celled.replace(/<[^>]*>/g, '')
      : celled.replace(/<[^>]*>/g, ' ');
    const openLine = lineAt(frame.tagStart);
    const decoded = decodeEntities(stripped, `<${frame.tag}> at line ${openLine}`);
    // Code keeps its interior whitespace — it is content — so only the
    // surrounding blank lines the markup introduced come off.
    const body = frame.kind === 'code' ? decoded.replace(/^\n+|\s+$/g, '') : flatten(decoded);
    if (body === '') return;
    const b = block(frame.kind, body, { line: openLine, endLine: lineAt(closeAt) });
    if (frame.kind === 'heading' && /^h[1-6]$/.test(frame.tag)) b.level = Number(frame.tag[1]);
    blocks.push(b);
  };

  while (i < source.length) {
    const lt = source.indexOf('<', i);
    if (lt === -1) break;

    if (source.startsWith('<!--', lt)) {
      const end = source.indexOf('-->', lt + 4);
      if (end === -1) break; // an unterminated comment ends the document
      i = end + 3;
      continue;
    }
    if (source.startsWith('<!', lt)) { // doctype
      const end = source.indexOf('>', lt);
      if (end === -1) break;
      i = end + 1;
      continue;
    }

    const gt = source.indexOf('>', lt);
    if (gt === -1) break;
    const inner = source.slice(lt + 1, gt);
    const closing = inner.startsWith('/');
    const name = /^\/?\s*([a-zA-Z][\w-]*)/.exec(inner)?.[1]?.toLowerCase();
    if (!name) { i = gt + 1; continue; }
    const selfClosing = inner.endsWith('/');

    if (skipDepth > 0) {
      if (name === skipTag) skipDepth += closing ? -1 : 1;
      if (skipDepth === 0) skipTag = null;
      i = gt + 1;
      continue;
    }
    if (!closing && HTML_SKIP.has(name) && !selfClosing) {
      skipDepth = 1;
      skipTag = name;
      i = gt + 1;
      continue;
    }

    const kind = HTML_BLOCK_TAGS.get(name);
    if (kind && !selfClosing) {
      if (closing) {
        // Close the matching frame; anything opened inside it and never closed
        // is a malformed nesting the walk cannot honestly resolve.
        const idx = open.findLastIndex((f) => f.tag === name);
        if (idx === -1) { i = gt + 1; continue; } // stray close: ignorable
        emit(open[idx], lt);
        open.length = idx;
      } else {
        // A block element opening inside another closes it: `<li><p>x</p></li>`
        // must not emit the list item twice.
        if (open.length) {
          const parent = open[open.length - 1];
          emit(parent, lt);
          open.pop();
        }
        open.push({ tag: name, kind, textStart: gt + 1, tagStart: lt });
      }
    }
    i = gt + 1;
  }

  if (open.length) {
    const frame = open[open.length - 1];
    throw new AdaptError(`html: <${frame.tag}> opened at line ${lineAt(frame.tagStart)} is never closed — the block's extent would be a guess, and a partial IR poisons what the reader believes was reviewed (PRD §5.1)`);
  }
  return blocks;
}

// ------------------------------------------------------------------------ pdf

/**
 * `pdf@1` — a minimal, honest, LEXICAL PDF text extractor.
 *
 * There is no PDF dependency here and there never will be one: js-yaml is the
 * engine's only runtime dependency (D-022), and shelling out to `pdftotext`
 * would be a subprocess — exactly what D-014 forbids. So this adapter parses
 * the file format itself, and its envelope is deliberately NARROW: it supports
 * only what the shipped fixture demonstrates, and everything else is a HARD
 * ERROR that names what it hit.
 *
 * IN ENVELOPE:
 *   - Uncompressed content streams, and FlateDecode streams (inflated with
 *     node:zlib — stdlib DECOMPRESSION, not execution: no code from the
 *     document is ever run, and zlib cannot run any).
 *   - Text-showing operators `Tj`, `TJ`, `'`, `"` inside BT/ET blocks, in
 *     content-stream order.
 *   - Literal `(...)` strings with the standard backslash escapes, and hex
 *     `<...>` strings, in the document's default (Latin) encoding.
 *
 * OUT OF ENVELOPE — each a hard error naming what was encountered, because the
 * out-of-envelope discipline applies WITHIN an adapter, not just between
 * formats. A PDF that is 90% extractable is the most dangerous input in this
 * whole pipeline: the coverage map would look complete.
 *   - ENCRYPTED documents (`/Encrypt`): the bytes are not the text.
 *   - Any stream filter other than FlateDecode (LZW, DCT, JBIG2, ASCII85, …).
 *   - A document with NO extractable text (the scanned-page case): scanned
 *     content is converted UPSTREAM by the agent and resubmitted as text.
 *   - Custom font encodings via /Differences: the glyph codes would not be
 *     the characters, so extracted "text" would be plausible mojibake.
 *
 * LOCATOR: `{ page, object }` — the 1-based page ordinal in the document's
 * page order, and the 1-based ordinal of the text-showing operation within
 * that page's content stream. A byte offset would be useless to a reader (a
 * PDF is not line-addressable and the bytes may be compressed), while
 * page + object is what a human opening the file can actually find, and it is
 * fully deterministic: it derives from content-stream order, never from
 * enumeration order or object numbering.
 */
function adaptPdf(bytes) {
  const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  // `latin1` is a byte-preserving round trip: every byte maps to one code unit,
  // so the structure scan below is exact on binary content.
  const raw = buffer.toString('latin1');

  if (!raw.startsWith('%PDF-')) {
    throw new UnsupportedFormatError('pdf: the file does not begin with the %PDF- header — it is not a PDF, and guessing at its structure would be a confident wrong parse (PRD §5.1)');
  }
  if (/\/Encrypt\b/.test(raw)) {
    throw new UnsupportedFormatError(`pdf: the document is ENCRYPTED (/Encrypt) — its content streams are ciphertext, so any "text" extracted from them would be noise presented as content. Out of the pdf@${ADAPTERS.pdf.version} envelope.\n${CONDUCT}`);
  }
  if (/\/Differences\b/.test(raw)) {
    throw new UnsupportedFormatError(`pdf: the document declares a custom font encoding (/Differences) — glyph codes do not map to their characters, so extracted text would be plausible mojibake: exactly the confident wrong parse a coverage map must never carry. Out of the pdf@${ADAPTERS.pdf.version} envelope.\n${CONDUCT}`);
  }

  // ---- objects: `N G obj ... endobj`, scanned lexically in file order.
  const objects = new Map();
  const objectRe = /(\d+)\s+(\d+)\s+obj\b/g;
  let match;
  while ((match = objectRe.exec(raw)) !== null) {
    const id = Number(match[1]);
    const bodyStart = match.index + match[0].length;
    const end = raw.indexOf('endobj', bodyStart);
    if (end === -1) {
      throw new AdaptError(`pdf: object ${id} is never terminated by "endobj" — the file is truncated or malformed; a partial parse would silently drop content (PRD §5.1)`);
    }
    // Last definition wins: an incrementally-updated PDF appends newer
    // revisions of an object, and the later one is the live one.
    objects.set(id, { id, body: raw.slice(bodyStart, end), start: bodyStart });
  }
  if (objects.size === 0) {
    throw new AdaptError('pdf: no PDF objects found — the file is not a readable PDF document');
  }

  /** Inflate or pass through one stream body, refusing every other filter. */
  const streamOf = (object) => {
    const streamAt = object.body.indexOf('stream');
    if (streamAt === -1) return null;
    const filter = /\/Filter\s*(\/\w+|\[[^\]]*\])/.exec(object.body.slice(0, streamAt));
    let start = streamAt + 'stream'.length;
    if (raw[object.start + start] === '\r') start += 1;
    if (raw[object.start + start] === '\n') start += 1;
    const endAt = object.body.indexOf('endstream', start);
    if (endAt === -1) {
      throw new AdaptError(`pdf: object ${object.id} opens a stream that is never closed by "endstream" — malformed; a partial parse would silently drop content`);
    }
    const slice = buffer.subarray(object.start + start, object.start + endAt);
    if (!filter) return slice.toString('latin1');
    const name = filter[1].replace(/[[\]\s]/g, '');
    if (name !== '/FlateDecode' && name !== '/Fl') {
      throw new UnsupportedFormatError(`pdf: object ${object.id} uses the stream filter ${name} — the pdf@${ADAPTERS.pdf.version} adapter decodes uncompressed and /FlateDecode streams only. Decoding it wrongly would yield noise presented as document text.\n${CONDUCT}`);
    }
    try {
      return inflateSync(slice).toString('latin1');
    } catch (error) {
      throw new AdaptError(`pdf: object ${object.id}: FlateDecode stream could not be inflated (${error.message}) — the file is corrupt or the filter is misdeclared; a partial parse would silently drop content`);
    }
  };

  // ---- pages, in document order. /Type /Page objects are scanned in file
  // order, which for a hand-authored/linearized PDF IS page order; the ordinal
  // is the page's position in that scan, so it is stable for identical bytes.
  const pages = [];
  for (const object of objects.values()) {
    if (!/\/Type\s*\/Page\b/.test(object.body)) continue;
    const contents = /\/Contents\s+(\d+)\s+\d+\s+R/.exec(object.body);
    if (!contents) {
      // A page with inline or array contents is a shape this envelope does not
      // read; refusing names it rather than emitting a page with no text.
      throw new UnsupportedFormatError(`pdf: a /Page object references its /Contents in a form the pdf@${ADAPTERS.pdf.version} adapter does not read (a single indirect reference is the declared envelope) — refusing rather than emitting a page whose text was never read.\n${CONDUCT}`);
    }
    pages.push(Number(contents[1]));
  }
  if (pages.length === 0) {
    throw new AdaptError('pdf: no /Type /Page objects found — the document has no pages this adapter can read');
  }

  const blocks = [];
  for (let p = 0; p < pages.length; p += 1) {
    const content = objects.get(pages[p]);
    if (!content) {
      throw new AdaptError(`pdf: page ${p + 1} references content object ${pages[p]}, which does not exist — the file is malformed`);
    }
    const stream = streamOf(content);
    if (stream === null) {
      throw new AdaptError(`pdf: page ${p + 1}'s content object ${pages[p]} carries no stream — nothing to read`);
    }
    for (const text of showTextOperations(stream, p + 1)) {
      blocks.push(block('paragraph', text.value, { page: p + 1, object: text.ordinal }));
    }
  }

  if (blocks.length === 0) {
    throw new UnsupportedFormatError(`pdf: the document carries NO extractable text — every page is likely scanned images. This pipeline ingests deterministic text only; image conversion is upstream and probabilistic, so it is out of the pdf@${ADAPTERS.pdf.version} envelope rather than a best-effort partial.\n${CONDUCT}`);
  }
  return blocks;
}

/**
 * Walk one content stream and yield its text-showing operations in order.
 *
 * A content stream is postfix: operands precede the operator. This walk tracks
 * only what it needs — the most recent string operands — and recognizes the
 * four text-showing operators. Everything else (positioning, graphics state)
 * is skipped: it affects layout, and the IR carries text, not layout.
 *
 * Consecutive shows are joined into one block per `Tj`/`TJ`/`'`/`"` operation,
 * which is the finest granularity the format offers honestly: PDF has no
 * paragraph concept, so inventing one by clustering coordinates would be a
 * guess. One operation, one block, one locator ordinal.
 */
function showTextOperations(stream, page) {
  const out = [];
  const operands = [];
  let i = 0;
  let ordinal = 0;

  while (i < stream.length) {
    const ch = stream[i];
    if (ch === '%') { // comment to end of line
      const nl = stream.indexOf('\n', i);
      i = nl === -1 ? stream.length : nl + 1;
      continue;
    }
    if (/\s/.test(ch)) { i += 1; continue; }

    if (ch === '(') {
      const { value, end } = readLiteralString(stream, i, page);
      operands.push(value);
      i = end;
      continue;
    }
    if (ch === '<' && stream[i + 1] !== '<') {
      const close = stream.indexOf('>', i);
      if (close === -1) throw new AdaptError(`pdf: page ${page}: unterminated hex string`);
      const hex = stream.slice(i + 1, close).replace(/\s/g, '');
      if (!/^[0-9a-fA-F]*$/.test(hex)) {
        throw new AdaptError(`pdf: page ${page}: malformed hex string — a partial decode would present noise as text`);
      }
      const padded = hex.length % 2 ? `${hex}0` : hex;
      operands.push(Buffer.from(padded, 'hex').toString('latin1'));
      i = close + 1;
      continue;
    }
    if (ch === '<' || ch === '[' || ch === ']' || ch === '{' || ch === '}') {
      // `<<` dictionaries and array delimiters: `[` and `]` bracket a TJ array,
      // whose string operands we have already collected in order.
      if (ch === '<' && stream[i + 1] === '<') { i += 2; continue; }
      i += 1;
      continue;
    }

    // A token: an operator, a name (/Foo), or a number.
    const token = /^[^\s()<>[\]{}/%]+|^\/[^\s()<>[\]{}/%]*/.exec(stream.slice(i));
    if (!token) { i += 1; continue; }
    const word = token[0];
    i += word.length;

    if (word === 'Tj' || word === 'TJ' || word === "'" || word === '"') {
      const value = flatten(decodePdfText(operands.join('')));
      ordinal += 1;
      if (value !== '') out.push({ value, ordinal });
      operands.length = 0;
      continue;
    }
    // Any other operator consumes its operands.
    if (!word.startsWith('/') && !/^[-+.\d]/.test(word)) operands.length = 0;
  }
  return out;
}

/** PDF literal string: balanced parens, backslash escapes, `\ddd` octal. */
function readLiteralString(stream, start, page) {
  let depth = 0;
  let out = '';
  let i = start;
  while (i < stream.length) {
    const ch = stream[i];
    if (ch === '\\') {
      const next = stream[i + 1];
      const simple = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', '(': '(', ')': ')', '\\': '\\' };
      if (next in simple) { out += simple[next]; i += 2; continue; }
      const octal = /^[0-7]{1,3}/.exec(stream.slice(i + 1));
      if (octal) {
        out += String.fromCharCode(Number.parseInt(octal[0], 8));
        i += 1 + octal[0].length;
        continue;
      }
      if (next === '\n') { i += 2; continue; } // line continuation
      i += 1; // stray backslash: the spec says drop it
      continue;
    }
    if (ch === '(') { depth += 1; if (depth > 1) out += ch; i += 1; continue; }
    if (ch === ')') {
      depth -= 1;
      if (depth === 0) return { value: out, end: i + 1 };
      out += ch;
      i += 1;
      continue;
    }
    out += ch;
    i += 1;
  }
  throw new AdaptError(`pdf: page ${page}: unterminated literal string — the file is malformed; a partial parse would silently drop content`);
}

/**
 * PDF text bytes are latin1 code units under the default encodings this
 * envelope accepts. A byte above 0x7F that is not valid PDFDocEncoding-as-
 * latin1 text is left as-is: it round-trips its own byte. UTF-16BE strings
 * (BOM-prefixed, per the spec) are decoded — that spelling is unambiguous.
 */
function decodePdfText(value) {
  if (value.charCodeAt(0) === 0xFE && value.charCodeAt(1) === 0xFF) {
    return Buffer.from(value.slice(2), 'latin1').swap16().toString('utf16le');
  }
  return value;
}

// -------------------------------------------------------------- the registry

/**
 * Format name -> adapter. Each entry is frozen and carries:
 *   - `version`   the recipe's version, surfaced in the IR as `<name>@<n>`
 *   - `extensions` the file extensions that dispatch to it
 *   - `binary`    whether `adapt` receives a Buffer (pdf) or a string
 *   - `adapt`     the pure recipe: source -> Block[]
 *
 * Clients author later adapters exactly as they author extractor kinds: a
 * versioned module here plus a shipped sample/expected pair beside the others,
 * pinned by a test (D-005 — only vendored, versioned, test-covered code runs).
 */
export const ADAPTERS = Object.freeze({
  md: Object.freeze({ version: 1, extensions: ['.md', '.markdown'], binary: false, adapt: adaptMarkdown }),
  txt: Object.freeze({ version: 1, extensions: ['.txt', '.text'], binary: false, adapt: adaptText }),
  html: Object.freeze({ version: 1, extensions: ['.html', '.htm'], binary: false, adapt: adaptHtml }),
  pdf: Object.freeze({ version: 1, extensions: ['.pdf'], binary: true, adapt: adaptPdf }),
});

/** The formats an out-of-envelope message offers, in a stable order. */
export const SUPPORTED = Object.freeze(Object.keys(ADAPTERS).sort());

/**
 * Dispatch BY FILE EXTENSION, never by content sniffing.
 *
 * The grammars are disjoint, and guessing one from lookalike bytes is the
 * confident-wrong-parse failure class (the same call `strings-keys` makes in
 * lib/extractor-kinds.js). A `.docx` renamed to `.md` should fail loudly on
 * its content, not be silently misread — and an extension nobody adapted is
 * the hard error this ticket exists to guarantee.
 *
 * @param {string} path the submission's path (only its extension is read)
 * @returns {{ name: string, version: number, binary: boolean, adapt: Function }}
 */
export function adapterFor(path) {
  const dot = path.lastIndexOf('.');
  const slash = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  const extension = dot > slash ? path.slice(dot).toLowerCase() : '';
  for (const [name, adapter] of Object.entries(ADAPTERS)) {
    if (adapter.extensions.includes(extension)) return { name, ...adapter };
  }
  const named = extension === '' ? 'a file with no extension' : `'${extension}'`;
  throw new UnsupportedFormatError(`no format adapter for ${named} — out-of-envelope input.\nA best-effort partial parse is never offered: it would poison what the team believes was reviewed (PRD §5.1). Adapters: ${SUPPORTED.join(', ')}.\n${CONDUCT}`);
}

/**
 * Adapt one submission into the IR envelope.
 *
 * The returned object is the whole contract UCS-1156 builds on: the adapter's
 * provenance, a content hash of the SOURCE BYTES (so identical submissions
 * dedupe), and the ordered blocks. Deterministic in full — no timestamps, no
 * paths beyond the caller's own, no enumeration order.
 *
 * @param {string} path the submission's path, for dispatch and provenance
 * @param {Buffer} bytes the submission's bytes
 * @returns {{ adapter: string, hash: string, blocks: object[] }}
 */
export function adapt(path, bytes) {
  const adapter = adapterFor(path);
  const source = adapter.binary ? bytes : bytes.toString('utf8');
  const blocks = adapter.adapt(source);
  if (blocks.length === 0) {
    throw new AdaptError(`${adapter.name}: the document produced no blocks — it is empty, or its content is in a shape this adapter cannot see. An empty IR would report a reviewed document as covered, so it is a hard error (PRD §5.1).\n${CONDUCT}`);
  }
  return {
    adapter: `${adapter.name}@${adapter.version}`,
    hash: `fnv1a64:${fnv1a64(bytes)}`,
    blocks,
  };
}

/**
 * FNV-1a (64-bit) over the source bytes, as 16 lowercase hex digits.
 *
 * A content hash, not a cryptographic one: its job is to say "these two
 * submissions are the same bytes" so resubmissions dedupe. Hand-rolled over
 * BigInt because the engine has no crypto budget to spend and `node:crypto`
 * would be a heavier dependency on a hot path than this arithmetic.
 */
function fnv1a64(bytes) {
  const prime = 0x100000001b3n;
  const mask = 0xFFFFFFFFFFFFFFFFn;
  let hash = 0xcbf29ce484222325n;
  for (const byte of bytes) {
    hash = ((hash ^ BigInt(byte)) * prime) & mask;
  }
  return hash.toString(16).padStart(16, '0');
}
