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
distinct fragments (distinct sessions/dates; a re-opened entry's
`occurrences` dates each count). Single-occurrence noise never reaches the
review queue, or the humans stop trusting it and the graduation path dies
before it starts. Two hard qualifiers:

- **A dispute never counts as corroboration** — mutually contradictory
  corrections cancel, they do not add (see Disputed clusters below).
- Corroboration is per-cluster, never per-log: three findings about three
  different concepts are three data points, not one pattern.

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
node unknown-knowledge/engine/resolve.js --paths Sources/Sportsbook/Sport.swift --root .
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

### 3. RECOMMEND — the evidence-gated list

Build the recommendation list. One item per cluster that **meets the
evidence standard**; each item carries:

- **category** — one of the closed change-category vocabulary (additive,
  §3.5): `concept-fix`, `alias-addition`, `ssot-repoint`, `scope-widen`,
  `knowledge-promotion`, `extractor-draft`. Categories are what approval
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

Apply each approved diff (as modified, if approve-with-modification), then
re-run **both validators filtered to exactly the concepts the diff
touched** — an id left off the list is a check that never ran:

```
node unknown-knowledge/engine/validate.js --concepts K-110 --root .
node unknown-knowledge/engine/validate-values.js --concepts K-110 --root .
```

- **Exit 0 + 0** — the loop is closed: transition the item's findings
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
