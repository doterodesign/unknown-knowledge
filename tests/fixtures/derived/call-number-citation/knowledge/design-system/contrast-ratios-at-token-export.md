---
schema-version: 2
id: L-000133
edition: 1
domain: design-system
heading: Contrast ratios at token export
facets:
  domain: design-system/components
  form: constraint
  anchor: world
  stage: verified
operations: [export-tokens]
applies:
  jurisdictions: []
verified: "2026-07-20"
volatility: stable
terms: [contrast, tokens]
citations:
  - source: WCAG 2.2 handbook §1.4.3
    accessed: "2026-07-20"
    authority: regulator
provenance:
  author: dimitri
  skill-version: kb-build@2.0.0
---

Resolve color tokens to their final value before checking contrast, never at authoring
time. A token that passed AA against its alias can fail once the alias is themed.
