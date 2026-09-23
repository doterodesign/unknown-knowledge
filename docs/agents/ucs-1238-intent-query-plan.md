> Packaging stage 6/7, version `3.0.0-rc.7`. This stacked prerelease is for review and new-installation development. No release or customer migration is authorized.

This contract includes final design and historical checkpoints. See [stage availability](../pr-delivery/README.md) before using an operation; internal checks do not supply a publication workflow.

# UCS-1238 — exact query provenance validation

Decision rationale and documentation coverage are indexed in
[P5 decisions and documentation](ucs-1238-decisions-and-docs.md).

`validateIntentQueryPlan(plan, {model, subjectGovernance})` in
`payload/engine/lib/intent-query-plan.js` composes the version 1 structural plan
validator with the actual P4 `validateSubjectQuery`. Context contains the real
captured model and opaque evaluated subject-governance handle. The shared query
fixture exercises those owners directly; no approval flags or substitute query
validators are accepted.

This pure library operation performs no I/O or execution. The explicit CLI
mode below supplies actual loaded context. Each branch retains its required
explicit query budgets, including `maxRedirects`. P4 supports the Knowledge-only
`legacy-jurisdictions-v1` applicability profile with `mode:any` and exact minted
jurisdiction values. Unsupported all/containment remains an explicit refusal;
see the [owning query contract](ucs-1237-subject-query.md).

## Exact coverage

P4 supplies `requirements.constraintPaths` from its own validated query walk.
Every authored predicate, Boolean operator, and semantic selector needs a plan
constraint with a reference to that **exact branch and path**. A reference to
`/where` does not cover `/where/args/1`. Coverage in a strict branch does not
cover a recovery branch. Unknown semantic paths, including pointers into
execution budgets or atom fields such as `/where/subject`, cannot discharge
query constraints. Reference the atom root instead.

Two origins remain distinct:

- `queryOrigin: explicit` means the selector or predicate was present in the
  authored query. Linked plan constraints still retain their separate
  `origin: explicit` or `origin: inferred` and their material unit keys.
- `queryOrigin: default` means P4 supplied an omitted selector. The output
  records generated `{origin:'default', validator:'subject-query',
  queryVersion, path, value}` provenance without inventing a material intent
  unit. Inferred constraints may reference that effective default. An explicit
  user-intent claim cannot: the planner must author the selector explicitly,
  even if its value equals the default.

The initial structural pass checks JSON shape and inventory. Only unresolved
query-pointer diagnostics are deferred to allow references to effective
defaults. Every branch then runs through P4, including alternatives, recovery
queries and dead predicate branches. If those validations pass, structural
validation runs again using the effective queries, so every deferred pointer
must resolve before provenance coverage can pass. No second AST walker or
subject lifecycle evaluator is introduced.

## Results and handoff

Results include `valid`, `validationScope: declared-inventory-and-query-provenance`,
stable-sorted `{code,path,message}` diagnostics, `branches`, and `handoff`.
`queryValidation` is `passed`, `failed`, or `not-run` when structural errors
prevent query work or the plan has no branches. A query can pass while intent
coverage fails; those are separate claims.

Each inspected branch includes its key, kind, `authoredQuery`, the complete
P4 `validation` result, and provenance rows. Those rows preserve path, kind,
query origin, value, declared constraint origins/unit keys, and any generated
default provenance. P4's result retains effective query values, exact subject
resolutions and captured input/version fingerprints.

Any structural, query or coverage failure yields `valid:false`,
`readiness:invalid`, and `handoff:null`. Query failures retain P4 diagnostic
codes and prefix their paths with `/branches/<index>/query`. Unexpected engine
errors propagate; they are never converted into successful empty evidence.

A valid result preserves all declared units, bindings, requirements,
clarifications, branch assumptions and explicit recovery relaxations. Each
handoff branch keeps its original `query` and adds `effectiveQuery`. The handoff
is an enriched output, not a replacement version 1 plan input. Output is
detached from caller inputs.

Open inventory and unresolved intent retain their original readiness. Otherwise
readiness is `query-validated`. This is not execution or evidence readiness:
`execution`, `bindingValidation`, and `evidenceReview` remain `not-run`.
The separate captured binding inspector handles lookup claims; P4's executor
handles record assignment validation and bounded evaluation. Source reading,
evidence selection and answer review must still address every retained material
requirement. This function never marks a source requirement satisfied.

## Optional whole-plan admission

The additive third argument is `{admission: {version:1, maxBranches,
maxReservedAstNodes, maxReservedRedirects}}`. All limits are explicit
nonnegative safe integers; no production defaults are supplied. The host must
measure unoptimized work and freeze a versioned numeric policy before trials
or tuning. A comparative trial uses the same limits and authored branch order
in each condition. Changing the policy requires a new trial version.

After initial structural checks, the composer reserves the sum of **every**
branch's requested `maxAstNodes` and `maxRedirects` before any P4 call. Branch
count must also fit. Each branch needs explicit version 1 reservation values;
its AST allowance must be positive. Duplicate queries reserve separate
allowances. No pruning, failure, early return or low actual usage refunds a
reservation. Authored query budgets and fingerprints are never rewritten to
fit the aggregate policy.

Malformed policy or unavailable branch reservation values produce
`admission.status: invalid`. Exceeded limits or sum overflow produce `denied`.
Both return no query calls, no handoff and `queryValidation:not-run`. Overflow
totals are `null`, with individual safe integer allocations retained and a
typed diagnostic; no rounded total is reported. Denial is an admission outcome,
not a factual no-answer result. A source-only plan may use zero branch/AST/
redirect capacities because it dispatches no query.

An admitted policy reports `limits`, per-branch `allocations`, and `reserved`
AST/redirect totals. Missing policy reports `admission.status:not-requested`;
initial structural failure reports `not-run`. Neither supports a claim that
aggregate admission was enforced. Full host trials must use an admitted policy.

`work` distinguishes declared branch count, actual `queryValidationCalls`,
returned validations, and each branch's status in authored order. It retains
actual P4 `used` values as per-branch `observed` metrics, including partial
owner counters on typed failure. Aggregate `observed` sums AST nodes and
redirects and takes maximum AST depth; a missing owner metric makes that
aggregate field `null`. `knownObserved` separately combines the available
observations, never filling gaps with invented work. Safe-range overflow also
returns `null`; individual observations remain inspectable. Zero calls have
zero aggregate query observations, while unvalidated branches retain `null`
observations and `not-run` status. Hard query errors remain invalid query
results. Unexpected errors propagate, and the host must record the failed
attempt without assuming unavailable engine counters are zero.

The scope is `query-validation-reservations`. The explicit `excludedWork` list
includes initial plan structural validation, loading, record selection,
registry indexing, complete captured-input fingerprinting, and query execution.
These limits bound branch dispatch and aggregate requested AST/redirect
allowances; they are **not** a global CPU, memory, input-byte or elapsed-time
bound. Fingerprint work is not metered or assumed shared across duplicate
queries. Captured-input preparation needs a separate measured admission
contract. Runtime and input metadata remain the actual P4 output; no capture
or date fingerprint is invented when admission prevents query validation.

The host tool/operation ceiling is independent: one host call can contain many
query validations. Both limits and their different measurement units must be
recorded. The default structural CLI mode does not run this admission path.

## Explicit CLI mode

```sh
node payload/engine/intent-plan.js plan.json --validate-queries \
  --root /absolute/repository/root --admission admission.json \
  --decision-captures captures.json --json
```

In a copied kit use its `engine/intent-plan.js` path; `--root` remains the
repository root. Query mode requires explicit `--root` and `--admission`.
The admission file contains the bare version 1 policy described above, not an
outer `admission` wrapper. There are no implicit numeric limits. All input file
paths resolve from the invoking working directory. Supplying query-mode flags
without `--validate-queries` or `--execute-queries` is a usage error.

`--decision-captures` is optional. Its file contains the exact P4 array of
`{capture,bytesBase64,objectFormat}` rows, decoded through
`decodeDecisionCaptures`. The actual `loadSubjectQueryContext` reads the
installation and evaluates the supplied retained bytes through P2. Omitted
captures mean unavailable evidence, never implicit approval or substitution of
current Decision contents for historical bytes. The query's actual subject
eligibility checks still apply.

Both query modes also accept optional `--assessment-captures`. This file is an
array of exact `{registry,identity}` pairs, each member using the same
`{capture,bytesBase64,objectFormat}` transport. The shared
`decodeAssessmentCaptures` decodes bytes; the owning governance evaluator
checks the retained pre-promotion registry/identity evidence. Omission means
unavailable evidence, with no fallback to current files. Structural mode
rejects this flag. Invalid transport and corrupt/duplicate evidence preserve
owner refusal codes; malformed JSON uses the CLI's sanitized usage error.

Both query modes accept optional `--material-captures` for reconsidered Subjects.
It contains `{capture,bytesBase64,objectFormat}` rows, decoded by the shared
`decodeMaterialCaptures` transport and passed with Decision and original
assessment captures to the real context loader. Structural/inspection modes
reject this query-context flag. Transport alone proves no approval, novelty or
selected-record content. Missing required material retains unavailable eligibility;
malformed, corrupt, duplicate and unrelated evidence retains the existing typed
refusal behavior. See the [consumer contract](ucs-1237-reconsideration-consumers.md).

With `--json`, successful context assembly returns
`{mode:'validate-queries',result,contextDiagnostics}`. `result` is the unchanged
domain result described above; context diagnostics are the actual loader
diagnostics, separate from plan/query diagnostics. Anticipated capture or
context refusal returns `{mode:'validate-queries',result:null,diagnostics}`
with actual owner refusal codes and no usable handoff.

Exit 0 means a valid domain result, including open inventory or unresolved
intent. Invalid plans, denied admission, unsupported/failed validation and
context refusal exit 2. Usage, file-read, malformed JSON, module and unexpected
failures also exit 2 through the standard harness. There is no exit 1. Input
JSON syntax errors identify the file role without echoing fragments of the
plan, policy or retained capture. Human output states readiness, admission,
query-validation status and the outstanding evidence handoff.

Context loading and governance assembly precede domain admission. A denied
policy guarantees no P4 query-validation calls, not zero loading/preparation
work. This distinction matches the explicit excluded-work list. The command
does not execute queries, inspect binding lookup claims, satisfy source
requirements, alter files, or automatically persist request content.

Default `intent-plan.js plan.json [--json]` behavior retains its original
structural JSON shape and YAML-independent loading. Query/context modules are
imported only for the explicit mode. The copied-runtime integration test uses
the real canonical fixture, schemas, retained source bytes and shared loader;
it does not establish that default seed activation or full host acceptance has
shipped.

Declared coverage cannot establish that the host identified every intent unit
or linked it faithfully. Identical prose is not promised to produce identical
interpretation. Real host trials, source adequacy review, captured-input work
limits and production performance evidence remain separate acceptance work.

## Explicit execution

```sh
node payload/engine/intent-plan.js plan.json --execute-queries \
  --root /absolute/repository/root --admission admission.json \
  --execution-admission execution-admission.json \
  --decision-captures captures.json --json
```

The two query modes are mutually exclusive. Execution requires both policy
files; validation-only rejects `--execution-admission`. Structural mode stays
YAML-independent. The library entry is
`executeIntentQueryPlan(plan, context, {admission, executionAdmission})` in the
same module. Both admission phases complete before any P4 query call. It then
validates all branches and their provenance before calling actual
`querySubjects(context, authoredQuery, {collect:'results'})` in authored order.
Queries are not rewritten or merged, and previous validation is never reused
as authority for execution.

The execution policy has exactly these fields: `version:1`, `maxBranches`,
`maxReservedAstNodes`, `maxAstDepth`, `maxReservedRedirects`,
`maxReservedHierarchyNodes`, `maxReservedHierarchyEdges`, `maxReservedRecords`,
`maxReservedPredicateSteps`, `maxReservedExplanationNodes`, and
`maxReservedResultSlots`. Limits are explicit nonnegative safe integers, with
no numeric defaults. Sum every authored branch's requested maxima, including
duplicates; depth uses the maximum. Result slots reserve `maxResultsPerStore`
times requested store count. No failed or unstarted branch refunds capacity.
Execution repeats query preparation, so its AST/redirect reservation is
separate from the validation reservation. Overflow refuses with null totals.

The JSON envelope is `{mode:'execute-queries',result,contextDiagnostics}`.
Context refusal uses the same mode with `result:null` and actual diagnostics.
The domain result retains unchanged validation, separate admission reports,
per-branch identity/kind/assumptions/relaxations and unchanged P4 results. A
zero-branch plan refuses rather than reporting completed execution. Valid
open/unresolved plans can execute hypotheses for discovery but retain their
original readiness. `bindingValidation` and `evidenceReview` remain `not-run`;
`handoff` is always null.

Each completed branch must have a comparable input fingerprint equal to its
own validation fingerprint. Mismatch refuses even an incomplete branch;
unavailable comparison refuses a nominally complete branch, keeping the raw
result for inspection. This binds captured inputs,
not an atomic filesystem snapshot. Stop at the first refusal or incomplete
execution; later branches stay explicitly not-run. Prior completed results
remain inspection-only. Domain refusal and incomplete retain their distinct
statuses even when preparation reported no fingerprint or resources.

Native branch execution reports use query `outputVersion:2`. Each branch retains
its own qualified `assignmentEvidence` table and ordered row assignment IDs;
expand through that branch's table only. Do not share evidence across branches
or reuse it as approval. The whole-plan reservations stay conservative and the
observed explanation count includes each branch's actual shared table. Query
validation and execution both fingerprint evaluator version 2. The intent
envelope remains version 1; shared API query-validation/execution operation output
versions are 2. See the [lossless query contract](ucs-1237-subject-query.md#lossless-output-version-2).

Complete evaluation remains separate from unknown eligibility, truncated
pages/explanations, ranking, and store coverage. All actual P4 coverage fields
remain available. Complete execution exits 0; refusal, incomplete execution,
usage and engine failures exit 2, never 1. An exit 0 does not certify a source
bundle or answer readiness.

Work reports actual execution calls/returns and per-branch observed counters.
Aggregate observed counters sum, except depth takes maximum; missing owner
metrics or safe-range overflow produce null. `knownObserved` retains partial
observations separately. No-call aggregates are zero; unstarted branch metrics
are null. Reserved result slots are not a fabricated usage counter.

Execution reservations exclude loader/selection work, assignment-list checks
and eligibility, membership comparisons, registry/governance binding and
reindexing, full input hashing, witness construction, failed explanation checks,
sorting, source-pointer/output bytes and unreported failed-call redirects.
They are not a global CPU, memory, byte or time limit. Independent measured
host limits, fresh record gates, source review and independent trials remain
required for the full retrieval workflow.

## Shared operation allowance (opt in)

Context-backed validation and execution accept optional `operation` in their
options. Use the authentic handle from `createSubjectOperation(limits)` and the
actual context loaded with that same operation. There is one context capture
attempt per operation, including failed attempts. Reuse the exact bound context
across all branches and phases; copying a context, replacing the handle, or
omitting it from a bound context refuses. Structural and binding-inspection modes
do not accept this profile.

Before structural traversal or copying, P5 guards the authored plan and admission
policies through that operation's document allowance. It forwards the identical
handle into every actual P4 validation/execution call, including validation nested
inside execution. Repeated visits remain cumulative. Existing whole-plan validation
and execution reservations remain separate and unchanged; both still precede branch
dispatch. An exhausted operation throws a host failure rather than a domain
incomplete result. Calls without a handle retain their existing unqualified behavior.

The CLI opts in with `--operation-limits-json '<inlineJSON>'`. The exact closed
limits object and [shared operation contract](ucs-1237-subject-query.md#shared-host-operation-opt-in)
are owned by P4. The inline argument has a fixed 16,384-byte UTF-8 preparse ceiling.
All plan, admission-policy and capture-transport reads, plus actual context loading,
share its source allowance. Parsed documents are guarded before further traversal;
Decision, assessment and material captures share actual predecode/raw admission
and proof work. Each decoded object is reused through context loading and
governance; separately decoded wrappers still consume their own capacity.
The operation is created before the first input-file read. No capacities are inferred
or increased by P5.

Normal JSON and human results keep their existing shapes, including domain refusals
and incomplete execution. The complete rendered result and newline use the shared
app-output allowance. Expected admission/usage/output failures exit 2 with the whole
receipt `{version:1,status:'host-failed',failure:{kind:'admission-refused',code,counter,phase}}`
only when it fits that same remaining allowance. The first failure is retained;
missing counter/phase values are null. After a valid operation exists, an unexpected
CLI exception uses `{version:1,status:'host-failed',failure:{kind:'internal-error',name,message,stack}}`
under the same rule. If a receipt cannot fit, including zero capacity, exit 2 is
silent; no smaller fallback or unbudgeted stderr is written. Bootstrap/module failures
before an authentic allowance exists are also silent. Programmatic domain calls and
command `main` without `{reportErrors:true}` preserve their original exceptions.

Usage snapshots are available through `getSubjectOperationUsage`, not new domain
fields or hidden CLI telemetry. Native parsing/allocation, serialization CPU/memory,
Node startup output and dependency/module loading retain P4's stated exclusions.
These tests establish adapter composition, not production capacities, workload
qualification, answer quality or complete protocol conduct.
