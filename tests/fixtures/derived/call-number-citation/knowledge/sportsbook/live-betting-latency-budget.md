---
schema-version: 2
id: L-000213
edition: 1
domain: sportsbook
heading: Live-betting latency budget
facets:
  domain: sportsbook/odds-feed
  form: constraint
  anchor: artifact
  stage: draft
operations: [onboard-provider]
applies:
  jurisdictions: []
verified: "2026-07-30"
volatility: volatile
terms: [latency, live betting]
citations:
  - source: Trading team interview 2026-07-30
    accessed: "2026-07-30"
    authority: interview
provenance:
  author: dimitri
  skill-version: kb-build@2.0.0
---

End-to-end ingest to price must stay within four hundred milliseconds, or the
market suspends rather than pricing on data it cannot vouch for.
