# acceptance/ — the PRD §10 acceptance harness (KK-16)

One deterministic run reports per-criterion status for the PRD's six
acceptance criteria against **both** acceptance fixtures
(`fixtures/swift-app`, `fixtures/ts-app`):

```sh
npm run acceptance        # = node acceptance/run.js
```

Zero-dependency node (D-002); every assertion goes through the engine's
public seams — the CLI processes — so a criterion is proven exactly the way a
client repo would observe it. CI runs the harness as the `fixture-acceptance`
job (`.github/workflows/ci.yml`); `ci-ok` depends on it.

Status vocabulary: **PASS/FAIL** (asserted by the run), **DEFERRED** (A1 —
`init` lands in M5; the hook is documented, never faked), **MANUAL** (A5 —
skills are prompts; their test is a checklist, not CI). The run exits 0 only
when every *asserted* criterion (A2–A4, A6) passes.

## Criterion table (source of truth: PRD §10, quoted verbatim)

| # | Capability | PRD §10 "proven how" (quoted) | Verified by | Where |
|---|---|---|---|---|
| A1 | Init completes cold | "CI runs `init` against each fixture; asserts the scaffold matches the payload manifest byte-for-byte; asserts acceptance fixtures are absent and selected-stack extractor fixtures (and only those) are present" | **DEFERRED to M5** — see §A1 below | hook in `acceptance/run.js` (A1 section) |
| A2 | Extraction works | "every MVP kind vs. fixture anchors → expected value sets; malformed descriptors hard-error; `dir-modules` options exercised" | harness: `validate-values.js` vs both fixtures' FIXTURE.md tables (clean sets, out-of-envelope hard errors, dir-modules plain + pattern/strip) | `acceptance/run.js` §A2; unit depth in `tests/extractor-kinds-{ts,swift,dir}.test.js`, `tests/validate-values.test.js` |
| A3 | Drift is caught | "planted drift in fixtures: registry value with no concept and the reverse; CI asserts the correct finding kind fires in each direction; wrong-pointer (all-values-missing) signature detected" | harness: `validate-values.js` — exact tabulated findings, both directions, both fixtures, wrong-pointer signature in each | `acceptance/run.js` §A3; same unit suites |
| A4 | Resolution works | "fixture queries → expected ranked concepts; confusable-with surfaced; CLI exit codes correct" | harness: `resolve.js` queries against both fixtures' stores (exact-term rank, confusable-with, zero-hit exit 0, usage-error exit 2) | `acceptance/run.js` §A4; unit depth in `tests/resolve.test.js` |
| A5 | Protocols are executable | "scripted walkthrough per skill against a fixture: checklist of expected artifacts (taxonomy proposal, emitted concepts with rungs, miss-log entries, findings, recommendation list, a kb-build cited leaf, a knowledge-audit report, preflight-conduct evidence per KK-26). Walkthroughs are wall-clock timed — the 'afternoon, not an engagement' claim gets its first datum here. Documented acceptance runs — the honest seam: skills are prompts, so their test is a checklist, not CI" | **MANUAL** — walkthrough checklists, indexed below; the harness reports where they live and never executes them | `acceptance/A5-*.md` |
| A6 | Engine additions are proven | "kit CI: survey-map candidate list contains every planted anchor and discloses unsurveyed paths (KK-25); preflight exit-code contract incl. store-wide failure → all-unknown (KK-26); suppression filtering, fail-open malformed entries, governance grep (KK-27); no-code-execution grep (D-014)" | harness: `survey-map.js` planted-anchor sweep + `unsurveyed:` disclosure, `preflight.js` exit-code contract incl. corrupted-store → all-unknown, `audit.js` suppression filtering + fail-open + advisory behavior, governance grep and D-014 no-code-execution grep over `payload/` | `acceptance/run.js` §A6; unit depth in `tests/survey-map.test.js`, `tests/preflight.test.js`, `tests/audit*.test.js` |

The harness and the unit suites deliberately exercise the *same public
seams* — the harness is the single per-criterion report, not a second test
suite; planted-case inventories live in each fixture's `FIXTURE.md`, and the
unit suites hold the exhaustive kind-level matrices.

## A1 — deferred hook (lands with M5: KK-17 `init`, KK-19 wiring assertion)

`npx unknown-knowledge init` does not exist yet, so the harness reports
`A1: DEFERRED` and asserts nothing (faking coverage would be worse than
none). When KK-17/KK-19 land, the A1 section of `acceptance/run.js` becomes a
real `criterion('A1', …)` that, **per fixture, in a fresh temp git repo**:

1. runs `init` cold (no interactive state, stack selected per fixture:
   `swift` / `ts`);
2. asserts the seeded scaffold matches the payload manifest
   **byte-for-byte** (identical store → byte-identical output);
3. asserts nothing under `fixtures/` was vendored (acceptance-fixture leakage
   impossible, D-007), and that the selected stack's extractor fixtures —
   and *only* those — are present (D-009, per selection combination);
4. asserts a second run on the seeded repo **refuses cleanly** (v1 init
   refuses on any existing or partial seed, PRD §6).

KK-19 owns the byte-for-byte assertion itself; this harness owns reporting
it as A1 in the same single run as A2–A4/A6.

## A5 — walkthrough checklist index (manual by design)

Skills are prompts; presenting a prompt artifact as CI-covered would be fake
coverage. A5 is proven by *documented acceptance runs*: a human runs each
scripted walkthrough with a fresh agent against a fixture, checks the
expected-artifact boxes, and records the wall-clock time.

| Checklist | Skill / protocol under test | Fixture | Status |
|---|---|---|---|
| [`A5-agents-md-walkthrough.md`](A5-agents-md-walkthrough.md) | `payload/protocol/AGENTS.md` runtime loop (resolve → preflight → act → log) | ts-app | landed (KK-20) |
| A5-kb-build walkthrough | kb-build skill | TBD | to come with KK-21 |
| A5-knowledge-audit walkthrough | knowledge-audit skill | TBD | to come with KK-22 |
| A5-reflect walkthrough | reflect skill (seeded findings → recommendation list → simulated approval → green re-validation) | TBD | to come with KK-23 |

Each new skill issue ships its `A5-<skill>-walkthrough.md` here; the harness
picks up any `acceptance/A5-*.md` automatically in its A5 report line.
