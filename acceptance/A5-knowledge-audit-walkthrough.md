# A5 walkthrough — /knowledge-audit reports health on fixtures/ts-app

Acceptance criterion A5 (PRD §10): *an agent following only
`payload/protocol/skills/knowledge-audit.md` produces a knowledge-audit
report on a fixture correctly — heartbeat section present with seeded
state.* This is the scripted checklist for a human to run with a fresh
agent — documented acceptance runs are the honest seam: skills are prompts,
so their test is a checklist, not CI. Time the run (A5 walkthroughs are
wall-clock timed).

Every expected observation below was produced by actually running the
commands (kit @ this branch, 2026-07-09); outputs are pasted byte-honest.
The fixture ships *planted drift* for the A3 criterion — this walkthrough
leans on it: a health check demonstrated on a healthy store proves nothing.

## Setup (the human, not the agent)

From the kit repo root — copy the fixture, then seed loop state (open
fragments, an aging proposed decision; `last-reflect` deliberately ABSENT):

```sh
export KIT="$PWD/payload"            # engine lives here in the KIT repo;
                                     # in a client repo it is <kit-dir>/engine
rm -rf /tmp/a5-audit && cp -R fixtures/ts-app /tmp/a5-audit && cd /tmp/a5-audit
node "$KIT/engine/log-entry.js" create --log findings --date 2026-07-02 \
  --root unknown-knowledge --suffix aaaa0001 \
  --entry '{"trigger":"quarantine","summary":"preflight quarantined K-108 (wrong-pointer): proceeded degraded, gathered from src/registry/sports.ts directly","consulted":{"concepts":["K-108"]}}'
node "$KIT/engine/log-entry.js" create --log findings --date 2026-07-05 \
  --root unknown-knowledge --suffix aaaa0002 \
  --entry '{"trigger":"correction","summary":"correction: K-102 claims futures; src/registry/markets.ts does not carry it","consulted":{"concepts":["K-102"]}}'
node "$KIT/engine/log-entry.js" create --log misses --date 2026-07-01 \
  --root unknown-knowledge --suffix aaaa0003 \
  --entry '{"path":"src/registry/leagues.ts","shape":"spread-composed const array (ALL_LEAGUES = [...A, ...B]); ts-const-array is out of envelope"}'
cat > unknown-knowledge/decisions/entries/D-2026-04-02-loyalty-tier-source.yaml <<'EOF'
# One entry per file (D-010); schema per PRD §3.3.
schema-version: 1
entries:
  - id: D-2026-04-02-loyalty-tier-source
    title: Loyalty tiers move to a typed registry
    category: architecture
    status: proposed
    date: "2026-04-02"
    deciders: [steward-rotation]
    context: >
      loyalty-tiers.js is untyped and duplicated by marketing config.
    decision: >
      Reify tiers as a typed const array the extractor can read.
    consequences: >
      One lexically checkable home; K-1xx concept to follow.
    supersedes: []
    superseded-by: []
    relates-to: { concepts: [K-101], leaves: [], decisions: [D-101] }
EOF
cat >> unknown-knowledge/decisions/_catalog.yaml <<'EOF'
  - id: D-2026-04-02-loyalty-tier-source
    title: Loyalty tiers move to a typed registry
    file: entries/D-2026-04-02-loyalty-tier-source.yaml
EOF
git init -q . && git add -A
```

Give the agent `payload/protocol/skills/knowledge-audit.md` (plus
`payload/protocol/AGENTS.md`, which it operates under), and the injected
date `<TODAY>` = `2026-07-09`. Where the skill writes
`node unknown-knowledge/engine/<cli>.js`, the fixture has no vendored
engine, so commands here substitute `node $KIT/engine/<cli>.js` — same
CLIs, same flags. Check each box when the observation matches.

## 1. STRUCTURE — whole-store structural truth

```sh
node "$KIT/engine/validate.js" --root .
```

- [ ] Exit 0, run unfiltered (no `--concepts` spot check), captured
  verbatim including the `checks run:` line:

```
structural validate -> 0 findings — structurally clean
checks run: id-range, id-shape, index-drift, missing-citation, missing-path, orphan, ref-cycle
```

## 2. VALUES — enumerates vs source

```sh
node "$KIT/engine/validate-values.js" --root .
```

- [ ] Exit 2 — and the agent records it as CHECK NEVER RAN for the three
  hard-error concepts, continuing the audit (never presenting them as
  passes, never stopping the report):

```
validate-values: 16 concept(s) checked, 0 skipped (draft/proposed), 3 findings, 3 hard errors

HARD ERROR out-of-envelope  K-113  (source: src/registry/leagues.ts)
  "ALL_LEAGUES" spreads another array ("...") — the full member set is not lexically knowable; extracting the literal members would be a confident wrong parse (PRD §5.1)
HARD ERROR out-of-envelope  K-115  (source: src/registry/experiments.ts)
  EXPERIMENTS: template literal interpolation ("${") — the value is not lexically knowable; a confident wrong parse is a false all-clear (PRD §5.1)
HARD ERROR out-of-envelope  K-116  (source: src/types/index.ts)
  "BetStatus" is not declared in this file — it is (or may be) re-exported from another module, and ts-union parses lexically, single-file only (PRD §5.1): resolving the chain is out of the envelope

the check never ran on the entries above — fix the descriptors/store first (PRD §4: a malformed descriptor is a hard error, never skipped)

FINDING value-not-in-source  K-102  "futures"  (source: src/registry/markets.ts)
  claimed value "futures" is not in "src/registry/markets.ts" (byte-exact, case-sensitive, §3.5)
FINDING source-value-missing  K-104  "crypto"  (source: src/types/withdrawal.ts)
  source value "crypto" in "src/types/withdrawal.ts" is not claimed by the descriptor
FINDING wrong-pointer  K-108  (source: src/registry/sports.ts)
  all 3 claimed value(s) are missing from "src/registry/sports.ts" — the file exists and parses (5 value(s) extracted), so the descriptor points at the wrong place
```

## 3. REVERSE — advisory (never blocking)

```sh
node "$KIT/engine/audit.js" --root . --today 2026-07-09
```

- [ ] `--today` was passed (so the stale check ran instead of reporting
  itself skipped). Exit 0; header lines:

```
audit (advisory — proposals for human review, never a gate): 41 candidate(s), 16 matched, 4 findings
scope: unscoped (no confirmed survey-scope.yaml)
stale check: checked against --today 2026-07-09 (stale after 90 day(s))
```

- [ ] Four `unmatched-anchor` findings (`src`, `src/registry`,
  `src/registry/locales.ts`, `src/types`), each carrying a `K-XXX` draft
  block. The agent records the one-liners and routes the drafts to the
  steward — it does NOT paste draft YAML into the report body, and does
  NOT treat the findings as failures (advisory, never blocking).

## 4. KNOWLEDGE — the leaf sweep

- [ ] The agent does not re-derive citation presence or cross-reference
  resolution (engine checks, step 1). It reads the one catalog-declared
  leaf (`100.1`) and fills all three columns:

| leaf | citations dated | revision note | standing room pressure |
|---|---|---|---|
| 100.1 | yes (`accessed: 2026-07-08`) | **missing** — no `revision` note; edition 1 unexplained | none (`including` absent) |

## 5. DECISIONS — the lifecycle check

- [ ] No orphaned `relates-to` fired in step 1 (record: none). Ages
  against `<TODAY>` = 2026-07-09, exhaustive over the catalog:

| decision | status | age (days) | flag |
|---|---|---|---|
| D-101 | accepted | 1 | — |
| D-2026-04-02-loyalty-tier-source | proposed | 98 | **aging proposed** (> 30 days); provisional id — the steward never minted a final D-NNN |

## 6. HEARTBEAT — seeded state, graceful absence

```sh
cat unknown-knowledge/last-reflect.yaml
```

- [ ] The file is absent (`No such file or directory`) and the agent
  degrades gracefully — the report line reads **no reflect has run yet**;
  the line still appears (visible, never silent). (To exercise the other
  branch, seed a stamp: `echo 'date: "2026-07-04"' >
  unknown-knowledge/last-reflect.yaml` → the line reads `days since last
  reflect: 5`.)

```sh
for log in findings misses gaps; do
  printf '%s open: ' "$log"
  grep -rl '^status: open' "unknown-knowledge/logs/$log" 2>/dev/null | wc -l
done
```

- [ ] `findings open: 2`, `misses open: 1`, `gaps open: 0`.

```sh
grep -rl '^trigger: quarantine' unknown-knowledge/logs/findings 2>/dev/null
```

- [ ] One fragment (`logs/findings/2026-07-02-aaaa0001.yaml`), whose
  `consulted.concepts` names K-108 → top quarantined: `K-108 (1)`.

## 7. REPORT — the fixed shape, filled

- [ ] The agent delivers one markdown report in the conversation — all
  sections present, in order, filled from the outputs above (never from
  memory of a previous run). Expected content:

```markdown
# knowledge-audit report — 2026-07-09

## Verdicts
| step | command | exit | reading |
|---|---|---|---|
| structure | validate.js | 0 | clean (checks run: id-range, id-shape, index-drift, missing-citation, missing-path, orphan, ref-cycle) |
| values | validate-values.js | 2 | CHECK NEVER RAN on K-113, K-115, K-116 (out-of-envelope); 3 findings on the rest |
| reverse audit | audit.js --today 2026-07-09 | 0 | advisory — 4 proposals for the steward, never a gate |

## Structural findings
none

## Value findings
- HARD ERROR out-of-envelope: K-113, K-115, K-116 — the check never ran on these
- value-not-in-source: K-102 "futures" (src/registry/markets.ts)
- source-value-missing: K-104 "crypto" (src/types/withdrawal.ts)
- wrong-pointer: K-108 (src/registry/sports.ts)

## Reverse audit proposals (advisory — never blocking)
- unmatched-anchor: src, src/registry, src/registry/locales.ts, src/types
  (K-XXX drafts routed to the steward)
- stale-last-verified: none (checked against 2026-07-09, stale after 90 days)
- suppressed: none

## Knowledge leaves
- 100.1: citations dated; revision note MISSING; no standing-room pressure

## Decisions lifecycle
- orphaned relates-to: none
- aging proposed: D-2026-04-02-loyalty-tier-source (98 days; provisional id never minted)
- aging accepted: none

## Heartbeat
- days since last reflect: no reflect has run yet
- open fragments: findings 2, misses 1, gaps 0
- top quarantined concepts: K-108 (1)
```

- [ ] Negative checks: the audit committed nothing and edited no store
  file (read-only end to end); nothing was "fixed inline"; the routing is
  named per finding (concept PRs, kb-build, reflect, the steward).

## Done

- [ ] All boxes checked; step order was STRUCTURE → VALUES → REVERSE →
  KNOWLEDGE → DECISIONS → HEARTBEAT → REPORT; exit 2 was reported as
  CHECK NEVER RAN, never as a pass and never a silent stop; the heartbeat
  section is present with the seeded state.
- [ ] Record the wall-clock time: ______ (the "afternoon, not an
  engagement" datum, PRD §10).
