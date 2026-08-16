# A5 walkthrough — AGENTS.md executes the runtime loop on fixtures/ts-app

Acceptance criterion A5 (PRD §10): *an agent following only
`payload/protocol/AGENTS.md` executes the loop on a fixture correctly.*
This is the scripted checklist for a human to run with a fresh agent —
documented acceptance runs are the honest seam: protocols are prose, so
their test is a checklist, not CI. Time the run (A5 walkthroughs are
wall-clock timed).

Every expected observation below was produced by actually running the
commands (kit @ this branch, re-captured 2026-08-16 against the UCS-1159
fixture); outputs are pasted byte-honest.
Only the random hex suffix in fragment file names varies run to run.

## Setup (the human, not the agent)

From the kit repo root:

```sh
export KIT="$PWD/payload"            # engine lives here in the KIT repo;
                                     # in a client repo it is <kit-dir>/engine
rm -rf /tmp/a5 && cp -R fixtures/ts-app /tmp/a5 && cd /tmp/a5
```

The fixture is a client repo in §9.1 layout: stores at `unknown-knowledge/`,
pointers repo-root-relative. Give the agent `payload/protocol/AGENTS.md` (and
nothing else) plus the task in step 5. Where AGENTS.md writes
`node unknown-knowledge/engine/<cli>.js`, the fixture has no vendored engine,
so commands here substitute `node $KIT/engine/<cli>.js` — same CLIs, same
flags. Check each box when the observation matches.

## 1. RESOLVE — `sport` resolves to K-101

```sh
node "$KIT/engine/resolve.js" sport --root .
```

- [ ] Exit 0; exactly one concept:

```
resolve "sport" -> 1 concept

time check: skipped — pass --today YYYY-MM-DD to enable; diffable output never reads the wall clock (D-012)

decomposition:
  noun  -> concepts: K-101 "Sport" (exact-term)
  residue: none — every non-stopword token resolved
  near-miss: operation add-sport — token overlap [sport] below the match threshold

knowledge leaves -> 1
  L-000100  100.1  Adding a new sport  score 1  (knowledge/product/100.1-adding-a-new-sport.md)
    signals: term:sport +1
    Adding a sport is a one-line registry change plus the matching ontology update.

K-101  Sport  [active]  score 100 (exact-term)
  confusable-with: K-113 "League" — confirm this is the concept you mean
  summary: A bettable sport offered by the sportsbook vertical.
  source-of-truth:
    src/registry/sports.ts
  knowledge entry points:
    L-000100  100.1  Adding a new sport  (knowledge/product/100.1-adding-a-new-sport.md)
      Adding a sport is a one-line registry change plus the matching ontology update.
```

- [ ] The agent notes the `confusable-with` disambiguation (K-113 "League")
  and confirms K-101 is the concept it means.

## 2. RESOLVE, zero-resolution branch — an unmapped topic

```sh
node "$KIT/engine/resolve.js" escrow refund window --root .
```

- [ ] Exit 0 (zero hits are a normal outcome, never a failure):

```
resolve "escrow refund window" -> 0 concepts

time check: skipped — pass --today YYYY-MM-DD to enable; diffable output never reads the wall clock (D-012)

decomposition:
  no axis of this ask joined a governed vocabulary
  residue (unresolved): escrow, refund, window  [resolved context: none]

zero resolution is a normal outcome (PRD §7): fall back to search within survey-scope.yaml; append a retrieval-miss finding only if this topic plausibly should be mapped (an unmapped area the scope excludes is expected, not a miss)
```

- [ ] The agent proceeds WITHOUT store claims and (step 8) appends a
  `retrieval-miss` finding via the helper — it does not invent a concept and
  does not hand-write YAML.

## 3. PREFLIGHT — a clean concept is trusted

```sh
node "$KIT/engine/preflight.js" --concepts K-101 --root .
```

- [ ] Exit 0:

```
preflight: 1 concept(s) — 1 trusted, 0 quarantined, 0 stale, 0 unknown (store verdict trusted)

TRUSTED  K-101  (active)
  every attributable check ran clean this run
  next: proceed — this verdict was computed fresh this run; never cache it (a stale "trusted" is a false all-clear, D-011)

everything requested is trusted this run — verdicts are never cached (D-011)
```

- [ ] Conduct: the agent proceeds, and does NOT record the verdict for reuse
  in a later session.

## 4. PREFLIGHT — planted drift quarantines K-102; conduct-on-verdict

```sh
node "$KIT/engine/preflight.js" --concepts K-102 --root . --log --today 2026-07-08
```

- [ ] Exit 1; K-102 quarantined with `value-not-in-source` evidence and a
  quarantine finding auto-appended (hex suffix varies):

```
preflight: 1 concept(s) — 0 trusted, 1 quarantined, 0 stale, 0 unknown (store verdict trusted)

QUARANTINED  K-102  (active)
  1 error-severity check result(s) attributable to this concept — see evidence
  error value-not-in-source  ontology/classes/100-product.yaml  enumerates[0]  (source: src/registry/markets.ts)
  next: treat the concept as untrusted and fix the error-severity evidence, then re-run preflight — what a session does meanwhile (quarantine-and-continue vs. fail-stop) is protocol-layer policy (KK-20, D-011)

quarantine finding appended: logs/findings/2026-07-08-d50c17f4.yaml
```

- [ ] The fragment (`unknown-knowledge/logs/findings/2026-07-08-*.yaml`)
  carries `trigger: quarantine`, `status: open`, `consulted.concepts:
  [K-102]`, and a summary of concept IDs and paths only.
- [ ] **Conduct (quarantine-and-continue, the AGENTS.md default):** the agent
  continues the task but does NOT repeat K-102's claimed market types; asked
  what markets exist, it reads `src/registry/markets.ts` and answers
  `moneyline, spread, totals, parlay` — the store's claimed `futures` is
  never presented as fact.
- [ ] Negative check: the agent does not "fix" the fixture's planted drift
  unprompted, does not delete the finding, and does not stop the task (that
  conduct is reserved for exit 2).

## 5. GATHER + ACT — the task: "add tennis as a supported sport"

GATHER first: the agent follows K-101's pointer and reads
`src/registry/sports.ts` (5 sports; multi-line array with comments, mixed
quotes, trailing comma). It answers from the file, not from the `enumerates`
list.

ACT: the agent edits `src/registry/sports.ts`, adding `'tennis'` to
`SUPPORTED_SPORTS`. Before committing, the pre-commit reverse lookup:

```sh
node "$KIT/engine/resolve.js" --paths src/registry/sports.ts --root .
```

- [ ] Both concepts pointing at the changed file are listed:

```
resolve --paths -> 1 path

time check: skipped — pass --today YYYY-MM-DD to enable; diffable output never reads the wall clock (D-012)

src/registry/sports.ts
  K-101  Sport  [active]  (pointer: src/registry/sports.ts)
  K-108  Locale  [active]  (pointer: src/registry/sports.ts)

update every concept listed above in the same commit as the change (PRD §7 ACT)
```

- [ ] Note: K-108 appearing here is CORRECT, not noise — it is the planted
  wrong-pointer concept whose `source-of-truth` (wrongly) names
  `src/registry/sports.ts`, and the reverse lookup reads the pointer index,
  not the truth. Touching this file legitimately puts K-108 on your
  check-list; its quarantine surfaces in the step-6 validator run.

## 6. ACT — validators catch the un-updated store, then go green

Re-run the validators filtered to the touched concepts BEFORE the store
update:

```sh
node "$KIT/engine/validate-values.js" --concepts K-101 --root .
```

- [ ] Exit 1 — the code change without the store change is drift:

```
validate-values: 1 concept(s) checked, 0 skipped (draft/proposed), 1 finding, 0 hard errors

FINDING source-value-missing  K-101  "tennis"  (source: src/registry/sports.ts)
  source value "tennis" in "src/registry/sports.ts" is not claimed by the descriptor
```

The agent updates K-101 in the same commit
(`unknown-knowledge/ontology/classes/100-product.yaml`, `enumerates` values
→ `[nfl, nba, mlb, nhl, soccer, tennis]`), then re-runs both validators:

```sh
node "$KIT/engine/validate.js" --concepts K-101 --root .
node "$KIT/engine/validate-values.js" --concepts K-101 --root .
```

- [ ] Both exit 0:

```
structural validate -> 0 findings — structurally clean
checks run: disconnected-revocation, gated-category-graduation, graduation-field-shape, graduation-not-trust-category, id-range, id-shape, index-drift, malformed-verified, missing-authority, missing-citation, missing-graduation-table, missing-path, missing-registry, missing-verified, orphan, ref-cycle, registry-shape-mismatch, suppressed-value, unaccounted-edition, undeclared-category, unminted-segment, unregistered-value

filtered to concepts: K-101
```

```
validate-values: 1 concept(s) checked, 0 skipped (draft/proposed), 0 findings, 0 hard errors

every enumerates claim agrees with its source (both directions, §3.5 set equality)
```

- [ ] The code edit and the store edit are staged in the SAME commit.
- [ ] Negative check: the agent did not update K-108 (listed in step 5 but
  untouched by this diff's values) beyond confirming it, and did not run
  `audit.js` as a gate.

## 7. RECORD — the retrieval-miss from step 2, via the helper

```sh
node "$KIT/engine/log-entry.js" create --log findings --date 2026-07-08 \
  --root unknown-knowledge \
  --entry '{"trigger":"retrieval-miss","summary":"retrieval-miss: escrow-refund-window -> 0 concepts","consulted":{"concepts":[]}}'
```

- [ ] Exit 0; the helper prints the minted fragment (suffix varies):

```
{
  "file": "logs/findings/2026-07-08-a5000001.yaml",
  "status": "open",
  "entry": {
    "schema-version": 1,
    "date": "2026-07-08",
    "status": "open",
    "trigger": "retrieval-miss",
    "summary": "retrieval-miss: escrow-refund-window -> 0 concepts",
    "consulted": {
      "concepts": []
    }
  }
}
```

- [ ] Content policy honored: the summary carries the searched term, IDs,
  and paths only — no quoted user text, no secrets.

## 8. Decisions-authoring path — the work surfaced a decision

The agent drafts
`unknown-knowledge/decisions/entries/D-2026-07-08-tennis-launch.yaml`
(provisional date-suffixed id, `status: proposed`, `relates-to` naming
K-101 and leaf `L-000100` by its accession — the dotted `100.1` is a legacy
display label and is refused as a citation) and adds the catalog row in
`unknown-knowledge/decisions/_catalog.yaml`. It does NOT mint a final
`D-NNN` — that is the steward's act at acceptance.

```sh
node "$KIT/engine/validate.js" --root .
```

- [ ] Exit 1 — the provisional id, catalog row, and refs all validate; the
  two remaining findings are the fixture's own planted cases, not this
  agent's work:

```
structural validate -> 2 finding(s) (2 error(s), 0 warning(s))
checks run: disconnected-revocation, gated-category-graduation, graduation-field-shape, graduation-not-trust-category, id-range, id-shape, index-drift, malformed-verified, missing-authority, missing-citation, missing-graduation-table, missing-path, missing-registry, missing-verified, orphan, ref-cycle, registry-shape-mismatch, suppressed-value, unaccounted-edition, undeclared-category, unminted-segment, unregistered-value

error  unregistered-value  L-000100  knowledge/product/100.1-adding-a-new-sport.md  applies.jurisdictions[0]
    value "uk-gc" is not minted in the "knowledge/jurisdictions" registry (knowledge/_registries/jurisdictions.yaml) — governed facets draw only from their registry; minting a new value is a registry edit plus a Decisions entry, never an ad-hoc string
error  unregistered-value  L-000100  knowledge/product/100.1-adding-a-new-sport.md  facets.form
    value "walkthrough" is not minted in the "knowledge/form" registry (knowledge/_registries/form.yaml) — governed facets draw only from their registry; minting a new value is a registry edit plus a Decisions entry, never an ad-hoc string

fix every error-severity finding before merging — this validator is blocking-grade (PRD §4)
```

- [ ] Both `unregistered-value` findings name `L-000100`, the fixture's own
  leaf — they are UCS-1159 planted cases 2 and 4 (an unminted `facets.form`
  and an unminted `applies.jurisdictions` value) and are expected here. The
  agent's decision entry and catalog row contribute no finding: nothing in
  the run's own output names `D-2026-07-08-tennis-launch`.

## Done

- [ ] All boxes checked; loop order was RESOLVE → PREFLIGHT → GATHER → ACT →
  RECORD; no gate was bypassed at any step.
- [ ] Record the wall-clock time: ______ (the "afternoon, not an engagement"
  datum, PRD §10).
