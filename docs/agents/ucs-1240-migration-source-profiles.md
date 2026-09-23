# Migration source profiles and retained consumer inventory

This guide describes the retained finite migration profile. The separately
identified [installation cutover profile](ucs-1240-installation-cutover.md) adds
exact installed assets, reviewed whole-repository consumer roles, operational
suppression/rule handling and bounded observed local activation. Its explicit
inputs and review requirements do not broaden the finite profile described here.

Optional-store implementation from main `c7b055a`. The prior agreed design
and P1/P6 source concurrence are preserved; this release uses current source.
The existing operational-history proof remains mandatory. This document does
not declare complete installation cutover or support for arbitrary source roles.

## Finite source profile

Derive K/O/D presence from actual snapshot directory entries and corroborate each
actual healthy loader's metadata. A missing directory, a present empty store and
an unreadable/non-directory/symlink entry are different states. Both sides must
have the same actual presence and per-kind authored payload counts, with at least
one actual payload across K/O/D. Count historical actual maps and candidate
`authoringRecords`, including proposals; catalog rows are not payload evidence.
Retain the private complete identity bijection, file/kind/namespace checks and
whole-tree mechanical proof. Never construct a synthetic missing store.

Publication-v4 selects migration-representative-v2 and migration-optional-stores-v1.
The semantic report is version 3 with an explicit sourceProfile member. The
original buildMigrationReplayRecipe v1 export retains its existing behavior;
buildOptionalStoreMigrationReplayRecipe uses the same fixed implementation with
explicit v2 empty-vocabulary handling. Retain original before and
candidate source profiles, actual counts and a finite-scope label; require fresh
profile equality through final review/publication. Keep the historical runtime
unchanged. The ordinary resolver does not search Decisions: Decisions-only
identity preservation is proved through mechanical and actual record validation,
not fictional retrieval observations.

Enumerate complete query/path vocabulary from actual K/O, then perform real no-hit
query/path controls and native md/txt document replays on both sides. With no
vocabulary, generate a fixed unmatched-only document with its actual native
section count. Do not report absent vocabulary as observed records or invent
Markdown sections. Every actual K/O record and declared relation remains covered;
zero coverage is permitted only for an actual zero map. Generate and compare the
actual empty Knowledge index and both trees in memory when Knowledge is absent or
empty. Never write these artifacts into the candidate, which would create a store.
Preserve strict original ordering and the existing narrow renderer instruction
allowance. All actual structural/value, history and capacity checks still run.

Required acceptance uses real committed root/nested snapshots: Decisions-only,
Ontology without Knowledge, Knowledge without Ontology, mixed existing profile,
empty-present versus absent, healthy and malformed present stores, all-empty
refusal, non-directory store refusal and complete case/byte budget shortfall.
An actual Decisions-only test reproduced the original hard nonempty-K/O refusal
against current c7b055a source before implementation. Retained/fresh review/CAS must pass for the new profile.

## Retained consumers: actual roles and disposition

| Surface | Actual current owner / use | Present finite migration disposition | Required broader contract |
| --- | --- | --- | --- |
| Catalog IDs and K/O/D records | load-stores, record identity, schema validators and ordinary resolver | Exact source roles, schema transitions, typed refs, full candidate bytes and actual old/current semantics | Additional historical formats need a separately captured actual owner; unavailable declarations cannot count as payloads |
| Typed relations and governance refs | identity-migration occurrence inventory; actual record/registry/graduation validators | Exact declared scalar spans and private occurrence correspondence | No free-form replacement; duplicate or unresolved occurrences block |
| Phoenix events | actual historical/current validateStoreFile and unaccountedEditions | Retained event rows, reasons, dates, move counts and editions proved | Do not replay events or increment editions during identity conversion |
| Finding/gap/miss fragments | actual role validators; log-entry and protocol consultation/reflect consumers | Typed consulted refs plus explicitly reviewed original prose spans, exact other bytes | Mixed resolved-context and prose are not universally typed; unresolved operational refs block |
| Empty _rules.yaml | fixed closed schema-1/store/rules:[] role at existing K/O paths | Exact byte preservation | No claim about arbitrary nonempty entries or a newly invented Decisions rules role |
| Nonempty rules | rules schema validates only envelope; protocol navigation and project governance consume item meaning | Refuse as unclassified | Need closed per-profile item grammar, exact identity versus notation/range/literal roles, actual old/current consumer behavior and reviewed scope; never infer reference-free from an unconstrained array |
| suppressions.yaml | actual audit and document resolver load term/sourcePath/reason/date; strict exact-match matching, fail-open advisory warnings | Refuse as unclassified | Prove exact term/path semantics and old/current warning/match behavior. ID-looking terms are not automatically references; preserve reasons/dates |
| Generated ordinary artifacts | deriveArtifacts/buildIndex/buildTree/renderTree; loader skips derived output | Three exact old artifact paths byte-preserved; fresh detached generation compared | Unknown derived paths refuse; no authored content may be discarded as generated by assumption |
| Protocol/AGENTS, templates and in-use examples | navigation, authoring and agent workflows | Known protocol/templates/hooks paths are unclassified and refuse | Inventory actual activated entrypoints/examples and every operational citation; old illustrative labels are not automatically archival evidence |
| Wrappers and hooks | kit manifest, wrapper generator, installed Git hooks and IDE instruction entrypoints | No broad wrapper conversion profile | Include actual repository-root/IDE paths outside the kit, user-owned variants and activation configuration. Bind source/target files and prove new-reader isolation; do not execute arbitrary client hooks |
| Vendored runtime/readers/writers | fixed current captured runtime versus isolated 08066b5 compatibility distribution | Current tests use captured trusted engine only | Deployed/activated clients and scripts need explicit inventory, version compatibility and cutover/isolation. Historical code stays offline; a matching data grammar cannot detect all stale old-ID consumers |
| Local extensions / external inputs | installation-specific readers, scripts, integrations and saved references | Unsupported unless actual role is understood | Enumerate and review required consumers. Unknown or uninspectable required refs block, or require explicit reviewed removal from retained operational scope |
| Evidence source files outside stores | ontology source pointers, lexical extractors and Knowledge citations | Exact whole-tree preservation and actual applicable validators | Preserved bytes do not prove a file is not an ID consumer. Classification must be source/candidate-bound in an installation inventory |

The current source inventory's role classifier is deliberately finite: it marks
known store/protocol/template/hook paths and suppressions as unclassified where
unsupported, but other repository files are not automatically classified as
consumers. **Whole-tree byte preservation is not a complete activated-consumer
inventory.** Neither a regex with no matches, a file suffix nor a zero-hit resolver
can close that gap. The optional-store slice does not change this limitation.

A future complete inventory should bind each actual retained file/consumer to its
Git locator, declared role/schema, activation path, old/current owner contract,
typed reference spans, preservation/conversion evidence and review disposition.
Keep unknown entries explicit; record every reviewed removal and prove the
candidate's activation configuration no longer uses it. Do not add an ignore-all
bucket or retain correspondence as an operational requirement. This is a design
requirement, not a caller-asserted completeness API already implemented.

## Conditional formats and unresolved choices

Required document formats follow actual activated readers/validators/writers and
integration inputs. md/txt remain this finite recipe's capabilities. HTML/PDF
would require their native ordered IR/locators and bounded encoding contract;
there is no obligation to pack every optional adapter into every source profile.
Unsupported required formats block that installation's full cutover.

No nonempty rule-item grammar or universal wrapper activation detector has been
established. Those owner-specific contracts remain concrete unresolved work;
keeping them explicit is preferable to declaring arbitrary items inert. The
current implementation changes optional-store proof only, with proposed Decision and
owned documentation updated together. Main retains shared-root docs, version,
lockfiles and changelog reconciliation for the actual PR.


The actual original/candidate presence and counts are retained as
`sourceProfile: {policy:'migration-optional-stores-v1',status:'complete',before,
candidate}`. Each side has knowledge/ontology/decisions members with exactly
`{present,records}`. Counts use all historical payloads and candidate authored
records, including proposals. They are corroboration, not a replacement for the
existing full private identity bijection. The profile, full recipe and retained
operational history share maxInventoryBytes. Both empty generated bundles still
consume maxGeneratedBytes. Native allocation before measurement remains outside
these logical retention bounds.

Original semantic/publication evidence remains historical; it is not silently
upgraded to the new policy. Final verification requires the current captured
runtime, v4 policy, v2 recipe, actual profile and v3 report before full fresh
review equality and the final CAS. The mechanical v1 preimage/report, historical
distribution, input envelope, three review artifacts and ordinary lookup remain
unchanged. No legacy alias, mapping file or runtime compatibility ID is emitted.
