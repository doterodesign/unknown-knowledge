# A5 walkthrough — /kb-build promotes one cited leaf on fixtures/ts-app

Acceptance criterion A5 (PRD §10): *an agent following only
`payload/protocol/skills/kb-build.md` produces a kb-build cited leaf on a
fixture correctly.* This is the scripted checklist for a human to run with
a fresh agent — documented acceptance runs are the honest seam: skills are
prompts, so their test is a checklist, not CI. Time the run (A5
walkthroughs are wall-clock timed).

Every expected observation below was produced by actually running the
commands (kit @ this branch, 2026-07-09); outputs are pasted byte-honest.
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

## 1. CLASSIFY — one target notation

The agent enters through the catalog (`100.1` is the only leaf), reads the
spine in `knowledge/_rules.yaml`, and probes for existing coverage:

```sh
node "$KIT/engine/resolve.js" "withdrawal" --root .
```

- [ ] Exit 0:

```
resolve "withdrawal" -> 1 concept

K-104  Withdrawal method  [active]  score 60 (term-match)
  summary: Payout rails. DRIFT — source also has 'crypto', unclaimed here.
  source-of-truth:
    src/types/withdrawal.ts
```

- [ ] No knowledge entry point covers settlement windows (leaf `100.1` is
  sportsbook onboarding) → new leaf, not a revision. The spine names the
  home: domain `product`, division `payments`. The agent mints the next
  free notation from the catalog register — `"110.1"`.
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
  --entry '{"summary":"kb-build item not promotable: withdrawal-speed claim lacks any citation; nearest leaf 100.1, concept K-104","consulted":{"concepts":["K-104"],"leaves":["100.1"]}}'
```

- [ ] Exit 0; the helper prints the minted fragment (hex suffix varies):

```
{
  "file": "logs/gaps/2026-07-09-86b15fd1.yaml",
  "status": "open",
  "entry": {
    "schema-version": 1,
    "date": "2026-07-09",
    "status": "open",
    "summary": "kb-build item not promotable: withdrawal-speed claim lacks any citation; nearest leaf 100.1, concept K-104",
    "consulted": {
      "concepts": [
        "K-104"
      ],
      "leaves": [
        "100.1"
      ]
    }
  }
}
```

- [ ] The summary carries IDs, notations, and paths only — the user's
  verbatim wording ("pretty sure that's true") appears nowhere (§3.4).

## 3. DRAFT — §3.2 governance frontmatter + body

The agent writes
`unknown-knowledge/knowledge/product/110.1-ach-withdrawal-settlement-windows.md`:

```markdown
---
schema-version: 1
notation: "110.1"
domain: product
division: payments
heading: ACH withdrawal settlement windows
description: When an ACH withdrawal actually leaves and lands.
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
  see-also: ["100.1"]
  including: [same-day ACH eligibility, holiday calendars]
citations:
  - source: "Nacha Operating Rules & Guidelines, 2025 ed., Subsection 3.1 (ACH settlement schedule)"
    accessed: "2026-07-09"
terms: [ACH, withdrawal, settlement window, payout]
edition: 1
contributors: [walkthrough-agent]
---

ACH withdrawals batch at the processor's daily cutoff and settle on the
next banking day; same-day ACH applies only below the per-entry cap. The
user-facing promise in the withdrawal flow must quote banking days, not
calendar days (citation: Nacha rules, above).
```

- [ ] Notation quoted; `scope` + `revision` (dated) notes present;
  `class-here` records the contestable call from step 1; the parked VIP
  claim is NOT in the body; every citation from step 2 is in the
  frontmatter.
- [ ] Cross-reference honesty: `see-also: ["100.1"]` resolves; the two
  `including` topics are standing room, not authoritative. If the agent
  had cited a non-existent notation, step 5 would stop it — see the
  negative probe below.

## 4. INDEX — the catalog row

The agent appends to `unknown-knowledge/knowledge/_catalog.yaml`:

```yaml
  - id: "110.1"
    title: ACH withdrawal settlement windows
    file: product/110.1-ach-withdrawal-settlement-windows.md
```

## 5. VALIDATE — green, then the human gate

Negative probes first (the human may plant either to watch the gate work).
A leaf whose `see-also` names a notation that resolves nowhere — exit 2,
the check never ran:

```
validate: the store loader reported 1 error(s) — structural checks never ran (a check that never ran is a blocking defect, PRD §5)
  unresolved-ref  knowledge/product/110.1-ach-withdrawal-settlement-windows.md  cross-references.see-also[1]  cross-references.see-also ref "999.9" does not resolve to any knowledge entry or catalog-declared id
```

A leaf file present but its catalog row missing — exit 1, `orphan`:

```
structural validate -> 1 finding(s) (1 error(s), 0 warning(s))
checks run: id-range, id-shape, index-drift, missing-citation, missing-path, orphan, ref-cycle

error  orphan  110.1  knowledge/product/110.1-ach-withdrawal-settlement-windows.md  notation
    "110.1" is not declared in knowledge/_catalog.yaml — unreachable through the store's navigational entry point (§3)

fix every error-severity finding before merging — this validator is blocking-grade (PRD §4)
```

With the real draft and row in place:

```sh
node "$KIT/engine/validate.js" --root .
```

- [ ] Exit 0:

```
structural validate -> 0 findings — structurally clean
checks run: id-range, id-shape, index-drift, missing-citation, missing-path, orphan, ref-cycle
```

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
