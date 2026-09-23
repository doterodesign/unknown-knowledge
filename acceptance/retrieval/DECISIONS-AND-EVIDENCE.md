# Evaluation decisions, evidence and remaining work

This index records P10's evaluation scope and documentation audit. It does not
change frozen trials, authorize new trials, or approve a release. The backfilled
Decisions are **proposed**, with no allocated canonical identities or claimed
human acceptance. The coordinating task authorized this documentation backfill;
that authorization is separate from Decision publication.

The current [implementation and evaluation review](FINAL-RESULTS.md) summarizes
accepted deterministic, critical-category, witness, repair and performance
evidence alongside adverse agent outcomes and unavailable measures. Historical
preparation and remaining-work statements below retain their original stage;
use that review for the current completion checkpoint.

## Decision coverage

| Choice | Proposed Decision | Existing implementation and rationale |
| --- | --- | --- |
| Independent per-store metrics, missing values, bundle passage inspection and separate conduct review | [Scoring](../../decisions/entries/retrieval-independent-scoring.yaml) | [Rubric](README.md), [scorer](evaluate.js), [literal tests](../../tests/retrieval-acceptance.test.js) |
| Source-first curation, scoped lifecycle/relationships, isolated installations, pinned original runtime and bounded delivered exposure | [Fixtures and custody](../../decisions/entries/retrieval-fixture-custody.yaml) | [Source adjudication](development-v2/ADJUDICATION.md), [metadata adjudication](development-v2/metadata-review/adjudication.md), [record curation choices](development-v2/curation-review/record-decisions.json), [curation rationale](development-v2/curation-review/README.md), [materialization](development-v2/MATERIALIZATION.md), [historical host](TRIAL-HOST.md), [development budgets](DEVELOPMENT-BUDGETS.md) |
| Sealed repair-study evidence, paired failures, partial accounting, native-list ranking and disclosure of custody limitations | [Repair evidence](../../decisions/entries/retrieval-repair-evidence.yaml) | Public reports below; historical S4 host remains distinct from the final canonical reader protocol |
| Independent operational expectations, cumulative work limits, refusal retention and no performance qualification without completed operations | [Operational qualification](../../decisions/entries/retrieval-operational-qualification.yaml) | [Operational fixture preparation](OPERATIONAL-FIXTURES.md), [builder](operational-fixtures.js), [prospective quality targets](QUALITY-TARGETS.md), public profile and qualification reports below |

Existing decisions also cover the relevant stable boundaries: test artifacts do
not ship ([payload allowlist](../../decisions/entries/D-007-payload-allowlist.yaml));
verdicts and agent conduct are separate
([conduct](../../decisions/entries/D-011-verdicts-engine-conduct-protocol.yaml));
the engine never executes client code
([execution boundary](../../decisions/entries/D-014-engine-never-executes-client-code.yaml)).
Those records are reused, not rewritten. Their filenames are historical;
canonical identities follow the integration repository's current catalog.

## Public evidence snapshot

The [initial public agent checkpoint](PUBLIC-AGENT-CHECKPOINT.md) records all
six attempts: one adequate answer, no clean-conduct pass and five complete
accounting audits. Main verified 216 retained files. The remaining 156 have been
released under the reviewed prospective v2 amendment; no product-query failure
or overall comparative quality is inferred from the initial checkpoint.

The [final deterministic mapping](FINAL-DETERMINISTIC-COVERAGE.md) ties all
seventy A–H discovery cells to named assertions and their limits at `6605402`,
with the test/environment corrections integrated in `78bda67`. An independently
reviewed additional test closes E01's explicit lexical top-ten comparison;
agent and source-judgment obligations remain separate.

The [matched growth result](GROWTH-CONSTRUCTION.md#matched-replay-result)
passed 60/60 fixed-query checks, with all original fixture data preserved and
new source judgments reviewed before execution. This is deterministic evaluation
evidence; agent, repair, held-out and performance qualification remain separate.

These links resolve in the coordinating evaluation workspace. They are local
research artifacts, not published website URLs or shipped package files.
The repository preserves the methodology; main must carry the required public
reports with its review handoff if the receiving environment lacks this workspace.
Private reader questions, answers, judgments and sealed traces are not copied here.

- [Varied fixed-plan baseline](VARIED-BASELINE.md) records 39/60 passing checks
  at `79c3efc`; 21 successful-result expectations failed because their queries
  explicitly requested absent stores. All receipts and refused results remain
  preserved. A separately reviewed store-selection correction passed 21/21,
  supplying the missing corrected-plan coverage without rerunning the unaffected
  39. [New held-out curation](HELDOUT-CURATION.md) separately records six
  independently accepted and sealed source cases, with no reader execution.

- Full spec §12 remaining-acceptance matrix (local historical artifact; original hash/pin retained where recorded)
  and public evidence hash snapshot (local historical artifact; original hash/pin retained where recorded).
  This is explicitly a snapshot at main `1e68c2e`, not a claim about later HEADs.
- Final canonical governed-repair report (local historical artifact; original hash/pin retained where recorded)
  and seal receipt (local historical artifact; original hash/pin retained where recorded).
  At runtime `4faab47`, all 36 attempts are retained: adequacy 14/18 → 14/18,
  combined acceptance 3/18 → 3/18, with one paired improvement and one regression.
  The report discloses the coordinator's late exposure incident, unavailable
  accounting and the absence of a pure alias-only causal comparison.
- Operational qualification status v2 (local historical artifact; original hash/pin retained where recorded),
  operation-profile amendment (local historical artifact; original hash/pin retained where recorded)
  and combined-history units (local historical artifact; original hash/pin retained where recorded).
  All 16 probes across four runtime pins refused. Latest four at `5bad18d`
  failed document-text admission; zero completed queries or qualifying timings.
  Earlier successful flat-fixture characterization is not current supported scale.

- Operational qualification status v3 (local historical artifact; original hash/pin retained where recorded)
  adds four preserved API/CLI probes at `bdd366c`: all refused, bringing the
  retained total to twenty across five runtime pins. Joint loading completes
  but query evaluation exhausts the document-text allowance; near-byte loading
  still refuses at historical authorizer evaluation. No completed query or
  performance qualification is established. Earlier receipts remain unchanged.

- Operational qualification status v4 (local historical artifact; original hash/pin retained where recorded)
  adds four preserved API/CLI probes at `4401ce5` after single-pass record-result
  admission. All four refused, bringing the retained total to twenty-four across
  six runtime pins. Joint context loading completes but query evaluation still
  exhausts document-text allowance at `governed-registry-view`; near-byte loading
  now refuses at `parsed-decision`. No query completes. Changed counters and
  refusal locations do not establish operational capacity or performance gains;
  previous reports and receipts remain unchanged.

- Operational qualification status v5 (local historical artifact; original hash/pin retained where recorded)
  adds four preserved API/CLI probes at `b118c12` after private initial corpus
  admission. Both API contexts load successfully; their subsequent queries
  refuse at `subjects` / `resolution-subject` for the joint fixture and
  `documentTextUnits` / `corpus-entry` for the near-byte fixture. Actual CLI
  receipts agree on those failure phases. The total is twenty-eight refusals
  across seven runtime pins, with zero completed queries or timing samples.
  Earlier evidence remains unchanged; successful loading does not qualify a
  complete retrieval operation.

## Remaining acceptance

A subsequent read-only audit at `dd92900` and main/P2 review agreed preparation
of `private-file-counts-v1`: four untimed calls through `querySubjectFiles` and
the actual bounded CLI on the unchanged joint/near-byte fixtures. The
[operational Decision](../../decisions/entries/retrieval-operational-qualification.yaml)
records the scope, exact output accounting and required controller review before
execution release. Its
public next-action proposal (local historical artifact; original hash/pin retained where recorded)
links source custody and independent count expectations. No acceptance calls
ran under the preparation-only agreement. The 28 prior refusals remain
unchanged; success on a new private file profile would not establish exposed
context, source-witness, context-enumeration or performance qualification.

Current P2 subsequently accepted the
corrected v2 controller (local historical artifact; original hash/pin retained where recorded),
which retains an original query exception separately from a later output error.
Main verified its syntax and custody: 1,802 runtime/dependency files, two
1,008-file fixtures and 69 preserved evidence files. The exact freeze is
`f0f5740163277cad8b6d762b92ac959ba4605975c240374f3ba5c44b674c60df`,
with input manifest
`7ec1ed88e471e1c3e5e6ca77188d5c80e7d6ab474282397eabe7e4779be9e561`.
Main separately released those four calls in
`local-history:ucs1243-private-file-counts-v1-execution-release.json`.
The [four-call result](PRIVATE-FILE-COUNTS.md) records native completion within
the original limits, exact expected counts over all 1,000 records and identical
API/CLI output. The frozen evaluator remains false solely for two missing-rules
context warnings; the report preserves that result and explains the actual
query's independence from those rules. No timing or broader qualification is
claimed.

The next agreed preparation changes only collection to results under the same
runtime, query and limits. Independent source arithmetic predicts that the
4,096-node shared explanation allowance emits five Decision rows and withholds
the Knowledge/Ontology pages. The new profile will check emitted identities,
full assignment outcomes, witnesses and truthful withholding. Current P2 reviewed
the actual controller and independent expectations, and main subsequently
released the four calls after syntax and custody verification. The
[observed results](PRIVATE-FILE-RESULTS.md) confirmed five correct Decision
witnesses per call, empty K/O pages and explicitly incomplete explanations under
the original allowance. All scoped dimensions passed; full cross-store witness
coverage remains incomplete. The operational Decision records preparation,
review, release and the limits of this result.

The subsequent [native-v2 four-call result](PRIVATE-FILE-RESULTS-V2.md) at
`79c3efc` delivers ten records from each K/O/D store with complete, independently
source-checked explanations: 1,745 explanation nodes and 87,431 output bytes
under the same limits. Requested pages are complete; the full strict set remains
larger than those pages. All eight custody checks and both transport comparisons
passed. No timing, reader or broader qualification is inferred.

The later [public v3 regression and correction](../../docs/agents/ucs-1242-retrieval-governance.md)
also failed its frozen full-conformance rule. Independent review supports six
treatment source-complete answers and three full-conduct passes; it does not
replace the separate sealed 36-reader study or broader acceptance requirements.

Full acceptance remains incomplete. Spec gates A–H are separate from the older
repository A1–A6 checklist. Preserve all six organization scenarios, Decisions-only
and subjectless controls, the four experiment types, four variants, growth replay,
independent witnesses, deterministic preservation and zero-critical-error gates.
The suggested 72 tasks are not a mandatory user count. Prepared source judgments,
component passes and a completed small repair study do not establish broader
held-out quality, final publication integration or rollout readiness. Recorded
latency/memory targets were initially unqualified. The subsequent
[final-runtime measurements](PERFORMANCE-6605402.md) meet the named limits for
both CLI conditions and the joint loaded query. Near-byte loaded retrieval and
complete context enumeration remain unqualified. The earlier public audit did not find
an agreed project-wide numeric relevance-target table. Integration and evaluation
have now agreed [prospective targets](QUALITY-TARGETS.md) before new trials:
critical correctness and claimed repair closure remain hard gates; descriptive
paired nonregression targets require explicit denominators and adjudication of
adverse outcomes. This closes target selection, not execution or qualification.
Historical thresholds and failed results remain unchanged.

The [public agent checkpoint](PUBLIC-AGENT-CHECKPOINT.md) preserves all six
initial failures and records release of the reviewed prospective v2 instructions
for the remaining 156 slots. Instruction versions and valid matched pairs remain
separate; neither release nor accounting examples establish reader quality.
New dispatch subsequently paused after repeated host-only budget refusals exposed
an undisclosed exact-policy requirement. The checkpoint records the bounded
diagnosis and reviewed v3 instruction correction. Only the 123 unrun slots were
released after all 33 v2 attempts finished; no completed attempt is replaced.

The current [held-out curation](HELDOUT-CURATION.md) records a bounded search
finding: no qualifying unused pool was established in the inspected locations.
The historical evaluated archive cannot fill the six unseen slots. Main and a
fresh custodian agreed exactly six new source-grounded task-level holdouts, with
independent review before sealing. Curation is preparation, not trial evidence.

The historical public repair pair must be read with its
append-only correction (local historical artifact; original hash/pin retained where recorded):
after's first broad query already exposed the relevant concept binding and leaf,
despite empty ranked concepts. The alleged missing zero-resolution health check
was withdrawn; the unnecessary requery and failed navigation criterion remain.
The read-only repair audit (local historical artifact; original hash/pin retained where recorded)
also separates the literal `canvas locale` probe from a prospective two-part
source-separation question. The probe's after response adds a near-miss and is
not byte-identical to before. No new trial or historical reuse is approved by
this audit. The [repair Decision](../../decisions/entries/retrieval-repair-evidence.yaml)
records the corrected interpretation and the pending evidence-efficiency review.
That review subsequently concluded that the optional historical reader matrix
should not be dispatched merely to repeat known failures. The retained literal
probe's deferred source/scope interpretation is now recorded in
main's independent source adjudication (local historical artifact; original hash/pin retained where recorded):
both reports keep the Locale binding separate, the after near-miss is explicitly
lexical, and neither asserts a joint feature or answer. Captured source bytes
explicitly separate formats from locales. P10 independently agreed this limited
reading. Original failed navigation, pending repair and separate held-out
requirements remain; later protocol evidence needs its own requirement mapping.

That mapping is now accepted for the narrow corrected navigation requirement.
Main's acceptance receipt (local historical artifact; original hash/pin retained where recorded)
binds the historical publication and fixed controls, the mixed-probe source
review, and the later actual v3 t02 reader at `5bad18d`. T02 follows the returned
concept/leaf context without requery, completes required metadata and selected
preflight, then reads the original formats source and answers correctly.
P9's applicability analysis (local historical artifact; original hash/pin retained where recorded)
and P10's independent acceptance (local historical artifact; original hash/pin retained where recorded)
identify fixture differences and the relevant native behavior retained at main.
This resolves evidence applicability without another historical reader matrix.
It does not retroactively pass the original trial, change v3's failed denominator,
establish alias-only causality or qualify every current interface. Pending governed
repair state and separate held-out/release requirements remain unchanged.

## Documentation and integration coverage

Subsequent final target reconciliation accepts
one of one narrow corrected-condition repair targets (local historical artifact; original hash/pin retained where recorded).
The original independent sealed reviewer mapped the retained private regression
and event against the exact registered target/control criterion: neither
establishes a breach of that criterion or a target-specific critical event.
Main combines that blinded finding with the accepted publication, positive and
negative replays and actual corrected-protocol reader. The old governed work
row and broader historical failures remain unchanged; no private failed attempt
is assigned a counterfactual pass. The separate held-out comparison now has
[36 retained, independently reviewed observed outcomes](HELDOUT-RESULTS.md),
with lower current task completion. Five byte-exact reconstructions and their
independent delta review establish all 59 strict witnesses. Final critical-category
and combined reporting checks remain open. The [public critical-event result](PUBLIC-CAMPAIGN-RESULTS.md)
is separately accepted for its frozen campaign and does not erase adverse quality.

The [growth construction correction](GROWTH-CONSTRUCTION.md) removes an inferred
per-record publication prerequisite from the synthetic experiment. It preserves
the earlier publication analysis, all original sources/results and the requirement
to judge actual added records and evidence before replay. Existing fixture-custody
and operational Decisions record the corrected scope; no new product bootstrap
capability or weakened publication gate is introduced.

| Surface | Action / non-applicability |
| --- | --- |
| Retrieval and root READMEs | Link current measurements and continuation status; existing rubric and historical methodology remain intact. |
| Decisions | Four scoped schema-v2 proposals added. Their exact rows are included in the integration catalog; the historical branch catalog was not replaced or migrated by this handoff. |
| Agent documentation | This index provides the owner handoff and agent-facing remaining-work boundaries. No new runtime agent action or command was introduced, so payload AGENTS, wrappers and protocol instructions need no P10 change. Main owns the shared root AGENTS policy. |
| Frozen development, pilot and host documentation | Existing judgments, manifests, curation choices, historical budgets, runtime examples and reports remain unchanged; this index supplies current qualification context. |
| Package version, lockfiles, changelog, root README, CONTRIBUTING, PR template, CI and publishing | Main owns reconciliation under the per-PR policy. This internal handoff is not another PR and performs no version bump. The unreleased rc.2 working version is not a release authorization. |
| Payload schemas, manifests, CLI/API examples and migration instructions | No product implementation or interface change in this handoff; no new customer workflow to document. Main retains responsibility for final integrated publication/migration claims. |
| Tests and verification | Documentation/proposal checks only: parse and shape-check new records, check references/links, inspect scoped diff and verify protected public evidence hashes. No new readers, benchmarks or threshold changes. Main still needs integrated catalog/store checks when importing proposals. |

The per-PR policy is recorded by main in
`decisions/entries/pr-completeness-and-versioning.yaml`, proposal
`proposal:decision:b97239f1-4802-4c2a-a8d5-21eeed73c018`.
It is integrated here; each actual PR must satisfy the policy independently.
