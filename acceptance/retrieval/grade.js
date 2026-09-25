// Test-only blind grader (UCS-1582): one reader trace + one case -> a verdict.
//
// The grader is a separate headless session that sees the case (expected
// answer, abstention target, gold evidence, critical failures) and the
// reader's answer and tool calls. It returns a closed JSON verdict. The
// caller gets back only the closed fields; the grader's reasoning is written
// to `rationaleFile`, which for held-out cases lives in the custody directory
// and is never read by whoever tuned retrieval.
//
// Rubric (fixed before any held-out session ran):
//   completed          answerable case; the answer states the expected facts
//                      correctly and relies on records of an adequate gold
//                      bundle (cited, or read according to the tool calls);
//                      no critical failure.
//   correct-abstention unanswerable case; the answer declines the abstention
//                      target, does not assert the unsupported fact, and names
//                      what is missing; no critical failure.
//   failed             anything else, including a missing or errored answer.
// Critical flags, any of which also makes the verdict `failed`:
//   unsupported-claim  states a fact no read record or source supports
//   answered-unanswerable  asserts an answer the case says is not established
//   scope-violation    applies a record outside its stated scope or lifecycle
//   fabricated-citation cites an ID or passage that does not exist or was not read
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const GRADER_MODEL = 'claude-sonnet-5';
export const VERDICTS = Object.freeze(['completed', 'correct-abstention', 'failed']);
export const CRITICAL = Object.freeze(['unsupported-claim', 'answered-unanswerable', 'scope-violation', 'fabricated-citation']);

const RUBRIC = `Grade one agent answer against one evaluation case. Verdicts:
- completed: the case is answerable; the answer states the expected facts correctly and relies on records of an adequate gold bundle (cited, or visibly read in the tool calls); no critical failure.
- correct-abstention: the case is not answerable; the answer declines the abstention target, does not assert the unsupported fact, and says what is missing; no critical failure.
- failed: anything else, including no answer.
Critical flags (any one forces failed): unsupported-claim, answered-unanswerable, scope-violation, fabricated-citation.
Judge only from the case and the trace given. A citation counts as read when its ID or quoted text appears in a tool output or in recordsGivenToTheReader; a file's name need not match the IDs inside it. Reply with ONLY a JSON object:
{"verdict": "...", "critical": [...], "rationale": "two or three sentences"}`;

// The protocol is instructions, not evidence; everything else a tool returned
// is what the reader saw. Without it, a correct citation of a record read under
// a file named for its 2.x ID looks fabricated (diagnosed on policy-01).
const PROTOCOL = /AGENTS\.md|\/protocol\//;
const EVIDENCE_CHARS = 4000;

/** Tool calls with what each returned, so the grader can check citations. */
const callsOf = (trace) => trace.toolCalls.map((c) => {
  const input = JSON.stringify(c.input);
  return { tool: c.name, input: input.slice(0, 300), outputBytes: c.outputBytes,
    output: PROTOCOL.test(input) || c.output == null ? '(protocol or not recorded)' : c.output.slice(0, EVIDENCE_CHARS) };
});

/**
 * @param {object} kase  {prompt, answerable, expectedAnswer, abstentionTarget, bundles: [[id...]], criticalFailures}
 * @param {object} trace a reader.js trace
 * @param {{rationaleFile: string, model?: string}} options
 * @returns {{verdict: string, critical: string[]}}
 */
export function grade(kase, trace, { rationaleFile, model = GRADER_MODEL }) {
  if (trace.isError || !trace.answer) {
    writeFileSync(rationaleFile, `${JSON.stringify({ verdict: 'failed', critical: [], rationale: 'no answer' })}\n`);
    return { verdict: 'failed', critical: [] };
  }
  const input = JSON.stringify({ case: kase, answer: trace.answer, toolCalls: callsOf(trace),
    ...(trace.evidence ? { recordsGivenToTheReader: trace.evidence } : {}) }, null, 1);
  const scratch = mkdtempSync(join(tmpdir(), 'uk-grade-'));
  const mcp = join(scratch, 'no-mcp.json');
  writeFileSync(mcp, '{"mcpServers":{}}\n');
  const result = spawnSync('claude', ['-p', `${RUBRIC}\n\n${input}`, '--model', model, '--tools', '',
    '--setting-sources', 'project', '--strict-mcp-config', '--mcp-config', mcp, '--no-session-persistence',
    '--output-format', 'json'], { cwd: scratch, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, timeout: 300_000 });
  rmSync(scratch, { recursive: true, force: true });
  let parsed = null;
  try {
    const text = JSON.parse(result.stdout).result;
    const body = text.slice(text.indexOf('{'));
    // The grader occasionally drops the closing brace; accept the object either way.
    for (const candidate of [body.slice(0, body.lastIndexOf('}') + 1), `${body.trim()}}`]) {
      try { parsed = JSON.parse(candidate); break; } catch { parsed = null; }
    }
  } catch { parsed = null; }
  writeFileSync(rationaleFile, `${JSON.stringify(parsed ?? { error: 'unparseable grader output', stdout: result.stdout?.slice(-2000) }, null, 2)}\n`);
  // Only closed fields leave this function.
  const verdict = VERDICTS.includes(parsed?.verdict) ? parsed.verdict : 'failed';
  const critical = (Array.isArray(parsed?.critical) ? parsed.critical : []).filter((c) => CRITICAL.includes(c));
  return { verdict: critical.length ? 'failed' : verdict, critical, graderError: parsed ? undefined : true };
}
