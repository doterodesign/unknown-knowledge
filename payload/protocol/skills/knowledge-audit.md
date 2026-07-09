# /knowledge-audit — the on-demand health check (PRD §8, D-019)

> Paths in this document are client-relative — relative to the vendored kit
> root after init (`ontology/…`, `engine/…`, `protocol/…`). In the kit repo
> itself these live under `payload/`. Commands are written to run from the
> **repo root** with the kit dir at its default name `unknown-knowledge/`;
> substitute your chosen kit dir name if it differs.

Run this when someone asks how healthy the map is — on demand, before a
reflect cycle, or when the loop has gone quiet. The audit is **read-only**:
it runs the engine's checks in a fixed order, sweeps the two lifecycles the
engine does not compute, and files one human-readable report. It never
mutates stores — everything it finds is *routed*, not fixed inline:
validator findings to the owning concepts' normal PR path, reverse-audit
drafts to the steward (proposal-first), fragments to reflect. You operate
under `protocol/AGENTS.md` throughout.

Dates are injected, never wall-clock: the invoker supplies today's date
once (`<TODAY>` below) and every step reuses it.

## The seven steps

```
1. STRUCTURE  engine/validate.js — whole-store structural truth
2. VALUES     engine/validate-values.js — enumerates vs source, both ways
3. REVERSE    engine/audit.js — advisory (never blocking) proposals
4. KNOWLEDGE  leaf sweep: citations, cross-refs, revision notes
5. DECISIONS  lifecycle: aging proposed/accepted, orphaned relates-to
6. HEARTBEAT  last-reflect stamp, open fragments, quarantined concepts
7. REPORT     the fixed report shape, filled from the outputs above
```

No step's outcome stops the audit. Exit 2 anywhere is itself the finding —
a check that never ran is a blocking defect, never a silent pass — so the
report records that verdict as **CHECK NEVER RAN** (never as a pass) and
the audit continues, keeping the report whole.

### 1. STRUCTURE — the whole-store validator

```
node unknown-knowledge/engine/validate.js --root .
```

Run unfiltered — the audit is a whole-store instrument, never a `--concepts`
spot check. Capture verbatim: the exit code, the summary line, the
`checks run:` line (so a green verdict names what actually ran), and every
finding. Unresolved cross-store references — including a knowledge
cross-reference or a decision `relates-to` that points at nothing — surface
here as loader errors at exit 2. **Done when** the exit code and the full
finding list (or the clean two-liner) are captured for the report.

### 2. VALUES — enumerates vs source

```
node unknown-knowledge/engine/validate-values.js --root .
```

Capture verbatim: the counts line, every HARD ERROR (out-of-envelope
descriptors — on those concepts the check never ran, and the report must
say so), and every finding (`value-not-in-source`, `source-value-missing`,
`wrong-pointer`). **Done when** exit code, counts line, hard errors, and
findings are all captured.

### 3. REVERSE — the advisory scan

```
node unknown-knowledge/engine/audit.js --root . --today 2026-07-09
```

Always pass `--today <TODAY>` — without it the stale-last-verified check
reports itself skipped, and the heartbeat wants that check run. The reverse
audit is **advisory (never blocking)**: its findings are drafted proposals
for human review, so capture the header lines (candidates / matched /
findings, scope, stale check), the finding codes with their paths, and any
suppressed count — the draft YAML blocks go to the steward, not into the
report body. `--fail-on-findings` stays a human opt-in — never a CI
default, never part of this audit. **Done when** the header lines and the
per-finding one-liners are captured.

### 4. KNOWLEDGE — the leaf sweep

Citation *presence* and cross-reference *resolution* are engine checks —
they already ran in step 1 (`missing-citation` findings; unresolved refs at
exit 2). Never re-derive them by hand. This sweep reads every leaf the
knowledge catalog declares and records what the engine does not compute,
one row per leaf:

- **citations dated** — every citation carries an `accessed` date (an
  undated source ages invisibly);
- **revision note present** — at least one `revision` note with a `date`,
  and the newest one consistent with `edition` (an edition bump with no
  note is an unexplained change);
- **standing room pressure** — `including` topics that sessions keep
  needing are kb-build candidates; name them.

**Done when** every catalog-declared leaf appears in the sweep table with
all three columns filled — a leaf skipped is a check that never ran.

### 5. DECISIONS — the lifecycle check

Orphaned `relates-to` references are engine-checked (step 1, exit 2) —
record here any that fired; never re-derive resolution by hand. This sweep
computes the ages the engine does not: for every entry in
`decisions/entries/`, days from its `date` to `<TODAY>`, then flag:

- **aging `proposed`** — older than 30 days: a proposal nobody gated. A
  provisional date-suffixed id (`D-YYYY-MM-DD-<slug>`) still `proposed`
  past the window means the steward never minted the final `D-NNN` — name
  it.
- **aging `accepted`** — older than 90 days and never moved to
  `addressed`/`archived`: accepted words with no follow-through.

The thresholds are report headings, not verdicts — aging entries route to
the steward for triage. **Done when** every catalog-declared decision
appears with its status and age, and the aging list is exhaustive over that
table.

### 6. HEARTBEAT — the loop's vital signs (§8)

Three instruments; every one produces a report line — a lapsed steward
rotation is **visible, never silent**.

**Days since last reflect.** The reflect skill stamps a `last-reflect`
state file at the kit root:

```sh
cat unknown-knowledge/last-reflect.yaml
```

Present → report `<TODAY>` minus the stamped date as
days-since-last-reflect. Absent (`No such file or directory`) → the report
line reads **no reflect has run yet** — degrade gracefully; the absence IS
the datum, and it still prints.

**Open fragments per log.**

```sh
for log in findings misses gaps; do
  printf '%s open: ' "$log"
  grep -rl '^status: open' "unknown-knowledge/logs/$log" 2>/dev/null | wc -l
done
```

**Top-N quarantined concepts** (N = 5). List the quarantine-trigger
fragments, read each one's `consulted.concepts`, count per concept, rank:

```sh
grep -rl '^trigger: quarantine' unknown-knowledge/logs/findings 2>/dev/null
```

Report concept IDs and counts only — fragment summaries stay in the
fragments (§3.4 rides into reports too). **Done when** all three heartbeat
lines exist, each carrying a real number or the explicit absence line.

### 7. REPORT — the fixed shape

One markdown report, sections in this order, **every section present even
when empty** — "none" is a real answer; a missing section is a check that
never ran:

```markdown
# knowledge-audit report — <TODAY>

## Verdicts
| step | command | exit | reading |
(structure, values, reverse audit — one row each; exit 2 reads CHECK NEVER RAN)

## Structural findings
## Value findings
## Reverse audit proposals (advisory — never blocking)
## Knowledge leaves
## Decisions lifecycle
## Heartbeat
- days since last reflect: <n>          (or: no reflect has run yet)
- open fragments: findings <n>, misses <n>, gaps <n>
- top quarantined concepts: K-NNN (<count>), …   (or: none)
```

Fill every line from the outputs captured in steps 1–6 — never from memory
of a previous run: trust is per-run (D-011). Deliver the report in the
conversation; the audit commits nothing and edits nothing — anything worth
fixing routes to its owning path (concept PRs, kb-build, reflect, the
steward).
