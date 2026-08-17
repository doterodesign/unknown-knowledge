# A5 walkthrough — /knowledge-reflect consolidates seeded findings on fixtures/swift-app

Acceptance criterion A5 (PRD §10): *an agent following only
`payload/protocol/skills/knowledge-reflect.md` runs a full reflect cycle
correctly* — clustering, the evidence-gated recommendation list, per-item
approval, apply + green re-validation, lifecycle transitions, the
`last-reflect` stamp. This is the scripted checklist for a human to run
with a fresh agent — documented acceptance runs are the honest seam:
protocols are prose, so their test is a checklist, not CI. Time the run
(A5 walkthroughs are wall-clock timed).

Every expected observation below was produced by actually running the
commands (kit @ this branch, 2026-07-09); outputs are pasted byte-honest.
Fixed `--suffix` values make the fragment file names deterministic too.

## Setup (the human, not the agent)

The swift-app fixture ships with planted drift on K-110 (claims `eyedropper`,
misses `comment` — its A3 role) — exactly the situation that produces
correction findings in the field. Seed a week of them:

```sh
export KIT="$PWD/payload"            # engine lives here in the KIT repo;
                                     # in a client repo it is <kit-dir>/engine
rm -rf /tmp/a5-reflect && cp -R fixtures/swift-app /tmp/a5-reflect && cd /tmp/a5-reflect
git init -q . && git add -A
mkdir -p unknown-knowledge/logs/findings unknown-knowledge/logs/misses unknown-knowledge/logs/gaps

# Three corroborating corrections about K-110 (one concept, three sessions):
node "$KIT/engine/log-entry.js" create --log findings --date 2026-07-01 --suffix 00000001 \
  --root unknown-knowledge \
  --entry '{"trigger":"correction","summary":"correction: K-110 enumerates disagrees with Sources/Canvas/CanvasTool.swift — claims eyedropper, misses comment","consulted":{"concepts":["K-110"]},"session":"s-3f81"}'
node "$KIT/engine/log-entry.js" create --log findings --date 2026-07-03 --suffix 00000002 \
  --root unknown-knowledge \
  --entry '{"trigger":"correction","summary":"correction: K-110 lists eyedropper; Sources/Canvas/CanvasTool.swift has no such case","consulted":{"concepts":["K-110"]},"session":"s-77c0"}'
node "$KIT/engine/log-entry.js" create --log findings --date 2026-07-06 --suffix 00000003 \
  --root unknown-knowledge \
  --entry '{"trigger":"correction","summary":"correction: comment exists in Sources/Canvas/CanvasTool.swift but K-110 does not claim it","consulted":{"concepts":["K-110"]},"session":"s-a1d9"}'

# One uncorroborated single struggle (K-130):
node "$KIT/engine/log-entry.js" create --log findings --date 2026-07-05 --suffix 00000004 \
  --root unknown-knowledge \
  --entry '{"trigger":"retrieval-struggle","summary":"retrieval-struggle: query toolbar actions reached K-130 only via Sources/Canvas/Actions.swift; alias missing","consulted":{"concepts":["K-130"]},"session":"s-52be"}'

# One mutually contradictory pair (K-120):
node "$KIT/engine/log-entry.js" create --log findings --date 2026-07-04 --suffix 00000005 \
  --root unknown-knowledge \
  --entry '{"trigger":"correction","summary":"correction: K-120 raw value for hand should be Cmd-H, not H, per Sources/Canvas/CanvasTool.swift","consulted":{"concepts":["K-120"]},"session":"s-08fe"}'
node "$KIT/engine/log-entry.js" create --log findings --date 2026-07-06 --suffix 00000006 \
  --root unknown-knowledge \
  --entry '{"trigger":"correction","summary":"correction: K-120 H is correct in Sources/Canvas/CanvasTool.swift; the Cmd-H claim is wrong","consulted":{"concepts":["K-120"]},"session":"s-c414"}'

# Three corroborating RESIDUE findings about the same unresolved term
# (UCS-1160) — the misses the loop turns into tomorrow's edges. Two are query
# residue carrying the context that DID resolve; the third is a --doc candidate
# carrying its section locator:
node "$KIT/engine/log-entry.js" create --log findings --date 2026-07-02 --suffix 00000007 \
  --root unknown-knowledge \
  --entry '{"trigger":"retrieval-miss","summary":"residue from resolve: stencil unresolved in an ask that resolved add-tool","residue":["stencil"],"resolved-context":["add-tool","K-110"],"session":"s-4b02"}'
node "$KIT/engine/log-entry.js" create --log findings --date 2026-07-05 --suffix 00000008 \
  --root unknown-knowledge \
  --entry '{"trigger":"retrieval-miss","summary":"residue from resolve: stencil unresolved; add-tool and K-110 resolved","residue":["stencil"],"resolved-context":["add-tool","K-110"],"session":"s-9d17"}'
node "$KIT/engine/log-entry.js" create --log findings --date 2026-07-07 --suffix 00000009 \
  --root unknown-knowledge \
  --entry '{"trigger":"retrieval-miss","summary":"document candidate: stencil in docs/tool-expansion.md; K-110 resolved","residue":["stencil"],"resolved-context":["K-110"],"section":{"document":"docs/tool-expansion.md","address":"Planned tools","line":24},"session":"s-e330"}'
```

Each of those nine writes one fragment — one file per finding, so the
concurrent sessions that produced them never merge-conflict. The last one
prints its locator back:

```
{
  "file": "logs/findings/2026-07-07-00000009.yaml",
  "status": "open",
  "entry": {
    "schema-version": 1,
    "date": "2026-07-07",
    "status": "open",
    "trigger": "retrieval-miss",
    "summary": "document candidate: stencil in docs/tool-expansion.md; K-110 resolved",
    "residue": [
      "stencil"
    ],
    "resolved-context": [
      "K-110"
    ],
    "section": {
      "document": "docs/tool-expansion.md",
      "address": "Planned tools",
      "line": 24
    },
    "session": "s-e330"
  }
}
```

Nine `open` fragments now sit in `unknown-knowledge/logs/findings/`. Give
the agent `payload/protocol/skills/knowledge-reflect.md` (plus
`payload/protocol/AGENTS.md`, which it operates under) and nothing else;
the human plays the steward at the gate. Where the skill writes
`node unknown-knowledge/engine/<cli>.js`, the fixture has no vendored
engine, so commands here substitute `node $KIT/engine/<cli>.js` — same
CLIs, same flags. The reflect run date is **2026-07-09** (injected —
nothing reads the wall clock). Check each box when the observation
matches.

## 1. SWEEP — inventory, read-only

- [ ] The agent reads the nine fragments (fragments are the entries; no
  raw repo traversal, no hand-editing) and inventories: 9 `open`, 0
  `proposed`, no `logs/misses/` or `logs/gaps/` backlog, no
  `logs/last-reflect.yaml` (first cycle — archival counting starts now).

## 2. CLUSTER — four clusters, one disputed

- [ ] Clustering yields exactly four clusters, every fragment in exactly
  one. The first three cluster by `consulted:` concept refs; the fourth
  clusters by its `residue` term, because residue findings are about a word
  the store has no concept for — that is the whole point of them:
  - **K-110** — 3 corrections (…00000001, …00000002, …00000003)
  - **K-120** — 2 corrections (…00000005, …00000006), **mutually
    contradictory** (Cmd-H-not-H vs. H-is-correct) → flagged
    `disputed` (a cluster flag for this run — never a fragment status)
  - **K-130** — 1 retrieval-struggle (…00000004)
  - **residue `stencil`** — 3 retrieval-misses (…00000007, …00000008,
    …00000009), clustered on the shared unresolved term. Their
    `resolved-context` agrees (`add-tool`, `K-110`), which localizes the
    gap: the ask resolved the operation and the tool concept and fell
    over on the tool itself.

## 3. Disputed cluster (K-120) — resolved by reading the SSOT

- [ ] The agent follows K-120's pointer and reads
  `Sources/Canvas/CanvasTool.swift` (the map is never the fact — and
  neither is either finding). Line 19 decides it:

```
    case hand = "H" // trailing comment with a stray " quote
```

- [ ] The engine confirms the read — the store already agrees with the
  source:

```sh
node "$KIT/engine/validate-values.js" --concepts K-120 --root .
```

Exit 0:

```
validate-values: 1 concept(s) checked, 0 skipped (draft/proposed), 0 findings, 0 hard errors

every enumerates claim agrees with its source (both directions, §3.5 set equality)
```

- [ ] The SSOT-contradicted finding is rejected with a reason citing the
  read; the supported one resolves over the green run:

```sh
node "$KIT/engine/log-entry.js" transition --file logs/findings/2026-07-04-00000005.yaml \
  --to proposed --date 2026-07-09 --root unknown-knowledge
node "$KIT/engine/log-entry.js" transition --file logs/findings/2026-07-06-00000006.yaml \
  --to proposed --date 2026-07-09 --root unknown-knowledge
node "$KIT/engine/log-entry.js" transition --file logs/findings/2026-07-04-00000005.yaml \
  --to rejected --date 2026-07-09 --root unknown-knowledge \
  --reason 'disputed cluster resolved by reading the SSOT: Sources/Canvas/CanvasTool.swift:19 declares case hand = "H"; validate-values --concepts K-120 ran green'
node "$KIT/engine/log-entry.js" transition --file logs/findings/2026-07-06-00000006.yaml \
  --to resolved --date 2026-07-09 --root unknown-knowledge
```

The rejection prints (note `reason` is now on the fragment):

```
{
  "file": "logs/findings/2026-07-04-00000005.yaml",
  "status": "rejected",
  ...
    "reason": "disputed cluster resolved by reading the SSOT: Sources/Canvas/CanvasTool.swift:19 declares case hand = \"H\"; validate-values --concepts K-120 ran green"
}
```

and the resolution carries the stamped `verified` date:

```
{
  "file": "logs/findings/2026-07-06-00000006.yaml",
  "status": "resolved",
  ...
    "verified": "2026-07-09"
}
```

- [ ] Negative check: the dispute counted for **nothing** — no K-120 item
  appears on the recommendation list, and neither finding corroborates
  any other cluster (a dispute never counts as corroboration).

## 4. RECOMMEND + GATE — two items reach the queue

- [ ] The agent presents the **reflect queue**, not a store browse — the
  moderator reviews what reflect puts in front of them and never goes
  looking through `ontology/` or `knowledge/` for things to fix. All four
  queue sections are present, in order:
  - **Mint proposals** — the `stencil` item (below)
  - **Corroborated findings** — the K-110 item (below)
  - **Drafts awaiting promotion** — empty this cycle (no
    `knowledge-promotion` or `extractor-draft` handoffs)
  - **Sampled spot-checks** — the K-130 single struggle, shown explicitly
    as under-corroborated so the human can audit the threshold itself,
    never as a recommendation
- [ ] Exactly two recommendation items, presented per-item in the
  conversation with category, concrete diff, and the justifying findings
  attached:
  - **category `concept-fix`** — K-110: replace claimed value `eyedropper`
    with `comment` in the `swift-enum` descriptor, per a fresh read of
    `Sources/Canvas/CanvasTool.swift` (drafted from the source, never from
    the findings' prose); evidence: `logs/findings/2026-07-01-00000001.yaml`,
    `…2026-07-03-00000002.yaml`, `…2026-07-06-00000003.yaml`.
  - **category `mint-proposal`** — mint `stencil` as a value. Three
    distinct fragments corroborate it (2026-07-02, 2026-07-05, 2026-07-07 —
    one correction is a data point, three are a pattern), and the **literary
    warrant** is material that exists now: the agent opened
    `docs/tool-expansion.md` at the `Planned tools` section its candidate
    locator addressed (line 24) rather than trusting the finding's prose — a
    candidate is a claim about the map until someone reads the source.
    Evidence: `logs/findings/2026-07-02-00000007.yaml`,
    `…2026-07-05-00000008.yaml`, `…2026-07-07-00000009.yaml`.
- [ ] The mint proposal is drafted as **one Decisions entry**, copied from
  `templates/decisions/reflect-mint-proposal.yaml` with its `id` and `date`
  placeholders filled. Paste it unedited and validation refuses it — exactly
  two diagnostics, `entries[0].date` and `entries[0].id` `pattern-mismatch`
  — so a placeholder rationale can never reach the Decisions store.
- [ ] Corroboration was counted **by hand**. No CLI reported a
  corroboration score; the engine has no opinion about how many findings
  make a pattern.
- [ ] The K-130 single struggle got **no item** — one correction is a
  data point, three are a pattern; it stays `open` and ages.
- [ ] Nothing was applied before the human approved. **The human approves
  both items per-item, never as a bulk yes** (simulated approval); the
  outcomes `concept-fix: approved` and `mint-proposal: approved` are
  recorded for the stamp, and each item's justifying findings move
  `open → proposed`:

```sh
node "$KIT/engine/log-entry.js" transition --file logs/findings/2026-07-01-00000001.yaml \
  --to proposed --date 2026-07-09 --root unknown-knowledge
node "$KIT/engine/log-entry.js" transition --file logs/findings/2026-07-03-00000002.yaml \
  --to proposed --date 2026-07-09 --root unknown-knowledge
node "$KIT/engine/log-entry.js" transition --file logs/findings/2026-07-06-00000003.yaml \
  --to proposed --date 2026-07-09 --root unknown-knowledge
node "$KIT/engine/log-entry.js" transition --file logs/findings/2026-07-02-00000007.yaml \
  --to proposed --date 2026-07-09 --root unknown-knowledge
node "$KIT/engine/log-entry.js" transition --file logs/findings/2026-07-05-00000008.yaml \
  --to proposed --date 2026-07-09 --root unknown-knowledge
node "$KIT/engine/log-entry.js" transition --file logs/findings/2026-07-07-00000009.yaml \
  --to proposed --date 2026-07-09 --root unknown-knowledge
```

## 5. APPLY — the approved diff, then the loop closes green

Before the fix, the filtered check is red — the findings were right:

```sh
node "$KIT/engine/validate-values.js" --concepts K-110 --root .
```

Exit 1:

```
validate-values: 1 concept(s) checked, 0 skipped (draft/proposed), 2 findings, 0 hard errors

FINDING source-value-missing  K-110  "comment"  (source: Sources/Canvas/CanvasTool.swift)
  source value "comment" in "Sources/Canvas/CanvasTool.swift" is not claimed by the descriptor
FINDING value-not-in-source  K-110  "eyedropper"  (source: Sources/Canvas/CanvasTool.swift)
  claimed value "eyedropper" is not in "Sources/Canvas/CanvasTool.swift" (byte-exact, case-sensitive, §3.5)
```

- [ ] The agent applies the approved diff to
  `unknown-knowledge/ontology/classes/100-app.yaml` — K-110's descriptor
  values become `[select, frame, pen, textStyle, hand, comment]`
  (derived from the source read, byte-exact) — then re-runs **both**
  validators filtered to exactly the touched concept:

```sh
node "$KIT/engine/validate.js" --concepts K-110 --root .
node "$KIT/engine/validate-values.js" --concepts K-110 --root .
```

- [ ] Both exit 0:

```
structural validate -> 0 findings — structurally clean
checks run: disconnected-revocation, gated-category-graduation, graduation-field-shape, graduation-not-trust-category, id-range, id-shape, index-drift, malformed-verified, missing-authority, missing-citation, missing-graduation-table, missing-path, missing-registry, missing-verified, orphan, ref-cycle, registry-shape-mismatch, suppressed-value, unaccounted-edition, undeclared-category, unminted-segment, unregistered-value

filtered to concepts: K-110
```

```
validate-values: 1 concept(s) checked, 0 skipped (draft/proposed), 0 findings, 0 hard errors

every enumerates claim agrees with its source (both directions, §3.5 set equality)
```

- [ ] Only now — green first — the three findings resolve:

```sh
node "$KIT/engine/log-entry.js" transition --file logs/findings/2026-07-01-00000001.yaml \
  --to resolved --date 2026-07-09 --root unknown-knowledge
node "$KIT/engine/log-entry.js" transition --file logs/findings/2026-07-03-00000002.yaml \
  --to resolved --date 2026-07-09 --root unknown-knowledge
node "$KIT/engine/log-entry.js" transition --file logs/findings/2026-07-06-00000003.yaml \
  --to resolved --date 2026-07-09 --root unknown-knowledge
```

Each prints `"status": "resolved"` with `"verified": "2026-07-09"`.

- [ ] The approved **mint** lands as its own governed act: the filled
  Decisions entry (one entry for the one value minted) plus the registry
  edit that cites it, in the same PR as the material that supplied the
  warrant. Then its three findings resolve the same way:

```sh
node "$KIT/engine/log-entry.js" transition --file logs/findings/2026-07-02-00000007.yaml \
  --to resolved --date 2026-07-09 --root unknown-knowledge
node "$KIT/engine/log-entry.js" transition --file logs/findings/2026-07-05-00000008.yaml \
  --to resolved --date 2026-07-09 --root unknown-knowledge
node "$KIT/engine/log-entry.js" transition --file logs/findings/2026-07-07-00000009.yaml \
  --to resolved --date 2026-07-09 --root unknown-knowledge
```

- [ ] The residue payload survives the whole lifecycle — it is what the
  minting decision cites, so losing it mid-transition would strand the
  evidence. The candidate's locator is still on the resolved fragment:

```
{
  "file": "logs/findings/2026-07-07-00000009.yaml",
  "status": "resolved",
  "entry": {
    "schema-version": 1,
    "date": "2026-07-07",
    "status": "resolved",
    "trigger": "retrieval-miss",
    "summary": "document candidate: stencil in docs/tool-expansion.md; K-110 resolved",
    "residue": [
      "stencil"
    ],
    "resolved-context": [
      "K-110"
    ],
    "section": {
      "document": "docs/tool-expansion.md",
      "address": "Planned tools",
      "line": 24
    },
    "session": "s-e330",
    "verified": "2026-07-09"
  }
}
```

- [ ] Lifecycle guard check: the helper refuses to shortcut the K-130
  entry straight to resolved —

```sh
node "$KIT/engine/log-entry.js" transition --file logs/findings/2026-07-05-00000004.yaml \
  --to resolved --date 2026-07-09 --root unknown-knowledge
```

Exit 2:

```
log-entry: logs/findings/2026-07-05-00000004.yaml: illegal transition open → resolved (legal from open: proposed) — the lifecycle is open → proposed → resolved/rejected; re-open-not-duplicate (§3.4)
```

## 6. STAMP — prune verdict, then the observable cycle

- [ ] The queue tally is now 1 `open` / 1 `rejected` / 7 `resolved`
  (`grep -h "^status:" unknown-knowledge/logs/findings/*.yaml | sort | uniq -c`):

```
   1 status: open
   1 status: rejected
   7 status: resolved
```
- [ ] Prune verdict: the K-130 fragment is uncorroborated but this is
  **cycle 1 of N = 3** — it is kept, not archived; nothing is deleted
  this run, and `archived:` stamps empty.
- [ ] The agent writes `unknown-knowledge/logs/last-reflect.yaml` (reflect
  output — written directly, the one file this skill hand-writes):

```yaml
schema-version: 1
date: 2026-07-09
cycles: [2026-07-09]
outcomes:
  concept-fix: { approved: 1, approved-with-modification: 0, rejected: 0 }
  mint-proposal: { approved: 1, approved-with-modification: 0, rejected: 0 }
archived: []
```

(The K-120 disputed resolution is SSOT-procedure output, not a gated
recommendation item — it appears in the run report, not in `outcomes:`.)

- [ ] The agent declares done only now — every gate outcome recorded,
  every close-the-loop re-run green — and reports: 4 clusters, 2
  recommended items (both approved, applied, verified — one of them a mint
  carrying its own Decisions entry), 1 disputed cluster resolved by SSOT
  read (1 rejected with reason, 1 resolved), 1 under-corroborated finding
  held open (cycle 1/3), stamp written. In a client repo the whole bundle —
  diff, registry edit, Decisions entry, transitioned fragments, stamp —
  lands as one reflect PR.

## Re-open, not duplicate (next-cycle demonstration)

Simulate a recurrence after resolution — a later session hits the K-110
issue again. The original entry transitions back; no sibling is minted:

```sh
node "$KIT/engine/log-entry.js" transition --file logs/findings/2026-07-01-00000001.yaml \
  --to open --date 2026-07-12 --root unknown-knowledge
```

- [ ] Exit 0; same file, `"status": "open"`, the recurrence date appended
  and the stale `verified` dropped (the old outcome no longer holds):

```
{
  "file": "logs/findings/2026-07-01-00000001.yaml",
  "status": "open",
  ...
    "occurrences": [
      "2026-07-12"
    ]
}
```

- [ ] `logs/findings/` still holds exactly nine fragments — re-open, not
  duplicate.

## Done

- [ ] All boxes checked; step order was SWEEP → CLUSTER → RECOMMEND →
  GATE → APPLY → STAMP; approval was per item; no fragment was ever
  hand-edited or resolved ahead of a green re-run.
- [ ] Resumability spot-check: kill the session after step 4 and restart —
  the agent finds the `proposed` fragments, re-presents the item without
  re-clustering it into a new one, and never re-asks the recorded
  approval.
- [ ] Record the wall-clock time: ______ (the "afternoon, not an
  engagement" datum, PRD §10).
