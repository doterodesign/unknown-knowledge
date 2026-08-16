---
schema-version: 2
id: L-000133
edition: 1
domain: sportsbook
heading: Banker's rounding at settlement
facets:
  domain: sportsbook/odds-feed
  form: constraint
  anchor: world
  stage: verified
operations: [settle-bet]
applies:
  jurisdictions: []
verified: "2026-07-20"
volatility: stable
terms: [settlement, rounding]
citations:
  - source: Regulator handbook §12
    accessed: "2026-07-20"
    authority: regulator
provenance:
  author: dimitri
  skill-version: kb-build@2.0.0
---

Round half to even at settlement, never at ingest. Raw precision travels all
the way to the settlement step, where one rounding is applied once.
