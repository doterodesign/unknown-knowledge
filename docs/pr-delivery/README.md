# Draft PR delivery

> Packaging stage 6/7, version `3.0.0-rc.7`. This stacked prerelease is for review and new-installation development. No release or customer migration is authorized.

| PR | Version | Scope | Availability |
| --- | --- | --- | --- |
| 1 | 3.0.0-rc.2 | Canonical identity and store cutover | Present |
| 2 | 3.0.0-rc.3 | Governed retrieval, intent and derived views | Present |
| 3 | 3.0.0-rc.4 | Lifecycle and assignment domain proofs | Present |
| 4 | 3.0.0-rc.5 | Reviewed migration and publication | Present |
| 5 | 3.0.0-rc.6 | Reflection and evidence conduct | Present |
| 6 | 3.0.0-rc.7 | Shared API, request CLI and local MCP | Present |
| 7 | 3.0.0-rc.8 | Evaluation and portable final review | Later PR |

Reference implementation: `2491646386ee88d48891a3ed92845f1066bd59f7`, base `08066b5f527b9d7d9705a3367bc26dcf080271ad`.

Each PR depends on the previous PR; merge order follows the table. Decisions remain proposed under their original keys. Historical test receipts apply only to their pinned trees. Intermediate checks are recorded per PR.
