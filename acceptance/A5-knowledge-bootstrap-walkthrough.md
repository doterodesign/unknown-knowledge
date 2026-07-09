# A5 walkthrough — /knowledge-bootstrap populates the stores on fixtures/swift-app

Acceptance criterion A5 (PRD §10): *an agent following only
`payload/protocol/skills/knowledge-bootstrap.md` executes phase-2 bootstrap
on a fixture correctly.* This is the scripted checklist for a human to run
with a fresh agent — documented acceptance runs are the honest seam:
protocols are prose, so their test is a checklist, not CI. Time the run
(A5 walkthroughs are wall-clock timed).

Every expected observation below was produced by actually running the
commands (kit @ this branch, 2026-07-08); outputs are pasted byte-honest.
Only the random hex suffix in fragment file names varies run to run.

## Setup (the human, not the agent)

From the kit repo root:

```sh
export KIT="$PWD/payload"            # engine lives here in the KIT repo;
                                     # in a client repo it is <kit-dir>/engine
rm -rf /tmp/a5-kb && cp -R fixtures/swift-app /tmp/a5-kb && cd /tmp/a5-kb
# Reset the stores to the empty phase-1 seed — bootstrap POPULATES them.
# (The fixture ships pre-populated for the A2/A3 criteria.)
rm -rf unknown-knowledge
mkdir -p unknown-knowledge/ontology/classes unknown-knowledge/knowledge \
  unknown-knowledge/decisions/entries unknown-knowledge/logs/findings \
  unknown-knowledge/logs/misses unknown-knowledge/logs/gaps
cp "$KIT/templates/ontology/_catalog.yaml"  "$KIT/templates/ontology/_rules.yaml"  unknown-knowledge/ontology/
cp "$KIT/templates/knowledge/_catalog.yaml" "$KIT/templates/knowledge/_rules.yaml" unknown-knowledge/knowledge/
cp "$KIT/templates/decisions/_catalog.yaml" unknown-knowledge/decisions/
git init -q . && git add -A          # survey-map reads git ls-files (the
                                     # index suffices; no commit needed)
```

The scratch copy is now a client repo the moment after `init`: §9.1 layout,
empty stores, no `survey-scope.yaml`. Give the agent
`payload/protocol/skills/knowledge-bootstrap.md` (plus
`payload/protocol/AGENTS.md`, which it operates under) and nothing else.
Where the skill writes `node unknown-knowledge/engine/<cli>.js`, the
fixture has no vendored engine, so commands here substitute
`node $KIT/engine/<cli>.js` — same CLIs, same flags. Check each box when
the observation matches.

## 1. SURVEY — the map, not a traversal

```sh
node "$KIT/engine/survey-map.js" --root .
```

- [ ] Exit 0; the full byte-honest map:

```
surveyed 16 tracked file(s) across 11 director(ies); 0 denylisted
scope (proposed): include ., Config, Resources, Sources, unknown-knowledge; exclude (none)
anchor candidates: 22
  dir-modules        .
  yaml-keys          Config/app-config.yaml
  yaml-map-keys      Config/app-config.yaml
  yaml-keys          Config/feature-flags.yaml
  yaml-map-keys      Config/feature-flags.yaml
  strings-keys       Resources/Localizable.xcstrings
  strings-keys       Resources/en.lproj/Localizable.strings
  dir-modules        Sources
  swift-enum         Sources/Analytics/Events.swift
  swift-const-array  Sources/Payments/Providers.swift
  swift-enum         Sources/Payments/Providers.swift
  swift-const-array  Sources/Settings/Theme.swift
  swift-enum         Sources/Settings/Theme.swift
  swift-const-array  Sources/Sportsbook/Markets.swift
  swift-enum         Sources/Sportsbook/Markets.swift
  swift-enum         Sources/Sportsbook/Sport.swift
  dir-modules        unknown-knowledge
  yaml-keys          unknown-knowledge/decisions/_catalog.yaml
  yaml-keys          unknown-knowledge/knowledge/_catalog.yaml
  yaml-keys          unknown-knowledge/knowledge/_rules.yaml
  yaml-keys          unknown-knowledge/ontology/_catalog.yaml
  yaml-keys          unknown-knowledge/ontology/_rules.yaml
nothing unsurveyed — the map saw every tracked path
```

- [ ] The agent TRIAGES this artifact and never raw-traverses the repo
  (no `find`/`ls -R`/glob sweeps outside the map — a raw traversal is a
  protocol violation, and the walkthrough fails here if one happens).
- [ ] For the gate it pulls the per-directory histograms
  (`--json` → `directories`), e.g.:

```json
"directories": [
  { "path": ".",       "files": 2, "extensions": { "(none)": 1, ".md": 1 } },
  { "path": "Config",  "files": 2, "extensions": { ".yaml": 2 } },
  ...
]
```

## 2. GATE — one combined scope + taxonomy review

- [ ] The agent presents ONE combined review in the conversation: the
  proposed include/exclude scope AND the class-spine proposal together —
  not two separate gates. Reasonable proposal for this fixture:
  include `Config`, `Resources`, `Sources`; exclude the kit dir
  `unknown-knowledge` (the map is never the territory) and root-level
  files; classes `100-sportsbook` and `200-platform`.
- [ ] Nothing was written before the human confirms.

On confirmation the agent writes `survey-scope.yaml` at the repo root:

```yaml
schema-version: 1
include:
  - Config
  - Resources
  - Sources
exclude: []
```

and the class spine into `unknown-knowledge/ontology/_rules.yaml`:

```yaml
schema-version: 1
store: ontology
rules:
  - class: 100-sportsbook
    id-range: [K-100, K-199]
  - class: 200-platform
    id-range: [K-200, K-299]
```

Re-run the map to confirm the honor-it contract binds:

```sh
node "$KIT/engine/survey-map.js" --root .
```

- [ ] Exit 0; the header now reads the confirmed scope and the kit-dir
  candidates are gone:

```
surveyed 9 tracked file(s) across 7 director(ies); 0 denylisted
scope (survey-scope.yaml): include Config, Resources, Sources; exclude (none)
anchor candidates: 16
```

- [ ] Resume semantics: the gate is now confirmed forever — a resumed
  session seeing `survey-scope.yaml` skips straight past it and never
  re-asks.

## 3. EMIT — rung-aware concepts from the planted anchors

The agent walks the in-scope candidates and emits a deliberately small
first batch ("an ontology born complete is born wrong"): a folder-identity
concept for the vertical (rung 1) and both facets of the `Sport` enum
(rung 2). It reads `Sources/Sportsbook/Sport.swift` to derive the values —
never guessing from prose.

`unknown-knowledge/ontology/classes/100-sportsbook.yaml`:

```yaml
schema-version: 1
entries:
  - id: K-100
    term: Sportsbook
    class: 100-sportsbook
    summary: The sportsbook vertical — sports, markets, odds display.
    source-of-truth: [Sources/Sportsbook]     # folder for IDENTITY (rung 1)
    owned-by: sportsbook
    status: active
    last-verified: "2026-07-08"

  - id: K-110
    term: Sport
    class: 100-sportsbook
    summary: A bettable sport offered by the app (Swift case-name facet).
    aliases: [sport type]
    source-of-truth: [Sources/Sportsbook/Sport.swift]   # file for FACTS
    owned-by: sportsbook
    confusable-with: [K-120]
    status: active
    last-verified: "2026-07-08"
    enumerates:                               # rung 2: value agreement
      - kind: swift-enum
        source: Sources/Sportsbook/Sport.swift
        symbol: Sport
        emit: case-name
        values: [football, basketball, baseball, iceHockey, soccer, tennis]

  - id: K-120
    term: Sport wire code
    class: 100-sportsbook
    summary: The upstream odds-feed code for a sport (raw-value facet).
    source-of-truth: [Sources/Sportsbook/Sport.swift]
    owned-by: sportsbook
    confusable-with: [K-110]
    status: active
    last-verified: "2026-07-08"
    enumerates:
      - kind: swift-enum
        source: Sources/Sportsbook/Sport.swift
        symbol: Sport
        emit: raw-value
        values: [NFL, NBA, MLB, NHL, EPL, ATP]
```

plus three catalog rows in `unknown-knowledge/ontology/_catalog.yaml`
(`K-100`/`K-110`/`K-120` → `classes/100-sportsbook.yaml`).

- [ ] Folder-vs-file rule honored: the vertical points at the folder, the
  value sets at the file.
- [ ] Not-exhaustive discipline: candidates were *triaged*, not
  exhaustively converted — skipping `Theme.swift`, config keys, and
  localization keys in the first batch is a normal outcome, not a gap.

If the agent drafts a value the source does not carry (say `cricket`
instead of `tennis`), the batch validation catches it — exit 1:

```
validate-values: 1 concept(s) checked, 0 skipped (draft/proposed), 2 findings, 0 hard errors

FINDING source-value-missing  K-110  "tennis"  (source: Sources/Sportsbook/Sport.swift)
  source value "tennis" in "Sources/Sportsbook/Sport.swift" is not claimed by the descriptor
FINDING value-not-in-source  K-110  "cricket"  (source: Sources/Sportsbook/Sport.swift)
  claimed value "cricket" is not in "Sources/Sportsbook/Sport.swift" (byte-exact, case-sensitive, §3.5)
```

- [ ] The fix is re-reading the source, never bending the claim until the
  validator stops complaining about the wrong thing.

Idempotency probe (the resume rule) — before emitting for an anchor:

```sh
node "$KIT/engine/resolve.js" --paths Sources/Sportsbook/Sport.swift,Sources/Payments/Providers.swift --root .
```

- [ ] Exit 0:

```
resolve --paths -> 2 paths

Sources/Payments/Providers.swift
  no concepts point at this path

Sources/Sportsbook/Sport.swift
  K-100  Sportsbook  [active]  (pointer: Sources/Sportsbook)
  K-110  Sport  [active]  (pointer: Sources/Sportsbook/Sport.swift)
  K-120  Sport wire code  [active]  (pointer: Sources/Sportsbook/Sport.swift)

update every concept listed above in the same commit as the change (PRD §7 ACT)
```

- [ ] A resumed session sees `Sport.swift` covered (note the folder pointer
  matching the nested file too) and emits NO duplicate concept for it;
  `Providers.swift` reads `no concepts point at this path` — that anchor is
  still open (and goes to step 4, not to a concept: its value set is
  computed).

## 4. MISS — the unextractable anchor, via the helper

`Sources/Payments/Providers.swift` holds `static let all = core + regional`
— kind-shaped evidence no shipped kind can read (a computed array is out of
`swift-const-array`'s envelope). One fragment, via the helper — note
`--root` is the KIT DIR here:

```sh
node "$KIT/engine/log-entry.js" create --log misses --date 2026-07-08 \
  --root unknown-knowledge \
  --entry '{"path":"Sources/Payments/Providers.swift","shape":"computed Swift array: static let all = core + regional (concatenation, no literal value set); swift-const-array is out of envelope"}'
```

- [ ] Exit 0; the helper prints the minted fragment (hex suffix varies):

```
{
  "file": "logs/misses/2026-07-08-eb2deedb.yaml",
  "status": "open",
  "entry": {
    "schema-version": 1,
    "date": "2026-07-08",
    "status": "open",
    "path": "Sources/Payments/Providers.swift",
    "shape": "computed Swift array: static let all = core + regional (concatenation, no literal value set); swift-const-array is out of envelope"
  }
}
```

- [ ] The fragment file carries `status: open` and a `shape` describing
  structure only — no file contents verbatim, no session text (§3.4).
- [ ] Negative checks: the agent does NOT write a bespoke parser for it in
  this session (D-005 — the governed path is
  `protocol/new-kind-pipeline.md`), and a resumed session finding this open
  entry does NOT mint a sibling for the same path.

## 5. INTERVIEW — the knowledge skeleton from the human

- [ ] The agent asks the human for domains/divisions (seeded by the code
  vocabulary: betting, payments, localization → e.g. domains `regulation`
  and `product`), and writes the skeleton with governance notes into
  `unknown-knowledge/knowledge/_rules.yaml`:

```yaml
schema-version: 1
store: knowledge
rules:
  - rule: write-gate
    text: Human-only; the kb-build skill is the sole write path. Leaves require citations.
  - rule: domains
    domains:
      - domain: regulation
        divisions: [licensing, settlement, responsible-gaming]
      - domain: product
        divisions: [betting-markets, promotions]
```

- [ ] Negative check: NO knowledge leaves were written — cited leaves land
  only through kb-build's human gate, never in this session.

## 6. FINISH — green validators, the bootstrap decision drafted

The agent drafts
`unknown-knowledge/decisions/entries/D-2026-07-08-bootstrap-taxonomy.yaml`
(provisional date-suffixed id, `status: proposed`, category `scope`,
`relates-to` naming K-100/K-110/K-120) plus its catalog row. It does NOT
mint a final `D-NNN` — that is the steward's act at acceptance.

Then the whole-store gate:

```sh
node "$KIT/engine/validate.js" --root .
node "$KIT/engine/validate-values.js" --root .
```

- [ ] Both exit 0:

```
structural validate -> 0 findings — structurally clean
checks run: id-range, id-shape, index-drift, missing-citation, missing-path, orphan, ref-cycle
```

```
validate-values: 3 concept(s) checked, 0 skipped (draft/proposed), 0 findings, 0 hard errors

every enumerates claim agrees with its source (both directions, §3.5 set equality)
```

- [ ] The agent declares bootstrap done only now, reporting: the confirmed
  scope, the class spine, concepts per rung (1 × rung-1, 2 × rung-2), one
  miss logged, the KB skeleton, one proposed decision.

## Done

- [ ] All boxes checked; step order was SURVEY → GATE → EMIT → MISS →
  INTERVIEW → FINISH; the one human gate was asked exactly once; no raw
  traversal happened at any step.
- [ ] Resumability spot-check: kill the session after step 2 and restart —
  the agent detects `survey-scope.yaml`, never re-asks the gate, and the
  re-run of step 3's probe emits no duplicate concepts.
- [ ] Record the wall-clock time: ______ (the "afternoon, not an
  engagement" datum, PRD §10).
