# UCS-1155 — Trust graduation: category table, provenance checks, graduation/revocation as Decisions entries

> Implementation findings, written on branch
> `ucs-1155-trust-graduation-category-table-provenance-checks` (base
> `faceted-store-v2` @ 8e11a4f). Gates green: `npm test` 923 pass / 0 fail,
> `npm run lint` 197 files / 0 failures, `npm run acceptance` OK (A1–A4, A6
> pass; A5 manual by design).

## Erratum in the ticket: the wrong prototype was cited

The Linear ticket (and the brief derived from it) says *"the graduation/revocation
mechanics in `faceted-store-prototype.html` (repo root) are the executable
intent — read that demo before designing."* **That file contains no graduation
mechanics at all.** It is the frontmatter-v2 faceted-store prototype (opaque
accession identity, PMEST facets, derived discovery); grepping it for
`graduat|revocat|trust|sampl|provenance` returns nothing.

The actual executable demo is **`library-walkthrough.html`, chapter 4 ("The
robot and the librarian")**, whose reducer at lines 229–241 is the mechanism in
miniature:

```js
if (decision === "approve") {
  s.streak[item.cat] = (s.streak[item.cat] || 0) + 1;
  if (item.cat === "nickname" && s.streak.nickname >= 3 && !s.graduated) { s.graduated = true; }
} else if (decision === "fix") {
  s.streak[item.cat] = 0;
} else if (decision === "mistake") {
  s.graduated = false; s.revoked = true; s.streak.nickname = 0;
}
```

Per-category streak; graduation at a threshold; and `mistake` revoking *and*
zeroing that category's streak — which is exactly the ticket's "any defect in a
graduated category revokes automatically". The governing prose is in `PRD.html`:
§2 ("Human-gated by default, autonomy earned per category"), the
"Trust graduation designed-for, not built in v1" block ("Each graduation is
recorded as a decisions/ entry of category `trust`"), §8 (reflect records
per-item approval outcomes by category — "the observable basis for the
trust-graduation trigger"), and the §11.1 deferred row. `CONTEXT.md` already
glossary-defined the term.

This was reported to the team lead before implementation and confirmed; the
ticket is implementable as written and the two files agree on the mechanism.

## Design decisions and their justification

### 1. The category table lives in `decisions/_registries/`

**Home — `decisions/`.** The ticket asked me to decide and justify. Graduation
governs the *change process* — how much reading a class of edit gets — not the
knowledge itself. Under D-003's truth-anchor test ("if the repo were deleted,
would this still be true?"), that is the **team's** anchor, which is the
decisions store. A graduation table under `knowledge/` would be claiming the
world decides how this repo is reviewed. The PRD independently says the same
thing: graduations are "a decisions/ entry of category `trust` — the third store
governs changes to the system's own trust boundary."

**Directory — `_registries/`, not a new one.** The table *is* a registry in
shape: a closed governed vocabulary, one row per value, each with a warrant and
a Decisions entry. The decisions store already carried `registries: true` in
`STORE_DESCRIPTORS` with nothing filed under it, so the file class existed
already. A second directory would have split one governance idea across two file
classes for no gain a steward can see.

**Kind — distinct, dispatched on the document's own `table:` key.** It shares
the directory but not the schema, because it answers a different question: a
registry says which values a facet may take; this table says how much
*inspection* a class of change gets, and carries an eligibility and threshold no
registry row has. Dispatch is on the `table:` key rather than a reserved
basename, so a steward who renames the file does not get it silently validated
as a registry (which would report every graduation row as `unknown-property`,
pointing at the wrong schema entirely).

### 2. Malformed table = exit 2, not findings

The brief left this to "the established judgment". I applied the loader's
existing rule: a table the loader cannot *trust* means the graduation checks
never ran, and a check that never ran is a blocking defect, never a silent pass.
So the three table defects are **loader diagnostics** (error severity → exit 2),
while defects in *entries* — which an author can fix without the table being in
question — are **findings** (exit 1). Verified across the fixtures: malformed
exits 2, findings exits 1, clean exits 0.

Three defects are refused at load, each because it leaves the table unable to
answer the question it exists for:

| diagnostic | what it catches | why it cannot be downstream |
|---|---|---|
| `graduation-table-name-mismatch` | declared `table` ≠ filename | a finding naming the table would cite a file no steward can open under that name |
| `duplicate-graduation-category` | one category declared twice | two rows can carry *different eligibilities*, so a category could be both eligible and gated and the engine would pick by file order |
| `graduation-threshold-shape` | `eligible` with no threshold, or `gated` with one | eligible against no bar at all; or a bar that can never be met, which reads as an eligibility someone forgot to set |

The threshold rule is enforced in the loader rather than the schema **because
the engine's JSON-Schema subset has no conditional keyword** (`SUPPORTED_KEYWORDS`
in `validate-record.js` — no `if`/`then`/`dependentRequired`). The phoenix schema
sets the precedent explicitly: a rule stated in a keyword nothing enforces is
contract drift wearing the appearance of a check. So the schema documents it and
the loader enforces it, where the diagnostic can name the row an author edits.

### 3. Typed block on the existing decision entry, not a forked kind

`graduation: { action, category, observed-cycles?, revokes?, defect? }` extends
`decision-entry.schema.json`. A graduation *is* an ADR — it has context,
decision, consequences, deciders, a date, and it supersedes and is superseded
like any other — so forking the kind would duplicate the whole envelope to add
three fields and split the decisions store into two things a steward must know
apart. `category: trust` was already in the schema's enum, which settles the
intent. `action` covers both directions in one shape deliberately: giving
revocation a lesser shape would make un-earning trust cheaper to record than
earning it, which is backwards.

### 4. Provenance surfaced, not merely stored

`provenance: {author, skill-version}` is the same shape UCS-1149 put on leaves,
now optional on decision entries. Criterion 3 is about *surfacing*: the point of
recording an author and a skill version is asking the question backwards — "which
entries did that skill revision write?" — which is unanswerable if provenance is
only ever stored. `validate.js` publishes a stable-sorted `provenance` array in
JSON and prints it in the human renderer.

Entries **without** provenance are omitted rather than listed as nulls: the field
is optional because the whole installed base predates it (D-001 — no update
channel, so seeded stores keep what they have), and a list padded with an entry
per un-migrated record would bury the ones that can actually be traced. A
provenance block carrying neither field is also omitted — publishing it would
advertise traceability the entry does not have.

### 5. `refEdges` generalized for one scalar ref

`graduation.revokes` names a single decision id, but `refEdges` only collected
**array**-valued fields, so the edge was silently never created. I generalized it
with an explicit `scalar: true` row flag rather than sniffing the runtime type.
Sniffing ("array means list, string means scalar") would silently accept
`supersedes: D-001` — a field whose whole contract is a list — and index it as a
resolvable edge, turning a shape error into a reference that appears to resolve.
This keeps the revocation and the graduation it withdraws connected through the
ordinary ref graph: a revocation citing no real graduation is a plain
`unresolved-ref`.

The codebase survey (§7.3) had already flagged `collectRefs`'s shape assumptions
as the right seam to generalize; this is that generalization, kept minimal.

### 6. No new engine command

The brief preferred this and `validate` carried the checks comfortably. README's
"Nine engine commands" is untouched, as is the CLI surface count in every pinned
list.

## What is deliberately NOT built

**v1 analytics are manual, and this is load-bearing rather than a shortcut.** The
engine does not compute approved-unmodified counts, does not verify
`observed-cycles`, and never decides whether a threshold was met. It checks that
the recorded artifacts are well-formed and consistent with the governed table —
which is precisely the part a human reviewer cannot reliably do by eye across a
growing decisions store, and the complement of the part a human *must* do.

`observed-cycles` is therefore the steward's **written record** of what they
counted, kept so a reviewer can weigh the judgment; no code asserts it. The
steward guide states plainly that a clean validation run is not agreement that a
graduation was earned. This is documented in three places the tests pin: the
steward guide, the seeded table's header comment, and both templates.

## Conduct documented (criterion 4)

In `payload/docs/steward-guide.md`, replacing the old placeholder section:

- **Revocation is automatic on ANY defect** — one is enough; there is no severity
  threshold to argue about and the response is mechanical so it cannot be talked
  down. Revoking is deliberately the cheapest entry in the store to write: if it
  were as laborious as graduating, the laborious thing would quietly not get done
  and the boundary would only ever move one way.
- **Citation spot-checks stay in the sampling plan at every trust level**,
  including the most graduated. A citation is a claim about the world the store
  cannot check for itself, so no streak of clean mechanical edits is evidence
  the citations are sound — graduation only ever answers the mechanical question.
- **v1 analytics are explicitly manual** (above).

`CONTEXT.md`'s glossary entry was rewritten — it previously said "Not built in
v1; designed for in the schema", which this ticket makes false.

## Files touched

**Engine / schema**
- `payload/schemas/graduation-categories.schema.json` (new)
- `payload/schemas/decision-entry.schema.json` — `graduation` + `provenance` blocks and `$defs`
- `payload/engine/lib/validate-record.js` — registers the `graduation-categories` kind
- `payload/engine/lib/load-stores.js` — `loadGraduationTable`, `model.graduations`, three diagnostics, `loadMetaFile` kind-dispatch, `refEdges` scalar rows, `graduation.revokes` ref row
- `payload/engine/commands/validate.js` — `checkGraduations`, `decisionProvenance`, three CHECKS entries, human renderer

**Payload / manifest**
- `payload/templates/decisions/trust-graduation.yaml` (new)
- `payload/templates/decisions/trust-revocation.yaml` (new)
- `payload/templates/decisions/_registries/graduation-categories.yaml` (new, seeded empty)
- `cli/kit.manifest.yaml` — three rows

**Docs**
- `payload/docs/steward-guide.md` — trust graduation section rewritten
- `CONTEXT.md` — glossary entry
- `CHANGELOG.md` — Unreleased/Added

**Tests / fixtures**
- `tests/trust-graduation.test.js` (new, 24 tests across A1–A4)
- `tests/fixtures/structural-validator/graduation-{clean,findings,malformed,no-table}/`
- `tests/validate.test.js`, `tests/validate-record.test.js` — pinned lists extended

## Note for whoever picks up the next ticket

The seeded table ships **empty**, for the usual reason (every row cites a
decision that must resolve, and a seeded repo's decisions store is empty by
design, D-001) plus one specific to this table: whether a class of change is
mechanical enough to sample is a judgment about *that project's* material. In a
store where an alias steers retrieval into regulated material, alias additions
are not mechanical at all. Shipping that judgment pre-made would be the kit
deciding how much someone else's work gets read. The header comment names the
candidate eligible and gated categories as guidance instead.
