# Retained material in read-only retrieval

The [reconsideration Decision](../../decisions/entries/suppressed-subject-reconsideration.yaml)
requires ordinary retrieval to preserve the evidence needed by the
[history/model validator](ucs-1235-subject-reconsideration-creation.md).
Material transport supplies those bytes to the existing governance evaluator;
it does not add a second approval or query engine.

For writes, the separate [ordinary assignment continuation](ucs-1241-assignment-continuation.md)
now supplies retained evidence to actual staged/prepared owners and fresh
review/publication. These query flags do not configure that internal operation.
Retirement material continuation is implemented with verification recorded in
the separate contract below. Later merge, split and typed-promotion evidence
propagation remains required; the read-only receipts here do not certify those
paths.
Their agreed [lifecycle continuation contract](lifecycle-material-continuation.md)
preserves one evidence admission and distinguishes internal inventory support
from the still unsupported standalone material inventory.

## Inputs

| Consumer | Retained evidence inputs |
| --- | --- |
| `loadSubjectQueryContext` | `decisionCaptures`, `assessmentCaptures`, `materialCaptures` |
| `querySubjectFiles` | Optional `decisionCapturesFile`, `assessmentCapturesFile`, `materialCapturesFile` |
| `query-subjects.js` | `--decision-captures`, `--assessment-captures`, `--material-captures` |
| `intent-plan.js` query validation/execution | The same three capture-file flags |
| `subject-view.js` route/context modes | The same three capture-file flags |

Each material file is an explicit JSON array of
`{capture, bytesBase64, objectFormat}` rows. `decodeMaterialCaptures` uses the
existing private byte-decoding mechanics and returns
`{capture, bytes: Buffer, objectFormat}` rows. It checks transport shape and
canonical base64; governance verifies actual byte integrity and cited membership.
Assessment files remain arrays of `{registry, identity}` pairs, each part using
the same byte transport. Decision and assessment decoder contracts are unchanged.

For a reconsidered Subject, supply its retained original assessment pair,
historical Decision captures and cited material. Current files or a digest cannot
replace missing historical bytes. Multiple citations may refer to one captured
file. The decoder preserves separately supplied rows; it does not deduplicate
them or decide whether the material is relevant. Governance rejects duplicate or
unrelated material captures under its existing rules.

```sh
node payload/engine/query-subjects.js --root /path/to/repo \
  --query query.json --decision-captures decisions.json \
  --assessment-captures assessments.json --material-captures material.json --json
```

In a copied kit, use that kit's `engine/` path. File paths resolve from the
invoking working directory. Query budgets and any optional host-operation limits
remain explicit; the capture flags do not supply default capacity.

## Admission and accounting

The new material decoder validates its supplied operation before inspecting
transport data. Its material-only shape checks require dense ordinary arrays,
own enumerable data fields and closed capture locators; getters and custom array
iteration are not used to read those inputs. This is not a guarantee against
arbitrary Proxy traps or a new guarantee for older decoders.
Only an omitted loader material field defaults to an empty list; explicit
undefined/null, inherited fields and accessor fields refuse. The new decoder
also distinguishes an omitted operation option from an explicitly invalid one.

Decoded captures pass unchanged through loader admission and governance on the
same authentic operation. The existing allowance can reuse an unchanged admitted
object. Separately decoded wrappers consume separate raw-byte capacity, even when
their contents happen to match. Exact base64-derived size is reserved before
Buffer allocation. Source-file bytes, document work, corpus admission and output
retain their separate limits. This does not make native JSON/YAML parsing or all
CPU/memory use mechanically bounded.

Bounded raw-loader input first reserves its logical row population under
`material-context-rows`, then guards each `{capture,objectFormat}` projection
under `material-context-metadata`. Buffer contents use raw-byte admission rather
than the JSON document visitor. Even zero-byte captures require metadata work.
Invalid material consumes the context-loading attempt; a second call cannot
restart that operation or admit more material before the existing reuse refusal.
An absent CLI material flag skips decoding a synthetic empty transport. Explicit
empty transport files remain real inputs and receive normal validation.

The file-query API keeps its closed primitive input boundary and accepts no
caller-supplied model, executor or skip flag. Context loading still admits one
captured context per operation. Material shape/base64 refusals use
`invalid-material-captures`; operation/document failures retain their own
boundaries. Malformed query material JSON has the separate
`invalid-material-captures-json` code. Each CLI retains its existing usage-error
and output conventions rather than inventing a universal failure envelope.

## Meaning and mode boundaries

Missing relevant evidence leaves that Subject unavailable. It is not an empty
match, approval, or a reason to invert an unavailable predicate under `NOT`.
Missing evidence solely for an unrelated historical Subject does not establish
a global veto. Read the actual per-Subject and per-branch outcomes; context
enumeration can report incomplete work under its existing rules.
Every selected record still receives the existing assignment validation. If a
record is assigned both an available and an unavailable Subject, querying the
available one does not waive the unavailable assignment. That refusal concerns
the selected record; it is not a veto from unrelated registry history.

Intent structural/inspection modes reject query capture flags. View tree mode
also rejects those flags and remains evidence-independent; route/context modes
need assessment captures as well as material. Supplying material alone cannot
verify the original reconsideration scope. Request and result envelopes retain
their existing shapes.

These inputs establish byte transport into the existing verifier. They do not
fetch Git/source history, authenticate reviewers, parse a selected record from
arbitrary material, judge novelty or grant publication authority. The separate
ordinary assignment continuation, impact/replay gate and reconsideration
[retained publication profile](ucs-1240-reconsideration-publication.md) now supply
their own proofs. The [shared API/CLI/MCP interface](../../payload/protocol/engine-interface.md)
exposes read-only retrieval and contextual navigation. Later lifecycle and
typed-promotion material propagation remain required work. The
[actual-Git owner](ucs-1235-reconsideration-git-core.md)
provides supplied-capture provenance and stored-owner preservation through its
fixed internal entrypoint; these query consumers do not perform those checks.

## Verification

The owners exercise actual reconsidered Subjects through query, intent and view
paths with literal `K-000001` membership, exact context counts, root/nested
layouts and both Git object formats. The consumer fixture adds its own literal
Knowledge corpus while retaining the original evidence pair; it is a read-only
consumer fixture, not an exact lifecycle publication delta.

- Query transport initially passed its actual model/control and failed the two
  missing decoder/CLI cases: **1/3**, 905.8175ms, exit 1,
  `local-history:unknown-knowledge-reconsideration-consumer-red.log`.
- Targeted loader lifetime/raw admission tests failed **0/4**, 1126.58825ms,
  session 82635, exit 1; their corrections preserve the one-attempt rule and
  meter zero-byte capture metadata. An intermediate **11/14** run also exposed
  inherited-material admission and a bounded shape-error mismatch; a missing
  test import was corrected separately. The final query owner run passed
  **18/18**, 5716.025917ms, session 56215, exit 0,
  `local-history:unknown-knowledge-reconsideration-consumer-expanded-green.log`.
- Intent/view tests initially failed **0/14** on unknown flags, 2694.282375ms,
  session 22771, exit 1. Later expected-result assertions were corrected for
  coassigned unavailable Subjects and branch-local diagnostics; assignment
  policy was not weakened. The final run passed **28/28** (17 new cases plus
  11 existing intent-operation cases), 7060.864417ms, session 76512, exit 0,
  `local-history:unknown-knowledge-reconsideration-intent-view-omission-green.log`.
  Its exact node checks distinguish omitted material from an explicitly supplied
  empty file, which requires two additional parsed/transport document nodes.
- Main's 26-file integration passed **226/226**, 11692.91925ms, session 10815,
  exit 0, covering all new tests plus existing query/context/budget, intent,
  route/view and protocol/documentation checks. The nine production/helper/test
  hashes remained unchanged. Logs and hashes use
  `local-history:unknown-knowledge-reconsideration-consumers-`.
- Initialization-copy and wrapper checks passed **35/35**, 1893.776833ms,
  session 12154, exit 0. Lint checked **557 files with zero failures**; automated
  A1–A4/A6 passed. A5 remains manual. These installation checks do not establish
  supported MCP delivery or whole-goal acceptance.

These focused receipts overlap; their counts must not be added as unique tests.
No full-suite, new operational qualification, actual publication or customer
migration is claimed.
