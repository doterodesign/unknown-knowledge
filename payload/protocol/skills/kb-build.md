# /kb-build — the sole knowledge write path (PRD §3.2, D-019)

> Paths in this document are client-relative — relative to the vendored kit
> root after init (`ontology/…`, `engine/…`, `protocol/…`). In the kit repo
> itself these live under `payload/`. Commands are written to run from the
> **repo root** with the kit dir at its default name `unknown-knowledge/`;
> substitute your chosen kit dir name if it differs.

The knowledge store's truth anchor is the world, not the code — and this
skill is its **sole write path**: every leaf under `knowledge/` lands
through this procedure, drafted by an agent and approved by a human through
the normal PR gate (agents draft; humans approve). You operate under
`protocol/AGENTS.md` throughout — every gate rule there binds here. Run
this when someone brings an item worth keeping: a regulation, an industry
rule, a research result, an operational fact the code cannot testify to.

**The leading rule: citations required — an unsourced claim is not
promotable.** A claim with no traceable source never becomes a leaf; it
parks as a gap-log entry (step 2) so the demand signal survives without the
store vouching for it.

Two `--root` conventions, stated once (same as AGENTS.md):

- Store-reading CLIs (`resolve.js`, `validate.js`) take `--root` as the
  **repo root** (default: cwd); the stores are auto-located at
  `<root>/unknown-knowledge/`.
- `log-entry.js` takes `--root` as the **kit dir** (the directory
  containing `logs/`), e.g. `--root unknown-knowledge`.

## The five steps

```
1. CLASSIFY  item → one target notation in the domain/division spine
2. CITE      every claim carries a citation, or the item parks as a gap
3. DRAFT     the leaf file: §3.2 governance frontmatter + body
4. INDEX     the catalog row that keeps the tree navigable
5. VALIDATE  structural validator green, then the human gate
```

### 1. CLASSIFY — one target notation

Enter through the store's navigational grammar (AGENTS.md): read
`knowledge/_catalog.yaml`, then `knowledge/_rules.yaml` — the
domain/division spine the bootstrap interview wrote. Then check what
already exists near the item:

```
node unknown-knowledge/engine/resolve.js "ach withdrawal settlement" --json --root .
```

Resolve surfaces knowledge entry points alongside concepts — read any leaf
it names before deciding placement (the map is never the fact). Decide, in
this order:

- **An existing leaf already covers the item** → this run is a *revision*
  of that leaf, not a new one: its notation is immutable once cited (§3.5),
  so keep it, bump `edition`, and append a `revision` note in step 3.
- **The spine names a home** (a domain + division that owns the topic) →
  a new leaf there: mint the next free notation under that division —
  `knowledge/_catalog.yaml` is the register of taken notations. Where the
  classification was contestable (the item could plausibly file under two
  divisions), record the call as a `class-here` note on the leaf, and put a
  `class-elsewhere` redirect on the leaf where sessions will keep looking —
  the content lives in exactly one place; the redirect is a signpost, and
  it must resolve.
- **The spine has no home for it** → the spine is the human's (it came from
  the bootstrap interview): hand the item back with the domains you
  considered and ask whether `knowledge/_rules.yaml` should grow — never
  invent a domain or division silently.

**Done when** exactly one of the three outcomes holds: one target notation
minted for a new leaf, one existing leaf identified for revision, or the
item handed back for a spine decision. Two plausible homes you cannot
separate is the third outcome, not a coin flip.

### 2. CITE — the promotion gate

Inventory every claim the drafted item makes — each sentence that asserts
something about the world. Each claim must end this step in exactly one
state:

- **Cited**: a `source` (+ `accessed` date) a reviewer can follow to the
  world — a regulation, a standard, a published document, a dated research
  artifact. The citation supports the claim as written, not the topic in
  general.
- **Dropped**: reworded out or removed — the leaf says less and stays true.
- **Parked**: worth keeping as demand but unsourced. An unsourced claim is
  not promotable — it goes to the gap log, never into a leaf:

```
node unknown-knowledge/engine/log-entry.js create --log gaps --date 2026-07-09 \
  --root unknown-knowledge \
  --entry '{"summary":"kb-build item not promotable: withdrawal-speed claim lacks any citation; nearest leaf 100.1","consulted":{"leaves":["100.1"]}}'
```

`--date` is injected, never wall-clock; the summary carries notations,
concept IDs, and file paths only — never verbatim user text or secrets
(§3.4). **Done when** zero uncited claims remain in the draft. If citing
and dropping empties the item, park what remains and end the run here — a
parked item is a recorded demand signal, not a failure.

### 3. DRAFT — §3.2 governance frontmatter + body

The frontmatter shape is `schemas/knowledge-leaf.schema.json` — the single
source of truth; the validator enforces it in step 5. The governance calls
this skill makes on top of the schema:

- **`notation`** — quoted (`"110.1"` — unquoted it parses as a number).
  Published notation is immutable: a move is a new leaf plus a
  `class-elsewhere` redirect from the old one, never a rename in place
  (§3.5).
- **`notes`** — every leaf carries a `scope` note (what it covers and
  pointedly does not) and every write appends a `revision` note with
  `date` (initial entry, or what changed); add `class-here` when step 1
  flagged the classification as contestable. On revision, bump `edition`
  alongside the new `revision` note.
- **`cross-references`** — `class-elsewhere` and `see-also` must resolve to
  notations the catalog declares; `including` is standing room — candidate
  topics parked under the heading, not authoritative, never citable as
  fact.
- **`citations`** — the step-2 survivors, verbatim; at least one.
- **`terms`** — the words a future resolve should hit; write them for the
  searcher, not the author.
- **Body** — the markdown below the frontmatter is the content; each claim
  reads back to a listed citation.

**Done when** every cross-reference resolves to an existing notation (or
was removed, with the removal noted in the revision note) and every step-2
citation appears in the frontmatter.

### 4. INDEX — the catalog row

Add the row to `knowledge/_catalog.yaml`: `id` (the quoted notation),
`title` (the heading, kept in sync on revision), `file` (the leaf path
relative to `knowledge/`). **Done when** every leaf file under `knowledge/`
has exactly one catalog row naming it, and every row names a real leaf —
the validator's `index-drift` and `orphan` checks verify precisely this.

### 5. VALIDATE — green, then the human gate

```
node unknown-knowledge/engine/validate.js --root .
```

- **Exit 0** — done drafting. Hand the change to the human gate: the leaf,
  the catalog row, and any gap fragments ride one PR; knowledge writes are
  human-gated, and the merge IS the approval.
- **Exit 1** — the findings name the defect (`orphan`, `index-drift`,
  `missing-citation` — an unsourced claim is not promotable): fix the
  draft, re-run.
- **Exit 2** — **stop and fix**: the check never ran (an unresolved
  cross-reference lands here), and a check that never ran is a blocking
  defect, never a silent pass. Re-run until the run itself completes.

The skill declares done only on an exit-0 run that saw the final draft —
a verdict is per-run, never carried (D-011).
