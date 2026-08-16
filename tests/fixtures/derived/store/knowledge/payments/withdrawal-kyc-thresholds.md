---
schema-version: 2
id: L-000162
edition: 1
domain: payments
heading: Withdrawal KYC thresholds
facets:
  domain: payments/withdrawals
  form: constraint
  anchor: world
  stage: verified
operations: [process-withdrawal]
applies:
  jurisdictions: []
verified: "2026-01-05"
volatility: volatile
terms: [withdrawal, kyc]
citations:
  - source: Compliance matrix v7
    accessed: "2026-01-05"
    authority: regulator
provenance:
  author: dimitri
  skill-version: kb-build@2.0.0
---

Cumulative withdrawals above two thousand dollars in a rolling thirty days
trigger enhanced KYC before the payout leaves the platform.
