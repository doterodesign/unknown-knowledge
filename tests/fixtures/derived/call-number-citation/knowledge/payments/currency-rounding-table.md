---
schema-version: 2
id: L-000228
edition: 1
domain: payments
heading: Currency rounding table
facets:
  domain: payments/fx
  form: reference
  anchor: world
  stage: verified
operations: []
applies:
  jurisdictions: []
verified: "2026-04-01"
volatility: static
terms: [currency, rounding, fx]
citations:
  - source: ISO 4217 minor units
    accessed: "2026-04-01"
    authority: regulator
provenance:
  author: dimitri
  skill-version: kb-build@2.0.0
---

Minor-unit counts vary by currency: JPY has none, so dividing a JPY amount by
one hundred invents a precision the currency does not have.
