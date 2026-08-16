# UCS-1151 — Typed edges: concepts, paths, relates

Structural neighborhood without term luck. Leaves gain three typed edge
families; the resolver expands one hop over `relates` from any hit, and reverse
lookup from repo paths joins over both leaf paths and concept source-of-truth
pointers.

Branch: `ucs-1151-typed-edges-concepts-paths-relates-one-hop-expansion-and`
(base `faceted-store-v2`).

## Files changed, by concern

**Declaration (the ref-graph seam)**
- `payload/engine/lib/load-stores.js` — five new rows in `REF_FIELDS`
  (`concepts` → concepts space; `relates.depends-on` / `.see-also` /
  `.contradicts` / `.supersedes` → leaves space). New exports
  `RELATES_FIELD`, `RELATES_KINDS` (derived FROM the table, never restated),
  `LEAF_PATHS_FIELD`, `leafConcepts`. New `buildLeavesByConcept` and the
  `model.leavesByConcept` published field.
- `payload/schemas/knowledge-leaf.schema.json` — `concepts`, `paths`,
  `relates` properties plus a `conceptRef` `$def` matching the convention the
  other schemas already use.

**Path existence (the validator seam)**
- `payload/engine/commands/validate.js` — `checkLeafPaths`, reusing the
  existing `missing-path` code; wired into `runChecks`.

**Resolution (the resolver seam)**
- `payload/engine/commands/resolve.js` — `relatesNeighborhood` (one hop,
  outgoing, kind-keyed), `publishLeaf` (extracted so all three call sites emit
  one leaf shape), structural concept join in `knowledgeEntryPoints`,
  `leafPathIndex` + `governingLeaves` for reverse lookup, and human-surface
  rendering for both modes.

**Fixtures and tests**
- `tests/fixtures/structural-validator/typed-edges/` — clean store: a
  three-leaf `depends-on` chain (L-000501 → L-000502 → L-000503) proving
  depth-1, a concept (K-201) reachable ONLY structurally, a concept (K-202)
  reachable both ways, and leaves attached to paths directly and via concept.
- `.../typed-edges-findings/` — dangling `concepts` and `relates` targets.
- `.../typed-edges-missing-path/` — a dangling `paths` entry.
- `tests/typed-edges.test.js` — 17 tests, one section per acceptance criterion.
- `tests/resolve.test.js`, `tests/accession-ids.test.js` — existing goldens
  extended for the two new published fields.

**Docs**
- `payload/protocol/skills/kb-build.md`, `CHANGELOG.md`.

## Design decisions

**`relates` target shape: the leaf-ref union (accession OR notation).** The
citation contract that narrows leaf citations to accessions alone is UCS-1147,
which has not landed, and the migrate tickets (1145/1146) have not run. Every
other leaf-targeting ref in the store accepts both spellings today
(`cross-references.*`, catalog rows, `relates-to.leaves`). Narrowing `relates`
early would have made it the one edge family that rejects the spelling the rest
of the store still uses. When notation retires, `leafRef` narrows in
`id-grammars.js` and this follows automatically.

**`paths` validation: `missing-path`, not `unresolved-ref`.** The ticket says
an unresolvable target in any family should surface at the validator seam, and
it does — but through the honest mechanism per family. The ref graph resolves
IDS: its only question is whether a string is minted in some store's id space.
A repo path is not an id; it names the working tree, a different truth anchor
(§3.1) checked by a different means (the filesystem). Declaring `paths` as a
ref row would have asked whether `src/api/handler.ts` resolves to a knowledge
entry, which it never could, so every leaf carrying a path would fail for the
wrong reason. `missing-path` already means exactly this defect, so reusing it
keeps one finding class for one defect class.

Consequence worth knowing: the two ID-space families and the path family need
SEPARATE fixtures, because an error-severity loader diagnostic gates the
validator to exit 2 before structural checks run. A store carrying all three
defects reports only the two loader ones, and the `missing-path` finding would
be real and invisible.

**Neighborhood shape: a map keyed by edge kind.** Not a flat list with a `kind`
field — the kinds are not interchangeable, and a flat list invites reading the
kind as incidental. Every declared kind is present as a key even when empty, so
consumers read one result shape (the same contract `id`/`stage`/`provenance`
already follow). Each neighbor is `{id, notation, heading, file}`: enough to
decide whether to follow it and to actually go. Human output omits empty kinds
— the opposite of the JSON contract, deliberately, since four "(none)" lines
per leaf bury the real hits.

**Outgoing edges only.** The ticket says the resolver expands over relates
edges FROM a hit. Outgoing is what this leaf's author asserted; an incoming
edge is somebody else's claim about the leaf, which is useful but a different
question, and belongs to a "what cites this" surface where it can be labeled
as such rather than blended into the leaf's own assertions.

**Exactly one hop, as a boundary rather than a first increment.** The hop
exists to show what sits immediately around a hit so an agent can decide what
to read next. Depth 2 is most of the store, arriving unranked and unexplained.
Following IS the second hop, and that is the caller's call.

**`via` on every published leaf.** Two joins reach a leaf and they are not
equally reliable: `declared` (structural, survives a concept rename) versus
`terms` (two authors' vocabularies happening to agree); `direct` (the leaf
names your path) versus `concept` (the path is under a concept it declares).
The structural/direct claim wins a tie. Publishing which one fired is what
keeps a reader from assuming the stronger.

**`publishLeaf` extracted.** A leaf now reaches the caller three ways. Three
call sites spelling the object out would be three chances for the stable-key-
may-be-null fields to be published one way in one mode and another in the next.

## Gates

- `npm test` — 713 pass, 0 fail (baseline 696 + 17 new).
- `npm run lint` — 179 files, 0 failures.
- `npm run acceptance` — OK, all asserted criteria (A1–A4, A6) pass.
