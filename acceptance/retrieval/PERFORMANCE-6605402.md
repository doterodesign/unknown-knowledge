# Performance measurements at 6605402

Status: all 25 corrected observations completed. Both CLI conditions and the
joint loaded query meet their named targets. The near-byte loaded query refuses;
complete context enumeration remains unqualified.
The measured runtime is `6605402662f82a9b7b903529e2d1b9f53c716c5f`.
Subsequent integration changes through `4007414` affect tests and documentation.
The [prospective targets](QUALITY-TARGETS.md) and all fixture/query/operation
capacities remain unchanged.

## Machine and boundaries

Observed machine: Apple M4 Pro, fourteen logical CPUs, Darwin 25.4.0 arm64,
macOS 26.4.1 and Node 24.19.0, connected to AC power. Thermal-status queries
were unavailable. No main full-suite or reader workload runs concurrently;
unrelated operating-system activity is not controlled.

Five observations were recorded for each of five conditions: joint-corpus CLI,
near-byte-boundary CLI, the corresponding two loaded-context queries, and an
engineering context-count request. Each uses a fresh serial process and the
prebuilt fixture. This is not an OS-cache-cold measurement; custody checks read
files outside the timed process. There is no fixture generation or extra query
warm-up within an observation.

CLI wall time includes process startup, imports, loading, evaluation, output and
exit. Darwin `time` supplies the final maximum resident set size in bytes;
report MiB by dividing by 1,048,576. Separate API brackets measure input,
loading, operation and delivery; the operation bracket excludes loading. A
returned function is not necessarily a completed query. Refusal latency cannot
qualify successful query performance, and expected partial context enumeration
cannot qualify complete enumeration.

The CLI's private file composition and the public loaded-context operation are
distinct paths with the same fixed capacities. Earlier private-path success
does not establish that the exposed path fits those capacities. Preserve both
outcomes rather than reset an allowance or raise a limit to make them agree.

## Interrupted measurement phase

The original phase stopped at an operator-requested safe boundary after fourteen
terminal attempts; eleven slots were never started. All 28 before/after custody
checks passed. Darwin `time -l` could not read `kern.clockrate` inside the sandbox:
each wrapper exited 1, obscuring the native child exit and withholding memory
statistics. Native outputs and partial timing text remain retained. These are
instrumentation failures, not fourteen product-query failures or valid memory
observations.

Interruption receipt SHA256:
`e0b62e763da84084d3778b174b70ffdfc9942b05f41707812a1da79da3cc482a`.
Retained result manifest SHA256:
`91f2c75eba8e5a628e106683dcfdb6338beb8da9ce64af743f9f59dce0a3758c`.

## Corrected measurement phase

A separately approved no-op instrumentation check succeeded with the required
execution permissions, exit 0 and a valid memory field. It made no product call
and is not a benchmark sample. The corrected phase uses a new results directory
and those permissions. Main independently normalized all 25 commands back to
the originals after removing only output paths, permission mode and phase labels;
runtime, fixtures, inputs, limits, environment, working directory, controller and
order are unchanged. All 4,121 checked file references and modes matched.

Corrected preparation seal SHA256:
`a0befe14a0d7e40af001464fa341966dca263d60d5335e733e7a710ccb4e8fb5`.
Execution release SHA256:
`900e2354945272808a01264d89f36723776a5dfb9640e7ccc05ed8b6cad7b888`.
All 25 corrected slots executed once: fifteen native exits 0 and ten exits 2,
with no instrumentation errors or retries. All fifty custody checks passed.
There were 39 total attempts: fourteen failed instrumentation attempts plus
25 corrected observations. The original eleven unattempted slots remain unrun.

## Results and limits

| Condition | Five observations, milliseconds | Median / maximum | Outcome |
| --- | --- | --- | --- |
| Joint CLI | 720, 570, 570, 580, 580 | 580 / 720 | Five complete requested pages; latency passes |
| Near-byte CLI | 640, 620, 620, 640, 630 | 630 / 640 | Five complete requested pages; latency passes |
| Joint loaded query | 133.796, 130.940, 129.825, 135.318, 135.173 | 133.796 / 135.318 | Five complete requested pages; operation latency passes |
| Near-byte loaded query | 5.811, 6.016, 5.391, 5.938, 7.098 | 5.938 / 7.098 | Five budget refusals; successful-query performance unqualified |
| Engineering context | 21.584, 20.746, 21.481, 20.861, 23.072 | 21.481 / 23.072 | Five expected partial results; complete enumeration unqualified |

CLI thresholds are median <= 2,000 ms and every observation <= 5,000 ms;
loaded-query thresholds are <= 500 and <= 2,000 ms respectively. The partial
context meets the numeric <= 1,000 / <= 3,000 ms thresholds only for its actual
partial operation. API values above exclude loading; the raw report separates
input, load, operation, delivery and full-child timings.

| CLI condition | Five peak resident sizes, MiB | Maximum | Threshold |
| --- | --- | --- | --- |
| Joint | 392.781250, 385.859375, 387.593750, 388.390625, 394.406250 | 394.406250 | <= 512: passes |
| Near-byte | 475.187500, 484.687500, 471.718750, 482.937500, 480.703125 | 484.687500 | <= 512: passes |

All fifteen complete query outputs exactly match the previously source-validated
expected bytes: ten requested rows per K/O/D store, strict counts of 21 each,
zero possible/unevaluated, complete evaluation/ranking/explanations and a
truncated page. This establishes complete requested pages, not delivery of every
strict record. Both existing missing-rules warnings remain.

All five context outputs likewise match their retained expectation: three
unknown assignments, seven complete known candidate counts, twelve selected
and validated records, eight internal query calls and zero unreported records.
The near-byte exposed operation instead fails `documentTextUnits` admission at
`corpus-entry`: attempted 16,384 units with 3,086 remaining. Private CLI success
does not close this public loaded-path capacity gap. No capacity was increased
and no allowance reset to change the result.

Independent source/spec review confirms that public mutable contexts require
full corpus re-admission, while the private file composition can avoid a second
pass during its unchanged lexical lifetime. The refusal follows that documented
contract; it is a failed qualification for this particular exposed workload,
not evidence of an incorrect query answer. The supported profiles must remain
explicit. See the [composition Decision](../../decisions/entries/fixed-file-subject-query-composition.yaml)
and [public query contract](../../docs/agents/ucs-1237-subject-query.md).

Main independently verified all 194 manifest files, fifty custody receipts,
25 native exits/output hashes/memory readings, fifteen query-output byte matches
and five context-output byte matches. No product call was made during review.
Results SHA256:
`b357566132f45ec3fa0bfc1ab799932ffbfec9821ebde8b3d52ba4ca1c4a2a52`.
Receipt manifest SHA256:
`813f3e09121e940c186f0a06db56ead1c014efaebd7fb06a0bd3e16e72bda8a6`.

Raw artifacts are retained in the integration visualization's
`performance-6605402-preparation-v1`, `-v2`, and corresponding `results-v1` and
`results-v2` directories. These five-observation results establish no percentile,
whole-corpus delivery, arbitrary-scale guarantee or agent-quality improvement.
