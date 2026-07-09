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

Status vocabulary: **PASS/FAIL** (asserted by the run), **MANUAL** (A5 —
skills are prompts; their test is a checklist, not CI). The run exits 0 only
when every *asserted* criterion (A1–A4, A6) passes. A1 is fully asserted:
the KK-17 copy engine, the KK-18 wrapper generation, and the KK-19 npx init
layer (headless cold-run on both fixture apps).

## Criterion table (source of truth: PRD §10, quoted verbatim)

| # | Capability | PRD §10 "proven how" (quoted) | Verified by | Where |
|---|---|---|---|---|
| A1 | Init completes cold | "CI runs `init` against each fixture; asserts the scaffold matches the payload manifest byte-for-byte; asserts acceptance fixtures are absent and selected-stack extractor fixtures (and only those) are present" | harness: `cli/init-copy.js` cold-run per stack selection combination (none/ts/swift/both) into a fresh temp dir — scaffold vs `cli/kit.manifest.yaml` expansion byte-for-byte, fixtures/tests absence (D-007), selected-stack packs only (D-009), second run refuses (§6); plus `cli/init.js` (the npx layer, KK-19) cold-run headlessly on scratch copies of both fixture apps — see §A1 below | `acceptance/run.js` §A1; unit depth in `tests/init-copy.test.js`, `tests/init-wrappers.test.js`, `tests/init.test.js` |
| A2 | Extraction works | "every MVP kind vs. fixture anchors → expected value sets; malformed descriptors hard-error; `dir-modules` options exercised" | harness: `validate-values.js` vs both fixtures' FIXTURE.md tables (clean sets, out-of-envelope hard errors, dir-modules plain + pattern/strip) | `acceptance/run.js` §A2; unit depth in `tests/extractor-kinds-{ts,swift,dir}.test.js`, `tests/validate-values.test.js` |
| A3 | Drift is caught | "planted drift in fixtures: registry value with no concept and the reverse; CI asserts the correct finding kind fires in each direction; wrong-pointer (all-values-missing) signature detected" | harness: `validate-values.js` — exact tabulated findings, both directions, both fixtures, wrong-pointer signature in each | `acceptance/run.js` §A3; same unit suites |
| A4 | Resolution works | "fixture queries → expected ranked concepts; confusable-with surfaced; CLI exit codes correct" | harness: `resolve.js` queries against both fixtures' stores (exact-term rank, confusable-with, zero-hit exit 0, usage-error exit 2) | `acceptance/run.js` §A4; unit depth in `tests/resolve.test.js` |
| A5 | Protocols are executable | "scripted walkthrough per skill against a fixture: checklist of expected artifacts (taxonomy proposal, emitted concepts with rungs, miss-log entries, findings, recommendation list, a kb-build cited leaf, a knowledge-audit report, preflight-conduct evidence per KK-26). Walkthroughs are wall-clock timed — the 'afternoon, not an engagement' claim gets its first datum here. Documented acceptance runs — the honest seam: skills are prompts, so their test is a checklist, not CI" | **MANUAL** — walkthrough checklists, indexed below; the harness reports where they live and never executes them | `acceptance/A5-*.md` |
| A6 | Engine additions are proven | "kit CI: survey-map candidate list contains every planted anchor and discloses unsurveyed paths (KK-25); preflight exit-code contract incl. store-wide failure → all-unknown (KK-26); suppression filtering, fail-open malformed entries, governance grep (KK-27); no-code-execution grep (D-014)" | harness: `survey-map.js` planted-anchor sweep + `unsurveyed:` disclosure, `preflight.js` exit-code contract incl. corrupted-store → all-unknown, `audit.js` suppression filtering + fail-open + advisory behavior, governance grep and D-014 no-code-execution grep over `payload/` | `acceptance/run.js` §A6; unit depth in `tests/survey-map.test.js`, `tests/preflight.test.js`, `tests/audit*.test.js` |

The harness and the unit suites deliberately exercise the *same public
seams* — the harness is the single per-criterion report, not a second test
suite; planted-case inventories live in each fixture's `FIXTURE.md`, and the
unit suites hold the exhaustive kind-level matrices.

## A1 — fully asserted (KK-17 copy engine + KK-18 wrappers + KK-19 npx init)

The KK-17 manifest + copy engine (`cli/kit.manifest.yaml`,
`cli/lib/copy-payload.js`, seam `cli/init-copy.js`) landed the A1 wiring
assertion documented here (moved from KK-16). The A1 section of
`acceptance/run.js` is a real `criterion('A1', …)` that, **per stack
selection combination (none / ts / swift / both), in a fresh temp dir**:

1. runs the copy engine cold through its public seam (`cli/init-copy.js` —
   no interactive state, flags only);
2. asserts the seeded scaffold matches the payload manifest expansion
   **byte-for-byte** — every manifest file copied exactly, nothing else
   present beyond the engine-generated `kit.manifest.yaml` stamp and the
   manifest's `.gitkeep`'d log dirs;
3. asserts nothing under `fixtures/` or `tests/` was vendored
   (acceptance-fixture leakage impossible by construction, D-007), and that
   the selected stacks' extractor fixtures — and *only* those — are present
   (D-009, per selection combination);
4. asserts a second run on the seeded target **refuses cleanly**, changing
   nothing (v1 init refuses on any existing or partial seed, PRD §6).

KK-18 adds a fifth check per selection: every platform wrapper generates at
its registry path, and a pre-existing root `AGENTS.md` is **sentinel-appended,
never clobbered** (§6).

KK-19 closes the criterion. The npx layer (`cli/init.js` — the `bin` target)
is cold-run **headlessly (`--yes`) on scratch git copies of both fixture
apps**, asserting the PRD's own A1 language end to end:

1. **completes with no hand-fixing** — exit 0, seed present, nothing to edit;
2. **auto-detection picks the right stack** per fixture (`ts` for `ts-app`,
   `swift` for `swift-app`), and only that stack's extractor pack ships (D-009);
3. the **D-009 later-stacks warning** appears in the output *and* in the
   seeded `README.md`;
4. the **`git check-ignore` sweep** stays silent on a clean repo, while a
   variant whose `.gitignore` swallows `logs` **warns and prints the negation
   rule** — a gitignored findings log kills the improvement loop silently;
5. **no CI file is ever written** (D-006): the seeded tree carries no
   `.github/`.

Init also preflights the seeded engine's one runtime dependency (`js-yaml`,
D-002), resolving it from the seeded engine file itself. Unresolvable is a
loud WARN rather than a refusal — the seed is correct and the fix is one
`npm install` away — but it is loud on purpose: until the dependency is there,
every engine command refuses to start and the whole kit is inert.

It used to be louder still. An unresolved import exited 1, which the §5
exit-code contract reads as *findings present* rather than *engine failure*, so
an agent riding those codes would quarantine-and-continue past an engine that
never ran. The entry shims closed that (UCS-956): a module-load failure exits 2.

No remaining seam: `npx unknown-knowledge init` itself works only
post-publish (`private: true` guards the package), which is a release step,
not an assertion gap — the same code path is what the harness cold-runs.

## A5 — walkthrough checklist index (manual by design)

Skills are prompts; presenting a prompt artifact as CI-covered would be fake
coverage. A5 is proven by *documented acceptance runs*: a human runs each
scripted walkthrough with a fresh agent against a fixture, checks the
expected-artifact boxes, and records the wall-clock time.

| Checklist | Skill / protocol under test | Fixture | Status |
|---|---|---|---|
| [`A5-agents-md-walkthrough.md`](A5-agents-md-walkthrough.md) | `payload/protocol/AGENTS.md` runtime loop (resolve → preflight → act → log) | ts-app | landed (KK-20) |
| [`A5-knowledge-bootstrap-walkthrough.md`](A5-knowledge-bootstrap-walkthrough.md) | `payload/protocol/skills/knowledge-bootstrap.md` phase-2 bootstrap (survey → gate → emit → miss → interview → green finish) | swift-app | landed (KK-21) |
| [`A5-knowledge-reflect-walkthrough.md`](A5-knowledge-reflect-walkthrough.md) | `payload/protocol/skills/knowledge-reflect.md` consolidation (seeded findings → clustering → recommendation list → simulated approval → apply → green re-validation → last-reflect stamp) | swift-app | landed (KK-22) |
| [`A5-kb-build-walkthrough.md`](A5-kb-build-walkthrough.md) | `payload/protocol/skills/kb-build.md` sole knowledge write path (classify → cite → draft → index → validate) | ts-app | landed (KK-23) |
| [`A5-knowledge-audit-walkthrough.md`](A5-knowledge-audit-walkthrough.md) | `payload/protocol/skills/knowledge-audit.md` health check + loop heartbeat (validators → reverse audit → sweeps → heartbeat → report) | ts-app | landed (KK-23) |

Each new skill issue ships its `A5-<skill>-walkthrough.md` here; the harness
picks up any `acceptance/A5-*.md` automatically in its A5 report line.
