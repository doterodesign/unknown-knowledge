# extractor-fixtures — the D-009 shipped sample/expected pairs

One directory per stack, one directory per extractor kind, each carrying a
`sample.<ext>` anchor and the `EXPECTED.yaml` value set the kind must extract
from it. These are the fixtures `npx unknown-knowledge init` seeds for the
stacks you select (D-009) — they show, runnably, what each kind's syntactic
envelope accepts, and they are the shape the §5.2 new-kind pipeline's DRAFT
step imitates (see `templates/new-kind/`).

Every sample is adversarial-but-extractable on purpose (PRD §5.1): comments
between members, mixed quote styles, trailing commas, nested values — gnarly
formatting that stays inside the envelope. Out-of-envelope shapes (spread,
computed keys, re-exports) are NOT here: those hard-error by design and live
in the kit's acceptance fixtures.

`EXPECTED.yaml` fields: `kind` + `file` + `values`, plus `symbol`/`emit`
where the kind needs them — the same fields the descriptor would carry.
Values are strings compared byte-exact, case-sensitive, as sets (§3.5):
order in the file is presentation only.

Kit CI pins every pair against the registered kind (tests/), so a sample and
its expectation can never rot apart.
