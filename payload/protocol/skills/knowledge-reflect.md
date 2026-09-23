# /knowledge-reflect — findings consolidation (PRD §8, D-000019)

> Paths in this document are client-relative — relative to the vendored kit
> root after init (`ontology/…`, `engine/…`, `protocol/…`). In the kit repo
> itself these live under `payload/`. Commands are written to run from the
> **repo root** with the kit dir at its default name `unknown-knowledge/`;
> substitute your chosen kit dir name if it differs.

Sessions append findings; nobody judges them at capture time. This skill is
the judgment half — human-run, on cadence (weekly; daily at high finding
volume): read the fragment logs, cluster recurring signals, put a per-item
recommendation list in front of the human, apply what they approve, close
the loop with a validator re-run, and prune what never corroborated. You
operate under `protocol/AGENTS.md` throughout — every gate rule there binds
here, and its two `--root` conventions apply verbatim (store-reading CLIs
take the **repo root**; `log-entry.js` takes the **kit dir**).

Everything this run produces — applied diffs, transitioned fragments,
pruned fragments, the stamp — travels together as **one reflect PR**
(D-000010): the improvement loop's own changes pass normal review and CI.

## The evidence standard

This recommendation route requires multiple corroborating findings — **one
correction is a data point, three are a pattern**. The threshold is three
distinct fragments — distinct meaning **independent resolution events, not
files** (defined in full under Minting conduct below). A re-open date or a
new session is evidence to examine, never an independent vote by itself.
Single-occurrence noise never reaches the
review queue, or the humans stop trusting it and the graduation path dies
before it starts. Two hard qualifiers:

- **A dispute never counts as corroboration** — mutually contradictory
  corrections cancel, they do not add (see Disputed clusters below).
- Corroboration is per-cluster, never per-log: three findings about three
  different concepts are three data points, not one pattern.

Directly authorized corrections use their store's normal gates; this
recommendation threshold does not impose a second three-event requirement.

The corroboration rule is counted **by hand, here** — the engine never
counts it. `log-entry.js` appends fragments and transitions them; it has no
opinion about how many make a pattern, and no CLI reports a corroboration
score. Reflect is the judgment half, and this threshold is judgment.

### Residue and candidate findings — the misses that become edges

Sessions append two kinds of finding that can support reviewed repairs
(UCS-1160), both through `log-entry.js` like every other fragment:

- **Residue** — from `resolve`'s `decomposition.residue`: the non-stopword
  tokens no join consumed. Each fragment carries `resolved-context`, the
  operations, concept ids, and jurisdictions that *did* resolve in the same
  ask. A bare unresolved token is a finding nobody can act on; `stencil`
  unresolved in an ask that resolved `add-tool` and `eu-eaa` localizes
  the gap precisely enough that the minting decision writes itself.
- **Document candidates** — from `resolve --doc`'s ranked
  `candidates-ranked`: the document's own residue. Each fragment adds a
  `section` locator (document path, heading address, line or page), so
  clustering opens the section just-in-time instead of re-reading the
  document.

Cluster these by their `residue` terms, and read `resolved-context` (and,
for candidates, the located section) as the cluster's evidence. Zero
resolution is a normal outcome, not a miss — `resolve` says so in its own
payload; append a residue finding only when the topic plausibly should be
mapped.

## Minting conduct — how a miss becomes a deterministic edge

A corroborated residue cluster is evidence of recurring retrieval friction,
not proof that a new word is needed. Diagnose the failed route first (CLUSTER,
below): existing wording may already reach the concept while its leaf link or
source pointer is wrong. When a new word is the smallest supported repair,
minting it is a governed act. Four vocabularies can be minted from
reflect: **terms**, **aliases**, **operations**, and **domain classes**.

### What "three distinct fragments" means

The evidence standard counts **independent resolution events, not files.**
Three fragments are distinct only when evidence establishes separate occasions
on which the same supported route failed. Session/date are hints: different
sessions may repeat one event, and one session may contain separate events.
List counted, duplicate and uncertain observations with evidence pointers.
Missing identity or independence evidence stays uncertain, never another vote.

The case this rules out: one session that hit `stencil` three times in a
row and logged three fragments. That is **one** data point wearing three
filenames. Nothing was independently corroborated — the same agent, the same
ask, the same unresolved token — and minting from it would let a single
session vote three times. Cluster them as one.

The case it can admit: a re-opened entry with evidence of an actual new
occasion. `occurrences` preserves recorded dates, including repeated dates;
rows alone do not prove independence. Reopening three fragments from one event
on one day is still one event. Query residue and a document candidate count
separately only when their source observations establish separate occasions.

When in doubt, ask what the fragment is evidence *of*. A file is evidence
that someone pressed enter; an occasion is evidence that the store has a
hole. The threshold counts holes.

Three rules bind every one of them:

1. **Literary warrant, always.** A value is minted only when material
   exists to fill it. Corroboration says the word keeps coming up; warrant
   says there is something for it to hold. Both, or neither — a term minted
   on three findings with no material behind it is speculative shelving
   wearing evidence. Read the source before proposing: a candidate is a
   claim about the map until someone opens the document its `section`
   locator addresses.
2. **Evidence attached.** The proposal names the corroborating fragment
   paths verbatim, exactly as every other recommendation item does. A mint
   proposal without its findings attached is not reviewable and does not go
   on the list.
3. **One Decisions entry per minting.** Every minted value — each domain
   segment, each alias, each operation — carries its own entry recording
   the warrant and the evidence. Draft it from
   `templates/decisions/reflect-mint-proposal.yaml`; its `id` and `date`
   are deliberately invalid placeholders, so a proposal pasted unedited
   fails validation rather than reaching the Decisions store with a
   rationale nobody wrote. An unpublished Decision uses an exact
   `proposal:decision:<lowercase-v4-uuid>` key, not a dated or guessed
   canonical ID. Its draft consumes no ledger slot. A mint needing a new
   Decision must include the final canonical `D` identity and exact ledger,
   record, catalog and reference changes in the reviewed publication. Plan
   against `_identity.yaml` using a fresh publication UUID and review
   provenance; preserve existing allocations and recheck the merged candidate
   before publication. Neither planning nor gate approval alone allocates it.
   A suppression uses the same shape and the same
   entry: a refused term stays listed with `status: suppressed` so the next
   cycle that clusters the same residue can see it was already considered.

Minting is a `mint-proposal` item at the GATE like any other item —
proposal-first, agents draft and humans approve. Reflect never edits a
registry ahead of its approval, and never mints a child path segment whose
parent is unminted.

## Resumable by construction

A dead session costs the remaining steps, never a restart. **On entry,
detect existing artifacts and resume from the first incomplete step** —
each step below also carries its own "On resume" rule:

| Artifact found on entry | What it means |
|---|---|
| `logs/last-reflect.yaml` | read the versioned review-state contract below; only validated completed-review dates establish aging, never a process count or legacy stamp |
| Fragments at `status: proposed` | locate their immutable review item and bound outcome; resume pending approved work, present only unreviewed frontier items, and diagnose missing evidence instead of inferring approval |
| A store diff already applied but its justifying findings still `proposed` | the close-the-loop re-run never happened — run the filtered validators now; a check that never ran is a blocking defect |
| A `resolved`/`rejected` fragment whose issue fired again | **re-open, not duplicate**: transition the original back to `open`, never mint a sibling |

## Review state contract — one durable source for review and heartbeat

This is protocol-owned review evidence, not another truth-anchor store or an
approval service. Reflect writes its review artifacts directly outside log
fragments; `log-entry.js` remains the only fragment writer. Audit reads the
same contract without writing. Dates are quoted, injected real calendar dates.

Persist `reviews/reflect/<opaque-cycle-id>.yaml` relative to the kit root.
Resume that cycle ID; a new process never implies a new cycle. Explicitly
starting another cycle, even on the same day, uses a different ID.

| Review field | Contract |
|---|---|
| `schema-version` | `1` |
| `cycle-id`, `started-on` | Opaque filename stem and injected start date |
| `completed-on` | Optional, written once when review/accounting/prune completes; no earlier than start. Pending downstream repairs may remain. |
| `previous` | Previous review's kit-relative path, or `null` for the first review |
| `prior-heartbeat` | Optional on first review: `{file, sha256}` for exact preserved old stamp bytes; historical source only, never a completed review or gate vote |
| `items` | Ordered proposal items, possibly empty |
| `archived` | Append-preserved `{file, summary, reason}` rows for this cycle; one row per pruned fragment |

| Item field | Contract |
|---|---|
| `id` | Opaque, stable within this artifact; qualified identity is `(review path, item id)` |
| `findings`, `category`, `cause` | Original fragment paths, existing change category, primary diagnosis from the table below |
| `proposal` | `{file, sha256}` binding retained immutable recommendation bytes; hash is 64 lowercase hex characters |
| `replaces` | Optional `{review, item}` identifying the retained earlier proposal being reconsidered |
| `outcomes` | Append-preserved array of zero or one gate outcome; absence means unreviewed |
| `work` | Append-preserved `{date, status, evidence}` rows; status `pending` or `completed`, evidence a list of retained handoff/change/check refs |

The proposal names the exact diff/handoff, original sources and warrant,
uncertainty, affected replay cases and nearby negatives. Keep production
questions/transcripts/secrets out: use IDs, paths, opaque case references and
permitted sanitized residue/context. Sources are read, not copied into it.

A gate outcome is `{date, decision, proposal-sha256, evidence}`, plus a
sanitized `reason` for rejection. Decisions are `approved`,
`approved-with-modification`, or `rejected`; evidence points to the retained
actual gate response. The digest must match the exact final reviewed bytes.
Modified proposals and later reconsideration (even unchanged diff with new
warrant) create a NEW item with `replaces`, preserving the old item/outcome.
An old digest plus verbal modification is not approval of the final proposal.
Record an outcome before continuing another item. An interruption before
durable recording leaves that item unresolved; `proposed` never means approved.

An approved item begins `pending`. Append `completed` only after the actual
change lands and ALL acceptance succeeds. Handoff acceptance, green validators
alone or a missing fresh-agent trial cannot complete it. Work evidence may
append to the originating artifact after its review completes; this never
changes `completed-on`. Repeat state/evidence on resume appends nothing. Read
the latest valid work state, retaining every earlier row. No field authenticates
human approval; source/gate/check evidence must be inspected.

Derive the **current proposal frontier** only after validating the entire
retained review chain, including every `replaces` reference and bound hash.
A frontier item is a qualified `(review path, item id)` with no valid successor
whose `replaces` names it. Unreviewed predecessors remain immutable history;
never invent outcomes for them. Only unreviewed frontier items require votes.
Two unreviewed successor leaves both remain in the queue; one approved and one
unreviewed successor does not invalidate the graph or erase approved work.
Never choose a successor by item order. Competing approved replacements remain
`chain-error`, as do malformed/missing targets, self-links, cycles, invalid
hashes/evidence or exhausted traversal budgets: stop reflect mutations and
report no authoritative frontier, completion, aging or totals.

The frontier controls gate obligations, not repair accounting. An approved
replacement retires prior pending work only when its bound gate
explicitly authorizes replacing that item. A draft replacement cannot hide
approved pending work. Missing targets, cycles or competing approved successors
are incomplete evidence, never a last-row-wins choice. Replacing a completed
proposal cannot manufacture another completed repair.

### Read and write the state without losing history

Traverse `previous` with a visited-path set. Default finite host limits are
100 review artifacts, 1,000 items and 10,000 combined outcome/work/archive rows.
Record limits and usage; an explicitly recorded finite invocation may change
them. These are workflow caps, not measured scale promises or engine flags.
Exhaustion, missing/unreadable references, duplicate qualified items, changed
proposal hashes, absent gate/check evidence or invalid shape means incomplete
history: report the concrete problem and no authoritative totals/aging. Stop
reflect mutations until resolved; audit continues its report with this defect.
Paths stay inside the declared kit-relative review/evidence scope. Operative
dates cannot be future relative to the injected evaluation date.

Keep prior proposal/gate bytes immutable and all item/outcome/work/archive rows
append-preserved. Replace an artifact using a temporary sibling and rename
only after checking that the original bytes have not changed since reading.
Write evidence/artifact first, heartbeat second. This is not multi-file atomic
publication: interruption can leave a stale summary. Diagnose/reconstruct it
from retained evidence without inferring missing outcomes or replaying gates.
Git review handles concurrent changes; never overwrite detected drift.

On adopting this contract, preserve an existing valid v1/date-only stamp's
EXACT bytes, including uncommitted history, at
`reviews/reflect/prior-heartbeats/<opaque-id>.yaml`; verify SHA256 and bind
`prior-heartbeat` before replacing the old file. No invented review items,
approval history or completed dates. Missing old stamp needs no placeholder.
Malformed/unreadable old state is a reported problem, never silently replaced.

### Heartbeat schema 2 — derived summary, not approval evidence

Use only kit-relative `logs/last-reflect.yaml`, including the audit reader.

| Stamp field | Meaning |
|---|---|
| `schema-version` | `2` |
| `review` | Active/latest review path, even while in progress |
| `date` | Latest validated completed-review date, or `null` when none exists |
| `cycles` | Unique ascending completed-review dates from reachable artifacts |
| `outcomes` | Current-cycle per-category counts of actual approved/approved-with-modification/rejected gate outcomes; each once |
| `archived` | This cycle's archival rows, derived from its artifact |
| `work` | `{completed, pending}` for distinct approved non-superseded items across the ENTIRE retained chain, using latest valid work states |

Rejected/unreviewed proposals are neither completed repairs nor approved pending
work. Prior rejection and replacement-item approval both remain counted as
their actual gates in that cycle. Resume/work updates never multiply approvals.
At start/resume point `review` at the artifact while keeping the last completed
date/cycles; first-ever cycle uses `date: null`, `cycles: []`. Work completion
refreshes work totals without advancing review dates. Report the two scopes:
current-cycle gates/archive versus cumulative retained approved repair work.

An absent stamp means **no recorded reflect heartbeat**, not proof no work ever
happened. A valid v1/date-only stamp permits age of its recorded timestamp ONLY;
completion, governed aging, outcomes and pending-work totals are unavailable.
No backfill. Malformed/unreadable/future/inconsistent state gets an explicit
diagnostic and no trustworthy numerical age or totals. A schema-2 summary must
agree with its retained artifacts; a stale summary is not a new completion.

## The six steps

```
1. SWEEP      read-only: inventory open/proposed fragments in logs/
2. CLUSTER    group by concept/path/trigger; flag disputed clusters
3. RECOMMEND  evidence-gated per-item list, justifying findings attached
4. GATE       human approves/rejects PER ITEM — never in bulk
5. APPLY      approved diffs + filtered validator re-run close the loop
6. STAMP      prune uncorroborated-after-N; write logs/last-reflect.yaml
```

### 1. SWEEP — inventory the queue, read-only

Read every `open` and `proposed` fragment under `logs/findings/` (and the
sibling logs — `logs/misses/`, `logs/gaps/` — same lifecycle, same
machinery). Fragments are one-file-per-entry and small: grep is free,
reading a fragment is cheap, and the fragment IS the entry — there is no
index to consult. `resolved`/`rejected` fragments are swept only to catch
recurrences (re-open, not duplicate).

The sweep is bounded by `survey-scope.yaml` — the honor-it contract from
bootstrap. Findings pointing outside the confirmed scope are widening
signals (`scope-widen` items, below), **never** cause to re-litigate the
gate or rescan excluded areas.

**On resume:** always safe to re-run — the sweep writes nothing.

### 2. CLUSTER — group signals, flag disputes

Group the swept fragments into clusters by, in order of preference: the
`consulted:` concept refs, the file paths named in `summary`, then the
trigger kind. A path-only fragment joins a concept cluster via the reverse
lookup:

```
node unknown-knowledge/engine/resolve.js --paths Sources/Canvas/CanvasTool.swift --root .
```

Completion criterion: **every swept open fragment is in exactly one
cluster** — a fragment that fits nowhere is its own cluster of one (that is
what uncorroborated means), never silently dropped.

While clustering, flag every cluster whose corrections **mutually
contradict** (two findings asserting opposite facts about the same claim)
as `disputed` — a cluster flag for this run, never a fragment status. A
disputed cluster does not proceed to RECOMMEND on its correction count;
it takes the Disputed-clusters procedure (below) first.

**On resume:** re-cluster from the current fragments — clustering is
derived, never stored; `proposed` fragments keep their prior item
membership (see the resume table).

#### Diagnose the failed route before proposing a repair

For each retrieval cluster, distinguish the **same supported problem** from
mere word overlap. Group by intended concept/leaf and the route that failed;
unrelated asks sharing a residue token do not corroborate each other. Show the
session/date events counted and which fragments are duplicates of one event.
Do not count repeated records of that event again. Missing event identity is
uncertain evidence, not permission to assume independence.

Replay the observed wording through public `resolve`, keeping the query and
options fixed for a later before/after comparison. Use a privacy-safe fixture
paraphrase when the original contains private text; never copy user text into
committed findings. Preserve the CLI output and the recovery route in the
review evidence. Enter stores through their catalogs/rules and read the
intended leaf and source, including a candidate's located section. Findings
report a struggle; only those reads establish what repair the material supports.

| Diagnosis | Smallest supported proposal and existing write path |
|---|---|
| The wording misses an existing concept | One observed alias on that concept (`alias-addition`), proposal-first ontology review, with the minting Decisions entry and its warrant. Do not enumerate speculative synonyms. |
| The concept resolves but its intended leaf is absent | The leaf's `concepts` edge (`knowledge-promotion` handoff to kb-build), after checking the leaf is actually about that concept. Do not substitute aliases for a missing relationship. |
| The leaf itself needs the observed search wording | A minimal `terms` revision (`knowledge-promotion` handoff to kb-build), with the minting Decisions provenance. Even a frontmatter-only leaf change uses kb-build. |
| The concept reaches an inaccurate source | `ssot-repoint`, with a freshly read replacement pointer and any matching `enumerates.source` change; do not hide the wrong pointer behind a vocabulary change. |
| Existing material needs an unminted operation or domain | `mint-proposal`, only with literary warrant and the existing registry/Decisions gate. A query miss alone does not warrant a new domain. |
| Missing metadata | Repair only the evidenced missing field through its store gate; a Knowledge `subjects`-only edit is still a kb-build handoff. |
| Wrong classification | Review the record's actual scope and classification warrant; propose correction through its store gate, never an automatic tag adjustment. |
| Broad record scope | Consider narrower records/source locators through the owning authoring gate; co-assignment cannot prove a joint claim in unrelated sections. |
| Planner misinterpretation | Preserve dropped constraints/alternative meanings in privacy-safe replay evidence; hand off to intent-protocol review, not taxonomy training. |
| Ranking | Preserve eligible candidates and expected source relevance; hand off the ranking defect to engine review. More hits or higher scores do not prove a repair. |
| Applicability | Check source jurisdiction/context and requested scope; abstain or route an evidenced scope correction through its gate. Subject labels never supply applicability. |
| Stale sources | Route source re-verification to its steward; no automatic timestamp refresh, promotion or replacement of claims. |
| Missing in-scope evidence | Keep the fact unknown; use cited kb-build evidence work or hold the gap. General knowledge does not establish a company fact. |
| Expected out-of-scope absence | Record the boundary in review, with no defect/recommendation or automatic scope expansion. |

The recommendation must name its diagnosis, the intended accession/concept,
why a smaller repair would not suffice, and a nearby query that must **not**
gain an unrelated match. These are review evidence, not new log fields or a
new automatic corroboration mechanism. Retain the existing change categories:
a leaf revision remains a handoff even when accompanied by a vocabulary
decision; do not duplicate it as a second recommendation just to count a mint.
Use a primary cause in the item: `wording`, `missing-metadata`,
`wrong-classification`, `broad-record-scope`, `planner-misinterpretation`,
`ranking`, `applicability`, `stale-sources`, `missing-in-scope-evidence`, or
`expected-out-of-scope-absence`. The last normally stays in held review evidence
without an actionable proposal. Keep unsupported repairs held; never force a
planner/ranking defect into a store category just to put it on this queue.

Read prior rejected/resolved fragments and relevant Decisions before raising
the item. A repeated rejection without changed evidence does not create a new
proposal. For a real recurrence, re-open the original fragment, carry the old
reason and any new evidence into review, and honor registry suppressions.
Read the retained `prior-outcomes` when reopening: the helper snapshots the
previous terminal status and its `reason` or `verified` before clearing the
current fields. `reopened-on` records the injected reopening date, not an
invented original rejection date. Keep the reason and changed evidence in
review; a snapshot records an outcome, not authorization to reverse it.
Older fragments can lack this optional history; consult retained review/Git
evidence rather than inventing missing outcomes. The helper never backfills
history. Older strict validators do not accept `prior-outcomes`: use the
updated runtime and schemas together; there is no automatic client update.
Insufficient corroboration still means hold-and-age, never new siblings to
manufacture a threshold.

### 3. RECOMMEND — the evidence-gated list

Build the recommendation list. One item per cluster that **meets the
evidence standard**; each item carries:

- **category** — one of the closed change-category vocabulary (additive,
  §3.5): `concept-fix`, `alias-addition`, `ssot-repoint`, `scope-widen`,
  `knowledge-promotion`, `extractor-draft`, `mint-proposal`. Categories are what approval
  outcomes are recorded against (STAMP) and what trust graduation is
measured per — a miscategorized item corrupts the graduation signal.
- **the concrete diff** — the exact store change proposed (fix a concept's
  descriptor, add an alias, repoint an SSOT, widen `survey-scope.yaml`,
  promote a finding to knowledge, draft an extractor). Draft it from the
  **source artifact, never from the findings' prose** — the map is never
  the fact, and a finding is a claim about the map. Follow the concept's
  pointer and read the file before writing the diff.
- **the justifying findings** — the cluster's fragment paths, verbatim.
  An item without its evidence attached is not reviewable and does not go
  on the list.

Two categories recommend a *handoff*, never a direct diff:
`knowledge-promotion` items point into the kb-build skill (the sole
knowledge write path — reflect never writes a leaf); `extractor-draft`
items point into `protocol/new-kind-pipeline.md` (D-000005 — a parser is
never drafted and wired in the same session, and never by reflect).

Clusters below the threshold get **no item**: they stay `open` and age
(STAMP counts their cycles). Completion criterion: every cluster is either
on the list, explicitly held as under-corroborated, or flagged disputed —
none unaccounted for.

**On resume:** load persisted immutable items and outcomes before presenting
anything. A fragment at `proposed` locates work, not its gate decision. Only
unreviewed frontier items need review; changed proposals require linked new
items. A draft successor does not retire approved pending work.

### 4. GATE — per-item human approval

**The moderator's interface is the reflect queue, not the store.** A human
governing this system reviews what reflect puts in front of them; they do
not browse `knowledge/` or `ontology/` looking for things to fix. Browsing
a store is unbounded and finds whatever the eye lands on, while the queue
is bounded, evidenced, and complete — every item carries its justifying
findings, and every swept fragment is accounted for. The queue has exactly
four sections, presented in this order:

| Section | What it holds |
|---|---|
| **Mint proposals** | `mint-proposal` items — the proposed value, its literary warrant, and the corroborating fragments, one draft Decisions entry each |
| **Corroborated findings** | every other item that met the evidence standard, with its concrete diff and its justifying fragment paths |
| **Drafts awaiting promotion** | handoff items (`knowledge-promotion`, `extractor-draft`) — drafted here, written elsewhere; reflect reports them as handed off, never writes them |
| **Sampled spot-checks** | a sample of what reflect did NOT raise — under-corroborated clusters and fragments due to age out — so the moderator can audit the threshold itself rather than only the items that cleared it |

The spot-check sample is what keeps the queue honest: without it the human
only ever sees what the evidence standard admitted, and a threshold nobody
audits is a threshold nobody can tune. Present the sample as
under-corroborated, explicitly — it is context for judging the queue, never
a recommendation, and approving one does not bypass the standard.

Present the four-section queue; only unreviewed frontier items require new
votes. Transition each newly presented item's
justifying findings `open → proposed` — entering the review queue IS the
proposal:

```
node unknown-knowledge/engine/log-entry.js transition --file logs/findings/2026-07-01-00000001.yaml \
  --to proposed --date 2026-07-09 --root unknown-knowledge
```

The human decides **per item — approve / approve-with-modification /
reject — never as a bulk yes**. Record each outcome (it feeds the STAMP).
Before a finding transition, inspect every retained item referencing it. If
the transition would contradict another unreviewed frontier item's or approved
pending item's required finding state, retain the actual bound gate outcome
and evidence, then report `finding-lifecycle-conflict` with the finding,
requested transition and blocking qualified items. Stop before any finding or
repair mutation; do not reject, resolve, reopen, duplicate or reassign a finding
to force progress. The graph may remain valid, but GATE is incomplete and this
cycle cannot receive `completed-on`. The current contract defines no
reconciliation operation for this conflict: it is terminal for reflect mutation
under this contract and requires a separate future contract change. Another
moderator vote, new cycle or ad hoc transition is not a supported resume path.
Read-only inspection and reporting may continue.

Without that conflict, capture each rejection's human reason and transition
its findings immediately — the helper refuses a reasonless rejection:

```
node unknown-knowledge/engine/log-entry.js transition --file logs/findings/2026-07-04-00000005.yaml \
  --to rejected --date 2026-07-09 --reason "steward: intended behavior, store is right" --root unknown-knowledge
```

Persist each bound outcome in its review item before proceeding to the next;
retain rejection evidence even if findings later reopen. Nothing is applied
before its item is approved — proposal-first, agents
draft and humans approve. GATE is complete when the validated frontier has
no unreviewed item, every frontier outcome binds its exact proposal, and each
new rejection's finding transitions and reason are durably recorded without a
lifecycle conflict. Retained predecessor outcomes keep their original decisions;
later reopening never causes a historical rejection to be replayed. Gate closure
neither completes repair work nor writes `completed-on`: the existing
review/accounting/prune requirements must also finish.

**On resume:** an item already approved but not applied goes straight to
APPLY; never re-ask a recorded outcome.

### 5. APPLY — approved diffs, then close the loop

Before applying a repair, check its prospective finding transition against the
GATE shared-finding guard; a lifecycle conflict stops before the repair too.
Apply each approved ontology/Decisions diff (as modified, if
approve-with-modification). Knowledge-leaf changes, including only `terms`,
`concepts`, `paths`, `subjects`, or citations, go through kb-build; reflect never writes
them directly. Approval of a reflect handoff does not promote the downstream
draft: kb-build's citation check and human gate still apply. New records and
content/source revisions follow its draft/promotion path. For an existing
published leaf changed only in `subjects` and classification history, kb-build
preserves the canonical identity, current stage, body/citations/scope, evidence
dates and Phoenix edition/accounting. Follow kb-build's exact subjects-only
rule: preserve the original frontmatter provenance object and existing notes
unchanged, append only the reviewed `revision`-note suffix, and retain separate
assignment history. The change proposal stays
unpublished until the same human gate; it is not a new record proposal key or
evidence refresh. Actual active, reviewed subject eligibility is required for
new effective assignments; no assignment is inferred from a query or facet.

Run full structural validation so leaf, registry and Decisions changes are
checked even when no ontology concept changed:

```
node unknown-knowledge/engine/validate.js --root .
```

For changed concepts, also re-run **both validators filtered to exactly the
concepts the diff touched** — an id left off the list is a check that never ran:

```
node unknown-knowledge/engine/validate.js --concepts O-000001 --root .
node unknown-knowledge/engine/validate-values.js --concepts O-000001 --root .
```

- **All required validators exit 0** — continue to the discovery verification
  below. Only after it passes, transition the item's findings
  `proposed → resolved` (the helper stamps `verified` with the run date).
  A finding is never resolved ahead of the green re-run — green first,
  then the transition.
- **Exit 1** — the applied diff disagrees with the source: re-read the
  source and fix the diff, then re-run. If it cannot be made green this
  session, revert the diff and return the item to the queue with the
  failure on record: `--to rejected --reason "re-validation failed: …"`,
  then `--to open` (re-open, not duplicate — the signal is not lost, the
  next cycle sees it with its history). Preserve the original gate outcome;
  this failed work does not turn an approval into a steward rejection.
  Keep its work pending with failure evidence; a revised proposal requires
  a linked replacement item and its own gate.
- **Exit 2** — **stop.** A check that never ran is a blocking defect,
  never a silent pass; no finding transitions to `resolved` over it.

Handoff categories (`knowledge-promotion`, `extractor-draft`) have no diff
to apply here: their findings stay `proposed` and resolve when the
downstream gate (kb-build / new-kind pipeline) lands — reflect reports
them as pending handoffs, retaining the handoff reference in `work`.

For a retrieval repair, close the loop over the final approved records,
including any completed kb-build handoff:

1. Regenerate and check disposable discovery using the same injected date
   (`protocol/derived-layer.md`), never by editing generated files:

   ```
   node unknown-knowledge/engine/derive.js --root . --today 2026-09-10 --write
   node unknown-knowledge/engine/derive.js --root . --today 2026-09-10 --check
   ```

2. Replay the saved public resolver query/options and the nearby negative
   query. Verify the intended ID and navigable leaf/source, fewer recovery
   steps, and no incorrect broadened match. A green derive check alone does
   not prove recall: the resolver reads authored stores, not the derived index.
   Keep input/runtime versions, injected date, query/options and finite replay
   budgets fixed. An independent reviewer freezes held-out source-relevance,
   scope and abstention cases before repair; the repair agent does not see their
   answers. Report newly failing cases and raw denominators, not just more hits.
   A disclosed/tuned-against case becomes development evidence, not held out.
3. For the acceptance walkthrough, run a **fresh agent** on the same request
   with no proposed alias, target ID, answer, or earlier trace in its prompt.
   Preserve actual commands, consulted sources/leaves, leaf-specific preflight
   with the injected date, answer, and navigation steps. Compare correctness
   and recovery effort, not just matching scores. A checklist or static prompt
   assertion is not an agent trial; if a required trial cannot run, report it
   pending rather than claiming completion.

Nonzero checks, an unrepaired route, or a new incorrect match keep the findings
unresolved. Use the failure/reopen procedure above for an applied defective
repair; an exit-2 check still stops the run. Preserve original authored records
as the source of truth and attach the before/after evidence to the reflect PR.
An interrupted retrieval repair must finish these checks before resolution,
even if its concept validators passed before the interruption.

Completion criterion for a repair: the landed change and every required check
pass, with evidence retained; only then append completed work and resolve its
findings. A review cycle may finish with pending handoffs, failed/reopened work
or unavailable trials, but those repairs remain explicitly pending. No fragment
is edited by hand (`log-entry.js` is its only write path).

**On resume:** per the resume table — an applied diff whose findings are
still `proposed` gets its filtered re-run now, before anything else.

### 6. STAMP — prune, then make the cycle observable

First the hygiene prune (Archival mechanics below): every `open` fragment
still uncorroborated after **N reflect cycles** (default **N = 3** — this
file is client-owned protocol markdown; tune N by editing it here) is
archived — the fragment file is deleted in the reflect PR and a rollup
line records it in the stamp. Completion criterion: every open fragment
was either kept (with its cycle count still below N) or archived with a
rollup line — none skipped.

Persist archival rows before deleting eligible fragments. Complete the review
artifact's accounting, then set its `completed-on` once. Derive the schema-2
stamp under the review-state contract above. A first in-progress cycle with no
approved items has this shape (replace the opaque example review path):

```yaml
schema-version: 2
date: null                   # days-since-last-reflect unavailable: no completed review
cycles: []                   # distinct completed-review dates only
review: reviews/reflect/cycle-a.yaml
outcomes: {}                 # per-item approval outcome BY CATEGORY, this cycle
archived: []                 # this cycle; historical rows stay in review artifacts
work: { completed: 0, pending: 0 }  # retained approved work across the chain
```

The stamp is reflect output, never a fragment and never written by audit.
Keep review/proposal/gate/work/archive evidence in the reflect PR along with
the summary. Report review completion separately from actual repair completion:
clusters, recommendations, gate counts, resolved/rejected/reopened/archived
findings, and pending work with handoff/failure/trial references. A completed
review with a pending kb-build handoff is not a completed repair.

**On resume:** load the referenced artifact, inspect retained outcomes and
refresh a stale summary only after validation. Today's stamp date is not the
resume signal: an in-progress review retains its prior completed date, and a
same-day completed review may still have unfinished downstream work.

## Disputed clusters — resolve by reading the SSOT

When a cluster's corrections mutually contradict (flagged in CLUSTER):

1. **Read the SSOT** — follow the concept's `source-of-truth` pointer and
   read the file; the map is never the fact, and neither is either finding.
   Cite what you read (path and line) — the citation is the resolution's
   evidence.
2. Where the descriptor is machine-checkable, let the engine confirm the
   read: `validate.js` / `validate-values.js` filtered to the concept.
3. Transition each finding on the side the SSOT **contradicts**:
   `open → proposed`, then `--to rejected --reason` citing the SSOT read
   (path, line, what it declares).
4. The side the SSOT **supports**: if the store already agrees with the
   source, the finding resolves over the green filtered re-run (step 2);
   if the store is wrong, the surviving findings re-enter CLUSTER as an
   ordinary cluster — which must meet the evidence standard **on its own
   count**: a dispute never counts as corroboration, so the contradicted
   exchange adds nothing.
5. If the SSOT itself is ambiguous (the pointer is stale, the file does
   not decide it), the cluster goes to the GATE as a flagged question for
   the human — never as a recommendation, and never silently dropped.

## Archival mechanics — uncorroborated `open` findings

Unbounded open fragments drown reflect by month ten; the prune keeps the
queue trustworthy. An `open` fragment is **archived** when at least N
distinct validated completed-review dates in `logs/last-reflect.yaml` strictly postdate its `date` (or
its latest `occurrences` entry, if re-opened) and its cluster never met
the evidence standard:

Same-day cycles count once; legacy date-only stamps and incomplete histories
supply no aging evidence. Pending/proposed items do not age out under this rule.
This includes findings reopened to `open` after failed approved work while the
retained review still records that work as pending.

- **Delete the fragment file** in the reflect PR — git history preserves
  it; the deletion is reviewable like any other change. This prune is the
  one sanctioned deletion in `logs/` (the AGENTS.md rule against deleting
  findings guards gate-bypass, not consolidation) — it happens only here,
  only in a reflect PR, only with a rollup line.
- **Record the rollup line** under `archived:` in the stamp: fragment
  path, one-line summary, `uncorroborated after N reflect cycles`.
- `archived` is **not a status** — `log-entry.js` has no such transition
  and hard-errors on it; never try to transition a fragment there.

If an archived signal was real, it will fire again — the new fragment
starts a fresh cluster with a fresh count, and the rollup note in git
history is the paper trail that it aged out once before.
