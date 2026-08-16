# UCS-1147 — Contract: accession ID is identity; notation demoted to optional legacy

Branch `ucs-1147-contract-notation-demoted-to-optional-legacy-field-accession`,
cut from `faceted-store-v2` @ 8e42745. The contract phase of the expand–migrate–contract
identity inversion: UCS-1144 expanded (both citation forms legal), UCS-1145 and
UCS-1146 migrated the data, and this ticket retires the dual-shape contract.

## The four design decisions

### 1. Schema-version is a stamp, not a gate

The ticket asked what "store schema-version bumped" means mechanically. The
deciding context is what the engine does with the value, and the answer is:
**nothing**. Every schema declares `schema-version: { type: integer, minimum: 1 }`
and no surface anywhere compares it against a particular number. There is no
version dispatch, no per-version code path, no refusal.

So the bump is: **v2-shape leaves stamp `schema-version: 2`, and `minimum: 1`
stays.** All 59 knowledge leaf fixtures were restamped; catalogs, rules,
registries, decisions, ontology and log files were not, because their record
shape did not change.

The rejected alternative was adding a version GATE — refusing `schema-version: 1`
leaves. Three reasons not to:

- It invents a mechanism this kit has never had, on a ticket whose warrant is a
  field contract rather than a loader feature.
- Under D-001 seeded repos never upgrade, so a v1 repo would be refused by a
  kit it can never move off. The gate would punish exactly the population that
  cannot act on it.
- It would refuse a leaf on its version number rather than on its actual defect.
  A v1 leaf missing an accession already fails, with a finding that names the
  accession and the migration. That is the honest error; "schema-version must be
  2" is a proxy for it that tells the author less.

Verified: restamping a v2 leaf back to `schema-version: 1` still exits 0 — the
accession requirement is what enforces the shape, which is the point.

The D-021 MAJOR trigger is satisfied regardless: D-021 defines MAJOR as "a store
schema-version bump", and the store's records now carry 2.

### 2. `leaf-ref` narrows but stays a named entry

UCS-1144 predicted "`leaf-ref` narrows to accessions alone and the knowledge
entries drop out of `SPACE_ALIASES`/`CATALOG_ID_SPACE`; consumers follow
automatically since they read those tables." **The prediction held**, with one
deliberate departure.

Held exactly: `SPACE_ALIASES` had one row (`leaves`), so narrowing emptied the
table and it was deleted with `aliasOwner()` and `indexAlias()`. Ref resolution,
`checkOrphans` and `checkCatalogs` each lost an alias pass and needed no other
edit. `preflight --leaves` narrowed with zero changes to preflight, because it
resolves through `leafIdentityOf`.

The departure: `CATALOG_ID_SPACE.knowledge` stays `'leaf-ref'` rather than
dropping out. A catalog row is still a POINTER rather than a mint — it is the
store's own citation of its leaves — so it should be judged by the citation
grammar and carry the citation grammar's hint, the one naming the migration.
Dropping the row would have judged catalog rows by the `knowledge` (notation!)
grammar, which is backwards.

For the same reason `leaf-ref` remains a named grammar aliasing `accessions`
rather than collapsing into it: `accessions` says what a leaf MINTS, `leaf-ref`
says what a record may CITE. They coincide today. Keeping them separate is what
let the expand phase widen citations without ever widening leaf notation, and
their hints still differ because the two findings say different things.

`union()`/`body()` were DELETED — with a single-member `leaf-ref` nothing
composes, and leaving a composition helper with no composition is dead
machinery.

### 3. Published `notation` stays, as a non-identity informational field

The criterion says notation must appear nowhere **as identity**. The reading
taken: `id` is always the accession (never null now), `notation` remains a
published nullable informational field.

Removing it would break consumers reading a documented field, to no benefit —
the criterion is about what carries identity, not about which fields exist.
UCS-1144 had already done the hard part by separating the two meanings, so
`notation` never silently changed meaning; it simply stopped being an identity
anything resolves through. Verified across golden outputs: every published
`notation` sits beside its leaf's `id`, and `model.leaves` is keyed by accession
alone.

### 4. Prefix sharding: first two digits, and position means nothing

`knowledge/<L-NN>/<accession>-<slug>.md`, the prefix being `L-` plus the first
two digits of the accession's numeric part (`L-000101` → `knowledge/L-00/`).

The loader already walked `knowledge/` recursively, so sharding needed no engine
change — which is itself the evidence for the claim: nothing reads the path.
The new fixture `tests/fixtures/structural-validator/sharded/` has leaves citing
each other ACROSS shards, so no citation could be written differently if they
shared one.

**The move test, stated honestly.** Moving a leaf between shard directories and
updating only that catalog row's `file:` produces zero diagnostics, and resolve
output is byte-identical **except the `file` field**, which legitimately tracks
where the file now is. Every id, notation, heading, citation and diagnostic is
unchanged. The pinned assertion says exactly that rather than claiming a
byte-identity that is not true — a golden that overclaimed would be a golden
nobody could trust.

## One engine change beyond the table edits

The acceptance criterion requires a notation-form citation to fail "with a
finding whose hint names the accession migration". It did not: the schema's
`pattern-mismatch` read `"700.2" does not match ^L-[0-9]{6}$` — a regex, with no
remedy and no mention of the migration.

`bindIdGrammars` already injected each grammar's `pattern` into the schema
`$defs` from the one module that owns them. It now injects the `hint` alongside,
and two messages quote it:

- `pattern-mismatch` on an id-space value — the hint REPLACES the regex, since
  it says everything the pattern says and says it to a human.
- `missing-required` on a property whose grammar carries a hint — reached
  through `requiredHint()`, because a missing property has no value to test and
  so could never reach the pattern branch, yet `required property "id" is missing`
  is precisely what a leaf without an accession produces.

Patterns declared in the schema files themselves carry no hint and still quote
the regex: there is nothing better to say about them, and inventing per-pattern
prose here would be the drift `id-grammars.js` exists to prevent.

Both hints now name the migration:

```
missing-required  …  id  required property "id" is missing — expected an accession id
  of the form L-NNNNNN — every leaf mints one as its identity (UCS-1147)

pattern-mismatch  …  cross-references.see-also[0]  "700.1" is not a valid id here —
  expected the leaf's accession id (L-NNNNNN); the dotted notation is a legacy
  display label and no longer resolves as a citation
```

## Retired dual-shape contracts

Every pin that existed SOLELY to demonstrate that both citation forms were legal.

Deleted outright (2): the `leaf-ref` union-composition test; the union-anchoring
test guarding the deleted `union()`/`body()` helpers.

Deleted and replaced by an inverted pin (3): "a leaf with no accession is indexed
by notation exactly as before"; "a notation-only store resolves identically apart
from the added field"; the migration-state half of "minting grammars stay strict".

Rewritten in place (6): "cross-references, relates-to and catalog rows accept
either id shape"; the notation half of "a notation collision is caught whichever
leaf loads first"; typed-edges "neighbors resolve under either legal citation
spelling"; frontmatter-v2 "`--leaves` names a leaf by EITHER spelling";
"log-fragment leaf refs accept either shape"; the notation-only leaf in
id-grammars' schema-copy test.

Engine machinery removed: `model.leafAliases`, `SPACE_ALIASES`, `aliasOwner()`,
`indexAlias()`, `union()`, `body()`, the `keys` half of `leafIdentity()`'s return,
the alias passes in `resolveRefs`/`checkOrphans`/`checkCatalogs`, and
`LEAF_ID_FIELD`'s import into validate.js.

The `citation-migration.test.js` exemption allowlist shrank **13 → 1**. Its own
exemption-verifier forced this: it requires every exempt entry to really cite by
notation, so each migrated fixture made its own exemption fail. Only
`structural-validator/bad-accession/knowledge/_catalog.yaml` survives — its
`id: L-42` is malformed under any contract and appears there only because
`isNotationForm` recognises "not an accession". Its reason was reworded to drop
the dual-shape rationale.

## Fixture migrations

Accessions minted for the five leaves that had none: `loader/healthy` 362.1 →
L-000362, 362.2 → L-000363; `loader/unresolved-ref` 362.1 → L-000362;
`resolver/store` 410.1 → L-000410, 410.2 → L-000411.

Deliberate dangling refs respelled to dangling ACCESSIONS so the fixtures keep
proving what they exist to prove: `unresolved-ref` "999.9" → L-000999;
`unresolved-leaf-ref` "700.9" → L-000997 and "700.8" → L-000996.

`structural-validator/accessioned` now cites its sibling by accession, and its
leaf body — which is a resolver golden — was rewritten from "Cites its sibling by
NOTATION … the mixed state every store passes through mid-migration" to the clean
accession-cited state. `typed-edges` 501.2's `relates.depends-on` migrated to
L-000503. `bad-accession`'s `id: L-42` plant was left alone: it pins id-shape.

## Docs

`kb-build.md`'s notation lifecycle inverted honestly: CLASSIFY is now "one
subject home" (classification is a `facets.domain` value, not a slot — nothing
has to be looked up to find "the next free" anything, so two authors classifying
into one domain never contend for a number); `id` is required identity, `notation`
is the optional legacy label; INDEX documents prefix sharding and that a move is
an edit to `file` alone. The A5 walkthrough was re-synced and its pasted engine
output RE-CAPTURED by actually running the commands against a temp copy of
fixtures/ts-app, twice, the second time extracting the leaf and catalog rows
programmatically from the finished document so what is pasted is provably what
the documented artifacts produce.

That re-capture found a pre-existing defect: the walkthrough's drafted leaf used
four facet values the fixture's registries never minted, so the documented exit 0
was not reproducible by anyone following it — 4 blocking findings. Setup steps
minting those values were added. Its `checks run:` line was also stale (7 listed;
the validator runs 15).

Also updated: `AGENTS.md` (reference-by-id and the class-elsewhere redirect now
name the accession), the knowledge `_rules.yaml` / `_catalog.yaml` templates, and
the knowledge-leaf schema's descriptions.

## Gates

- `npm test` — 849 pass, 0 fail (baseline 845)
- `npm run lint` — 192 files, 0 failures
- `npm run acceptance` — OK, all asserted criteria (A1–A4, A6) pass

## Follow-on worth flagging

`unresolved-ref` still reports a notation-form citation with the generic "does
not resolve to any knowledge entry or catalog-declared id". It arrives alongside
the `pattern-mismatch` that DOES name the migration, so no author sees only the
generic message — but if the loader's ref resolution ever wanted to speak for
itself, that is where the hint would go.
