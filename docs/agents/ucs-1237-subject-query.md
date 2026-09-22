# Captured subject query domain

This internal query API and its target-format CLI share the captured query
engine. They do not establish source adequacy or whole-ticket acceptance.
One legacy Knowledge jurisdiction profile is supported.

`payload/engine/lib/subject-query.js` exports:

- `validateSubjectQuery(query, {model, subjectGovernance})` returns
  `{ok:true,query,requirements,input,used,coverage}` or `{ok:false,diagnostics}`.
  It validates support, the entire predicate, selected universe availability,
  and every queried subject through the actual P2 governance handle. It does
  not claim that record assignment validation or evaluation has completed.
- `querySubjects({model,subjectGovernance}, query, {collect:'results'|'counts'})`
  performs preparation once, expands each distinct resolved subject once, and
  uses the actual P3 assignment validator in a single bounded record scan.
  Counts and results have the same eligibility and truth semantics. Default
  collection is `results`; counts mode explicitly returns `groups:null`.
- `selectSubjectQueryRecords(model,{stores,view})` returns separate canonical
  and proposal rows plus explicit selection coverage. It does not grant query
  eligibility or governance approval.

Anticipated domain failures return typed diagnostics. Unexpected implementation
errors propagate to the existing CLI bug/error boundary; they are never
disguised as a valid query refusal. Equivalent requested IDs share one expansion
while their requested-ID-specific redirect witnesses remain separate.

## Request

Required fields: `version:1`, nonempty unique `stores` chosen from knowledge,
ontology and decisions, `where`, and explicit `budgets` below. Optional defaults:
`view:'all'`, `expansion:'direct'`, `subjectPolicy:'current'`,
`ranking:{profile:'id-v1'}`, `possibleMatches:false`. Additional fields, cursors,
unsupported ranking and applicability profiles refuse. Supported alternate selectors are
`view:'current'`, `expansion:'self-and-descendants'` and subject policy
`historical` or `equivalent`. Historical means the original meaning in this
capture, not reconstructed historical hierarchy.

Predicates: `{op:'all'}`, `{op:'none'}`, `{op:'subjects-present'}`,
`{op:'assigned',subject:'S-000001'}`, `{op:'not',arg:predicate}`, or
`{op:'and'|'or',args:[predicate,...]}`. Extra fields and empty compound operands
refuse. Every branch is validated before execution, including dead branches.
AND/OR/NOT use strong Kleene truth. Missing assignments are unknown; an explicit
empty array is known empty. NOT asserts recorded nonmembership only.

Budgets require `version:1` and every following safe integer: `maxAstNodes`,
`maxAstDepth` (positive), `maxHierarchyNodes`, `maxHierarchyEdges`,
`maxRedirects`, `maxRecords`, `maxPredicateSteps`, `maxResultsPerStore`,
`maxExplanationNodes` (nonnegative). These are injected limits, not measured
production defaults. Traversal, redirects and predicate work share allowances
across the invocation. P3 consumes the remaining redirect allowance per row.
On a typed traversal failure, reported redirects count completed returned
witnesses only, not unobservable work in the failed call.

These counters describe selected algorithmic and output units, not total CPU,
elapsed time, bytes or peak memory. Even a zero record allowance follows model
selection, capture binding, registry indexing, full-input hashing and sorting.
One predicate step can inspect several assignments; assignment validation still
runs when no predicate steps remain. Exhausted predicate work produces explicit
unknowns and may finish scheduled Boolean bookkeeping within the other limits.
The explanation allowance bounds emitted bundles, not their prior construction;
count mode still evaluates predicates and constructs their internal witnesses.
Source pointers, citations, labels and serialized output bytes have no byte cap.

Input reading/parsing, retained-proof verification, assignment-list processing,
capture cloning/hashing/indexing and output serialization are outside the reported
work counters. Preparation refusals can omit resource counters altogether;
consumers must preserve that unknown accounting instead of assuming zero.
There is no wall-time cancellation API. External process termination does not
produce a domain incomplete result. Supported operational thresholds require
separate cold-load, query, context-count and memory measurements on named hardware.

Current selects verified Knowledge, active Ontology and accepted/addressed
Decisions, with basis `lifecycle-only`. It excludes proposals explicitly.
Unsupported current lifecycle values refuse; dates do not choose a winner.
All includes canonical history and actual separate proposal collections;
missing collections are unavailable, not empty. Proposals retain
`{proposalRef:{namespace,kind,key}}`, never a canonical `ref.id`.

### Legacy Knowledge jurisdiction profile

With only `stores:['knowledge']`, an explicit applicability object may contain
exactly `{profile:'legacy-jurisdictions-v1',mode:'any',jurisdictions:[...]}`.
The requested set must be nonempty, unique and exactly minted in the actual
captured Knowledge jurisdiction document. Unknown or suppressed values refuse;
missing captured authority is unavailable. All/containment and other stores
remain unsupported. No aliases or case/whitespace normalization are inferred.

Membership derives through the actual loader's shared registry schema/index
helper, and `input.inputs.jurisdictions` hashes the same full document plus its
file. Disposable minted/suppressed Sets cannot override that capture. The
existing resolver and subject queries share one any-overlap inclusion rule.
An empty or absent record jurisdiction list keeps the record with
`scopeBasis:'legacy-unrestricted-default'`; a nonempty list uses
`scopeBasis:'declared-jurisdictions'`. Neither is a source adequacy verdict.

Assignment validation runs before scope filtering. Scope-excluded records
finish without predicate work and increment the separate `scopeExcluded`
count. Eligible result rows carry applicability evidence; that object is also
included in the explanation-node budget. The explicit `/applicability`
selector appears in intent constraint requirements.

## Validation and provenance

`requirements.subjects` contains distinct requested IDs.
`requirements.subjectResolutions` contains `{subject,outcome}` with the exact
P2 eligibility result. `requirements.constraintPaths` comes from the same AST
walk: every operator/atom has `{path,kind:'predicate',origin:'explicit',op}`;
stores/view/expansion/subjectPolicy have selector rows with explicit/default
origin. Paths retain authored operand order. `query.version` and
`input.versions.query` are both 1. Defaults never imply explicit user intent.

Context requires the actual opaque governance handle. Copied handles and
descriptors cannot substitute. P2's shared `validateSubjectGovernanceCapture`
requires the actual model registry and authenticated identity index. It binds
the full registry document and identity ledger, then corroborates current Decision
authorizer records across the public model, private index and retained handle.
Missing or mismatched captures refuse even for an `all` predicate. P6's
shared version-2 projection hashes selected canonical records, proposals and
the full registry; the wrapper also hashes the actual governance descriptor.
Metadata binds query/evaluator/subject versions, registry/hierarchy revisions
and effective query options. This describes supplied parsed captured inputs,
not atomic filesystem or original-source-byte integrity.

## Execution output

Completed and bounded execution returns
`{status,query,input,groups,counts,coverage,resources,diagnostics}`.
`groups[store]` contains strict T and optional possible U rows. Each row carries
its discriminated identity, original authored assignment state, exact P3/P2
outcomes, original AST witness paths, source pointers and deterministic
`rank:{profile:'id-v1',signals:[],position}`. Rank is by qualified kind, identity
type, then exact ID/key, separately within each result category; it is not a
relevance score. Complete results are invariant to input Map order.

### Reading direct and descendant witnesses

An assigned atom records its authored AST `path`, `subject`, `expansion`,
`truth`, and original recorded `matchedSubjects`. When assignments are known,
it also records the query's `resolvedSubject`, query-side `redirects`, and
`expansionComplete`. The query's `assignmentEvidence` retains each original
assignment's independently checked resolution, redirect chain and governance
outcome, referenced by the row's ordered `assignments.ids`. Under equivalent policy, compare resolved IDs while keeping both
original IDs and both redirect histories visible.

These are bounded explanations that can be checked against the captured
registry. For example, with authored parents `C -> B -> A`, a query for A with
`self-and-descendants` can cite the record's actual C assignment. Direct mode
requires the same resolved subject; it cannot use that descendant relation.
Verify parent edges in the corresponding captured registry, not in a newer
registry or through association links. Full ancestor paths are not repeated
in each row. The input fingerprint binds the complete parsed registry and
query options; a matching digest alone is not an ancestry proof or a digest of
the original registry file bytes. Retain the source bytes and matching parsed
capture when independently checking an explanation.

Compound witnesses retain every authored operand path and truth even when
another operand decides the result. Thus `OR(U,T)` may emit a strict row while
preserving the first operand's unknown reason. Repeated predicates keep their
separate witness paths but do not duplicate the record. A positive observed
descendant remains a justified T during incomplete expansion; unobserved
membership cannot become F, or become T through NOT. Known empty assignments
are a separate case and can establish recorded nonmembership.

The explanation budget admits or withholds the complete row explanation.
Withholding sets `explanationsComplete:false` without changing evaluation
counts. The source-checking tests in `tests/subject-query-witness.test.js` use
real disk captures, retained Decision bytes, independently authored parent
chains and explicit expected truth tables. Corrupted match, redirect and
forest-binding controls check that the oracle rejects unsupported witnesses.
A forged false atom beneath NOT is rejected by checking every authored
assignment against the captured forest. Compound truth is corroborated by
enumerating the Boolean possibilities of unknown children independently of
the production evaluator.
These fixtures exercise retained historical activation; they do not certify
a new-activation publication workflow or external source truth.

### Counts and coverage

Counts per store: `{strict,possible,excluded,evaluated,unevaluated,basis}`.
Complete computation uses `basis:'exact'`, even with missing-metadata U.
Interrupted computation uses lower bounds for strict/excluded observations
and adds `possibleBasis:'provisional'`: partial U counts are not lower bounds
for eventual U. Unvisited records remain explicitly unvalidated.

Coverage includes evaluation/rank completion, store selection coverage,
predicate unknown count, unvalidated record count, page truncation and
explanation completion. Resources expose limits and actual observed AST,
hierarchy, redirect, record, predicate and emitted explanation counters.
`recordsCompleted` counts records whose predicate work finished; hierarchy
completion remains independently visible through overall coverage.

After the bounded scan, each store's page contains strict matches first, then
possible matches in remaining space. Page length never determines counts.
For native output version 2, explanation cost counts every JSON container and
scalar in each emitted `{witness,unknowns,assignments,applicability?}` bundle,
plus every container and scalar in the query-local `assignmentEvidence` table
once (keys are not values). This includes the table envelope and qualifiers;
every occurrence of an assignment ID in a row still counts. Identical content
inside separate table entries is charged separately. If a complete row bundle
plus all its new table entries cannot fit, neither is retained and
`explanationsComplete:false`; no partial strict proof is emitted. Page or
explanation truncation alone does not change completed evaluation status.

### Lossless output version 2

Every query execution report carries `outputVersion:2`. Authored query and budget
versions remain 1; `input.versions.evaluator` is 2 in both validation and execution,
so input fingerprints identify the changed representation/accounting contract.
Historical unmarked outputs and their receipts are preserved as version 1.
Current retirement and split replay consumers require the exact version-2
preparation-refusal DTO, including `outputVersion:2`; missing/other versions and
extra fields cannot satisfy an expected refusal. Their code/path and opposite-side
complete-output checks, inventories and authority rules remain unchanged.

Results with nonempty admitted assignment lists include
`assignmentEvidence:{namespace,kind:'subject',purpose:'query',policy,outcomes}`.
`namespace` matches the captured input and row references; `policy` equals
`query.subjectPolicy`. `outcomes` is keyed in sorted order by the **original**
canonical Subject ID. It retains the complete successful P2 outcome, including
requested/resolved IDs, redirects, Subject metadata and warrant/capture pointers.
It never substitutes hashes for evidence or keys an original ID by its survivor.

Rows keep their authored ordered `assignments`, AST witnesses, unknowns, source
pointers, identity, lifecycle, rank and optional applicability. Version 2 omits
the repeated inline `assignmentSubjects`. For each `assignments.ids[i]`, its exact
former element reconstructs as `{originalId:id,index:i,path:'subjects['+i+']',
outcome:assignmentEvidence.outcomes[id]}`. Unknown and known-empty states both
have no outcome elements, but remain distinct assignment states. Do not sort the
row IDs. Missing table coverage or mismatched namespace/purpose/policy/requested
identity is malformed evidence, not a negative or unknown match.

Tables belong to one query result, not a context, intent plan or reusable proof.
All original row/assignment/governance checks still execute with their cumulative
allowances; later redirect exhaustion cannot reuse an earlier success. The
producer checks exact P3 positional reconstruction and equality of repeated full
outcomes. A new field or inconsistent value fails as an implementation error
instead of being silently dropped. Shared captured Subject objects remain frozen;
mutable returned outcome containers cannot alter a later query.

The table contains only evidence needed by emitted rows. Counts, refusals and
results without nonempty admitted assignments omit it. Row and new-entry admission
is atomic; withheld rows leave no orphan entries. Zero explanation allowance still
uses zero emitted nodes. Failed admission work and equality comparisons are not
claimed as emitted nodes or whole-process CPU bounds. Actual serialized bytes,
including pretty formatting and any wrapper duplication, remain subject to each
transport's unchanged byte admission. Expanding rows for delivery must count the
expanded bytes and is not a bounded fallback.

Ten complete rows in a store page do not constitute all 21 matches when the
page limit is ten: `pageTruncated` stays true even with complete explanations.
The full-set comparison continues to require complete untruncated output.
See the [lossless output decision](../../decisions/entries/lossless-subject-query-output.yaml).

An encountered invalid/ineligible/unverifiable record assignment refuses the
whole execution with `groups:null` and `counts:null`, clearing earlier usable
matches. Shared redirect exhaustion instead yields incomplete execution.
If exhaustion occurs during query preparation, no scan is run and no groups
or counts are emitted. Neither outcome is a successful empty result.

Related-link navigation, further scope profiles, repository migration and
benchmark-derived supported numeric limits are separate remaining work.

## Shared CLI context assembly

`subject-query-context.js` exports `decodeDecisionCaptures(document)`,
`decodeAssessmentCaptures(document)`, `decodeMaterialCaptures(document)` and
`loadSubjectQueryContext({root,decisionCaptures=[],assessmentCaptures=[],materialCaptures=[]})`.
The Decision decoder accepts only
an explicit array of exact `{capture,bytesBase64,objectFormat}` JSON rows. It
uses the shared capture-locator shape, explicit sha1/sha256 format, canonical
padded base64 syntax and a canonical byte roundtrip. It returns original bytes
as Buffers for the actual governance verifier; decoding alone establishes no
integrity or approval. Malformed input throws `SubjectQueryContextError`, an
`EngineRefusal` subclass with code `invalid-decision-captures`.

The assessment decoder accepts an explicit array of exact `{registry,identity}`
pairs. Each part uses the same exact `{capture,bytesBase64,objectFormat}` transport
and the same private byte decoder. It returns `{registry,identity}` pairs with
decoded Buffer bytes. Incomplete pairs, extra fields and malformed byte transport
throw `SubjectQueryContextError` with code `invalid-assessment-captures`.
Duplicates remain intact so P2 can refuse ambiguous matching evidence; transport
does not adjudicate source identity or grant approval.

The material decoder accepts an explicit array of the same byte-transport rows
and reports its shape/base64 failures as `invalid-material-captures`. Its new
material-only admission checks own data fields, dense ordinary arrays and closed
locators before using the shared private byte decoder. Supplied operations are
authenticated before transport inspection; operation/document failures retain
their own refusal boundary. Existing Decision/assessment decoder semantics are
unchanged. See [material transport and consumer scope](ucs-1237-reconsideration-consumers.md).

The loader resolves the actual repository layout, reads the actual canonical
model and evaluates its subject registry, identity ledger/index and supplied
Decision, assessment and material captures through P2. It returns `{ok:true,context:{model,subjectGovernance},
diagnostics}` or `{ok:false,diagnostics}` with no context. Missing authority or
unhealthy model refuses. Omitted captures remain unavailable evidence inside
the real handle; the relevant query eligibility gate refuses. Current Decision
files are never substituted for missing historical bytes. Unexpected errors
propagate; anticipated loader failures use the existing engine refusal boundary.
Promoted meanings require their retained before-registry and before-identity pair
in addition to Decision evidence. Omitting assessment captures preserves existing
Decision-only callers but leaves promotion proof unavailable. Current registry
or ledger files never substitute for retained bytes. These transport/context
functions do not introduce an implicit global governance resource budget.
Reconsidered Subjects additionally require their cited material captures.
Omission supplies no material; an explicitly supplied invalid material list is
refused. No current-file fallback or automatic deduplication is introduced.

## Query CLI

Run the actual query command with explicit query budgets in a JSON file:

```sh
node payload/engine/query-subjects.js --root /path/to/repository \
  --query /path/to/query.json --decision-captures /path/to/captures.json --json
```

In a seeded repository the command is `unknown-knowledge/engine/query-subjects.js`.
`--root` names the repository root and defaults to cwd; the shared loader resolves
the supported root or nested store layout. Query and capture file paths are
resolved from cwd. `--counts` selects the same governed scan with `groups:null`;
omitting `--json` produces human-readable completion, counts and diagnostics.
The command reads inputs and emits results without writing stores or views.

The captures file is the exact JSON array described above. Omitting it supplies
no retained evidence; current Decision files never fill that gap. Decoder and
loader failures produce refused output with null groups and counts. Domain
results retain the query API shape; loader warnings appear separately as
`contextDiagnostics`. Argument and unexpected runtime failures use the existing
CLI error boundary.

For promoted subjects, also supply `--assessment-captures <JSONfile>` containing
the exact pair array described above. Missing retained pairs yield unavailable
query eligibility; invalid bytes or duplicate matching pairs yield the actual
governance refusal. Invalid assessment JSON is reported separately as
`invalid-assessment-captures-json`. This flag does not change the query AST,
result envelope or exit-code contract.

For reconsidered Subjects, also supply `--material-captures <JSONfile>` with the
material array described above. Both bounded file composition and the unbounded
CLI path forward these captures with original assessment and Decision evidence.
Invalid material JSON is `invalid-material-captures-json`; malformed byte
transport is `invalid-material-captures`. Missing relevant material remains
unavailable eligibility, including inside a negated predicate.

Exit 0 means completed evaluation, including zero matches, metadata unknowns,
or output-only page/explanation truncation. Exit 2 means refusal, incomplete
evaluation, invalid arguments or runtime failure. This command never uses the
validator findings exit 1. Inspect coverage to distinguish complete evaluation
from complete result delivery. Numeric budgets remain caller-supplied limits,
not benchmark-backed production recommendations.

## Opt-in neutral input admission

Internal readers accept the same optional authentic `sourceBudget` and
`documentBudget` handles. Create a source allowance with
`createSourceBudget({maxSourceBytes})` from `source-budget.js`; copying its frozen
handle cannot recreate authority. `readSourceFileSync(fileOrFd,{sourceBudget,
encoding})` counts actual returned bytes cumulatively, including repeat reads.
The bounded fd form always reads positionally from zero and leaves the caller's
file offset and ownership unchanged. The path form owns its fd. Only regular
files are supported; zero remaining capacity permits a known EOF, never an
extra probe byte. Exhaustion latches, while `getSourceBudgetUsage` remains a
copied read-only observation of consumed and attempted work.

Layout selection, loader record/metadata reads, Subject registry and assignment
history reads share these handles. Parsed documents and Knowledge bodies pass
the existing expanded-document visitor before validation/indexing; aliases
consume repeated visits. Typed exhaustion escapes ordinary parse/read/layout
diagnostics. Without the opt-in handles, existing behavior remains unchanged.
The loader's optional `subjectOperationBudget` is an opaque passthrough to the
Subject-owned reader; neutral readers import no Subject-budget implementation.

This seam alone does not qualify a complete operation. Native parsing/decoding
allocation, directory traversal, installed runtime/schema reads, CPU, output,
and uninstrumented host modes have no new bound from this reader. Operation
composition, corpus checks, capture ownership and output admission must also be
present before the profile can be claimed.

## Shared host operation (opt in)

`--operation-limits-json '<JSON>'` selects a version-1 host allowance. The inline
argument has a fixed 16,384-byte UTF-8 ceiling checked before JSON parsing. The
closed object requires `version`, `maxSourceBytes`, `maxSingleCaptureBytes`,
`maxOutputBytes`, `validation`, and `corpus`. All capacities are explicit safe
nonnegative integers; no production defaults or qualification follow from
merely supplying them. `validation` contains the existing six P2 capacities;
`corpus` contains `maxCanonicalRecords`, `maxAuthoredRecords`, `maxSubjects`,
`maxHierarchyDepth`, `maxHistoryEvents`, `maxHistoryRows`,
`maxAssignmentsPerRecord`, `maxAssignments`, and `maxBodyBytesPerRecord`.

The API creates an authentic allowance with `createSubjectOperation(limits)`.
Pass it as `operation` to capture decoders, `loadSubjectQueryContext`,
`validateSubjectQuery` and `querySubjects`. One operation permits one actual
context capture attempt, including a failed attempt. Reuse the resulting context
for later preparation/execution calls. The loader privately binds context,
model, governance and operation; copied contexts, unbound contexts and fresh
allowances cannot borrow that binding. A binding is resource accounting, not
publication approval. P2 also binds its private governance to the same shared
validation handle.

Raw capture capacity is reserved before base64 decoding using an authentic,
single-use P2 reservation. The single-item cap is independent of encoded source
bytes. API-supplied raw captures are admitted at the loader boundary. Deduplication
only avoids charging the same admitted object/buffer/length/content ownership
again; copied or changed captures consume a new allowance, and integrity is
always checked independently. Every actual transport read and document guard
still counts again. Base64 syntax and canonical padding bits remain strict.

Unique corpus admission includes all captured canonical K/O/D entries and all
proposals/support records, independent of selected query stores. Body size is
UTF-8 size of the loader's captured body text (including its existing newline
normalization); physical file bytes are separately charged by the source reader.
The combined history-event allowance counts Subject registry events plus retained
assignment event documents. The history-row allowance counts every row from both
event classes, including unchanged and repeated-reference rows, plus assignment
baseline declarations. Baselines consume no event slot. Usage reports
`subjectHistoryEvents`, `subjectHistoryRows`, `assignmentEvents`, `assignmentRows`
and `assignmentBaselines` separately alongside the combined counts. These are
source cardinalities, not deduplicated identities or chain-execution work.

Unknown assignments remain unknown, although their authored list length is zero.
Parsed documents are admitted before schema/index work. Corpus admission follows
the loader, whose own Subject metadata work already uses the shared P2 allowance;
it does not pretend to precede native parsing. Repeated public query phases recheck the
captured corpus and charge their actual guards/work. The private fixed file
composition below retains initial admission within one unexposed sequence.

Existing authored per-query budgets retain their domain meanings. An incomplete
scan can still produce an ordinary incomplete domain response. Exhausting the
outer host allowance stops dependent work and never becomes a fabricated domain
incomplete result. The successful opt-in CLI keeps the existing domain JSON
shape. Expected admission/usage/output failures exit 2 and, when the whole receipt
fits, emit `{version:1,status:'host-failed',failure:{kind:'admission-refused',code,counter,phase}}`
as JSON plus newline. The receipt preserves the first admission failure; absent
counter/phase values are null. It uses the same output allowance, with no smaller
fallback if it cannot fit. Bootstrap and module-load failures before an authentic
allowance exists are silent.
After allowance creation, an unexpected CLI exception produces an exact
`{version:1,status:'host-failed',failure:{kind:'internal-error',name,message,stack}}`
JSON receipt plus newline through the same output allowance; if the entire
receipt cannot fit or its write fails, there is no unbounded fallback. The
programmatic command entry keeps throwing the original exception. No truncated
or shortened result is delivered as success. With a valid allowance,
help and normal responses include formatting and the trailing newline in the
whole-output admission. Node startup warnings remain outside this application
output boundary.

All opt-in shims dispatch through `boot(name, command, {bounded:true})`.
Commands delegate authenticated-operation failures to the shared
`reportSubjectOperationFailure` in `subject-operation-cli.js`; they do not
own separate receipt classifiers. Typed `EngineRefusal` inputs are expected
refusals; arbitrary plain errors retain the internal-error variant. Direct
programmatic command calls keep their original exceptions.

`getSubjectOperationUsage` exposes copied limits, cumulative source/P2 usage,
observed corpus counts, failure, and separate `outputBytesAdmitted` and known
`outputBytesWritten`. A physical write failure sets `outputWriteUncertain` and
never refunds admission. Unmeasured corpus fields remain null; partial checks do
not invent zero counts. Snapshots and bounded failure-output admission remain
available after a work latch. There is no reset/refund method, implicit CLI
telemetry envelope or capture hook; API counters must not be reported as observed
CLI counters.

Native parser/copy/hash/serialization allocation and CPU, directory enumeration,
installed runtime/dependency/schema loading, and uninstrumented modes are
excluded from any resource guarantee here. P2's documented validation-step
counter is not a measurement of every P8 history-chain instruction or all CPU.
Multi-model creation/transition, P5 modes, and P6 enumeration require their own
completed composition before qualification; this first host owns one captured
query context. Wall-time/RSS targets require separate real measurements.

## Implementation decisions and reuse boundaries

The proposed decision records capture the rationale for
[query semantics and source witnesses](../../decisions/entries/captured-subject-query-semantics.yaml),
[operation admission and the shared CLI boundary](../../decisions/entries/subject-operation-admission.yaml),
[incremental history validation](../../decisions/entries/incremental-subject-history-validation.yaml),
and [call-local authorizer reuse](../../decisions/entries/call-local-subject-authorizer-reuse.yaml).
These are implementation proposals, not canonical publication or human approval.

The later [single-pass record result proposal](../../decisions/entries/single-pass-record-result-admission.yaml)
removes the duplicate authored-record guard inside each actual identity-resolution
miss. It keeps strict authored data, visits all wrapper fields and retains the
detached clone. It changes counter totals and first-failure traversal order; the
accounting document records both historical and current units.

Governance evaluation and binding can reuse a successfully resolved private-index
authorizer and its digest within one call. Every event's evidence and every mutable
model-side binding check remains active, and replacing the model's index refuses.
The [operation accounting document](ucs-1235-operation-budget.md) defines first-miss
document visits, per-lookup steps, fresh-call isolation and sticky failures.
Later public corpus admission still repeats its full guards. Initial admission
uses the private loader composition below; parsed-evidence reuse remains deferred. None of these implementation changes qualifies the
preserved operational profile or changes the query schema, CLI options or defaults.


### Initial load ownership

[Private initial corpus admission](../../decisions/entries/private-initial-corpus-admission.yaml)
combines the actual synchronous loader and first admission before the model is
returned. The bounded factory calls `loadAndAdmitSubjectOperationModel` with the
same operation and located kit root. Capture reservation/admission remains before
loading; unhealthy/no-registry diagnostics, governance evaluation and context
binding keep their order. The unbounded loader path remains unchanged.

Only during this audited unchanged, unexposed lifetime can the already guarded
record/body payloads avoid a second initial walk. Exact recognized wrappers get
an actual charged metadata shell with null payload markers and one prepaid
classification step per entry; unfamiliar wrappers use the existing full guard.
All unique counts, actual UTF-8 body limits and registry/history/hierarchy checks
remain. Public re-admission always guards full current payloads after return.
There is no durable immutable-model claim, caller proof, injectable loader or
public fast-mode option. Future loader mutation/exposure/callback/async changes
must re-guard changed data or disable this optimization. See the operation
accounting document for exact units, first-failure changes and retained limits.


### Fixed file-to-query API

`querySubjectFiles(operation, {root, queryFile, decisionCapturesFile?,
assessmentCapturesFile?, materialCapturesFile?, collect?})` requires an authentic Subject operation.
The options object must have an ordinary/null prototype and only own enumerable
scalar data slots. `root` and `queryFile` are required nonempty primitive strings;
optional capture file paths are also nonempty primitive strings. `collect` is
`results` (default) or `counts`. Extra, hidden, symbol, accessor or unsupported
fields refuse with `SubjectQueryContextError: invalid-query-file-options` before
loading. The API accepts no supplied model, query object, captured Buffer, loader,
callback, governance handle, executor or skip flag.

The library reads and guards query JSON, reads and decodes Decision transport,
then reads and decodes assessment and material transport before calling the fixed context loader. These
inputs and the actual model stay private through query execution. Initial corpus
admission enforces all unique limits; only the redundant second corpus pass is
omitted during private preparation. Query grammar, selection, lifecycle/scope,
governance/model/index/authorizer binding, fingerprints, every P3 row/assignment
check, eligibility and all other actual query work remain. A final operation
assertion runs on successful, refused and throwing paths. Expected file/JSON and
evidence errors retain their existing typed codes; programmer errors propagate.

The returned envelope has the usual query result shape and context diagnostics.
Unhealthy/unavailable contexts return the existing refused envelope. No context,
model or reusable prepared proof is returned. This is **terminal ownership
transfer**, not a full clone: nested query, diagnostics, citations and source
pointer data become caller-owned when the fixed sequence ends. No retained mutable
alias or continuation may later consume transferred values. Shared governance
Subject values remain deeply frozen JSON. A fresh successful call requires a
fresh operation and fresh loading; a consumed context attempt is never reset.

```js
const result = querySubjectFiles(operation, {
  root: '/repo', queryFile: '/repo/query.json',
  decisionCapturesFile: '/repo/decision-captures.json', collect: 'counts',
});
```

The bounded CLI uses this API with the existing flags, failure harness and whole
UTF-8 output admission. The unbounded CLI retains its existing path. The shared
`readSubjectQueryJson(file, label, operation?)` library reader preserves both
paths' source/decode/error order; it does not confer private corpus authority.
Library callers own serialization/output admission after receiving a result.

Public `loadSubjectQueryContext` → `querySubjects` / `validateSubjectQuery` remains
a supported separate capability with full corpus re-admission, including mutable
records, body fields, maps and repeated queries. Intent/P5/P6 and caller-inspected
plan workflows retain their current behavior; this API does not privately compose
those multi-stage flows or reduce their capabilities. Future optimization of such
flows requires a separate complete ownership audit, without a caller executor.

[The fixed file-composition proposal](../../decisions/entries/fixed-file-subject-query-composition.yaml)
records the rationale and rejected mutable-pointer proof. The original 28 operational
refusals remain unchanged evidence. The exposed-context API's observed bounded
refusal is not repaired by relabeling it as this new single-call file profile.
Any new API/CLI qualification requires a separately frozen named controller and
input manifest after immutable review. Development tests do not establish fit;
no cap, fixture, eligibility, operational probe or controller change is included.
