---
schema-version: 2
id: L-000162
edition: 1
domain: engineering
heading: Bundle-size budget thresholds
facets:
  domain: engineering/frontend
  form: constraint
  anchor: world
  stage: verified
operations: [ship-frontend]
applies:
  jurisdictions: []
verified: "2026-01-05"
volatility: volatile
terms: [bundle, budget]
citations:
  - source: Perf budget matrix v7
    accessed: "2026-01-05"
    authority: regulator
provenance:
  author: dimitri
  skill-version: kb-build@2.0.0
---

A route bundle above two hundred kilobytes gzipped fails the size budget before it ships,
so a heavy dependency is caught in review rather than in a customer's first paint.
