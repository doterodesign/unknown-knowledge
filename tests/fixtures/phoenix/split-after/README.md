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

L-000117 and L-000213 both leave `sportsbook/odds-feed` and arrive at
`feeds/ingest`; L-000133 leaves `sportsbook/settlement` and arrives at
`feeds/settlement`. No class-level rename can express that — the predecessor
class divides across two successors — which is why the mapping is leaf-granular
and why each row carries a `why` a reviewer reads.
