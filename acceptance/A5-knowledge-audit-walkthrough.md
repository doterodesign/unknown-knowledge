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
  --entry '{"trigger":"quarantine","summary":"preflight quarantined K-108 (wrong-pointer): proceeded degraded, gathered from src/registry/export-formats.ts directly","consulted":{"concepts":["K-108"]}}'
node "$KIT/engine/log-entry.js" create --log findings --date 2026-07-05 \
  --root unknown-knowledge --suffix aaaa0002 \
  --entry '{"trigger":"correction","summary":"correction: K-102 claims luminosity; src/registry/blend-modes.ts does not carry it","consulted":{"concepts":["K-102"]}}'
node "$KIT/engine/log-entry.js" create --log misses --date 2026-07-01 \
  --root unknown-knowledge --suffix aaaa0003 \
  --entry '{"path":"src/registry/export-presets.ts","shape":"spread-composed const array (ALL_PRESETS = [...A, ...B]); ts-const-array is out of envelope"}'
cat > unknown-knowledge/decisions/entries/D-2026-04-02-plan-tier-source.yaml <<'EOF'
# One entry per file (D-010); schema per payload/schemas/decision-entry.schema.json.
schema-version: 1
entries:
  - id: D-2026-04-02-plan-tier-source
    title: Plan tiers move to a typed registry
    category: architecture
    status: proposed
    date: "2026-04-02"
    deciders: [steward-rotation]
    context: >
      plan-tiers.js is untyped and duplicated by marketing config.
    decision: >
      Reify tiers as a typed const array the extractor can read.
    consequences: >
      One lexically checkable home; K-1xx concept to follow.
    supersedes: []
    superseded-by: []
    relates-to: { concepts: [], leaves: [], decisions: [D-101] }
EOF
cat >> unknown-knowledge/decisions/_catalog.yaml <<'EOF'
  - id: D-2026-04-02-plan-tier-source
    title: Plan tiers move to a typed registry
    file: entries/D-2026-04-02-plan-tier-source.yaml
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

- [ ] Exit 1, run unfiltered (no `--concepts` spot check), captured
  verbatim including the `checks run:` line. The two findings are UCS-1159
  planted cases 2 and 4 (jurisdiction mismatch, unregistered facet value);
  the agent records them as findings to report, not as a broken store —
  the store still LOADS clean, so every check ran:

```
structural validate -> 2 finding(s) (2 error(s), 0 warning(s))
checks run: disconnected-revocation, gated-category-graduation, graduation-field-shape, graduation-not-trust-category, id-range, id-shape, index-drift, malformed-verified, missing-authority, missing-citation, missing-graduation-table, missing-path, missing-registry, missing-verified, orphan, ref-cycle, registry-shape-mismatch, suppressed-value, unaccounted-edition, undeclared-category, unminted-segment, unregistered-value

error  unregistered-value  L-000100  knowledge/product/100.1-adding-a-new-export-format.md  applies.jurisdictions[0]
    value "eu-eaa" is not minted in the "knowledge/jurisdictions" registry (knowledge/_registries/jurisdictions.yaml) — governed facets draw only from their registry; minting a new value is a registry edit plus a Decisions entry, never an ad-hoc string
error  unregistered-value  L-000100  knowledge/product/100.1-adding-a-new-export-format.md  facets.form
    value "walkthrough" is not minted in the "knowledge/form" registry (knowledge/_registries/form.yaml) — governed facets draw only from their registry; minting a new value is a registry edit plus a Decisions entry, never an ad-hoc string

fix every error-severity finding before merging — this validator is blocking-grade (PRD §4)
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

HARD ERROR out-of-envelope  K-113  (source: src/registry/export-presets.ts)
  "ALL_PRESETS" spreads another array ("...") — the full member set is not lexically knowable; extracting the literal members would be a confident wrong parse (PRD §5.1)
HARD ERROR out-of-envelope  K-115  (source: src/registry/experiments.ts)
  EXPERIMENTS: template literal interpolation ("${") — the value is not lexically knowable; a confident wrong parse is a false all-clear (PRD §5.1)
HARD ERROR out-of-envelope  K-116  (source: src/types/index.ts)
  "ReleaseStatus" is not declared in this file — it is (or may be) re-exported from another module, and ts-union parses lexically, single-file only (PRD §5.1): resolving the chain is out of the envelope

the check never ran on the entries above — fix the descriptors/store first (PRD §4: a malformed descriptor is a hard error, never skipped)

FINDING value-not-in-source  K-102  "luminosity"  (source: src/registry/blend-modes.ts)
  claimed value "luminosity" is not in "src/registry/blend-modes.ts" (byte-exact, case-sensitive, §3.5)
FINDING source-value-missing  K-104  "video"  (source: src/types/asset-kind.ts)
  source value "video" in "src/types/asset-kind.ts" is not claimed by the descriptor
FINDING wrong-pointer  K-108  (source: src/registry/export-formats.ts)
  all 3 claimed value(s) are missing from "src/registry/export-formats.ts" — the file exists and parses (5 value(s) extracted), so the descriptor points at the wrong place
```

## 3. REVERSE — advisory (never blocking)

```sh
node "$KIT/engine/audit.js" --root . --today 2026-07-09
```

- [ ] `--today` was passed (so the stale check ran instead of reporting
  itself skipped). Exit 0; header lines:

```
audit (advisory — proposals for human review, never a gate): 48 candidate(s), 16 matched, 4 findings
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
  resolution (engine checks, step 1). It reads both catalog-declared
  leaves (`100.1`, `100.2`) and fills all three columns:

| leaf | citations dated | revision note | standing room pressure |
|---|---|---|---|
| 100.1 | yes (`accessed: 2026-07-08`) | **missing** — no `revision` note; edition 1 unexplained | none (`including` absent) |
| 100.2 | yes (`accessed: 2026-01-05`) | **missing** — no `revision` note; edition 1 unexplained | none (`including` absent) |

- [ ] `100.2` declares `volatility: volatile` with `verified: 2026-01-05`,
  which is 185 days before `<TODAY>` = 2026-07-09 and so past the 90-day
  limit — the agent reports it as rotted knowledge to re-verify (UCS-1159
  planted case 1), not as a broken record.

## 5. DECISIONS — the lifecycle check

- [ ] No orphaned `relates-to` fired in step 1 (record: none). Ages
  against `<TODAY>` = 2026-07-09, exhaustive over the catalog:

| decision | status | age (days) | flag |
|---|---|---|---|
| D-101 | accepted | 1 | — |
| D-2026-04-02-plan-tier-source | proposed | 98 | **aging proposed** (> 30 days); provisional id — the steward never minted a final D-NNN |

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
| structure | validate.js | 1 | 2 findings to report, not a broken store — the store loads clean, so every check ran (checks run: disconnected-revocation, gated-category-graduation, graduation-field-shape, graduation-not-trust-category, id-range, id-shape, index-drift, malformed-verified, missing-authority, missing-citation, missing-graduation-table, missing-path, missing-registry, missing-verified, orphan, ref-cycle, registry-shape-mismatch, suppressed-value, unaccounted-edition, undeclared-category, unminted-segment, unregistered-value) |
| values | validate-values.js | 2 | CHECK NEVER RAN on K-113, K-115, K-116 (out-of-envelope); 3 findings on the rest |
| reverse audit | audit.js --today 2026-07-09 | 0 | advisory — 4 proposals for the steward, never a gate |

## Structural findings
- unregistered-value: L-000100 `applies.jurisdictions[0]` — "eu-eaa" is not minted
  in the knowledge/jurisdictions registry
- unregistered-value: L-000100 `facets.form` — "walkthrough" is not minted in the
  knowledge/form registry

## Value findings
- HARD ERROR out-of-envelope: K-113, K-115, K-116 — the check never ran on these
- value-not-in-source: K-102 "luminosity" (src/registry/blend-modes.ts)
- source-value-missing: K-104 "video" (src/types/asset-kind.ts)
- wrong-pointer: K-108 (src/registry/export-formats.ts)

## Reverse audit proposals (advisory — never blocking)
- unmatched-anchor: src, src/registry, src/registry/locales.ts, src/types
  (K-XXX drafts routed to the steward)
- stale-last-verified: none (checked against 2026-07-09, stale after 90 days)
- suppressed: none

## Knowledge leaves
- 100.1: citations dated; revision note MISSING; no standing-room pressure
- 100.2: citations dated; revision note MISSING; no standing-room pressure;
  STALE (volatile, verified 185 days ago vs. the 90-day limit)

## Decisions lifecycle
- orphaned relates-to: none
- aging proposed: D-2026-04-02-plan-tier-source (98 days; provisional id never minted)
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
