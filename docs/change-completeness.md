> Packaging stage 6/7, version `3.0.0-rc.7`. This stacked prerelease is for review and new-installation development. No release or customer migration is authorized.

This page preserves integration history and design context. The [delivery availability](pr-delivery/README.md) is authoritative for this intermediate tree; later capabilities and historical receipts are not current head verification.

# Decision and documentation coverage

Every actual PR advances the package version, both root lockfile versions and
the versioned changelog. The [CI guard](../scripts/check-pr-version.js) checks
those mechanical requirements against the PR base. Reviewers also check the
[PR checklist](../.github/pull_request_template.md): automation cannot establish
that every substantive decision or affected explanation has been captured.

Current checkpoint: lifecycle integration through `6605402` is implemented;
the matched corpus-growth evaluation passed 60/60 scoped deterministic checks.
Final deterministic reconciliation is complete: 3,878 original passing cases
plus 28 corrected cases, with no unresolved deterministic failure. The public
agent campaign and all 36 held-out sessions are complete, with adverse comparative
results. Bounded critical-category, emitted-witness and anonymous repeated-case
reviews are accepted. The
current review (contract arrives in PR7; see delivery availability) consolidates these results.
Bounded performance and archival-history results are recorded separately. Earlier sections retain their original
revision-specific results and limitations; they are not a current backlog.
The seventy-cell evidence mapping (contract arrives in PR7; see delivery availability)
separates actual assertions from agent/source obligations. An independently
reviewed additional E01 test verifies the eligible record beyond the registered
lexical top ten without changing product code; the original full-run totals stand.
The public campaign review (contract arrives in PR7; see delivery availability)
retains all six initial attempts and 156 subsequent attempts under their
respective instruction contracts. It establishes no overall quality pass.

The shared interface increment records subsequent decisions in the existing
[P11 contract](../decisions/entries/ucs-1244-first-interface-contract-proposal.yaml),
with its existing exact catalog row. It updates package/lock dependency and bin
metadata, README, CONTEXT, protocol AGENTS, the seeded
[interface guide](../payload/protocol/engine-interface.md), manifest, P11 status,
publishing guidance and this coverage record. Existing query/store schemas are
unchanged because the adapters call their owners. Root AGENTS and platform
wrappers already delegate to the canonical protocol, so their instructions
remain applicable. Historical acceptance receipts are preserved. These changes
share the pending 3.0.0-rc.2 PR version, not a separate internal-commit bump.

The subsequent route/context bindings reuse that same Decision and pending PR
version. They update the interface guide, README, protocol AGENTS, P6 view/context
guides and changelog. Two fixed MCP resources serve the already shipped guides;
no manifest or dependency addition is needed. Query schemas, domain evaluators,
root AGENTS, platform wrappers and historical acceptance evidence are unchanged.

Implementation authorization and Decision publication are separate. The records
below document rationale as proposals; they do not allocate canonical IDs or
assert human acceptance. Preserve existing reasoning and add explicit records
when a later choice changes it. The [catalog](../decisions/_catalog.yaml) remains
the navigation entry point.

This repository keeps one Decision per file. The engine's support for grouped
client records does not change that local editing convention. Loader checks
derive the proposal set from the catalog so adding a decision does not require
maintaining a second fixed inventory in test code.

Later integrated work records [single-pass identity-result admission](../decisions/entries/single-pass-record-result-admission.yaml)
and [equivalent-merge publication](../decisions/entries/ucs-1240-equivalent-merge-publication.yaml)
separately. Their owner contracts describe the changed accounting and the exact
publication evidence; neither establishes operational capacity or broader
lifecycle completion.

The [Decisions-only promotion publication profile](agents/ucs-1240-final-promotion.md)
extends the existing [reviewed-publication rationale](../decisions/entries/ucs-1240-reviewed-candidate-publication.yaml).
It preserves the original domain proof and adds retained/fresh evidence through
the final candidate-ref transaction. This change adds internal library support;
it introduces no public CLI, MCP tool, schema or agent-wrapper workflow.

[Private initial corpus admission](../decisions/entries/private-initial-corpus-admission.yaml)
records the audited loader lifetime that permits parse evidence reuse before
model exposure. Its [accounting contract](agents/ucs-1235-operation-budget.md#private-initial-corpus-admission)
retains full public re-admission and explicit limits; reduced duplicate work
does not establish operational qualification. Query schema, CLI flags, generated
views, and agent instructions retain their existing contracts.

The [finite migration profile](agents/ucs-1240-final-migration.md) now includes
actual historical/current operational-log validation and Phoenix edition
preservation. Its version-3 publication policy requires that additional evidence;
the original mechanical input contract and isolated historical runtime remain
unchanged. Broader installation-wide consumer inventory remains open.

The [fixed file-query composition](agents/ucs-1237-subject-query.md#fixed-file-to-query-api)
now keeps loading and execution in one private lifetime, under its
[recorded decision](../decisions/entries/fixed-file-subject-query-composition.yaml).
The bounded CLI uses this sequence; exposed-context query and validation,
unbounded CLI, intent plans and views retain their existing paths. Its accounting
guide, README and changelog describe the distinction. No flag, query schema,
manifest entry or agent workflow changed, so existing agent/wrapper instructions
and installed guides remain applicable. This is an internal library composition,
not a supported SDK/MCP release or new operational qualification. All 28 prior
operational refusals remain evidence for their original runtime and controller.

[Current-query eligibility reuse](agents/ucs-1235-query-eligibility-reuse.md)
separately removes repeated immutable Subject resolution/history work under its
[recorded decision](../decisions/entries/current-query-eligibility-reuse.yaml).
Every query still binds its actual model and every record still receives full
assignment validation. Governance/accounting guides, README and changelog describe
the changed logical work. No CLI option, schema, manifest or agent workflow
changes; existing root AGENTS and PR version obligations remain applicable.
This change neither completes Subject retirement nor establishes operational fit.

The subsequent [plain-retirement owner gate](agents/ucs-1235-plain-retirement-dto.md)
implements exact withdrawal and zero-use validation under its
[recorded decision](../decisions/entries/plain-subject-retirement.yaml). It preserves
old history and reviewed historical/inherited uses, and requires actual reach,
tree and fixed historical/refusal replay evidence. The ordinary assignment and
merge contracts remain separate. The later [retirement publication profile](agents/ucs-1240-final-retirement.md)
adds the independently reviewed retention and final transaction boundaries.

Affected README, changelog, P2 governance/design/audit, P8 event/replay/audit and
this coverage document describe the new internal contract. A separate closed
retirement event schema uses the existing validator keyword subset. Existing
manifest directory entries already vendor the added engine modules and schema.
No public CLI/MCP, template shape, platform wrapper or agent authoring workflow
is added. Root AGENTS, contribution rules and PR version checks already require
decision capture and affected-file review; their instructions remain applicable.
Installed README/steward instructions do not claim this internal lifecycle API
as a supported workflow. P11 contracts and broader migration/acceptance remain
open rather than being widened by an internal export.

Final retirement-focused integration passed **168/168** in 108382.8765ms after
independent-review corrections. Lint checked 486 files with no failures;
automated A1–A4/A6, structural/value checks, 153 local documentation links and the
rc.1-to-rc.2 version guard passed. A5 remains manual. Exact full-suite verification
is recorded separately; this result does not close broader lifecycle acceptance.

The first retirement full run at `8c9cac77ac154376cc43b4340cb647b0066bb27e`
passed 2538/2539 in 510701.489167ms. The one failure was the explicit schema-kind
inventory test missing the added retirement event. Updating that expectation
requires no runtime change; the corrected full result is recorded separately.

Corrected full verification at `26d785bc5ce963070ce4226bd1824bd85a829e41` passed
**2539/2539 tests** in 493856.260375ms, with zero failures, cancellations or skips.
The runtime/test snapshot stayed unchanged throughout. The preceding inventory
correction passed 51/51 focused checks. Final retirement publication was still
pending at that owner-only snapshot; no PR, tag, release, runtime approval or customer migration is implied.

## P1–P11 coverage

| Area | Rationale, contracts and scope limits |
| --- | --- |
| P1 identity, validation and promotion | [Identity](../decisions/entries/ucs-1234-identities-runtime-promotion.yaml), [runtime evidence](../decisions/entries/retained-runtime-validation-and-publication.yaml), [promotion rationale](../decisions/entries/ordinary-decision-promotion-proof.yaml), [validation](agents/ucs-1234-prepared-validation.md), [promotion](agents/ucs-1234-decision-promotion.md) |
| P2 Subject governance | [Coverage audit](agents/ucs-1235-decisions-and-docs.md) |
| P3 record assignments | [Assignment contract and decisions](agents/ucs-1236-subject-assignments.md) |
| P4 query and operation limits | [Query contract](agents/ucs-1237-subject-query.md), [query rationale](../decisions/entries/captured-subject-query-semantics.yaml), [operation admission](../decisions/entries/subject-operation-admission.yaml), [history validation](../decisions/entries/incremental-subject-history-validation.yaml), [call-local reuse](../decisions/entries/call-local-subject-authorizer-reuse.yaml) |
| P5 agent intent | [Coverage audit](agents/ucs-1238-decisions-and-docs.md) |
| P6 generated views | [Coverage audit](agents/ucs-1239-decisions-and-docs.md) |
| P7 migration, review and publication | [Coverage audit](agents/ucs-1240-decision-and-documentation-audit.md) |
| P8 assignment history and gates | [Coverage audit](agents/ucs-1241-documentation-audit.md) |
| P9 reflection and retrieval conduct | [Coverage audit](agents/ucs-1242-retrieval-governance.md) |
| P10 evaluation | Decisions, evidence and remaining acceptance (contract arrives in PR7; see delivery availability) |
| P11 interface preparation | [Proposed contracts and unresolved scope](agents/ucs-1244-interface-preparation.md) |

These links establish documentation coverage, not completion of every task.
Homogeneous K/O/D proposal promotion is implemented. Further Subject lifecycle
operations, bootstrap, broader migration integration, agent evaluation and
operational qualification still have remaining work. Internal exports are not a supported public API or MCP server.

The [typed promotion planner](agents/ucs-1234-typed-promotion-planner.md) now
implements the K/O byte-planning portion of P1 under its
[recorded decision](../decisions/entries/typed-record-promotion-byte-plans.yaml).
It preserves the existing Decision planner and publication profile. The subsequent
[Ontology gate](agents/ucs-1241-typed-promotion-design.md) now provides P8's typed
read-only proof for O records, including positive assignments and retained history.
The subsequent v3 profile adds classified Decision promotion and its exact
retained publication path. Broader lifecycle, bootstrap and acceptance obligations
remain distinct from this implemented homogeneous proposal-promotion support. P7's separate
[K/O/D publication profile](agents/ucs-1240-final-record-promotion.md) now
retains and reruns the actual O proof through review and the candidate-ref CAS. The gate's
[decision](../decisions/entries/ucs-1241-typed-promotion-design.yaml) records the
approved implementation boundary and the remaining work.
Its reviewed source/test snapshot passed 37 gate/publication checks, followed by
38 shared assignment/merge regressions and 66 installation/documentation checks
in integration. Lint checked 463 files with no failures; structural/value checks
and automated acceptance passed. These scoped results do not extend the earlier
full-suite result to the new gate or establish final publication support.
README, changelog and prepared-validation documentation describe this boundary;
there are no new CLI flags, schemas, wrapper instructions or supported public
API/MCP operations in this change. Root AGENTS and contribution/version rules
already cover its decision capture and PR obligations and remain applicable.

Integration verification at `2c688c1af3cc597a14fc28f9da2cfbb78c5befce`:
the full test suite passed 2,364/2,364 tests, lint checked 453 files with no
failures, and automated acceptance A1–A4/A6 passed. A5 remains a manual
walkthrough. These results cover that exact integrated revision; they do not
establish the remaining lifecycle, publication or operational qualification.

The subsequent combined query changes at
`46e12d24786184be96c9384481ea88d7f589751e` passed 2,389/2,389 full-suite tests.
The first combined run exposed one old repeated-visit accounting expectation;
its correction retains operation-isolation checks and verifies the new two-step
admission/lookup cost. The combined runtime also passed lint across 455 files
and automated A1–A4/A6 acceptance; A5 remains manual. These are development
verification results, not a regrading of the retained operational trials.

## Shared documentation review

| Surface | Integration disposition |
| --- | --- |
| Root README and CONTEXT | Link current contracts and this audit; explain permanent K/O/D identities, optional shared Subjects, absent versus empty assignments and distinct existing facets. |
| Root AGENTS, CONTRIBUTING, PR template and publishing guide | Require decision traceability, affected documentation review and one version advance per actual PR, including documentation-only PRs. |
| Package, lockfile, changelog and CI | Working version is `3.0.0-rc.2`, Unreleased. Mechanical version checks run on PRs; internal integration commits share the PR's version. No release is implied. |
| Migration guide | Distinguish published rc.1 instructions from unreleased canonical cutover. Remove the recommendation for permanent old-ID aliases; link the bounded final migration profile and its limitations. |
| Payload AGENTS, protocols and wrappers | Runtime owners maintain actual navigation, conduct and command contracts. This backfill introduces no command or wrapper behavior; retain the already integrated optional-Subject routing. |
| API/CLI, schemas and payload manifest | Owner contracts describe actual interfaces. New repository-only decision/audit files do not ship and need no payload entry. Proposed P11 interfaces are not advertised as implemented. |
| Acceptance READMEs and historical reports | Link additive current evidence and remaining acceptance. Preserve frozen fixtures, reports, trial settings and failed attempts; passing component tests do not rewrite them. |

For each later PR, review this list against its actual changes and record why
any relevant surface remains unchanged. A previous audit does not cover future
implementation changes automatically.

The Ontology transport extends the existing reviewed-publication decision rather
than duplicating P8's domain decision. README, changelog, prepared-validation,
review/final publication guides and P7/P8 audits describe the same O-only scope.
Root AGENTS, CONTRIBUTING and the PR checklist already require decision capture,
per-PR version advance and documentation review; their instructions remain
applicable. No public CLI/API/MCP command, schema, wrapper, adapter or extractor
contract changed. The engine-directory manifest entry includes the new modules.
This internal slice remains within unreleased `3.0.0-rc.2`; it creates no separate
PR, release, activation or real publication.

The subsequent full integration run at
`3f8edc04375b52ac6ffa7b4f8b9c343658784f85` passed **2411/2411 tests**,
including the Ontology gate and retained publication path. Lint (467 files),
structural/value validation and automated A1–A4/A6 acceptance passed; A5 remains
manual. The [P7 audit](agents/ucs-1240-decision-and-documentation-audit.md)
records the exact tested commit, original failures and current version check.
The broader open scope above remains open.

The subsequent [O/K v2 profile](agents/ucs-1240-final-record-promotion.md) adds
Knowledge with actual leaf lifecycle/preflight and exact retained evidence.
The existing domain and reviewed-publication decisions record peer agreement
and policy changes; the catalog entries retain their identities. Current README,
changelog, prepared-validation and P7/P8 guides/audits describe the same scope.
No public CLI/MCP, schema, wrapper or manifest shape changed. Root AGENTS and
per-PR version/decision/documentation requirements continue to apply. Historical
O-only v1 evidence and its full-suite results remain tied to their original pins.

Full O/K v2 integration at `71f049d49c6d30434f9cb4a4d96edd410eb53c4e`
passed **2422/2422 tests**, with no failures, cancellations or skips. Lint checked
468 files with zero failures, structural/value validation and automated A1–A4/A6
acceptance passed, and 152 changed-document local links resolved. A5 remains
manual. These results do not complete the remaining P1–P11 scope.

The [K/O/D v3 profile](agents/ucs-1240-final-record-promotion.md) adds classified
Decisions through the existing planner and typed history/impact checks. Its owner
report v2 records the exact Decision-only preflight inapplicability; it does not
invent a verdict or waive other checks. Existing domain/publication Decisions
capture peer agreement, the discarded extra-field/date-echo alternative and
version disposition. README/changelog, current P7/P8 contracts/audits and prepared
validation docs describe the same scope. No new public command, schema, wrapper,
manifest or agent-authoring workflow was introduced. Root AGENTS and the per-PR
version/completeness rules remain applicable; no real publication is authorized.

Full integration verification of the classified Decision slice at
`e19d36067b70a685e23cdb94df7907b430d89e06` passed **2448/2448 tests** in
483522.858916ms, with no failures, cancellations or skips. Lint checked 469 files
with zero failures; structural/value validation, automated A1–A4/A6 acceptance,
153 changed-document local links and the rc.1-to-rc.2 version guard passed.
A5 remains manual. Remaining Subject lifecycle, bootstrap, migration and
operational/agent acceptance requirements are not declared complete by this run.

## Retirement publication follow-up

The [publication Decision](../decisions/entries/ucs-1240-retirement-publication.yaml)
and [contract](agents/ucs-1240-final-retirement.md) record the later eventless
retirement proof, mandatory Decision tuple, shared decoder mechanics and fixed
publication policy. Earlier full-suite results above remain historical owner
verification, not proof of this later implementation. Current verification is
recorded in the new contract.

Affected root README/changelog, prepared-validation, P2 DTO/governance/audit, P7
review/final/audit, P8 audit and this coverage document are synchronized. Existing
root/protocol AGENTS and contribution/version/publishing instructions apply
unchanged; no public command, MCP method, schema or installed workflow changed.
Manifest directory coverage already includes the new modules. Retained runtime
files and historical experiment inputs are not rewritten. This internal work
remains 3.0.0-rc.2 Unreleased; it is not an additional PR or release.

Corrected publication checks passed 85/85 transport/decoder and 7/7 dedicated
integration tests. Independent review found no remaining blocker. Lint checked
498 files; structural/value validation, local documentation links and the PR
version guard passed. A6 initially caught its outdated worker allowlist pin;
after updating the exact list, automated A1–A4/A6 passed. A5 remains manual.
The publication guide preserves both failed and corrected evidence.

Full-suite verification at `83c86d21120c6ab4c6e5bad8eeac0f17e6afad57` passed
**2640/2640 tests** in 1061286.050333ms, with zero failures, cancellations or
skips. The runtime/test snapshot and repository remained unchanged throughout
the run. Evidence: `local-history:unknown-knowledge-full-retirement-publication.log`.
This establishes the integrated retirement publication regression result, not
completion of all P1–P11 work. Split, union, suppression/reversal, broader
migration and operational/agent acceptance remain tracked separately. No actual
PR, tag, release, runtime approval or customer publication occurred.

The next [split design](agents/ucs-1235-subject-split-design.md) and
[Decision](../decisions/entries/plain-subject-split.yaml) capture the peer-reviewed
direction and remaining contracts. This design does not inherit the retirement
verification result. Allocation, history, mapping, replay and publication each
require their own actual implementation evidence. Existing AGENTS and PR version
obligations continue to apply.

The implemented first split foundations now include evaluated pair history with
activation-assessment dependency and a fixed exact Subject allocation comparator.
README/changelog, P2 design/governance/accounting/audit and shared coverage are
updated together. The manifest already includes new engine modules by directory.
No schema, public CLI/MCP, wrapper or installed authoring workflow changed; root
and protocol AGENTS, contribution and publishing instructions remain applicable.
The complete model/core/P8/replay/publication composition remains unfinished.

The combined split-foundation regression passed **342/342** in 187086.865334ms,
with no failures, cancellations or skips. Lint checked 502 files, structural/
value validation and local documentation links passed, and automated A1–A4/A6
passed (A5 remains manual). Independent review found no remaining blocker after
the documented allocation corrections. This focused result does not relabel the
previous full-suite snapshot or complete the remaining split composition.

## Split actual-model validation

The same [Decision](../decisions/entries/plain-subject-split.yaml) and
[design](agents/ucs-1235-subject-split-design.md) now cover actual before/candidate
model composition, both-model authorizer checks, exact original assessment
evidence, shared allowance ownership and partial allocation observations.
They also record the review corrections for malformed input, referenced-entry
accessors, unrelated store reads and fixed native capture-depth failures.

README, changelog, P2 governance/design/accounting/audit and this coverage file
are updated together. Existing root/protocol AGENTS, CONTRIBUTING, publishing
rules, manifest directory coverage and the exact existing catalog row remain
applicable. No schema, public CLI/MCP, wrapper or installed workflow changed.
Package and both lockfile fields remain 3.0.0-rc.2 Unreleased for this pending PR;
the per-actual-PR version guard still applies. Historical evidence is preserved.

The focused implementation passes 73/73 tests; combined integration evidence is
recorded in the linked design. Complete split Git membership, assignment
coverage, impacts/replay and publication remain outstanding, alongside the
other P1–P11 requirements. This is an internal implementation commit, not a PR,
release, runtime approval or customer migration.

The frozen model integration passes 415/415 lifecycle tests and 65/65 additional
operation/budget/query tests, with no failures, cancellations or skips. Lint
checks 504 files with zero failures; automated A1–A4/A6 and 115 local documentation
links pass. A5 remains manual. These focused runs do not replace the prior full
suite or establish complete P1–P11 acceptance.

Final structural validation reports zero findings; value validation reports zero
findings with no live Ontology concepts to check. Reverse-path attribution covers
all 11 changed/new files and finds no live K/O records to update; the two missing
store warnings are expected in this repository's Decisions-only layout. The PR
version guard confirms rc.1→rc.2 with package and both lockfile fields aligned.

## Split request and event metadata

The [split Decision](../decisions/entries/plain-subject-split.yaml) and
[design](agents/ucs-1235-subject-split-design.md#implemented-split-request-and-event-metadata)
capture the exact request contract and the rationale for explicit root choices,
source-centric inherited review, separate known-state schema and charged core/P8
continuation. The new input and event metadata checks are implemented; actual
split Git scope/closure, assignment continuation, impacts and publication remain
in progress. Passing shape checks cannot supply those proofs.

| Reviewed surface | Disposition for this slice |
| --- | --- |
| Decision entry and catalog | Extend the existing split proposal with the agreed choices and reasons. Its ID/title/file and sole catalog row remain exact; no new canonical approval is claimed. |
| README and changelog | Describe implemented request/event metadata alongside the still-incomplete operation. |
| Governance, assignment, design and decision-audit guides | Document exact shapes, explicit root/mapping order, known versus unknown states, metadata limits, planned same-budget handoff and retained test evidence. |
| Root AGENTS/CONTEXT, payload AGENTS and wrappers | Existing decision/version/documentation obligations, stable identity and runtime rules still apply. No new command, runtime permission or installed split workflow is introduced. |
| Schemas and validator inventory | Add the separate split event kind and update the literal supported-kind test. Preserve shared definitions and the existing schema-validator language. |
| Payload manifest | Existing `engine` and `schemas` directory entries include the new files; no new manifest route is needed. |
| API/CLI/MCP, migration and publication guides | Internal request validation does not add a public command or complete publication/migration profile. Existing guides retain their supported scope. |
| Package, lockfile, PR guidance and acceptance evidence | rc.2 remains Unreleased for this internal commit. Version check against rc.1 passes; no separate PR/release is created. Historical acceptance fixtures and reports are unchanged. |

The frozen focused regression passes **204/204** in 79540.089291ms, including
actual ordinary/merge/retirement assignment gates. It excludes the parallel
incomplete split core and does not replace earlier full-suite evidence. The
design retains failed attempts, corrected test/schema assumptions and the
reviewer's retracted counterexample. Structural/value checks report zero findings
with expected absent Knowledge/Ontology warnings. Automated A1–A4/A6 pass; A5
remains manual. Further actual split and whole-goal acceptance remain required.

The final dedicated suite is 64/64 after adding explicit module-export and
multi-store ordering checks; it overlaps the 204-test regression. Lint and all
129 local links across seven changed Markdown files pass. Reverse-path
attribution covers the 17 slice files with no live K/O matches. No existing
Decision ID or approval is fabricated, and no release/customer migration occurs.

## Split row budget continuation

The next internal slice implements the fixed split row interface and the void
governance ownership assertion. The existing split Decision, README/changelog,
assignment/governance/accounting guides and design are updated together. Existing
AGENTS instructions, per-PR version rules, wrappers, schemas, manifest directory
coverage, public CLI/MCP and migration/publication guides retain their stated
scope; this adds no installed workflow or completed split gate. The new dedicated
row test is repository-only. Version remains rc.2 Unreleased for the same pending PR.

The owner regression passes **167/167** in 40362.520458ms (session 76313, exit 0).
Independent integration passes **105/105** in 64031.558459ms (session 2806, exit 0),
including actual ordinary, retirement and equivalent-merge assignment gates.
The runs overlap; no aggregate count or full-suite completion is claimed.
Their retained logs are `local-history:unknown-knowledge-split-row-final-regression.log`
and `local-history:unknown-knowledge-split-row-integration.log`. Complete split
scope, P8 wiring, impact/replay and publication remain in progress separately.

Row-slice structural/value checks report zero findings with the expected two
absent-store warnings. Working-tree lint reports 518 files and zero failures;
135 local links across eight changed Markdown files resolve. Attribution covers
all 12 slice files with no live K/O matches. These checks do not certify the
parallel core work, which is excluded from this internal commit.

## Actual split scope core

The internal Git core and its dedicated fixtures/tests now prove the agreed
mapping and retention scope. The existing Decision, README/changelog, split
design, governance/accounting notes and decision audit are updated together.
The implemented scope includes all declared historical source locators and
separate materialized reread costs. It does not complete the positive assignment
gate, outer zero-use preservation, mandatory impacts/replays or publication.

The owner matrix passes 106/106; independent integration passes **330/330** in
155211.066917ms (session 37141, exit 0), covering every `subject-split*.test.js`
file, including main's two actual same-tree/different-commit tests. No failures,
cancellations or skips occurred. The combined log is
`local-history:unknown-knowledge-split-core-integration.log`. Earlier receipts and
the actual historical-source/materialized-byte REDs remain distinct in the
design; no new whole-suite or full-goal acceptance is claimed.

Root/payload AGENTS and wrapper instructions, supported CLI/API/MCP commands,
schemas and migration/publication guides retain their scope: this is an internal
scope primitive, not an installed workflow. The manifest already includes engine
files by directory; dedicated fixtures/tests remain repository-only. The split
Decision retains its proposal ID and exact catalog row. Version remains rc.2
Unreleased for this internal commit within the same pending PR; no release,
canonical approval, runtime qualification or customer migration is performed.

Final structural/value checks have zero findings and the expected two missing
K/O store warnings. Automated A1–A4/A6 pass (session 85586, exit 0); A5 remains
manual. The frozen owner lint run checked 518 files with zero failures. All 136
local links across eight changed Markdown files resolve, and reverse attribution
covers all 18 core-slice files with no live K/O matches.

## Prepared split composition

The [prepared split gate](agents/ucs-1235-subject-split-gate.md),
[positive assignment adapter](agents/ucs-1241-subject-split-assignment-gate.md)
and [fixed replay](agents/ucs-1235-subject-split-replays.md) now compose the actual
domain operation. The existing split Decision retains its identity and exact
catalog row while adding the phase, preservation and replay rationale. README,
changelog, design, governance/accounting, P2/P8 audits and prepared-runner guides
describe the same boundary. Retained worker artifacts, runtime/review authority,
fresh final checks and split publication remain unfinished.

Root and installed AGENTS, other READMEs, contributor/publishing/migration guides,
supported CLI/API/MCP, wrappers and schemas retain their contracts. This internal
library work introduces no installed authoring workflow or migration. Existing
manifest directory entries include the new modules; fixtures/tests are not
payload. Version stays `3.0.0-rc.2` Unreleased within the same pending PR, with
each actual PR still required to advance its target base. Historical evidence
and prior full-suite claims remain tied to their original snapshots.

Final combined split integration passed **425/425** in 344734.714667ms (session
58753, exit 0), with no failures, skips or cancellations. The distinct P8-focused
194/194 and replay-focused 39/39 receipts overlap this run; they are not summed.
Runtime/tests remained frozen. Lint checked 530 files with zero failures;
structural/value checks found no findings with the two expected absent-store
warnings. Automated A1–A4/A6 passed; A5 remains manual. Reverse attribution covers
all 26 changed/new paths with no live K/O matches. Package and both lock fields
remain aligned at rc.2, and the version guard confirms rc.1→rc.2. Local link
verification is recorded in `local-history:unknown-knowledge-split-gate-doc-coverage.json`;
test and acceptance logs retain the same `unknown-knowledge-split-gate-` prefix.

## Prepared split transport

The [publication Decision](../decisions/entries/ucs-1240-split-publication.yaml)
and its single catalog row capture the agreed phase separation, original
evidence preservation, candidate-only identity capacity and fixed private reuse.
The [transport guide](agents/ucs-1240-prepared-split-transport.md) describes the
implemented wire/report and actual candidate-byte boundaries. Shared README,
changelog, split design, prepared-runner guidance and P7 audit now agree on this
scope. Workers, artifact persistence, actual original Git/allocation review,
fresh owner execution and publication remain unfinished.

| Surface | Disposition |
| --- | --- |
| Decision and catalog | New proposed record with reasons, consequences and implementation links; no canonical promotion or approval invented. |
| Root/installed AGENTS, CONTEXT and other READMEs | Existing navigation, capture, version and documentation obligations still apply. No new installed command or workflow changes their instructions. |
| API/CLI/MCP, schemas and runtime policy | Internal fixed exports only; no supported public operation, wire-envelope version or runtime-policy change yet. |
| Manifest, packaging and fixtures | Existing engine-directory inclusion covers the module; the three test files remain repository-only. |
| Migration, contributor/publishing and acceptance docs | No migration or release procedure changes. Historical receipts remain unchanged; current scoped evidence is recorded separately. |
| Package, both lock versions and PR guidance | Remain aligned at `3.0.0-rc.2` Unreleased for this pending PR. Every actual PR must still advance its target base and update versioned notes. |

The independent candidate-cap check passed **1/1** in 3762.171083ms
(session 53458, exit 0; `local-history:unknown-knowledge-split-candidate-cap.log`).
Its original identity contains a 32KB comment committed before capture; the
smaller actual candidate succeeds at its exact cap and refuses one byte short.
This is evidence of the cap distinction, not original-source publication proof.

Final focused integration passed **113/113** in 33299.164792ms (session 37908,
exit 0), including all three new test files. Legacy decoder, reader, retirement
and equivalent-merge transport regression passed **89/89** in 23178.189583ms
(session 97418, exit 0). The [transport receipt](agents/ucs-1240-prepared-split-transport.md#stage-1-validation-receipt)
records exact commands and log paths; earlier overlapping runs are not summed.
Lint checked 534 files with zero failures; structural/value checks have no
findings with expected missing-store warnings. Automated A1–A4/A6 passed; A5
remains manual. Reverse attribution covers all 15 changed/new paths with no
live K/O matches. The version guard confirms rc.1→rc.2 with matching manifests
and changelog. Link coverage and attribution are retained under
`local-history:unknown-knowledge-split-transport-`. No new full-suite, runtime
approval, PR, release or customer publication is inferred.

## Split workers and fresh final verification

The [publication Decision](../decisions/entries/ucs-1240-split-publication.yaml)
now also records failed-owner diagnostic retention and cleanup acknowledgement.
The [implemented slice](agents/ucs-1240-prepared-split-validation.md) includes
real prepared/final split workers, fixed runtime registration, retained artifacts
and the fresh final gate. Scoped verification is recorded below; it does not
establish review recording or publication completion.

Completed valid owner refusals retain exact diagnostic report bytes with a
matching exit status, without success artifacts. Malformed/interrupted or
contradictory execution refuses. All three authority-artifact reads use the existing
owned, no-follow, cap-before-allocation primitive. A zero-use operation forbids
any retained event artifact, including an empty file or broken symlink.
Parent cleanup failure rejects the split runner's acknowledgement while leaving
already retained evidence intact. That evidence does not attest parent cleanup;
fresh final cleanup independently revokes final success.

Shared README, changelog, prepared-runner/transport/design guidance and P7 audit
are reconciled against the implemented result. Review recording, independent
allocation corroboration and candidate publication remain a subsequent slice.
Root/installed AGENTS, public CLI/MCP, schemas, migration/release guidance and
manifest directory inclusion retain their existing applicability. The same
pending PR remains rc.2 Unreleased; no separate PR or actual approval is implied.
Candidate-review and final-publication guides retain their existing operation
lists because those APIs still do not admit split. Other README files and agent
wrappers introduce no new workflow; the internal entrypoints are documented in
the owner guide and linked from the root README.

Main's independent depth regression first reproduced native encoding exceptions
for both retained `input.json` and `capture-limits.json`, after actual runner and
fresh-final control success: **0/3**, 14041.538833ms (session 78994, exit 1;
`local-history:unknown-knowledge-final-split-depth-red.log`). The local
encoding-only adaptation then passed **3/3**, 15951.173458ms (session 23463,
exit 0; `unknown-knowledge-final-split-depth-green.log`). It does not suppress
unrelated programming exceptions. Shared and independent regression results
remain separate from this targeted proof.

The owner matrix passed **26/26** in 164058.154625ms (session 14784, exit 0;
`local-history:unknown-knowledge-split-stage2-owner-final.log`). It covers actual
SHA-1/root and SHA-256/nested positive/zero execution, retained and fresh evidence,
runtime/policy/profile correspondence, altered raw evidence, resealed report
mismatches, final cleanup and a real value-check failure despite owner success.
The first value-negative fixture also failed owner structural validation; the
fixture was corrected to an actual enumerates/source mismatch before claiming
coverage of the independent value-check boundary.

Main's shared regression passed **152/152** in 87825.6425ms (session 46116,
exit 0; `local-history:unknown-knowledge-split-worker-integration.log`), using
Node 24.19.0 with `/usr/bin` first on PATH and test concurrency 4:

```sh
node --test --test-concurrency=4 \
  tests/prepared-subject-split.test.js \
  tests/prepared-subject-split-review.test.js \
  tests/prepared-subject-split-candidate-cap.test.js \
  tests/prepared-subject-lifecycle-input.test.js \
  tests/prepared-assignment-event.test.js \
  tests/prepared-runtime.test.js \
  tests/prepared-validation-policy.test.js \
  tests/prepared-engine-process.test.js \
  tests/prepared-evidence-readback.test.js \
  tests/runtime-capability.test.js \
  tests/prepared-validation.test.js \
  tests/prepared-retirement-validation.test.js \
  tests/final-prepared-subject-retirement.test.js \
  tests/final-prepared-equivalent-merge.test.js
```

All 16 changed/new runtime and test hashes matched the frozen start snapshot
after that run (`unknown-knowledge-split-worker-frozen-snapshot.json`). Lint
checked 542 files with zero failures. A6 initially refused the old exact worker
allowlist pins; main added only the fixed split entries in three literal pins.
The updated script passes syntax checking and automated A1–A4/A6 pass (session
41070, exit 0; `unknown-knowledge-split-worker-acceptance-green.log`); A5 remains
manual. Earlier failed acceptance evidence is retained. Existing publication
policy objects and the shared envelope version compare equal to HEAD after
removing the new split policy object. No full-suite or whole-goal acceptance
claim replaces the earlier pinned receipts.

Independent parent review passed **26/26** in 176953.169416ms (session 22742,
exit 0; `local-history:unknown-knowledge-split-parent-independent-green.log`).
Its unchanged test file covers actual physical cap/mode/symlink/growth refusal,
zero-event absence, exact failed-owner diagnostics, contradictory execution and
positive/zero cleanup with intact retained evidence. The preceding complete
run passed 23/26 and exposed two defects (plus the enclosing failed test): null
check-row inspection and replacement of verified stream bytes on a second read.
Both were corrected narrowly and verified by the same tests. Earlier test-harness
interception recursion was corrected separately and is not product-defect evidence.
Owner, independent, depth and shared runs are separate receipts, not one combined
run. All are complete; no runtime or test edits remained pending at reconciliation.

Final structural/value validation has no findings and the two expected missing
K/O store warnings. Reverse attribution covers all 26 changed/new paths with no
live K/O matches. All 155 local links across eight changed Markdown files
resolve. The PR guard confirms rc.1→rc.2 with package and both lockfile versions
aligned. Coverage, attribution, validation and version logs use the
`local-history:unknown-knowledge-split-worker-` prefix. The exact acceptance
allowlist update is repository-only and does not change runtime approval policy.

The final coverage audit added one previously promised all-empty replacement
case. It passed **1/1** in 12185.259708ms (session 44760, exit 0;
`local-history:unknown-knowledge-split-stage2-all-empty.log`) using
`--test-name-pattern='^positive split with all-empty replacement subsets still requires an assignment event$'`
against `tests/final-prepared-subject-split.test.js`. Actual affected owners still
require a nonempty assignment event, while unrelated subjects remain intact;
runner, retention and fresh final verification all pass. This test-only addition
followed the 26-test owner run; no single 27-test run is claimed. Runtime and
shared fixtures were unchanged.

## Split review and publication

The [publication Decision](../decisions/entries/ucs-1240-split-publication.yaml)
records the fixed adapter and independent evidence responsibilities. The
[review/publication guide](agents/ucs-1240-split-review-publication.md) describes
the four actual authority captures, fifth positive-use event capture, one fresh
local allowance and single native allocation comparison. Current authorizer
semantics and declared historical Decision provenance are checked by the actual
fresh owner at both review and publication. Source-less tuples stay source-less.
The original owner counters, shared review envelope and atomic ref transaction
are unchanged. All publication tests use disposable repositories and synthetic
test authorization; no actual operator approval or customer publication follows.

| Surface | Disposition |
| --- | --- |
| Decision and catalog | Extend the existing proposal's rationale; its identity/title and exact catalog row remain unchanged. No canonical approval is invented. |
| README and changelog | Describe the internal review/publication profile and link its boundaries; remove superseded unfinished claims from current release notes. |
| Domain and implementation guides | Update split design, governance, transport, worker, prepared-validation, candidate-review, final-publication and owner coverage links together. Earlier receipts keep their original scope. |
| Root and installed AGENTS, CONTEXT, wrappers and other READMEs | Existing decision capture, navigation, version and documentation obligations remain applicable. No new installed authoring workflow changes their instructions. |
| API/CLI/MCP, schemas, policy and manifest | New fixed internal adapter only. No public command, envelope/schema, policy descriptor or payload allowlist change; the engine directory already includes the module. P11 remains separate. |
| Contributor, publishing, migration and acceptance guides | PR/release/migration procedures remain unchanged. Tests exercise temporary candidate refs; no new operational qualification or full-suite result is claimed. |
| Package and lockfile | All three versions remain `3.0.0-rc.2`, Unreleased, within the same pending PR. Every actual PR must advance its current target base and include versioned notes. |

Independent publication verification passed **12/12** in 317706.151625ms
(session 45370, exit 0; `local-history:unknown-knowledge-split-publication-independent-first.log`).
All four SHA-1/root and SHA-256/nested positive/zero cases establish actual
publication before checking altered integrity-valid receipts, exact source/output
CAS refusals and declared historical Decision source loss after review. Both
review and publication refuse that source loss at the fresh gate; restoring it
allows publication, with source/index/worktree preserved. The same-tree case
tests source-ref commit binding, not a resealed original-input attack. The initial
actual RED was missing split review admission: **0/1**, 10887.260875ms, session
12322, exit 1 (`unknown-knowledge-split-publication-independent-red.log`).

Shared legacy review/publication, atomic-ref transaction and PR-version
regression passed **40/40** in 374972.80925ms (session 63240, exit 0;
`local-history:unknown-knowledge-split-review-integration.log`). The three changed
runtime modules and these tests remained unchanged throughout, verified by
`local-history:unknown-knowledge-split-review-frozen.sha256`. Node 24.19.0 ran:

```sh
node --test --test-concurrency=4 tests/candidate-review.test.js \
  tests/assignment-candidate-review.test.js \
  tests/equivalent-merge-publication.test.js \
  tests/subject-retirement-publication.test.js \
  tests/ordinary-promotion-publication.test.js \
  tests/typed-promotion-publication.test.js \
  tests/migration-publication-vertical.test.js \
  tests/candidate-ref-transaction.test.js tests/check-pr-version.test.js
```

Lint checked **546 files with zero failures**. Structural/value checks have no
findings and the expected two missing K/O store warnings. Automated A1–A4/A6
passed (session 93752, exit 0); A5 remains manual. The version guard confirms
rc.1→rc.2 with package and both lockfile versions aligned. Reverse attribution
covers all 21 changed/new paths with no live K/O matches; all 271 local links
across 14 Markdown files resolve. These ancillary logs use the
`local-history:unknown-knowledge-split-review-` prefix. No new full-suite or broader
operational qualification is claimed.

Final owner verification passed **23/23** in 149830.379459ms (session 2171,
exit 0; `local-history:unknown-knowledge-split-review-owner-final.log`). It covers
all four format/branch controls, original-pair/source/allocation/mode/raw-tuple
checks, named local budget refusals and exact four/five-capture admission. Nine
mixed K/O/D owners with all-empty replacements and a source-less Decision pass
actual review and publication to the exact temporary candidate ref. The
[owner receipt](agents/ucs-1240-split-review-publication.md#validation-evidence)
records the command and test-only adversarial fixture corrections. These owner,
independent and shared results are separate runs; their earlier overlapping
receipts are not added. All sessions are closed and runtime/tests are frozen.

## Single-Subject creation allocation

The [reconsideration Decision](../decisions/entries/suppressed-subject-reconsideration.yaml)
and its exact catalog row record why a suppressed proposal needs an explicit
reviewed path through fresh canonical creation, with its original refusal retained.
The first implementation primitive is the [single-Subject allocation comparator](agents/ucs-1235-subject-creation-allocation.md).
It compares the full candidate ledger to the actual native one-ID plan, sharing
private mechanics with the unchanged fixed split contract. The standalone
comparator neither authenticates Git evidence nor implements reconsideration.

The Decision explicitly distinguishes captured material from a semantic novelty
verdict. Existing unchanged material may be newly considered under the reviewed
reason; no byte-inequality or renamed-path shortcut decides whether reconsideration
is justified. Exact history consumption, material/governance evaluation, actual
scope, retained workers and publication remain subsequent implementation stages.
Canonical suppression/restoration, union and broader acceptance remain required.

README, changelog, governance/accounting guides and the P2 audit link this boundary.
Root and installed AGENTS, CONTEXT, other READMEs, wrappers, public CLI/MCP,
schemas, contributor/release/migration guidance retain their existing contracts:
this is an internal primitive, with no new installed workflow or lifecycle
schema admission. Existing manifest engine-directory coverage includes the module.
The old split import path, counters and error semantics remain available. Prior
verification receipts stay tied to their original snapshots.

Package and both root lockfile versions remain `3.0.0-rc.2`, Unreleased, for the
same pending PR. Every actual PR still requires a version advance and updated
notes. This change does not imply a PR, release or customer publication.

The [focused primitive receipt](agents/ucs-1235-subject-creation-allocation.md#validation-evidence)
passed **42/42** in 8317.756958ms (session 18118, exit 0;
`local-history:unknown-knowledge-subject-creation-allocation-focused.log`) using
the new creation and unchanged split allocation test files. Literal ledgers cover
the real final free slot and full exhaustion, exact admission, nonreuse, unrelated
ledger changes and authentic allowance failures. The initial missing-module RED
was **0/1**, exit 1, 26.620208ms; the earlier 19-test run overlaps the final result.

The existing actual split-model tests passed **73/73** in 53692.910667ms
(session 97764, exit 0; `local-history:unknown-knowledge-creation-allocation-model-regression.log`)
using `node --test tests/subject-split-creation.test.js`. All four actual SHA-1/root
and SHA-256/nested positive/zero review cases passed **4/4** in 84179.911083ms
(session 10170, exit 0; `unknown-knowledge-creation-allocation-publication-regression.log`)
using `--test-name-pattern='^actual split review sha'` against
`tests/subject-split-review.test.js`. That run exercises prepared workers,
retention, fresh validation and review recording; it does not execute a new
candidate-ref publication. Both production file hashes remained unchanged.

Lint checked **548 files with zero failures**. Automated A1–A4/A6 passed
(session 91322, exit 0); A5 remains manual. Structural/value validation has no
findings and the two expected missing K/O store warnings. The version guard
confirms rc.1→rc.2 with package and both lock versions aligned. Ancillary logs
use the `local-history:unknown-knowledge-creation-allocation-` prefix. These are
scoped primitive/consumer results, not a new whole-suite or operational campaign.

Reverse attribution covers all 12 changed/new paths with no live K/O matches.
All 155 local links across seven changed Markdown files resolve. The Decision
has one exact catalog row, and both changed production file hashes stayed frozen
through consumer verification. All test sessions are closed.

## Suppressed-proposal reconsideration schema prerequisite

The [reconsideration Decision](../decisions/entries/suppressed-subject-reconsideration.yaml)
now records the closed schema and reader mapping alongside the fixed model
design. The [governance contract](agents/ucs-1235-subject-governance.md)
distinguishes syntax admission from evidence and history validation. Record
capture and original assessment scope definitions share supported root schema
references; the validator gains no new keywords. The reader's advertised
diagnostic set includes `invalid-reconsideration-evidence`.

Initial schema tests failed **2 of 3** on the two unknown fields, then passed
**18/18** after schema admission. A separate actual-reader regression reproduced
the missing advertised diagnostic (**18/19**, exit 1); the combined schema and
reader run then passed **31/31** in 369.904875ms. Existing reader, suppression
and ordinary promotion checks passed **35/35** in 190.924833ms at the initial
prerequisite snapshot. Logs are under `local-history:unknown-knowledge-reconsideration-`.
These overlapping focused runs do not establish complete reconsideration support.

Affected schema, reader, Decision, governance guide and changelog are updated
together. Root AGENTS, CONTRIBUTING and PR/CI rules already require decision
capture, documentation review and a version advance for every PR. Installed
agent instructions, other READMEs, wrappers and CLI examples introduce no
reconsideration authoring workflow from schema admission alone. The existing
manifest vendors the schema and engine directories. Package and both root
lockfile versions remain `3.0.0-rc.2` for this pending PR; the base comparison
confirms advancement from rc.1. Model validation, normal-consumer continuation,
actual source membership and retained publication require their own evidence.

## Suppressed-proposal reconsideration history/model integration

The [fixed model validator](agents/ucs-1235-subject-reconsideration-creation.md)
now implements exact suppression consumption, fresh native allocation, original
scope binding and per-event captured evidence under the
[recorded Decision](../decisions/entries/suppressed-subject-reconsideration.yaml).
Independent review led to actual regressions for unused evidence, logical
accounting and parent eligibility at activation time. An independently valid
but different original registry verifies that allocation proof cannot replace
raw before-model correspondence. Existing material may be reconsidered, and
missing unrelated historical evidence remains visibly unavailable rather than
becoming either universal approval or universal refusal.

The final owner run passed **51/51** in 8306.558208ms, session 36388, exit 0.
The guide preserves preceding failures, including a formatting regression that
was corrected before the final run. Main integration passed **368/368** in
44047.301042ms, session 88268, exit 0, using `node --test --test-concurrency=4`
over all three reconsideration test files plus activation, promotion, suppression,
governance/capture, history/inspection/incremental/topology, validation budgets,
authorizer reuse, registry reader, query-context input/loader, query files and
split history/creation. There were no skipped or cancelled tests. The eight
production/schema/fixture/test hashes in
`local-history:unknown-knowledge-reconsideration-frozen.json` remained unchanged.

Lint checked **553 files with zero failures** (session 79151, exit 0).
Automated A1–A4/A6 passed (session 73178, exit 0); A5 remains manual. Structural
and value checks have no findings, with the two expected absent K/O store
warnings. The version guard confirms rc.1→rc.2 and matching package/lock/changelog
versions. Logs use the `local-history:unknown-knowledge-reconsideration-` prefix.
This is focused integration evidence, not a new full-suite, publication or
operational qualification campaign.

The same 16-path change includes the existing Decision, schema/reader, root
README/changelog, owner guide, governance/accounting guide, P2 audit and this
coverage document. All 166 local links across seven Markdown files resolve;
reverse attribution found no live K/O matches. Existing
AGENTS, other READMEs, contributor/PR/version rules, manifest directory coverage,
public CLI/MCP and platform wrapper contracts retain their scope. Normal-consumer
evidence propagation, actual Git/affected-scope validation and retained publication
remain required next work. No package release or customer migration is implied.

## Reconsideration evidence in read-only consumers

The [consumer contract](agents/ucs-1237-reconsideration-consumers.md) now carries
retained material through the real context loader, bounded file-query API and
query/intent/view CLIs. Route/context views also accept original assessment pairs;
an actual promoted-Subject regression verifies that repaired omission. Tree mode
remains independent. The existing
[Decision](../decisions/entries/suppressed-subject-reconsideration.yaml) records
strict new-material admission, preserved context-attempt lifetime, raw metadata
accounting, omission behavior and unchanged per-record assignment requirements.

Query-owner verification passed **18/18** (5716.025917ms, session 56215, exit 0).
The final intent/view run passed **28/28**, including 17 new tests and 11 existing
intent-operation checks (7060.864417ms, session 76512, exit 0). Main's 26-file
integration passed **226/226** in 11692.91925ms (session 10815, exit 0), including
all new cases and legacy query/context, intent/view, budget and protocol/doc
checks. Nine production/helper/test hashes remained unchanged. The guide retains
initial REDs, actual lifetime/admission corrections and corrected test oracles;
passing overlapping runs are not summed as unique test counts.

Initialization-copy and wrapper tests passed **35/35**, 1893.776833ms, session
12154, exit 0. Lint checked **557 files with zero failures** (session 21046,
exit 0); automated A1–A4/A6 passed (session 8478, exit 0), with A5 still manual.
Structural/value validation has no findings and the expected two absent-store
warnings. The package, both root lock fields and changelog remain aligned at
`3.0.0-rc.2` for this pending PR; the integration-base version check confirms an
advance from rc.1. All logs/hashes use the
`local-history:unknown-knowledge-reconsideration-consumers-` prefix, except the
separately identified owner logs in the guide.

README, changelog, P2/P4/P5/P6 contracts and audits, operation accounting, P11's
interface preparation and this coverage record describe the updated inputs and
limits. Installed intent-retrieval and derived-layer protocols carry the actual
CLI flag guidance. Root and protocol AGENTS already route agents to those
contracts; thin platform wrappers, other README files, contributor/PR/version
rules and manifest directory entries need no changed instruction or path.
Record schemas and templates are unchanged: raw evidence remains a transport
input, not embedded registry bytes. Reverse attribution reports no live K/O
matches; the existing Decision retains one exact catalog row.
The final change covers 27 paths, including 17 Markdown files; all 271 local
documentation links resolve. The nine frozen implementation/test hashes match.

This verifies normal read-only retrieval, not assignment/lifecycle evidence
envelopes, actual Git/affected-scope validation, retained workers, publication,
supported MCP delivery or operational qualification. Those remain required
goal work; prior acceptance artifacts and runtime qualifications are preserved.

## Reconsideration actual-Git owner

The [fixed owner](agents/ucs-1235-reconsideration-git-core.md) now verifies
actual immutable before/candidate trees. The existing
[Decision](../decisions/entries/suppressed-subject-reconsideration.yaml) now
records supplied-capture provenance, explicit source-less correspondence,
file-level material claims, exact two-path preservation, all stored K/O/D owner
coverage and owned capture admission on one allowance. Missing unrelated history
is not silently repaired or globally approved. Existing assignments do not pass
to the fresh Subject through a parent or association.

README, changelog, model/consumer, governance, operation-budget and
decision/documentation guides link the implementation and its limits. Root and
installed AGENTS already require decision capture, affected-document review and
versioning; the internal contract adds no public command or authoring permission.
Other READMEs, record/event schemas, wrappers, manifests and pinned acceptance
artifacts need no changed instruction: this adds two internal modules under
the already copied/distributed engine directory. Installation tests verify their
delivery through that existing directory policy.

The package and both root lockfile fields remain `3.0.0-rc.2` for the same pending
PR; the version check against `fc3033a54136c196c291896828854df9598ef7bc`
confirms rc.1→rc.2 and matching changelog. The revised proposed Decision retains
one exact catalog row. Structural and value checks found no findings and the
two expected absent-store warnings. These are documentation/store checks;
implementation evidence is recorded separately below.

Final owner verification passed **39/39** (48059.205042ms, session 56817, exit 0),
and independent provenance verification passed **12/12** (26598.185375ms,
session 55481, exit 0). Main's 14-file integration passed **253/253** in
78433.808792ms (session 95492, exit 0), covering both new suites and existing
history/model/schema/query, native allocation, identity, capture, snapshot,
inventory, value and budget behavior. Five implementation/helper/test hashes
were pinned before the run and remained unchanged. The guide preserves actual
REDs, fixture-only corrections and the limitations of overlapping test totals.

Installation copy/wrapper checks passed **35/35**, 2614.755042ms, session 80354,
exit 0. Lint checked **562 files with zero failures** (session 96632, exit 0).
Automated A1–A4/A6 passed (session 25801, exit 0); A5 remains manual. Main logs
and frozen hashes use `local-history:unknown-knowledge-reconsideration-git-core-`.
No full-suite, actual publication, supported MCP or operational qualification
claim follows from these checks.

The final change covers 15 paths, including nine Markdown files. All 193 local
documentation links resolve; reverse attribution reports no live K/O matches.
The existing Decision still has one exact catalog row. All five frozen
implementation/helper/test hashes remain unchanged after integration and the
ancillary checks. Version, validator, attribution and documentation-coverage
receipts use the same main log prefix.

The continuation inventory separately identifies the first ordinary record
assignment, later lifecycle admission/model paths, retained workers and final
review as required evidence-propagation work. Existing ordinary assignment
limits do not bound the new governance phases; the exact opt-in budget/input
contract is now agreed in the [continuation guide](agents/ucs-1241-assignment-continuation.md)
and its [existing Decision](../decisions/entries/assignment-snapshot-preservation.yaml).
Implementation and complete retained-publication verification remain pending.
No forwarding-only patch, invented assignment
CLI or reset of the query loader's one-context lifetime is authorized by this
inventory. Full P1–P11 completion remains unproven.

## Current continuation and gate contracts

The ordinary assignment and reconsideration owners agreed their shared capture
admission boundary before dependent changes. Ordinary continuation reuses one
owned evidence bundle and one governance allowance across actual assignment
snapshots; reconsideration impact checks use separately owned before/after query
operations after the core proof. Their reports must expose those different
accounting scopes. Existing model and input behavior is characterized before
extracting common mechanics. Neither contract establishes finished delivery.

The [reconsideration gate contract](agents/ucs-1235-reconsideration-gate.md) and
its Decision also record conservative aggregate reservation for
additional native refusal qualification. Reserved capacity is distinct from
reported usage; missing usage is not recorded as zero. These choices preserve
honest reporting when native preparation refuses without returning usage.

Current documentation changes cover both existing Decisions, the new ordinary
continuation and reconsideration gate guides, prepared-assignment guide, root README, changelog and this
coverage record. Their existing catalog rows retain exact IDs and titles. Root
AGENTS, CONTRIBUTING, PR template and CI already enforce the user's decision,
documentation and per-PR version requirements. Installed instructions, remaining
READMEs, schemas, manifests, public CLI/MCP examples and frozen acceptance
artifacts gain no new workflow from a design contract. They must be reviewed
again as implementation stages land. Package and both root lock versions remain
`3.0.0-rc.2` for the same pending PR; this is not a separate release.

Contract checkpoint verification found 126 resolvable local links across the
six changed/new Markdown files and one exact catalog row for each of the two
updated Decisions. Structural/value validation found no findings, with the two
expected absent K/O store warnings. Reverse attribution covered all eight
documentation/Decision paths with no live K/O matches. The exact integration-base
version check confirms rc.1 to rc.2 and aligned lockfile/changelog versions.
These checks verify the documentation checkpoint, not the ongoing runtime work.

## Shared owned-capture admission prerequisite

The [ordinary continuation guide](agents/ucs-1241-assignment-continuation.md#shared-capture-prerequisite-verification)
records the completed capture extraction and its exact verification snapshot.
Reconsideration uses the shared raw mechanics without changing public inputs,
diagnostics, phases or counters. The new fixed ordinary raw/wire helpers do not
establish complete ordinary assignment support. Independent review reproduced
and corrected a large admitted base64 input exhausting the native regexp stack;
the Decision records the linear-scan choice and the guide retains the failure.

Independent isolated verification passed 60/60 core, provenance and admission
tests, followed by 35/35 installation/wrapper tests and lint across 564 files.
The snapshot contains the committed contract checkpoint plus only the three
frozen extraction files; concurrent ordinary and reconsideration gate work is
excluded from that receipt. Relevant capture/governance-budget, core and
continuation guides, the existing assignment Decision, changelog and this
coverage record are updated together. README already links the continuation
guide and correctly identifies worker/publication implementation as pending.

Root/installed AGENTS, other README files, contributor/PR/version rules, schemas,
CLI/MCP examples and wrappers require no changed instruction for this internal
extraction. The manifest already copies the engine directory; installation
tests cover that delivery. Frozen historical evidence is unchanged. This remains
within the same pending rc.2 PR; full lifecycle and P1–P11 delivery remain open.

Automated A1–A4/A6 acceptance passed after initializing the disposable archive's
Git index; the initial missing-repository setup failure is preserved in the
guide. A5 remains manual. Structural/value and integration-base version checks
pass. All 103 local links in the five changed Markdown files resolve, the
updated Decision retains its one exact catalog row, and all three source/test
hashes match both the isolated tested copy and integration worktree. These
receipts do not cover concurrent uncommitted gate/continuation implementations.

## Prepared reconsideration impact gate

The [fixed gate](agents/ucs-1235-reconsideration-gate.md) now composes the actual
core with separately bounded fresh before/after contexts and mandatory reach,
whole-registry tree and finite native replay checks. Its existing
[Decision](../decisions/entries/suppressed-subject-reconsideration.yaml) records
attempted-query retention, missing-usage distinctions, qualification reservations
and original availability parity. The public core and legacy replay entrypoints
retain their contracts. Fresh creation remains eventless and assigns no records.

Final owner verification passed **59/59** in 32765.647167ms (session 82141,
exit 0), with all 17 owner hashes unchanged. Main independently verified an
isolated archive of `ebdb4cca2722fb9b62e7c8356cf377e053b80816` plus exactly six
production and eight new fixture/test files. Its 20-file run passed **242/242**
in 83776.976125ms (session 60149, exit 0). It includes existing core, provenance,
model/history/schema/query, governance/budget and replay regressions and the
independent gate matrix. The guide preserves the independent initial 11/12
result and corrected cleanup diagnostic expectation; no runtime change was
needed for that test correction. Overlapping results are not unique-test totals.

Installation-copy/wrapper tests passed **35/35** in 2578.184667ms (session 70058,
exit 0). Lint checked **575 files with no failures** (session 91510, exit 0).
Automated A1–A4/A6 passed (session 92561, exit 0); A5 remains manual. Main logs
and frozen hashes use `local-history:unknown-knowledge-reconsideration-gate-`.
The isolated snapshot excludes concurrent ordinary-assignment implementation and
its later pure-base64 factoring; subsequent combined/retained verification must
pin that full actual runtime separately.

The same change updates the Decision, gate/core/accounting guides, P2 audit,
README, changelog and this coverage record. Root/installed AGENTS, other README
files, contributor/version rules, wrappers, schemas and CLI/MCP examples gain
no new installed workflow from this internal gate. Existing manifest directory
coverage includes the modules and is checked by installation tests. Retained
execution, route capability, final review/publication, broader lifecycle and
operational acceptance remain open. Package and both root lock versions remain
rc.2 Unreleased within the same pending PR; no separate PR or release is implied.

Final gate integration documentation checks resolve all 185 local links across
seven changed Markdown files. The reconsideration Decision has one exact catalog
row. All fourteen overlaid production/helper/test hashes still match both the
tested isolated copy and the integration worktree. Structural/value validation
has no findings, with the expected two absent-store warnings; the exact base
version guard confirms rc.1 to rc.2 and matching package/lock/changelog versions.


## Ordinary assignment evidence continuation

The [implemented continuation](agents/ucs-1241-assignment-continuation.md) carries
assessment/material evidence through actual staged/prepared assignment owners,
both fixed wire workers, retained readback and fresh review/publication. The
[existing snapshot Decision](../decisions/entries/assignment-snapshot-preservation.yaml)
records the optional-field/report-version choice, single owned admission,
source correspondence, native-loading exclusions, all-exits usage refresh,
null-prototype metadata preservation and retained-predicate/fresh-proof distinction.
Its title, proposed identity and single exact catalog row remain unchanged.

| Surface reviewed | Action and applicability |
| --- | --- |
| Root README and CHANGELOG | Describe delivered internal ordinary continuation, preserving typed retained and later lifecycle limits. |
| Assignment staged/prepared/typed guides and P8 audit | Explain optional input, independent event/report versions, actual source checks, one allowance, unknown-field rejection and existing cleanup behavior. |
| Prepared validation, final publication and P7 audit | Explain fixed wire workers, bounded retained operation output, original-input predicate, fresh measured work and whole final-result comparison before unchanged CAS. |
| Continuation and operation-budget guides | Record APIs, raw/wire ownership, historical/current paired-source rules, actual charged work versus native exclusions and exact verification receipts. |
| Root AGENTS, CONTRIBUTING, PR template and version CI | Existing decision/catalog, every-PR version and affected-file review instructions still apply; no instruction change needed. |
| Installed README, protocol AGENTS/skills and platform wrappers | No new public CLI/MCP command, option or authoring workflow; existing instructions remain applicable. This internal export does not complete P11 delivery. |
| Schemas, CONTEXT, manifests and payload package | No stored schema, identity/Subject meaning or payload shape change. Existing engine directory allowlist includes the new modules; installation tests verify copying. |
| Publishing/migration and acceptance guides | No npm release, migration procedure or operational qualification change. Historical receipts remain pinned; the new scoped receipt is recorded here and in the continuation guide. |

Independent isolated integration passed **215/215** in 266107.433875ms, with no
skips/cancellations; installation tests passed **35/35**, lint checked **585 files
with zero failures**, and automated A1–A4/A6 passed. A5 remains manual. Structural
and value validators returned zero findings, with the expected two absent K/O
store warnings. The version guard passed exact base
`fc3033a54136c196c291896828854df9598ef7bc`: rc.1 to **3.0.0-rc.2**, both root lock
fields aligned and changelog updated. This internal commit opens no PR; the
pending PR shares rc.2, and every subsequent actual PR must advance its own base.

The owner 147/150 run and test-only corrected 3/3 receipt remain separately
recorded; main's 215/215 used the corrected tests. Runtime and overlay hashes are
checked against the frozen archive, not inferred from a green result. Logs use
`local-history:unknown-knowledge-assignment-continuation-`. Actual fixture
publication is not customer publication, runtime approval or a tag/release.
Typed retained assignment publication, later lifecycle/typed-promotion evidence
propagation, reconsideration publication, canonical suppression/restoration,
union/broadening and remaining P10/P11 qualification stay open.


Final attribution covered all **31** changed paths and found no mapped K/O entries.
The Decision has one exact catalog row. All **259** local links across twelve
changed Markdown files resolve. All **298** runtime and **18** overlay hashes
matched both the workspace and isolated archive after the 215-test run.

## Reconsideration publication contract agreement

After ordinary integration `81520d1`, the implementation and independent test
owners agreed the [next publication contract](agents/ucs-1240-reconsideration-publication.md).
The existing reconsideration Decision now records the fixed wire/capture/worker/
review choices and their limits before dependent code. The gate guide, README
and changelog link the contract explicitly as unimplemented. No schema, command,
wrapper, root AGENTS instruction or release workflow changes in this design-only
step. Existing per-PR version requirements still apply; this internal commit
shares pending rc.2. Prior implementation receipts do not verify this new scope.


Contract-only verification covered six documentation/Decision paths, one exact
catalog row and **130** local links across five Markdown files. Structural/value
validators returned no findings and attribution found no mapped K/O records.
The exact-base rc.1-to-rc.2 guard passed. No new runtime test receipt is claimed
for this contract; the ordinary 215-test integration remains scoped to 81520d1.


## Earlier reconsideration guide status reconciliation

A subsequent source audit found stale current-status sentences in the original
model/core/consumer and P2 audit guides. They described ordinary assignment and
impact composition as pending after those implementations had landed. Those four
guides now link the implemented contracts and distinguish later lifecycle/
typed-promotion propagation from reconsideration's own pending publication.
Historical verification sections and receipts remain unchanged. README already
states current delivery; root/installed AGENTS, schemas, wrappers and public
commands do not change. This correction makes no new domain-policy decision.

The audit also ran narrow current-source probes at `5fcdbf1`: literal existing
merge/retirement/split admission controls pass, but an added empty material array
refuses; an actual two-commit inventory preserves incomplete unknown-assignment
coverage and rejects the same unsupported field. Ordinary activation does not
consume that unsupported property. These observations identify future work;
they do not establish a publication bypass or complete later lifecycle tests.
Probe scripts/results remain under `local-history:unknown-knowledge-lifecycle-continuation-probe.*`
and `local-history:unknown-knowledge-subject-inventory-material-probe.*`. The
external follow-up inventory records source hashes and scope separately from
prior implementation receipts. No runtime file was edited for these probes.


This documentation correction verifies all **150** local links across its six
Markdown files and attributes all six paths, with no mapped K/O records. The
exact-base package/lock/changelog version guard passes rc.1 to rc.2. Existing
Decisions/catalog and stored schemas are unchanged; no new runtime test receipt
is claimed for a current-status correction.

## Reconsideration retained publication integration

The [publication profile](agents/ucs-1240-reconsideration-publication.md) now
implements fixed wire admission, prepared/final workers, eventless retained
authority capture, independent actual-Git review and fresh final verification
before the existing ref transaction. The
[existing Decision](../decisions/entries/suppressed-subject-reconsideration.yaml)
records implementation and malformed replay-row refusal without changing its
proposed identity, title or catalog membership. Twenty runtime files and seven
test/helper files implement and verify this increment.

| Surface reviewed | Action and applicability |
| --- | --- |
| README and CHANGELOG | Describe implemented internal reconsideration publication and preserve remaining lifecycle/interface scope. |
| Reconsideration model, core, gate, consumer and publication guides | Replace stale current-status statements, document fixed worker/review contracts and record scoped verification. Historical receipts remain unchanged. |
| Prepared validation and final publication guides | Describe two authority artifacts, no assignment event, diagnostic-only failed owners, full Decision tuple and mandatory fresh verification. |
| Root/installed AGENTS, other READMEs, protocol skills and wrappers | Existing decision, per-PR versioning and human-gated store guidance remains applicable. This internal profile adds no public command or authoring workflow. |
| Policy, schemas, manifests and CONTEXT | The publication policy gains the fixed reconsideration profile. Stored schemas and terminology are unchanged; the existing engine-directory manifest includes all five new runtime modules. |
| API/MCP/CLI and migration/publishing instructions | No public mutation binding, migration, runtime approval or release is introduced. Existing nine read-only interface operations retain their scope. |
| Acceptance evidence | New receipts below cover this implementation. Earlier pinned evaluation results are unchanged and do not qualify new behavior or production capacities. |

The owner four-file suite passed **48/48** in **221469.038917 ms**; the
independent two-file runtime/publication suite passed **36/36** in
**278643.41775 ms**. Both ran against frozen runtime bytes and retained their
own commands, logs and after-run hash checks. Their coverage includes actual
SHA-1/root and SHA-256/nested publication, source loss after review, malformed
reports, bounded artifacts, cleanup and stale-ref refusal.

Independent generic regression verification passed **72/72** in
**536487.584041 ms** with Node 24.19.0, using `--test-concurrency=2` on fourteen
existing prepared-policy, process, runtime, validation, readback, capability,
review/publication, assignment-continuation, split/retirement and final-gate test
files. The tested archive starts at `68e987a` with the 27 runtime/test overlays;
all 307 distribution-source and 27 overlay hashes match both the archive and
integration worktree. The log and manifest are
`local-history:unknown-knowledge-reconsideration-generic-integration.log` and
`local-history:unknown-knowledge-reconsideration-generic-integration.json`.
These are scoped feature/regression receipts, not whole-goal acceptance.

Lint checked **605 files with zero failures**. Structural/value validators
reported zero findings; the two absent K/O store warnings are expected in the
kit repository. The exact-base version guard confirms **3.0.0-rc.1 to
3.0.0-rc.2**, with package, both root lock fields and changelog aligned. This
increment shares the pending PR version; each later actual PR must advance its
own base. No PR, tag, package release or customer publication is implied.

Final documentation checks resolved **193 local links across ten changed
Markdown files** and confirmed one exact reconsideration catalog row. Staged
attribution completed successfully with no mapped K/O records; the final diff
has no whitespace errors. Attribution's expected absent-store warnings do not
establish client-store coverage.

## Shared record preflight and next lifecycle contract

The [interface Decision](../decisions/entries/ucs-1244-first-interface-contract-proposal.yaml)
records the agreed `record.preflight` binding. It calls the existing native
Ontology/Knowledge owner once, preserves payloads and conduct, and disables
logging. Both arrays and a date/null are explicit; guarded dense string arrays
are normalized using the existing function. Absent IDs refuse without invented
verdicts; existing unverified proposals preserve unknown reports. Shared CLI/MCP
success requires `data.ok: true`, while the specialized CLI keeps its old exits.

README, changelog, installed protocol AGENTS and the interface guide describe ten
read-only operations and the new preflight conduct. The P11 guide records scope
and evidence. Root AGENTS, contributor/version rules and wrappers already direct
agents to the canonical protocol; no new instruction or command is required.
Existing manifest entries copy the edited guides and engine directory. Package
bins, dependencies, stored schemas, identity semantics, CONTEXT's eighteen CLI
surfaces and migration/release instructions are unchanged. The operation is
available through existing executables, not a nineteenth CLI surface.

Isolated verification passed **71/71** in **6263.81275 ms**, covering all three
interface test files, native preflight and module-load behavior. The baseline is
`293d043` with eight named main-owned overlays; concurrent lifecycle source
changes are excluded. Tests exercise actual disk fixtures, preserved native
findings/refusals, date and own-data admission, a copied engine with only js-yaml,
request-file exit mapping, and the official SDK's real stdio client. P2 reviewed
both runtime changes without an actionable finding. Receipt paths and development
failures are indexed in the [P11 guide](agents/ucs-1244-interface-preparation.md).

Separately, the implementation and review owners agreed the
[lifecycle material contract](agents/lifecycle-material-continuation.md) before
dependent code. Its choices are appended to the existing reconsideration
Decision and linked from the consumer guide. It specifies one owned evidence
admission, internal inventory accounting and complete retirement/merge/split/
typed-promotion delivery. This contract is not an implementation receipt;
standalone material inventory and the other named remaining operations stay open.
The first actual retirement RED passed reconsideration, then refused unsupported
material input (0/1, 3180.21525 ms); runtime changes are a separate increment.
All these internal increments share pending **3.0.0-rc.2**. Every actual PR must
still advance its target base, both root lock fields and versioned changelog.

The isolated lint run checked **606 files with zero failures**. All eight tested
overlay hashes match both the archive and current files. Documentation checks
resolve **156 local links across eight Markdown files**, and both edited
Decisions retain one exact catalog row. Structural validation reports zero
findings with the expected two absent-store warnings; the exact-base version
guard confirms rc.1 to rc.2 with aligned manifests/changelog.

## Retirement material continuation

The [continued lifecycle contract](agents/lifecycle-material-continuation.md)
now has a complete retirement implementation: one owned raw/wire admission,
actual supplied-source correspondence, governed context/inventory and withdrawal
rows, retained prepared/final workers, review and the existing ref transaction.
The reconsideration Decision records this follow-through and admission ordering.
The original no-material path and standalone inventory contract remain intact;
merge/split, typed promotion and standalone material inventory remain required.

| Surface reviewed | Action and applicability |
| --- | --- |
| README and CHANGELOG | Link and describe retirement evidence continuation without advertising a new public mutation command. |
| Lifecycle, retirement input/final and reconsideration model/consumer guides | Explain material selection, report version, actual provenance, retained/fresh proof and remaining operation scope. |
| Use inventory and operation-budget guides | Distinguish internal continued inventory from standalone support; record shared actual work and existing exclusions. |
| Decisions and catalog | Append to the existing reconsideration Decision; preserve identity/title and exact catalog membership. |
| Root/installed AGENTS, other READMEs, protocol, wrappers and public API/CLI/MCP | Existing human-gate, conduct and per-PR documentation instructions apply. No public operation or executable was added; the shared interface remains ten read-only operations. |
| Schemas, manifests, package/dependencies and CONTEXT | No stored format, policy version, dependency or command-count change. The existing engine-directory allowlist covers the one new lifecycle context module. |
| Migration, publishing and acceptance | No customer migration, runtime approval, release or scale claim. Frozen earlier evidence remains unchanged. |

The owner final suite passed **8/8** in **74677.960875 ms**. The independent
frozen suite passed **24/24** in **394935.012292 ms**, covering actual
SHA-1/root and SHA-256/nested zero/positive raw and publication paths, historical
source loss after review, restored publication, ref drift and preservation of
index/worktree. The owner's eight and independent twenty-four are separate
receipts; the earlier raw twelve are included in the latter and are not another
independent full suite. All 321 captured runtime/dependency files, native
executables and owned test/helper hashes matched after those runs.

The isolated generic checkpoint uses `dd92900` plus exactly seventeen changed
runtime/test files. All 321 source and seventeen overlay hashes match both
archive and worktree. Its seventeen existing suites passed **275/275** in
**574328.395958 ms**, with no skips or cancellations. Lint on the
same isolated source checked **610 files with zero failures**. Receipt files
use `local-history:unknown-knowledge-retirement-material-`.

Separately, P10's read-only current-source audit and main/P2 review agreed only
preparation of the private-file-counts-v1 controller. The operational-qualification
Decision and acceptance index record that new profile, original fixtures/limits,
scoped count oracle, mandatory controller review and separate execution release.
No acceptance calls or historical threshold/result changes are claimed here.
Every actual PR still advances its base version; these internal increments share
pending **3.0.0-rc.2**, with both root lock fields and changelog aligned.

The final audit verifies **211 local links across eleven changed Markdown
files** and one exact catalog row for each edited Decision. Structural/value
validation reports zero findings, with the expected two absent-store warnings.
The exact-base version guard passes rc.1 to rc.2. Thirty changed paths travel
together; the staged diff has no whitespace errors. These internal test-fixture
publications are not customer publication, runtime approval or a package release.

## Resolver identity example correction

Three current comments in `payload/engine/commands/resolve.js` still used the old
Knowledge prefix or an old Ontology example. They now use `K-NNNNNN` and
`O-000101`, consistent with implemented identity semantics. This changes no
executable statement, schema, API, manifest or historical fixture and introduces
no new domain decision. The changelog records the correction; syntax and diff
checks pass. Existing README, AGENTS and interface instructions already use the
current conventions. This internal correction shares the pending PR version.

## Private-file retrieval experiment release

Current P2's bounded controller review found that a later output exception could
overwrite the original query failure. Preparation v2 preserves both, leaving
native execution and output accounting unchanged. Main independently inspected
the corrected controller and manifest, passed Node syntax and custody-only
verification, and released the four original untimed calls. The existing
operational-qualification Decision and acceptance index record the exact hashes
and separate release. The subsequent four calls completed natively with exact
counts and unchanged limits. `acceptance/retrieval/PRIVATE-FILE-COUNTS.md` records
all outcomes, actual API counters, receipt hashes and the two missing-rules
warnings that keep the frozen evaluator false. Main verified all 21 sealed
receipt hashes and both API/CLI byte comparisons; source review supports only
the documented lifecycle-membership interpretation. No product rerun, warning
suppression, timing claim or retrospective pass-criterion change was made.

The retrieval README links the new result report. Current P2 independently
concurred with the pinned-source warning interpretation. This changes no product
interface, schema, manifest, dependency, customer
workflow or installed agent instruction. Existing README/AGENTS descriptions and
the pending rc.2 version remain applicable; earlier frozen receipts remain
unchanged. Experiment authorization is separate from Decision publication and
from accepting the results.

## Merge/split material continuation

The implementation extends the existing reconsideration Decision and
`docs/agents/lifecycle-material-continuation.md`. Merge and split now retain
material evidence through fixed raw/wire admission, actual governance, assignment
checks and fresh review/publication. Native allocation and stored-event policies
remain unchanged. The Decision also records the demonstrated extra-capture
accounting correction and null-impact refusal guards. The owner suite passed
11/11; the independent suite subsequently passed 24/24 and the isolated generic
checkpoint passed 414/414 across 21 suites. The shared lifecycle guide records
the distinct receipts and their scope; none is relabeled as whole-goal acceptance.

| Surface | Update or reason existing content remains applicable |
| --- | --- |
| Root README and changelog | Link the shared lifecycle continuation and describe merge/split delivery. |
| Merge DTO and publication guides | Document material selection, outer report version 2, direct wire ownership and unchanged positive-use requirement. |
| Split design, gate, assignment, transport, validation and publication guides | Describe the same owned evidence/allowance, native allocation reuse, original-pair proof and mandatory fresh final checks. |
| Split replay guide | Its fixed recipe, policy and independent phase accounting are unchanged. The new continuation supplies actual contexts through its existing owner. |
| Decisions and catalog | Append implementation/accounting choices to the existing reconsideration Decision. Its identity, title and exact catalog row stay unchanged. |
| Root AGENTS, installed README/protocol, wrappers, API/MCP/CLI guide | Root AGENTS now requires synchronizing exact dispatch acceptance allowlists when worker entrypoints change. No new public operation or authoring workflow; installed instructions remain applicable and the shared interface still exposes ten read-only operations. |
| Schemas, manifests, package/lock, CONTEXT and publishing | No stored format, dependency, command count or distribution layout change. Existing engine files are updated; the pending rc.2 PR version still applies. No runtime approval or customer/package publication. |
| Migration and prior acceptance | Preserve frozen historical receipts. Optional-store migration proceeds in a separate checkout; this lifecycle slice does not claim its completion. |

Separately, main/P2 agreed preparation of the next results-mode experiment.
The operational Decision records its unchanged limits, predicted explanation
exhaustion, independent witness expectations and separate execution-release
requirement. The prediction is not a runtime result and cannot close Knowledge
or Ontology witness coverage. Earlier counts results and warnings remain intact.

The isolated migration run also exposed an existing A6 acceptance failure at
`c7b055a`: the exact trusted-worker patterns omitted the implemented prepared
and final reconsideration workers. Main verified identical bytes in the guard
and both dispatch modules, then added only those literal names and fixed paths
to `acceptance/run.js`. Runtime execution is unchanged. The reconsideration
Decision and changelog record the correction; the updated driver passes syntax
validation. The fresh run passed all asserted repository criteria A1–A4 and A6
(including 12/12 A6 checks), with exit 0. A5 remains manual; these older criteria
do not replace the spec's A–H acceptance gates. The log is
`local-history:unknown-knowledge-merge-split-material-acceptance.log`.
This test-harness correction does not change installed agent instructions or
weaken the fixed-entrypoint rule.
Root AGENTS records the concrete maintenance step that was missed: keep the exact
dispatch allowlists synchronized and run repository acceptance when entrypoints
change. No additional approval flow or runtime privilege is introduced.

Post-run verification found no changes across all 321 runtime/dependency files,
25 owner overlays, 21 generic test files and both executables in main and the
isolated checkpoint. The independent review additionally verified both complete
operation manifests and its eight test/helper dependencies. Generic test output
has no failures, skips or cancellations; its log SHA-256 is
`b584ccc96706b1e145c0f0001036f43fa961979823b2a02da3eef7e95c274248`.
Isolated lint checked 615 files with zero failures; the separately changed
acceptance driver passed syntax and the actual acceptance run. Structural/value
checks report zero findings, with only the two expected absent-store warnings.
The existing exact-base PR version check remains rc.1 to rc.2.

## Results-mode witness and withholding evidence

The operational Decision now records actual results-controller review and
execution release, followed by four observed calls. The new
`acceptance/retrieval/PRIVATE-FILE-RESULTS.md` report and retrieval README/index
describe the verified five-Decision witness scope, exact retained warnings,
original limits and incomplete K/O pages. Main independently verified all 21
sealed receipt hashes and byte-identical API/CLI output. The changelog records
this evidence without claiming full acceptance or changing old receipts.

There is no product code, output format, dependency, schema, manifest or installed
workflow change in this evidence increment. Existing root/installed AGENTS and
interface instructions remain applicable. The pending rc.2 PR version is shared
with the implementation work; no customer publication or package release occurs.

## Optional-store migration integration

The optional-store change from `286a6a8` is integrated over `7b27478` for supported
Node verification. The existing finite-migration Decision retains its exact
catalog row. Publication policy v4, semantic report v3 and recipe v2 extend the
same proof to actual optional stores; absence and empty presence remain distinct.
The existing recipe-v1 export and historical runtime retain their contracts.

README, the rc.2 migration guide, final migration/review/publication guides,
historical-runtime navigation, the source-profile inventory and changelog now
describe this scope. The owner audit preserves the preliminary Node 20 results
and the separate historical A6 failure. All nine migration files passed on the
combined isolated source under explicit Node 24.19.0: 42/42 tests, no skips or
cancellations, in 170577.088667 ms. Post-run verification matched all 1,817
captured files and both Node/Git executables. The log is
`local-history:unknown-knowledge-optional-stores-integration.log`, SHA-256
`1d6a1113461f09b7c328ffd6d1db17825becbc0cbc929d4c71d639f6f40b88ab`.
The sibling JSON manifest records base `7b27478`, all fourteen integrated owner
paths, exact command and source hashes; `-result.json` records terminal exit 0.
This is new supported-runtime proof, not a relabeling of the Node 20 results.
Lint checked 619 files with zero failures. Structural/value validation found no
findings and only the two expected absent-store warnings. The exact-base version
guard confirms rc.1 to rc.2 with matching package, lockfile and changelog fields.

No command, stored schema, dependency, fixed worker entrypoint, wrapper or public
API/MCP operation was added. Existing directory manifests and root/installed
AGENTS remain applicable. Package and both root lock fields remain at the pending
PR's `3.0.0-rc.2`; internal integration does not create another PR or release.
Activated-consumer completeness and nonempty rules remain explicit open work in
the source-profile guide.

The operational Decision separately records main/P4 agreement to implement the
lossless query-output contract in an isolated checkout. That work must update
its consumers, tests and documentation together; this integration does not yet
contain or qualify the proposed output format.

The migration guide also scopes its earlier rc.1 rollback advice explicitly.
Canonical cutover preserves new-system allocations during post-publication
repair and requires prior-format recovery environments to remain isolated.
This follows the existing permanent-identity and finite-migration Decisions;
it does not claim an installed-reader activation verifier is already delivered.

## Typed K/O/D material continuation integration

The existing reconsideration Decision records the same owned material admission,
actual source checks and governance allowance through K/O/D promotion and fresh
publication. Its exact catalog row is unchanged. It also records main/owner
agreement that r3 requires complete use accounting inside composed owners, not
an additional standalone inventory endpoint. Required remaining domain lifecycle
and existing-record assignment workflows remain open.

README, changelog, the shared lifecycle guide, typed gate design and final
publication guide link the new typed-material guide and distinguish omitted
report v2 from continued report v3. The scoped guide retains actual owner 10/10,
separate registry-absent publication 3/3, independent initial 18/27 and corrected
optional 9/9, and generic 148/148 receipts. Initial test failures remain visible;
no combined all-green independent run is invented. Generic source/dependency and
executable hashes remained unchanged after completion.

The eight existing runtime modules retain stored schema, native allocation,
genesis, preflight and policy contracts. No dependency, worker path, public
operation or distribution layout is added. Root/installed AGENTS, wrappers,
API/MCP documentation, CONTEXT and contributor/publishing procedures remain
applicable; the existing directory manifest ships the edits. The rc.2 version
continues to cover this pending PR. The separate migration-guide correction
clarifies canonical recovery without claiming activation proof is implemented.

On the combined integration source, lint checked 623 files with no failures;
structural/value validation reported no findings and only the two expected
absent-store warnings. Repository acceptance passed all asserted A1–A4/A6 checks
(12/12 A6); A5 remains manual and does not substitute for the spec's A–H matrix.
The exact-base version guard still verifies rc.1 to rc.2. Logs are
`local-history:unknown-knowledge-typed-material-lint.log` and
`local-history:unknown-knowledge-typed-material-acceptance.log`.

## Query-output and structural-tree interface integration

The lossless-query-output Decision adds one exact proposed catalog entry. It
records output-only sharing of complete Subject outcomes, atomic actual-node
accounting and per-operation output versions, while preserving validation and
numeric limits. The existing interface Decision records the eleven-operation
read-only adapter scope and native structural-tree preview contract. Neither
record is promoted or grants source/subject/runtime approval.

README, changelog, installed AGENTS, shared-interface/intent guides, query/budget/
view contracts and acceptance output-decoder guidance describe the new output.
Tree preview documentation distinguishes returned generated text from checking
or writing saved artifacts. The root AGENTS workflow, wrapper pointers, stored
schemas, manifests, dependencies, glossary command count and publishing/migration
procedures remain applicable. The same pending rc.2 PR version covers integration.

The tree owner passed 40/40 scoped native/API/CLI/official-SDK tests. Main's
combined tree/preflight check passed 21/21 in 2792.039792 ms on Node 24.19.0;
`local-history:unknown-knowledge-tree-interface-integration.log` retains the result.
The query owner passed 61/61 focused tests. Its original broader run completed
1,813 tests: 1,745 passed and 68 failed, all in retirement/split consumers that
still required the old closed refusal shape. The correction requires exact native
output version 2 while preserving every existing diagnostic/status condition.
That initial failure remains evidence. Corrected affected lifecycle suites passed
143/143 in 911322.944208 ms; a separate supplementary material run passed 14/14
in 98513.165958 ms. Both exited 0 and cover all fourteen originally failing files.
The exact seven correction files match the owner's final `bff12f5` commit;
the original failed broad run is not relabeled as green. Logs remain at
`local-history:ucs-1237-lossless-output-consumers.log` and
`local-history:ucs-1237-lossless-output-consumers-material.log`.
The independent combined interface checkpoint passed 109/112, with two
outdated crash-test assumptions and one missing-Git export prerequisite failure.
Main corrected the explicit-path command controls and shared-parser aliases;
the affected exit-code/core-interface checkpoint passed 14/14 in the Git checkout.
The interface guide preserves both receipts and exact limits. All 1815 source
and 1069 dependency files in the original frozen copy remained unchanged. No new
P10 workload, benchmark or reader outcome is claimed here.

Combined source lint checked 626 files with no failures. Structural/value
validation found no findings and only the two expected absent-store warnings;
repository acceptance passed asserted A1–A4/A6 checks (A6 12/12), with A5 manual.
The exact-base version guard verifies rc.1 to rc.2 with all three version fields
and the changelog aligned. All 267 checked local documentation links resolved
before the final receipt-only additions. Release-check logs use
`local-history:unknown-knowledge-query-tree-` and preserve their distinct scope.

The governance overview now links already integrated reconsideration publication
and material continuation instead of describing them as outstanding. Remaining
typed assignments and lifecycle variants remain explicitly unfinished.

## Prospective acceptance targets

Evaluation proposed and integration reviewed the complete target table before
the corresponding trials. `acceptance/retrieval/QUALITY-TARGETS.md` versions the
agreed hard gates, descriptive paired targets, exact metric denominators,
missing/completion accounting, sparse comparison arms and unchanged operation/
hardware limits. The existing operational Decision records this agreement;
its catalog identity and proposed status remain unchanged. Aggregate improvement
is not a new prerequisite, and adverse or inconclusive results require explicit
evidence and adjudication. Target selection is complete; trials are not.

Root/retrieval READMEs, the evidence index and changelog link the new contract.
The evaluator's original preparation and all historical studies stay unchanged.
No runtime behavior, schema, manifest, agent action, publication permission or
dependency changes for this documentation increment. The same pending rc.2 PR
version applies; no new reader or benchmark has been run.

## Existing-record typed assignment publication

The existing snapshot/preservation Decision records the agreed same-operation
extension: original retained selection chooses a fixed typed policy only after
canonical input and actual source/candidate/runtime/injected-input binding.
Workers preserve that selection, event-v2 scope, native per-store preservation
and optional continued evidence. The existing Knowledge policy object/digest
is unchanged. Typed replay uses every installed store and the native query
comparator, reserves its full finite inventory and confines membership changes
to actual changed assignment owners. No new worker dispatch or approval source
is introduced.

The scoped typed-publication guide retains actual REDs and separate final owner
12/12 and independent 13/13 receipts. Both used unchanged frozen source,
dependencies and executables. Main's combined checkpoint adds the integrated
query-v2 runtime and existing publication/continuation/replay/promotion regressions;
it finished with 125/126 passing in 779297.320083 ms, no source drift. The sole
failure was an older test requiring typed input to remain unsupported; the new
path instead reached that test's nonexistent evidence directory. The original
failed log remains `local-history:unknown-knowledge-typed-assignment-integration.log`
(SHA256 `87abe9429f14ca9217e9aee0db3ba009476a1c42aaa555de9b6aa01bd2d99450`).
The corrected boundary test passed 1/1 in 965.208167 ms against identical runtime
bytes. It tests actual early rejection of extra, empty and duplicate selection
metadata; existing real publication controls cover valid typed execution. Only
the changed assertion was rerun. The scoped guide preserves both failed attempts
and the focused correction, without claiming a repeated all-green batch.
The current implementation does not establish the
remaining zero-use merge, registry-transition, suppression/restoration, union or
complete acceptance requirements.

Root README/changelog, prepared and final publication guides, ordinary assignment
continuation, lifecycle continuation and the governance overview now link the
typed profile and remove obsolete unsupported claims. The existing Decision's
exact catalog row remains valid. Root/installed AGENTS, API/MCP guides, wrappers,
stored schemas, manifests and distribution layout need no change: this extends
internal domain publication and adds no public mutation operation. The existing
directory manifest includes the new binding module. Dependencies and the pending
PR's aligned rc.2 version are unchanged; no release or customer migration occurs.

## Observed native-v2 retrieval pages

The existing operational Decision now records the actual four-call results at
`79c3efc`: complete requested K/O/D pages and independently checked full expanded
witnesses under unchanged limits. The new
results report (contract arrives in PR7; see delivery availability) preserves
the difference between requested pages and all 21 matches per store, retained
warnings, exact hashes, point-in-time custody and unqualified broader claims.
Main rehashed all 21 sealed receipts and verified both transport byte comparisons.
No new product call, benchmark or reader ran during integration.

Root/retrieval READMEs, the evidence index, changelog and existing Decision are
updated together; historical reports remain unchanged. This documentation adds
no agent action, command, schema, dependency, manifest or installed workflow, so
AGENTS, wrappers and protocol instructions require no further change. The same
pending rc.2 PR version applies. Next varied-corpus preparation reuses reviewed
sources and requires one exact execution release after changed-code review.

## Supported seeded-installation cutover

The existing finite-migration Decision records complete committed-tree roles,
exact old/current distribution and consumer conversion, preserved provenance,
and separate read-only local activation. Integration imports owner commit
`9f1d8bb0a4f747a4c153295d58c414e0c41d3286` onto `a4ea5a4`, retaining both the
typed-assignment policy and the distinct installation policy in shared review.
No old policy is replaced and no public mutation adapter is introduced.

Owner evidence covers the connected retained/fresh/publication/activation path,
12/12 owned tests, 5/5 additional grammar refusals, 75/75 regression tests and
the separate corrected positive-environment and asset tests. Its original
environment refusal remains recorded. Main's frozen seven-file integration
checkpoint additionally exercises the shared runtime capture, candidate review
and typed assignment publication on combined bytes. It passed **36/36** in
**322862.352084 ms**, exit 0, with zero drift across 2,904 frozen source/dependency
files and the pinned executables. Log:
`local-history:unknown-knowledge-installation-integration.log`, SHA256
`7fe031ee7ca1c710c7025f566af365f6aa8433fde748a5f5f0d5455e45b40617`.
Independent interface review found an omitted Linux loader override, `LD_AUDIT`,
in local activation's environment rejection. The correction in owner commit
`004fe96f1228add86eca9b06ff28231aec684ff8` rejects all nonempty `LD_*` and
`DYLD_*` overrides before any child spawn. Actual retained-review/publication
regressions for `LD_AUDIT` and `DYLD_FRAMEWORK_PATH` first failed with one
intercepted spawn apiece, then passed with zero spawn attempts. No sentinel
reached a child and no DSO was executed. The focused corrected vertical passed
**3/3** in **184197.358875 ms**, exit 0. Its log is
`local-history:ucs1240-loader-env-green.log`; the original RED is retained as
`local-history:ucs1240-loader-env-red.log`. The pre-correction integrated 36/36
receipt remains separate and is not relabeled as exercising the guard fix.

Root README/changelog, migration guide, prepared/final/runtime/review/source-profile
guides and the scoped installation contract are updated together. The exact new
fixed audit/process entrypoints are added to repository acceptance's allowlists.
No default seed, public command, stored schema, wrapper template or agent conduct
changed. Existing AGENTS, contributor and publishing rules still apply; the
engine-directory manifest already includes these modules. The same aligned rc.2
PR version applies, without release or real customer migration.

Combined lint checked 641 files with zero failures. Structural/value validation
found no findings and only the two expected absent-store warnings. Repository
acceptance passed asserted A1–A4/A6 checks; A5 remains manual. All 220 local links
in the changed Markdown files resolved before these receipt-only additions.

## New held-out curation

The existing fixture-custody Decision and new held-out guide record the fresh
custodian's bounded search and the agreed six-case curation. Root changelog,
retrieval README and evidence index explain that historical evaluated cases do
not establish an unused pool. Private prompts/judgments remain outside the repo
and implementation-owner context. No reader, product operation or benchmark
ran, and no product schema, manifest, protocol or dependency changed.

## Equivalent merge without assignment edits

The existing merge-governance and merge-publication Decisions record the agreed
zero-use branch. Original own `assignmentEvent: null` chooses it; complete actual
use inventory and a registry-only changed-path proof establish the absence of
assignment changes. There is no fabricated event. Report version 3, explicit
closure admission, full registry-authorizer binding, fresh review/publication and
unchanged ref CAS preserve the existing operation. Native equivalent-query gains
from already-assigned survivor records remain visible. Positive-use report
versions, policy objects and dispatch selectors remain unchanged.

The isolated owner passed 15/15; independent review passed 13/13, including
SHA-1/root and SHA-256/nested material publication, historical source loss and
restoration, same-tree/different-commit source CAS and output CAS. Their exact
receipts and original REDs are in the
[zero-use guide](agents/ucs-1240-equivalent-merge-zero.md). Both frozen source
checks reported zero mismatches. Main ran six affected suites on combined
installation/typed-assignment/zero-merge source, including the old positive-use
publication and retirement-core regressions: **76/76 passed** in
**246666.970375 ms**, exit 0, with no drift across 2,909 frozen source/dependency
files and the executables. Log:
`local-history:unknown-knowledge-zero-merge-integration.log`, SHA256
`02979eda56cb011e44242c6c5bd0410c3660ec41a8632afcd73c33783950f0bf`.
That frozen run predates the separate two-line migration environment correction;
its actual 3/3 regression remains distinct. Main verified the corrected runtime
and test bytes against their owner hashes.

README/changelog, ordinary merge/publication guides, lifecycle continuation and
the governance overview now distinguish the eventless profile from the original
positive-use contract. Existing catalog rows, AGENTS, wrappers, API/MCP interfaces,
store schemas and manifests remain applicable: this adds no public operation,
worker family or dependency. The same pending rc.2 PR version applies. Canonical
suppression/restoration, same-meaning transition publication, union/broadening,
broader merge variants and complete acceptance remain separate required work.

Final combined source lint checked 645 files with zero failures. Structural/value
checks again found no findings and only the two expected absent-store warnings;
repository acceptance passed asserted A1–A4/A6 checks, with A5 manual. The exact
PR-base guard verifies aligned rc.1-to-rc.2 version fields and changelog, and all
265 checked local documentation links resolve. These checks include the loader
guard correction; they do not relabel the separate frozen integration runs.

## Reviewed retrieval batch and held-out source acceptance

The existing operational-qualification Decision records main/P2 review and
one-time release of the fixed 60-call varied-corpus workload at `79c3efc`.
Main independently verified the 68 sealed package files and namespace-only
negative clone, then ran the custody-only controller: exit 0, zero acceptance
calls, 1829 runtime files, 13 dependencies, 1008/1008/255/20 fixture files and
292 preserved evidence files unchanged. The release file SHA256 is
`12f68dbcfcc397c61c463a4e1b01d0448e33efe6bc66b8c136c7d49006839622`.
Execution subsequently completed once with 39/60 scoped checks passing. All 21
failed successful-result expectations explicitly selected absent Ontology stores
and received the specified unavailable-store refusal. Main verified all 299
receipt hashes, 120 custody checks and the actual result dimensions. The new
baseline report (contract arrives in PR7; see delivery availability) retains the failure
and distinguishes byte parity, successful queries and incomplete contexts.

The existing fixture-custody Decision and held-out guide record independent
acceptance of all six source cases after three focused corrections, preserving
all prompts, source bytes and the three previously accepted case blocks. The
accepted private package is sealed for source-case custody; no reader run is implied.
Hidden prompts and judgments remain outside implementation-owner context.
Main verified the blinded receipt and opaque archive hash without opening cases.

Retrieval README, both existing Decisions, held-out guide and changelog are
synchronized. Their exact existing catalog rows remain applicable. Root README,
AGENTS/protocol/wrappers, public API/CLI/MCP documentation, schemas and manifests
need no change: this evidence update changes no supported product behavior or
workflow. Package and both lockfile versions remain aligned at `3.0.0-rc.2`
for the same pending PR; no separate PR or release has been created.

## Lifecycle requirement reconciliation

Main/P2/P7 checked r3 §4 and §12B against the actual proposal suppression,
reconsideration and ordinary creation contracts. The existing reconsideration
Decision explicitly supersedes the team's `f246a40`/`6166a6a` interpretation
that active-canonical suppression and same-ID restoration were required.
Those unsupported extensions are not marked implemented. Actual proposal
suppression publication, warranted reversal acceptance, fresh activation and
fresh-ID union/broadening remain required. Broader merge limits require concrete
scenario adjudication, not an unbounded backlog or a blanket waiver. The
[current scope](agents/subject-lifecycle-required-scope.md) records that boundary.

Root README/changelog and current governance, reconsideration, typed promotion,
typed assignment, material continuation and P2 audit guides now agree. Historical
Decision reasoning and frozen verification receipts are preserved, with the
superseding interpretation explicit. Stale current claims that zero-use merge or
merge/split/promotion continuation remain unsupported were corrected using their
already integrated guides. The same catalog row, AGENTS/protocol/wrappers,
schemas, manifests and public command contracts remain applicable; no runtime
behavior or authoring instruction changed. This internal documentation increment
shares pending `3.0.0-rc.2`; each actual PR still requires its own version advance.

The separately reviewed 21-call retrieval correction also completed once and
passed all scoped checks. Main rehashed all 108 receipts and verified 42 custody
outcomes, 18 complete query pages, three expected incomplete contexts with
20 internal calls and three exact replay pairs. Existing retrieval README,
evidence index, baseline report, operational Decision and changelog record that
result alongside the preserved original 39/60; no fixture, runtime, reader
protocol or claimed performance changed.

## Same-meaning Subject metadata publication

The existing governance/history Decisions and new
[metadata profile](agents/ucs-1240-subject-metadata-publication.md) cover one
internal operation for rename, clarification, reparent and related-link changes.
One authentic core allowance, owned evidence, actual committed snapshots and
registry-only changed paths preserve identities and every stored record. Native
qualification, reach, tree pairs, fixed queries and label lookup expose actual
effects and unavailable evidence. Fixed workers retain the original input and
registry; fresh final/review/publication binds the whole result and selected
Decision before the existing ref transaction. No public mutation API is added.

Owner coverage is the preserved 19/20 run plus a targeted 1/1 correction to a
test's phase-name expectation, with no production change. Independent review
passed 6/6, including SHA-1/root and SHA-256/nested publication, native reparent
gains, source loss/restoration, tampered retained proof and source/output CAS.
Main imported all 26 handoff paths by exact hashes, checked the shared runtime
changes and ran one eight-suite regression checkpoint: **68/68 passed** in
**116872.788916 ms**, exit 0. All 2,921 frozen source/dependency files and
executables remained unchanged. Log SHA256:
`85c70ef9a10f039390583232495d6b7020ae46007cceaec3ab08b43823bf923b`.
The profile guide retains the exact original REDs and owner/independent receipts.

Root README/changelog, governance, prepared-validation, candidate-review and
required-scope guides are synchronized. The two existing Decision catalog rows
remain exact. The payload manifest includes the eight new engine modules through
its existing directory entry; dependencies and stored schemas are unchanged.
Root/protocol AGENTS, wrappers and public API/CLI/MCP instructions remain
applicable because this introduces no new public authoring command. Exact
acceptance allowlists now name both fixed metadata workers; no guard was widened.
Lint checked 657 files with zero failures; automated A1–A4/A6 acceptance passed,
with A5 manual. Package and both lock fields remain `3.0.0-rc.2` for this pending
PR, with no tag, release, runtime approval or customer publication performed.

## Ordinary Subject creation publication

The existing reconsideration/creation Decision now explicitly records the fixed
ordinary creation profile and the reason for sharing concrete eventless source,
capture, retained proof and publication mechanics. Its existing catalog row
remains exact, with proposed status unchanged. The new
[creation guide](agents/ucs-1240-subject-creation.md) documents fresh activation,
unrefused proposal promotion and broader-meaning creation that preserves the
original subjects. Only registry and identity files change; prior K/O/D payloads,
assignments and history remain exact.

Main verified all 45 owner handoff hashes and reconciled metadata and creation
dispatch, publication descriptors and exact worker-name acceptance checks.
The isolated owner domain checkpoint passed 94/94 and independent publication
review passed 6/6. One integrated ten-suite checkpoint passed **89/89**, exit 0,
in **361773.296125 ms**, covering shared dispatch, native creation, creation
publication, metadata publication and extracted reconsideration retention/final/
publication. Its 2,947-file source/dependency freeze and executable hashes had
zero drift. The creation guide records exact commands, hashes and honest earlier
RED/fixture-failure outcomes; these receipts do not certify remaining lifecycle
or evaluation work.

Root README/changelog, current lifecycle scope, governance, prepared validation,
candidate review and reconsideration publication guides are synchronized.
Existing payload directory inclusion ships the new modules; no dependencies,
stored schemas, public API/MCP/CLI methods or wrapper commands changed. Root
and protocol AGENTS already require the exact dispatch checks, decision capture,
per-PR versioning and documentation reconciliation used here; their instructions
remain applicable without duplication. Lint checked 678 files with zero failures;
automated A1–A4/A6 acceptance passed, with A5 manual. Structural/value validators
reported no findings and the expected absent-store warnings. The pending PR
continues to use `3.0.0-rc.2` in the package and both lock fields; the exact base
version guard passes. No separate PR, tag, release, runtime approval or customer
publication was performed.

## Forward Subject proposal suppression

The existing governance and captured-history Decisions record the fixed
proposal-suppression profile, native BEFORE authority, registry-only retention
and shared mechanical implementation. Their exact catalog rows and proposed
status remain unchanged. The
[suppression guide](agents/ucs-1240-subject-proposal-suppression-publication.md)
preserves the owner REDs, test corrections and independent publication receipts.
Main verified all 27 handoff paths and reconciled shared creation/metadata
dispatch. One frozen nine-suite checkpoint passed **60/60**, exit 0, in
**213461.417542 ms**, with zero drift across 2,954 source/dependency/executable
hashes. Log SHA256:
`b6d289b55ac344b4629bf0f12bfa147affe43eb97a39cf50457717f343ab5658`.

Root README/changelog, lifecycle scope, governance, prepared validation, candidate
review, metadata and reconsideration guides are synchronized. Existing payload
directory inclusion ships the two new workers. Exact acceptance allowlists were
updated; automated A1–A4/A6 passed, with A5 manual. Corrected lint checked 684
files with no failures after catching a merge token before the test freeze.
Stored schemas, dependencies, public API/MCP/CLI methods and wrapper commands
are unchanged. Root and protocol AGENTS already cover the decision, documentation,
attribution and version obligations used here. The pending PR retains
`3.0.0-rc.2` in package and both lock fields; no separate PR, release, runtime
approval or customer publication was performed.

## Repeated equivalent merge and evaluation setup

The existing merge Decision and scoped/domain/publication guides record the
narrow preserved-redirect extension. The [repeated-merge guide](agents/ucs-1240-repeated-equivalent-merge.md)
links independent actual sequential publication and the main **43/43** frozen
five-suite checkpoint, exit 0, with zero drift across 2,960 files. Existing
metadata, creation and suppression gate regressions are included. Root README
and changelog are synchronized. The required-scope guide also maps already
implemented warranted reversal to its existing source-bound history/publication
tests; this audit adds no new lifecycle operation.

The existing fixture-custody and operational Decisions now distinguish synthetic
corpus construction from lifecycle publication. Growth construction (contract arrives in PR7; see delivery availability)
documents the narrow evaluator helper, preserved original bytes and container
rows, actual native allocation and pending fidelity/replay evidence. Its three
pure preservation/refusal checks passed. Existing source judgments are preserved;
new judgments are explicitly unblinded and source-level until actual record
fidelity is established. These evaluation files are excluded from the payload.

Lint checked 689 files with zero failures; automated A1–A4/A6 acceptance passed
(A5 manual), structural/value checks found no errors, and the exact-base PR
version guard passed. Existing catalog rows remain exact, with proposed statuses
unchanged. Root/protocol AGENTS already govern decision capture, staged
attribution, documentation and per-PR versioning. Runtime schemas, public
API/MCP/CLI contracts, wrappers, dependencies and payload inclusion are unchanged.
Package and both lock fields remain `3.0.0-rc.2` for this one pending PR; no tag,
release, customer publication or completion of the wider evaluation is claimed.

## Final deterministic reconciliation and growth evidence

The full 322-file test run uses a frozen `6605402` source/dependency copy.
Its initial export omitted Git metadata, causing repository-discovery and pinned
historical-runtime tests to fail. Keep that original run and its failures.
The identical source with the required Git index passed all 21 audit tests;
two date/exit-code cases passed in the separate five-case diagnostic. A proper
isolated clone retaining history passed all six affected baseline/runtime cases,
including the test that deliberately creates a Git replacement in its own clone.
The final self-survey failure also passed with the required Git index restored.
No main repository refs were changed by these diagnostics.

Nine obsolete assertions were corrected without product runtime changes: three
optional typed-replay cases, the engine glossary, the fixture-inventory exception,
the adapter dependency assertion, two README inventories and the package
dependency inventory. The adapter retains its exact lexical import restrictions;
the fixture exception binds one exact inventory file and digest while retaining
the acceptance-app ban. README subprocess names remain explicit. Package
dependencies remain an exact list for YAML and the approved MCP transport.
Typed replay tests retain unsupported-input diagnostics without requiring a
non-required replay to fail the whole assignment gate.

Corrected targeted checks passed: typed replay 3/3; documentation/boundaries
4/5 followed by the remaining exact README phrase correction 1/1; package
layout 1/1. The seven-case historical diagnostic passed 6/7, with its one stale
package expectation corrected separately. These are combined receipts, not a
claim that the original full run passed. Original and corrected logs remain
under `local-history:uk-final-*` and `local-history:unknown-knowledge-final-*`.
The original full run completed with **3,878/3,906 passing**, 28 failures,
zero cancellations/skips, exit 1, in **2973847.14375 ms**. All 2,961 frozen
source/dependency files and executable hashes had zero drift. Its log SHA256 is
`518197c9149a685c143562f031639e7bf2f81c9c929532498a25a2f2adf49114`.
All 28 failures are accounted for by passing corrected cases: nineteen Git
environment cases and nine obsolete expectations. The additional self-survey
target passed 1/1 in 422.867875 ms. The reconciliation receipt is
`local-history:uk-final-reconciliation-targeted-receipts.json`, with each original
or corrected log hash retained. No product runtime change was required, and
this does not relabel the failed original run as a single all-green run.

The growth result (contract arrives in PR7; see delivery availability)
now records accepted source/record fidelity, finalized judgments and the completed
60/60 matched replay. The existing operational Decision, evaluation README,
evidence index and changelog are synchronized. Root/protocol AGENTS and package
version rules already cover this test/documentation reconciliation; runtime
schemas, CLI/API/MCP contracts, manifests and wrappers do not change. All edits
belong to the pending `3.0.0-rc.2` PR.

The existing fixture-custody Decision also records the common 162-session public
agent comparison, source-equivalent native-ID prompts, actual Git setup and
shared delivery counters. Independent outer-auditor review and six zero-operation
client checks preceded release of the initial six sessions; no result is yet
claimed. The repair Decision and quality targets clarify one existing alias
target with two controls, without inventing a repair per organization. Held-out
acceptance remains separate. Lint passed across 689 files; structural/value
checks found no errors, 158 checked local links resolved, and the exact-base
version guard passed. No schema, public interface or shipped runtime changed.

## Public evaluation handoff and results review

The public campaign results (contract arrives in PR7; see delivery availability)
record explicit user authorization, completed attempts, independently checked
hashes and paired totals, adverse findings and remaining acceptance work. The
existing fixture-custody Decision records the choice and consequences; its
proposal key and exact catalog row are unchanged. Retrieval README, checkpoint
navigation and versioned changelog are updated together.

This evidence-only update changes no engine, API/CLI/MCP contract, schema,
manifest, wrapper, migration or publishing behavior. Root README, AGENTS files
and contributor guides therefore require no new usage instructions. It remains
part of the single pending 3.0.0-rc.2 PR; internal commits do not independently
advance the package or lockfile versions. Frozen evidence is preserved.

## Subject query authoring clarification

Main and P2 reviewed observed binding-object misuse and agreed a documentation
correction in the shipped intent and shared-interface guides. The existing
optional-Subject routing Decision records the rationale, alternatives and limits.
The guides distinguish a qualified binding target from the canonical string in
an assigned predicate and explain explicit selector provenance versus native
defaults. Existing strict grammar and refusal behavior remain unchanged.

Root README, AGENTS navigation, schemas, manifests, transport bindings and
migration/publishing guides retain their contracts and need no duplicate grammar
or new commands. The existing manifest already ships both edited guides. No
worker entrypoint changes, new test-host rules or fresh evaluation claims are
introduced. This is another internal commit in the same 3.0.0-rc.2 PR.

Validation: P2's read-only review found no semantic issues in the two guide
diffs. The actual documented JSON fragment passes the native predicate validator;
substituting the binding object refuses with `invalid-subject` at
`/where/subject`. Twenty-eight focused grammar, intent, binding and protocol
checks passed initially. Four interface fixture checks failed under the host's
older default Git; rerunning those four with the required `/usr/bin/git` on PATH
passed. Original failure logs remain preserved. This is 28 plus four corrected
checks, not a fresh full-suite run or a measured agent-quality improvement.

P10's causal triage and a further P2 wording review also identified an ambiguous
instruction to fix a plan using diagnostics. The intent guide now limits that
correction to a proposed subsequent authorized attempt and preserves the stopped
task. The existing routing Decision and changelog capture this clarification;
runtime exit codes, host limits and all historical outcomes stay unchanged.

## Final comparison preparation and critical-event coverage

The held-out preparation record now binds the agreed final runtime and unchanged
36-session design. The public report links causal triage, the applied guide
clarifications and the explicitly unverified critical-event totals. The existing
fixture-custody Decision records the rationale and consequences without changing
its proposal identity or catalog row. The versioned changelog records this work
under the same pending 3.0.0-rc.2 PR.

These are evaluation and evidence updates. Root and retrieval README links already
reach these records; AGENTS files, shipped protocols, schemas, manifests, API/CLI/MCP
examples and contributor, migration and publishing guides retain their behavior.
No additional usage edits, runtime tests or package-version increment are needed
for this internal evidence commit. Hidden cases and historical receipts remain
outside the implementation documentation.

Main, P2 and P10 also clarified the critical gate's candidate-versus-baseline
scope in the existing operational-qualification Decision and quality criteria.
Historical events remain recorded, every current critical event still blocks
qualification, and missing judgments remain unavailable. The text identifies
this as a subsequent interpretation rather than an original numerical severity
rubric. This acceptance clarification adds no runtime behavior or trial and
shares the documentation coverage and pending PR version above.

The subsequent public critical-event review closes that bounded reporting gap:
all 162 attempts have primary coverage and nineteen candidates have independent
dispositions. Main verified 805 artifact bindings and recomputed the zero-critical
totals while preserving noncritical errors, conduct failures and adverse answer
quality. The public results page, existing operational Decision and changelog
record this result. The final-runtime, strict-witness, held-out and repair
obligations remain distinct. This evidence-only addition changes none of the
shipped surfaces or version rules described above.

## Held-out execution release and narrow repair closure

Independent readiness and main review now support release of the exact prepared
36-session held-out comparison. A separate focused private review of retained
historical evidence resolves the repair target's regression linkage; main accepts
one of one narrow corrected-condition targets while preserving historical failed
outcomes and the old governed work row. Existing fixture-custody and repair
Decisions, retrieval evidence pages and versioned changelog record both actions.

These are evidence and execution-status updates, not shipped engine, schema,
manifest, API/CLI/MCP, wrapper, AGENTS, migration or publishing changes. Existing
README navigation reaches the updated reports. The pending PR remains 3.0.0-rc.2;
no additional per-commit bump or broad runtime test is warranted. Reader results,
strict-witness reconciliation and final whole-goal acceptance remain outstanding.

The deterministic coverage index now reflects the separately accepted narrow
repair target and completed public campaign without relabeling deterministic
tests as agent evidence. The public results page clarifies that the 39 uncertain
rows are delivered possible results; all 111 delivered strict results have
passing witnesses, while six withheld native outputs leave the broader gate
open. These are evidence-status corrections with the same unaffected shipped
surfaces and version policy above.

The subsequent operator custody amendment and six-call native-output recovery
release are recorded in the existing fixture and operational Decisions, held-out
and public-result pages, and changelog. They preserve the frozen product/runtime,
trial limits and historical outcomes. Root README/AGENTS navigation and shipped
interfaces, schemas, manifests, wrappers, migration and publishing guidance need
no new product instructions. These internal evidence changes retain the same
pending PR version; source/store structure, links, diff and staged attribution
are the relevant checks, not a new broad engine test run.

The recovered outputs and independent twelve-row delta review now establish all
123 strict witnesses in the bounded historical public campaign. The public
results page, deterministic coverage index, operational Decision and versioned
changelog record that result and preserve reader failures and adverse quality.
The existing Decision/catalog row covers this evidence disposition; no canonical
ID or approval is created. The unchanged shipped surfaces and same pending
3.0.0-rc.2 PR policy above still apply. Held-out results and final combined
acceptance remain outstanding.

## Held-out observed results and bounded recovery

All 36 sessions are retained and independently observed-reviewed. The new
held-out results page records adverse paired outcomes, incomplete accounting,
the finite five-body recovery release and remaining acceptance work. Root and
retrieval READMEs, curation, evidence and deterministic coverage indexes link the
current report. The existing operational Decision records why reconstruction
cannot change historical trial outcomes; its catalog row and proposal status
remain unchanged. Versioned changelog notes share the pending 3.0.0-rc.2 PR.

These evidence updates change no shipped engine, schemas, manifests, CLI/API/MCP,
agent protocol, wrappers, AGENTS instructions, or migration/publishing workflow.
Those surfaces need no usage edits. Structural validation, link/diff checks and
staged attribution apply; no additional broad runtime suite or new reader study
is introduced. The five output reconstructions and independent sixteen-row delta
review subsequently establish all 59 emitted strict witnesses; their receipts
and unchanged reader outcomes are recorded in the same surfaces. Critical-category
and metric reporting, followed by final acceptance, remain pending.

## Final implementation and evaluation review

The final review (contract arrives in PR7; see delivery availability) consolidates P1–P11
capabilities and the completed bounded evidence, including anonymous repeated-
case results, explicit critical-category/action coverage, every emitted strict
witness and the narrow accepted repair. It preserves the adverse agent outcomes,
all original failed runs and unavailable metrics. Existing proposed operational
and evaluation Decisions capture these dispositions without changing canonical
identity, catalog membership or publication status.

Root/retrieval READMEs, held-out report and curation, deterministic coverage,
evidence index, versioned changelog and this audit now point to that current
review. Earlier revision-specific pending statements remain historical evidence;
they do not create new work after the linked later acceptance. The final report
does not promise better retrieval, universal scale or automatic governance.

No shipped behavior changes in this final evidence commit. Root and payload
AGENTS/agents instructions, CONTEXT, wrapper pointers, interface examples,
schemas, manifests, contributor, publishing and migration guides retain their
already integrated contracts. No dispatch allowlist changes are needed. The
single pending PR remains `3.0.0-rc.2` in package and both lockfile fields, with
Unreleased notes and the checked rc.1 base; recheck the actual target before
merge. Structural validation, local links, diff review and staged attribution
verify this documentation/Decision change. Existing passing runtime checks are
reused because no runtime changed; no additional study or broad suite is added.
