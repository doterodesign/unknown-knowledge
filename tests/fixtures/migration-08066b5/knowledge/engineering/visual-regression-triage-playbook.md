---
schema-version: 2
id: L-000171
edition: 1
domain: engineering
heading: Visual regression triage playbook
facets:
  domain: engineering/frontend
  form: runbook
  anchor: team
  stage: draft
operations: [ship-frontend]
applies:
  jurisdictions: []
verified: "2026-03-15"
volatility: volatile
terms: [regression, triage]
citations:
  - source: Chromatic triage guide 2026-03
    accessed: "2026-03-15"
    authority: vendor-doc
provenance:
  author: dimitri
  skill-version: kb-build@2.0.0
---

Triage within seven days of a failing snapshot with the diff pack. A regression left
unreviewed blocks the release train regardless of severity, so the clock governs first.
