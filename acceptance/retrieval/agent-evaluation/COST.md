# Why an answer costs $0.20, and what retrieval costs

Measured on 2026-09-25 on the six public pilot tasks, current runtime, graded by
the evidence-aware `grade.js`. Rows: [cost-2026-09-25.json](cost-2026-09-25.json).

## Retrieval is already free

`ask` is a local, deterministic command. On the pilot tasks it took 46 to 177 ms
and returned about 1 KB (about 250 tokens). It uses no model and costs nothing.
That is cheaper than Jev's re-ranking step ($0.042 per million input tokens,
about 100 ms per call; see [Jev research](../../../docs/agents/2026-09-24-jev-retrieval-research.md)),
because Jev is a model and `ask` is not.

## The cost is the agent session around it

| Path (pilot, current runtime) | Graded correct | Mean cost | Mean time |
| --- | --- | --- | --- |
| Agent session, Sonnet 5 (Claude Code reads `AGENTS.md`, runs the loop) | 6/6 | $0.196 | 49 s |
| One `ask`, then one call, Sonnet 5 | 6/6 | $0.015 | 5.7 s |
| One `ask`, then one call, Haiku 4.5 | 6/6 | $0.006 | 9.3 s |

In the agent session, where the tokens go (Sonnet 5, mean per session):

- About 13 turns. Each turn resends Claude Code's own system prompt and tool
  definitions plus everything read so far: 258k cached input tokens read and
  33k written per session.
- 53 KB of tool output, of which the runtime loop document (`AGENTS.md`, 37 KB,
  read in chunks) is 87%. Records and stores are 3.5 KB, other engine commands
  and sources 2.8 KB, `ask` 1.1 KB.

So about 90% of the cost is the host agent reading the protocol and carrying it
through a dozen turns. Retrieval is about 2% of the bytes and none of the
dollars.

The single-call path skips all of that: code runs `ask`, gathers the returned
records and the source passages they point to (4.4 KB on average), and makes one
model call with no tools and a two-sentence system prompt. With Haiku 4.5 that
is 2.4k input and 0.7k output tokens, $0.006, most of it output. It lands in the
expected $0.004 to $0.04 range with the same 6/6 on these tasks.

## Why it is not Jev's $0.0001

Jev never writes text. It returns a probability over a closed set of options,
priced at $0.042 per million input tokens with free output. Our answer step
writes a cited answer, and a generative model's output tokens dominate its
cost. Matching Jev's price means removing generation from the path: a
classifier-style check that picks which of the returned records answer, or
none, with code composing the reply. Jev itself could be that check over the
eight records `ask` returns.

## What would lower the agent path

1. A short runtime loop. The 37 KB `AGENTS.md` is read every session; a
   compact "ask first" loop of a few KB, with the rest loaded only when a step
   needs it, removes most of the tool output.
2. An engine command that returns what the single-call path assembles: the
   records `ask` found plus the source passages they cite, in one bounded
   output. The host reads one result instead of opening files turn by turn.
3. A classifier gate for the answer check (Jev or a small model constrained to
   a closed choice) where a generated answer is not needed.

## Limits

- Six public pilot tasks, one run per path and model. The single-call path has
  not been run on the held-out cases.
- The single call's time includes about 3 to 5 s of Claude Code CLI start-up;
  a direct API call would be faster. Its cost excludes nothing: the CLI
  reports the actual charge.
- Pilot stores are small (4 to 6 records). At 100k records `ask` is about 14 s
  cold from the CLI and under 300 ms warm through the MCP server.
