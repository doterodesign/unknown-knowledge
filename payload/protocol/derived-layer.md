# The derived layer: browse trees, call numbers, and the recall gate (UCS-1158)

> Paths in this document are client-relative — relative to the vendored kit
> root after init (`knowledge/…`, `engine/…`, `protocol/…`). In the kit repo
> itself these live under `payload/`.

Everything discovery-shaped in this store is **derived**: computed from the flat
set of leaves, written into one directory, and thrown away without loss.

```
knowledge/
├── _registries/          # governed vocabularies — AUTHORED
├── design-system/…       # leaves — AUTHORED
└── derived/              # engine output — DISPOSABLE
    ├── index.json                 # the resolution index
    ├── tree.domain-form.md        # browse tree, steward ordering
    └── tree.form-domain.md        # browse tree, agent ordering
```

Regenerate it with the `derive` surface:

```sh
node unknown-knowledge/engine/derive.js --root . --today 2026-08-16 --write
```

Two verbs, and the read-only one is the default — the same shape `phoenix` uses:

| Verb | Effect | Exit |
|---|---|---|
| `--check` (default) | compare the layer on disk against what the store projects | 0 up to date / 1 findings |
| `--write` | replace the directory with what the store projects | 0 written |

## Deleting it loses nothing

That is the design claim, and it is enforced rather than promised:

- **Nothing authored lives here.** No field, no id, no decision. Every byte is a
  function of the leaves.
- **Nothing reads it back.** The loader skips `derived/` by name. Browse trees
  are markdown under `knowledge/`, exactly like leaves, so the name is the only
  thing distinguishing engine output from a record — and if the walk descended,
  a generated tree would fail the leaf schema and the store's health would
  depend on a directory whose whole contract is that it is disposable.
- **Regeneration is byte-identical.** Delete the directory, re-run `--write`,
  and the bytes match. A round-trip test asserts exactly that; it fails the
  moment something unreproducible starts living here.
- **A file no axis generates is a finding.** `derived-unexpected` fires on
  anything in the directory the engine did not produce, because a regeneration
  would delete it.

Never hand-edit a derived file. `--check` reports it as `derived-stale`, and the
next `--write` overwrites it.

### Commit it, or ignore it — both work

The kit does not decide this for you, because the two choices trade off real
things and the answer is local:

- **Commit it** and browse trees are readable on the forge, and a reviewer sees
  a reclassification's effect in the diff. The cost is that every PR touching a
  leaf also touches the trees, and a contributor who forgets to regenerate lands
  a stale artifact — which `derive --check` catches in CI.
- **Ignore it** (`knowledge/derived/` in `.gitignore`) and the store's history
  stays free of generated churn. The cost is that a reader has to run the
  command to browse.

Either way nothing is lost, because nothing here is authored. If you commit it,
run `derive --check --today <date>` in CI so a stale tree is a failed build
rather than a misleading document.

## Plural browse trees

The store projects along **two axes**, from one flat set of leaves:

| Axis | Ordering | For |
|---|---|---|
| `domain-form` | domain → form | stewards — subject matter first, the way a person holds a library in their head |
| `form-domain` | form → domain | agents — kind of knowledge first, narrowed by subject afterwards |

Plural is the point. The store's first life filed each leaf at one position in
one tree, and that position was also its identity — so a leaf in the wrong place
stayed there, because moving it broke every citation to it. Accession identity
removed that cost, and the derived layer spends the refund: a projection commits
to nothing, so there can be as many as there are useful reading orders.

A third axis is one row in `AXES` (`engine/lib/derived.js`). Nothing else names
an axis.

### Stale and draft leaves are annotated, never hidden

A demoted leaf appears in every tree it belongs in, wearing its reason:

```
- **frontend/** (2)
  - **runbook/** (1)
    - `ENG/FRO/RUN·L-000171` Visual regression triage playbook — **demoted** (stage, time)
      - stage: stage "draft" is pre-promotion — no moderator has certified this leaf's citations
      - time: verified 154 day(s) ago, past the 90-day limit for volatile knowledge
```

Hiding it would make the tree lie by omission: a steward would read an empty
shelf as "we know nothing about this", when the truth is "what we know has
rotted" — opposite calls to action. Demotion sorts a leaf last within its node
and does nothing else.

Both demotions come from the surfaces that already own them — `timeVerdict` and
`isPrePromotionStatus` — so a leaf cannot read stale in a tree and trusted in
the resolver.

**Time verdicts need `--today`.** Staleness is measured from an injected date,
never the wall clock. Without `--today` the time verdicts are `skipped` and every
artifact says so in its header; it is never a silent pass. Stage demotion needs
no date and still applies.

## Call numbers are display strings, never identities

A call number names a leaf's position in one projection:

```
SPO/ODD/REF·L-000117      in the domain-first tree
REF/SPO/ODD·L-000117      the SAME leaf, in the form-first tree
```

**Cite the accession id. Never a call number.** A call number is the most
tempting thing in this layer to paste into a `see-also` — compact, readable,
positional, everything the retired dotted notation was. If that paste ever
resolved, the accession inversion would reverse itself one convenient citation at
a time, and references would break on reclassification again.

It cannot resolve, and the defense is structural:

1. **The grammar refuses it.** The middle dot (`·`) appears in no id space, and
   a test checks every synthesized call number against every grammar in
   `ID_GRAMMARS` — so a new id space that accepted them would fail the day it
   was added.
2. **Nothing accepts one.** Citations are `leaf-ref`, accession-only. A call
   number in a citation field is both a `pattern-mismatch` and an
   `unresolved-ref`.
3. **The accession travels inside it.** The tempting thing to paste contains the
   correct thing to paste.

The same leaf reads differently on each axis, and that is deliberate: a call
number describes a position, and a leaf holds one per projection. A string that
looked stable while changing meaning between trees would be worse than one that
visibly reorders.

## Embedding recall: the slot and the gate

Probabilistic recall has **exactly one architectural position**, declared in
`engine/lib/derived.js` as `RECALL_SLOT`:

| Property | Value | Why |
|---|---|---|
| `location` | `derived` | recall lives in the disposable layer and nowhere else — deleting `derived/` deletes every probabilistic artifact the system has ever computed |
| `consulted` | `after-deterministic-exhausted` | recall runs only when the deterministic layer returns nothing; consulting it earlier would let a similarity score outrank a declared edge |
| `output` | `proposals` | it may propose |
| `citable` | `false` | a proposal is never a citation |
| `persistable` | `false` | a proposal never enters the store |

**The implementation is out of scope, deliberately.** This ticket ships the slot
and the gate; model selection and semantic search are not built here. What the
slot does is fix the position so it cannot be occupied somewhere worse. An
embedding cached in frontmatter would be a guess sitting in the same file as
cited facts, indistinguishable to every later reader — which is precisely the
failure the three constraints above prevent.

`gateProposal()` refuses **every** proposal, by construction. There is no
argument that admits one. A future recall implementation calls it, gets a
refusal, and the only route into the store remains the ordinary one: a human
reads the proposal and authors an ordinary leaf with citations, which a moderator
promotes. At that point the record is knowledge, and the probabilistic step is
history rather than provenance.

Nothing probabilistic persists or is cited without that gate.
