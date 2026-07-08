# new-kind drafting template (PRD §5.2 DRAFT step)

This directory is the shipped template for drafting a new extractor kind out
of a `logs/misses/` entry. The pipeline it belongs to — SURVEY → MATCH →
DRAFT → GATE → INTEGRATE → RE-RUN — is documented in
`payload/protocol/new-kind-pipeline.md`. Read that first; in particular the
**D-005 hard rule**: validators execute only vendored, versioned,
test-covered code — a kind drafted in a session is NEVER wired into the
validator in that same session. Everything drafted from this template enters
through GATE (PR + tests + review).

The template is deliberately framework-agnostic and demonstrates the shape
with a trivial demo kind, `line-list` (one `- value` per line). The kit's
extractor-kind framework (KK-07/08) defines how merged kinds register with
the value validator; a drafted parser conforms to that at INTEGRATE time —
the contract this template teaches (pure lexical extraction, hard-error on
out-of-envelope, string values as sets) is the part that never changes.

## What's here

| File | DRAFT artifact |
|---|---|
| `parser.example.js` | **the parser** — pure function `extractValues(text)` + a demo-run CLI; hard-errors on anything outside its declared syntactic envelope |
| `fixture/sample.list` | **the test fixture, input half** — a sample anchor (D-009) |
| `fixture/EXPECTED.yaml` | **the test fixture, expected half** — the value set the parser must extract from `sample.list` |
| `fixture/demo-anchor.list` | stand-in "live anchor" used by the recorded walkthrough below |
| `descriptor.example.yaml` | the `enumerates` descriptor fragment the RE-RUN step validates once the kind is merged |

## Drafting a real kind from this template

1. Start from an **open miss**: `logs/misses/<date>-<hex8>.yaml` gives you the
   anchor `path` and its `shape`. First weigh reification (principle 6) —
   a registry/enum in the code often beats a bespoke parser.
2. Copy this directory; rename the kind (lowercase/digits/hyphens); replace
   the extraction logic in the parser, keeping the four contract points in
   its header comment (pure/deterministic, hard-error-never-guess, declared
   envelope, string values).
3. Rebuild the fixture pair: a `fixture/` sample exercising the envelope
   (including at least one adversarial-but-extractable shape) and its
   `EXPECTED.yaml`.
4. **Demo run** the parser against the live anchor the miss recorded and
   capture the output for the PR.
5. Open the GATE PR: parser + fixture + demo-run output. Transition the miss
   `open → proposed` (`node engine/log-entry.js transition --file
   logs/misses/<entry>.yaml --to proposed --date YYYY-MM-DD`). Resolution
   (`proposed → resolved`) happens only after the merged kind's RE-RUN
   passes; rejection requires a `reason`.

## Recorded walkthrough (manual exercise, 2026-07-08)

Honest seam: this is a documented **manual** exercise of the template, not
CI. It was run once, by hand, from this directory, and is recorded here so
the demo-run step is concrete. (Kit CI only pins the template's fixture and
parser against each other so they can't rot apart.)

**1. Fixture run** — the parser against its own fixture, output matching
`fixture/EXPECTED.yaml`:

```
$ node parser.example.js fixture/sample.list
{ "kind": "line-list", "file": "fixture/sample.list",
  "values": ["nfl", "nba", "mlb"] }       # exit 0 — matches EXPECTED.yaml
```

**2. Demo run** — the parser against a throwaway "live anchor"
(`fixture/demo-anchor.list`, standing in for the miss entry's `path`):

```
$ node parser.example.js fixture/demo-anchor.list
{ "kind": "line-list", "file": "fixture/demo-anchor.list",
  "values": ["soccer", "tennis"] }        # exit 0 — this output goes on the PR
```

**3. Envelope hard-error** — a file with an out-of-envelope line must fail
loudly with exit 2, never emit a partial set:

```
$ node parser.example.js /tmp/bad.list    # line 2: "not a value line"
line-list: /tmp/bad.list:2: line is outside the line-list envelope
  (expected blank, "#" comment, or "- value"): "not a value line"
                                            # exit 2 — a check that never ran
                                            #   is a blocking defect
```
