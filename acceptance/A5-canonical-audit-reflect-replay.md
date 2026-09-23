# A5 — canonical audit and reflect CLI replay

This is a deterministic command replay, **not a completed fresh-agent audit or
reflect cycle**. It replaces neither source-reading evidence nor moderator
approval. The July walkthroughs retain their historical outputs unchanged;
this separate replay records current identities and findings.

Runtime and fixture source: `3f68a4b` (canonical integration), Node `v24.19.0`.
Injected date: `2026-09-19`. Source catalogs identify TypeScript Locale as
`O-000008`, its export guide as `K-000001`, and Swift Canvas tool / Tool shortcut
as `O-000001` / `O-000002`. These are record identities; existing numbered
filenames are ordinary locators. No legacy alias or suffix-derived mapping is
used. Dates on the fixture's evidence are retained.

## Reproduce the command checks

From the kit repository, use independent scratch roots. Retain every command's
stdout, stderr and exit separately, including expected nonzero exits.

```sh
KIT="$PWD/payload"
AUDIT_ROOT=$(mktemp -d /tmp/canonical-a5-audit.XXXXXX)
REFLECT_ROOT=$(mktemp -d /tmp/canonical-a5-reflect.XXXXXX)
cp -R fixtures/ts-app/. "$AUDIT_ROOT/"
cp -R fixtures/swift-app/. "$REFLECT_ROOT/"
git -C "$AUDIT_ROOT" init -q
git -C "$AUDIT_ROOT" add .
git -C "$REFLECT_ROOT" init -q
git -C "$REFLECT_ROOT" add .
```

Run `validate.js`, `validate-values.js`, and `audit.js --json --today
2026-09-19` with `--root "$AUDIT_ROOT"`. The first two exits are intentionally
nonzero because the fixture plants drift. Audit records those failures and
continues its report; it does not repair the stores or treat an unchecked
concept as healthy.

For finding writes, the helper root is the **kit directory**, unlike the
store-reading commands above:

```sh
node "$KIT/engine/log-entry.js" create --log findings --date 2026-09-19 \
  --suffix caaa0001 --root "$AUDIT_ROOT/unknown-knowledge" \
  --entry '{"trigger":"quarantine","summary":"Controlled wrong-pointer replay","consulted":{"concepts":["O-000008"]}}'
node "$KIT/engine/validate-values.js" --concepts O-000002 --root "$REFLECT_ROOT"
node "$KIT/engine/validate-values.js" --concepts O-000001 --root "$REFLECT_ROOT"
node "$KIT/engine/log-entry.js" create --log findings --date 2026-09-19 \
  --suffix cbbb0001 --root "$REFLECT_ROOT/unknown-knowledge" \
  --entry '{"trigger":"correction","summary":"O-000001 claims eyedropper and omits comment in Sources/Canvas/CanvasTool.swift","consulted":{"concepts":["O-000001"]},"session":"canonical-replay-1"}'
cat "$REFLECT_ROOT/unknown-knowledge/logs/findings/2026-09-19-cbbb0001.yaml"
```

The helper has `create` and `transition` commands, no `list` command. Inventory
and read the actual fragment files. One synthetic session is one event, not a
corroborated cluster; this replay does not authorize a repair.

## Captured current outputs

The blocks below are actual stdout from the pinned runtime. Source command
argv, exits and first-attempt failures are retained in the trial handoff.

### Whole-store structure — exit 1

```text
structural validate -> 2 finding(s) (2 error(s), 0 warning(s))
checks run: disconnected-revocation, gated-category-graduation, graduation-field-shape, graduation-not-trust-category, id-shape, index-drift, malformed-verified, missing-authority, missing-citation, missing-graduation-table, missing-path, missing-registry, missing-verified, orphan, ref-cycle, registry-shape-mismatch, suppressed-value, unaccounted-edition, undeclared-category, unminted-segment, unregistered-value

error  unregistered-value  K-000001  knowledge/product/100.1-adding-a-new-export-format.md  applies.jurisdictions[0]
    value "eu-eaa" is not minted in the "knowledge/jurisdictions" registry (knowledge/_registries/jurisdictions.yaml) — governed facets draw only from their registry; minting a new value is a registry edit plus a Decisions entry, never an ad-hoc string
error  unregistered-value  K-000001  knowledge/product/100.1-adding-a-new-export-format.md  facets.form
    value "walkthrough" is not minted in the "knowledge/form" registry (knowledge/_registries/form.yaml) — governed facets draw only from their registry; minting a new value is a registry edit plus a Decisions entry, never an ad-hoc string

fix every error-severity finding before merging — this validator is blocking-grade (PRD §4)
```

### Whole-store values — exit 2

```text
validate-values: 16 concept(s) checked, 0 skipped (draft/proposed), 3 findings, 3 hard errors

HARD ERROR out-of-envelope  O-000013  (source: src/registry/export-presets.ts)
  "ALL_PRESETS" spreads another array ("...") — the full member set is not lexically knowable; extracting the literal members would be a confident wrong parse (PRD §5.1)
HARD ERROR out-of-envelope  O-000015  (source: src/registry/experiments.ts)
  EXPERIMENTS: template literal interpolation ("${") — the value is not lexically knowable; a confident wrong parse is a false all-clear (PRD §5.1)
HARD ERROR out-of-envelope  O-000016  (source: src/types/index.ts)
  "ReleaseStatus" is not declared in this file — it is (or may be) re-exported from another module, and ts-union parses lexically, single-file only (PRD §5.1): resolving the chain is out of the envelope

the check never ran on the entries above — fix the descriptors/store first (PRD §4: a malformed descriptor is a hard error, never skipped)

FINDING value-not-in-source  O-000002  "luminosity"  (source: src/registry/blend-modes.ts)
  claimed value "luminosity" is not in "src/registry/blend-modes.ts" (byte-exact, case-sensitive, §3.5)
FINDING source-value-missing  O-000004  "video"  (source: src/types/asset-kind.ts)
  source value "video" in "src/types/asset-kind.ts" is not claimed by the descriptor
FINDING wrong-pointer  O-000008  (source: src/registry/export-formats.ts)
  all 3 claimed value(s) are missing from "src/registry/export-formats.ts" — the file exists and parses (5 value(s) extracted), so the descriptor points at the wrong place
```

### Swift shortcut source agreement — exit 0

```text
validate-values: 1 concept(s) checked, 0 skipped (draft/proposed), 0 findings, 0 hard errors

every enumerates claim agrees with its source (both directions, §3.5 set equality)
```

### Swift planted tool drift — exit 1

```text
validate-values: 1 concept(s) checked, 0 skipped (draft/proposed), 2 findings, 0 hard errors

FINDING source-value-missing  O-000001  "comment"  (source: Sources/Canvas/CanvasTool.swift)
  source value "comment" in "Sources/Canvas/CanvasTool.swift" is not claimed by the descriptor
FINDING value-not-in-source  O-000001  "eyedropper"  (source: Sources/Canvas/CanvasTool.swift)
  claimed value "eyedropper" is not in "Sources/Canvas/CanvasTool.swift" (byte-exact, case-sensitive, §3.5)
```

### Canonical finding creation — exit 0

```text
{
  "file": "logs/findings/2026-09-19-cbbb0001.yaml",
  "status": "open",
  "entry": {
    "schema-version": 2,
    "date": "2026-09-19",
    "status": "open",
    "trigger": "correction",
    "summary": "O-000001 claims eyedropper and omits comment in Sources/Canvas/CanvasTool.swift",
    "consulted": {
      "concepts": [
        "O-000001"
      ]
    },
    "session": "canonical-replay-1"
  }
}
```

### Actual persisted fragment — exit 0

```text
schema-version: 2
date: '2026-09-19'
status: open
trigger: correction
summary: O-000001 claims eyedropper and omits comment in Sources/Canvas/CanvasTool.swift
consulted:
  concepts:
    - O-000001
session: canonical-replay-1
```

The dated reverse audit returned exit 0: 50 candidates, 16 matched anchors and
four advisory findings. Its draft templates contain the placeholder
`proposal:ontology:<lowercase-v4-uuid>`; replace that placeholder with an actual
qualified proposal key before submitting a draft. A draft is not a canonical
allocation or an accepted Decision. New canonical records require the identity publication
bundle and exact reviewed final bytes; never append a dated `D-*` spelling to
the catalog as a substitute for allocation.

The legacy quarantine command using `K-108` was actually rejected at exit 2 by
the finding schema; the current `O-000008` command succeeded at exit 0. Initial
operator attempts also exposed an incorrect helper root and an unsupported
`list` command. Those failures are retained in the handoff; the corrected replay
used fresh scratch roots and read the persisted kit fragment directly.

For a complete current reflection trial, use
[A5-reflection-retrieval-walkthrough.md](A5-reflection-retrieval-walkthrough.md)
and preserve exact proposal hashes, reviews, outcomes, source reads, checks,
findings and heartbeat evidence. This CLI replay does not claim a human gate,
completed work items, publication, or fresh-agent protocol adherence.
