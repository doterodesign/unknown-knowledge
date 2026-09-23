# Retrieval evaluation — UCS-1243

Test-only evidence and scoring for r3 §12. Nothing here ships in the kit payload.
This is not a query implementation or a production finding schema.

The [completed public campaign and initial integration review](PUBLIC-CAMPAIGN-RESULTS.md)
record adverse answer-quality results, the now-authorized internal handoffs and
remaining acceptance work. Historical preparation and checkpoint descriptions
below remain evidence of their original stages, not the latest campaign status.

The [held-out observed results](HELDOUT-RESULTS.md) retain all 36 sessions and
their independent review. Source-supported task completion is 15/18 original
versus 10/18 current. Five missing native output bodies were recovered exactly,
establishing 59/59 strict witnesses. The subsequent aggregate review covers all
four critical categories across observed actions, reliance and final answers,
with zero critical events and unavailable unobserved context. The
[implementation and evaluation review](FINAL-RESULTS.md) brings together these
results, anonymous repeated-case outcomes, available quality/friction metrics and
remaining product limitations. The bounded report is complete; it supports no
general retrieval-improvement claim or deployment approval.

For decision records, public evidence, remaining acceptance and documentation
coverage, see [Decisions and evidence](DECISIONS-AND-EVIDENCE.md). This index
does not alter the frozen fixture or trial methodology described below.
The [prospective quality targets](QUALITY-TARGETS.md) define the agreed final-trial
criteria and paired denominators. They do not report measured improvements or
authorize execution, and they leave the historical rubric and receipts intact.
The [private-file count experiment](PRIVATE-FILE-COUNTS.md) records four complete
queries under the original limits, with exact counts and retained missing-rules
warnings. Its frozen evaluator remains false; it is not broader qualification.
The historical [results-mode experiment](PRIVATE-FILE-RESULTS.md) verified five
Decision witnesses while explanation capacity withheld Knowledge/Ontology pages.
The [native-v2 follow-up](PRIVATE-FILE-RESULTS-V2.md) delivers the requested ten
records per store with independently verified complete explanations at the same
limits. Full-result delivery, broader quality and performance remain separate.
The [varied-corpus baseline](VARIED-BASELINE.md) completed 60 calls once at the
same `79c3efc` runtime: 39 passed, while 21 explicitly requested absent stores
and refused. The separately reviewed correction passed 21/21 with only those
plans' store selections changed; combined with the 39 unaffected receipts it
covers the corrected fixed plan. The original failed score remains intact. Its
[operational Decision](../../decisions/entries/retrieval-operational-qualification.yaml)
records the exact freeze, custody and release.
The [synthetic growth evaluation](GROWTH-CONSTRUCTION.md) preserves old fixture
data while adding reviewed sources. Its separately reviewed matched replay
passed 60/60 fixed-query checks. Agent answer quality and performance remain
unqualified; synthetic construction is separate from lifecycle publication.
The [six new held-out cases](HELDOUT-CURATION.md) have separately passed source
and novelty review. Neither preparation establishes agent retrieval quality.
The [initial six agent attempts](PUBLIC-AGENT-CHECKPOINT.md) did not meet the
conduct/accounting continuation criterion. All are retained; the remaining
156 were released under the reviewed prospective v2 amendment. Repeated host-budget
instruction failures then paused dispatch after 33 v2 attempts. The remaining
123 are released under a neutral v3 policy-file instruction, with all completed
attempts and version-specific pairing preserved in the checkpoint.
The [final-runtime performance measurements](PERFORMANCE-6605402.md) meet the
named targets for both CLI conditions and the joint loaded query. The near-byte
loaded query refuses; partial context timing does not qualify full enumeration.

Run the scorer's independent literal examples:

```sh
node --test tests/retrieval-acceptance.test.js
```

## Agreed rubric

Judge source evidence before observing ranks. Grade 0 is irrelevant, 1 is
background, 2 is useful partial evidence, and 3 is directly answer-bearing.
Applicability is a separate explicit judgment. Applicable Recall@10 counts
grades 2–3 against **all** applicable grade 2–3 judgments for the requested
store. nDCG@10 uses gain `2^grade - 1`; inapplicable records have zero gain but
consume their returned rank position. Each store has its own rank list.
No-answer tasks have undefined recall/nDCG, represented as `null`, not 0 or 1.
They can still have grade 2–3 evidence supporting a scoped abstention or
capability-refusal explanation. Raw relevance counts/DCG remain descriptive
diagnostics; never aggregate their numerator/denominator as defined recall.
`answerable` concerns the requested factual response (including an explicitly
requested conflict explanation), not whether a useful bounded response exists.
Record the exact abstention target and explanation passage evidence separately.

`scoreTask(expected, execution)` takes independent per-store `judgments` and
actual per-store `rankings`. It returns recall numerator/denominator/value and
nDCG actual/ideal DCG/value per store. IDs are opaque qualified identities
(installation, kind, exact ID); the scorer does not parse or coerce record IDs.
Duplicate judgments/ranks, unjudged IDs/stores, or invalid judgment fields
refuse scoring rather than quietly repair the run. An explicitly empty rank
list is a completed empty list; an omitted run/store is explicitly missing.

`bundles` is an array of alternative adequate evidence bundles. Each bundle
contains `{id, passage}` references to independently judged applicable answer
evidence. `execution.inspected` records up to **ten total distinct inspected
records**, each with the source passage locators actually read. One complete
alternative yields bundle numerator/denominator 1/1. A matching record with
the wrong inspected passage yields 0/1. Catalog-recovered evidence may be
inspected without appearing in the initial ranked list. A union of ten hits
per store is a different budget and must be reported separately.

Missing bundle judgments or inspection traces remain missing. No-answer bundle
scores are undefined (0/0, value null); abstention correctness requires its own
independent answer review. Overall `status` reports available **ranking**
scoring (`scored`, `partial`, or missing execution); the separate `bundle`
result can still be missing. These fields are not release/pass statuses.

This scorer consumes reviewed traces. It cannot authenticate that source
reads, fresh preflight, approvals or agent trials actually occurred, and does
not infer answer correctness, scope violations or friction from rank alone.
Those require actual tool/source traces and independent adjudication. Input
schema/runtime/query/registry revisions, date and budgets belong in the run
ledger alongside this score; the scorer adds no snapshot or identity service.

## Pilot and release boundaries

For the current compact study, [new held-out curation](HELDOUT-CURATION.md)
records the bounded missing-pool finding and the agreed six-case preparation.
The historical recommendation below does not establish an available unused pool.

The authorized pilot starts with six different development tasks, one per
organization topology. Final recommendation is 72 tasks: 48 development and
24 held out, eight plus four per topology. Development evidence/judgments
require independent P5 review before freezing. Main holds sealed cases;
held-out intent review uses an independent fresh reviewer so P5's protocol
implementation does not receive hidden answers. No held-out answers belong
in the implementation-owner-visible pilot.

Paired baseline uses the original resolver CLI **and** documented catalog and
source recovery. Actual host trials use three fresh runs per condition; fixed
plans or hand-authored outputs never count as model trials. Record available
model/tool/prompt metadata and label unavailable values. Synthetic steward
responses test handling, not actual human approval. Freeze operational budgets
after the pilot and before comparative runs; freeze numerical supported limits
and performance/quality targets after baseline and before optimization.

Passing these scorer examples proves metric arithmetic and refusal behavior.
It does not establish new runtime acceptance, improved retrieval, completed
agent trials, supported scale, or release readiness.

## Disposable original-runtime installations

`materialize.js` exports `prepareBaselineRuntime(destination)` and
`materializeTask(taskId, destination, runtime)`. Both destinations must be new
scratch paths. Export the original `08066b5f527b9d7d9705a3367bc26dcf080271ad`
commit from this repository; do not substitute the current working tree.
The preparer uses the pinned initializer and verifies the exported file inventory
and bytes against Git blob identities before installing a task. Additional files,
unexpected directories and symlinks in the exported source refuse preparation.
Pinned archive and tree reads disable Git replacement objects, so local
replacement refs cannot substitute another commit's source under the baseline ID.
Its dependency link
uses this checkout's installed lockfile dependencies; run the pinned lockfile's
`npm ci` first and record Node/dependency versions with measurements.
The deliberately shared `node_modules` link is outside that source verification:
this helper does not attest dependency package contents or transitive integrity.
Comparative trials need separately prepared/recorded dependencies and must not
describe this source pin as complete executable-environment attestation.

```js
import { prepareBaselineRuntime, materializeTask } from './acceptance/retrieval/materialize.js';
const runtime = prepareBaselineRuntime('local-history:retrieval-original-runtime');
const fixture = materializeTask('policy-01', 'local-history:retrieval-policy', runtime);
```

The six frozen development organizations create eight roots: the holding
company has three isolated installations. The returned inventory contains
baseline-local record identities, actual source paths, passage locators and
source SHA-256, alongside the separately versioned baseline prompt. No ID
crosswalk is serialized and no compatibility reader enters the target runtime.
The installed CLI is `unknown-knowledge/engine/resolve.js`, whereas the exported
repository CLI is `payload/engine/resolve.js`. Follow each root's generated
`AGENTS.md` before an actual agent trial.

The original format uses class-scoped `K-101` ontology identities and `L-000001`
knowledge identities. The holding source's declared identity spans are adapted
only in scratch copies. Its frozen pilot source remains unchanged. Source
claims otherwise remain verbatim; headings supply catalog wording and source
pointers, with no expected-answer text added to the runtime. Old Decisions
retain their actual status and explicit supersession edges, including both
accepted competing successors in the policy fixture.

Four installations need a synthetic `D-999999` vocabulary warrant for the old
Knowledge registries. This support record is outside the task-answer universe;
count its exposed metadata in inspection overhead. Original `verified` leaves
represent independently reviewed synthetic source snapshots dated 2026-09-18,
including explicit historical-source notes. This is neither live human approval
nor support for the new lifecycle model: the old engine lacks retired leaves
and subject metadata. Ontology retirement uses its original `deprecated`
status. Unknown leaf scope omits `applies`; the old engine's unrestricted
inclusion loses the new unknown/empty distinction. Source scope still governs
what evidence can establish. Non-source Decision dates identify synthetic
snapshot authoring, not invented historical policy approval dates.

The preparer copies the excluded private decoy as fixture setup; trials must
not read it. It stages new scratch files for source mapping but creates no
commit. Never point this helper at an existing owner installation.

For measurement, count every unique qualified record whose metadata/body is
exposed, including catalog rows and unselected resolver/exclusion metadata.
Count full-record details and catalog entries separately. A whole class-file
read exposes all its records. Count source UTF-8 bytes cumulatively, including
repeat reads, and count all exposed source passages; a locator alone cannot
establish passage inspection. Namespace-qualified files remain distinct even
when their bytes match. Keep request, tool-result and final-answer byte counts
separate; source bytes are already part of tool-result bytes. Unknown/truncated
visibility stays incomplete, never silently becomes the full emitted size.
Record command/read operations separately from host tool invocations so batching
cannot conceal work. Internal engine file I/O is not agent inspection.

Materialization and a guided CLI/catalog/source walkthrough characterize the
development baseline only. They cannot stand in for independent fresh agents,
three repetitions, the remaining development/held-out corpus, or paired results.
The agreed subsequent development limits and delivery requirements are recorded
in [DEVELOPMENT-BUDGETS.md](DEVELOPMENT-BUDGETS.md); host enforcement must be
verified before comparison.
