# UCS-1147 — A5 kb-build walkthrough re-synced to the accession contract

Date: 2026-08-16
Branch: `ucs-1147-contract-notation-demoted-to-optional-legacy-field-accession`
File changed: `acceptance/A5-kb-build-walkthrough.md` (the ONLY file this task modified)

## Task

Update the A5 walkthrough so it honestly demonstrates the inverted leaf-identity
contract (accession `id: L-NNNNNN` required and the sole citation target;
dotted `notation` demoted to an optional legacy display label), stays in sync
with the already-rewritten `payload/protocol/skills/kb-build.md`, and pastes
byte-honest engine output that was actually re-captured rather than hand-edited.

## Accession minted

**`L-000110`** — free, since `fixtures/ts-app` carries exactly one leaf
(`L-000100`). Sharded to `knowledge/L-00/` (`L-` + first two digits of the
numeric part `000110`).

## Changes, section by section

### Setup (the human, not the agent) — EXPANDED

The pre-existing setup only seeded `knowledge/_rules.yaml`. That was already a
latent hole: the drafted leaf uses `facets.domain: product/payments`,
`facets.form: reference`, `operations: [ship-frontend]` and
`citations[].authority: regulator`, none of which the fixture's registries mint.
Running the walkthrough as written produced **4 blocking findings**
(1 `unminted-segment`, 3 `unregistered-value`), so the pasted "exit 0" was not
reproducible.

Added four `cat >>` heredocs minting those values into
`_registries/domains.yaml`, `form.yaml`, `operations.yaml`,
`authority-tiers.yaml`, each with the `gloss` / `warrant` / `decision: D-101` /
`minted` shape the fixture's existing registry entries use. Framed as the
human's job, matching the skill's rule that minting a registry value is a
registry edit plus a Decisions entry and never the drafting agent's to invent.

### 1. CLASSIFY — heading and body rewritten

- Heading `## 1. CLASSIFY — one target notation` → `## 1. CLASSIFY — one subject
  home`, mirroring kb-build.md's rewritten `### 1. CLASSIFY — one subject home`.
- Catalog entry-point sentence now names `L-000100`, not `100.1`.
- **Removed the stale claim** "The agent mints the next free notation from the
  catalog register — `"110.1"`" (doubly stale: wrong even before this ticket).
  Replaced with a new checkbox carrying the accession story verbatim in spirit
  from kb-build.md: the agent mints a fresh accession `L-000110`; nothing is
  looked up to find "the next free" anything; an accession is opaque and drawn
  from a sequence, so two authors classifying into one domain never contend for
  a number.
- The "spine names the home" line now names the governed subject path
  `product/payments` (`facets.domain`) rather than a domain/division slot.
- Re-captured the `resolve.js` output. The old paste was already stale: it was
  missing the `time check: skipped …` line and the whole `decomposition:` block,
  and (after the setup change mints `ship-frontend`) it also now emits a
  `near-miss: operation ship-frontend …` line.

### 2. CITE — accession-only citation

- `--entry` summary text: `nearest leaf 100.1` → `nearest leaf L-000100`.
- Re-ran `log-entry.js create --log gaps` and pasted real output (hex suffix
  `5dae1d4e`; the "hex suffix varies" convention preserved in the surrounding
  prose and in the header's "Only the random hex suffix in fragment file names
  varies run to run").
- Added a checkbox stating that `consulted.leaves` cites by accession — the only
  spelling that resolves — and that the summary names the same id, mirroring
  kb-build.md's step-2 sentence.
- The `--log gaps` literal and the one-line `unsourced claim is not promotable`
  string (both pinned by `tests/kb-build.test.js`) are preserved intact.
- Dropped the now-inaccurate word "notations" from "carries IDs, notations, and
  paths only" → "carries IDs and paths only".

### 3. DRAFT — leaf rewritten

- File path: `unknown-knowledge/knowledge/product/110.1-icon-grid-alignment-rules.md`
  → `unknown-knowledge/knowledge/L-00/L-000110-icon-grid-alignment-rules.md`,
  with a sentence explaining the shard is a fanout device carrying no meaning.
- Frontmatter: `schema-version: 1` → `2`; **added `id: L-000110`**.
- `notation: "110.1"` **kept**, but re-presented as the optional legacy label —
  a dedicated checkbox now says nothing indexes by it, no citation resolves
  through it, a new leaf need not carry one at all, and it is quoted because
  unquoted it parses as a number. This mirrors kb-build.md's `notation` bullet.
- `see-also: ["100.1"]` → `see-also: [L-000100]`.
- Added a checkbox for `id` as identity: required, what the loader indexes by,
  the only spelling anything may cite the leaf as, and — because it is not
  positional — moving the file out of `L-00/` later breaks no citation.
- The old checkbox "Notation quoted; …" folded into the notes/citations
  checkbox; the cross-reference-honesty checkbox now points at both negative
  probes (dangling accession AND notation form) rather than "a non-existent
  notation".

### 4. INDEX — catalog row

- `- id: "110.1"` → `- id: L-000110` (unquoted, matching the fixture catalog's
  existing `- id: L-000100` style).
- `file:` → `L-00/L-000110-icon-grid-alignment-rules.md`.
- Added a checkbox: the row's `id` is the same accession the leaf's `id` field
  carries; moving the leaf to another shard later is an edit to this `file`
  field and nothing else, because no citation names a directory. Mirrors
  kb-build.md's rewritten INDEX step.

### 5. VALIDATE — all pasted output re-captured

Three negative probes now (was two), all pasted from real runs. Also hoisted the
shared `node "$KIT/engine/validate.js" --root .` command above them, since all
three run it.

### Header / Done

Unchanged apart from the byte-honest claim, which now holds again. The
`agents draft; humans approve` string, the step-order line, and the wall-clock
line are intact.

## Real captured output (all re-run, never hand-edited)

Method: `cp -R fixtures/ts-app "$TMPDIR/a5-kbb"`, applied the documented setup,
wrote the leaf and catalog row, ran each command. Then, as a clean-room check, I
did the whole thing a SECOND time in `$TMPDIR/a5-verify`, this time extracting
the leaf markdown and the catalog YAML **programmatically out of the finished
walkthrough file** and applying the setup heredocs verbatim as documented — so
what is pasted is provably what the documented artifacts produce. `fixtures/ts-app`
itself was never touched (verified via `git diff -- fixtures/`; the only diff
there is the pre-existing `schema-version: 2` stamp from earlier UCS-1147 work).

### `resolve.js "frontend" --root .` (step 1, pre-draft) — exit 0

```
resolve "frontend" -> 1 concept

time check: skipped — pass --today YYYY-MM-DD to enable; diffable output never reads the wall clock (D-012)

decomposition:
  noun  -> concepts: K-104 "Asset kind" (term-match)
  residue (unresolved): frontend  [resolved context: K-104]
  near-miss: operation ship-frontend — token overlap [frontend] below the match threshold

K-104  Asset kind  [active]  score 60 (term-match)
  summary: Payout rails. DRIFT — source also has 'crypto', unclaimed here.
  source-of-truth:
    src/types/asset-kind.ts
```

Note: this must be captured BEFORE the leaf is drafted. Run after drafting, it
additionally emits a `knowledge leaves -> 1` block with `L-000110  110.1  …
[draft — downranked]` — correct behaviour (a draft leaf is downranked), but not
what step 1 shows.

### `log-entry.js create --log gaps` — exit 0

```
{
  "file": "logs/gaps/2026-07-09-5dae1d4e.yaml",
  "status": "open",
  "entry": {
    "schema-version": 1,
    "date": "2026-07-09",
    "status": "open",
    "summary": "kb-build item not promotable: render-precision claim lacks any citation; nearest leaf L-000100, concept K-104",
    "consulted": {
      "concepts": [
        "K-104"
      ],
      "leaves": [
        "L-000100"
      ]
    }
  }
}
```

Hex suffix varies (`5dae1d4e` first run, `10fa009a` on the verify run) —
the documented "hex suffix varies" convention is preserved.

### Probe A — dangling ACCESSION (`see-also: [L-000100, L-000999]`) — exit 2

```
validate: the store loader reported 1 error(s) — structural checks never ran (a check that never ran is a blocking defect, PRD §5)
  unresolved-ref  knowledge/L-00/L-000110-icon-grid-alignment-rules.md  cross-references.see-also[1]  cross-references.see-also ref "L-000999" does not resolve to any knowledge entry or catalog-declared id
```

Changed from the old `"999.9"` probe: a dotted notation now fails with a
*different* finding class (`pattern-mismatch`), so it no longer demonstrates
what this probe is for. `L-000999` is well-formed and carried by no leaf.

### Probe B — NOTATION-form citation refused (ADDED, this ticket's headline) — exit 2

```
validate: the store loader reported 2 error(s) — structural checks never ran (a check that never ran is a blocking defect, PRD §5)
  pattern-mismatch  knowledge/L-00/L-000110-icon-grid-alignment-rules.md  cross-references.see-also[0]  "100.1" is not a valid id here — expected the leaf's accession id (L-NNNNNN); the dotted notation is a legacy display label and no longer resolves as a citation
  unresolved-ref  knowledge/L-00/L-000110-icon-grid-alignment-rules.md  cross-references.see-also[0]  cross-references.see-also ref "100.1" does not resolve to any knowledge entry or catalog-declared id
```

I judged this worth adding: it is the ticket's contract stated by the engine in
its own words, and it is the sharpest possible demonstration because `100.1` is
a notation a leaf in this very store **really does carry** — the citation is
refused not because the label is unknown but because a notation is no longer a
citation at all. Two findings, and the first names the migration explicitly.

### Probe C — `orphan` (catalog row removed) — exit 1

```
structural validate -> 1 finding(s) (1 error(s), 0 warning(s))
checks run: id-range, id-shape, index-drift, malformed-verified, missing-authority, missing-citation, missing-path, missing-registry, missing-verified, orphan, ref-cycle, registry-shape-mismatch, suppressed-value, unminted-segment, unregistered-value

error  orphan  L-000110  knowledge/L-00/L-000110-icon-grid-alignment-rules.md  id
    "L-000110" is not declared in knowledge/_catalog.yaml — unreachable through the store's navigational entry point (§3)
```

As predicted in the task: the subject/path column now reads **`id`**, not
`notation`, and the finding is keyed by the accession `L-000110`. The
`checks run:` line was also badly stale in the old paste (7 checks listed;
the validator now runs 15).

### Final `validate.js --root .` — exit 0

```
structural validate -> 0 findings — structurally clean
checks run: id-range, id-shape, index-drift, malformed-verified, missing-authority, missing-citation, missing-path, missing-registry, missing-verified, orphan, ref-cycle, registry-shape-mismatch, suppressed-value, unminted-segment, unregistered-value
```

## Hard constraints — all verified

- `unsourced claim is not promotable` present on ONE line (no internal wrap). OK
- `--log gaps` literal present. OK
- Engine commands in fenced blocks: **4** (`resolve.js`, `log-entry.js`,
  `validate.js` x2) vs minCommands 3 — none dropped, one added. OK
- `acceptance/README.md` untouched, still contains `A5-kb-build-walkthrough.md`. OK
- No H1 added to the fixture leaf body (`heading` frontmatter is the title). OK
- `fixtures/ts-app` NOT modified — walkthrough run against `$TMPDIR` copies. The
  fixture still has exactly one leaf (`L-000100`), so
  `tests/fixture-ts-store.test.js` and the `FIXTURE.md` line pin are safe. OK
- `docs/agents/**` untouched apart from this report. OK

## Gate results

| Gate | Result |
| --- | --- |
| `npm test` | **PASS** — 849 pass, 0 fail |
| `npm run lint` | **PASS** — checked 192 files, 0 failures |
| `npm run acceptance` | **PASS** — `result: OK — all asserted criteria (A1-A4, A6) pass; A5 manual by design` |

## Notable findings beyond the brief

1. **The walkthrough's setup was under-seeded and had been for a while.** The
   drafted leaf's registry-governed values were never minted, so the documented
   exit-0 could not have been reproduced by anyone following the checklist. Fixed
   by extending Setup. Worth knowing that "byte-honest" had quietly decayed here.
2. **Two pasted outputs were stale independently of this ticket** — the
   `resolve.js` block (missing the time-check and decomposition sections) and the
   `checks run:` list (7 checks vs the current 15). Both re-captured.
3. **Notation citations fail with TWO findings, not one.** `pattern-mismatch`
   fires first and names the migration; `unresolved-ref` follows. Both land at
   loader level, so exit is 2 (checks never ran), not 1.
