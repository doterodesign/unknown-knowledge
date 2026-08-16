# A5 walkthrough — /kb-build promotes one cited leaf on fixtures/ts-app

Acceptance criterion A5 (PRD §10): *an agent following only
`payload/protocol/skills/kb-build.md` produces a kb-build cited leaf on a
fixture correctly.* This is the scripted checklist for a human to run with
a fresh agent — documented acceptance runs are the honest seam: skills are
prompts, so their test is a checklist, not CI. Time the run (A5
walkthroughs are wall-clock timed).

This walkthrough mirrors the skill step-for-step: the same five steps in the
same order (CLASSIFY → CITE → FACET → DRAFT → VALIDATE), and at each step
the same engine command the skill names. Where the skill delegates, this
checklist watches the delegation happen — the point of the run is that the
agent's discretion never exceeded the three judgment fills.

Every expected observation below was produced by actually running the
commands (kit @ this branch, re-captured 2026-08-16 against the UCS-1159
fixture); outputs are pasted byte-honest.
Only the random hex suffix in fragment file names varies run to run.

## Setup (the human, not the agent)

From the kit repo root:

```sh
export KIT="$PWD/payload"            # engine lives here in the KIT repo;
                                     # in a client repo it is <kit-dir>/engine
rm -rf /tmp/a5-kbb && cp -R fixtures/ts-app /tmp/a5-kbb && cd /tmp/a5-kbb
# Seed the domain spine the bootstrap interview would have written —
# kb-build classifies against it (the fixture ships rules: []).
cat > unknown-knowledge/knowledge/_rules.yaml <<'EOF'
# Acceptance-fixture store (KK-15); spine seeded as the bootstrap
# interview would have written it — kb-build classifies against it.
schema-version: 1
store: knowledge
rules:
  - rule: write-gate
    text: Human-only; the kb-build skill is the sole write path. Leaves require citations.
  - rule: domains
    domains:
      - domain: product
        divisions: [sportsbook, payments]
EOF
# Mint the governed facet values this item will need. A registry value is a
# registry edit plus a Decisions entry, never the drafting agent's to invent
# (step 3) — so the human mints them here, standing in for that review.
cat >> unknown-knowledge/knowledge/_registries/domains.yaml <<'EOF'
  - value: product/payments
    gloss: The payments/payout surface — deposits, withdrawals, settlement.
    warrant: The incoming ACH settlement item needs a home; the spine names payments.
    decision: D-101
    minted: "2026-07-09"
EOF
cat >> unknown-knowledge/knowledge/_registries/form.yaml <<'EOF'
  - value: reference
    gloss: A statement of how something is, rather than steps to do it.
    warrant: The ACH settlement item states a rule, it is not a procedure.
    decision: D-101
    minted: "2026-07-09"
EOF
cat >> unknown-knowledge/knowledge/_registries/operations.yaml <<'EOF'
  - value: process-withdrawal
    gloss: Move a customer payout through the withdrawal rails.
    warrant: The ACH settlement item is what a reader consults to do exactly this.
    decision: D-101
    minted: "2026-07-09"
EOF
cat >> unknown-knowledge/knowledge/_registries/authority-tiers.yaml <<'EOF'
  - value: regulator
    gloss: A rule-making body whose text is binding.
    warrant: The ACH settlement item cites the Nacha Operating Rules.
    decision: D-101
    minted: "2026-07-09"
EOF
git init -q . && git add -A
```

Give the agent `payload/protocol/skills/kb-build.md` (plus
`payload/protocol/AGENTS.md`, which it operates under) and this incoming
item, exactly:

> Document our ACH withdrawal settlement windows: ACH withdrawals batch at
> the processor's daily cutoff and settle the next banking day (Nacha
> Operating Rules & Guidelines, 2025 ed., Subsection 3.1). Also note that
> VIP withdrawals are instant — pretty sure that's true, no source though.

Where the skill writes `node unknown-knowledge/engine/<cli>.js`, the
fixture has no vendored engine, so commands here substitute
`node $KIT/engine/<cli>.js` — same CLIs, same flags. Check each box when
the observation matches.

## 1. CLASSIFY — one subject home

The skill delegates this step to `resolve.js`. The agent enters through the
catalog (two leaves, `L-000100` and `L-000200`, both sportsbook), reads the
spine in `knowledge/_rules.yaml`, and asks the engine what already exists:

```sh
node "$KIT/engine/resolve.js" "withdrawal" --root .
```

- [ ] Exit 0:

```
resolve "withdrawal" -> 1 concept

time check: skipped — pass --today YYYY-MM-DD to enable; diffable output never reads the wall clock (D-012)

decomposition:
  noun  -> concepts: K-104 "Withdrawal method" (term-match)
  residue (unresolved): withdrawal  [resolved context: K-104]
  near-miss: operation process-withdrawal — token overlap [withdrawal] below the match threshold

K-104  Withdrawal method  [active]  score 60 (term-match)
  summary: Payout rails. DRIFT — source also has 'crypto', unclaimed here.
  source-of-truth:
    src/types/withdrawal.ts
```

- [ ] The agent reads the engine's answer rather than reproducing one: the
  `decomposition` names what joined, and the `residue` line is the store
  reporting where its own vocabulary ran out.
- [ ] **Judgment fill — candidate confirmation**: the agent opens the leaves
  `resolve` named before deciding placement. `L-000100` is sportsbook
  onboarding, `L-000200` is bet cash-out — both `product/sportsbook`, so
  neither covers settlement windows → new leaf, not a revision. The spine
  names the subject home: `facets.domain` `product/payments`. This read is
  the judgment; no command performs it.
- [ ] The agent mints a fresh accession for the new leaf — `L-000110`.
  Nothing is looked up to find "the next free" anything: an accession is
  opaque and drawn from a sequence, so it says nothing about where the leaf
  sits and two authors classifying into one domain never contend for a
  number.
- [ ] Negative check: the agent does NOT invent a new domain — a spine
  change is the human's call, asked, never silently written.

## 2. CITE — the promotion gate

Two claims in the item:

- [ ] **Judgment fill — candidate confirmation**: the settlement-window
  claim carries a citation the agent followed (Nacha rules, `accessed`
  dated) → promotable. Confirming the source supports the claim *as written*
  is a read, not a lookup.
- [ ] The "VIP withdrawals are instant" claim has no source — **an
  unsourced claim is not promotable**: it is parked as a gap-log entry,
  never written into the leaf. The skill delegates the write to
  `log-entry.js`, the only write path into `logs/` (note `--root` is the KIT
  DIR here):

```sh
node "$KIT/engine/log-entry.js" create --log gaps --date 2026-07-09 \
  --root unknown-knowledge \
  --entry '{"summary":"kb-build item not promotable: withdrawal-speed claim lacks any citation; nearest leaf L-000100, concept K-104","consulted":{"concepts":["K-104"],"leaves":["L-000100"]}}'
```

- [ ] Exit 0; the helper prints the minted fragment (hex suffix varies):

```
{
  "file": "logs/gaps/2026-07-09-80864041.yaml",
  "status": "open",
  "entry": {
    "schema-version": 1,
    "date": "2026-07-09",
    "status": "open",
    "summary": "kb-build item not promotable: withdrawal-speed claim lacks any citation; nearest leaf L-000100, concept K-104",
    "consulted": {
      "concepts": [
        "K-104"
      ],
      "leaves": [
        "L-000100"
      ]
    }
  }
}
```

- [ ] `consulted.leaves` cites the nearest leaf by its accession id — the
  only spelling that resolves — and the summary names that same id, so a
  reader can look up what the entry consulted.
- [ ] The summary carries IDs and paths only — the user's verbatim wording
  ("pretty sure that's true") appears nowhere (§3.4).

## 3. FACET — fill the governed facets from the registries

The agent reads each registry file and takes the value from it. Every value
below was minted in Setup, standing in for the human review a real minting
requires:

```sh
grep -A1 '^  - value:' unknown-knowledge/knowledge/_registries/form.yaml | tail -4
```

- [ ] The four facets are filled from their registries — `domain`
  (`product/payments`, `_registries/domains.yaml`), `form` (`reference`,
  `_registries/form.yaml`), `anchor` (`world`, `_registries/anchor.yaml`),
  `stage` (`draft`, `_registries/stage.yaml`) — plus `operations`
  (`process-withdrawal`) and the citation's `authority` tier (`regulator`).
- [ ] `applies.jurisdictions` is left EMPTY, and the agent says why: empty
  means universal, which is a claim, and ACH settlement timing is a US rail
  rule the fixture's spine has no jurisdiction value for. Leaving it empty
  is a decision recorded, not a field skipped.
- [ ] Negative check: the agent does NOT invent a facet value. The gate is
  mechanical, not a matter of restraint — plant an unminted `facets.form`
  (say `settlement-note`) and step 5 refuses it by name:

```
error  unregistered-value  L-000110  knowledge/L-00/L-000110-ach-withdrawal-settlement-windows.md  facets.form
    value "settlement-note" is not minted in the "knowledge/form" registry (knowledge/_registries/form.yaml) — governed facets draw only from their registry; minting a new value is a registry edit plus a Decisions entry, never an ad-hoc string
```

- [ ] **Judgment fill — mint proposals with warrant evidence**: had no
  minted value fit, the agent's move is to PROPOSE a minting carrying its
  literary warrant (the material that already exists for the value to hold),
  drafted from `templates/decisions/registry-minting.yaml` — and to pause
  for the human. It never edits a registry itself.

## 4. DRAFT — §3.2 governance frontmatter + body

The agent writes
`unknown-knowledge/knowledge/L-00/L-000110-ach-withdrawal-settlement-windows.md`
— the accession-prefix shard (`L-` plus the first two digits of `000110`),
a fanout device that carries no meaning about the subject:

```markdown
---
schema-version: 2
id: L-000110
domain: product
division: payments
heading: ACH withdrawal settlement windows
facets:
  domain: product/payments
  form: reference
  anchor: world
  stage: draft
operations: [process-withdrawal]
applies:
  jurisdictions: []
notes:
  - type: scope
    text: Covers ACH rails only; card and crypto rails are separate items.
  - type: class-here
    text: Settlement timing classes with the payout product surface, not
      with sportsbook settlement (bet grading) — confirm before filing
      grading material here.
  - type: revision
    date: "2026-07-09"
    text: Initial entry.
cross-references:
  class-elsewhere: []
  see-also: [L-000100]
  including: [same-day ACH eligibility, holiday calendars]
citations:
  - source: "Nacha Operating Rules & Guidelines, 2025 ed., Subsection 3.1 (ACH settlement schedule)"
    accessed: "2026-07-09"
    authority: regulator
terms: [ACH, withdrawal, settlement window, payout]
edition: 1
contributors: [walkthrough-agent]
provenance:
  author: walkthrough-agent
  skill-version: kb-build@2.0.0
---

ACH withdrawals batch at the processor's daily cutoff and settle on the
next banking day; same-day ACH applies only below the per-entry cap. The
user-facing promise in the withdrawal flow must quote banking days, not
calendar days (citation: Nacha rules, above).
```

- [ ] `id: L-000110` is present — it is REQUIRED, and it is the leaf's
  identity: what the loader indexes by, and the only spelling anything may
  cite this leaf as. Because it says nothing about where the leaf sits,
  moving the file out of `L-00/` later breaks no citation.
- [ ] `facets.stage` is `draft` — the entry enters at draft stage, which is
  where the moderation pipeline picks it up. The agent does not promote its
  own work.
- [ ] **Judgment fill — prose body**: the body is written, not generated,
  and each claim reads back to a listed citation. Note the opening line:
  there is no `description` field (retired in v2), so that first sentence is
  what any surface showing a one-liner will derive and display. It is
  written to read well out of context for that reason.
- [ ] `scope` + `revision` (dated) notes present; `class-here` records the
  contestable call from step 1; the parked VIP claim is NOT in the body;
  every citation from step 2 is in the frontmatter with a tier.
- [ ] Cross-reference honesty: `see-also: [L-000100]` cites the target's
  accession and resolves; the two `including` topics are standing room,
  not authoritative.

Then the catalog row, appended to `unknown-knowledge/knowledge/_catalog.yaml`:

```yaml
  - id: L-000110
    title: ACH withdrawal settlement windows
    file: L-00/L-000110-ach-withdrawal-settlement-windows.md
```

- [ ] The row's `id` is the same accession the leaf's `id` field carries —
  the only legal spelling. The agent does NOT audit the row against the file
  by eye: `validate.js`'s `orphan` and `index-drift` checks do that, and the
  next step is where they run.

## 5. VALIDATE — green, then the human gate

Negative probes first (the human may plant any of these to watch the gate
work). All run the same command the skill names:

```sh
node "$KIT/engine/validate.js" --root .
```

The leaf file present but its catalog row missing — exit 1, `orphan`, keyed
by the accession. The two trailing `unregistered-value` findings on
`L-000100` are the fixture's own UCS-1159 planted cases 2 and 4 (an unminted
`facets.form` and an unminted `applies.jurisdictions` value); they ride
along in every structural run on this fixture and are not what this probe is
testing:

```
structural validate -> 3 finding(s) (3 error(s), 0 warning(s))
checks run: disconnected-revocation, gated-category-graduation, graduation-field-shape, graduation-not-trust-category, id-range, id-shape, index-drift, malformed-verified, missing-authority, missing-citation, missing-graduation-table, missing-path, missing-registry, missing-verified, orphan, ref-cycle, registry-shape-mismatch, suppressed-value, unaccounted-edition, undeclared-category, unminted-segment, unregistered-value

error  orphan  L-000110  knowledge/L-00/L-000110-ach-withdrawal-settlement-windows.md  id
    "L-000110" is not declared in knowledge/_catalog.yaml — unreachable through the store's navigational entry point (§3)
error  unregistered-value  L-000100  knowledge/product/100.1-adding-a-new-sport.md  applies.jurisdictions[0]
    value "uk-gc" is not minted in the "knowledge/jurisdictions" registry (knowledge/_registries/jurisdictions.yaml) — governed facets draw only from their registry; minting a new value is a registry edit plus a Decisions entry, never an ad-hoc string
error  unregistered-value  L-000100  knowledge/product/100.1-adding-a-new-sport.md  facets.form
    value "walkthrough" is not minted in the "knowledge/form" registry (knowledge/_registries/form.yaml) — governed facets draw only from their registry; minting a new value is a registry edit plus a Decisions entry, never an ad-hoc string

fix every error-severity finding before merging — this validator is blocking-grade (PRD §4)
```

With the real draft and row in place:

```sh
node "$KIT/engine/validate.js" --root .
```

- [ ] Exit 1 — and every finding that named `L-000110` is gone. What
  remains is the fixture's own baseline: the two `unregistered-value`
  findings on `L-000100` are UCS-1159 planted cases 2 and 4 and are
  expected here. The new leaf is clean; nothing below names it:

```
structural validate -> 2 finding(s) (2 error(s), 0 warning(s))
checks run: disconnected-revocation, gated-category-graduation, graduation-field-shape, graduation-not-trust-category, id-range, id-shape, index-drift, malformed-verified, missing-authority, missing-citation, missing-graduation-table, missing-path, missing-registry, missing-verified, orphan, ref-cycle, registry-shape-mismatch, suppressed-value, unaccounted-edition, undeclared-category, unminted-segment, unregistered-value

error  unregistered-value  L-000100  knowledge/product/100.1-adding-a-new-sport.md  applies.jurisdictions[0]
    value "uk-gc" is not minted in the "knowledge/jurisdictions" registry (knowledge/_registries/jurisdictions.yaml) — governed facets draw only from their registry; minting a new value is a registry edit plus a Decisions entry, never an ad-hoc string
error  unregistered-value  L-000100  knowledge/product/100.1-adding-a-new-sport.md  facets.form
    value "walkthrough" is not minted in the "knowledge/form" registry (knowledge/_registries/form.yaml) — governed facets draw only from their registry; minting a new value is a registry edit plus a Decisions entry, never an ad-hoc string

fix every error-severity finding before merging — this validator is blocking-grade (PRD §4)
```

- [ ] Negative check: the agent does NOT "fix" those two planted findings
  to make its own run go green — they belong to a leaf it did not author,
  and minting a registry value is the human's call (step 3).
- [ ] The agent declares done only now, and hands off — the leaf, the
  catalog row, and the gap fragment ride one PR for the human gate
  (agents draft; humans approve). It does NOT self-merge or claim the
  leaf is "live".

## The hooks — the same gates, run mechanically

The two checks above are the ones the seeded hooks run, so a repo that
wired them enforces this step whether or not the agent remembered it. This
section runs them directly with `sh` to watch what they do; in a real repo
they are wired through `.git/hooks/` with **event-named** symlinks
(`pre-commit`, and `prepare-commit-msg` for the reverse lookup — git runs a
hook only if its filename names an event it fires). To watch that happen on
the fixture (which has no vendored engine, so link the kit's in first):

```sh
mkdir -p unknown-knowledge/hooks
cp "$KIT/hooks/pre-commit" "$KIT/hooks/reverse-lookup" unknown-knowledge/hooks/
chmod +x unknown-knowledge/hooks/*
ln -sf "$KIT/engine" unknown-knowledge/engine
sh unknown-knowledge/hooks/pre-commit
```

- [ ] The pre-commit hook prints the validator's output byte-for-byte and
  **exits 1** — the same code the direct run gave, propagated unchanged.
  There is no bypass variable to set: a hook with an off switch enforces
  nothing.

```
structural validate -> 2 finding(s) (2 error(s), 0 warning(s))
checks run: disconnected-revocation, gated-category-graduation, graduation-field-shape, graduation-not-trust-category, id-range, id-shape, index-drift, malformed-verified, missing-authority, missing-citation, missing-graduation-table, missing-path, missing-registry, missing-verified, orphan, ref-cycle, registry-shape-mismatch, suppressed-value, unaccounted-edition, undeclared-category, unminted-segment, unregistered-value

error  unregistered-value  L-000100  knowledge/product/100.1-adding-a-new-sport.md  applies.jurisdictions[0]
    value "uk-gc" is not minted in the "knowledge/jurisdictions" registry (knowledge/_registries/jurisdictions.yaml) — governed facets draw only from their registry; minting a new value is a registry edit plus a Decisions entry, never an ad-hoc string
error  unregistered-value  L-000100  knowledge/product/100.1-adding-a-new-sport.md  facets.form
    value "walkthrough" is not minted in the "knowledge/form" registry (knowledge/_registries/form.yaml) — governed facets draw only from their registry; minting a new value is a registry edit plus a Decisions entry, never an ad-hoc string

fix every error-severity finding before merging — this validator is blocking-grade (PRD §4)
```

Then the reverse lookup, over whatever is staged:

```sh
git add unknown-knowledge/knowledge/L-00/L-000110-ach-withdrawal-settlement-windows.md src/types/withdrawal.ts
sh unknown-knowledge/hooks/reverse-lookup
```

- [ ] Exit 0, and the hook reports what governs each staged path — the
  AGENTS.md ACT step, performed without being remembered:

```
resolve --paths -> 2 paths

time check: skipped — pass --today YYYY-MM-DD to enable; diffable output never reads the wall clock (D-012)

src/types/withdrawal.ts
  K-104  Withdrawal method  [active]  (pointer: src/types/withdrawal.ts)

unknown-knowledge/knowledge/L-00/L-000110-ach-withdrawal-settlement-windows.md
  no concepts point at this path

update every concept listed above in the same commit as the change (PRD §7 ACT)
```

- [ ] With nothing staged (`git reset`), the hook exits 0 without invoking
  the engine — an empty diff is not a failure, and `--paths` with an empty
  list would be a usage error (exit 2):

```sh
git reset -q && sh unknown-knowledge/hooks/reverse-lookup; echo "exit $?"
```

```
exit 0
```

- [ ] An empty diff and a FAILED read are different things, and only one of
  them is a clean result. Run the hook where git cannot answer (any
  directory outside a repository) and it exits **2** — the lookup never
  ran — rather than reading as "nothing to attribute":

```sh
# From a directory that is not a git repository. git prints its own usage
# to stderr first; the hook's own line is the last of it.
sh "$KIT/hooks/reverse-lookup" 2>/tmp/rl-err >/dev/null; echo "exit $?"
tail -1 /tmp/rl-err
```

```
exit 2
reverse-lookup: git diff failed — the staged paths could not be read, so the lookup never ran
```

- [ ] Negative check: neither hook computes a verdict, filters a finding, or
  reads a switch that would let it pass. Each invokes one engine command and
  exits with its code — which is why testing the command IS testing the hook.
  The one code either hook authors itself is that exit 2, for the one thing
  the engine cannot report: its own input never being read.

## Done

- [ ] All boxes checked; step order was CLASSIFY → CITE → FACET → DRAFT →
  VALIDATE, mirroring the skill; the uncited claim was parked, never
  promoted; every facet value came from a registry; the leaf entered at
  `draft`; no store file outside `knowledge/` and `logs/gaps/` was touched.
- [ ] The agent's free-form work was confined to the three judgment fills —
  the prose body, the candidate confirmations in steps 1 and 2, and (had one
  been needed) a mint proposal with its warrant. Every other step was an
  engine command's answer, taken as given.
- [ ] Record the wall-clock time: ______ (the "afternoon, not an
  engagement" datum, PRD §10).
