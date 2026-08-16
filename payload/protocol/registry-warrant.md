# Registries: warrant-minting and suppression (UCS-1148)

> Paths in this document are client-relative — relative to the vendored kit
> root after init (`schemas/…`, `templates/…`, `engine/…`, `protocol/…`). In
> the kit repo itself these live under `payload/`.

A **registry** is a governed vocabulary file: the closed set of values one
facet of a Store may draw from. Registries live at `<store>/_registries/<name>.yaml`
— underscore-prefixed like `_catalog.yaml` and `_rules.yaml`, and for the same
reason: they are governed store meta, not records.

The knowledge store's four registries:

| Registry | File | Shape | Governs |
|---|---|---|---|
| domains | `knowledge/_registries/domains.yaml` | hierarchical | `facets.domain` — the subject spine |
| operations | `knowledge/_registries/operations.yaml` | flat | `operations[]` — the verbs a leaf lets a reader do |
| jurisdictions | `knowledge/_registries/jurisdictions.yaml` | flat | `applies.jurisdictions[]` — where the claim holds |
| authority tiers | `knowledge/_registries/authority-tiers.yaml` | flat | `citations[].authority` — how far a source can be trusted |

## Why a registry and not a schema enum

Membership could have been a JSON Schema `enum`, and deliberately is not.

An enum is **kit-vendored code**. Under D-001 (seeded once, then owned) a
seeded repo has no update channel, so a vocabulary living in the schema would
be frozen at seed time for the life of that repo — a Store could never name a
subject its own material actually covers. A registry is **client data**: it
sits in the client zone, is reviewed as code like every other Store file, and
grows by steward decision without an engine release.

The engine therefore holds no opinion whatsoever about which values exist. It
enforces exactly one rule — *a governed value must be minted in its registry* —
and the registry alone says what is minted. This is what the acceptance
criterion "the domains top level is open" means concretely: the engine's only
notion of a top-level domain class is "a value with no parent segment", so
adding one is a registry edit plus a Decisions entry, with no schema change and
no engine change. There is no allocation table anywhere, and never a fixed
list of top-level classes to petition for a slot in.

## Literary warrant — the minting rule

> **A value is minted only when material exists to fill it.**

This is *literary warrant*, borrowed from classification practice: a class
earns its place in the scheme because documents exist that belong in it, never
because it seems like a category somebody might one day need. A registry minted
ahead of its material is speculative shelving — it invites authors to file
knowledge under a heading nobody chose deliberately, and the vocabulary drifts
into a taxonomy of guesses.

The `warrant:` field on every registry value is where the material is named,
and it is **required**. If it cannot be filled with something concrete — a leaf,
a document, a body of material that exists *now* — the value is not ready to be
minted.

### Conduct: minting a value

1. **Find the warrant.** Name the material that needs this value. If the answer
   is "we'll need it later", stop: that is the case the rule refuses.
2. **Check for a suppression.** If the value is already listed with
   `status: suppressed`, it was proposed and refused before. Re-minting is
   legitimate but it is a *reversal*: read the suppressing decision first, and
   record why the refusal no longer holds.
3. **Choose the level.** For the hierarchical domains registry, mint every
   segment on the path. A child may not hang off an unminted parent — the
   validator reports the missing segment, not the whole path, because the
   segment is the edit you can actually make.
4. **Draft the Decisions entry** from `templates/decisions/registry-minting.yaml`.
   Every minting is a governed act with a written rationale (§3.3): the entry
   records the warrant, the value, and who decided.
5. **Edit the registry**, citing the decision id in the value's `decision:`
   field. This is required and it is checked: a value citing no decision fails
   the schema, and one citing an id no Decisions entry answers to fails as an
   unresolved ref.
6. **Open one PR** carrying the registry edit, the Decisions entry, and the
   material that supplied the warrant. Agents draft; humans approve.

### Conduct: suppressing a value

A value that is proposed and **rejected** is not deleted — it is recorded with
`status: suppressed` and left in the registry.

Deleting it would lose the decision. The next author to reach for the same term
would find nothing, propose it again, and the vocabulary question would be
re-litigated from scratch with no memory of why it went the way it did. A
suppression makes the refusal durable and visible: the term is on the shelf,
marked refused, with a decision id pointing at the reasoning.

It also changes what an author is told. Using a suppressed value is a
`suppressed-value` finding that says the term was *refused*, not the far less
useful "not in the registry" — which reads like a typo and invites the author
to fix their spelling rather than read the decision.

Suppression follows the same conduct as minting: a Decisions entry, then the
registry edit citing it, in one reviewed PR.

## What the engine checks

Registry membership is a **structural-validator** check (`engine/commands/validate.js`),
not a schema check. The hand-rolled schema subset cannot express "this value
appears in that file", and hierarchical segment membership is not a JSON Schema
shape at all.

| Finding | Means |
|---|---|
| `unregistered-value` | the value is not minted in its registry |
| `unminted-segment` | a hierarchical path whose named segment is not minted |
| `suppressed-value` | the value is listed as refused |
| `missing-registry` | the record cites a governed facet whose registry the store does not carry |
| `registry-shape-mismatch` | the registry's `hierarchical` flag disagrees with the facet it governs |

Every one of them names **both the value and the registry file**, so the finding
points at the edit rather than at the symptom.

The loader refuses a registry file outright — exit 2, before any membership is
judged — when it contradicts itself: a value declared twice, a value declared
both minted *and* suppressed (`duplicate-registry-value`), a declared `registry`
or `store` disagreeing with the file's own path (`registry-name-mismatch`,
`registry-store-mismatch`), or a `decision` naming no Decisions entry
(`unresolved-ref`). None of these can be settled by the engine: picking a winner
by file order would be a governance decision nobody made.

Four engine conducts are worth stating outright, because each is the difference
between a governed vocabulary and a decorative one:

**Every value cites a decision, and the citation is checked.** `decision` is a
*required* field, and it resolves through the same cross-store ref graph as
every other citation — an id naming no Decisions entry is an ordinary
`unresolved-ref` error. "Each minting a Decisions entry" is therefore enforced,
not merely encouraged: a vocabulary change nobody signed cannot reach the store.

**A malformed registry is a hard error, never an empty one.** Unparseable YAML
or a schema defect in a registry file is a loader error that gates every
surface to exit 2. Degrading to "the registry loaded as empty" would fail every
value that *was* minted — a check that never ran, wearing the exit code of a
check that ran and found problems (PRD §5).

**A registry's shape must match the facet it governs.** The `hierarchical` flag
is what turns on segment-by-segment membership, so a domains registry that lost
it would judge a whole path as one opaque string — the segment rule switched
off by an omitted line, at exit 0. The engine therefore declares the shape each
facet requires and refuses a registry that disagrees
(`registry-shape-mismatch`), reported once against the registry file.

**An absent registry surfaces where it can mean something.** A Store that
carries no registries is complete and valid: registries are opt-in governance,
and demanding them of every Store would fail every repo seeded before this
layer existed. Absence therefore surfaces at the point a record actually
*claims* a governed value — a leaf naming `facets.domain` in a Store with no
domains registry is an explicit `missing-registry` finding. That is never a
silent pass: the value went unjudged, and the finding says so in those terms.
The alternative conducts were both worse. Warning at load on every registry-less
Store would train stewards to ignore the warning; hard-erroring at load would
break every existing Store for a feature it never opted into.

## Where registries are not the answer

A registry governs a **facet** — a small, stable, shared vocabulary that
readers navigate by. It is not a place to park free text. If a value would be
minted once and used once, it is content, not vocabulary: it belongs in the
leaf's prose or its `terms`, where nothing has to govern it.
