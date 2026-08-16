/**
 * Ingest (UCS-1153) — the format-adapter seam at the command line.
 *
 * One document in, one intermediate representation out: ordered blocks with
 * kinds and source locators, normalized from md / txt / html / pdf by the
 * versioned adapters in lib/format-adapters.js. Everything downstream reads
 * the IR; nothing downstream re-reads the original bytes.
 *
 * The seam exists as its own surface because the whole point is that it is
 * TESTABLE AND COMPOSABLE: the document coverage map (UCS-1156) is built on
 * this output, and an agent can run it directly to see exactly what the
 * engine believes a document contains — the same way `survey-map` shows what
 * it believes a repo contains.
 *
 * EXIT CODES (PRD §5, D-011). This surface has no findings to report — it
 * either produces an IR or it does not:
 *   0 — the document was adapted; the IR is on stdout.
 *   2 — the format has no adapter, the content is outside the adapter's
 *       envelope, or the file could not be read.
 *
 * There is no exit 1 and no partial IR. An unsupported format is a HARD ERROR
 * WITH CONDUCT, never a best-effort parse: a silent partial poisons what the
 * team believes was reviewed, which is worse than no review at all (D-005 /
 * D-012, the false-all-clear class). The refusal names the format and states
 * every way forward — convert and resubmit, author an adapter, or convert
 * scanned content upstream and resubmit the text.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { EXIT_CODES } from '../lib/exit-codes.js';
import { parseArgs as parseFlags, rethrowIfBug, UsageError } from '../lib/cli.js';
import { AdaptError, UnsupportedFormatError, adapt, adapterFor } from '../lib/format-adapters.js';

export const USAGE = 'usage: node payload/engine/ingest.js <document> [--json]';

function parseArgs(argv) {
  const { options, positionals } = parseFlags(argv, {
    boolean: ['json'],
    positionals: true,
  });
  if (positionals.length === 0) {
    throw new UsageError('nothing to ingest — name one document to adapt');
  }
  if (positionals.length > 1) {
    // Two documents would produce two IRs with no honest way to say which
    // blocks came from which; the caller runs the command twice.
    throw new UsageError(`unexpected argument ${JSON.stringify(positionals[1])} — ingest adapts one document at a time`);
  }
  return { document: positionals[0], json: !!options.json };
}

/**
 * Render the IR for a human: the provenance line, then one line per block.
 * The locator is printed in the adapter's own scheme (line-based for text
 * formats, page/object for pdf) — the reader needs to find the block in the
 * source, and those are the coordinates the source actually has.
 */
function printHuman(ir, document) {
  const locate = ({ line, endLine, page, object }) =>
    page === undefined
      ? `L${line}${endLine !== line ? `-${endLine}` : ''}`
      : `p${page}#${object}`;
  const width = Math.max(...ir.blocks.map((b) => locate(b.locator).length));
  const lines = [
    `${document}: ${ir.blocks.length} block(s) via ${ir.adapter} (${ir.hash})`,
    ...ir.blocks.map((b) => {
      const text = b.text.replace(/\n/g, ' ');
      const excerpt = text.length > 72 ? `${text.slice(0, 71)}…` : text;
      return `  ${locate(b.locator).padEnd(width)}  ${b.kind.padEnd(10)}  ${excerpt}`;
    }),
  ];
  process.stdout.write(`${lines.join('\n')}\n`);
}

/**
 * CLI entry. Deterministic by construction: the IR is a pure function of the
 * document's bytes, so two runs over the same file are byte-identical.
 */
export function main(argv) {
  const opts = parseArgs(argv); // a UsageError reaches the harness

  // DISPATCH BEFORE READ, deliberately. Whether the bytes exist is irrelevant
  // when no adapter claims the format: reading first would answer a `.docx`
  // submission with "cannot read", burying the conduct the submitter needs
  // behind an incidental filesystem detail.
  try {
    adapterFor(opts.document);
  } catch (error) {
    rethrowIfBug(error); // a bug is not a refusal — the harness prints its stack
    if (!(error instanceof UnsupportedFormatError)) throw error;
    process.stderr.write(`error: ${error.message}\n`);
    return EXIT_CODES.FAILURE;
  }

  const path = resolve(opts.document);
  let bytes;
  try {
    bytes = readFileSync(path);
  } catch (error) {
    rethrowIfBug(error);
    process.stderr.write(`ingest: cannot read ${opts.document}: ${error.message}\n`);
    return EXIT_CODES.FAILURE;
  }

  let ir;
  try {
    ir = adapt(opts.document, bytes);
  } catch (error) {
    rethrowIfBug(error);
    if (!(error instanceof UnsupportedFormatError || error instanceof AdaptError)) throw error;
    // The refusal and its conduct go to stderr, and NOTHING goes to stdout:
    // a caller piping stdout must receive no IR at all, not a truncated one.
    process.stderr.write(`error: ${error.message}\n`);
    return EXIT_CODES.FAILURE;
  }

  if (opts.json) process.stdout.write(`${JSON.stringify({ document: opts.document, ...ir }, null, 2)}\n`);
  else printHuman(ir, opts.document);
  return EXIT_CODES.CLEAN;
}
