/** Original YAML scalar byte spans; independent of identity and migration policy. */
import { load, parseEvents, getScalarValue, EVENT_ID, SCALAR_STYLE } from 'js-yaml';
const keyOf = (value) => JSON.stringify(value);
const SCALAR_STYLES = Object.freeze({
  [SCALAR_STYLE.PLAIN]: 'plain',
  [SCALAR_STYLE.SINGLE_QUOTED]: 'single-quoted',
  [SCALAR_STYLE.DOUBLE_QUOTED]: 'double-quoted',
  [SCALAR_STYLE.LITERAL_BLOCK]: 'literal-block',
  [SCALAR_STYLE.FOLDED_BLOCK]: 'folded-block',
});

export class SourceDocumentError extends Error {}

/** Original UTF-8 ranges, never offsets into a reserialized document. */
export function parseSource({ file, kind, bytes }) {
  const original = bytes.toString('utf8');
  if (!Buffer.from(original).equals(bytes)) throw new SourceDocumentError('source is not valid UTF-8');
  let source = original;
  let origin = 0;
  let body = null;
  if (kind === 'knowledge-leaf') {
    const open = /^(?:\uFEFF)?---[ \t]*\r?\n/.exec(original);
    if (!open) throw new SourceDocumentError('missing Markdown frontmatter opening fence');
    origin = open[0].length;
    const close = /^---[ \t]*\r?$/m.exec(original.slice(origin));
    if (!close) throw new SourceDocumentError('missing Markdown frontmatter closing fence');
    source = original.slice(origin, origin + close.index);
    const bodyOffset = origin + close.index + close[0].length;
    body = { text: original.slice(bodyOffset), span: { start: Buffer.byteLength(original.slice(0, bodyOffset)), end: bytes.length } };
  }
  const events = parseEvents(source, { filename: file });
  for (const event of events) {
    if (event.type === EVENT_ID.ALIAS || event.anchorStart >= 0 || event.tagStart >= 0) {
      const offset = [event.anchorStart, event.tagStart, event.start].find((position) => position >= 0) ?? 0;
      const error = new SourceDocumentError('anchors, aliases and explicit tags require source adjudication');
      error.code = 'unsupported-yaml';
      error.line = original.slice(0, origin + offset).split('\n').length;
      throw error;
    }
  }
  const value = load(source, { filename: file, maxAliases: 0 });
  const spans = new Map();
  let cursor = 0;
  function walk(path) {
    const event = events[cursor++];
    if (event.type === EVENT_ID.DOCUMENT) {
      walk(path);
      cursor += 1; // document POP; load() already rejected multiple documents
    } else if (event.type === EVENT_ID.MAPPING) {
      while (events[cursor].type !== EVENT_ID.POP) {
        const key = events[cursor++];
        if (key.type !== EVENT_ID.SCALAR) throw new SourceDocumentError('complex mapping keys require source adjudication');
        walk([...path, getScalarValue(source, key)]);
      }
      cursor += 1;
    } else if (event.type === EVENT_ID.SEQUENCE) {
      let index = 0;
      while (events[cursor].type !== EVENT_ID.POP) walk([...path, index++]);
      cursor += 1;
    } else if (event.type === EVENT_ID.SCALAR) {
      spans.set(keyOf(path), {
        start: Buffer.byteLength(original.slice(0, origin + event.valueStart)),
        end: Buffer.byteLength(original.slice(0, origin + event.valueEnd)),
        style: SCALAR_STYLES[event.style],
        line: original.slice(0, origin + event.valueStart).split('\n').length,
      });
    }
  }
  walk([]);
  return { value, spans, body };
}

