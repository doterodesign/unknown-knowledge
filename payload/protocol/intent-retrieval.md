# Intent, query discovery and source review

Use this workflow when a request combines meanings, scope or evidence
requirements, or needs explicit alternative interpretations. It supplements
the catalog navigation and RESOLVE → PREFLIGHT → GATHER loop in `AGENTS.md`.
The host interprets the request; engine results check declared structure and
captured queries. Neither result proves that the interpretation is complete
or that a source supports an answer.

## Preserve the request before narrowing discovery

Compare a transient inventory with the original request. Preserve every
material entity, relation, direction, comparison, use context, geographic or
temporal scope, and requested source standard. Distinguish explicit intent
from your inference. Keep uncertain or unsupported parts as unresolved units,
clarifications or source requirements; do not drop them to make a query pass.

For a request about red's use or effect across countries, retain red, the
use/effect direction, perceptual versus symbolic meaning, unspecified country,
use context and source limits. Culture may be a stated alternative; it is not
a mandatory inferred conjunct. Evidence about blue or symbolism does not
answer a red perceptual question merely because its metadata overlaps.

Enter relevant store catalogs and read their named entries as required by
`AGENTS.md`.

## Choose the required retrieval capability

Ordinary catalog, concept, Knowledge and Decision retrieval does not require a
Subject registry, Subject lookup or version 1 plan. Preserve the intent inventory,
material source requirements and unresolved alternatives above; follow `AGENTS.md`
for resolution, selected preflight, original-source review and scoped fallback.
Geographic scope, evidence requirements and alternative meanings alone do not
select the typed Subject path.

Use the typed Subject path only when the request needs declared Subject
identities, Subject-based bindings or governed Subject queries, and the selected
installation provides that authority. From the already established kit layout,
inspect the exact `<kit-root>/subjects/registry.yaml` path without recursive
discovery. An absent authority is an unavailable optional capability, not an empty
registry or a lookup with zero matches. A present malformed, unreadable or
nonregular authority is a failure, not optional absence. File presence does not
establish store health or validate the registry; the installed engine checks those.
Do not invoke a Subject command merely to probe availability.

If Subject semantics are required but the authority is absent, report that
capability as unavailable; do not silently substitute ordinary retrieval or invent
Subject IDs. When ordinary retrieval can meet the request, continue that path
without adding a registry. Keep unresolved meanings explicit until sources or
clarification settle them.

Inspect each engine result before launching the next dependent command. Any
actual engine exit 2 stops the governed task immediately, including further
metadata navigation in the same script. Optional capability routing never excuses
an exit 2 that has already occurred.

### Look up declared Subject meanings

On the typed Subject path, inspect meanings with the actual metadata lookup:

```sh
node unknown-knowledge/engine/subject.js lookup "requested label" --json --root .
```

Optional `--locale` and `--context` narrow the declared lookup options. Preserve
every returned homonym, definition and label/alias witness, including non-ASCII
matches. Read definitions and source context to disambiguate. If evidence does
not settle a material ambiguity, ask a concise clarification or keep labeled
alternatives. Do not choose the first match or silently turn an inference into
an exact alias. This command reports declared metadata, not governed eligibility.
Retain its namespace, revision, normalizer and registry digest with the lookup
claim; a changed captured context requires a fresh lookup.

## Build a transient version 1 plan

For the typed Subject path, build the plan below and follow its binding inspection,
validation and query execution steps. Ordinary retrieval still keeps the intent
inventory and follows the shared selected-record gates and source review below.

All fields below are required unless marked optional. Strings are nonblank;
section keys and reference lists are unique. `unitKeys` lists are nonempty.
Use opaque input/source handles when practical; they locate material in this
session and do not authenticate it. Keep the plan outside production logs.

| Object | Fields |
| --- | --- |
| Plan | `version:1`, `inputRef`, `inventoryStatus` (`open` or `declared-complete`), `units`, `bindings`, `constraints`, `requirements`, `branches`, `clarifications` |
| Unit | `key`, `sourceRef`, `disposition` (`mapped`, `grammatical`, `unresolved`) |
| Binding | `key`, `unitKeys`, `target` object, `label`, `basis` (`label`, `alias`, `inference`), `sourceRef` |
| Constraint | `key`, `unitKeys`, `origin` (`explicit`, `inferred`), `bindingKeys`, `queryRefs`, `requirementKeys` |
| Query reference | `branch`, `path` (exact JSON Pointer into that query) |
| Requirement | `key`, `unitKeys`, `description` |
| Branch | `key`, `unitKeys`, `kind` (`strict`, `alternative`, `recovery`), `query`, `assumptions` strings, `relaxes` constraint keys; recovery also requires `baseBranch` |
| Clarification | `key`, `unitKeys`, `prompt` |

Route each mapped unit to a constraint or source requirement. A binding alone
does not cover intent. An unresolved unit must reach a clarification, an
alternative, or source review. At most one branch is strict. Alternatives
state assumptions; recovery names a non-recovery base and exactly which
constraints it relaxes, retaining their affected units and source obligations.
Never overwrite the strict branch with a relaxed query.

A branch query requires `version:1`, a nonempty unique `stores` list drawn from
`knowledge`, `ontology`, `decisions`, a `where` predicate and explicit `budgets`.
Predicates are `all`, `none`, `subjects-present`, `assigned` with canonical
`subject`, `not` with `arg`, or `and`/`or` with nonempty `args`.

Use a canonical ID **string** in an assigned predicate:

```json
{"op":"assigned","subject":"S-000003"}
```

This is a predicate fragment, not a complete query or plan. Its Subject ID is
resolved within the installation loaded for that query. An intent binding's
`target` instead uses an object such as
`{"namespace":"12345678-1234-4234-8234-123456789abc","kind":"subject","id":"S-000003"}`.
Use the actual captured installation namespace in that binding. Do not copy the
target object into `where.subject`: the query validator refuses that shape.
A proposal that can be inspected during navigation is not a canonical assigned
operand. Source review and governed Subject eligibility still apply.

Defaults are `view:'all'`, `expansion:'direct'`, `subjectPolicy:'current'`,
`ranking:{profile:'id-v1'}`, `possibleMatches:false`. Supported alternatives
are `view:'current'`, `expansion:'self-and-descendants'`, and subject policy
`historical` or `equivalent`. Historical policy does not reconstruct an old
hierarchy. Missing assignments are unknown; explicit empty assignments are
known empty. NOT means recorded nonmembership, not a fact's absence.

Query budgets require `version:1`, positive `maxAstNodes` and `maxAstDepth`,
and nonnegative `maxHierarchyNodes`, `maxHierarchyEdges`, `maxRedirects`,
`maxRecords`, `maxPredicateSteps`, `maxResultsPerStore`, `maxExplanationNodes`.
Every value must be a safe integer. Obtain explicit finite limits from the
invocation or evaluation policy; these are not measured production defaults.

Every authored predicate/operator root and semantic selector needs an exact
branch-specific constraint reference. `/where` does not cover a child at
`/where/args/0`; pointers to `/where/subject` or budget fields do not cover
semantic predicates. Cover authored `/stores`, `/view`, `/expansion`,
`/subjectPolicy` and supported `/applicability`. Validator-generated defaults
remain separate from explicit user intent. After a stopping failure, report it
and use the diagnostics to propose a corrected plan for a subsequent authorized
attempt; do not continue the stopped task. Compare the proposed plan with the
request again; adding references alone does not prove faithful interpretation.

Omitting `expansion` uses the engine's `direct` default. If you author
`"expansion":"direct"` explicitly, also cover `/expansion` in the plan's
constraint references; writing the default explicitly still makes it an
authored selector. A host may impose additional invocation restrictions, which
do not change the native query grammar or permit continuing after exit 2.

Applicability is separate from subject membership, rank and lifecycle. The
supported query profile is Knowledge-only
`{profile:'legacy-jurisdictions-v1',mode:'any',jurisdictions:[...]}` with exact
minted jurisdiction values. Unsupported all/containment refuses; do not
replace it with any. A place subject does not establish applicability. Legacy
empty scope permits unrestricted inclusion but does not verify universal
source support. Evidence for one country does not establish a comparison's
other countries.

## Validate and execute explicitly

Inspect proposed bindings against the actual installation and the retained
lookup requests before relying on a label claim:

```sh
node unknown-knowledge/engine/intent-plan.js plan.json --inspect-bindings \
  --root . --lookup-requests lookup-requests.json --json
```

The lookup-requests file is an object keyed by each binding's `sourceRef`.
Each request has exactly `text`, `options` and `expected`. Retain the actual
subject lookup text/options; map its context values into expected fields:
`namespace`, `revision` (registryRevision), `normalizerVersion` (normalizer),
and `documentSha256` (registryDigest). Missing requests remain unavailable.
All homonyms stay visible. A stale digest cannot support the earlier claim,
even at the same revision. Inference stays inference; loaded record identity
alone does not establish a record-label lookup claim.

Inspection exits 0 when it runs, including unsupported/stale/unavailable row
outcomes. Read each row; there is no aggregate binding approval. Invalid plans,
loading failures and usage errors exit 2. Inspection is navigation-only and
does not require Decision/assessment/material captures or query admission policies.
It cannot be combined with a query mode. Subsequent query execution still
reports binding validation and evidence review as not-run.

Structural validation can run without loading query context:

```sh
node unknown-knowledge/engine/intent-plan.js plan.json --json
```

For captured query validation, add `--validate-queries`, `--root` and
`--admission`. To execute, use the separate mode below:

```sh
node unknown-knowledge/engine/intent-plan.js plan.json --execute-queries \
  --root . --admission validation-policy.json \
  --execution-admission execution-policy.json \
  --decision-captures decisions.json --assessment-captures assessments.json \
  --material-captures material.json --json
```

Use `payload/engine/` in the kit's own repository. Input file paths resolve
from the invoking working directory. The modes are mutually exclusive; the
execution policy is accepted only with execution. The bare validation policy
has `version:1`, `maxBranches`, `maxReservedAstNodes`, `maxReservedRedirects`.
The bare execution policy has `version:1`, `maxBranches`, `maxReservedAstNodes`,
`maxAstDepth`, `maxReservedRedirects`, `maxReservedHierarchyNodes`,
`maxReservedHierarchyEdges`, `maxReservedRecords`, `maxReservedPredicateSteps`,
`maxReservedExplanationNodes`, `maxReservedResultSlots`. All policy limits
are explicit nonnegative safe integers. Reserve all authored branches in both
phases, including duplicates. Depth uses maximum; result slots use the sum of
each branch's page size times store count. No pruning or failure refunds work.

Capture flags are optional transports, never approval shortcuts. Decision
capture files contain arrays of `{capture,bytesBase64,objectFormat}`. Assessment
files contain arrays of `{registry,identity}` pairs of those same capture
objects. For reconsidered Subjects, `--material-captures` supplies an array of
the same raw capture rows for cited record/source material; retain the original
assessment pair as well. Omit that flag when no material evidence is required.
These capture flags are rejected outside the query modes. Obtain the actual
retained evidence through the existing reviewed
capture workflow. Do not invent approval fields, copy current files as missing
historical proof, or reconstruct bytes from a digest. Missing evidence remains
unavailable and can refuse eligibility.

Read the actual envelope and branch results. Exit 2 stops this query operation;
report refusal or incomplete work, not a factual no-answer. Prior completed
branches are inspection-only after a later failure, and unstarted branches
remain not-run. An exit 0 can still retain open/unresolved intent, unknown
matches, page or explanation truncation, and limited store coverage. Do not
silently merge strict, alternative and recovery branches or strict/possible
result groups. A source-only plan without branches is structurally valid but
cannot report completed query execution.

Query output version 2 retains full assignment outcomes once in each branch's
`assignmentEvidence` table. Read a row's ordered `assignments.ids` against that
same result's namespace, purpose and policy; the table is not reusable approval.
Unknown assignments and known-empty lists remain distinct. Missing evidence
references are malformed output. Complete explanations still do not imply an
untruncated page or source adequacy. See the shared interface (contract arrives in PR6; see delivery availability)
for exact reconstruction and output-version discovery. Do not expand the table
into every row and then claim the compact output's byte usage.

Execution compares each branch's captured input fingerprint with its own
validation input. This is a captured-model check, not an atomic filesystem
snapshot or cached trust. Keep actual runtime/options/input versions and
fingerprints for permitted replay; never invent missing metadata. The engine
does not promise identical interpretations of identical prose.

Reservations cover selected query counters. They exclude substantial loading,
parsing, capture/governance checks, assignment processing, full hashing,
witness construction and output bytes. Respect independent host operation,
source-read and output limits. Report unavailable measurements as unavailable,
not zero. A larger policy or retry does not erase the original failed attempt.

When the host supplies an explicit shared operation profile, query modes accept
`--operation-limits-json '<inlineJSON>'` in addition to the required plan
policies. This opt-in allowance covers instrumented input reads, document and
capture processing, shared query work and emitted output across the operation;
it does not replace branch reservations. Do not invent or enlarge its capacities.
If a complete result or failure receipt cannot fit the remaining output allowance,
the command can exit 2 without output. Treat that as a failed operation, not empty
evidence. Structural and binding-inspection modes do not accept this option.
Instrumented counters do not establish total CPU, memory or source-review bounds.

## Gate selected records, then review each requirement against sources

Keep a transient evidence set of every record whose claims you will rely on.
Follow catalog metadata for candidate selection; query eligibility and rank do
not grant trust. Before gathering relied-upon evidence, follow `AGENTS.md`:

- Select every canonical Ontology ID with `preflight.js --concepts` and every
  canonical Knowledge ID with `--leaves`, using the current injected `--today`
  date and actual repository root. Reconcile selected IDs with returned
  verdicts from this run. Apply the command exit and conduct rules first.
- Read Decisions' actual entries, status and supersession chain. Accepted
  Decisions establish team rationale, not external truth. There is no
  decision-preflight flag. Gate any supporting concepts/leaves separately.
- A selected redirect, dependency or successor gets its own fresh gate and
  source read. Competing successors and contradictions remain visible; date,
  score and list order do not choose policy. Draft/proposed records can be
  discovered but do not become usable evidence by appearing in results.

Read each selected leaf's body and original citations, and each selected
concept's original artifact pointer. Follow existing exit-1 conduct where it
permits direct source verification; exit 2 stops the governed task. A stage
label, absence of volatility, fresh lookup or prior gate is not source proof.
An inaccessible source leaves its claim unverified, not disproved.

For every original source requirement, retain a transient disposition:
`supported`, `limited`, or `unresolved`. Record the actual supporting record
IDs, fresh gate/check references, source path or URL and answer-bearing passage,
the contribution it supports, and its scope/limits. Keep contradictory or
inaccessible evidence alongside it. These are host judgments, not engine
entailment certificates or a new durable store.

A whole-record AND is discovery, not proof of a joined claim. Different
records or unrelated sections mentioning the requested subjects do not prove
their relation. Verify the requested direction, use context and scope in the
source passages. A partial source can support a scoped contribution without
answering the whole request. Preserve missing requirements in the answer as
limits or scoped abstention; do not make a generic absence claim from a
query miss, budget failure or source omission.

Before answering, compare the source dispositions with the original inventory,
including relaxed constraints and residual questions. Attribute only what was
actually read. Keep general knowledge and inference distinguishable from
recorded organizational facts. Source review never promotes records or
refreshes evidence dates automatically.

Use `AGENTS.md`'s existing scoped fallback and sanitized RECORD path for real
navigation/evidence gaps. Keep raw requests, transient plans, answers and
source contents out of production findings. A miss alone is not warrant for
taxonomy expansion; proposed changes still use existing helpers and gates.
