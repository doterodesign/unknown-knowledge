---
schema-version: 2
id: L-000117
edition: 1
domain: design-system
heading: Icon component sizing quirks
facets:
  domain: design-system/components
  form: reference
  anchor: world
  stage: verified
operations: [add-component]
applies:
  jurisdictions: []
verified: "2026-08-01"
volatility: volatile
terms: [icon, component]
citations:
  - source: Component Kit API v3 §4.2
    accessed: "2026-08-01"
    authority: vendor-doc
provenance:
  author: dimitri
  skill-version: kb-build@2.0.0
---

Icons ship on a 24px grid, but the export step trims the transparent bounding box,
so a nominally 24px glyph can render at 22px unless the artboard is locked to full bleed.
