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

## This skill is thin orchestration

Every mechanical step below **names the engine command that performs it**.
The commands compute; this skill sequences them and stops on their exit
codes. Where a step says "run", run it — do not reproduce its answer from
memory, and do not decide an outcome the engine reports.

Your discretion is limited to three **judgment fills**, and they are the
only free-form work in the procedure:

| Judgment fill | Where | What it means |
| --- | --- | --- |
| **Prose bodies** | step 4 | the leaf's markdown body — written, not generated |
| **Candidate confirmation** | steps 1–2 | confirming a proposed classification or citation against the source, which is a read no command can do for you |
| **Mint proposals with warrant evidence** | step 3 | proposing a governed vocabulary value, carrying its literary warrant |

Everything else — locating coverage, minting the accession, checking facet
values against their registries, checking the catalog, the final gate — is
the engine's. **Protocol compliance is a property of the mechanism, not of
agent obedience**: the hooks in `hooks/` run the blocking validation and
the reverse lookup whether or not anyone remembers to, and they propagate
the engine's exit codes unchanged.

Two `--root` conventions, stated once (same as AGENTS.md):

- Store-reading CLIs (`resolve.js`, `validate.js`) take `--root` as the
  **repo root** (default: cwd); the stores are auto-located at
  `<root>/unknown-knowledge/`.
- `log-entry.js` takes `--root` as the **kit dir** (the directory
  containing `logs/`), e.g. `--root unknown-knowledge`.

## The five steps

```
1. CLASSIFY  item → one facet-set home, via resolve.js
2. CITE      every claim carries a citation, or it parks via log-entry.js
3. FACET     fill the governed facets from the registries
4. DRAFT     the leaf file: §3.2 governance frontmatter + body, at draft stage
5. VALIDATE  validate.js green, then the human gate
```

### 1. CLASSIFY — one subject home

Enter through the store's navigational grammar (AGENTS.md): read
`knowledge/_catalog.yaml`, then `knowledge/_rules.yaml` — the
domain spine the bootstrap interview wrote. Then ask the engine what
already exists near the item:

```
node unknown-knowledge/engine/resolve.js "svg asset export precision" --json --root .
```

`resolve.js` is what answers "does the store already cover this". Read its
`decomposition` (which operations, concepts and jurisdictions joined) and
its `residue` (the tokens nothing consumed) — residue is the store telling
you where its vocabulary runs out, and it is the raw material a later
`mint-proposal` is built from. Read any leaf it names before deciding
placement (the map is never the fact): that read is **candidate
confirmation**, a judgment fill, and no command substitutes for it.

Decide, in this order:

- **An existing leaf already covers the item** → this run is a *revision*
  of that leaf: its accession is its identity and never changes (§3.5), so
  keep it and append a `revision` note in step 4.
- **The spine names a home** → a new leaf. Classification is a
  `facets.domain` value, not a position: the subject path says what the leaf
  is about, and the leaf's identity is a fresh **accession** minted in step
  4. Nothing has to be looked up to find "the next free" anything — an
  accession is opaque and drawn from a sequence, so two authors classifying
  into one domain never contend for a number, and the classification you
  choose here constrains nothing about the identity you get.
  Where the classification was contestable (the item could plausibly file
  under two domains), record the call as a `class-here` note on the leaf.
- **The spine has no home for it** → the spine is the human's (it came from
  the bootstrap interview): hand the item back with the domains you
  considered and ask whether `knowledge/_rules.yaml` should grow — never
  invent a domain silently.

**Done when** exactly one of the three outcomes holds: one subject home
settled for a new leaf, one existing leaf identified for revision, or the
item handed back for a spine decision. Two plausible homes you cannot
separate is the third outcome, not a coin flip.

### 2. CITE — the promotion gate

Inventory every claim the drafted item makes — each sentence that asserts
something about the world. Each claim must end this step in exactly one
state:

- **Cited**: a `source` (+ `accessed` date) a reviewer can follow to the
  world — a regulation, a standard, a published document, a dated research
  artifact. The citation supports the claim as written, not the topic in
  general. Confirming that is **candidate confirmation**: open the source
  and read it, because a citation nobody followed is a claim about a
  citation.
- **Dropped**: reworded out or removed — the leaf says less and stays true.
- **Parked**: worth keeping as demand but unsourced. An unsourced claim is
  not promotable — it goes to the gap log, never into a leaf, and
  `log-entry.js` is the only write path into `logs/`:

```
node unknown-knowledge/engine/log-entry.js create --log gaps --date 2026-07-09 \
  --root unknown-knowledge \
  --entry '{"summary":"kb-build item not promotable: export-precision claim lacks any citation; nearest leaf L-000100","consulted":{"leaves":["L-000100"]}}'
```

`--date` is injected, never wall-clock; the summary carries leaf ids,
concept IDs, and file paths only — never verbatim user text or secrets
(§3.4). `consulted.leaves` cites each leaf by its accession id — the only
spelling that resolves — and the summary should name that same id, so a
reader can look up what the entry consulted.

**Done when** zero uncited claims remain in the draft. If citing
and dropping empties the item, park what remains and end the run here — a
parked item is a recorded demand signal, not a failure.

### 3. FACET — fill the governed facets from the registries

`facets` is the classification block, and **every value must already be
minted in its registry** under `knowledge/_registries/`. Read the registry
file and take the value from it; a value the registry does not carry is a
blocking `unregistered-value` finding at step 5, which is the mechanism
refusing an ad-hoc string rather than trusting you not to write one.

| Facet | Registry | What it records |
| --- | --- | --- |
| `domain` | `_registries/domains.yaml` | the hierarchical subject path — every segment minted |
| `form` | `_registries/form.yaml` | what KIND of knowledge this is |
| `anchor` | `_registries/anchor.yaml` | which truth anchor settles the claim (artifact, world, team — D-003) |
| `stage` | `_registries/stage.yaml` | where the leaf sits in the promotion path |

Two adjacent governed lists are filled the same way, from the same kind of
file: `operations` (the verbs this leaf lets a reader DO,
`_registries/operations.yaml`) and `applies.jurisdictions`
(`_registries/jurisdictions.yaml` — EMPTY means universal, which is a
claim, so leave it empty only when the knowledge really does hold
everywhere). Each `citations` entry carries an `authority` tier from
`_registries/authority-tiers.yaml`: the tier records how far the source can
be trusted, and without it a regulator's text and a hallway conversation
read identically.

**If no minted value fits, that is the signal to propose a minting, not to
invent a spelling.** A mint proposal is the third **judgment fill**, and it
is a governed act with a written rationale: draft it from
`templates/decisions/registry-minting.yaml` and carry its **literary
warrant** — the material that already exists for the value to hold. Warrant
is evidence, not intention: a value minted ahead of its material is
speculative shelving (`protocol/registry-warrant.md`). Where the proposal
comes from a corroborated residue cluster instead of a single item, it is
reflect's `mint-proposal` shape and belongs on the reflect queue —
`protocol/skills/knowledge-reflect.md` owns that path. Either way the
proposal goes to the human; this skill never edits a registry.

**Done when** every facet, operation, jurisdiction and authority tier the
draft will carry is a value its registry already mints, or the run is
paused on a mint proposal awaiting the human.

### 4. DRAFT — §3.2 governance frontmatter + body

The frontmatter shape is `schemas/knowledge-leaf.schema.json` — the single
source of truth; `validate.js` enforces it in step 5. The governance calls
this skill makes on top of the schema:

- **`id`** — the accession (`L-NNNNNN`): **required on every leaf**, opaque,
  never reused, never positional. It is the leaf's identity, what the loader
  indexes by, and the only spelling other leaves, the catalog, decisions and
  log fragments may cite it as. Mint the next value in the sequence; because
  it says nothing about where the leaf sits, refiling the leaf later leaves
  it untouched and breaks no citation. A collision is a hard error at step 5,
  never a silently shared identity.
- **`facets.stage`** — start at **`draft`**. Every agent-authored entry
  enters at draft stage; this is not a courtesy, it is where the moderation
  pipeline picks the leaf up. A draft leaf is downranked in resolver output and
  verdicted `unknown` by preflight, which is correct and not a defect:
  nothing has certified it yet. Promotion is a moderator's act after the
  citations are checked, never the author's.
- **`notes`** — every leaf carries a `scope` note (what it covers and
  pointedly does not) and every write appends a `revision` note with
  `date` (initial entry, or what changed); add `class-here` when step 1
  flagged the classification as contestable.
- **`cross-references`** — `class-elsewhere` and `see-also` must resolve to
  leaves the catalog declares. Cite the target's accession id (`L-NNNNNN`),
  which is the only legal spelling. `including` is standing room —
  candidate topics parked under the heading, not authoritative, never
  citable as fact.
- **`facets`**, **`operations`**, **`applies.jurisdictions`**,
  **`citations[].authority`** — the step-3 values, verbatim. Nothing minted
  here that step 3 did not settle.
- **`citations`** — the step-2 survivors, verbatim; at least one.
- **`terms`** — the words a future resolve should hit; write them for the
  searcher, not the author.
- **`concepts`** — the ontology concepts (`K-NNN`) this leaf is knowledge
  ABOUT. Declare them even when `terms` already names the concept's term: the
  concept edge is STRUCTURAL, so it keeps working when the concept is renamed
  or when your leaf uses different words than the ontology does. `terms` is a
  text match between two authors' vocabularies; this is a claim. Each must
  resolve — a concept id nothing mints is a blocking finding.
- **`paths`** — the repo-relative files or directories this leaf governs. A
  directory covers its subtree. This is what makes the leaf surface in the
  reverse lookup, so the files in a diff surface the knowledge that governs
  them BEFORE the edit — and it is what the `hooks/reverse-lookup` hook
  reads. Every path must name something that exists INSIDE this repo: a path
  pointing at nothing governs nothing, one that escapes the repo root
  (`../elsewhere`, or an absolute path) is not this store's to claim, and
  `.` — the repo root — attributes nothing by attributing to everything. All
  three are blocking findings.
- **`relates`** — typed leaf-to-leaf edges, and the type carries the meaning,
  so choose it rather than defaulting to `see-also`:
  `depends-on` (this leaf's claim is only usable once the target's is),
  `see-also` (worth reading alongside — no dependency, no conflict),
  `contradicts` (the two claims cannot both hold — recorded, not resolved, so a
  human can settle it), and `supersedes` (this leaf replaces the target's
  claim — the disagreement is already settled). A resolver hit carries its
  neighborhood one hop out, labeled by kind, so these are what an agent reads
  next. Targets are leaf refs and each must resolve: cite the target's
  accession, as with `cross-references`.
- **`provenance`** — `author` and `skill-version`, so a systematic drafting
  defect can be traced to the vintage that introduced it. The skill is
  versioned and its changes are gated; record the version you ran.
- **Body** — the markdown below the frontmatter is the content, and it is
  the first **judgment fill**: each claim reads back to a listed citation.
  **Open with a topic sentence**: there is no `description` field (retired
  in v2), and display prose is DERIVED from the body's first sentence
  wherever a one-liner is shown. Write it as the sentence you would want to
  read in a search result.

  What the deriver actually does, so the guidance is not a guess: it skips
  leading markdown structure line by line — headings, list items, block
  quotes, fenced code, table rows — and takes the first prose line it finds,
  joining hard-wrapped continuation lines. It ends the excerpt at the first
  `.`, `!`, or `?` followed by whitespace, so `§4.2` and `v3.2` do not cut it
  short. Prose with no terminator is shown whole rather than dropped. The
  only body with nothing to show is one that is *entirely* structure — all
  heading, all list, all code — so the failure mode to avoid is opening with
  a bare list or a code block, not writing a fragment.

Then add the catalog row to `knowledge/_catalog.yaml`: `id` (the leaf's
accession, the same value as its `id` field, and the only legal spelling),
`title` (the heading, kept in sync on revision), `file` (the leaf path
relative to `knowledge/`). Leaf files are sharded by accession prefix —
`knowledge/<L-NN>/<accession>-<slug>.md`, where the prefix is `L-` plus the
first two digits of the accession's numeric part (`L-000101` files under
`knowledge/L-00/`). The shard is a fanout device for directory size and
**carries no meaning**: it makes no claim about the leaf's subject, and
nothing reads it. `validate.js`'s `index-drift` and `orphan` checks are what
verify the row against the file — do not audit that pairing by eye.

**Done when** the leaf file and its catalog row both exist, the body opens
with a topic sentence, `facets.stage` is `draft`, and every value in the
frontmatter came from step 2 or step 3.

### 5. VALIDATE — green, then the human gate

```
node unknown-knowledge/engine/validate.js --root .
```

The `hooks/pre-commit` hook runs this check and whole-store value validation
through `engine/commit-check.js`, so a commit that would fail here is refused
before it exists — running it now is how you see
the findings first, not a substitute for the hook.

- **Exit 0** — done drafting. Hand the change to the human gate: the leaf,
  the catalog row, and any gap fragments ride one PR; knowledge writes are
  human-gated, and the merge IS the approval.
- **Exit 1** — the findings name the defect (`orphan`, `index-drift`,
  `missing-citation` — an unsourced claim is not promotable;
  `unregistered-value` — step 3 was skipped or a value was invented): fix
  the draft, re-run.
- **Exit 2** — **stop and fix**: the check never ran (an unresolved
  cross-reference lands here), and a check that never ran is a blocking
  defect, never a silent pass. Re-run until the run itself completes.

Then attribute what you touched, which the `hooks/reverse-lookup` hook does
automatically over the staged diff and you can run directly:

```
node unknown-knowledge/engine/resolve.js --paths knowledge/L-00/L-000110-svg-asset-export-precision.md --json --root .
```

The skill declares done only on an exit-0 run that saw the final draft —
a verdict is per-run, never carried (D-011).
