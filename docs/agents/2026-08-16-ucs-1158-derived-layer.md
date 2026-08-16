# UCS-1158 — Derived layer: plural browse trees, synthesized call numbers, resolution index

> Implementation findings, written by the agent that built the ticket on
> `ucs-1158-derived-layer-plural-browse-trees-synthesized-call-numbers`
> (cut from `faceted-store-v2` @ `38491f4`).

## What shipped

A tenth engine surface, `derive`, and two libraries behind it.

| File | Role |
|---|---|
| `payload/engine/derive.js` | entry shim (UCS-956 pattern — statically imports nothing) |
| `payload/engine/commands/derive.js` | the command: `--check` (default) / `--write` |
| `payload/engine/lib/derived.js` | axes, tree building, index, the recall slot and gate |
| `payload/engine/lib/call-numbers.js` | call-number synthesis and the id-space collision proof |
| `payload/protocol/derived-layer.md` | the shipped protocol doc (in the payload allowlist) |

Artifacts land in `knowledge/derived/`: `tree.domain-form.md`,
`tree.form-domain.md`, `index.json`.

## Design decisions, and why

### The derived directory is `knowledge/derived/`, and the loader skips it by name

Inside the knowledge store rather than at the repo root, because the projection
is of *this* store's leaves — a sibling directory would imply it spans all three.

The load-bearing part is the **skip**. Browse trees are markdown files under
`knowledge/`, exactly like leaves, so neither the underscore convention
(`_registries`, `_phoenix`) nor the extension check distinguishes engine output
from a record. Without an explicit skip, every generated tree would be loaded as
a leaf, fail the leaf schema, and the store's health would depend on a directory
whose entire contract is that deleting it loses nothing.

I added a `skipDirs` option to `listFiles` in `lib/load-stores.js` and declared
`DERIVED_DIR` there — beside the walk that must ignore it — with `lib/derived.js`
re-exporting it. Declaring it in `derived.js` would have made the loader import
the layer it is supposed to be independent of.

This also answers the ticket's open question about whether `validate` should
ignore or verify the derived directory: it **ignores** it completely (not even a
`skipped-file` warning), and `derive --check` is the surface that verifies it.
Keeping verification out of `validate` is what stops derived artifacts becoming
load-bearing — a store must stay valid with the layer deleted, and a test asserts
exactly that.

### Two axes, and plural is a data change

`AXES` in `lib/derived.js` is a table of `{key, label, audience, path}`. Nothing
else in the module names an axis, and the command enumerates the table — so a
third ordering is one row, not a code change. That is what makes "plural" true
rather than "two".

The two shipped axes are not arbitrary. `domain-form` serves stewards (subject
matter first, the way a person holds a library in their head); `form-domain`
serves agents (kind of knowledge first, narrowed by subject). Those are genuinely
different reading orders over one set of facts, and before this ticket the store
could serve only whichever one its notation spine happened to encode.

### The call-number grammar: `SPO/ODD/REF·L-000117`

Three-character uppercase facet abbreviations, slash-joined, then **U+00B7 MIDDLE
DOT**, then the accession.

The separator is the whole defense. No id grammar in the engine accepts a middle
dot — the id spaces are all `[A-Z]-[0-9]` or dotted decimals — so a call number
cannot be mistaken for an id by construction rather than by convention.
`idSpacesMatching()` enumerates `ID_GRAMMARS` itself rather than checking a
remembered list, so **a new id space that accepted middle dots fails the test the
day it is added**, not the first time somebody cites a shelf label.

Three deliberate properties:

1. **The abbreviation is lossy, on purpose.** Two segments can abbreviate to the
   same three letters. Making it collision-free would mean minting and
   remembering it, which is exactly the property that turns a display string back
   into an identity.
2. **The accession travels inside it.** The tempting thing to paste contains the
   correct thing to paste.
3. **It is not stable across projections.** The same leaf reads
   `SPO/ODD/REF·L-000117` in one tree and `REF/SPO/ODD·L-000117` in the other,
   because a call number describes a *position* and a leaf holds one per
   projection. A string that looked stable while changing meaning between trees
   would be worse than one that visibly reorders.

An absent facet abbreviates to `UNC` rather than an empty string: `/REF·L-000117`
would read as a formatting bug rather than as the fact that the leaf declares no
domain.

### Demotion is annotation, never omission

`demotionsFor()` reads the predicates that already own these questions —
`timeVerdict` (UCS-1150) and `isPrePromotionStatus`/`leafStage` (UCS-1149) — and
returns the same `{reason, detail}` shape the resolver publishes. No second
implementation: `time-verdicts.js`'s own header names UCS-1158 as an inheritor,
and this is that inheritance.

Demoted leaves sort **last within their node** and nothing else changes. They are
not refiled, not collapsed, not hidden. Hiding them would make the tree lie by
omission — a steward would read an empty shelf as "we know nothing about this"
when the truth is "what we know has rotted", and those are opposite calls to
action.

Two demotions accumulate rather than one absorbing the other: `L-000171` in the
fixture is both draft and stale and reports `(stage, time)` with both reasons.

Demoted leaves keep accession order *between themselves* rather than sorting by
which demotion fired — ordering by that would invent a precedence between "draft"
and "stale" that nothing in the store declares.

### `--today` injection

Staleness needs `--today`; without it the time verdicts are `skipped` and every
artifact says so in its header (`- time verdicts: skipped — pass --today …`). It
is never a silent pass. Stage demotion needs no date and still applies, which is
visible in the no-`--today` golden.

`--today` naming no real day (`2026-02-30`) is a **usage error, exit 2** — the
same refusal the resolver makes, for the same reason (UCS-957).

### Findings vocabulary for `--check`

Three codes, because each calls for a different edit:

| Code | Means |
|---|---|
| `derived-missing` | the layer was never generated, or was partly deleted |
| `derived-stale` | the store changed since it was generated, or the file was hand-edited |
| `derived-unexpected` | a file no axis generates lives here — regenerating would delete it |

`--check` returning **exit 1** is correct rather than exit 2: the check ran, and
what it found is a real defect whose fix is re-running with `--write`.

`--write` removes the directory whole before writing, deliberately. A merge-write
would leave behind a tree for an axis that no longer exists, still looking
authoritative. Removing first is safe precisely because nothing here is
unregenerable — which is the same property the round-trip test asserts.

### The recall slot and gate

`RECALL_SLOT` declares the architectural position; `gateProposal()` refuses every
proposal by construction. **No recall is implemented, and that is the spec's
instruction, not an omission.**

The three constraints, each load-bearing:

- `location: derived` — recall lives in the disposable layer and nowhere else, so
  deleting `derived/` deletes every probabilistic artifact the system has ever
  computed. An embedding cached in frontmatter would be a guess sitting in the
  same file as cited facts, indistinguishable to every later reader.
- `consulted: after-deterministic-exhausted` — consulting it earlier would let a
  similarity score outrank a declared edge.
- `citable: false`, `persistable: false` — a proposal becomes knowledge only by
  passing a human gate, at which point it is an ordinary authored leaf with
  citations and the probabilistic step is history rather than provenance.

`gateProposal()` always refusing may read as a placeholder. It is not: it is what
makes "nothing probabilistic persists without a gate" checkable by a test rather
than promised by a comment, and it is what a future recall implementation must
route through to be reviewable at all.

`tests/derived-recall-gate.test.js` holds the protocol doc to the code — every
constraint the prose states is re-derived from `RECALL_SLOT` — and asserts
against source (comments stripped) that no similarity, vector, or network code
ships in these files. Comments are stripped first because the *position* of
embedding recall is documented at length in them; the ban is on code, not prose.

## Acceptance criteria — where each is proven

| # | Criterion | Where |
|---|---|---|
| 1 | Two axes from one flat store, stable-sorted, no timestamps | `derived-layer.test.js`: 'plural axes', the full-artifact golden, and the reordered-twin test |
| 2 | Call numbers are display strings; no citation-legal surface accepts one | `derived-call-numbers.test.js` (all three tests) + the planted fixture |
| 3 | Delete and regenerate is byte-identical | `derived-layer.test.js`: 'deleting the derived layer and regenerating…' |
| 4 | Stale/draft leaves visibly demoted, annotated never hidden | `derived-layer.test.js`: 'stale and draft…', 'demoted leaves sort last…', 'without --today…' |
| 5 | Recall gated, documented, structurally present, unimplemented | `derived-recall-gate.test.js` (6 tests) + `protocol/derived-layer.md` |

### Criterion 2's fixture

`tests/fixtures/derived/call-number-citation/` is the base store with one planted
defect: `L-000117`'s `relates.see-also` cites `"SPO/ODD/CON·L-000133"` — a call
number where an accession belongs.

The accession-only `leaf-ref` grammar from UCS-1147 already refuses it, with
**two independent errors**: `pattern-mismatch` (the shape is not an accession)
and `unresolved-ref` (nothing is indexed under that string). Either alone would
suffice; the pair means a future change would have to defeat both to make a call
number citable by accident.

This fixture required an entry in `tests/citation-migration.test.js`'s `EXEMPT`
map — that sweep tests values for "is not an accession", and a call number
answers that the same way a notation does. The exemption reason states clearly
that this is **not** a retired spelling kept alive but a shape that was never
citable, planted so the refusal has a specimen rather than an inference.

### Criterion 1's determinism twin

`tests/fixtures/derived/store-reordered/` holds the same six leaves with the
catalog rows reversed **and every leaf file renamed** so the loader's directory
walk hands them over in a different sequence. Both trees generate byte-identical
to the base store's. The index agrees too once `file` values — which name real
paths and are content rather than order — are set aside.

## Pinned lists updated

- `README.md` — "Nine" → "Ten" command-line surfaces, plus the `derive.js` row.
- `CONTEXT.md` — the Engine term now names the derived layer; three new glossary
  entries (**Derived layer**, **Browse tree**, **Call number**).
- `tests/context-glossary.test.js` — `derive: 'derived layer'` in the prose map.
- `tests/readme.test.js` — the number-word map now reaches ten (and eleven).
- `tests/exit-code-contract.test.js` — `derive.js` added to `EMITS_FINDINGS`. It
  needs no `ARGV` entry: it reaches `main` with no arguments.
- `tests/citation-migration.test.js` — the `EXEMPT` entry described above.
- `cli/kit.manifest.yaml` — `protocol/derived-layer.md` (the engine directory
  copies wholesale, so `derive.js` shipped without a manifest edit; the protocol
  allowlist is explicit and needed one). Verified by running `cli/init-copy.js`
  into a scratch target.
- `CHANGELOG.md` — an Unreleased/Added block.

## Things a reviewer might reasonably question

- **`derive --check` is not wired into the acceptance harness.** Neither is
  `phoenix` (UCS-1154) nor `registry-warrant`, so this follows precedent rather
  than skipping a step. The surface is covered by 25 tests across three files.
- **The kit does not decide commit-vs-gitignore for `knowledge/derived/`.** The
  kit has no mechanism for managing a client `.gitignore`, and the tradeoff is
  genuinely local, so `protocol/derived-layer.md` documents both choices and
  recommends running `derive --check` in CI if the layer is committed.
- **A `UNC/UNC·L-000228` call number is ugly, and that is intended.** An
  unfaceted leaf files under `unclassified/unclassified/` where a steward sees
  it, rather than flattening up a level and looking correctly classified. Pinned
  by a test, since a v1-shaped store is entirely in this state mid-migration.

## Gates

`npm test` 958 pass / 0 fail · `npm run lint` 204 files, 0 failures ·
`npm run acceptance` OK (A1–A4, A6; A5 manual by design).
