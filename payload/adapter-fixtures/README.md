# adapter-fixtures — the sample/expected pairs for format adapters

One directory per format, each carrying a `sample.<ext>` document and the
`EXPECTED.yaml` intermediate representation the adapter must produce from it.
The shape is deliberately IDENTICAL to the extractor-kind pairs — sample plus
expectation, pinned by kit CI — because these fixtures do the same double
duty: they are the runnable gate, and they are the authoring template a client
imitates when drafting an adapter for a format the kit does not ship (D-005:
only vendored, versioned, test-covered code ever runs).

Every sample is adversarial-but-adaptable on purpose: reflowed paragraphs,
code whose indentation is content, entities, nested block elements, PDF
kerning arrays and escapes. Gnarly input that stays INSIDE the envelope.
Out-of-envelope shapes (a `.docx` submission, an encrypted PDF, a scanned page
with no text) are NOT here: those hard-error by design, so there is no IR to
expect from them.

`EXPECTED.yaml` fields: `format` + `file` + `adapter` (the versioned name, e.g.
`md@1`) + `hash` (FNV-1a over the sample's bytes) + `blocks`. Each block is
`kind` + `text` + `locator`, plus `level` on headings.

**Order is contract.** Extractor pairs compare value SETS (§3.5, order is
presentation); adapter pairs compare an ORDERED SEQUENCE, because the IR
preserves document order and everything downstream reads it that way.

**Locators** are per-format, and each is deterministic:

| format | locator | meaning |
|--------|---------|---------|
| md, txt, html | `{ line, endLine }` | 1-based inclusive lines in the sample |
| pdf | `{ page, object }` | 1-based page ordinal, then text-operation ordinal within that page's content stream |

A PDF has no lines to point at, so it gets the coordinates it actually has.

## Authoring a new adapter

1. Add a versioned entry to `ADAPTERS` in `engine/lib/format-adapters.js`: a
   pure `adapt(source) -> Block[]`, lexical only — no client-code execution,
   no subprocess, no network, no eval (D-014).
2. Declare its envelope in the module doc comment, and make everything outside
   that envelope a HARD ERROR that names what was encountered. Never a partial
   parse: a document reported as covered when half of it was never read is the
   false-all-clear failure class (D-005/D-012), and it is worse than no
   coverage at all.
3. Ship a pair here, and pin it in the kit's tests the way the shipped four
   are pinned.

**Versioning.** Bump an adapter's version when the same input would produce
different IR bytes (a new block kind, a changed locator scheme, different
splitting or ordering) — maps built under different versions are not
comparable, and the version is what says so. Do not bump for a widened
envelope that leaves previously-accepted input byte-identical. A bump updates
the fixture pair in the same commit.
