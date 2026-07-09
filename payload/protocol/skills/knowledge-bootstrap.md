# /knowledge-bootstrap — phase-2 store population (PRD §6, D-019)

> Paths in this document are client-relative — relative to the vendored kit
> root after init (`ontology/…`, `engine/…`, `protocol/…`). In the kit repo
> itself these live under `payload/`. Commands are written to run from the
> **repo root** with the kit dir at its default name `unknown-knowledge/`;
> substitute your chosen kit dir name if it differs.

Init's phase 1 (the CLI) scaffolded empty stores; this skill is phase 2 — the
judgment half, run by whatever agent the client already uses. It populates
the stores: a confirmed traversal scope, a per-project class taxonomy, the
first ontology concepts (each born with its checkability rung), the miss-log
backlog, and the knowledge-store skeleton. Per-platform wrapper files are
thin pointers here; this is the platform-agnostic skill body. You operate
under `protocol/AGENTS.md` throughout — every gate rule there binds here.

Two `--root` conventions, stated once (same as AGENTS.md):

- Every store-reading CLI (`survey-map.js`, `resolve.js`, `validate.js`,
  `validate-values.js`) takes `--root` as the **repo root** (default: cwd);
  the stores are auto-located at `<root>/unknown-knowledge/`.
- `log-entry.js` takes `--root` as the **kit dir** (the directory containing
  `logs/`), e.g. `--root unknown-knowledge`.

## Resumable by construction

A dead session costs the remaining steps, never a restart. **On entry,
detect existing artifacts and resume from the first incomplete step** —
each step below also carries its own "On resume" rule:

| Artifact found on entry | What it means |
|---|---|
| `survey-scope.yaml` at the repo root | the scope+taxonomy gate was confirmed — it is **never re-litigated on resume**; skip to EMIT (survey-map now honors the scope automatically) |
| `ontology/_rules.yaml` with class rules | the taxonomy half of the gate is done; do not re-propose it |
| Concepts in `ontology/classes/` | emission already started — it is **idempotent by anchor identity**: probe each anchor with the reverse lookup before emitting; never a duplicate concept for the same anchor |
| An **open** `logs/misses/` entry for a path | the standing demand signal already exists — never mint a sibling for a known anchor (`protocol/new-kind-pipeline.md`) |
| `knowledge/_rules.yaml` with rule items | the KB interview happened; skip to FINISH |
| A proposed bootstrap decision in `decisions/entries/` | the wrap-up draft exists; go straight to the validator run |

## The six steps

```
1. SURVEY     read-only: engine/survey-map.js → triage, never traverse
2. GATE       ONE human gate: scope + taxonomy together → survey-scope.yaml
3. EMIT       concepts at their highest checkable rung, not exhaustively
4. MISS       unreadable anchors → logs/misses/ via engine/log-entry.js
5. INTERVIEW  knowledge-store skeleton from the human
6. FINISH     both validators green, bootstrap decisions drafted
```

### 1. SURVEY — run the map, triage the artifact

```
node unknown-knowledge/engine/survey-map.js --root .
```

**Raw repo traversal is a protocol violation.** The survey map is the
traversal surface: git-tracked files only, denylist applied, per-directory
extension histograms, and an anchor-candidate pre-scan sharing one regex
table with the extractor kinds. You *triage* this artifact — grep is free,
reading is expensive, judgment is what you are for. Add `--json` when you
need the histograms structured.

Exit codes: 0 clean; 1 = blind spots disclosed under `unsurveyed:`
(submodule gitlinks, out-of-root symlinks) — carry them to the gate, the
human decides; 2 = engine failure — **stop**, a check that never ran is a
blocking defect, never a silent pass.

From the map, prepare the gate material: the per-directory histograms (what
lives where), the ranked anchor-candidate list (what looks extractable, by
which kind), and the proposed include/exclude scope over top-level
directories.

**On resume:** always safe to re-run — the map is deterministic and honors
`survey-scope.yaml` once it exists (`scope (survey-scope.yaml): …` in the
output confirms the binding).

### 2. GATE — one combined scope + taxonomy review (human)

**ONE human gate, not two.** Present together, in the conversation — "here
is how I read your codebase":

1. **Scope** — which top-level areas are product surface (include) vs.
   vendored/generated/infra (exclude), plus any `unsurveyed:` blind spots
   the map disclosed. The kit dir itself belongs in the excludes: the map is
   never the territory.
2. **Taxonomy** — the proposed top-level ontology class spine
   (per-project, derived from the surveyed structure), with an id range per
   class.

On confirmation, write both artifacts:

- `survey-scope.yaml` at the **repo root** (shape:
  `schemas/survey-scope.schema.json` — `schema-version`, `include` with at
  least one prefix, optional `exclude`; exclude wins; `.` covers root-level
  files only; trailing slashes are normalized away).
- `ontology/_rules.yaml` — one rule per class with its `id-range`
  (`{ class: 100-…, id-range: [K-100, K-199] }`).

Then re-run survey-map and confirm the output header reads
`scope (survey-scope.yaml): …` — the map is now bounded.

This is **the honor-it contract**: every future audit and reflect sweep is
bounded to this scope and never rescans excluded areas. Widening happens
via `retrieval-miss` findings through the normal loop — **never by
re-litigating the gate**. Once `survey-scope.yaml` exists the gate is
confirmed; on resume it is never re-asked.

**On resume:** `survey-scope.yaml` present → skip this step entirely.

### 3. EMIT — concepts at their highest checkable rung

Walk the in-scope anchor candidates and emit §3.1 concept records into
`ontology/classes/`, catalog rows into `ontology/_catalog.yaml`. Every
concept is born knowing its rung — emit at the **highest checkable** one:

- **Rung 2 (value agreement)** — a shipped extractor kind fits the anchor:
  emit an `enumerates` descriptor (`kind` / `source` / `values`, plus
  `symbol`/`emit` where the kind needs them). **Read the source file and
  derive the values from it** — never guess from prose; equality is
  byte-exact, case-sensitive, set-based (§3.5), and YAML 1.1 coercion is a
  real trap (quote `on`, `no`, digit-leading keys).
- **Rung 1 (existence-only)** — no kind fits, or the concept is a grouping:
  a `source-of-truth` pointer and prose, no descriptor. The pointer rule:
  **point at a folder for identity, at a file for facts** — a vertical gets
  its directory (and pair load-bearing folder pointers with the grouping's
  entry file so the existence check has teeth); a value set gets the file
  that declares it.
- Prose-only concepts carry `last-verified` (rung 4); the reverification
  sweep maintains them.

**Deliberately not exhaustive: an ontology born complete is born wrong.**
Seed the load-bearing concepts — rung-1/2 coverage plus the high-value
prose concepts; the reverse audit (`engine/audit.js`, advisory) grows the
map proposal-first from there. Skipping a candidate is a normal triage
outcome, not a gap.

Verify each emitted batch immediately (repo-root `--root`; filter to the
touched ids):

```
node unknown-knowledge/engine/validate.js --concepts K-100,K-110 --root .
node unknown-knowledge/engine/validate-values.js --concepts K-100,K-110 --root .
```

Exit 1 = the draft disagrees with the source — fix the draft (re-read the
file); exit 2 = **stop**. A descriptor that hard-errors as out-of-envelope
does not get "simplified" until it passes — the anchor goes to MISS.

**On resume (idempotent by anchor identity):** before emitting for an
anchor, reverse-look it up —

```
node unknown-knowledge/engine/resolve.js --paths Sources/Sportsbook/Sport.swift --root .
```

If a concept's pointer already covers the path (folder pointers match
nested files), the anchor is emitted — skip it, never mint a duplicate
concept for the same anchor. `no concepts point at this path` means it
still needs one.

### 4. MISS — the anchors no shipped kind can read

Anchors with kind-shaped evidence but no shipped kind — a real registry the
library cannot read (computed arrays, conditional compilation, dynamic
derivation) — become miss entries, **one fragment each**, via the helper
(`--date` is injected, never wall-clock; note `--root` is the **kit dir**):

```
node unknown-knowledge/engine/log-entry.js create --log misses --date 2026-07-08 \
  --root unknown-knowledge \
  --entry '{"path":"Sources/Payments/Providers.swift","shape":"computed Swift array: static let all = core + regional (concatenation, no literal value set); swift-const-array is out of envelope"}'
```

`shape` carries paths and structure only — never file contents verbatim
(§3.4). This backlog feeds the governed §5.2 pipeline
(`protocol/new-kind-pipeline.md`): agents draft parsers there, humans gate
them, and a kind you author is **never wired into the validator in the same
session** (D-005). Do not write a bespoke parser during bootstrap.

**On resume:** an open miss for the path already IS the demand signal —
leave it; never mint a sibling (`open → open` is illegal, and the helper
hard-errors on it).

### 5. INTERVIEW — the knowledge-store skeleton (human)

The knowledge store's truth anchor is the world, not the code — so its
spine comes from the **human**, in a structured interview seeded by the
vocabulary the survey surfaced: which external domains does this product
answer to (regulation, industry rules, user research…), and what divisions
matter inside each?

Write the skeleton: the domain/division spine plus governance notes into
`knowledge/_rules.yaml` — **writes are human-only through the kb-build
skill (the sole write path), and every leaf requires citations; an
unsourced claim is not promotable** (§3.2). Bootstrap emits the skeleton
and standing-room structure only; cited leaves land afterwards through
kb-build's human gate, never in this session.

**On resume:** `knowledge/_rules.yaml` already carrying rule items → the
interview happened; do not re-ask it.

### 6. FINISH — green validators, recorded decisions

Bootstrap surfaced decisions — the taxonomy acceptance, any scope
trade-offs. Record them through the §3.5 decisions path: draft entries in
`decisions/entries/` with provisional date-suffixed ids
(`D-2026-07-08-<slug>`), `status: proposed`, `relates-to` refs to the
concepts they touch, plus catalog rows. The steward mints final `D-NNN`s at
acceptance — never the agent.

Then the whole-store gate — the skill declares done **only** when both
validators run clean, unfiltered:

```
node unknown-knowledge/engine/validate.js --root .
node unknown-knowledge/engine/validate-values.js --root .
```

Exit 0 + 0 = done: report the confirmed scope, the class spine, the
concepts emitted per rung, the misses logged, and the KB skeleton — all of
it lands through the normal PR gate (agents draft; humans approve). Exit 1
= fix the store, re-run. Exit 2 = **stop and report**; never declare
bootstrap done over a check that never ran.

**On resume:** an existing proposed bootstrap decision is not re-drafted —
but the validator run is never skipped: verdicts are per-run (D-011), so a
resumed session always re-runs both validators before declaring done.
