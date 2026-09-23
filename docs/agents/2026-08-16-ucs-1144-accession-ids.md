# UCS-1144 — Expand: accession IDs (L-NNNNNN) minted, indexed, and validated

Implementation notes for the expand phase of the identity inversion.
Branch `ucs-1144-expand-accession-ids-l-nnnnnn-minted-indexed-and-validated`,
cut from `faceted-store-v2`.

## What the ticket asked for

Leaves may carry an opaque accession id (`L-NNNNNN`), minted at PR time, never
reused, never positional. The loader indexes by it when present, a collision is
a hard error, the structural validator checks shape/uniqueness/catalog
agreement, and the resolver publishes it. Crucially **both citation forms stay
legal**, so every existing store and fixture keeps resolving while the migrate
batches proceed.

## The four design decisions

### 1. Identity vs. alias are two indexes, not one widened index

`model.leaves` stays keyed by **identity alone** — the accession when the leaf
mints one, the notation otherwise — so it holds exactly one entry per leaf, as
it did before. The alternate spelling (the notation of an accessioned leaf)
goes into a separate `model.leafAliases` (spelling → identity), reached only
through the `SPACE_ALIASES` table and consulted only by ref resolution.

The rejected alternative was indexing both spellings into `model.leaves`. It is
a smaller diff and it is wrong: every consumer that *enumerates* leaves
(`checkOrphans`, `checkCitations`, the resolver's `knowledgeEntryPoints`) would
see an accessioned leaf twice, producing two orphan findings and two resolver
results for one leaf. Identity is a property of the leaf; an alias is a
property of the citation, and conflating them turns "answers to two names" into
"is two records".

### 2. Minting grammars stay strict; a separate union governs citation

`$defs/notation` used to serve both the leaf's own id and every reference to a
leaf. Those had to diverge, so the schemas now carry:

- `$defs/notation` — dotted only, what a leaf **mints** into its `notation`
- `$defs/accession` — `^L-[0-9]{6}$`, what a leaf **mints** into its `id`
- `$defs/leafRef` — the union, what any record may **cite** a leaf as

Had citation widening also widened the minting field, a leaf could carry
`notation: L-000101` and hold two identities at once. In `id-grammars.js` the
`leaf-ref` union is **composed** from its members via `union()` rather than
restating their patterns — a union that restated them would reintroduce, one
level up, exactly the drift that module exists to prevent.

Mint width is fixed at six digits deliberately: an accession carries no
structure to grow into, so `L-000001` and `L-1` would be two spellings of one
identity, and "never reused" cannot survive two spellings.

### 3. Catalog rows are pointers, so they take the citation grammar

A catalog row names a leaf; it does not mint one. Knowledge rows are therefore
judged by `leaf-ref` via the `CATALOG_ID_SPACE` table, so a row may name its
target by either shape. Agreement (`index-drift`) and reachability (`orphan`)
both accept either spelling, since the catalog is the store's own citation of
its leaves. Declared as a table entry rather than an `if (store === 'knowledge')`
so it simply disappears when notation retires.

### 4. The resolver publishes `id` first, explicitly null when unminted

`knowledgeEntryPoints` emits `{id, notation, heading, file}`. `id` is the
accession, **explicitly `null`** rather than omitted, and positioned first.
Omission would make the key set vary leaf by leaf, so a store mid-migration
would emit two result shapes and consumers would need a presence check to tell
"no accession" from "old engine". A stable key whose value is null says the one
true thing: this leaf has no accession yet. Fixed position keeps the JSON
byte-stable.

`notation` keeps meaning the **notation**, not the identity. Once a leaf mints
an accession those stop being the same string, and a published field that
silently changed meaning would break every consumer reading it as a tree
position.

## Two bugs found and fixed during implementation

Both are collision-detection defects that would have shipped as silent passes.

### Order-dependent collision (found by self-review)

`indexRecord` checked only `ctx.leaves`, never the alias index. Two leaves
claiming notation `700.1` — one as its identity, one as an accessioned leaf's
alias — were caught or silently accepted **depending on readdir order**. A
duplicate that depends on file ordering is not a hard error at all. Fixed by
adding `aliasOwner()`, consulted by both indexing paths, so "is this id taken?"
has one answer. Pinned by a test that runs all three orderings.

### Misattributed alias after a lost collision (found by code review)

`indexRecord`'s result was not checked, so a leaf that **lost** an identity
collision still had its aliases registered — against the winner's identity. In
the `duplicate-accession` fixture this filed notation `700.2` under `L-000101`,
a leaf in a different file that does not own that notation. A notation-form
citation of `700.2` would then have resolved, silently, to the wrong content.
Not resolving is recoverable; resolving to the wrong leaf is not.

Fixed by having `indexRecord` return whether the record took the id, and gating
alias indexing on it. Pinned by asserting the losing leaf contributes no alias.

## Files changed

| File | Why |
| --- | --- |
| `payload/engine/lib/id-grammars.js` | `accessions` space + composed `leaf-ref` union; `SCHEMA_DEFS` gains the two new defs |
| `payload/engine/lib/load-stores.js` | `leafIdentity()`, `LEAF_ACCESSION_FIELD`, `leafAliases` index, `aliasOwner()`, `SPACE_ALIASES`, dual-shape ref resolution |
| `payload/engine/commands/validate.js` | `CATALOG_ID_SPACE`; alias-aware index-drift and orphan checks; orphan finding path names the field identity came from |
| `payload/engine/commands/resolve.js` | entry points publish the accession |
| `payload/schemas/knowledge-leaf.schema.json` | optional `id`; `$defs/accession` and `$defs/leafRef`; cross-references take `leafRef` |
| `payload/schemas/{decision-entry,finding,gap}.schema.json` | `leaves` arrays take `leafRef` |
| `tests/accession-ids.test.js` | 15 tests covering all five acceptance criteria plus both regressions |
| `tests/id-grammars.test.js` | the unknown-space probe named `accessions`, now a real space |
| `tests/resolve.test.js` | golden updated with the added `id: null` — the AC4 diff |

New fixtures: `structural-validator/accessioned` (clean mixed-shape store),
`structural-validator/bad-accession` (malformed id), `loader/duplicate-accession`
(collision), `loader/unresolved-leaf-ref` (dangling refs of both shapes).

## Results

625 tests pass (610 baseline + 15), lint clean over 176 files, acceptance
A1–A4/A6 pass. Notation-only stores are unchanged apart from the added
resolver field.

## Follow-on

UCS-1147 demotes `notation` to optional. At that point `leaf-ref` narrows to
`accessions` alone and `SPACE_ALIASES`/`CATALOG_ID_SPACE` lose their knowledge
entries; every consumer follows automatically, because they all read those
tables rather than spelling the rule themselves.
