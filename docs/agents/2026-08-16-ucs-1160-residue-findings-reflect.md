# UCS-1160 — Residue and candidates as fragment-based findings; reflect corroboration and minting conduct

Branch: `ucs-1160-residue-and-candidates-as-fragment-based-findings-reflect`
(cut from `faceted-store-v2` @ 8e41a06). Date: 2026-08-16.

## What the ticket asked for, and what shipped

The loop that turns misses into tomorrow's deterministic edges. Residue (from
any input shape) and ranked document candidates are written as fragment-based
findings through the **existing** log-entry surface — git-native, so concurrent
sessions never merge-conflict — and the reflect **skill** (a protocol doc, not
an engine command) gains the corroboration and minting conduct.

Nothing new was built at the engine layer. The whole ticket landed as three
additive schema fields, one new template, and protocol/docs prose with
assertions. That was the right shape: the corroboration threshold and the
warrant judgment are the human half of the loop, and building either into the
engine would have made the threshold un-auditable and the warrant automatic.

## The four acceptance criteria

### 1. Residue and candidates emit as valid finding fragments through the CLI

**The gap, found empirically before writing anything.** Running the residue
shape through the CLI as it stood:

```
log-entry: logs/findings/2026-08-16-00000001.yaml: entry does not validate
against finding.schema.json: resolved-context: unknown-property — unknown
property "resolved-context" (additive schema evolution edits the schema;
unknown keys are typos)
```

Exit 2. `resolve` had published `decomposition.residue` and
`decomposition['resolved-context']` since UCS-1152, but the finding schema had
no field to receive them — the two halves of the loop were not connected.

**The fix** — `payload/schemas/finding.schema.json` gains three additive fields
(§3.5 additive-only, D-013):

- `residue` — array of strings, the unresolved terms this finding is about.
- `resolved-context` — array of strings, `resolve`'s own
  `decomposition.resolved-context` (operations, concept ids, jurisdictions).
- `section` — closed object `{document, address, line?, page?}`, `document` and
  `address` required.

No new record kind and no parallel surface: residue is a **finding**, so
reflect's existing sweep/cluster/transition machinery consumes it unchanged.
`KIND_SCHEMA_FILES` in `validate-record.js` was untouched, so the KINDS pins in
the validate-record tests needed no edit.

Verified at the CLI seam: two creates, exit 0, two distinct files
(`logs/findings/<date>-<hex8>.yaml`), each validating as `finding`.

### 2. Each finding carries its resolved context and section locator

Pinned as a golden on the exact bytes, in
`tests/log-entry.test.js` ("UCS-1160 golden: the emitted fragment shape is
byte-stable"). The candidate fragment on disk:

```yaml
schema-version: 1
date: '2026-08-16'
status: open
trigger: retrieval-miss
summary: 'document candidate: marquee in docs/theming-rules.md'
residue:
  - marquee
resolved-context:
  - K-110
section:
  document: docs/theming-rules.md
  address: Theme types
  line: 42
```

Byte-identical across two fresh roots (confirmed by `diff` before the test was
written). Query residue carries no `section` — there is no document to address.
A locator is line- OR page-addressed (pdf sources are page-addressed per
`lib/coverage.js`), and the object is closed: a missing `document` or a
typo'd key (`lines` for `line`) exits 2, because a locator that sends a reader
to the wrong lines is worse than no locator.

Also pinned: the residue payload survives the full `open → proposed →
resolved` lifecycle. It is what the minting decision cites, so losing it
mid-transition would strand the evidence.

### 3. The placeholder idiom, extended — empirically, not by assumption

**How the existing idiom works.** `payload/templates/decisions/registry-minting.yaml`
carries `id: D-YYYY-MM-DD-mint-example-domain` and `date: "YYYY-MM-DD"`. The
`decisionRef` pattern in `registry.schema.json` accepts `D-NNN` or
`D-YYYY-MM-DD-slug` with **digits** — so the literal `YYYY` fails. Every other
field is real, so filling exactly those two yields a valid entry.

**New file** — `payload/templates/decisions/reflect-mint-proposal.yaml`, the
same idiom for the vocabularies reflect mints. Per the UCS-1155 lesson, I ran
validation against a pasted-unedited proposal rather than assuming the failure
mode. First run used `validateRecord`, which validates a single *entry* and
reported ten misleading diagnostics; the right seam is `validateStoreFile`
(what `tests/registries.test.js` uses), which validates the file wrapper:

```
UNEDITED: [["entries[0].date","pattern-mismatch"],["entries[0].id","pattern-mismatch"]]
FILLED:   []
```

Exactly two diagnostics, and filling the two placeholders yields a clean
entry. That pair is pinned as the golden in `tests/registries.test.js`
("UCS-1160 golden: a reflect mint proposal pasted UNEDITED fails validation").
Worth recording: had I pinned from `validateRecord`, the golden would have
asserted ten diagnostics that describe a validation seam nothing in the
codebase actually uses on this file.

The template also states, where a drafter reads it, both rules the entry
exists to evidence: `ONE FINDING IS A DATA POINT, THREE ARE A PATTERN` and
`A VALUE IS MINTED ONLY ON LITERARY WARRANT`. Registered in
`cli/kit.manifest.yaml` — a payload file the manifest does not name never
reaches a client (D-007).

### 4. Reflect skill + walkthrough

`payload/protocol/skills/knowledge-reflect.md` gains:

- A note that the corroboration rule is **counted by hand** — `log-entry.js`
  has no opinion about how many findings make a pattern, and no CLI reports a
  corroboration score.
- A "Residue and candidate findings" subsection describing both shapes, how to
  cluster them (by `residue` term, since they are about words the store has no
  concept for), and that zero resolution is a normal outcome, not a miss —
  consistent with `ZERO_RESOLUTION_CONDUCT` in `resolve.js`.
- A **"Minting conduct"** section: four mintable vocabularies (terms, aliases,
  operations, domain classes) and three binding rules — literary warrant always
  (corroboration alone is "speculative shelving wearing evidence"), evidence
  attached verbatim, and one Decisions entry per minting.
- A **reflect queue** table in the GATE step: mint proposals, corroborated
  findings, drafts awaiting promotion, sampled spot-checks. The spot-check
  sample is load-bearing — without it the human only ever sees what the
  threshold admitted, and a threshold nobody audits is a threshold nobody can
  tune.
- `mint-proposal` added to the closed change-category vocabulary.

`acceptance/A5-knowledge-reflect-walkthrough.md` seeds three corroborating
residue findings (two query residue, one document candidate with its locator),
carries them through a `mint-proposal` item at the gate, and records
`mint-proposal: approved: 1` in the stamp. **Every command output was
re-captured by running it** against `fixtures/swift-app` — the queue tally
changed from 1/1/4 to 1/1/7 because six more fragments now flow through, and
that number came from an actual `grep | sort | uniq -c`, not arithmetic.

## Gates

All green at the reporting commit:

- `npm test` — 972 pass, 0 fail (baseline was 959; 13 new tests)
- `npm run lint` — 204 files, 0 failures
- `npm run acceptance` — OK, all asserted criteria (A1-A4, A6); A5 manual by design

## Review round 1 (CodeRabbit on PR #66) — 3 accepted, 2 declined

### Accepted 1: the section locator must address exactly one coordinate system

CodeRabbit was right that a locator with NEITHER `line` nor `page` is
underspecified and one with BOTH is contradictory — `lib/coverage.js` emits
`{line, endLine}` for line-addressed sources and `{page, object}` for pdf,
never both. But its suggested fix used `allOf`/`anyOf`/`not`, and
`SUPPORTED_KEYWORDS` in `validate-record.js` interprets none of those:

```js
'$schema', '$id', '$defs', '$ref', 'title', 'description',
'type', 'required', 'properties', 'additionalProperties',
'items', 'enum', 'pattern', 'minItems', 'minimum',
```

Pasting the suggestion would have written a keyword into the schema that
nothing enforces — the schema promising a rule no validator checks, which is
exactly the silent contract drift `tests/store-schemas.test.js` exists to
prevent.

Enforced instead as a **convention** in `validate-record.js`, where finding
records are already judged (`CONVENTIONS`, alongside the precedent
`lifecycleConventions`). New `locator-shape` code in `ERROR_CODES`; `finding`
now runs `findingConventions` (lifecycle + locator), while `miss`/`gap` keep
plain `lifecycleConventions` since they have no `section`. The schema's
`section` description states the rule AND says it is validator-enforced
because the subset has no conditionals, so a reader of the schema alone is not
misled into thinking `line`/`page` are independently optional.

Verified empirically at the CLI seam — both invalid shapes exit 2 with
distinct messages, both valid shapes exit 0:

```
NEITHER: section: locator-shape — a section locator needs a coordinate: line for
         line-addressed sources, page for pdf — a locator with neither cannot
         open the section it addresses (UCS-1160)                        EXIT=2
BOTH:    section: locator-shape — a section locator addresses one coordinate
         system: line (line-addressed sources) or page (pdf), never both —
         coverage emits exactly one (UCS-1160)                           EXIT=2
LINE ONLY / PAGE ONLY                                                    EXIT=0
```

A test also pins the *reason* it is a convention (asserting the four
conditional keywords are absent from `SUPPORTED_KEYWORDS`), so a later edit
cannot "fix" this by pasting a `oneOf` that nothing enforces.

### Accepted 2: template placeholder honesty — my own comment was false

CodeRabbit wanted every sentinel invalid until steward-authored. That is
impossible by design for prose fields: `title`, `deciders`, `context`,
`decision`, and `consequences` are free text with no pattern, and constraining
them in `decision-entry.schema.json` would constrain **every real Decisions
entry in the store**, not just this template.

But the finding had a true core, and it was my error: my comment said *"Every
other field is real: fill those two and the entry validates."* That is false.
Measured, rather than assumed:

```
after filling id+date: []          <- VALIDATES CLEAN
fields still holding placeholder text:
  title, deciders, context, decision, consequences
```

Five fields validate green while still holding `<angle-bracket>` prose. The
fix is the honest inventory, applying this ticket's own UCS-1155 lesson to its
own template: the comment now splits **MACHINE-REFUSED** (`id`, `date`) from
**GREEN BUT STILL A PLACEHOLDER** (the five, listed by name), and states that
a green validation means "the shape is right", never "the rationale is
written".

I checked whether any green placeholder could cheaply become machine-refused
without touching the shared schema. One could: `supersedes` is `decisionRef`-typed,
so a placeholder there fires `pattern-mismatch`. I did **not** take it —
`supersedes: []` is the correct value for most mints, so forcing a placeholder
would make every non-superseding mint proposal fail. A guard that cries wolf on
the common case is worse than the honest inventory.

The test pins the inventory by *deriving* it (filter the filled entry for
`<`-bearing values) and asserting it equals the documented five, so a sixth
green placeholder or a newly-patterned field breaks the test rather than
silently making the comment wrong again.

### Accepted 3: "distinct" defined once, precisely

Three wordings existed ("at least three DISTINCT fragments", "across three
sessions", "distinct sessions/dates") and none said whether three fragments
from ONE session count. Per my own stated intent, they do not.

Definition now lives in exactly one place — a `### What "three distinct
fragments" means` section under Minting conduct — and says the threshold
counts **independent resolution events, not files**. The case ruled out (one
session logging `stencil` three times is "one data point wearing three
filenames", which would let a single session vote three times) and the case
admitted (`occurrences` dates; the same term as query residue in one session
and a document candidate in another) are both stated. The evidence standard
and the template now *point at* that definition instead of paraphrasing it,
and a test asserts the section appears exactly once — a second definition is
drift by construction.

Also corrected while there: the template said "`evidence` must name at least
three distinct fragments", but the template has no `evidence` field. It is
`context`.

### Declined: fence language tags

A5 has 35 untagged fences to 1 tagged; the file convention is untagged. We
match the file rather than lint it — the same call made twice before on the
steward guide. Reasoning recorded in the PR comment.

## Notes for whoever picks this up next

- **The branch checkout failed exactly as the ticket warned.** `git checkout -b`
  under the sandbox created the ref but left HEAD on `faceted-store-v2`
  ("could not lock config file"). Recovery was a plain `git checkout <branch>`
  unsandboxed. Always verify with `git branch --show-current` before committing.
- **Docs-assertion regexes must tolerate the line wrap — this bit me in BOTH
  rounds.** Three assertions failed this way on the first pass and three more
  during review, every time because the phrase spans a newline in the
  72-column prose (and in YAML comments, a `# ` prefix too). Write `\s+#?\s*`
  at any point where a phrase might wrap, from the start. Never reflow the
  prose to suit the test — that is the test dictating the document.
- **`validateRecord` vs `validateStoreFile`** is a real trap for template
  assertions — the first validates one entry, the second the file wrapper.
  Template goldens want the second.
- The engine was deliberately left alone. If a future ticket wants residue
  findings *emitted automatically* by `resolve`, note that `resolve` is a
  read-only query surface and `log-entry.js` is the only write path into
  `logs/` — wiring one to the other would give a read command a write effect,
  which is a bigger design decision than it looks.
