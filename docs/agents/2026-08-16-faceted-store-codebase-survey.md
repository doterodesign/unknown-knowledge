# Codebase survey — faceted knowledge store (issue #49)

> Produced by a read-only Explore sub-agent on 2026-08-16 in support of breaking
> [issue #49](https://github.com/doterodesign/unknown-knowledge/issues/49) into tickets.
> Persisted verbatim by the coordinating session (the sub-agent had no write access).

Repo: `/Users/dimitriotero/Documents/GITHUB/unknown-knowledge` @ `ca9922e`, kit v1.0.0. Engine is plain ESM JavaScript + JSDoc (D-022), Node ≥22, zero build, `js-yaml` the only runtime dep.

## 1. Engine CLI surface

`package.json` has exactly **one bin**: `unknown-knowledge` → `cli/init.js`. Scripts: `test` (`node --test "tests/**/*.test.js"`), `lint` (`node scripts/lint.js`), `acceptance` (`node acceptance/run.js`). The engine surfaces are **not** bin entries — they're invoked as `node <kitdir>/engine/<name>.js`.

**Seven engine commands**, each a two-file pair — entry shim at `payload/engine/<name>.js` and implementation at `payload/engine/commands/<name>.js`:

| Command | Invocation | Exit codes |
|---|---|---|
| `validate.js` (structural validator, KK-05) | `[--json] [--root <dir>] [--concepts <ids>]` | 0 clean / 1 findings / 2 never-ran |
| `validate-values.js` (value validator, KK-07) | `[--concepts <ids>] [--json] [--root <dir>]` | 0/1/2 |
| `preflight.js` (KK-26) | `[--concepts <ids>] [--json] [--root <dir>] [--log --today <YYYY-MM-DD>]` | 0 all trusted / 1 quarantines / 2 failure or **any `unknown`** |
| `resolve.js` (KK-06) | `<query terms...>` or `--paths <f1,f2>`, `[--json] [--root <dir>]` | 0 (ran, hits or none) / 2 only — never emits findings |
| `audit.js` (reverse audit, KK-12) | `[--root] [--json] [--fail-on-findings] [--today] [--stale-days <n>]` | 0 / 2; advisory, 1 only with `--fail-on-findings` |
| `survey-map.js` (KK-25) | `--root`, `--json` | 0 / 1 on `unsurveyed:` blind spots / 2 |
| `log-entry.js` (KK-13) | `create --log findings\|misses\|gaps --date --entry '<json>'` / `transition --file --to --date [--reason]` | 0 / 2 |

There is **no "reflect" engine command** — reflect is a protocol skill (`payload/protocol/skills/knowledge-reflect.md`), human-run, six steps SWEEP→CLUSTER→RECOMMEND→GATE→APPLY→STAMP, writing `logs/last-reflect.yaml`. The spec's "reflect" reference is to that skill, not a CLI. Ditto `/kb-build`, `/knowledge-bootstrap`, `/knowledge-audit` (D-019 naming).

**Output contract** (`payload/engine/lib/exit-codes.js`): `CLEAN:0, FINDINGS:1, FAILURE:2`. `--json` emits `JSON.stringify(payload, null, 2)` to stdout; without it, a human renderer. Every payload carries a `store-health` key of shape `{ ok, errors: <count>, warnings: <count> }` via `healthSummary(storeHealth(model))`. All output stable-sorted, no timestamps — golden-file diffable, which is what makes the spec's golden-file testing claim already true.

Load-bearing invariant, restated in every file: **exit 1 means FINDINGS; a crash must never wear it.** Enforced structurally — the entry shim statically imports nothing and reaches the engine only via `import()` (UCS-956), so a module-load failure exits 2; `runCli` in `payload/engine/lib/cli.js` owns the epilogue so any throw exits 2. Never `process.exit()` (drops queued stdout, truncating piped JSON).

Two `--root` conventions: store-reading CLIs take the **repo root** (stores auto-located at `<root>/unknown-knowledge/` or the root itself); `log-entry.js` takes the **kit dir**. `payload/engine/lib/kit-root.js` `locateKit()` is the single authority and **refuses ambiguous layouts** (exit 2) rather than guessing.

Shared flag grammar in `cli.js` `parseArgs`: `--flag value` and `--flag=value`, `spec.boolean/value/repeatable/allowEmpty/positionals`; unknown flag, missing value, or empty value = `UsageError` → exit 2.

## 2. Knowledge store data model today

Leaves live at `knowledge/**/*.md` (recursive), one leaf per file, loaded by `loadLeafFiles()` in `payload/engine/lib/load-stores.js`. Format: YAML frontmatter fenced by `---` + markdown body; BOM and CRLF normalized; no frontmatter = `parse-error`. Store layout per store: `_catalog.yaml` → `_rules.yaml` → entries (decisions has no `_rules.yaml` by design).

**Current leaf frontmatter** (schema: `payload/schemas/knowledge-leaf.schema.json`; live example `tests/fixtures/loader/healthy/knowledge/regulation/362.1-ach-settlement-windows.md`):

```yaml
schema-version: 1          # required, integer ≥1
notation: "362.1"          # required — THE IDENTITY; pattern ^[0-9]+(\.[0-9]+)*$
domain: regulation         # required, free string
division: settlement       # optional, free string
heading: ACH settlement windows   # required
description: Prose is navigation, never the fact.
notes:                     # optional; type ∈ scope|class-here|revision
  - { type: scope, text: "US-facing operators only.", date: "2026-07-07" }
cross-references:
  class-elsewhere: []      # redirects, must resolve to notations
  see-also: ["362.2"]      # related, must resolve
  including: []            # free strings, "standing room", non-authoritative
citations:                 # REQUIRED, minItems 1
  - { source: "NACHA operating rules 2026", accessed: "2026-07-07" }
terms: [ACH, settlement]   # optional; the resolver's leaf→concept join key
edition: 1                 # optional integer ≥1
contributors: [dimitri]
```

`additionalProperties: false` throughout, so **frontmatter v2 must edit the schema** — an unknown key is `unknown-property`.

Gaps versus the spec's v2: **no `aliases` on leaves** (only ontology concepts have `aliases`); **no `verified`/`volatility`**, no `form`/`anchor`/`stage`/`operations`/`applies`/`authority`, no `concepts`/`paths`/`relates` typed edges, no `id`, no provenance. `description` exists today and the spec deletes it. `edition` exists but is bumped per-revision by kb-build, whereas v2 reserves it for phoenix events.

**ID minting today** — all three are *human/agent conventions enforced after the fact*, never programmatic:
- **K-NNN** (concepts): `^K-[0-9]+$`, minted at PR time inside the class file's range. The range is the **numeric filename prefix**: `ontology/classes/100-product.yaml` declares `[100, 199]` (`checkConcepts` in `commands/validate.js` computes `[N, N+99]`). `ontology/_rules.yaml` carries `{ class: 100-…, id-range: [K-100, K-199] }`. Audit drafts use a deliberate non-minted placeholder `K-XXX` so pasting a draft unedited fails validation.
- **Leaf notation**: minted by the `/kb-build` CLASSIFY step — "mint the next free notation under that division; `knowledge/_catalog.yaml` is the register of taken notations." Positional in the domain/division spine written at bootstrap INTERVIEW.
- **D-NNN**: agents draft provisional `D-YYYY-MM-DD-slug` with `status: proposed`; the steward assigns final `D-NNN` at acceptance. Pattern accepts both: `^D-([0-9]+|[0-9]{4}-[0-9]{2}-[0-9]{2}-[a-z0-9-]+)$`.

Duplicate minting is caught by the loader's `indexRecord()` → `duplicate-id` error. The spec's "collision is a loader hard error" for `L-` therefore already has a mechanism to extend.

**Class-elsewhere redirects**: an array of bare notation strings under `cross-references.class-elsewhere`. Semantics in `AGENTS.md`: a redirect — the content lives at the target, follow it. `kb-build.md` step 1: a move is a new leaf + a `class-elsewhere` redirect from the old one, **never a rename in place**, because notation is immutable once cited (§3.5). This is precisely the cost the spec's accession-ID inversion eliminates. Loader resolves them as typed refs (`REF_FIELDS['knowledge-leaf']`); an unresolvable one is `unresolved-ref`.

## 3. Citations today — every leaf-reference site

"Citation" is overloaded in the codebase. Two distinct things:

**(a) Leaf → world** (`citations:` array of `{source, accessed}`) — free-text source strings, no `authority` tier. The only validation is `missing-citation` (empty `source` string) in `commands/validate.js`; schema enforces `minItems: 1`. In the ts-app fixture the "source" is even a repo path (`src/registry/export-formats.ts`), which the spec's authority tiers would formalize.

**(b) References *to* a leaf by notation** — this is what the one-time migration rewrites. Complete enumeration of format sites:

1. **Leaf → leaf**, `cross-references.class-elsewhere[]` — bare notation strings. Schema `$defs/notation`; loader `REF_FIELDS`; live in `tests/fixtures/loader/healthy/.../362.1-*.md`.
2. **Leaf → leaf**, `cross-references.see-also[]` — same shape. (`including[]` is free strings, *not* notations — not a migration site.)
3. **Decisions `relates-to.leaves[]`** — `decision-entry.schema.json` `$defs/notation`. Live: `fixtures/ts-app/unknown-knowledge/decisions/entries/D-101-*.yaml` (`leaves: ["100.1"]`), `tests/fixtures/loader/healthy/decisions/entries/D-004-three-stores.yaml` (`leaves: ["362.1"]`). All 22 kit decisions carry `leaves: []`.
4. **Knowledge catalog rows** — `knowledge/_catalog.yaml` `entries[].id` is the notation (quoted), plus `title` and `file`. Validated by `ID_GRAMMARS.knowledge` in `commands/validate.js` (`id-shape`) and by `index-drift`/`orphan`.
5. **The leaf's own `notation:` field** and, by convention, **the filename prefix** (`362.1-ach-settlement-windows.md`, `product/100.1-adding-a-new-export-format.md`). The filename prefix is convention only — nothing parses it for leaves (unlike ontology class files, where the prefix *is* the id range).
6. **Log fragments** — `finding.schema.json` `consulted.leaves[]` uses `$defs/notation`; same in `gap.schema.json` and `miss.schema.json`. Written via `log-entry.js`, e.g. kb-build's gap example `"consulted":{"leaves":["100.1"]}`.
7. **Ontology concepts → leaves: none.** Concepts have `used-by`/`confusable-with` (K-), `rationale` (D-). The leaf→concept join today is **implicit and text-based**: `knowledgeEntryPoints()` in `commands/resolve.js` matches leaf `terms[]` against a concept's `term`/`aliases` by normalized string. There is no typed edge in either direction — the spec's leaf-side `concepts: [K-102]` creates one where none exists.
8. **Engine code**: `ID_GRAMMARS.knowledge` regex in `commands/validate.js:71`; `REF_FIELDS['knowledge-leaf']` and the `indexRecord(ctx, 'leaves', record.notation, …)` call in `lib/load-stores.js`; `resolve.js` result field `notation`; `checkCatalogs`/`checkOrphans`/`checkCitations` in `validate.js` all key on `notation`.
9. **Docs/protocol prose**: `AGENTS.md` ("carries `K-NNN` / `D-NNN` / leaf notation"), `kb-build.md` (12 mentions), `acceptance/A5-kb-build-walkthrough.md` (7), `payload/templates/knowledge/_rules.yaml`.
10. **Schema `$defs/notation`** is declared **four times** — `knowledge-leaf`, `decision-entry`, `finding`, `gap` — plus a fifth as a regex literal in `validate.js`. Five copies of one grammar; see §7.

## 4. Test architecture

`node:test` + `node:assert/strict`, no framework. `npm test` runs `tests/**/*.test.js` (~50 files, flat directory). **Fixture-directory-per-scenario** is the dominant idiom.

Two seams, deliberately:
- **CLI-process tests** (majority): `spawnSync(process.execPath, [cli, ...args])`, asserting exit code + parsed stdout JSON. Header comment recurs verbatim: *"Tested only through its public seam: the CLI process — exit codes and output ARE the contract."* Example `tests/resolve.test.js`, `tests/validate.test.js`.
- **Direct-import tests** for pure libs: `tests/load-stores.test.js` calls `loadStores(root)`; `tests/validate-record.test.js`, `tests/suppressions.test.js`, `tests/iso-date.test.js` likewise.

**Fixture layout** — `tests/fixtures/<surface>/<scenario>/`, each scenario a whole miniature store root:
- `loader/` — `healthy`, `malformed`, `duplicate-id`, `unresolved-ref`, `partial`, `no-catalog`, `coercion-trap`
- `structural-validator/` — `clean`, `findings`, `warnings`
- `value-validator/` — `clean`, `drift`, `malformed`, `never-ran`, `unknown-kind`, `wrong-pointer`
- `preflight/` — `clean`, `drift`, `malformed`
- `resolver/` — `store`, `on-disk` (the latter has real files so the folder-pointer test can stat the filesystem)

Scenario names encode the expected verdict. Fixtures are immutable and memoized (`fixtureModel()` caches `loadStores` per name); mutation tests `cpSync` into `mkdtempSync` temp dirs.

**Golden-file style**: not separate `.golden` files — assertions are inline `assert.deepEqual` over the full sorted JSON projection, e.g. `out.findings.map(f => [f.code, f.id])` against a literal array of 9 tuples in `validate.test.js`. Determinism (stable sort, no timestamps) is what makes that work, and it's the property the spec relies on.

**Acceptance fixture store** — `fixtures/ts-app/` and `fixtures/swift-app/`. Each is a synthetic app with its own nested `unknown-knowledge/` store (the §9.1 target layout), plus a `FIXTURE.md` that is the **planted-case inventory and the acceptance harness's source of truth**. Never in the init payload (D-007), pinned by `tests/fixture-ts-store.test.js` / `fixture-swift-store.test.js` (store loads with zero diagnostics; every pointer resolves). Runner: `acceptance/run.js` (`npm run acceptance`), one `criterion(id, checks)` per PRD §10 criterion A1–A6, A5 reported MANUAL.

**The planted-drift pattern** (`fixtures/ts-app/FIXTURE.md`) — this is the shape the spec's v2 plants should mirror:
- Three markdown tables: **A2 clean extractions** (concept | kind | anchor file:line | symbol | expected value set | notes), **A3 planted drift** (case | concept | anchor | expected finding), **§5.1 out-of-envelope** (case | concept | anchor | sentinel | wrong-parse trap).
- One planted case per finding code, named by the code: `value-not-in-source` (K-102 claims `futures`, absent), `source-value-missing` (K-104 source has `crypto`, unclaimed), `wrong-pointer` (K-108 all values missing from a real parseable file).
- Every anchor cited as `file:line`, including into the store YAML (`100-product.yaml:134`).
- The invariant is stated: *"All store files are schema-valid: drift is planted in values, never in descriptor shape, so no case hides behind a malformed-descriptor hard error."* Plus *"Every planted case is deliberate; if you 'fix' one, you break the harness."*
- Adversarial-but-extractable inventory listed separately from unextractable.

**Extractor fixtures** — `payload/extractor-fixtures/<stack>/<kind>/` = `sample.<ext>` + `EXPECTED.yaml`. `EXPECTED.yaml` carries exactly the descriptor's own fields (`kind`, `file`, `values`, plus `symbol`/`emit`/`pattern`/`strip`). Directory kinds reshape the pair: `file` names a directory (`sample-modules/`) and the kind is fed a deterministic listing. Samples are adversarial-but-extractable on purpose (mixed quotes, interleaved comments, trailing commas); out-of-envelope shapes live in the acceptance fixtures instead. Ships to clients for selected stacks (D-009) and doubles as the authoring template. Pinned by `tests/extractor-kinds-{ts,swift,dir}.test.js`. This is the exact shape the spec models format adapters on — including its dual role as fixture and template.

## 5. Decisions store

`decisions/_catalog.yaml` + `decisions/entries/D-NNN-<slug>.yaml`, 22 entries, each an envelope `{schema-version, entries: [...]}`. Spec-referenced:

- **D-003** — Three stores split by truth anchor (artifact/world/team), uniform YAML rigor *(architecture, accepted)*
- **D-007** — Init copies from an explicit payload allowlist; acceptance fixtures and kit tests can never ship *(trust, accepted)*
- **D-008** — Behavioral drift detection is out of scope, stated openly *(scope, accepted)*
- **D-010** — Git-native concurrency — no runtime/server/locks; stores reviewed as code; fragment-based logs *(architecture, accepted)*
- **D-011** — Preflight verdicts are deterministic engine code; conduct-on-verdict is protocol-layer policy *(trust, accepted)*
- **D-013** — Suppressions ship as a minimal exact-match client-zone file; patterns/expiry/reflect-proposals deferred *(scope, accepted)*
- **D-014** — The engine never executes client code — lexical parsing only, no network *(trust, accepted)*
- **D-022** — Engine is JavaScript with JSDoc types, zero build step, minimal deps *(architecture, accepted)* — supersedes D-002

Others that constrain schema changes:
- **D-001** — Seeded-once-then-owned; no update channel, ever *(governance)* — **the hardest constraint**: a schema change cannot be pushed to seeded repos, so migration must be self-contained and correct at seed time.
- **D-005** — Validators run only vendored, versioned, tested code — never same-session agent-authored code *(trust)* — governs new format adapters exactly as it governs extractor kinds.
- **D-009** — Extractor fixtures ship per stack selected at init; later stacks are client-authored, warned at init *(scope)* — the precedent for shipping adapter fixtures conditionally.
- **D-012** — PR drift attribution via whole-store baseline finding-set diff *(architecture)* — the reason output must stay stable-sorted and timestamp-free.
- **D-021** — Version policy *(process)*: **MAJOR = store schema-version bump or breaking engine CLI contract change**. Frontmatter v2 is therefore a major release.
- **D-004** two-phase init; **D-006** CI-agnostic; **D-015/016/017/018/020** OSS/name/license.

Note "additive-only schema evolution" is asserted in every schema description and attributed to §3.5 + D-013, but D-013's own title is about suppressions — the additive-only rule has no dedicated decision entry. Worth a ticket if v2 needs to relax it (deprecating `notation` to optional is additive; making `id` required is not).

## 6. Domain glossary

`CONTEXT.md` is the canonical glossary and is **enforced by `tests/context-glossary.test.js`** — use these exact terms in ticket titles:

**Kit** (the product/CLI) · **Engine** (the vendored deterministic code; "seven command-line surfaces") · **Store** (one of three governed YAML repositories) · **Ontology / Knowledge / Decisions** · **Truth anchor** (artifact/world/team; litmus: "if the repo were deleted, would this still be true?") · **Anchor (extraction anchor)** · **Extractor kind** · **Rung** (checkability ladder 1–4) · **Enumerates block** · **Miss-log** · **Init** (two-phase) · **Protocol files** · **Runtime loop** (`RESOLVE → PREFLIGHT → GATHER → ACT → RECORD`) · **Finding** (five triggers: correction, recurrence, retrieval-struggle, retrieval-miss, quarantine) · **Verdict** (`trusted / quarantined / unknown`) · **Suppression** · **Steward** · **Reflect skill** · **Trust graduation** (already glossary-defined: "Future, per-category autonomy upgrades… Each graduation is recorded as a Decisions entry. Not built in v1; designed for in the schema" — the spec is cashing this cheque) · **Stack** · **Acceptance fixture** · **Extractor fixture** · **Payload manifest** · **Survey map** · **Survey scope**.

Not in CONTEXT.md but pervasive and load-bearing: **leaf** (a knowledge record), **notation**, **concept**, **catalog** / **rules** (the navigational grammar `_catalog.yaml → _rules.yaml → entries`), **class file**, **payload** (`payload/` = exactly what init vendors), **kit zone** vs **client zone**, **conduct** (what a session does about a verdict — D-011's client-owned half), **blocking-grade** vs **advisory**, **hard error**, **out-of-envelope**, **planted drift**, **the map is never the fact**, **a check that never ran is a blocking defect, never a silent pass**, **agents draft; humans approve**, **seeded-once-then-owned**.

`ORCHESTRATION.md` adds build-loop vocabulary: PRD.html §12 issue graph `KK-01..KK-28`, Linear `UCS-NNN`, commit convention `KK: <title> (UCS-NNN) (#PR)`, PR size 300–600 lines.

## 7. Prefactoring opportunities

Ordered by leverage for the accession-ID inversion and frontmatter v2.

1. **Notation grammar is defined five times.** `$defs/notation` in `knowledge-leaf`, `decision-entry`, `finding`, `gap` schemas, plus the regex literal `ID_GRAMMARS.knowledge` in `commands/validate.js:71`. Adding `L-NNNNNN` means touching all five, and they can silently disagree. Prefactor: one shared id-grammar module (or a schema `$ref` across files) consumed by both the schemas and `ID_GRAMMARS`. **Highest-value single cleanup** — it's the exact seam the migration edits.

2. **The leaf's identity field name is hardcoded across the loader and every consumer.** `indexRecord(ctx, 'leaves', record.notation, file, 'notation', {notation, file, record, body})` in `load-stores.js`, then `.notation` is read in `commands/validate.js` (`checkCatalogs`, `checkOrphans` via the `['knowledge', model.leaves, 'notation']` triple, `checkCitations`) and `commands/resolve.js` (`knowledgeEntryPoints` emits `{notation, heading, file}`). Prefactor: give the leaf entry a neutral `id` alongside `notation`, so the identity swap is one line in the loader rather than a rename across four files and their tests. The `spaces` array in `checkOrphans` already parameterizes the id path — extend that idiom.

3. **`REF_FIELDS` is the one good seam — lean on it.** `load-stores.js` already declares the whole cross-ref graph declaratively per record kind (field path + target id space) and `collectRefs`/`resolveRefs` are generic over it. v2's `relates.{depends-on,see-also,contradicts,supersedes}`, `concepts: [K-…]`, and `paths: []` should be added here, not as bespoke checks. One gap: `collectRefs` handles only 1- and 2-level field paths (`[head, tail]`) — v2's `relates` map with four typed sub-arrays needs a third level or a small generalization. Do that generalization first.

4. **Store-shape assumptions are hardcoded in several places.** `STORE_DIRS = ['ontology','knowledge','decisions','logs']` in `kit-root.js`; `loadEntriesFiles`/`loadLeafFiles` hardwire `.yaml`-in-`classes/` vs `.md`-recursive-in-`knowledge/`; `loadCatalogAndRules(ctx, store, hasRules)` special-cases decisions. Store-level **registries** (domains, operations, jurisdictions, authority tiers) are a new file class the loader has no notion of. Prefactor: a per-store descriptor (`{dir, recordKind, extension, recursive, hasRules, idField}`) so a registry store-file class is data, not a fourth code path.

5. **`resolve.js`'s leaf join is text-luck and structurally isolated.** `knowledgeEntryPoints()` string-matches leaf `terms[]` against concept `term`/`aliases`, and `MATCH_SCORES` (100/80/60/50/40) plus `STATUS_DOWNRANK` are the entire ranking model — concept-only, with no leaf scoring path at all. The spec's structured-join scoring, scope filtering, Time-verdict demotion, and one-hop `relates` expansion have nowhere to attach. Prefactor: extract scoring into a `lib/` module with an explicit signal→score table before adding signals, and make leaves first-class result objects rather than an attachment to a concept result.

6. **`validate-record.js` is a hand-rolled JSON Schema subset** supporting exactly `type, required, properties, additionalProperties:false, items, enum, pattern, minItems, minimum, $ref-into-$defs` (pinned by `tests/store-schemas.test.js`, which fails any schema using an unsupported keyword). Facet registry membership, hierarchical `domain` paths, and date-vs-volatility relationships **cannot** be expressed here. Precedent exists: `CONVENTIONS` (a kind→function map for `conceptConventions` / `lifecycleConventions`) is where non-JSON-Schema rules live. Prefactor: confirm registry membership goes in `CONVENTIONS` or in `validate.js` as a structural check (the spec says structural-validator), and land the decision before writing the schema, so it doesn't get wedged into an unsupported keyword.

7. **`kb-build.md` encodes the notation lifecycle in prose.** "notation is immutable once cited", "mint the next free notation", "a move is a new leaf plus a class-elsewhere redirect, never a rename in place", "bump `edition` and append a `revision` note". Accession IDs invert nearly all of it and reassign `edition` to phoenix events. This skill (and `A5-kb-build-walkthrough.md`, which mirrors it step-for-step) is the largest prose-migration surface — worth its own ticket, sequenced with the schema change.

8. **`isPrePromotionStatus`** (`draft`/`proposed`) is the existing one-predicate seam that keeps the resolver's downranking and preflight's `unknown` verdict from diverging. The spec's `stage: draft` and Time verdicts (`static` never stales; stale at >365d `stable` / >90d `volatile`) should extend this same predicate rather than adding parallel status logic. `lib/iso-date.js` already provides `daysBetween` + `isCalendarDate`, and `audit.js`'s `stale-last-verified` is the working precedent for date-based staleness — including the **`--today` injection rule** (never read the wall clock; without `--today` the check reports itself skipped, never silently). Time verdicts must follow that rule or they break D-012 baseline diffing.

9. **`ID_GRAMMARS` in `validate.js` also drives the human-facing hint string** (`'dotted notation, e.g. "362.1"'`). Migration must update hints in lockstep with patterns — another argument for consolidating into one id-grammar module carrying `{pattern, hint}` per store.

10. **`suppressions.js` is already a clean module** with `loadSuppressions` / `partitionBySuppression` / `suppressibleBy`, fail-open by design, entries strictly `{term, sourcePath, reason, date}` (D-013 exact-match). The spec wants suppressions applied to document candidates identically. That will need a second identity shape (candidate term + section address vs. anchor path + basename) — check `suppressibleBy`'s current per-code identity switch before extending; it currently hardcodes two shapes (`unmatched-anchor`, `stale-last-verified`) and the comment explicitly commits to "one strict shape, no second entry grammar."

11. **Repo hygiene**: four untracked prototype HTML files sit at the repo root (`faceted-store-prototype.html`, `search-experience-prototype.html`, `library-walkthrough.html`, `architecture.html`). The spec designates the first three as reference artifacts never in the payload (D-007). Since `cli/kit.manifest.yaml` is an explicit allowlist rooted at `payload/`, they cannot ship by construction — but a ticket to commit them deliberately (with a note on their status) would stop them reading as scratch.

**Suggested sequencing** (matching the spec's own asymmetric-regret note): (1) unify the id grammar → (2) neutralize the leaf identity field in the loader → (3) generalize `collectRefs` for nested typed edges → then the accession migration, then frontmatter v2 + registries, then adapters/derived index.

---

Two flags worth attention when cutting tickets: the spec references "reflect" as an existing engine surface, but it is a protocol skill with no CLI — any ticket assuming a `reflect.js` needs re-scoping. And per D-021, frontmatter v2 is a **MAJOR** release (store schema-version bump), which under D-001 (no update channel) means already-seeded repos keep v1 forever — the migration story is for the kit repo and future seeds only.
