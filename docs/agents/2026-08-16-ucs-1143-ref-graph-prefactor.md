# UCS-1143 — Prefactor: generalize the declarative ref graph for nested typed edges

Date: 2026-08-16
Branch: `ucs-1143-prefactor-generalize-the-declarative-ref-graph-for-nested`
Commit: `3919ab6`
PR: [#51](https://github.com/doterodesign/unknown-knowledge/pull/51) (base `faceted-store-v2`, open, not merged)
Linear: UCS-1143 — https://linear.app/unknown-creatives-studio/issue/UCS-1143

## Goal

Generalize the loader's declarative cross-reference graph (`REF_FIELDS` + generic
collect/resolve in `payload/engine/lib/load-stores.js`) so typed edges at arbitrary
field depth are declared as data. Frontmatter v2's `relates` map (`depends-on` /
`see-also` / `contradicts` / `supersedes`, each an array) needs a third level; the
walker previously destructured a fixed `[head, tail]` pair and handled depth 1–2 only.

Pure behavior-preserving prefactor: no CLI stdout, exit-code, or diagnostic-shape change.

## The shape chosen for declaring arbitrary-depth paths

A `REF_FIELDS` row's `field` is a path of object keys ending at an array of id
strings, spelled as a **dotted string** (`'relates-to.concepts'`), with the **array
form** (`['v1.2', 'refs']`) retained as the escape hatch for a segment containing a
literal dot. Depth is unbounded because the walker descends segments rather than
destructuring a pair.

The declared path doubles as the edge's `type` — a published field on `model.refs`,
quoted in the `unresolved-ref` message — so a finding always names the dotted path an
author would find in their own file. This is why rewriting the existing two-segment
array forms to dotted strings is output-neutral: `['relates-to','concepts']` and
`'relates-to.concepts'` both produce `type: 'relates-to.concepts'`.

## Files changed

- `payload/engine/lib/load-stores.js` — rows carry dotted-string paths; collector split
  into `refEdges(rows, record, origin)` (pure, exported, generic over the declaration at
  any depth) plus a thin `collectRefs` that pushes into the loader ctx; `valueAtPath`
  performs the descent and returns `undefined` at any missing/non-object step so a
  malformed record yields no edges instead of throwing; `resolveRefs` reads the new
  shared `SPACE_TO_STORE` constant instead of its inline copy. `REF_FIELDS` is now
  exported and `Object.freeze`d.
- `tests/load-stores.test.js` — seven tests driving the real walker against a synthetic
  record kind with edges three levels deep (`meta.relates.*`): depth 1–4, dotted-segment
  escape hatch, missing/non-object steps, non-string members, `basePath` composition in a
  multi-record file, and a well-formedness check over the shipped table.
- `tests/ref-graph-declaration.test.js` (new) — the declaration-only proof at the CLI seam.

## How the declaration-only criterion is proven

The new test copies the engine into a sandbox (in-repo, because the copy imports
`js-yaml`, which only resolves under the repo's `node_modules`; the store fixture goes to
`tmpdir()`), adds **exactly one line** to `REF_FIELDS` in that copy (asserted: line count
+1), and runs the unmodified `validate.js` against a store whose leaf carries a dangling
three-level edge. A **control run** uses the same store and engine with only the
declaration withheld.

Important subtlety discovered during implementation: every shipped schema is closed
(`additionalProperties: false`), so a v2-shaped field is rejected as `unknown-property`
before the ref graph ever sees it. Schema legality and edge semantics are therefore
**separate declarations**. The sandbox opens the leaf schema in *both* runs, so the one
ref-field row is the only variable between control and test — which is precisely the
claim. Frontmatter v2 will land its schema change alongside its edges.

Results: control collects no edge and references nothing; declared run fires the existing
`unresolved-ref` diagnostic naming `meta.relates.depends-on[0]`, exiting 2 through the
unchanged loader-error gate (an error-severity loader diagnostic gates the validator —
"structural checks never ran", PRD §5). A third test asserts `payload/` carries no
test-only edge, since a phantom relationship would otherwise ship to every seeded repo.

## Verification

- `npm test` — 608 passing, 0 failing (598 before this branch: 10 new tests, no regressions)
- `npm run lint` — 175 files, 0 failures
- `npm run acceptance` — OK, all asserted criteria (A1–A4, A6) pass
- **Byte-identical CLI output**: captured stdout/stderr/exit code across all 7 loader
  fixture scenarios × 6 engine CLIs × human and `--json`, plus both acceptance fixture apps
  and the repo's own dogfood store, before and after. Every byte matches
  (baseline sha256 `8a7f30390de4af7cfa64738c9d5e72b3fd3fab2f18f121fa31d99874cc31554d`).
- **Mutation check**: reverting the descent to the old shallow `[head, tail]` behavior while
  keeping the export surface fails 5 of the new tests, including the CLI-seam test — so the
  tests genuinely pin the generalization rather than passing vacuously.

## CodeRabbit review round (commit `095fbac`)

Three findings; two accepted as-is, one accepted in substance but fixed differently.

**1. MAJOR — colliding array-form paths. Problem real, proposed fix rejected.**
The collision is genuine: `['a.b','c']` and `['a','b.c']` both join to `'a.b.c'`. The
proposed fix — backslash-escaping dots in each segment before joining — was rejected
because `ref.type` and `ref.path` are **author-facing output**, not internal keys. The
acceptance walkthrough shows the shape a user reads:

```
unresolved-ref  knowledge/product/110.1-....md  cross-references.see-also[1]  cross-references.see-also ref "999.9" does not resolve...
```

That string's job is to be *findable* — the author greps their own YAML for it. An escaped
rendering (`v1\.2.refs[0]`) matches nothing anyone wrote, so escaping would impose a
real, everyday legibility cost on every finding to disambiguate a case that cannot occur
in the shipped table and can only ever be created by two *declarations*.

Fixed instead by refusing the ambiguity at its source: `assertDistinctPaths(table)` runs
as the module loads and throws if two rows of the same record kind render the same path.
Verified the throw exits **2** (engine failure) via the existing entry-shim guard, never 1
(findings) — the load-bearing invariant. Regression test covers both collision forms
(array/array and string/array), plus the two non-collisions (distinct dotted segments;
same rendering under different record kinds).

**2. MINOR — deep freeze. Accepted.** `deepFreezeTable` now freezes the table, each row
array, each row, and any array-form path. Test asserts frozen at every level and that a
write does not land.

**3. MINOR — explicit control-run status. Accepted, and made stronger.** The control could
not assert exit 0 as written, because the healthy fixture's two `source-of-truth` paths do
not exist in a temp store (`missing-path` findings, exit 1). Rather than weaken the
assertion, the harness now creates those anchor paths, so the control genuinely exits 0 and
`assert.equal(before.status, 0, ...)` holds.

Gates after the round: **610 tests passing** (2 new), lint 175/0, acceptance OK.

Byte-identity note: the raw before/after capture showed one line differing —
`survey-map` reporting 351 vs 352 tracked files. That is the repo's own file count changing
because the new test file became tracked, not an engine behavior change. Proven by running
the pre-change engine (`git archive dde5a1a`) and the current engine against the *same*
working tree: all six CLIs byte-identical.

## Notes for later tickets

- Adding a typed edge is now: one `REF_FIELDS` row + the corresponding schema property.
  No collector, resolver, diagnostic, or CLI change.
- `refEdges` is exported specifically so a synthetic record kind can be driven through the
  real walker without a fake edge entering the shipped table.
- Environment quirks confirmed: `/usr/local/bin/git` (2.23.0) shadows Apple's git 2.50.1;
  run test/lint/acceptance with `export PATH="/usr/bin:$PATH"`. `git push`/`gh` need the
  macOS keychain and must run with the sandbox disabled.
- `tests/load-stores.test.js` contains literal NUL bytes inside one template literal
  (the diagnostics sort-key test), which breaks exact-string editing of that line.
