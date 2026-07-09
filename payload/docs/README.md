# unknown-knowledge — this repo's knowledge base

This directory was seeded once by the [unknown-knowledge](https://github.com/unknown-creatives/unknown-knowledge)
kit and is now yours (D-001): three YAML stores that map the system
(`ontology/`, `knowledge/`, `decisions/`), a deterministic engine that checks
the map (`engine/`), and the agent protocol that runs the loop (`protocol/`).
There is no service, no runtime, and no update channel — everything is files
in this repo, branched and merged by your normal PRs.

One idea governs everything here: **the map is never the fact.** Stores hold
claims and pointers; your source files hold facts. The engine's job is to
diff the two and say exactly where they disagree.

> Commands run from the **repo root** with this directory at its default
> name `unknown-knowledge/`; substitute your chosen name if it differs.

## What you own vs. what was vendored

Everything is client-owned after seeding; the zone map in
`kit.manifest.yaml` records what an uninstall or audit needs to know — which
paths arrived from the kit and which your own loop produced.

| Zone | Paths | Meaning |
|---|---|---|
| seeded | `engine/`, `protocol/`, `schemas/`, `templates/`, `kit.manifest.yaml` | vendored at init: engine code, schemas, protocol markdown. Protocol conduct policy is explicitly yours to edit (see `docs/boundaries.md`) |
| client | `ontology/`, `knowledge/`, `decisions/`, `logs/`, `survey-scope.yaml` | your team's data. The kit shipped only empty scaffolding here; everything else was written by your loop |

## Running the gates

The engine is plain Node (≥ 22, no build step) with one library
dependency, `js-yaml`, resolved from your repo like any other package: if
your repo does not already carry it, run `npm install --save-dev js-yaml`
once.

The blocking-grade checks all take `--root` as the **repo root** and share
one exit-code contract: 0 = clean, 1 = findings/quarantines, 2 = the check
never ran. **A check that never ran is a blocking defect, never a silent
pass** — treat exit 2 as a stop, not a shrug.

```
node unknown-knowledge/engine/validate.js --root .          # structure: ids, refs, pointers
node unknown-knowledge/engine/validate-values.js --root .   # enumerated values vs. source
node unknown-knowledge/engine/preflight.js --root .         # store health + per-concept verdicts
```

`engine/audit.js` is different in kind — advisory (never blocking). It
proposes draft concepts for anchors the map does not cover yet; a human
reviews every draft. Run it on the steward cadence, never as a gate
(`docs/steward-guide.md`).

## How the loop works

The runtime contract — `RESOLVE → PREFLIGHT → GATHER → ACT → RECORD` — lives
in [`protocol/AGENTS.md`](protocol/AGENTS.md). That file is the single
source of truth for how agents navigate the stores, what a verdict obliges,
and when findings get appended; start every integration question there. The
procedures live in the skills under `protocol/skills/`, referenced by name
(D-019): `/knowledge-bootstrap` (first population), `/knowledge-reflect`
(consolidating findings into reviewed fixes), `/kb-build` (cited knowledge
writes), `/knowledge-audit` (the loop's heartbeat report).

## Extractor fixtures and later stacks (D-009)

Extractor fixtures for the stacks selected at init are included under
`engine/tests`. If you adopt another stack later, you author your own pack
from the included template (`templates/new-kind/`, plus the fixture
authoring README seeded beside the packs) — there is no update channel. The
governed path for teaching the engine a new anchor shape is
`protocol/new-kind-pipeline.md`.

## CI

Session-level preflight is a sufficient gate for a small team, not for
hundreds of engineers. At team scale, wire the validators into CI — copyable
templates and the PR drift-attribution recipe are in
[`docs/ci-wiring.md`](docs/ci-wiring.md). Init never wires CI for you
(D-006).

## Version stamp and license

`kit-version` in `kit.manifest.yaml` records the kit version that seeded
this directory — a birth certificate, not a dependency pin (D-021): it says
which schema revision, extractor-kind set, and fixture vintage the seed was
born with, and implies no update channel. The vendored code is Apache-2.0
(D-020); the seeded `LICENSE` and `NOTICE` carry the terms and the
attribution. Your stores and logs are your own content, not the kit's.

## Uninstalling

Delete this directory and remove the thin per-platform wrapper files init
generated at their conventional paths (e.g. under `.claude/`) — that is the
whole uninstall; nothing else in your repo belongs to the kit. Before you
delete, mind the zone map above: `ontology/`, `knowledge/`, `decisions/`,
`logs/`, and `survey-scope.yaml` are your team's data, and `logs/` in
particular is the recorded history of where your map and your code
disagreed — export what you want to keep first.

## Further reading

- [`docs/ci-wiring.md`](docs/ci-wiring.md) — CI templates + PR drift attribution (D-012)
- [`docs/steward-guide.md`](docs/steward-guide.md) — the steward role, cadence, CODEOWNERS, hygiene recipes
- [`docs/boundaries.md`](docs/boundaries.md) — what the kit guarantees, and what it will never catch
