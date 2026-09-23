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
        divisions: [editor, engineering]
EOF
# Mint the governed facet values this item will need. A registry value is a
# registry edit plus a Decisions entry, never the drafting agent's to invent
# (step 3) — so the human mints them here, standing in for that review.
cat >> unknown-knowledge/knowledge/_registries/domains.yaml <<'EOF'
  - value: product/engineering
    gloss: The engineering surface — build, export, and rendering pipelines.
    warrant: The incoming SVG export item needs a home; the spine names engineering.
    decision: D-101
    minted: "2026-07-09"
EOF
cat >> unknown-knowledge/knowledge/_registries/form.yaml <<'EOF'
  - value: reference
    gloss: A statement of how something is, rather than steps to do it.
    warrant: The SVG export item states a rule, it is not a procedure.
    decision: D-101
    minted: "2026-07-09"
EOF
cat >> unknown-knowledge/knowledge/_registries/operations.yaml <<'EOF'
  - value: export-asset
    gloss: Render a design asset out to a file format.
    warrant: The SVG export item is what a reader consults to do exactly this.
    decision: D-101
    minted: "2026-07-09"
EOF
cat >> unknown-knowledge/knowledge/_registries/authority-tiers.yaml <<'EOF'
  - value: regulator
    gloss: A standards body whose text is binding.
    warrant: The SVG export item cites the W3C SVG 2 Recommendation.
    decision: D-101
    minted: "2026-07-09"
EOF
git init -q . && git add -A
```

Give the agent `payload/protocol/skills/kb-build.md` (plus
`payload/protocol/AGENTS.md`, which it operates under) and this incoming
item, exactly:

> Document our SVG asset export precision: SVG exports round coordinates to
> two decimal places at the viewBox scale (W3C SVG 2 Recommendation,
> §7.11). Also note that icon exports are always lossless — pretty sure
> that's true, no source though.

Where the skill writes `node unknown-knowledge/engine/<cli>.js`, the
fixture has no vendored engine, so commands here substitute
`node $KIT/engine/<cli>.js` — same CLIs, same flags. Check each box when
the observation matches.

## 1. CLASSIFY — one subject home

The skill delegates this step to `resolve.js`. The agent enters through the
catalog (two leaves, `L-000100` and `L-000200`, both editor), reads the
spine in `knowledge/_rules.yaml`, and asks the engine what already exists:

```sh
node "$KIT/engine/resolve.js" "asset" --root .
```

- [ ] Exit 0:

```
resolve "asset" -> 1 concept

time check: skipped — pass --today YYYY-MM-DD to enable; diffable output never reads the wall clock (D-012)

decomposition:
  noun  -> concepts: K-104 "Asset kind" (term-match)
  residue (unresolved): asset  [resolved context: K-104]
  near-miss: operation export-asset — token overlap [asset] below the match threshold

K-104  Asset kind  [active]  score 60 (term-match)
  summary: Library asset kinds. DRIFT — source also has 'video', unclaimed here.
  source-of-truth:
    src/types/asset-kind.ts
```

- [ ] The agent reads the engine's answer rather than reproducing one: the
  `decomposition` names what joined, and the `residue` line is the store
  reporting where its own vocabulary ran out.
- [ ] **Judgment fill — candidate confirmation**: the agent opens the leaves
  `resolve` named before deciding placement. `L-000100` is export-format
  onboarding, `L-000200` is release deprecation — both `product/editor`, so
  neither covers export precision → new leaf, not a revision. The spine
  names the subject home: `facets.domain` `product/engineering`. This read is
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

- [ ] **Judgment fill — candidate confirmation**: the SVG-export-precision
  claim carries a citation the agent followed (W3C SVG 2, `accessed`
  dated) → promotable. Confirming the source supports the claim *as written*
  is a read, not a lookup.
- [ ] The "icon exports are always lossless" claim has no source — **an
  unsourced claim is not promotable**: it is parked as a gap-log entry,
  never written into the leaf. The skill delegates the write to
  `log-entry.js`, the only write path into `logs/` (note `--root` is the KIT
  DIR here):

```sh
node "$KIT/engine/log-entry.js" create --log gaps --date 2026-07-09 \
  --root unknown-knowledge \
  --entry '{"summary":"kb-build item not promotable: icon-export-lossless claim lacks any citation; nearest leaf L-000100, concept K-104","consulted":{"concepts":["K-104"],"leaves":["L-000100"]}}'
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
    "summary": "kb-build item not promotable: icon-export-lossless claim lacks any citation; nearest leaf L-000100, concept K-104",
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
  (`product/engineering`, `_registries/domains.yaml`), `form` (`reference`,
  `_registries/form.yaml`), `anchor` (`world`, `_registries/anchor.yaml`),
  `stage` (`draft`, `_registries/stage.yaml`) — plus `operations`
  (`export-asset`) and the citation's `authority` tier (`regulator`).
- [ ] `applies.jurisdictions` is left EMPTY, and the agent says why: empty
  means universal, which is a claim, and SVG export precision is a rendering
  rule the fixture's spine has no jurisdiction value for. Leaving it empty
  is a decision recorded, not a field skipped.
- [ ] Negative check: the agent does NOT invent a facet value. The gate is
  mechanical, not a matter of restraint — plant an unminted `facets.form`
  (say `spec-sheet`) and step 5 refuses it by name:

```
error  unregistered-value  L-000110  knowledge/L-00/L-000110-svg-asset-export-precision.md  facets.form
    value "spec-sheet" is not minted in the "knowledge/form" registry (knowledge/_registries/form.yaml) — governed facets draw only from their registry; minting a new value is a registry edit plus a Decisions entry, never an ad-hoc string
```

- [ ] **Judgment fill — mint proposals with warrant evidence**: had no
  minted value fit, the agent's move is to PROPOSE a minting carrying its
  literary warrant (the material that already exists for the value to hold),
  drafted from `templates/decisions/registry-minting.yaml` — and to pause
  for the human. It never edits a registry itself.

## 4. DRAFT — §3.2 governance frontmatter + body

The agent writes
`unknown-knowledge/knowledge/L-00/L-000110-svg-asset-export-precision.md`
— the accession-prefix shard (`L-` plus the first two digits of `000110`),
a fanout device that carries no meaning about the subject:

```markdown
---
schema-version: 2
id: L-000110
domain: product
division: engineering
heading: SVG asset export precision
facets:
  domain: product/engineering
  form: reference
  anchor: world
  stage: draft
operations: [export-asset]
applies:
  jurisdictions: []
notes:
  - type: scope
    text: Covers SVG coordinate output only; PNG and PDF rasterization are separate items.
  - type: class-here
    text: Export precision classes with the engineering pipeline surface, not
      with editor authoring (grid snapping) — confirm before filing snapping
      material here.
  - type: revision
    date: "2026-07-09"
    text: Initial entry.
cross-references:
  class-elsewhere: []
  see-also: [L-000100]
  including: [decimal-precision overrides, viewBox scaling]
citations:
  - source: "W3C SVG 2 Recommendation, §7.11 (Coordinate precision and rounding)"
    accessed: "2026-07-09"
    authority: regulator
terms: [SVG, export, precision, viewBox]
edition: 1
contributors: [walkthrough-agent]
provenance:
  author: walkthrough-agent
  skill-version: kb-build@2.0.0
---

SVG exports round coordinates to two decimal places at the viewBox scale; the
rounding is applied once, at emit, so nested transforms do not compound it. The
user-facing export dialog must describe precision in viewBox units, not device
pixels (citation: W3C SVG 2, above).
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
  contestable call from step 1; the parked icon-export claim is NOT in the body;
  every citation from step 2 is in the frontmatter with a tier.
- [ ] Cross-reference honesty: `see-also: [L-000100]` cites the target's
  accession and resolves; the two `including` topics are standing room,
  not authoritative.

Then the catalog row, appended to `unknown-knowledge/knowledge/_catalog.yaml`:

```yaml
  - id: L-000110
    title: SVG asset export precision
    file: L-00/L-000110-svg-asset-export-precision.md
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

error  orphan  L-000110  knowledge/L-00/L-000110-svg-asset-export-precision.md  id
    "L-000110" is not declared in knowledge/_catalog.yaml — unreachable through the store's navigational entry point (§3)
error  unregistered-value  L-000100  knowledge/product/100.1-adding-a-new-export-format.md  applies.jurisdictions[0]
    value "eu-eaa" is not minted in the "knowledge/jurisdictions" registry (knowledge/_registries/jurisdictions.yaml) — governed facets draw only from their registry; minting a new value is a registry edit plus a Decisions entry, never an ad-hoc string
error  unregistered-value  L-000100  knowledge/product/100.1-adding-a-new-export-format.md  facets.form
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

error  unregistered-value  L-000100  knowledge/product/100.1-adding-a-new-export-format.md  applies.jurisdictions[0]
    value "eu-eaa" is not minted in the "knowledge/jurisdictions" registry (knowledge/_registries/jurisdictions.yaml) — governed facets draw only from their registry; minting a new value is a registry edit plus a Decisions entry, never an ad-hoc string
error  unregistered-value  L-000100  knowledge/product/100.1-adding-a-new-export-format.md  facets.form
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

## The hooks — installed commit verification

Use an isolated copy of this fixture for the commit checks. Copy the kit's
`engine/`, `schemas/`, `hooks/` and `package.json` into its `unknown-knowledge/`
directory. Keep the installed Node dependencies outside staged evidence and
ignore `/node_modules` if it is a symlink. An external engine symlink cannot
serve as candidate evidence; snapshot containment refuses escaping links.
Install both seeded hooks explicitly:

```sh
chmod +x unknown-knowledge/hooks/pre-commit unknown-knowledge/hooks/reverse-lookup
ln -s ../../unknown-knowledge/hooks/pre-commit .git/hooks/pre-commit
ln -s ../../unknown-knowledge/hooks/reverse-lookup .git/hooks/prepare-commit-msg
```

- [ ] Stage the intended source and store bytes, then attempt a real commit.
  `pre-commit` runs `engine/commit-check.js`: both whole-store validators print
  their findings and named statuses. Findings refuse the commit with engine
  exit 1; a failed check has engine exit 2. Git itself may normalize a failed
  hook's status. Capture stdout, stderr, HEAD and index before/after.
- [ ] Apply only the fixture's approved repairs, stage them, and commit through
  the installed hooks. Verify the committed source and store bytes agree.
- [ ] `prepare-commit-msg` invokes `engine/reverse-staged.js`. Its
  `staged attribution: candidate <tree-id>` section carries resolver JSON.
  Existing history adds a `before <tree-id>` section with the same path set.
  The initial commit has no invented before snapshot.
- [ ] In the isolated fixture, rename a governed source and repair its pointer
  in the same staged change. Commit and inspect both sections: the original
  name retains its before concept; the destination has candidate attribution.
  Repeat for a deletion with an approved replacement pointer. This historical
  navigation is not a current trust verdict or proof that every required store
  edit was made.
- [ ] Verify complete filenames with commas, whitespace, quotes and newlines
  survive through actual Git commits and resolver JSON without splitting or
  shell execution. `tests/reverse-staged.test.js` provides deterministic
  regression cases; a fresh-agent walkthrough still needs its own trace.
- [ ] With no staged changes, `sh unknown-knowledge/hooks/reverse-lookup` exits
  0 with no output. This also holds for an empty unborn index.
- [ ] A failed Git read, missing resolver or unsupported snapshot exits 2 from
  the engine/hook and refuses an attempted commit. A failed lookup must not be
  recorded as zero hits. Historical snapshot failures can refuse attribution
  even when both candidate validators pass.
- [ ] Neither hook reads a bypass switch or selects a validation subset. Thin
  wrappers keep orchestration in the versioned engine. Real installed-hook
  commit tests verify wiring and Git index behavior; command tests alone do
  not establish that evidence. Preserve actual command/output traces before
  marking this manual walkthrough complete.

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
