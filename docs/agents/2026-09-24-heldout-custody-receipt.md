# Held-out custody receipt: heldout-v1-reviewed (UCS-1581)

Blinded receipt only. It contains no prompts, expected answers, passages or
judgments.

- Sealed: six held-out evaluation cases, one per organization, on the
  development-v2 corpus. The custody notes and the review record are sealed
  with them.
- Created: 2026-09-24, by the independent custodian agent.
- Independently reviewed: 2026-09-24, by a separate reviewer agent (neither the
  custodian nor the engine tuner). The reviewer checked entailment, novelty
  against the 54 existing questions and their gold evidence, and answerability
  from stores and sources. Result: 3 cases accepted, 3 revised. Set version:
  `heldout-v1-reviewed`.
- Custody location (outside this repository):
  `/Users/dimitriotero/Documents/GITHUB/unknown-knowledge-heldout-custody/v1/`
  (`cases.json`, `CUSTODY.md`, `REVIEW.md`, `RECEIPT.json`).
- Anyone who tuned the retrieval engine must not open that directory before
  the comparative runs are frozen.

## Cases

| id | organization | installations | answerable |
| --- | --- | --- | --- |
| heldout-engineering-01 | engineering | engineering | true |
| heldout-cultural-research-01 | cultural-research | cultural-research | false |
| heldout-policy-01 | policy | policy | true |
| heldout-manufacturing-01 | manufacturing | manufacturing | false |
| heldout-professional-services-01 | professional-services | professional-services | false |
| heldout-holding-company-01 | holding-company | cedar-north, cedar-south, cedar-holding | true |

3 answerable, 3 scoped negatives.

## File hashes (SHA-256)

| file | bytes | sha256 |
| --- | --- | --- |
| cases.json | 29561 | 0f14751edf01711c392336a17697733a621a6121ed7ddb3f845afdb913987713 |
| CUSTODY.md | 5042 | 93975f1d7ec733fb502fb6410f97cc93ed2e20c4960a0b83b140e3654297e4a5 |
| REVIEW.md | 11714 | b98db08a824b7cdc6d1758b4136b5a60a76d1aa5e1258c5047e3ad2c00fa28fb |
| RECEIPT.json | 1746 | 848e0b3421c0642eb5879614cd4f5701721ac15513292cf0beb81158c02b25d8 |

To verify, run `shasum -a 256` on the files in the custody directory.
