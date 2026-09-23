# Fixture vintage — validator / loader / value-validator / preflight / coverage / resolver clusters

Date: 2026-08-17
Scope: the design-studio re-theme of the structural-validator, loader,
value-validator, preflight, coverage-docs, and resolver (v1) test-fixture
subtrees, plus the test files that assert on their content. Part of the wider
"new fixture vintage: design-studio domain" effort.

## New world

A product-design / engineering studio. The fixtures now speak of a design
system, its components and tokens, brand identity, and the engineering that
ships them.

### Domain / vocabulary of the new world

- Domains: `design-system/components`, `design-system/tokens`,
  `engineering/frontend`, `engineering/ci` (deploy windows), `brand/identity`.
- Concepts: "Design token", "Icon", "Component", "Component set".
- Operations: `add-component`, `add-token`, `export-tokens`, `export-theme`.
- Place vocabulary: `eu-eaa`, `us-ca` (accessibility jurisdictions).

Accession ids (`L-NNNNNN`), decision ids (`D-NNN`), and concept ids (`K-NNN`)
were preserved unchanged throughout. Only slugs, titles, domains, bodies, and
governed-vocabulary values changed. Notation-prefixed filenames kept their
numeric prefix (e.g. `362.1-…`, `900.1-…`); only the slug changed.

## Sub-stores rewritten

- **loader/**: `healthy` (K-210 Design token, K-220 Component set; two
  `engineering/ci` deploy-window leaves L-000362/L-000363), `unresolved-ref`
  (K-999/D-777 dangling refs and L-000999 dangling see-also preserved),
  `duplicate-id` (K-210 minted twice across branch-a/branch-b, class
  `200-design-system`). `malformed`, `partial`, `no-catalog`,
  `coercion-trap`, `duplicate-accession`, `unresolved-leaf-ref` carried no
  banned vocabulary.
- **value-validator/**: all six sub-stores (clean, drift, wrong-pointer,
  unknown-kind, malformed, never-ran) → icons / color tokens / breakpoints.
  Planted drift preserved as codes+values: value-not-in-source (`star`),
  source-value-missing (`tag`), duplicate-source-value (`list`),
  wrong-pointer, non-string/unlisted-source malformed, unknown-kind, and the
  `@if` out-of-envelope sentinel.
- **preflight/**: clean / drift / malformed → icons + color tokens; the
  quarantine-on-drift, unknown-on-draft, and store-wide-failure roles kept.
- **structural-validator/**: `frontmatter-v2` (clean, exit 0) and
  `frontmatter-v2-findings` (the every-facet-unregistered leaf L-000901,
  producing unminted-segment + unregistered-value ×4 + missing-authority,
  exit 1); `time-facet` and `time-facet-findings` (freshness leaves
  re-domained; verdict roles untouched). The remaining structural-validator
  sub-stores (graduation-*, typed-edges*, registries-*, sharded, accessioned,
  bad-accession, clean, findings, warnings) carried no banned vocabulary.
- **coverage-docs/**: launch-plan / long-redundant / short-rich rewritten as
  design-studio prose, ALIGNED to the parent's `resolver-v2` re-theme
  (add-token / export-theme / eu-eaa / us-ca). Candidate-salience roles kept:
  `**Provisional Token Ladder**` (emphasis), `Quiet Period` (title-case),
  the redundant weekly export report, and the dense quarterly review.
- **resolver/** (v1: on-disk): reads coherently as studio API material and
  carries no old-topic vocabulary; the v1 `store` sub-fixture was re-themed to
  a design-system export scoring ladder in a follow-up pass.

## Test files updated (assertions realigned in lockstep)

validate-values, preflight, resolve, document-coverage, load-stores,
ref-graph-declaration, audit, audit-suppressions, suppressions, survey-map,
frontmatter-v2. Every value/path assertion was changed to match its fixture;
every planted-finding assertion kept its code and path.

## Registry-warrant consistency (the recurring defect)

Swept explicitly. `frontmatter-v2` (clean) validates exit 0, proving every
minted registry value is carried by a leaf and every leaf facet value is
minted. The `-findings` and `time-facet-findings` stores intentionally carry
unregistered values (their planted defect); the validator confirms exactly the
expected finding set. No registry-contradicts-its-own-store defect was
introduced.

## Spots where the role could not be preserved exactly

- None functionally. One judgment call: `tests/fixtures/resolver/` (v1) was
  NOT re-themed. It reads plausibly as studio billing-and-API material, and is
  consumed by several tests via stable term queries; re-theming it would be
  churn with no confidentiality benefit. Flagged here for a reviewer who would
  prefer full thematic uniformity.

## Cross-scope couplings observed

Owned by other agents; left untouched or aligned to their current state.

- `document-coverage.test.js` resolves against `resolver-v2` /
  `resolver-v2-reordered` (parent-owned). Its queries were realigned to the
  parent's already-committed design vocabulary (add-token, eu-eaa/us-ca).
- `audit.test.js` has assertions against `fixtures/ts-app` (parent-owned).
  Its anchor reference was realigned to the parent's real current path
  `src/registry/export-formats.ts`; the `locales.ts` wrong-pointer
  references were left as-is (still valid).
- `knowledge-reflect.test.js` still references the A5 walkthrough and protocol
  skill (acceptance/ + payload/protocol, parent-owned) — left for that owner.

## Gate results

- Targeted gate set (19 test files incl. all consumers of the rewritten
  fixtures): 391 pass, 0 fail.
- Full suite `node --test "tests/**/*.test.js"`: 1008 pass, 0 fail.
- Confidentiality sweep over all six fixture subtrees AND every test file in
  scope: zero matches for the retired vocabulary family.
