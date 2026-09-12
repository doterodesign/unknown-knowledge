# /knowledge-reflect — findings consolidation (PRD §8, D-019)

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
(D-010): the improvement loop's own changes pass normal review and CI.

## The evidence standard

Any gated change requires multiple corroborating findings — **one
correction is a data point, three are a pattern**. The threshold is three
distinct fragments — distinct meaning **independent resolution events, not
files** (defined in full under Minting conduct below; a re-opened entry's
`occurrences` dates each count, three logs from one session do not).
Single-occurrence noise never reaches the
review queue, or the humans stop trusting it and the graduation path dies
before it starts. Two hard qualifiers:

- **A dispute never counts as corroboration** — mutually contradictory
  corrections cancel, they do not add (see Disputed clusters below).
- Corroboration is per-cluster, never per-log: three findings about three
  different concepts are three data points, not one pattern.

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
Three fragments are distinct when each records a *separate occasion on which
the store failed to resolve the thing* — which in practice means a different
session, or the same session on a different date.

The case this rules out: one session that hit `stencil` three times in a
row and logged three fragments. That is **one** data point wearing three
filenames. Nothing was independently corroborated — the same agent, the same
ask, the same unresolved token — and minting from it would let a single
session vote three times. Cluster them as one.

The case it admits: a re-opened entry. Each date in `occurrences` is a
genuinely separate occasion (the issue fired again, later, after someone
thought it was closed), so each counts. Same for the same term surfacing as
query residue in one session and as a document candidate in another — two
occasions, two data points.

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
   rationale nobody wrote. A suppression uses the same shape and the same
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
| `logs/last-reflect.yaml` | prior cycles ran — read `cycles:` for archival counting (STAMP); this run appends its date, never rewrites history |
| Fragments at `status: proposed` | a prior reflect died between RECOMMEND and APPLY: those items are already on a recommendation list — re-present them at the gate as-is, never re-cluster them into new items |
| A store diff already applied but its justifying findings still `proposed` | the close-the-loop re-run never happened — run the filtered validators now; a check that never ran is a blocking defect |
| A `resolved`/`rejected` fragment whose issue fired again | **re-open, not duplicate**: transition the original back to `open`, never mint a sibling |

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
| The organizational fact is undocumented, or the topic is outside scope | No terminology repair. Keep the fact unknown; route in-scope evidence work through the existing cited kb-build handoff or hold the gap. Expected out-of-scope absence warrants no expansion. General knowledge may explain the topic but cannot establish a company fact. |

The recommendation must name its diagnosis, the intended accession/concept,
why a smaller repair would not suffice, and a nearby query that must **not**
gain an unrelated match. These are review evidence, not new log fields or a
new automatic corroboration mechanism. Retain the existing change categories:
a leaf revision remains a handoff even when accompanied by a vocabulary
decision; do not duplicate it as a second recommendation just to count a mint.

Read prior rejected/resolved fragments and relevant Decisions before raising
the item. A repeated rejection without changed evidence does not create a new
proposal. For a real recurrence, re-open the original fragment, carry the old
reason and any new evidence into review, and honor registry suppressions.
Preserve that reason in the review evidence before the transition: the helper
clears the current `reason` on reopening; it does not retain it in the fragment.
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
items point into `protocol/new-kind-pipeline.md` (D-005 — a parser is
never drafted and wired in the same session, and never by reflect).

Clusters below the threshold get **no item**: they stay `open` and age
(STAMP counts their cycles). Completion criterion: every cluster is either
on the list, explicitly held as under-corroborated, or flagged disputed —
none unaccounted for.

**On resume:** items whose fragments are already `proposed` are re-presented
as-is; only clusters never yet listed get new items.

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

Present the list in the conversation and transition each listed item's
justifying findings `open → proposed` — entering the review queue IS the
proposal:

```
node unknown-knowledge/engine/log-entry.js transition --file logs/findings/2026-07-01-00000001.yaml \
  --to proposed --date 2026-07-09 --root unknown-knowledge
```

The human decides **per item — approve / approve-with-modification /
reject — never as a bulk yes**. Record each outcome (it feeds the STAMP).
For every rejection, capture the human's reason and transition the item's
findings immediately — the helper refuses a reasonless rejection:

```
node unknown-knowledge/engine/log-entry.js transition --file logs/findings/2026-07-04-00000005.yaml \
  --to rejected --date 2026-07-09 --reason "steward: intended behavior, store is right" --root unknown-knowledge
```

Nothing is applied before its item is approved — proposal-first, agents
draft and humans approve. Completion criterion: every listed item has a
recorded outcome and every rejected item's findings are `rejected` with
the reason.

**On resume:** an item already approved but not applied goes straight to
APPLY; never re-ask a recorded outcome.

### 5. APPLY — approved diffs, then close the loop

Apply each approved ontology/Decisions diff (as modified, if
approve-with-modification). Knowledge-leaf changes, including only `terms`,
`concepts`, `paths`, or citations, go through kb-build; reflect never writes
them directly. Approval of a reflect handoff does not promote the downstream
draft: kb-build's citation check, draft stage and human gate still apply.

Run full structural validation so leaf, registry and Decisions changes are
checked even when no ontology concept changed:

```
node unknown-knowledge/engine/validate.js --root .
```

For changed concepts, also re-run **both validators filtered to exactly the
concepts the diff touched** — an id left off the list is a check that never ran:

```
node unknown-knowledge/engine/validate.js --concepts K-110 --root .
node unknown-knowledge/engine/validate-values.js --concepts K-110 --root .
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
  next cycle sees it with its history).
- **Exit 2** — **stop.** A check that never ran is a blocking defect,
  never a silent pass; no finding transitions to `resolved` over it.

Handoff categories (`knowledge-promotion`, `extractor-draft`) have no diff
to apply here: their findings stay `proposed` and resolve when the
downstream gate (kb-build / new-kind pipeline) lands — reflect reports
them as handed off.

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

Completion criterion: every approved item is either resolved over a green
filtered re-run, reverted-and-re-opened with the failure recorded, or
handed off — and no fragment was ever edited by hand (`log-entry.js` is
the only write path into `logs/`).

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

Then write the stamp — `logs/last-reflect.yaml` in the kit dir, plain
engine-readable YAML (the knowledge-audit heartbeat reads it for
days-since-last-reflect; the trust-graduation trigger reads the per-category
outcomes — this stamp is the only place either is observable):

```yaml
schema-version: 1
date: 2026-07-09              # this run — heartbeat: days-since-last-reflect
cycles: [2026-06-25, 2026-07-02, 2026-07-09]   # every run, appended
outcomes:                     # per-item approval outcome BY CATEGORY, this run
  concept-fix: { approved: 1, approved-with-modification: 0, rejected: 0 }
  ssot-repoint: { approved: 0, approved-with-modification: 0, rejected: 1 }
archived:                     # the rollup note for this run's prune
  - file: logs/findings/2026-04-02-9c11d0aa.yaml
    summary: "retrieval-struggle: K-130 alias missing"
    reason: uncorroborated after 3 reflect cycles
```

The stamp is reflect output, not a log fragment — it is the one file this
skill writes directly (never via `log-entry.js`, and never by another
skill). Append to `cycles:` and replace `date:`/`outcomes:`/`archived:`
with this run's values; prior cycles' dates are history, never rewritten.

Reflect declares done only when: every gate outcome is recorded in
`outcomes:`, every close-the-loop re-run was green (or its item
reverted/handed off), the stamp is written, and the whole bundle is on the
reflect PR. Then report: clusters formed, items recommended, per-category
outcomes, fragments resolved/rejected/re-opened/archived.

**On resume:** if fragments transitioned this cycle but no stamp carries
today's date, the cycle is unfinished — the prune and the stamp still
count as steps; a reflect that mutated the queue but never stamped is
invisible to the heartbeat.

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
stamped cycle dates in `logs/last-reflect.yaml` postdate its `date` (or
its latest `occurrences` entry, if re-opened) and its cluster never met
the evidence standard:

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
