# UCS-1148 — Registries: warrant-governed vocabulary files with membership validation

> Implementation report. Branch `ucs-1148-registries-warrant-governed-vocabulary-files-with-membership`,
> commit `b0420f3`, PR [#53](https://github.com/doterodesign/unknown-knowledge/pull/53) → base `faceted-store-v2`.
> Gates: `npm test` 654 pass / 0 fail (baseline 628), `npm run lint` clean (177 files),
> `npm run acceptance` OK.

## What landed

The governed vocabularies every v2 facet draws from — hierarchical domains,
operations, jurisdictions, and citation authority tiers — as a **declared file
class**, not a fourth bespoke code path in the loader.

## Files changed

### Engine

| File | Change |
|---|---|
| `payload/engine/lib/load-stores.js` | `STORE_DESCRIPTORS` (store shape as data) + `REGISTRY_DIR`/`STORES` exports; `loadRegistryFiles`; `registries` map on the model; `registry-name-mismatch` diagnostic; `listFiles` gained a `skipUnderscore` option; `loadEntriesFiles` now takes the descriptor instead of four positional arguments |
| `payload/engine/commands/validate.js` | `FACET_REGISTRIES` declaration map; `judgeValue` (the membership rule); `checkRegistryMembership` (generic walker); four new codes in `CHECKS` |
| `payload/engine/lib/validate-record.js` | registered the `registry` record kind (one line) |

### Schemas

| File | Change |
|---|---|
| `payload/schemas/registry.schema.json` | **new** — governs registry files. `warrant` is required |
| `payload/schemas/knowledge-leaf.schema.json` | additive: optional `facets.domain`, `operations[]`, `applies.jurisdictions[]`, `citations[].authority` |

### Payload (client-facing)

| File | Change |
|---|---|
| `payload/protocol/registry-warrant.md` | **new** — minting and suppression conduct |
| `payload/templates/knowledge/_registries/{domains,operations,jurisdictions,authority-tiers}.yaml` | **new** — four empty seeds |
| `payload/templates/decisions/registry-minting.yaml` | **new** — Decisions-entry template |
| `cli/kit.manifest.yaml` | allowlist entries for all six of the above |

### Tests and fixtures

`tests/registries.test.js` (**new**, 26 tests) plus five fixture scenarios under
`tests/fixtures/structural-validator/`: `registries-clean` (exit 0),
`registries-findings` (exit 1, six planted findings), `registries-malformed`
(exit 2), `registries-absent` (exit 1, `missing-registry`),
`registries-open-top-level` (exit 0). Two existing pins updated for the widened
`CHECKS` and `KINDS` lists (`tests/validate.test.js`,
`tests/validate-record.test.js`). No existing scenario was mutated.

## Design choices

**Placement — `<store>/_registries/<name>.yaml`.** Underscore-prefixed like
`_catalog.yaml`/`_rules.yaml`, for the same reason: governed store *meta*, not a
record. `listFiles` already skipped `_`-prefixed entries, so the record walks
cannot see registries — the naming grammar does the separating, with no
exception list to keep in sync.

**Descriptor shape.** `{ dir, records: { subdir, kind, space, extension, recursive } | null, rules, registries }`.
This absorbed the `store !== 'decisions'` ternary at the call site and both
hardwired `loadEntriesFiles` argument lists. Knowledge keeps `records: null`
because leaves are front matter plus a body — a parse shape, not a walk shape —
while the descriptor still owns everything about the store that *is* data.

**Absent-registry conduct (the load-bearing choice).** Absence is **not**
diagnosed at load. A store carrying no registries is complete and valid, which
describes the entire installed base and every pre-existing fixture; demanding
registries unconditionally would fail them all for a layer they never opted
into, and a load-time warning on every registry-less store would train stewards
to ignore it. Absence surfaces instead at the point a record *claims* a governed
value — `missing-registry`, naming the value and the registry and saying the
membership went unjudged. Never a silent pass, never a demand on a store that
governs nothing. Pinned both ways: `registries-absent` fixture, and a test that
the pre-existing `clean` fixture stays at exit 0.

**Malformed is exit-2, never empty.** Degrading to "loaded as empty" would fail
every value that *was* minted — a check that never ran wearing the exit code of
a check that ran (PRD §5).

**Field→registry map.** `FACET_REGISTRIES` in `validate.js`, in the spirit of
the loader's `REF_FIELDS`: a governed facet is a row
(`{ within?, field, each?, registry }`) and the checker is generic over the
table. `within` lets a field nested in a repeated sub-record (`citations[]`) be
declared once rather than per index.

**Finding codes.** `unregistered-value`, `unminted-segment` (names the missing
*segment*, not the whole path — the segment is the edit an author can make),
`suppressed-value` (a refused term must not read as a typo), `missing-registry`.
All four name the value **and** the registry file a steward opens.

**Suppression, not deletion.** A rejected value stays listed with
`status: suppressed`. Deleting it loses the decision, and the next author
re-litigates the question with no memory of how it went.

**Why not a schema enum.** Under D-001 (seeded once, no update channel) an enum
freezes the vocabulary at seed time for the life of a repo. A registry is client
data, reviewed as code, growing by steward decision without an engine release.
Pinned by a test asserting the engine and schema files contain none of the
fixtures' own domain values — if a top-level class needed an allocation
anywhere in the kit, that test could not pass.

**Template placeholders.** `registry-minting.yaml` carries deliberately invalid
`id`/`date` placeholders so pasting it unedited fails validation — the same
conduct as the audit's `K-XXX` drafts. A test pins both the failure and that
filling those two fields yields a valid entry.

## Scope line vs UCS-1149

**In scope here:** the registry file class, descriptor-driven loading, the
membership machinery, the hierarchical-domain rule, conduct docs, templates.

**Left to UCS-1149:** stage/draft semantics, provenance, `description`
retirement, resolver behavior changes, and the rest of the v2 record shape
(`relates`, `concepts`, `paths`, `form`/`anchor`, `verified`/`volatility`). The
four facet fields added to the leaf schema are the minimum surface needed to
demonstrate membership on leaves; 1149 extends `FACET_REGISTRIES` by
declaration rather than by a second code path.

## Deliberately not done

`kit-root.js` keeps its own `STORE_DIRS = ['ontology','knowledge','decisions','logs']`.
It includes `logs` (not a loaded store) and answers a different question —
kit-zone identification, not file-class loading. Importing `STORE_DESCRIPTORS`
there would couple two unrelated concerns for no gain and is outside this
ticket's registry layer.

## Verified end to end

A fresh `init` seeds all four registries, the conduct doc, and the minting
template into a client repo, and the seeded store validates clean at exit 0.

---

# Review follow-up (commit `f18a9d9`)

**Provenance note.** CodeRabbit never reviewed PR #53 — it skipped, because auto
reviews are disabled on base branches other than the default and this PR targets
`faceted-store-v2`. The API confirms zero reviews and zero review comments. The
13 findings handed to me did not come from a CodeRabbit run on this PR, so I
treated each as an untrusted claim and reproduced it against the code first.
Most were real.

## Four silent passes closed

| Fix | What was wrong |
|---|---|
| `registry-shape-mismatch` | Deleting `hierarchical: true` from the domains registry made the validator judge whole paths as opaque strings and **exit 0** — the segment rule, an acceptance criterion, disabled by an omitted line with nothing reported. Each `FACET_REGISTRIES` row now declares its required shape; disagreement is refused once, against the registry file |
| `duplicate-registry-value` | A value declared twice landed silently. A value declared both minted *and* suppressed landed in **both** sets, and `judgeValue` tests suppression first — so a minted value read as refused, the engine settling a governance contradiction by evaluation order |
| `decision` required + resolved | "Each minting a Decisions entry" was prose only. Now required per value, resolving through the **existing** cross-store ref graph (registries load in pass 1, `resolveRefs` runs after decision entries), so a dangling id is an ordinary `unresolved-ref` — no bespoke machinery |
| `registry-store-mismatch` | A registry declaring the wrong `store` was believed, indexing it under a key its own path contradicts |

Plus: `warrant` gained `"pattern": "\\S"` (a blank warrant validated clean
before); the conduct doc's validator path corrected to
`engine/commands/validate.js`; and two `registries-findings` warrants that cited
leaves contradicting their own planted values made honest.

## Declined

The MD041 heading findings on fixture leaves. No markdownlint in any gate; a
leaf's title is its frontmatter `heading`, and a body H1 would duplicate it.

## Note on my own test

`the open top level needs NO schema and NO engine change` began failing because
`widgets` appeared in a new doc comment as an example. I removed the example
rather than weaken the guard — a test I have to reason around is weaker than one
I keep literally true.

## Gates after follow-up

`npm test` **661 pass / 0 fail** (was 654; 7 new tests). `npm run lint` clean,
177 files. `npm run acceptance` OK. Seeding re-verified at exit 0.

---

# Review round 2 (commit `a462c48`)

Findings came from a local `coderabbit review --agent --base faceted-store-v2`
CLI run against `f18a9d9` — the GitHub bot skipping the PR is expected on a
non-default base. My round-1 provenance concern is resolved.

13 findings: 8 MD041 recycles declined, 5 accepted, 1 declined as a false
positive.

## Accepted

| Fix | Why |
|---|---|
| Store-qualified decision refs | `from` was `<name>/<value>` while the registry key is `<store>/<name>`. `model.refs` is published and `from`-sorted, so identically named registries in different stores had indistinguishable edge origins. Now `<store>/<name>/<value>` |
| `GOVERNED_COLLECTIONS` | `checkRegistryMembership` hardcoded the `knowledge-leaf`/`model.leaves` pairing at two call sites. Now declared, and both tables walk together — UCS-1149's second governed kind is two table entries, not a walker edit. `assertGovernedKinds` refuses at load a row whose kind maps to no collection (it would look governed and be checked nowhere) |
| Descriptor `reader` field | The leaf-loader branch moved out of the load loop into the table. Held **by name** via `BESPOKE_READERS` because the descriptor is declared above those functions — a direct reference would be a forward reference into a frozen const. `assertReadersResolve` guards it: an unresolvable reader loads zero records and reads as an empty store |
| Conduct count | The doc said "Three engine conducts" over a list of four — my own miscount from round 1 |
| Hoisted `valueAtPath(record, within)` | Computed twice |

## Declined

**The minting template's `status` value.** `templates/decisions/registry-minting.yaml`
is a **decision entry**, not a registry file. Its `status: proposed` validates
against `decision-entry.schema.json` where `proposed` is legal (confirmed: the
filled template validates clean). Its only *registry*-status mention is
`suppressed`, which is in `registry.schema.json`'s enum. The finding conflated
the two schemas.

**The 8 MD041 fixture-heading findings** — same justification as before.

## Gates after round 2

`npm test` **665 pass / 0 fail** (was 661; 4 new tests). `npm run lint` clean,
177 files. `npm run acceptance` OK. Seeding re-verified at exit 0.

---

# Review round 3 — final (commit `ebee40c`)

13 MD041 recycles declined. Of 3 new items: 2 accepted, 1 declined.

## Accepted — contradictory shape declarations refused at load

`shapeChecked` deduped by registry key alone, so two `FACET_REGISTRIES` rows
naming one registry with different `hierarchical` expectations would let the
first row settle the question and leave the second facet governed by a rule it
never asked for — silently, since the dedup `continue`s past it. That is the
same failure `registry-shape-mismatch` catches one level down.

Not resolvable at check time: one registry has one shape, and picking a winner
by declaration order answers a question the table asked wrongly. Two facets
needing both shapes need two registries. `assertConsistentRegistryShapes`
refuses the table at module load, matching `assertGovernedKinds` and
`assertReadersResolve`. Agreeing rows stay legal — the case the dedup serves —
and the dedup comment now states the invariant it leans on.

## Accepted — schema description polish

Worse than the finding suggested: the top-level `domain` had **no description
at all** while `facets.domain` had a detailed one. Now `domain`/`division` are
marked LEGACY and ungoverned, `facets.domain` is marked the registry-governed
subject path, and both note that UCS-1149 settles which survives.

## Declined — forwarding the store arg to `BESPOKE_READERS.loadLeafFiles`

`loadLeafFiles` hardcodes `'knowledge'` in five places (walk root, files index,
record kind, ref kind, parse-error message). A forwarded store argument would
be a parameter the function ignores — genericity advertised but not present,
misleading the next reader into thinking a second bespoke store is a one-line
change. If one arrives, the honest change is to parameterize `loadLeafFiles`
itself and let the wrapper signature follow.

## Final gates

`npm test` **666 pass / 0 fail** (baseline was 628). `npm run lint` clean, 177
files. `npm run acceptance` OK. Seeding re-verified at exit 0.

Branch head `ebee40c`, awaiting the lead's diff inspection and merge.
