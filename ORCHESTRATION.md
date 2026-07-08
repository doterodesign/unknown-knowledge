# ORCHESTRATION.md — standing orders for building unknown-knowledge v1

The build loop re-reads this file every iteration. It is the single source of
truth for *how* the kit gets built; **PRD.html defines *what*** (§12 = the issue
graph; §10 A1–A6 = what "proven" means). Edit this file to change the loop's
behavior — the loop prompt itself stays a pointer.

## SSOTs

- **Spec:** `PRD.html` — grilled & confirmed 2026-07-07. §12 milestones M0–M6,
  issues KK-01..KK-28 with done-criteria; §10 acceptance A1–A6.
- **Glossary:** `CONTEXT.md`.
- **Decisions:** `PRD.html` §13 (D-001..D-016) + `decisions/entries/`
  (D-017 npm name clean; D-018 bare `unknown-knowledge` canonical, scope
  reserved; D-019 skills are `/knowledge-bootstrap`, `/knowledge-reflect`,
  `/knowledge-audit`, `/kb-build` unchanged). **All settled — never
  relitigate.** Especially: D-002 zero-build TS/Node, D-005 validators run
  only vendored tested code, D-007 payload allowlist, D-012 no git-diff
  subset validation, D-014 the engine never executes client code.
- **Tracker:** Linear project **"unknown-knowledge v1"**
  (id `cb23ffce-1cc2-43b1-b03e-6e4fbf3859a0`, team "Unknown creatives
  studio"). Exact §12 transposition; stated dependencies are blocking
  relations. KK↔UCS: 01→903 02→904 03→905 04→907 05→908 06→909 07→910 08→911
  09→912 10→913 11→914 12→917 13→915 14→920 15→921 16→922 17→923 18→924
  19→925 20→926 21→927 22→928 23→929 24→930 25→916 26→918 27→919 28→906.

## Every iteration

1. **Sync:** `git fetch origin`; `gh pr list`; Linear issue states. Reason
   against `origin/main`, never a stale local ref.
2. **Frontier:** shepherd open PRs to merge first (fix red CI, address
   review), then start unblocked issues — one issue per subagent, in the
   subagent's **own git worktree** (the main checkout is shared; verify
   `git branch --show-current` before any orchestrator commit).
3. **Linear:** orchestrator owns all updates (In Progress on start; Done only
   after verified done-criteria). Subagents never touch Linear.

## Per issue (vertical slice)

- TDD (the /tdd skill) with a concise plan-of-action listing the tests that
  prove the issue. Fixture apps (KK-14/15) are the primary test bed.
- **Verify, don't assert:** before Done, run the relevant engine commands
  against the fixtures and confirm the PRD done-criteria output.
- Honest seam: A5 protocol skills are walkthrough-tested via checklists,
  never faked as CI. The kit dogfoods itself from KK-03 onward — its own
  decisions store and validators stay green.
- Parallelize wherever dependencies allow: M1 engine core before M2
  extractors; M4 fixtures before M5 init CLI; M6 protocol last.

## PR gates

- 300–600 lines for human review (split fixture issues if needed; generated
  fixture files don't count). Branch names from Linear
  (`ucs-NNN-kk-NN-...`); PRs target `main` with `--base main`.
- CodeRabbit review (the /code-review skill) on every PR; merge **only** on
  approval + CI green. Squash-merge, delete branch.

## CI

Single workflow, path-filtered jobs (engine tests / extractor matrix /
init e2e / fixture acceptance) so a docs-only or protocol-only PR doesn't run
the full matrix; cache node_modules; whole suite in single-digit minutes —
the engine is zero-build and the fixtures are deliberately small.

## Conventions (established at KK-01 — follow, don't reinvent)

Plain ES-module `.js` run directly by `node` (no TS build, D-002);
`node:test` + `node:assert`; `js-yaml` the near-only runtime dep;
package.json name `unknown-knowledge`, private until KK-28 publishes
(2FA + provenance per D-018).
