# The `split` fixture, after phoenix event P-001 — the golden "after"

The other half of a golden before/after pair. `../split/knowledge/sportsbook/`
is the store before the event; these three files are what the engine produces
from it:

    node payload/engine/phoenix.js P-001 --root tests/fixtures/phoenix/split --apply

`tests/phoenix.test.js` pins these bytes against a real run, so the pair is a
diff a reviewer can read rather than a claim a test asserts. Only the leaf files
are kept here — the registries, catalogs, decisions entry and the mapping itself
are unchanged by an event, and copying them would invite the two halves to drift.

## What the diff shows

Two lines per leaf, and nothing else:

    -edition: 1
    +edition: 2
       facets:
    -  domain: sportsbook/odds-feed
    +  domain: feeds/ingest

That is the whole event. In particular:

**`id:` does not appear in the diff.** Identity is the accession, and a phoenix
event never changes one. Every citation into these leaves — the decisions entry
D-420's `relates-to`, the catalog rows, any leaf cross-reference — is as valid at
edition 2 as it was at edition 1. Nothing chases a reclassification.

**The citations blocks do not appear in the diff.** Not because the engine is
careful with them, but because it never touches them: the rewriter replaces
individual frontmatter lines and copies every other byte through. Citations are
untouched *by construction*, which is a stronger claim than untouched *in this
case*.

**The bodies do not appear in the diff.** The material did not change. What
changed is the shelf it sits on, which is the only thing a phoenix event is
allowed to change.

## The split

All three leaves start under ONE predecessor, `sportsbook/odds-feed`, and they
do not all end up in the same place:

| leaf | | successor |
| --- | --- | --- |
| L-000117 — provider quirks | → | `feeds/ingest` |
| L-000213 — ingest latency budget | → | `feeds/ingest` |
| L-000133 — banker's rounding at settlement | → | `feeds/settlement` |

That is what makes this a split rather than a rename, and it is the reason the
mapping has to be leaf-granular. A class-level rule could say "odds-feed becomes
feeds/ingest" and would be right about two of these leaves and wrong about the
third. Nothing about the class itself distinguishes them — L-000133 is
settlement material that was filed under odds-feed because it arrived with a
feed integration, which is exactly the drift the event exists to fix. Only a
per-accession row can carry that judgment, and only the row's `why` can explain
it to the next reader.
