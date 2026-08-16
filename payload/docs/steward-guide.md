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

## Phoenix events — re-filing a drifted subtree

Sometimes the material is fine and the shelf is wrong: one class holds two kinds
of thing that no longer share a reader, or a name stopped meaning what it says.
A phoenix event fixes that in bulk, under review, without breaking a single
citation.

It is a PR like any other, carrying four things: the Decisions entry that
sanctions it (copy `templates/decisions/phoenix-event.yaml`), the registry
mintings the new values need, the mapping at `knowledge/_phoenix/<event>.yaml`,
and the leaf rewrites — which you never make by hand:

```
node unknown-knowledge/engine/phoenix.js P-001 --root .            # dry run: plan it, write nothing
node unknown-knowledge/engine/phoenix.js P-001 --root . --apply    # write, only if the plan is clean
```

What to check when you review one:

- **The mapping is complete.** Every leaf in the declared scope must be mapped,
  split, or explicitly carried forward. The engine refuses the event and names
  the leaf otherwise — it will not half-apply, so a rejected event leaves the
  store exactly as it found it.
- **Each row's `why` earns its move.** On a split this is the whole substance:
  the class-level rule cannot say why L-000117 went to ingest and its neighbour
  went to settlement, so the rows have to.
- **The diff is two lines per leaf.** `edition` and the one facet. If a leaf's
  citations, body, or `id` appear in the diff, something is wrong — the engine
  rewrites single frontmatter lines and copies every other byte through.
- **The mapping stays.** Do not delete it after the event lands. It is what lets
  the validator confirm every edition above 1 was sanctioned, reading only the
  working tree. A leaf's edition must equal `1 + the events that moved it`, and
  `validate.js` reports `unaccounted-edition` when it does not.

Identity never moves. Accession ids are untouched, so every citation into the
subtree — decisions entries, catalog rows, leaf cross-references — stays valid
across the event. If a proposal needs an id renamed or reissued, it is not a
phoenix event.

## Findings are lossy, by design

Keep the corroboration math honest by knowing what the log is not:

- **Capture strips context deliberately.** Summaries carry concept IDs and
  file paths only — never verbatim user text (see `docs/boundaries.md`).
  The SSOT is the artifact the finding points at, never the finding's
  prose: to judge a cluster, follow the pointers and read the source.
- **Findings travel only with merged PRs.** Abandoned branches lose theirs.
  Corroboration tolerates a lossy denominator — treat finding counts as
  signal, never as census.

## Trust graduation — narrowing inspection, and un-narrowing it

Autonomy is graduated per change-category, never global, never per leaf, and
never assumed (the gate rules in `protocol/AGENTS.md`). The category is the
unit because it is the only thing evidence can be about: "this leaf has been
right ten times" says nothing about the eleventh leaf, which is a different
claim by a different author, whereas "alias additions have been approved
unmodified ten cycles running" is evidence about a class of edit.

The observable basis is what reflect already records: **per-item approval
outcomes by category** (approved / approved-with-modification / rejected).

### The category table

`decisions/_registries/graduation-categories.yaml` declares every change
category and its eligibility. It is filed under `decisions/` because
graduation governs the change *process* — the team's truth anchor (D-003) —
not the knowledge itself. Two shapes:

- **`eligible`**, with a threshold **N**: mechanical categories, where the
  edit is checkable by reading it and a clean run is evidence about the next
  one. Alias additions, verified bumps, `paths` edges, see-also links.
- **`gated`**, permanently: judgment categories. New domain classes,
  contradicts/supersedes edges, authority assignments, and **anything
  citation-bearing**. These never graduate, however long the streak — the
  streak answers a different question than the one they ask. A correct
  authority assignment ten times over says the assigner has been careful, not
  that the eleventh source's trustworthiness can go unread.

Every row carries a warrant and cites a Decisions entry, like any registry
value. A malformed table is a hard error (exit 2), not a finding: graduation
checks judged against a table the engine could not read are checks that never
ran.

### v1 analytics are MANUAL — the engine does not compute the counts

State this plainly to anyone reading a green validator: **the engine does not
compute approved-unmodified counts and never decides whether a threshold was
met.** It checks that the entry is well-formed, that its category is declared,
and that the category is not gated. *You* count the cycles and judge them
against N. The `observed-cycles` field is your written record of that count,
kept so a reviewer can weigh the judgment — no code asserts it. A clean
validation run is not agreement that a graduation was earned.

### Recording one

Copy `templates/decisions/trust-graduation.yaml`, and record the graduation as
a `decisions/` entry of category `trust`. The entry carries a typed
`graduation:` block naming the category and your observed count.

```
node unknown-knowledge/engine/validate.js --root .
```

### Revocation is automatic on ANY defect

**Any defect found in a graduated category revokes it.** Not "a serious
defect", not "a pattern of defects" — one is enough, and the response is
mechanical so it cannot be argued down. The warrant for sampling a category
was that it had stopped producing surprises; one surprise is the evidence that
it has not. Record it with `templates/decisions/trust-revocation.yaml`; the
category returns to full inspection and its streak restarts at zero.

Revoking is deliberately the cheapest entry in the store to write. Narrowing
inspection takes a counted streak and a written rationale; restoring it takes
noticing one defect. If revoking were as laborious as graduating, the
laborious thing would quietly not get done and the boundary would only ever
move one way. Revoking is always allowed — including for a gated category,
where it is a no-op that records the standing position. Only *graduating* a
gated category is refused.

### Citation spot-checks stay in the sampling plan at every trust level

Whatever a category has earned, **citation spot-checks continue at every trust
level**, including the most graduated. A citation is a claim about the world
that the store cannot check for itself; no streak of clean mechanical edits is
evidence that the citations are sound. Graduation only ever answers the
mechanical question.

### Provenance — tracing a bad skill revision

Entries carry `provenance` (`author`, `skill-version`), and the validator
surfaces it in both JSON and human output. When a defect turns out to come
from a bad skill vintage rather than a bad judgment, this is what makes every
entry that vintage wrote findable rather than guessed at — a bad skill
revision is traceable like any other defect.
