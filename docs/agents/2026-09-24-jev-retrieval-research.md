# Jev (TypeSafe AI): research for deterministic KB retrieval design

Date: 2026-09-24. Sources: docs.typesafe.ai (fetched as Mintlify `.md` pages via
`https://docs.typesafe.ai/llms.txt`), and the English auto-captions of two YouTube
videos (captured from the page's own caption request in a browser; the transcript
API refused unauthenticated access).

Labels used below:

- **[V]** verified in the cited source (quotes kept under 15 words).
- **[V-video]** stated in a video by a third party (not TypeSafe). Treat as a claim, not a fact.
- **[I]** my inference or recommendation. Not stated by any source.

All page content was treated as data. No sign-in, form submission or executable
download happened.

## 0. Headline finding

**Jev is not a retrieval system.** It is a hosted, non-generative *decision model*
(TypeSafe calls it a "System One" model). It answers typed questions (Choice, Score,
Noul) about a caller-supplied `state` and returns probabilities. It has no index,
corpus, record store, embedding store, or query planner. Retrieval shows up only in
cookbooks, where Jev is the **re-ranker / verifier / abstention gate** placed after a
conventional fast search (BM25 or embeddings) or over a closed list of IDs.
[V] https://docs.typesafe.ai/introduction, https://docs.typesafe.ai/concepts/system-one,
https://docs.typesafe.ai/cookbooks/rerank_typesafe

So the useful ideas for your system are about the **bounded model role**: a closed
answer space, calibrated probabilities, a separate "does any answer exist" check,
confidence-gated fallback to a coarser level, and fan-out of atomic questions in one
call. They are not about indexing.

## 1. Problem and mental model

- **Problem.** LLMs produce text for humans. Software that needs a judgment has to
  coerce text into structure and parse it back. Jev returns typed values plus
  probability distributions directly, with "No text generation, no parsing." [V]
  https://docs.typesafe.ai/introduction
- **System One.** Named after Kahneman's fast, intuitive System 1. It is meant for
  "fast, focused judgments," the kind "a highly knowledgeable person could make in a
  few seconds". It is not for multi-step reasoning. [V]
  https://docs.typesafe.ai/concepts/system-one, https://docs.typesafe.ai/introduction
- **Code owns control flow.** The recommended architecture is "AI-powered software":
  code handles deterministic work and side effects, and the model appears only where
  "programmable common sense" is needed. They explicitly contrast this with agent
  loops. [V] https://docs.typesafe.ai/concepts/how-to-build-with-system-one
- **Training.** RLCD ("reinforcement learning for calibrated decisions") is presented as
  a third post-training path alongside RLHF and RLVR. It targets calibrated probabilities
  over a constrained output, not preferred text. [V]
  https://docs.typesafe.ai/introduction/machine-learning-primer
- **Is it deterministic?** No. It is *highly self-consistent*, but it is not
  bit-deterministic:
  - One 14-Noul rubric run 15 times had a mean per-question std dev of **0.0102**. One
    answer ranged 0.43–0.53, crossing a 0.5 threshold. [V]
    https://docs.typesafe.ai/cookbooks/consistency_noul_cookbook
  - In a 13-question batch, most answers had std dev exactly 0.0 over 5 repeats, and two
    carried a little noise. [V] https://docs.typesafe.ai/cookbooks/parallel_questions
  - Aliases (`jev-latest`) move between versions, so answers can change without any
    change on your side. Pin a versioned ID if thresholds are tuned. [V]
    https://docs.typesafe.ai/models
- **Third-party framing.** Nate B Jones calls Jev a "general purpose classifier" and the
  work "semideterministic": the judgment stays probabilistic, but the outputs are a
  closed set that code acts on. [V-video] https://www.youtube.com/watch?v=tYugqJ9YytQ
  (~4:39–5:41, 12:19)

## 2. Knowledge representation and query → retrieval mapping

- **No knowledge store.** You bring your records in the request `state`: a string, a
  JSON object, or an array of text. Jev "is not fine-tuned or LoRA-adapted with customer
  data". Domain knowledge goes in `state` and in the question `instructions`/`criteria`.
  [V] https://docs.typesafe.ai/models, https://docs.typesafe.ai/concepts/state
  - The docs advise against relying on model-weight knowledge "when current information
    can come from your own knowledge base". [V]
    https://docs.typesafe.ai/concepts/how-to-build-with-system-one
- **Types = question primitives.** [V] https://docs.typesafe.ai/api
  - `choice`: pick one option from a map of option → description. Max 255 options,
    "reliably up to roughly 240". Returns `choice`, `probabilities` (summing to 1) and
    `confidence`. https://docs.typesafe.ai/primitives/choice,
    https://docs.typesafe.ai/cookbooks/classification_using_confidence
  - `score`: 2–10 ordered levels. Returns a probability-weighted `score`, a `legend`,
    `probabilities` and `confidence`.
  - `noul`: a yes/no question. Returns P(yes) in [0,1], with **no** confidence field.
  - Question IDs are map keys that are "not sent to the model", so the full question must
    be in `instructions`. [V] https://docs.typesafe.ai/primitives
- **Structured references.** Questions can point at nested state with backticked paths
  such as `` `support.tickets[0].message` ``, and `instructions` can itself be an object
  (question + data fields). [V]
  https://docs.typesafe.ai/concepts/how-to-build-with-system-one,
  https://docs.typesafe.ai/api
- **Where the model sits in retrieval (cookbooks).** [V]
  1. *Re-ranking.*
     - BM25 builds a 30-candidate shortlist (recall was 100% for all 40 queries). Then
       one Noul per query–candidate pair scores the pair, and code sorts by the noul.
     - Top-1 went from 5% to 18%, top-10 from 38% to 62%. 1,200 calls cost $0.0645.
     - Their point: fast search gets recall, and the model only reorders a shortlist. It
       "cannot add a passage that fast search did not select".
     - https://docs.typesafe.ai/cookbooks/rerank_typesafe
  2. *Line-by-line search.*
     - Tag 218 lines with IDs. One Choice over the line IDs ranks them (options have
       `None` descriptions because the text is in `state`).
     - A separate Noul `exists` checks whether the document answers the query at all.
     - Choice probabilities always sum to 1, so "a line ranks first even when none
       answer". Example: the top line scored 0.86 while `exists` = 0.14, so the verdict
       was "not in document". A three-state verdict (answered / partial / missing) comes
       from thresholds in code.
     - https://docs.typesafe.ai/cookbooks/semantic_find
  3. *Skill suggestion (closest to agent-facing record selection).*
     - Call 1: one Choice over all 182 skills (short descriptions), plus 3 Nouls that
       gate whether any skill is needed (mean < 0.30 → suggest nothing).
     - Call 2: re-rank the top 3 with full descriptions. A Choice picks *which* skill,
       and per-candidate `fits::{name}` Nouls decide *whether* to suggest one (max < 0.30
       → drop).
     - Output is at most one name. Wrong loads fell from 16.8% to 7.3%, needless loads
       from 9.8% to 4.0%. The oracle floor was 2.5% / 1.2%.
     - The suggestion fixed 37 cases and broke 7, because "a confident wrong suggestion
       is more persuasive".
     - https://docs.typesafe.ai/cookbooks/skill_suggestion
  4. *Classifying RAG passages.*
     - Embeddings return the top 12. Four Nouls per passage: relevant, contains-evidence,
       contradicts-premise, prompt-injection.
     - A fixed-order threshold cascade in code routes each passage to
       include / conflict / exclude.
     - Retrieval similarity spread was 0.584–0.455, too narrow to separate the passages.
     - https://docs.typesafe.ai/cookbooks/classifying_rag_passages
  5. *Hierarchical classification.*
     - Each node's children form one Choice. Beam search (K=3) runs in parallel and ranks
       paths by `product(edge_probs) ** (1/decisions)`. A `separation` ratio (top ÷
       second path) measures ambiguity.
     - Beam matched 4/4 examples, greedy 2/4.
     - https://docs.typesafe.ai/cookbooks/hierarchical_classification
- **What is deterministic vs model.** Code owns candidate generation (BM25, embeddings,
  regex, taxonomy traversal), thresholds, routing, arithmetic, date comparison and
  counting. The model does only the judgment over a closed answer set. The jaggedness
  page lists what not to give the model: math, counting, date comparison, multi-hop
  indirection, generation, and large states full of irrelevant detail. [V]
  https://docs.typesafe.ai/model-jaggedness/jev-1.13

## 3. Confidence

- **Definition.** `confidence` is "a statistic computed from the probability
  distribution". It is 1.0 when all mass sits on one option and lower as the distribution
  flattens. It exists only on Choice and Score; Noul has P(yes) only. The exact formula is
  **not disclosed**. [V] https://docs.typesafe.ai/confidence
  - The interactive demo "approximates" it for 3 options as `(3·pmax − 1)/2`, i.e.
    `(n·pmax − 1)/(n − 1)`. [V]
  - [I] The API example (0.88 / 0.12 / 0.00 → 0.81) fits that approximation. The Choice
    page example (0.61 top, 0.35 second → 0.42) does not fit it exactly for the option
    count shown. Treat the formula as unspecified. The docs say you may compute your own
    measure from `probabilities`.
- **Calibration claim.** Probabilities are "optimized against outcomes". Calibration
  holds "across groups of predictions" and does not guarantee an individual answer is
  right. [V] https://docs.typesafe.ai/concepts/system-one,
  https://docs.typesafe.ai/introduction/machine-learning-primer
- **Low-confidence behavior is caller-defined.** Jev itself never abstains. The
  patterns: [V]
  - Three bands (act / confirm or review / do not act → human, clarification or another
    system). https://docs.typesafe.ai/confidence
  - Thresholds scale with the stakes of each action. For example: 0.5 floor → human;
    read-only action at ≥0.6; destructive action only at >0.85–0.9, otherwise confirm.
    https://docs.typesafe.ai/patterns/confidence-routing
  - An explicit `uncertain` band for Nouls (0.30–0.70 → human review).
    https://docs.typesafe.ai/cookbooks/consistency_noul_cookbook
  - Back off to the parent taxonomy level when confidence < 0.9, with no second call.
    Over 60 SEC filings: the confident half was 90% correct, the unconfident half 40% at
    group level and 70% at division level.
    https://docs.typesafe.ai/cookbooks/classification_using_confidence
  - Relative vs absolute evidence. A Choice is relative ("which"), while per-option Nouls
    are absolute and can all be low ("whether"). Use both, and do not carry a Noul
    threshold over to a Choice. Structural identities do not hold: in one example,
    P(refund) + P(not refund) = 1.19.
    https://docs.typesafe.ai/model-jaggedness/jev-1.13,
    https://docs.typesafe.ai/cookbooks/skill_suggestion
  - Thresholds should be tuned on your own labeled data. [V] all of the above pages.

## 4. Speed

- **Mechanism (as described).**
  - The model does not generate tokens; it emits a distribution over the supplied
    options.
  - The state is ingested "once", and every question is evaluated in parallel against
    it, so adding questions "barely changes the response time".
  - Answers are independent, so batching does not change results and adds no noise.
  - [V] https://docs.typesafe.ai/introduction, https://docs.typesafe.ai/models,
    https://docs.typesafe.ai/cookbooks/parallel_questions
- **Numbers.** [V unless marked]
  - "Most queries complete in about 100 ms."
    https://docs.typesafe.ai/concepts/how-to-build-with-system-one
  - A 14-question rubric averaged 111 ms, against 1.1–13.9 s for the LLM conditions.
    https://docs.typesafe.ai/cookbooks/consistency_noul_cookbook
  - Skill suggestion: wide call about 0.31 s, re-rank about 0.12 s (per-example printout).
    https://docs.typesafe.ai/cookbooks/skill_suggestion
  - Batching 13 questions over a ~54k-character doc was 10.0× faster and 12.2× cheaper
    than 13 single calls. https://docs.typesafe.ai/cookbooks/parallel_questions
  - Price: $0.042 per million input tokens; output is free. Context is 64k per request,
    with 32k for state plus the longest question. https://docs.typesafe.ai/models
  - [V-video] "Output in less than a second" and 145-skill selection in about 5 s total
    over 14 tests versus about 30 s for a frontier LLM (RoboNuggets,
    https://www.youtube.com/watch?v=tTnUcSj-QPA ~0:00, 7:10). Third-party reports of 34×
    cheaper / 6× faster on tax documents, and 20k items sorted in 7 min for about $1
    (https://www.youtube.com/watch?v=tYugqJ9YytQ ~15:54–16:57). These are not verified.
- **Caching.** TypeSafe's docs describe no server-side caching or precompiled indexes.
  Cookbooks use a client-side `JsonCache` keyed on inputs so reruns replay results. [V]
  https://docs.typesafe.ai/cookbooks/skill_suggestion
  - The skill cookbook keeps the agent's roster text byte-identical and puts the
    suggestion in a separate block, so the *LLM's* prefix cache stays valid. [V] same URL.

## 5. How agents consume it

- **Interface.** One HTTP endpoint: `POST https://api.typesafe.ai/v1/systemone` with
  `{state, model, questions: {id: Question}}`. The response is
  `{model, answers: {id: Answer}, usage}`. Python and JS SDKs exist. There is no MCP
  server or agent tool in the docs. The "agent skill" teaches coding agents to *write
  code* that calls Jev; it does not expose Jev as a runtime tool. [V]
  https://docs.typesafe.ai/api, https://docs.typesafe.ai/agent-skill,
  https://docs.typesafe.ai/introduction/coding-agents
- **Output shape and size.** Tiny and fixed by construction:
  - Noul: one float.
  - Choice: the winning key, a probability per option, and confidence.
  - Score: a float, a legend, a probability per level, and confidence.
  - Example usage: 20–34 output tokens. [V] https://docs.typesafe.ai/api
- **Agent-facing pattern.** Code, not the agent, calls Jev. It injects at most one short
  hint into the agent's system prompt: "Relevant to the current request: X. Ignore this
  if it does not fit". When nothing fits it still sends a sentence saying so, to counter
  the roster's "err on the side of loading" instruction. The suggestion is deliberately
  soft because a wrong suggestion is worse than none. [V]
  https://docs.typesafe.ai/cookbooks/skill_suggestion
- **Third-party harness pattern.** Classifiers go in the "outer loop" and choose the next
  step (tool, cheap LLM, frontier LLM, human), with LLMs used as tools inside. The same
  classifier picks model routes or skills in Claude Code. [V-video]
  https://www.youtube.com/watch?v=tYugqJ9YytQ (~18:58–19:59),
  https://www.youtube.com/watch?v=tTnUcSj-QPA (~4:37–7:40)

## 6. Ideas worth borrowing (all [I] unless cited)

Goals: ~100% right-record retrieval, sub-second, calibrated "these records answer the
question", mostly deterministic, small bounded LLM role.

1. **Keep recall deterministic; use the model only for precision and abstention.**
   - Jev's own benchmark shows the model cannot fix recall misses (rerank cookbook).
   - For your system, candidate generation should be exhaustive over governed facets and
     stable IDs: exact facet filters, typed-edge expansion, and a subject/route index.
     Measure *shortlist recall* separately as the first gate for "~100%".
2. **Make the model's answer space the set of record IDs (closed set).**
   - Pattern from semantic_find: records are in `state` keyed by stable ID, and one
     Choice has options = IDs with null descriptions. The model can only point at
     existing IDs, so hallucinated IDs are impossible by construction.
   - Keep candidate sets ≤ ~240. Above that, chunk and run a second pass.
3. **Split "which" from "whether".**
   - A relative selector (Choice or ranking) plus absolute per-record checks (Noul-style
     "does record X answer question Q?") plus a document-level `exists` / "answerable
     from these records" check.
   - Report the answerability probability as the confidence that the retrieved set
     answers the question. Do not use top-rank probability for this, because a
     normalized ranking always crowns something.
4. **Three-state verdict with explicit abstention.**
   - answered / partial / not-in-KB, from thresholds set in code (semantic_find,
     consistency cookbook).
   - Put an `uncertain` band around the decision threshold that routes to "ask" or
     escalation instead of flipping.
5. **Hierarchical back-off instead of refusal.**
   - If confidence is low at the record level, return the parent subject/facet node with
     its record list. This is correct at a coarser grain (the SIC cookbook moved 40% to
     70%).
   - Maps directly onto governed facet hierarchies.
6. **Beam search over facet hierarchies.**
   - Where the question must be routed through a taxonomy (subject → sub-subject →
     record), score paths with the length-normalized geometric mean and keep K paths.
   - Expose a `separation` ratio as an ambiguity signal (hierarchical cookbook).
7. **Atomic, fan-out judgments in one call.**
   - If an LLM is used, ask it N narrow, independent yes/no or closed-set questions about
     one shared state in one request, instead of a single "which records are relevant"
     prose prompt.
   - Combine the answers in code with explicit, reviewable thresholds, so moving a
     threshold is a code change and needs no new calls (RAG passages cookbook).
8. **Calibrate per decision type, with a pinned model version.**
   - Build a labeled question → gold-record-IDs set. Fit thresholds and a reliability
     curve per question class, and pin the model version whose thresholds you tuned
     (Models page).
   - [I] For a general LLM, get calibrated probabilities from constrained logprobs over
     ID tokens, or from repeated sampling. Neither is as cheap as Jev's native output, and
     both need an empirical calibration step. Jev's calibration is a vendor claim that you
     would still need to verify on your data.
9. **Keep what the model sees small and relevant.**
   - Jev's accuracy drops with irrelevant state ("context rot").
   - Filter by facets first. Send only the candidate records' governed summary fields,
     keyed by ID, and put the question's structured context in named fields referenced
     by path.
10. **Let code do arithmetic, dates, counts and identity.**
    - Anything computable from governed metadata (time windows, supersession, status,
      counts) should be resolved deterministically before the model sees anything.
11. **Agent-facing output: tiny, typed, soft.**
    - Return `{answerable: p, verdict, records: [{id, p}], fallback_node?}`, a few hundred
      bytes.
    - When suggesting to an agent, phrase it as a hint the agent may ignore, and send an
      explicit "nothing applies" when abstaining. Keep static catalog text byte-stable so
      the agent's prompt cache survives.
12. **Latency budget.**
    - Precompute deterministic indexes (facet → IDs, route tables, edges) so candidate
      generation is millisecond-scale.
    - Allow at most one bounded model call (two only when the second truly depends on the
      first, per the primitives page) and cache results on (question-normalized, candidate
      IDs, KB version).
    - Jev-class latency (~100 ms) shows a single non-generative judgment call fits well
      under a second. A generative LLM call generally does not, unless it is small and
      constrained.

## 7. Caveats and limitations of this research

- **Video transcripts.**
  - Both are YouTube auto-captions (ASR). Names and numbers may be mis-transcribed, for
    example "Jeb"/"Jeff" for Jev.
  - Both videos are third-party commentary and include promotional content. Adoption and
    speed claims in them (for example "fastest adopted model in Vercel's AI gateway
    history") are unverified.
  - Video 1 quotes "four cents per million tokens"; the docs say $0.042/Mtok.
- **Chapters.**
  - Video 1 (RoboNuggets, "Jev will 10x your Claude Code", 11:46): Intro, What is Jev,
    Setup, Level 1 (model routing and skill selection), Level 2 (bulk business
    classification), Level 3 (semantic image search, page de-cluttering).
  - Video 2 (Nate B Jones, "Why Developers Are Losing Their Minds Over AI That Can't
    Write", 33:01):
    - 00:00 Why a model that only chooses matters
    - 01:28 The missing general purpose classifier
    - 09:30 A new building block
    - 17:01 Scale, research, agent orchestration
    - 21:08 Spreadsheets
    - 23:06 Testing Jev and getting started
    - 26:29 Cost and speed
    - 27:20 Jevons paradox
  - 23:00 onward in video 2:
    - Jev "still makes some mistakes"; test it on your own problem.
    - Getting started means copying TypeSafe's agent setup prompt, and there are
      instructions for finding places where an LLM chooses among defined outcomes and
      comparing a Jev version on quality, speed and cost.
    - Price math: 1M requests × 1k tokens ≈ $42.
    - TypeSafe's launch eval is cited as roughly 100× faster and more than 100× cheaper
      than an LLM (vendor claim).
    - The Jevons-paradox argument: cheap judgment gets applied far more widely, to every
      row or step.
    - LLMs remain for reasoning and writing.
- **Not reviewed in detail:** the SDK reference pages, the legal pages, and the cookbooks
  not cited above (function calling, citation check, date extraction, SDE cascade,
  autoformat, autoresearch, entity alignment, guardrails). None of the pages I read
  describe a server-side retrieval index or cache.
