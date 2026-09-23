# UCS-1240 decision and documentation coverage

This audit covers the released prepared assignment publication, mechanical
migration, fixed historical runtime and first v2 migration publication profile.
It records proposal rationale without declaring canonical approval or complete
P7 acceptance.

| Choice | Decision coverage | Implementation and evidence |
| --- | --- | --- |
| Candidate capture remains separate from runtime | Existing [snapshot/runtime proposal](../../decisions/entries/D-024-commit-snapshot-runtime-separation.yaml), [layout proposal](../../decisions/entries/D-025-explicit-kit-layout.yaml), D-000005 and D-000014 | Existing P1 raw committed-tree capture and current-runtime verification; no new client-code reader |
| Fixed bounded workers, private jobs, independent runtime capability | Existing P1 [retained runtime proposal](../../decisions/entries/retained-runtime-validation-and-publication.yaml), proposal bc77a31e-0fbb-4fbe-ba20-299bb0095953, split to its own file on main | ad74ecf collector; actual argv admission, runtime drift, bounded-output and A6 mutation controls; no duplicate P7 runtime decision |
| Exact review and fresh final checks precede atomic candidate-ref CAS | [Proposed reviewed publication decision](../../decisions/entries/ucs-1240-reviewed-candidate-publication.yaml), existing D-000010/D-000012 | 095a659 assignment publication, 98295b6 migration publication; actual retained-review/final/CAS fixtures, stale refs, forged bindings and lost acknowledgement controls |
| Finite typed migration preservation against fixed historical code | [Proposed migration decision](../../decisions/entries/ucs-1240-finite-migration-preservation.yaml) | c19bf29 distribution/profile, e161e3b preserved source roles, 98295b6 actual four-surface proof; root/nested, relations, renderer, private-input and capacity tests |

The migration release's final source passed 13/13 targeted tests. A preceding
frozen regression passed 28/28 including existing assignment/review checks; the
last refinements affected semantic comparison and nested roots. Lint and
A1–A4/A6 passed. Independent P1 verification of immutable 98295b6 passed 8/8
final/vertical/semantic/comparator tests and a separate v1-refusal test. All
publication fixtures use disposable repositories and synthetic trusted
operator/profile inputs. These observations do not approve a production profile.

Affected owned documentation is maintained in:

- [Prepared migration](ucs-1240-prepared-migration.md): unchanged mechanical DTO,
  private digest preimage and preserved source roles.
- [Historical runtime](ucs-1240-historical-runtime.md): exact distribution,
  provenance, limits and fixed collector.
- [Final migration](ucs-1240-final-migration.md): actual v2 scope, recipe,
  native adapter correction, generated proof and private resupply.
- [Candidate review](ucs-1240-candidate-review.md): policy selection, exact
  request/result/digest/namespace binding and unchanged three-file retention.
- [Final publication](ucs-1240-final-publication.md): assignment requirements,
  v1 migration refusal, v2 handoff and shared last-step CAS.
- [Candidate-ref transaction](ucs-1240-candidate-ref-transaction.md): shared
  Git guarantees and uncertainty; unchanged behavior needs no rewrite.

Main owns root README, AGENTS, CONTRIBUTING, version/lockfiles, changelog,
PR template and CI reconciliation. The required shared-file note is that the
first v2 migration profile can now reach reviewed candidate-ref publication;
v1 reviews remain non-publishing, and broad migration/merge/promotion completion
must not be claimed. There is no separate owned README or AGENTS file requiring
an additional instruction source. Internal commits do not constitute separate
PR version bumps; main's unreleased rc.2 work follows the user-required PR policy.

Equivalent-merge publication now has its own [proposed decision](../../decisions/entries/ucs-1240-equivalent-merge-publication.yaml)
and [runner/final/review/CAS contract](ucs-1240-final-equivalent-merge.md). It uses
the existing raw owner DTO and fixed runtime capability, without adding a new
domain reader or event serializer. The explicit operation map replaces implicit
migration fallthrough. Raw capture limits remain separate from domain budgets.
Candidate review and final publication documentation were updated together.
Shared root documentation/version/changelog remain integration-owned; the payload
allowlist already includes these engine files and no CLI/schema/wrapper changes
are needed for the internal orchestration API.

Merge verification: runner and fresh final tests passed; the nested actual K/O/D
retained review/CAS test passed with namespace substitution, rehashed final
result and stale-ref refusals, then exact candidate publication and unchanged
index. The initial combined run passed 27 tests, including existing
assignment/capture/runner/publication regressions; its additional merge fixture was correctly refused
because it changed a retained-unknown sibling's physical file. Correcting that
positive fixture produced the passing nested publication test. A1–A4/A6 passed;
the isolated exact A6 callback accepted its baseline and refused all five fixed
worker/historical-runtime mutations. No production ref or approval was created.

Ordinary-promotion publication now uses the [first Decisions-only profile](ucs-1240-final-promotion.md)
with unchanged P1/P8 domain input/report and a separate explicit policy descriptor.
The existing reviewed-publication proposal records its transport rationale and
shared-file authorizer distinction. Domain rationale remains in owner proposals
1c8d9b0f-38a9-4f86-a571-3ed7d14add75 and 53e6b70b-75d3-476b-bd2c-1b11ef075ebc;
main's current catalog resolves these to ordinary-decision-promotion-proof.yaml
and subjectless-decision-promotion-proof.yaml. Broader K/O promotion is excluded.
Candidate review and final publication docs were updated; no schema, CLI or
wrapper changed, and main retains shared-root/version/changelog reconciliation.
Promotion verification passed 27/27 focused tests, including actual SHA-1 and
SHA-256 review/CAS, raw event review-metadata substitution, altered capture-limit
binding, namespace/created-ref order/stale-ref refusals, and existing assignment,
merge and migration publication regressions. Lint checked 449 files with zero
failures; A1–A4/A6 passed, and the exact A6 callback rejected all five negative
worker/historical-runtime controls. The historical-runtime document's fixed
collector count now includes the merge and promotion adapters.
Broader migration source formats, nonempty rules and
tie-order allowances remain open. No frozen historical bytes, prior experiment
results, budgets or benchmark readers were changed by this documentation audit.

The r3 section 9 follow-on adds publication-v3 operational-history proof to the
existing [finite migration proposal](../../decisions/entries/ucs-1240-finite-migration-preservation.yaml).
P1 and P7 reconciled this priority against the authoritative r3 source: retained
logs/Phoenix references and edition preservation are required; all four document
adapters are not required in every source profile. The actual source-span owner
handles reviewed prose references; fixed historical/current role validators and
edition-accounting owners provide the additional semantic evidence. The current
closed semantic report is version 2. Mechanical-v1 DTO/digest and historical
runtime bytes remain unchanged.

The final migration, mechanical migration, historical runtime, candidate review
and final publication documentation now identify the current policy and finite
scope. No schema, CLI, protocol or wrapper behavior changed. The payload allowlist
already covers the new internal library. Main owns the current PR's shared root
README/AGENTS, version/lockfiles and changelog; this internal release does not
create a separate PR version bump. Optional-store profiles, nonempty rules and
activated wrappers/extensions remain open, and strict tie ordering remains in
force. No production profile, activation, remote publication or approval is
inferred from the disposable test operators.

Operational-history verification: the first run passed 4/4, including actual
nested retained v3 review/CAS publication. The broader run passed 35/36; its new
invalid-Phoenix test incorrectly expected mechanical success even though actual
candidate validation already rejected the history. Correcting only that test
assertion produced 4/4 in the affected file. Other regression checks, including
ordinary promotion, final migration/private-input refusal, frozen runtime,
comparator/recipe and mechanical gate coverage, passed. Lint checked 450 files
with zero failures; A1–A4/A6, structural/value validation and reverse lookup passed.
No production code changed between the original publication pass and the
corrected assertion run. A5 remains a manual acceptance surface.

## Ontology typed publication integration

The existing [reviewed-publication proposal](../../decisions/entries/ucs-1240-reviewed-candidate-publication.yaml)
now records the distinct O-only transport and shared private final implementation.
Its catalog identity is unchanged. The [new contract](ucs-1240-final-record-promotion.md)
documents exact owner wire/report retention, raw creation-event evidence, separate
envelope binding, current runtime approval, actual impacts and final reviewed CAS.
The ordinary Decision descriptor remains separate; K and classified D publication
require new policy/runtime dispositions.

README/changelog, prepared-validation, review/final-publication guides, P8's
current design/audit and shared coverage were updated together. Root AGENTS,
CONTRIBUTING and the PR checklist already impose the user's decision/documentation
and per-PR version rules. No public command, schema, wrapper, adapter or extractor
contract changed. The engine-directory manifest includes the new modules. The
acceptance source audit now enumerates both new fixed entrypoints explicitly;
it still rejects caller-selected execution. This is an internal commit within
unreleased `3.0.0-rc.2`, not a separate PR or actual publication.

TDD first refused the unsupported operation. The actual SHA-1 vertical then
passed, followed by 17/17 runner/review/Decision/Ontology publication regressions
in 58092.790583ms, including nested SHA-256. The additional absent-registry fixture
initially asserted because its setup incorrectly requested prior governed
history; setting the fixture's existing history option to false produced 1/1
PASS in 13801.935166ms. No production rule was relaxed. The first acceptance run
caught its previous exact worker inventory; that inventory now names the added
fixed workers. Original failing receipts are preserved separately.

Full integration verification of commit
`3f8edc04375b52ac6ffa7b4f8b9c343658784f85` passed **2411/2411 tests** in
326604.290958ms, with no failed, cancelled or skipped tests. This includes the
new Ontology gate/publication tests and the existing query, assignment, migration,
review, installation and documentation regressions. Lint checked 467 files with
zero failures; structural/value validation passed. Automated acceptance A1–A4/A6
passed after the exact worker inventory update; A5 remains manual by design.
146 local documentation links resolved. The per-PR check against retained base
`08066b5f527b9d7d9705a3367bc26dcf080271ad` confirmed `3.0.0-rc.1` to
`3.0.0-rc.2`, matching both lockfile versions and versioned changelog notes.
This result establishes the tested integration, not full lifecycle completion,
operational capacity or real publication approval.

## Knowledge promotion and O/K v2

The next domain and publication interfaces were reviewed independently before
implementation. Both reviewers agreed to v2 owner/publication policies admitting
homogeneous O/K while retaining version-1 wire/report shapes and excluding typed D.
The existing domain and publication Decisions record that amendment and its
runtime boundary. The O/K publication guide, P8 design/audit, prepared validation,
review/final guides, README, changelog and shared coverage were updated together.
Root AGENTS, contributor/PR requirements, schemas, wrappers, public commands and
manifest shape retain their existing contracts; the changes remain within the
unreleased integration PR's `3.0.0-rc.2`.

The publication reviewer ran 6/6 actual O/K publication cases in 115084.609333ms
and 2/2 ordinary Decision publication cases in 25800.604708ms. The initial reviewer
fixture run used Git 2.23 via PATH; using `/usr/bin/git` resolved that environment
failure. The passing runs cover root SHA-1, nested SHA-256, classified/existing
history and registry-absent cases, exact date/policy/kind binding, v1 policy refusal,
raw-event tampering, stale source refs and unchanged user indexes. Fixture approvals
remain synthetic. These scoped results precede full integration verification.

Full integration verification at
`71f049d49c6d30434f9cb4a4d96edd410eb53c4e` passed **2422/2422 tests** in
381350.958459ms, with no failures, cancellations or skips. This covers the final
O/K domain and transport changes, static-date and unknown-owner assertions,
prior O and ordinary-D behavior, and existing query/migration/installation tests.
Lint checked 468 files with zero failures, structural/value validation passed,
and automated A1–A4/A6 acceptance passed; A5 remains manual. The scoped reviewer
results above remain separate receipts. Classified D, further Subject lifecycle
operations and broad operational/agent qualification remain unfinished.

## Classified Decisions and typed v3

Main, domain and publication reviewers agreed the exact D applicability/report
contract before implementation. The existing Decisions capture that amendment
and the rejected extra-field/date-echo alternative. Typed owner report v2 and
v3 policies support homogeneous K/O/D, preserving the ordinary Decision profile.
D reuses the existing planner with actual proposed-to-accepted proof; preflight
is exactly not-applicable with null date/result, while all other checks pass.
No generic skipped-check waiver or caller-selected execution is introduced.

Current domain/publication guides, prepared-validation, README/changelog and
shared coverage were updated together. The root AGENTS, contributor and PR
requirements remain applicable; public commands, schema/manifest shapes and
agent wrappers did not change. Runtime and human approval still bind the exact
new evidence; a version increment does not grant either approval.

The publication reviewer ran the nine typed K/O/D and two ordinary-D cases.
The first run passed 9/11 in 178.2s; two new D negatives expected a later policy
refusal but received the correct earlier retained-operation mismatch. Only the
assertion was corrected, and both cases then passed through publication in
49774.474292ms. No production fix or gate relaxation was needed. Original failed
receipts are retained; the full integrated run covers the final complete suite.

The expanded domain fixture and independent transport review then exposed a real
input-order versus allocation-order mismatch in the shared D predicate. The
correction binds original selected refs through retained, fresh and final proof
checks and compares complete unique membership separately from input order.
The corrected publication run passed **12/12** in 218684.786791ms: ten typed
cases including reversed D input, and two ordinary-D regressions. Main reviewed
the complete transport and test diff. Altered report order and missing original
selection still refuse. This is scoped evidence before exact-commit integration.

Full integration at `e19d36067b70a685e23cdb94df7907b430d89e06` passed
**2448/2448 tests** in 483522.858916ms, with no failures, cancellations or skips.
The implementation remained unchanged throughout the run. This includes all
typed K/O/D publication cases, reversed D input, the expanded D domain matrix,
ordinary Decision regressions and the existing installation/query/migration
tests. These results do not establish broader operational qualification or
complete the remaining lifecycle, bootstrap and evaluation work.

## Subsequent retirement publication integration

The [retained retirement profile](ucs-1240-final-retirement.md) and its
[Decision](../../decisions/entries/ucs-1240-retirement-publication.yaml) now add
the event-independent authorizer, exact original-input proof, separate raw
capture caps, fixed workers, fresh owner equality and shared ref transaction.
The earlier owner-only evidence above remains tied to its original snapshot.
No actual runtime/candidate approval or customer publication is inferred.

README, changelog, prepared-validation, owner/governance, review/final guides
and shared coverage are updated together. The existing manifest directory
entries include the added engine modules; no schema, CLI, MCP, wrapper or
installed authoring workflow changes. Root AGENTS, protocol AGENTS, contribution
and publishing rules continue to apply unchanged. Package and both lock fields
remain 3.0.0-rc.2 Unreleased for this internal integration; each actual PR must
advance its version against its target base, including documentation-only PRs.
Verification and remaining limits are recorded in the linked publication guide.

Full-suite verification at `83c86d21120c6ab4c6e5bad8eeac0f17e6afad57` passed
**2640/2640 tests** in 1061286.050333ms, with zero failures, cancellations or
skips. The runtime/test snapshot and repository remained unchanged throughout
the run. Evidence: `local-history:unknown-knowledge-full-retirement-publication.log`.
This establishes the integrated retirement publication regression result, not
completion of all P1–P11 work. Split, union, suppression/reversal, broader
migration and operational/agent acceptance remain tracked separately. No actual
PR, tag, release, runtime approval or customer publication occurred.

## Prepared split transport integration

The [split publication proposal](../../decisions/entries/ucs-1240-split-publication.yaml)
records why pure report checks, verified candidate capture, later actual Git
review and fresh owner authority remain distinct. The
[transport guide](ucs-1240-prepared-split-transport.md) documents implemented
fixed decoding, report consistency and bounded raw registry/identity/event
capture. Candidate-only identity capacity does not constrain original retained
evidence. Structural candidate parsing does not prove native allocation.

Main updated README, changelog, split design, prepared-validation guidance and
[change coverage](../change-completeness.md#prepared-split-transport) together.
The new Decision has one exact catalog row and stays proposed. Existing AGENTS,
other READMEs, wrappers, public CLI/MCP/API, schemas, manifests and release rules
retain their applicability as recorded in that coverage table. The version
remains rc.2 Unreleased within the same pending PR. Worker dispatch, actual Git
review, fresh execution and publication remain later implementation work; no
runtime approval or customer mutation is claimed by transport tests.

## Split worker and fresh-final integration

The [fixed worker guide](ucs-1240-prepared-split-validation.md) now describes
explicit split dispatch, exact diagnostic-report retention, bounded owned
authority artifacts and the fresh final gate. The same publication proposal
records why failed owner evidence remains diagnostic, why cleanup failure
rejects acknowledgement without deleting retained evidence, and why that bundle
cannot attest to later parent cleanup. Older operation behavior and shared
envelope versions remain unchanged.

The first actual matrix passed **5/5** in 48557.434417ms (session 11565, exit 0;
`local-history:unknown-knowledge-prepared-split-stage2-basic-green.log`): fixed
policy/entrypoint plus SHA-1/root and SHA-256/nested, each positive and zero,
through real prepared execution, retention and fresh final verification. This
initial result is not the final adversarial or regression receipt. Main's
independent actual deep-JSON test then reproduced encoding exceptions after a
successful control. The local correction passed **3/3**; the final owner matrix
passed **26/26** and main's shared/legacy regression passed **152/152**. Exact
scope, commands, logs and remaining limits are recorded in the
[coverage receipt](../change-completeness.md#split-workers-and-fresh-final-verification).

Shared documentation is reconciled alongside the code; the coverage record
tracks instructions and surfaces whose existing contracts remain applicable.
Review recording, independent allocation verification and ref publication are
still unfinished. No runtime approval, customer publication or new release is
inferred from the test-only profile configuration.

## Split review and publication integration

The subsequent [review/publication profile](ucs-1240-split-review-publication.md)
implements the remaining review and ref-transaction boundary described above.
The existing [publication Decision](../../decisions/entries/ucs-1240-split-publication.yaml)
records the fixed adapter, four/five actual captures, one fresh local allowance,
one native allocation comparison, and delegated fresh authorizer/provenance
checks. Source-less Decision tuples remain valid; no additional historical
source is invented. Operator authorization and governance review remain distinct.

Shared candidate-review, final-publication, prepared-validation, split design,
transport and worker guides now point to this profile. README, changelog and
[coverage](../change-completeness.md#split-review-and-publication) track the same
scope. The existing shared envelope and CAS contract are unchanged. Root and
installed AGENTS, wrappers, schema and supported CLI/MCP instructions retain
their existing contracts because no installed command or workflow is added.
Version stays rc.2 Unreleased within this pending PR, with every actual PR still
required to advance its target base. Earlier receipts remain historical evidence.

## Ordinary continuation transport

The [ordinary assignment continuation contract](ucs-1241-assignment-continuation.md)
extends the existing assignment input with retained assessment/material evidence.
Its owner report becomes version 2 only when continuation is supplied. Worker,
parent and final validators must derive that expectation from the original
input, bind its digest and validate the report's exact structure and capacities.
A report predicate checks consistency; it cannot establish actual historical
execution or measured work merely because a caller can recompute its hash.
Actual captured workers and fresh final source/assignment validation remain
required. Existing outer envelope, policy and candidate-ref transaction contracts
are preserved. Both fixed workers, retained readback and fresh final checks now
carry the group. Actual isolated SHA-1/root and SHA-256/nested fixture tests
exercise review/publication and source loss after retention or a receipt.
The [continuation guide](ucs-1241-assignment-continuation.md) records scoped
verification and limitations. This is not a new supported CLI/MCP workflow or
runtime approval; typed retained selection remains excluded.


## Optional-store migration profile

The existing finite-migration proposal records the c7b055a follow-on choice:
publication-v4, semantic report v3, source-profile-v1 and recipe-v2. It preserves
legacy recipe-v1 behavior and the actual operational-history proof while admitting
actual healthy optional stores with exact presence/count corroboration and at
least one payload. The [source profile and consumer inventory](ucs-1240-migration-source-profiles.md)
records absence/empty/malformed distinctions, no ordinary Decision retrieval,
detached empty views, shared capacities and remaining grammar/consumer gaps.
Final migration, candidate review, final publication and historical-runtime docs
identify the new policy. No schema, CLI, wrapper, historical distribution or
mechanical v1 DTO changed. The existing directory allowlist ships the shared
engine changes. Main owns root README/AGENTS/version/lock/changelog/catalog for
the actual PR; this scoped internal commit is not another PR version bump.

The original Decisions-only test reproduced mechanical success followed by
`migration-semantic-evidence-unavailable` on immutable c7b055a before code edits.
The first coherent implementation run passed 7/7 (823337.812792 ms):
`migration-optional-stores.test.js`, `migration-semantic-recipe.test.js` and
`migration-publication-vertical.test.js`. The focused regression passed 35/35
(536037.120958 ms): `prepared-migration-semantics.test.js`,
`final-prepared-migration.test.js`, `prepared-migration-validation.test.js`,
`prepared-migration-gate.test.js`, `migration-semantic-compare.test.js` and
`migration-historical-runtime.test.js`. All paths are under `tests/`; both runs
used `node --test --test-concurrency=2` and completed on their original handles.
The actual publication tests cover mixed retained history and Decisions-only,
forged profile evidence, private-input resupply, stale source refs and final CAS.

These are **preliminary unsupported-runtime results**, not final qualification:
the shell resolved Node v20.19.3 at
`/usr/local/Cellar/node@20/20.19.3/bin/node` (SHA-256
`3e3d9eaa34db2775b3ad42951165f988b870f7cfe3a2412a5cfe5bc1d578af70`),
below the package's Node >=22 requirement. Main explicitly owns one complete
combined integration run of all nine files using Node v24.19.0; ticket acceptance
remains pending that supported-runtime result. No source edits or restarts were
used to replace either live run after this environment mismatch was identified.

Lint checked 612 files with zero failures; preflight, structural/value validation
and changed-path attribution passed with the expected absent K/O warnings.
Acceptance A1-A4 passed, A5 remained manual, and A6 failed its pre-existing exact
dispatch pattern: c7b055a's guard omits existing Subject reconsideration entries.
The acceptance driver, both dispatch sources and historical distribution are
unchanged by this slice. Main corroborated and fixed that shared guard separately;
the failed owner receipt is preserved, not reclassified as passing.

Main's subsequent combined checkpoint at `7b27478` plus the exact fourteen files
from `286a6a8` passed all nine listed test files under Node v24.19.0: 42/42 tests,
zero failures/skips/cancellations, 170577.088667 ms. The actual mixed-history and
Decisions-only reviewed publication controls both passed. All 1,817 isolated
source/dependency files and both Node/Git executables matched their pre-run
hashes after completion. The log is
`local-history:unknown-knowledge-optional-stores-integration.log`, SHA-256
`1d6a1113461f09b7c328ffd6d1db17825becbc0cbc929d4c71d639f6f40b88ab`.
The same-prefix `.json` manifest and `-result.json` retain the exact source,
command and terminal result. This closes the supported-runtime gap for the
optional-store slice; broader migration requirements remain open.
