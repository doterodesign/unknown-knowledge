# A5 — close an organizational evidence gap through cited review (UCS-1225)

This is a fresh-agent behavioral walkthrough, not an automated prompt assertion.
It extends capture → reflect → kb-build → retrieve, using the existing public
CLIs and actual Git commits with the installed hooks. No live company fact is
established. Use only the controlled evidence supplied below.

## Prepare and preserve evidence

Run `npm ci`, then from the kit repository:

```sh
node acceptance/setup-knowledge-gap.js /tmp/a5-knowledge-gap
```

Choose a new directory; setup refuses an existing one. It reuses the clean
frontmatter-v2 fixture's governed component vocabulary, adds a telemetry
interface and inventory that establish no provider/safeguards, sets the survey
boundary to `src` and `docs` (excluding `private`), copies the current engine
and protocol, and commits through executable seeded hooks. It never alters the
original fixture or the saved checkout. Record the kit commit, fixture commit,
model if available, prompts, command outputs, complete answers and elapsed time.
Keep traces outside the fixture so later agents cannot use earlier answers.

Provide fresh agents only the fixture path, its protocol entrypoint, date
`2026-09-10`, and the task below. They must not read this checklist, expected
answers, original evaluations or one another's traces. Do not preload leaf IDs,
alias hints, findings or future evidence. A checklist alone is not a trial.

## 1. Establish the honest gap

Ask a fresh agent:

> Which provider handles our component telemetry, and what safeguards cover
> the data?

- [ ] Agent resolves, preflights and reads pointed sources/catalogs; any fallback
  stays in the confirmed survey scope. It reports both facts unestablished.
- [ ] General explanations, if offered, are clearly general knowledge, never
  company evidence. No vendor or organizational policy is guessed.
- [ ] An in-scope `retrieval-miss` is appended through `log-entry.js`, carrying
  permitted residue/context and consulted IDs/paths, with no verbatim question,
  quoted session content, identifiers or secrets.
- [ ] No leaf, vocabulary or governance mutation is made.

Repeat in two independent fresh sessions with natural requests about the same
provider/safeguard gap. Preserve each resolution event; do not fabricate three
findings from one event. Also ask a separate fresh agent about an excluded
company topic (for example, employee dental coverage). Expected out-of-scope
absence must cause neither excluded-path search nor a taxonomy proposal.

## 2. Recommend the smallest useful work

Run a fresh agent with `protocol/skills/knowledge-reflect.md` over the actual
findings. It may propose, but has no approval to apply store changes.

- [ ] The recommendation names the independent fragment paths and explains
  that evidence is absent, rather than merely a search word missing. It is a
  `knowledge-promotion` handoff to kb-build, never a direct leaf or alias edit.
- [ ] If fewer than three independent events exist, the cluster remains open
  and under-corroborated. Do not manufacture evidence to satisfy the checklist.
- [ ] Expected out-of-scope absence supplies no literary warrant. Rejected
  items retain reasons; recurrences reopen originals instead of duplicating.

## 3. Read evidence and draft through kb-build

Only now introduce `acceptance/fixtures/knowledge-gap/steward-interview.md`
into the fixture at `docs/steward-interview.md`, and commit the supplied source
through the installed hooks. Give a fresh author the kb-build skill and ask it
to document the fixture's provider/safeguards from that source. Approval is for
**drafting only**. The draft must cover the source's limits as well as its claims.

- [ ] The author actually reads the evidence, enters catalog/rules, checks
  existing coverage and registries, and uses a fresh accession.
- [ ] The new leaf cites the local dated interview with accessed date and
  existing `interview` authority; scope/revision notes, provenance, facets,
  catalog row and applicable `concepts`/`paths` relationships resolve. No
  unnecessary leaf-to-leaf edge or new vocabulary is invented.
- [ ] Stage is `draft`; actual `preflight.js --leaves <id> --today 2026-09-10`
  yields `unknown`/exit 2. Structural success is not promotion or source review.
- [ ] An actual commit invokes both installed hooks without bypass.

## 4. Test rejection and explicit controlled approval

Keep the unapproved draft and run its leaf preflight. Record the unknown
verdict. Simulate rejecting the handoff with a reason through `log-entry.js`;
confirm that rejection changes no leaf to verified. Leave a retained rejected
leaf at draft, or withdraw it through the reviewed kb-build change. If reopening,
use the original findings and preserve rejection history. Approval to reconsider
is not approval to publish.

Review the concrete claim-to-source mapping, full draft and catalog/typed edges.
The authorized fixture controller may then explicitly record this limited
outcome: **approve this cited fixture draft and its promotion; no live company
policy or knowledge is approved**. Preserve the record outside the KB. Apply
only the approved change via kb-build; never claim the engine inferred approval.

- [ ] After explicit approval, promote using the existing governed verified
  stage and required metadata; commit through installed hooks.
- [ ] `validate.js` and `validate-values.js` exit 0.
- [ ] `derive.js --write --today 2026-09-10`, followed by `--check` with the same
  date, exits 0. Do not hand-edit generated discovery.
- [ ] Only after the downstream gate and green checks do the helper's original
  proposed findings transition to resolved. Keep rejected history observable.

## 5. Fresh retrieval, with preserved unknowns

Ask a **new** fresh agent the original question, providing only fixture path,
protocol and date, with no accession or source hint.

- [ ] It retrieves the addition through normal navigation, explicitly preflights
  each consulted leaf, reads its body and source, and attributes the answer to
  the accession and dated interview.
- [ ] It identifies the fixture's local in-process recorder, the two permitted
  fields and removal of text/identifiers; it invents no vendor or company policy.
- [ ] The answer preserves the source's limits: production, retention, regional
  deployment and compliance remain unestablished.

Report each stage independently, including failures and retries. A passing
small synthetic fixture demonstrates this path only, not corpus-scale recall,
engine enforcement of human approval, or live organizational correctness.
