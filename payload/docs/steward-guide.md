# Steward guide — owning the loop

> Commands run from the **repo root** with the kit dir at its default name
> `unknown-knowledge/`; substitute your chosen name if it differs.
> Procedures live in the skills and in `protocol/AGENTS.md` — this guide
> tells you what the steward decides and points at where each procedure is
> defined; it never restates one.

## The role

A small group or rotation owns the improvement loop; the ordinary engineer
invokes nothing — the protocol rides along in their sessions. The steward:

- runs `/knowledge-reflect` on cadence — weekly, daily at high finding
  volume (procedure: `protocol/skills/knowledge-reflect.md`);
- triages the reverse audit's drafted concepts — audit output is advisory
  (never blocking), so every draft waits for your judgment;
- gates `/kb-build` promotions — the knowledge store's only write path is
  cited and human-gated (`protocol/skills/kb-build.md`);
- accepts decision entries (final `D-NNN` assignment, below).

The heartbeat is `/knowledge-audit` (`protocol/skills/knowledge-audit.md`):
days-since-last-reflect, open-fragment counts, top quarantined concepts — a
lapsed rotation is visible instead of silent. The engine side of triage is
one command; `--today` is passed explicitly because diffable output never
reads the wall clock:

```
node unknown-knowledge/engine/audit.js --root . --json --today 2026-07-09 --stale-days 90
```

## Reflect lands as a PR

Reflect emits a recommendation list — each item a concrete diff with its
corroborating findings attached; you approve or reject **per item**, and
approved diffs land as a normal PR. That is the design, not a convenience:
even the improvement loop's own changes pass the review and CI your org
already trusts, and rejections leave a recorded reason instead of a
disappeared suggestion.

## CODEOWNERS — scope the human gate

Gate the stores, the protocol, and the engine; leave the logs alone:

```
# CODEOWNERS — steward review scoped to the governed surfaces.
/unknown-knowledge/ontology/   @your-org/knowledge-stewards
/unknown-knowledge/knowledge/  @your-org/knowledge-stewards
/unknown-knowledge/decisions/  @your-org/knowledge-stewards
/unknown-knowledge/protocol/   @your-org/knowledge-stewards
/unknown-knowledge/engine/     @your-org/knowledge-stewards
# logs/ is deliberately absent: findings ride nearly every agent-assisted
# PR. Requiring steward review there drowns the rotation in rubber-stamping
# — or teaches engineers to delete fragments to unblock merges, and capture
# dies. Logs must never require steward review.
```

## Suppressions hygiene

`unknown-knowledge/suppressions.yaml` silences known-noise audit findings.
Each entry is **strictly** `{ term, sourcePath, reason, date }`, exact match
only — no patterns, no expiry (D-013). Two properties to lean on:

- **Fails open.** A malformed entry (or an unparseable file) warns and
  suppresses nothing, so the findings it would have hidden resurface — a
  suppression can hide less than you meant, never more.
- **Exact match is self-expiring.** A suppression stops matching the moment
  the file moves or the term changes; that is a feature, not fragility.

The JSON report carries the full suppressed list — sweep it on reflect
cadence and prune entries whose `reason` no longer holds.

## ID collision — two branches mint the same K-id

Published IDs are immutable — never renumbered (PRD §3.5). When two
branches both mint `K-210`, the merge is textually clean and the duplicate
surfaces on main; the **later-merging PR renumbers its own entry**, never
the one already published:

1. Rebase onto main and run the structural validator — it reports the
   `duplicate-id` finding:

   ```
   node unknown-knowledge/engine/validate.js --root .
   ```

2. Re-mint your entry at a free id within the owning class's range (mint
   with gaps, per the store's `_rules.yaml`).
3. Update your branch's own inbound refs to the new id — `used-by`,
   `relates-to`, and any `consulted:` refs in findings your branch appended.
4. Re-run both validators; green means the renumber is complete.

## Decisions authoring

The write path is the "Decisions-authoring path" in `protocol/AGENTS.md`:
anyone — agent or human — drafts a `proposed` entry with a provisional
date-suffixed id through the normal PR gate. Your half is acceptance: assign
the final `D-NNN` within range, and hold the append-mostly line — status
transitions never rewrite `context`/`decision`, and supersession chains must
resolve and stay acyclic.

## Findings are lossy, by design

Keep the corroboration math honest by knowing what the log is not:

- **Capture strips context deliberately.** Summaries carry concept IDs and
  file paths only — never verbatim user text (see `docs/boundaries.md`).
  The SSOT is the artifact the finding points at, never the finding's
  prose: to judge a cluster, follow the pointers and read the source.
- **Findings travel only with merged PRs.** Abandoned branches lose theirs.
  Corroboration tolerates a lossy denominator — treat finding counts as
  signal, never as census.

## Trust graduation — what reflect measures

Autonomy is graduated per change-category, never global, and never assumed
(the gate rules in `protocol/AGENTS.md`). The observable basis is what
reflect already records: **per-item approval outcomes by category**
(approved / approved-with-modification / rejected). When a category — say,
alias additions — runs N consecutive approved-without-modification cycles,
graduating it is a decision you record as a `decisions/` entry of category
`trust`; others ("SSOT repoints") stay gated forever. The current kit ships
the schema and this documented path; no mutation is autonomous until a
recorded decision says so.
