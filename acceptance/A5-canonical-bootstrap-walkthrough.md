# A5 — canonical bootstrap and publication boundary

This is a current manual acceptance checklist. Record actual command outputs,
exit codes, candidate commit, model/runner, human review, and elapsed time.
The [July trace](A5-knowledge-bootstrap-walkthrough.md) remains historical;
its outputs do not establish a pass on the canonical runtime.

## Prepare a new installation

From the implementation checkout, with its dependencies installed:

```sh
TRIAL=$(mktemp -d)
cp -R fixtures/swift-app/Sources fixtures/swift-app/Config fixtures/swift-app/Resources "$TRIAL/"
git -C "$TRIAL" init -q
node cli/init.js init --yes --target "$TRIAL" --stacks swift --platforms codex
cp -R node_modules "$TRIAL/node_modules"
printf 'node_modules/\n' > "$TRIAL/.gitignore"
git -C "$TRIAL" add .
```

Use the real initializer: it creates a fresh installation namespace and empty
ledger. Do not copy populated Swift fixture stores into this bootstrap trial.
Give a fresh agent the generated entry instructions and bootstrap task, without
this evaluator checklist. Preserve the entire agent trace.

## SURVEY and GATE

```sh
node "$TRIAL/unknown-knowledge/engine/survey-map.js" --root "$TRIAL"
```

- [ ] The agent triages the actual map before product-source discovery. Capture
  the current map; do not expect the old trace's file or candidate counts after
  a full initializer run.
- [ ] One combined scope/taxonomy review proposes `Config`, `Resources`, and
  `Sources`, excluding the kit and dependencies. Record the human's response.
- [ ] Confirmed `survey-scope.yaml` is at the repository root. The ontology
  class rules use classification metadata, for example `{ class: 100-canvas }`.
  No class owns an ID range.
- [ ] A resumed session retains confirmed scope. Approval of that scope is
  not approval of a later publication candidate.

Rerun the map and confirm it names the actual scope file:

```sh
node "$TRIAL/unknown-knowledge/engine/survey-map.js" --json --root "$TRIAL"
```

## EMIT and validate proposals

Before each new anchor, check existing coverage:

```sh
node "$TRIAL/unknown-knowledge/engine/resolve.js" --paths Sources/Canvas/CanvasTool.swift,Sources/Payments/Providers.swift --root "$TRIAL"
```

- [ ] Read the actual source before drafting. A folder concept points to
  `Sources/Canvas`; enum concepts point to `Sources/Canvas/CanvasTool.swift`.
- [ ] Draft a small batch, with exact `proposal:ontology:<lowercase-v4-uuid>`
  keys, `status: draft` or `proposed`, and version-2 envelopes and catalogs.
  Use the same proposal key in its catalog row and any same-kind draft refs.
- [ ] Keep each draft visible on resume. Do not create a second concept for an
  anchor already covered by a draft; do not switch its lifecycle to active to
  make a check run. Do not synthesize a fresh verification date.
- [ ] `_identity.yaml` has no new allocation merely because drafts exist.

```sh
node "$TRIAL/unknown-knowledge/engine/validate.js" --root "$TRIAL"
node "$TRIAL/unknown-knowledge/engine/validate-values.js" --root "$TRIAL"
```

Structural validation may be clean while value validation reports all proposed
concepts skipped. Record both results. This is draft validity, not evidence that
value checks ran, and not a completed bootstrap. Preflight of a proposed record
remains unknown; exit 2 stops governed use.

## MISS and INTERVIEW

The computed array in `Sources/Payments/Providers.swift` remains outside the
shipped extractor's envelope. If no open fragment already records that anchor,
use the logging helper with an injected date:

```sh
node "$TRIAL/unknown-knowledge/engine/log-entry.js" create --log misses --date 2026-07-08 --root "$TRIAL/unknown-knowledge" --entry '{"path":"Sources/Payments/Providers.swift","shape":"computed Swift array; concatenation is outside the shipped literal-array extractor envelope"}'
```

- [ ] Record the fragment path and exit code; do not duplicate an open miss or
  author and wire a parser in this session.
- [ ] The human supplies the knowledge domain/division skeleton. No cited
  Knowledge leaf is created or promoted by bootstrap.
- [ ] Draft the taxonomy/scope Decision with a qualified `proposal:decision:`
  key and `status: proposed`, a version-2 envelope/catalog, and exact refs.
  Its filename is a locator, not its identity. It consumes no permanent slot.

## Publication and FINISH

Review the exact candidate through the supported publication workflow before
active use. It must allocate permanent identities from this installation's
ledger and rewrite the reviewed proposal references together. Identity
allocation alone does not verify source claims or authorize lifecycle changes.
Do not repurpose a fixture allocator script as a production publisher.

If the reviewed runtime has no supported publication path, record this trial as
**incomplete at publication**, retaining valid drafts. Do not hand-edit the
ledger, invent a publication command, or mark this checklist passed.

Once publication succeeds, retain its actual receipt and run the validators
against the published state:

```sh
node "$TRIAL/unknown-knowledge/engine/validate.js" --root "$TRIAL"
node "$TRIAL/unknown-knowledge/engine/validate-values.js" --root "$TRIAL"
```

- [ ] Every intended active concept was actually checked; none was silently
  omitted or left in the skipped count. A planted value absent from source
  yields the expected finding, and re-reading/correcting the descriptor clears
  it without changing source merely to satisfy the claim.
- [ ] The ledger retains its installation namespace and occupied allocations.
  The proposed Decision stays proposed unless separately reviewed for acceptance.
- [ ] Only a clean published batch, fresh checks, and the recorded human gates
  complete this trial. Static command checks do not establish agent conduct.
