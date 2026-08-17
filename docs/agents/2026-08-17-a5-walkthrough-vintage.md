# A5 walkthrough re-capture — design-studio fixture vintage (2026-08-17)

Scope: the five `acceptance/A5-*.md` walkthroughs and the five skill/protocol
tests that pin them (`tests/{knowledge-reflect,knowledge-audit,knowledge-bootstrap,kb-build,agents-md}.test.js`).
Every captured output block was re-produced by actually running the engine
against the (already-rewritten) design-studio fixtures and pasted byte-honest.

## Walkthroughs re-captured

### A5-agents-md-walkthrough (runs on fixtures/ts-app)

- Task: **"add `avif` as a supported export format"**.
- RESOLVE query `export format`; K-101 "Export format"; the
  confusable is K-113 "Export preset". Real run now emits **two** near-miss
  lines (concept K-113 + operation `add-export-format`) because "export format"
  overlaps both — pasted as captured.
- PREFLIGHT drift concept K-102 evidence source → `src/registry/blend-modes.ts`;
  the quarantined-value conduct answers `normal, multiply, screen, overlay`
  (claimed `luminosity` withheld).
- Reverse lookup on `src/registry/export-formats.ts` lists K-101 + K-108 (the
  planted wrong-pointer), exactly as before.
- Decision draft `D-2026-07-08-avif-launch`.

### A5-knowledge-audit-walkthrough (runs on fixtures/ts-app)

- Seeded findings: K-108 quarantine (pointer `export-formats.ts`), K-102
  correction (`blend-modes.ts` / `luminosity`), a miss on `export-presets.ts`,
  and a proposed decision `D-2026-04-02-plan-tier-source` (was loyalty-tier).
- **Surprising delta:** the reverse-audit candidate count rose **41 → 48**
  (the new ts-app has more source files: split verticals, extra registries).
  Pasted the real `48 candidate(s), 16 matched, 4 findings`. The four
  `unmatched-anchor` paths are unchanged (`src`, `src/registry`,
  `src/registry/locales.ts`, `src/types`).
- Heartbeat counts (`findings 2, misses 1, gaps 0`), the quarantine fragment
  path, and `top quarantined: K-108 (1)` all held identically — the audit test
  pins these and passes unchanged.

### A5-knowledge-reflect-walkthrough (runs on fixtures/swift-app)

- New story: K-110 "Canvas tool" claims `eyedropper` (absent) and misses
  `comment` (source case) in `Sources/Canvas/CanvasTool.swift`; K-120 dispute is
  `hand`'s shortcut `Cmd-H` vs `H` (line 19 `case hand = "H"` decides it); K-130
  is a toolbar-actions retrieval-struggle.
- Residue term is **`stencil`**; resolved-context is `add-tool`; the
  referenced document is `docs/tool-expansion.md`, section "Planned tools". The reflect test's four residue pins were updated to
  match (`stencil`, `add-tool`, `tool-expansion.md`).
- All create/reject/resolve/illegal-transition/re-open JSON blocks re-captured;
  the status tally (1 open / 1 rejected / 7 resolved) and the illegal-transition
  exit-2 message are byte-identical to the old world.

### A5-kb-build-walkthrough (runs on fixtures/ts-app)

- Incoming item is **SVG asset
  export precision** (cites *W3C SVG 2 Recommendation §7.11*). New leaf
  `L-000110` "SVG asset export precision" under `product/engineering`, operation
  `export-asset`, form `reference`, authority `regulator`.
- CLASSIFY query `asset` (K-104 "Asset kind", term-match score
  60, near-miss on `export-asset`). Seed mints `product/engineering`,
  `reference`, `export-asset`, `regulator`.
- Orphan probe, clean run, gap fragment, and the two hooks (`pre-commit` exit 1,
  `reverse-lookup` over 2 staged paths exit 0, empty-diff exit 0, no-repo exit 2)
  all re-captured. The reverse-lookup lists K-104 on `src/types/asset-kind.ts`.

### A5-knowledge-bootstrap-walkthrough (runs on fixtures/swift-app)

- Builds the ontology from scratch: classes `100-canvas`/`200-platform`;
  concepts K-100 "Canvas" (folder `Sources/Canvas`),
  K-110 "Canvas tool" (case-name), K-120 "Tool shortcut" (raw-value V/F/P/T/H/C).
- Survey-map re-captured: 16 files / 22 candidates initial, 9 files / 16
  candidates after scope — the anchor list now shows `Sources/Canvas/Actions.swift`
  and `Sources/Canvas/CanvasTool.swift` (alphabetical, before `Sources/Payments/`).
- The `--paths` idempotency probe output order flipped (CanvasTool.swift now
  sorts before Providers.swift) — pasted as the real run gives it.
- KB skeleton domains → `design-system` (tokens/components/theming) and
  `product` (editor/engineering). Final validators both green (3 concepts).

## Notes / surprises

- `Sources/Payments/Providers.swift` remains the computed-array miss specimen;
  it reads as an ordinary in-app billing surface (Stripe/Adyen), client-neutral
  for a SaaS design tool, and carries no old-topic vocabulary. The shipped
  bootstrap skill example that named this path was later changed to a neutral
  `Sources/Integrations/Providers.swift`.

## Verification

- `node --test` on all five pinning tests: **65 pass, 0 fail**.
- Scoped banned-word sweep over the five walkthroughs, `acceptance/README.md`,
  and the five test files: **zero matches**.
