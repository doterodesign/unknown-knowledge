# UCS-1153 — Format adapters → IR (md, txt, html, pdf)

Branch `ucs-1153-format-adapters-ir-md-txt-html-pdf-with-fixture-pairs-and` ·
commit `4671a76` · PR [#58](https://github.com/doterodesign/unknown-knowledge/pull/58)
(base `faceted-store-v2`, not merged).

## What shipped

Deterministic, versioned format adapters normalize any submission to one
intermediate representation: ordered blocks with kinds and source locators.
Everything downstream (UCS-1156's coverage map) reads the IR; nothing re-reads
the original bytes.

### Files by concern

**The adapter library**
- `payload/engine/lib/format-adapters.js` — the whole seam: four adapters, the
  `ADAPTERS` registry, `adapterFor` (extension dispatch), `adapt` (the IR
  envelope), `CONDUCT` (the golden refusal text), `BLOCK_KINDS`, and the two
  refusal classes. Both extend `EngineRefusal`, which is what makes the
  surface report them as clean messages instead of stack traces.

**The CLI surface** (two-file shim + implementation, per repo convention)
- `payload/engine/ingest.js` — entry shim, statically imports nothing.
- `payload/engine/commands/ingest.js` — flags, exit codes, human/JSON output.

**Fixture pairs** (`payload/adapter-fixtures/`)
- `md/`, `txt/`, `html/`, `pdf/` — each `sample.<ext>` + `EXPECTED.yaml`.
- `README.md` — the authoring guide (shape, locator table, versioning rules).
- `scripts/make-pdf-fixture.js` — generates the hand-crafted sample PDF so
  `EXPECTED.yaml` is reviewable rather than checked against an opaque binary.

**Tests**
- `tests/format-adapters.test.js` — 19 tests across four claims (pairs,
  determinism, the hard error, lexical-only).

**Registration in existing structural pins** (each caught the new surface)
- `cli/kit.manifest.yaml` — adapter fixtures ship unconditionally.
- `CONTEXT.md`, `README.md` — surface count and glossary/table entries.
- `tests/context-glossary.test.js`, `tests/exit-code-contract.test.js`,
  `tests/module-load.test.js`.

## Design decisions

**Entry point — a new `ingest.js` surface, not `resolve.js --doc`.** The
prototype spells it `resolve --doc`, but `resolve` is a 1444-line query
resolver that never exits 1 and assumes a store root. UCS-1156 builds *on*
this seam, so it ships standalone and composable. Exit 0 with IR on stdout,
exit 2 with conduct on stderr; exit 1 is unreachable (no findings to report),
which `tests/exit-code-contract.test.js` enforces structurally.

**IR block taxonomy (closed):** `heading`, `paragraph`, `list-item`, `code`,
`table-row`. A format that cannot see a distinction emits fewer kinds and
never invents structure — the txt adapter's whole point.

**Locators:** `{ line, endLine }` (1-based inclusive) for md/txt/html;
`{ page, object }` for pdf, since a PDF is not line-addressable. Both pdf
coordinates derive from content-stream order, never object numbering, so they
are stable for identical bytes.

**Detection by extension only.** Content sniffing is the confident-wrong-parse
class (the call `strings-keys` already makes). Dispatch runs *before* the file
read, so a `.docx` gets the conduct, not "cannot read" — a bug the tests
caught and I fixed.

**pdf envelope.** In: uncompressed + FlateDecode streams, `Tj`/`TJ`/`'`/`"`,
literal and hex strings, standard escapes. Out, each a distinct hard error
naming what it hit: `/Encrypt`, any other stream filter, `/Differences`, and
a document with no extractable text (the scanned-page case → upstream
conversion). Zero new dependencies; `node:zlib` is stdlib decompression, not
execution.

**Versioning.** Each adapter carries a version surfaced as `md@1`. Bump when
the same input would produce different IR bytes; do not bump for a widened
envelope leaving accepted input byte-identical. Rules documented in the module
header and the fixtures README.

**Fixture posture — unconditional, unlike D-009's per-stack extractor
fixtures.** An extractor kind is stack-specific; a format is not. Any client
can be handed a PDF, and the pairs are the authoring template needed at the
moment of a refusal (D-001: no vendor to return to). Verified: a seeded kit
receives all four pairs at `engine/tests/adapter-fixtures/`.

## Gates

- `npm test` — **808 pass, 0 fail** (789 baseline + 19 new)
- `npm run lint` — 189 files, 0 failures
- `npm run acceptance` — OK, including the D-014 no-code-execution grep

## Review round (CodeRabbit, 11 findings) — commit `0cb0473`

Gates after fixes: **810 pass / 0 fail**, lint clean, acceptance OK.
8 fixed, 2 declined, 1 resolved as a design call.

**The contradiction pair (2 + 4).** Finding 2 wanted the html fixture to
expect `list-item` for `<li><p>x</p></li>`; finding 4 wanted the doc corrected
to match the emitted `paragraph`. Resolved as **child-kind-wins**: kept the
behavior, fixed the doc, declined #2 by construction. The block *is* a
paragraph; list membership is outline structure the IR flattens (as the md
adapter already does), and labeling text with an ancestor that does not
directly contain it has no principled stopping point up the chain. Now pinned
by a test covering both the nested and direct-`<li>` cases.

**Fixed:** #1 spread → fold in `printHuman` (verified: `Math.max(...arr)`
throws `RangeError` at 200k elements — a real crash on the happy path); #6
`lineAt` newline offsets precomputed + binary search, `openLine` computed once;
#7 `<pre><code>` leading space (real bug — tag-strip substituted a space that
became indentation code never had); #5 `@returns` phantom `source` key; #11
generator byte-identity overclaim (committed bytes + pinned hash is the
contract; `deflateSync` varies by zlib version); #8 positive assertion of
ingest's no-yaml behavior replacing the bare `continue`; #9 fence regexes
hoisted.

**Declined:** #3 claimed `sample.pdf` was absent — false, it is committed
(1269 bytes in HEAD), expands through the manifest, and lands in a seeded kit;
the reviewer likely could not see binary content in the diff. #10 asked the
shim to match the other shims' idiom — it already is byte-identical to
`survey-map.js`/`resolve.js` apart from the command name.
