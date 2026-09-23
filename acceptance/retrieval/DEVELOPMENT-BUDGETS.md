# Development trial budget — development-1

P10 proposed these limits after the six-organization original-runtime pilot;
P5 reviewed the materializer and raw measurement report and agreed on 2026-09-19.
These are common operational limits for subsequent development comparisons,
not supported production limits, quality/performance targets or a release gate.
This agreement does not prove that a trial host enforces the limits. Verify
delivery accounting and enforcement before starting comparative trials.

| Unit | Per task, per condition, per repetition |
|---|---:|
| Host tool invocations | 60 |
| Individual command/read operations, including inside batches | 60 |
| Unique qualified records whose metadata or body is exposed | 32 |
| Unique qualified records exposed in full | 32 |
| Cumulative source UTF-8 bytes, counting repeat reads | 65536 |
| Cumulative tool-result UTF-8 bytes, including onboarding | 262144 |
| Final-answer UTF-8 bytes | 8192 |
| Selected distinct evidence-bundle records | 10 |

Both tool-invocation and operation limits apply; batching cannot bypass either.
The installed root wrapper, protocol, scope, rules, catalogs, errors and retries
all count when exposed during a trial. Failed attempts do not reset the budget.
Record setup operations separately; any setup content shown to the agent belongs
in its exposure accounting. Request/prompt bytes are reported separately.

Catalog rows, resolver metadata and exclusions count as inspected records,
including unselected records and synthetic support. A bare identity reference
without accompanying record metadata is not a record inspection. Reading a
class file exposes every record it contains. Full-record counts supplement
the total inspected-record count, not replace it. Use installation, kind and
exact ID for uniqueness. Source files/passages also retain installation scope;
identical bytes in disconnected installations do not merge their ownership.

Count the actual delivered UTF-8 content, not JSON transport escaping or an
unseen file's size. Source bytes are already part of tool-result bytes; do not
add them again into a combined total. A whole-source-file read charges every
byte and every exposed passage, even when only one passage is used. Repeated
reads consume bytes and operations again. Track unique source files/passages
and total reads separately. Internal engine I/O is not agent inspection.

Enforce caps before delivery. An oversized result must be refused or truncated
with the exact exposed content recorded; truncation must not silently count as
a complete record or passage inspection. A source locator alone is not evidence
that the passage was read. Unknown delivery visibility makes accounting
incomplete. Preserve exhaustion, refusals and partial runs in results; do not
silently continue, reset, increase limits or turn incomplete runs into successful
trials. Keep actual failed command statuses distinct from empty retrieval.

The ten-record selected evidence bundle is separate from total inspected records.
It can contain actual catalog-recovered evidence, but not an invented combined
rank list. No-answer rank/bundle values remain undefined; their scoped responses
need independent review. Apply identical limits to old/new conditions. Any later
budget change requires a new version and a new comparable run set.

The measured pilot's largest task used 25 recorded command/read operations,
six unique inspected records, five full records, 2826 source bytes and 18285
emitted result bytes. Its table excludes onboarding and exact total delivered
bytes were incomplete after a batched display truncation. Those observations
motivated these finite ceilings; they do not establish end-to-end cost or host
enforcement. The pilot is guided development evidence, not three fresh-agent
repetitions or a paired retrieval improvement.
