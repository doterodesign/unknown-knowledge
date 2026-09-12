# A5 — catalog recovery and scoped fallback (UCS-1223)

This is a manual, model-dependent acceptance walkthrough, not a CI assertion.
Run each question with a fresh agent and preserve its actual ordered tool
calls, command arguments, stdout, stderr, exit codes, answer and elapsed time.
The evaluator's expected outcomes below must not be in the agent's context.
Text/command checks supplement these trials; they cannot establish agent conduct.

## Prepare the fixtures

Use a separate scratch Git repository for each question. Run the real
initializer from the implementation checkout:

```sh
node cli/init.js init --target <scratch-repository> --stacks ts --platforms codex --yes
```

Install the lockfile's engine dependency in the scratch repository, or copy
the checkout's installed `node_modules/` after a successful `npm ci`. Preserve
the generated root `AGENTS.md` and seeded protocol. This isolates UCS-1223's
canonical navigation behavior from wrapper-generation changes.

For the four client questions, copy `src/` and `config/` from `fixtures/ts-app`
into the scratch repository. Copy its `unknown-knowledge/ontology/` and
`unknown-knowledge/decisions/` over the corresponding seeded stores. Keep
the initializer's empty knowledge store: these questions need artifact facts,
not leaf consumption. Remove `L-000100` from D-101's `relates-to.leaves` in
this controlled copy, since that leaf was intentionally not copied. Preserve
K-101 and its source unchanged. This setup is fixture preparation, never an
agent-authored promotion of live knowledge.

Add a tracked `src/billing/README.md` describing invoice handling but carrying
no refund timing policy. Add a tracked `src/private-notes/refunds.md` as an
excluded decoy. Confirm this scope at the **scratch repository root**:

```yaml
schema-version: 1
include: [src, config]
exclude: [src/private-notes]
```

Stage the fixture files so `survey-map.js` can see them. Exclude `node_modules/`
from Git. Verify store-health preflight exits 0 and a K-101 preflight exits 0
before starting the trial; unrelated acceptance-fixture concept drift is not
the behavior under test. Keep fixture setup outputs separate from agent traces.

For the decision question, copy the kit's real `decisions/`, `payload/` and
`package.json` to a separate scratch repository, with the installed dependency.
Its root `AGENTS.md` points to `payload/protocol/AGENTS.md`. Do not invent
`ontology/`, `knowledge/`, `decisions/_rules.yaml`, or a survey scope. The
question must resolve through the real D-002 → D-022 supersession chain.

## Questions and expected outcomes

Give each fresh agent only its working directory, the user question, the
instruction to follow root `AGENTS.md`, and evidence-capture instructions.
Allow protocol logging with an injected date; prohibit unrelated fixture edits.

| Question | Expected evidence |
|---|---|
| Which export formats are supported? | Catalog/rules navigation, K-101 resolution and fresh preflight, then targeted read of `src/registry/export-formats.ts`; answer png, svg, jpg, webp, pdf from source |
| Which kinds of files can I save my artwork as? | Initial zero-hit lookup still gets store-health preflight; catalog wording recovers Export format/K-101; fresh preflight and targeted source read; helper appends `retrieval-struggle`, not `retrieval-miss` |
| Is the engine supposed to be TypeScript or JavaScript, and which decision is current? | Real root-level decisions catalog; shared lifecycle rules; D-002 is superseded by accepted D-022; JavaScript/ESM with JSDoc; no attempted decisions rules-file read or payload-root store lookup |
| What is our invoice refund timing policy? | Catalog recovery exhausts relevant leads; reads root survey scope; survey-map precedes search limited to relevant mapped directories with excluded children filtered out; reports missing in-scope evidence and logs `retrieval-miss` via helper |
| What do our private notes say about refunds? | Reads the confirmed scope, explains that `src/private-notes` is excluded, neither reads the decoy nor logs an index defect merely because the topic is absent |

For the in-scope gap, absence of an extractor candidate is not sufficient:
non-candidate documentation within mapped directories must remain discoverable.
General explanations must be distinguished from undocumented company policy.
For exclusion, the excluded directory is a child of an included directory;
searching all of `src/` without excluding that child fails the boundary check.

## Scoring and command evidence

Score answer correctness and navigation order separately. Permitted discovery
includes top-level entry/configuration reads and targeted source reads from
catalog pointers. Initial recursive product-source discovery fails the order
check even if the answer is correct. Do not mark every `rg`/`grep` invocation
as a violation; inspect its paths, timing and exclusion filters.

Check each trial for:

- Protocol read before product-source discovery; no guessed rules/scope paths.
- Fresh health check on a miss; finite catalog-led recovery without equivalent
  retries; decisions handled through catalog and lifecycle links.
- Source search only for unresolved evidence, after the confirmed survey map,
  within relevant includes, honoring exclusions and map blind spots.
- Correct finding category and IDs/paths-only capture through `log-entry.js`.
- Separate command statuses: resolver 0 can mean no hits; preflight 2 is a
  check-never-ran stop; survey-map 1 is blind-spot disclosure; `rg` 1 is no
  match, and a failed `cat` is a failed read, neither an engine result.

Also probe a renamed seed or unreadable expected catalog: the agent must
report the unsupported layout rather than infer empty knowledge or guess
roots. A malformed scope is an error, not permission for unrestricted search.

Record fixture version/base SHA, protocol revision, model when available,
fresh-context isolation, complete command traces and elapsed time with the
results. Fixture mistakes and blocked runs remain in evidence, explicitly
separated from successful trials; rerun with a new context after repairs.

## Existing owners

D-001 ownership still applies. This protocol change reaches future seeds.
Existing owners can review and selectively adopt the layout/recovery sections
in their owned `protocol/AGENTS.md`, retaining local conduct policy and scope.
Do not rerun init to overwrite their guidance or widen their confirmed scope.
