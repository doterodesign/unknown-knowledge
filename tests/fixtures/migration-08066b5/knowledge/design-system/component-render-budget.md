---
schema-version: 2
id: L-000213
edition: 1
domain: design-system
heading: Component render budget
facets:
  domain: design-system/components
  form: constraint
  anchor: artifact
  stage: draft
operations: [add-component]
applies:
  jurisdictions: []
verified: "2026-07-30"
volatility: volatile
terms: [latency, render]
citations:
  - source: Platform team interview 2026-07-30
    accessed: "2026-07-30"
    authority: interview
provenance:
  author: dimitri
  skill-version: kb-build@2.0.0
---

First paint of a newly inserted component must stay within four hundred milliseconds, or
the canvas shows a skeleton rather than blocking on a component it cannot vouch for yet.
