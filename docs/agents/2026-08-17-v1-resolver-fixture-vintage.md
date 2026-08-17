# v1 resolver scoring-ladder fixture — design-studio vintage

Re-themed `tests/fixtures/resolver/store/**` (the KK-06 / A4 scoring-ladder
fixture) and its consuming assertions to the design-studio world. The
`tests/fixtures/resolver/on-disk/**` fixture was already API/model-themed and
carried no retired vocabulary, so it was left untouched.

## The new ladder (scoring roles preserved exactly)

The store is a design-tool's asset/export ontology. Each concept keeps its id
and plays the same scoring role it did before:

| id    | term          | status     | role in the ladder                                  |
|-------|---------------|------------|-----------------------------------------------------|
| K-100 | Asset source  | active     | exact-alias (80) via `swatch`; alias-word (50) via `variant` (alias "asset variant"); confusable-with K-110 |
| K-110 | Asset target  | active     | term-word tie (60) with K-100 on the shared word "asset"; folder pointer `src/design/targets` |
| K-120 | Export        | active     | exact-term (100) on `export`; summary-word (40) on `artboards`; file pointer `src/design/export.ts` |
| K-130 | Export preset | draft      | term-word "export" → 60 − 30 draft downrank = 30; exact-term `export preset` → 70 |
| K-140 | Palette       | deprecated | surfaces flagged; summary-word (40) on `export`; folder pointer `src/palette` |

Query → behavior mapping the tests pin:

- `export` → K-120 exact-term 100; also K-140 summary-match 40 (deprecated) and
  K-130 term-match 30 (draft) — the "one ranked list" golden.
- `swatch` → K-100 exact-alias 80 (kept unique: no other concept mentions it).
- `asset` → K-100 + K-110 both term-match 60, tie broken by id ascending.
- `variant` → K-100 alias-match 50 (from alias "asset variant").
- `artboards` → K-120 summary-match 40 (kept unique to K-120's summary).
- `export preset` → K-130 exact-term, 70 after the draft downrank.
- `palette` → K-140 surfaced flagged `[deprecated]`.

## Knowledge leaves

- `L-000410` (notation 410.1) → `design-system/410.1-export-format-windows.md`,
  heading "Export format windows", verified, carries provenance, `terms:
  [Export, export window]` so it is the entry point for K-120. Excerpt (topic
  sentence): "Renderers flush exported artboards in fixed windows."
- `L-000411` (notation 410.2) → `design-system/410.2-supported-asset-kinds.md`,
  heading "Supported asset kinds", draft, no provenance, `terms: [asset
  variant]` so it is the (downranked) entry point for K-100. Excerpt: "Which
  kinds an editor accepts for import is decided per surface."

Accession ids (L-000410/411), concept ids (K-100..K-140), notations
(410.1/410.2), and the file/folder-pointer structure are all unchanged. Only
slugs, dirs (`knowledge/payments/` → `knowledge/design-system/`,
`classes/100-payments.yaml` → `classes/100-design.yaml`), titles, terms,
aliases, summaries, bodies, domains, and source-of-truth pointer paths changed.

## Source-of-truth pointers (for --paths reverse lookup)

- `src/design/export.ts` (file) → K-120
- `src/design/targets` (folder) → K-110
- `src/palette` (folder) → K-140
- `src/design/assets/registry.ts` (file) → K-100

These are notional (nothing on disk), which is exactly the
diff-names-deleted-paths case the `--paths` folder-nesting tests exercise.

## Test files updated

- `tests/resolve.test.js` — every query string, scoring assertion, golden
  knowledge block (heading/excerpt/file/pointer), confusable-with, human-output
  regex, and `--paths` pointer path realigned to the new ladder.
- `tests/query-decomposition.test.js` — only the one line in the
  "registry-absent store" test: query `settlement` → `export`, still asserting
  K-120 resolves.

## Roles that could not be preserved

None. Every scoring rung, the draft downrank, the deprecated flag, the
confusable-with pair, the file-vs-folder pointer distinction, the two knowledge
entry points, and the human-surface behavior all map cleanly onto the new
vocabulary.

## Gates

- `node --test tests/resolve.test.js tests/query-decomposition.test.js`: 76
  pass, 0 fail.
- Confidentiality sweep over `tests/fixtures/resolver` and `tests/resolve.test.js`:
  zero matches for the retired vocabulary family.
