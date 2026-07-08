# The new-kind pipeline (PRD §5.2) — the trust boundary

> Paths in this document are client-relative — relative to the vendored kit
> root after init (`schemas/…`, `templates/…`, `engine/…`, `protocol/…`). In
> the kit repo itself these live under `payload/`.

An extractor **kind** is a small deterministic recipe (~30-line parser) that
reads a value set out of a reified anchor. The shipped kind library covers the
common shapes (PRD §5.1); everything else surfaces as a **miss** — an anchor no
shipped kind can read. This document is the governed path from a miss to a new
kind. It is a trust boundary, not a convenience path: a subtly wrong parser
produces a false all-clear, which is worse than no check.

> **Hard rule (D-005): validators execute only vendored, versioned,
> test-covered code — never code authored in the session that runs it.**
> A kind drafted in a session is NEVER wired into the validator in that same
> session. It enters via the GATE step: a PR carrying the parser, its fixture
> tests, and a demo run, merged after human review. Agents draft; humans gate;
> code validates.

Before drafting any parser, weigh the alternative of **reifying the anchor
into a standard shape** (product principle 6): when a fact can't be extracted
because the code never reified it, the right proposal is often a registry/enum
in the code — pushing the system toward being describable — not a bespoke
parser.

## Entry point: the miss-log

The pipeline consumes `logs/misses/` — the demand-driven extractor backlog.
A miss entry is **one file per entry** (`logs/misses/<date>-<hex8>.yaml`,
D-010) so concurrent sessions never merge-conflict, written via the
append/transition helper (`engine/log-entry.js`), never by hand-editing YAML.

Fields, per `schemas/miss.schema.json`:

| Field | Req. | Meaning |
|---|---|---|
| `schema-version` | yes | integer ≥ 1; stamped by the helper (§3.5, additive-only evolution) |
| `date` | yes | ISO date the miss was recorded (injected — never wall-clock) |
| `path` | yes | root-relative path of the anchor no kind can read |
| `shape` | yes | shape description — enough for this pipeline to draft a parser; paths and structure only, never file contents verbatim |
| `session` | no | opaque platform/session hint — an ID, never quoted session content |
| `status` | yes | `open → proposed → resolved / rejected`; re-open-not-duplicate |
| `verified` | — | stamped by the transition helper when the entry resolves (validator re-run passed); removed on re-open |
| `reason` | — | required on rejection; travels only with `rejected` |
| `occurrences` | — | re-open dates: recurrences re-open the same entry, never duplicate |

Lifecycle invariants. The schema gate (`engine/lib/validate-record.js`)
enforces exactly two of them on any fragment, hand-edited or not, matching
what the transition helper enforces on its write path — on these two the
gates cannot disagree:
`verified` ⇔ status `resolved`, both directions; `rejected` ⇒ non-empty
`reason`, and `reason` travels only with `rejected`.
The rest is **helper-only**: only the transition helper's write path drops
`verified`/`reason` on re-open and appends the re-open date to `occurrences`
— a hand-edited fragment missing an occurrence entry still validates clean,
which is one more reason fragments are written via the helper, never by hand.

**Capture content policy (§3.4):** miss entries carry concept IDs and file
paths only — never verbatim user text, quoted session content, or secrets.
Committed fragments are permanent git history.

## The six steps

```
1. SURVEY    read-only: the bootstrap/reflect agent inventories anchor shapes
2. MATCH     configure concepts from the shipped kind library
3. DRAFT     for each miss: agent writes the parser
             + a test fixture (sample file → expected values, following
               the shipped extractor-fixture template, D-009)
             + a demo run against the live anchor it was drafted for
4. GATE      human review — fast, because the claim is mechanical
5. INTEGRATE parser lands as versioned, tested code (client zone of their repo;
             kit library if the vendor harvests it for future inits)
6. RE-RUN    concepts depending on the new kind emit last
```

### 1. SURVEY — inventory anchor shapes (read-only)

The bootstrap/reflect agent triages the survey-map artifact (never
raw-traverses the repo) and inventories the anchor shapes concepts point at.
Anchors with a shipped kind proceed to MATCH. Anchors with **kind-shaped
evidence but no kind** — a real registry the library can't read — become miss
entries, written via the helper (verified working invocation; `--date` is
mandatory and injected, never wall-clock):

```
node engine/log-entry.js create --log misses --date 2026-07-08 \
  --entry '{"path":"config/regions.txt","shape":"plain-text list, one region code per line, # comments"}'
```

SURVEY consumes the misses already in the backlog too — never minting a
sibling for a known anchor:

- a recurrence of a **still-open** miss needs no transition and gets none:
  `open → open` is illegal (the helper hard-errors), because the open entry
  *is* the standing demand signal. The helper offers no occurrences-append
  for open entries; the agent simply leaves the entry as-is and moves on.
- a recurrence of a **resolved or rejected** miss **re-opens the same entry**
  (`transition --to open`), which appends the date to `occurrences` and drops
  the stale `verified`/`reason`.

### 2. MATCH — configure from the shipped library first

Every anchor that a shipped kind *can* read gets an `enumerates` descriptor
(`kind` / `source` / `values`, plus `symbol`/`emit` where the kind needs them)
against the shipped library. Only what remains unmatched justifies DRAFT —
and even then, weigh reification (principle 6) before a bespoke parser.

### 3. DRAFT — parser + fixture + demo run

For each miss that survives MATCH, the agent drafts, from the shipped template
(`templates/new-kind/`, see its README):

1. **the parser** — a pure, deterministic function: source text in, value set
   out; hard-errors loudly on anything it can't parse, and declares a
   **syntactic envelope**, hard-erroring when out-of-envelope sentinels appear
   in the matched span — a confident wrong parse is a false all-clear, the
   D-005/D-012 failure class;
2. **a test fixture** — sample file → expected values, following the shipped
   extractor-fixture template (D-009);
3. **a demo run** against the live anchor the miss recorded (`path`), with the
   output attached to the PR.

The draft NEVER runs inside the validator in this session (D-005). The miss
entry transitions `open → proposed` when the draft PR exists.

### 4. GATE — human review

A human reviews the PR. The review is fast because the claim is mechanical:
parser + fixture + demo-run output — does the fixture cover the envelope, does
the demo run reproduce the live anchor's values, is the envelope honest about
what it rejects? Rejection transitions the miss `proposed → rejected` with a
`reason` (rejections record the reason, §8). A rejected miss that recurs
re-opens (`rejected → open`) — the backlog keeps the demand signal.

### 5. INTEGRATE — versioned, tested code

The merged parser lands as versioned, test-covered code in the client zone of
their repo (the vendor harvests it into the kit library only for *future*
inits — seeded-once, D-001). It is now vendored code the validator may
execute: this preserves D-014 (the engine never imports/evals/spawns repo
*content* at validate time — a new kind enters the engine's own reviewed code,
it is never dynamically loaded from the store or the scanned tree).

### 6. RE-RUN — dependent concepts emit last

Concepts whose `enumerates` descriptors depend on the new kind are (re)emitted
and validated last, once the kind is merged. A green validator re-run
transitions the miss `proposed → resolved`; the helper stamps `verified` with
the run date. A later regression or recurrence re-opens the same entry
(`resolved → open`, dropping `verified`, appending to `occurrences`).

## Miss lifecycle ↔ pipeline steps

| Transition | When |
|---|---|
| *(created `open`)* | SURVEY records an unextractable anchor |
| `open → proposed` | DRAFT produced parser + fixture + demo run; PR open |
| `proposed → resolved` (+ `verified`) | GATE approved, INTEGRATE merged, RE-RUN passed |
| `proposed → rejected` (+ `reason`) | GATE rejected the draft |
| `resolved → open` / `rejected → open` | recurrence — same entry re-opens, `occurrences` appended; `verified`/`reason` dropped |

These are exactly the legal transitions the helper enforces; any other move is
a hard error that leaves the fragment untouched.

## Drafting template

`templates/new-kind/` ships the drafting skeleton — six files: a
framework-agnostic parser module (whose CLI is the demo-run tool), a
descriptor example, a fixture pair (`fixture/sample.list` →
`fixture/EXPECTED.yaml`), a stand-in demo anchor
(`fixture/demo-anchor.list`), and a README that walks the demo run. Together
these cover the three DRAFT artifacts above (parser, fixture, demo run).
The template README also records one manual walkthrough of the
template against its own fixture (an honest seam: a documented manual
exercise, not CI — the kit's CI pins the template artifacts against each
other and replays the walkthrough's CLI runs so the transcripts can't rot
apart, but exercising a draft against a *live* anchor is always manual).
