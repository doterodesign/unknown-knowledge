# A5 walkthrough — /kb-build promotes one cited leaf on fixtures/ts-app

Acceptance criterion A5 (PRD §10): *an agent following only
`payload/protocol/skills/kb-build.md` produces a kb-build cited leaf on a
fixture correctly.* This is the scripted checklist for a human to run with
a fresh agent — documented acceptance runs are the honest seam: skills are
prompts, so their test is a checklist, not CI. Time the run (A5
walkthroughs are wall-clock timed).

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
# Seed the domain/division spine the bootstrap interview would have
# written — kb-build classifies against it (the fixture ships rules: []).
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

The agent enters through the catalog (two leaves, `L-000100` and
`L-000200`, both sportsbook), reads
the spine in `knowledge/_rules.yaml`, and probes for existing coverage:

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

- [ ] No knowledge entry point covers settlement windows (`L-000100` is
  sportsbook onboarding, `L-000200` is bet cash-out — both
  `product/sportsbook`) → new leaf, not a revision. The spine names
  the subject home: `facets.domain` `product/payments`.
- [ ] The agent mints a fresh accession for the new leaf — `L-000110`.
  Nothing is looked up to find "the next free" anything in the tree: an
  accession is opaque and drawn from a sequence, so it says nothing about
  where the leaf sits and two authors classifying into one domain never
  contend for a number.
- [ ] Negative check: the agent does NOT invent a new domain or division —
  a spine change is the human's call, asked, never silently written.

## 2. CITE — the promotion gate

Two claims in the item:

- [ ] The settlement-window claim carries a citation (Nacha rules,
  `accessed` dated) → promotable.
- [ ] The "VIP withdrawals are instant" claim has no source — **an
  unsourced claim is not promotable**: it is parked as a gap-log entry,
  never written into the leaf (note `--root` is the KIT DIR here):

```sh
node "$KIT/engine/log-entry.js" create --log gaps --date 2026-07-09 \
  --root unknown-knowledge \
  --entry '{"summary":"kb-build item not promotable: withdrawal-speed claim lacks any citation; nearest leaf L-000100, concept K-104","consulted":{"concepts":["K-104"],"leaves":["L-000100"]}}'
```

- [ ] Exit 0; the helper prints the minted fragment (hex suffix varies):

```
{
  "file": "logs/gaps/2026-07-09-5dae1d4e.yaml",
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

## 3. DRAFT — §3.2 governance frontmatter + body

The agent writes
`unknown-knowledge/knowledge/L-00/L-000110-ach-withdrawal-settlement-windows.md`
— the accession-prefix shard (`L-` plus the first two digits of `000110`),
a fanout device that carries no meaning about the subject:

```markdown
---
schema-version: 2
id: L-000110
notation: "110.1"
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

Note the opening line: there is no `description` field (retired in v2), so
that first sentence is what any surface showing a one-liner will derive and
display. It is written to read well out of context for that reason.

- [ ] `id: L-000110` is present — it is REQUIRED, and it is the leaf's
  identity: what the loader indexes by, and the only spelling anything may
  cite this leaf as. Because it says nothing about where the leaf sits,
  moving the file out of `L-00/` later breaks no citation.
- [ ] `notation: "110.1"` is OPTIONAL and legacy — a quoted dotted display
  label recording where this material would have sat in an older tree,
  kept only so a reader who knows that tree recognizes the leaf. Nothing
  indexes by it and no citation resolves through it; a new leaf need not
  carry one at all. It is quoted because unquoted it parses as a number.
- [ ] `scope` + `revision` (dated) notes present; `class-here` records the
  contestable call from step 1; the parked VIP claim is NOT in the body;
  every citation from step 2 is in the frontmatter with a tier.
- [ ] Cross-reference honesty: `see-also: [L-000100]` cites the target's
  accession and resolves; the two `including` topics are standing room,
  not authoritative. If the agent had cited a notation, or an accession no
  leaf carries, step 5 would stop it — see the negative probes below.

## 4. INDEX — the catalog row

The agent appends to `unknown-knowledge/knowledge/_catalog.yaml`, keying
the row by the leaf's accession and pointing `file` at the shard path:

```yaml
  - id: L-000110
    title: ACH withdrawal settlement windows
    file: L-00/L-000110-ach-withdrawal-settlement-windows.md
```

- [ ] The row's `id` is the same accession the leaf's `id` field carries —
  the only legal spelling. Moving the leaf to another shard later is an
  edit to this `file` field and nothing else, because no citation names a
  directory.

## 5. VALIDATE — green, then the human gate

Negative probes first (the human may plant any of the three to watch the
gate work). All three run the same command:

```sh
node "$KIT/engine/validate.js" --root .
```

A leaf whose `see-also` cites a well-formed accession no leaf carries
(`L-000999`) — exit 2, the check never ran:

```
validate: the store loader reported 1 error(s) — structural checks never ran (a check that never ran is a blocking defect, PRD §5)
  unresolved-ref  knowledge/L-00/L-000110-ach-withdrawal-settlement-windows.md  cross-references.see-also[1]  cross-references.see-also ref "L-000999" does not resolve to any knowledge entry or catalog-declared id
```

A leaf whose `see-also` cites the OLD dotted notation `"100.1"` instead of
the target's accession — also exit 2, and the first finding names the
contract directly: the notation is a legacy display label and is refused
as a citation even though a leaf really does carry that label:

```
validate: the store loader reported 2 error(s) — structural checks never ran (a check that never ran is a blocking defect, PRD §5)
  pattern-mismatch  knowledge/L-00/L-000110-ach-withdrawal-settlement-windows.md  cross-references.see-also[0]  "100.1" is not a valid id here — expected the leaf's accession id (L-NNNNNN); the dotted notation is a legacy display label and no longer resolves as a citation
  unresolved-ref  knowledge/L-00/L-000110-ach-withdrawal-settlement-windows.md  cross-references.see-also[0]  cross-references.see-also ref "100.1" does not resolve to any knowledge entry or catalog-declared id
```

A leaf file present but its catalog row missing — exit 1, `orphan`, and
the finding is keyed by the accession, not by any notation. The two
trailing `unregistered-value` findings on `L-000100` are the fixture's own
UCS-1159 planted cases 2 and 4 (an unminted `facets.form` and an unminted
`applies.jurisdictions` value); they ride along in every structural run on
this fixture and are not what this probe is testing:

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

## Done

- [ ] All boxes checked; step order was CLASSIFY → CITE → DRAFT → INDEX →
  VALIDATE; the uncited claim was parked, never promoted; no store file
  outside `knowledge/` and `logs/gaps/` was touched.
- [ ] Record the wall-clock time: ______ (the "afternoon, not an
  engagement" datum, PRD §10).
