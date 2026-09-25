import { isAbsolute } from 'node:path';
import { readFileSync } from 'node:fs';
import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio, StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { z } from 'zod';
import { parseArgs as parseFlags, UsageError } from '../../payload/engine/lib/cli.js';
import { invoke, interfaceResultSucceeded } from '../../payload/engine/api/index.js';

export const USAGE = 'usage: unknown-knowledge-mcp --root <absolute-repo> --max-message-bytes <bytes> --max-result-bytes <bytes>';
// Native owners validate these documents. z.record transforms objects and can
// erase own keys such as __proto__, silently changing a refused query's meaning.
const document = z.unknown().describe('Native JSON document; passed unchanged to the engine for shape and semantic validation. See protocol/engine-interface.md.');
const evidence = z.strictObject({ decisionCaptures: z.array(z.unknown()), assessmentCaptures: z.array(z.unknown()), materialCaptures: z.array(z.unknown()) });
const intentInput = { plan: document, evidence, operationLimits: document, admission: document };
const inputSchemas = {
  'engine.capabilities': z.strictObject({}),
  'subject.lookup': z.strictObject({ text: z.string(), options: z.strictObject({ locale: z.string().optional(), context: z.string().optional() }).optional() }),
  'subject.tree': z.strictObject({ budget: document, maxBytes: z.number() }),
  'subject.query': z.strictObject({ query: document, collect: z.enum(['counts', 'results']), evidence, operationLimits: document }),
  'subject.route': z.strictObject({ request: document, evidence, operationLimits: document }),
  'subject.contexts': z.strictObject({ request: document, evidence, operationLimits: document }),
  'record.preflight': z.strictObject({ concepts: z.array(z.string()), leaves: z.array(z.string()), today: z.string().nullable() }),
  'record.ask': z.strictObject({
    question: z.string().optional(),
    mode: z.enum(['search', 'count', 'fields']).optional(),
    where: z.array(z.strictObject({ field: z.string(), value: z.string() })).optional(),
    countBy: z.string().optional(),
    under: z.string().optional(),
    limit: z.number().int().optional(),
    top: z.number().int().optional(),
  }),
  'intent.validate': z.strictObject({ plan: document }),
  'intent.inspectBindings': z.strictObject({ plan: document, lookupRequests: document.optional() }),
  'intent.validateQueries': z.strictObject(intentInput),
  'intent.executeQueries': z.strictObject({ ...intentInput, executionAdmission: document }),
};
const descriptions = {
  'engine.capabilities': 'List implemented engine operations. Registration does not prove authority exists in this installation.',
  'subject.lookup': 'Find subject IDs, labels, aliases and definitions. This is declared metadata, not approval or governed eligibility.',
  'subject.tree': 'Preview the native structural Subject tree without writing or checking saved files. Supply budget {nodes,edges,rows} and maxBytes for tree text including its banner. Declared lifecycle is not approval. Incomplete projection or rendering returns metadata without artifacts; transport output capacities apply separately.',
  'subject.query': 'Retrieve records with the native version 1 subject query and explicit host capacities. Output version 2 shares complete assignment outcomes in assignmentEvidence; ordered row assignments.ids reference that query-local table. Evidence contains canonical retained bytes, not approval flags. Inspect data.status, coverage and diagnostics; incomplete results are not negative matches.',
  'subject.route': 'Retrieve records assigned all subjects in an explicit intersection route. Request: version 1, route {version:1,kind:"intersection",subjects:[IDs]}, query options without where, optional collect counts/results. Display order does not imply semantic ancestry.',
  'subject.contexts': 'Count one additional subject at a time within the original query. Request: version 1, query and contextBudgets. Preserve enumeration/count completeness and zero counts; this is not a top-context ranking or evidence of a joint claim.',
  'record.preflight': 'Compute fresh native Ontology/Knowledge verdicts and next actions. concepts and leaves are explicit ID arrays; today is a real YYYY-MM-DD date or null for skipped freshness. Empty arrays check store health only. Does not supply Decisions verdicts, replace required agent source review or write logs. Inspect data.ok and each verdict.',
  'record.ask': 'Find the records a question is about, across Knowledge, Ontology and Decisions. mode "search" (default) takes a question and returns up to limit (default 8, max 50) records with a retrieval tier: covered, partial, none or unavailable. The tier says whether the right records were found, never whether they answer the question; read them and judge that yourself. mode "fields" lists metadata fields and top values for a selection. mode "count" selects exactly by where [{field,value}] (subjects match descendants), groups by countBy (under rolls subjects up to a parent\'s children) and returns exact counts, missing and tieAtCut.',
  'intent.validate': 'Validate the declared intent inventory, constraints and evidence obligations. Does not execute queries or establish source support.',
  'intent.inspectBindings': 'Inspect declared subject/record bindings against this repository. Does not establish governance approval or source support.',
  'intent.validateQueries': 'Validate all declared plan queries and provenance using one governed context and explicit admission capacities. Does not execute queries.',
  'intent.executeQueries': 'Validate and execute the declared strict, alternative and recovery branches with explicit capacities. Read each branch separately. Source evidence review remains pending.',
};

export async function main(argv) {
  const { options } = parseFlags(argv, { value: ['root', 'max-message-bytes', 'max-result-bytes'] });
  if (!options.root || !isAbsolute(options.root)) throw new UsageError('Supply an absolute --root.');
  const capacities = ['max-message-bytes', 'max-result-bytes'].map(key => {
    if (!/^\d+$/.test(options[key] ?? '') || !Number.isSafeInteger(Number(options[key])) || Number(options[key]) < 1) {
      throw new UsageError(`Supply a positive --${key}.`);
    }
    return Number(options[key]);
  });
  const [maxMessageBytes, maxResultBytes] = capacities;
  const version = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version;
  const bounded = result => {
    if (Buffer.byteLength(JSON.stringify(result)) > maxResultBytes) throw new Error('MCP result exceeds --max-result-bytes. Narrow the request or raise the host capacity.');
    return result;
  };
  const guides = [
    { name: 'engine-interface', path: new URL('../../payload/protocol/engine-interface.md', import.meta.url) },
    { name: 'intent-retrieval', path: new URL('../../payload/protocol/intent-retrieval.md', import.meta.url) },
  ];
  const discovery = await invoke({ interfaceVersion: 1, inputVersion: 1, operation: 'engine.capabilities', root: options.root, input: {} });
  serveStdio(() => {
    const server = new McpServer({ name: 'unknown-knowledge', version }, {
      instructions: 'Read unknown-knowledge://protocol/engine-interface and unknown-knowledge://protocol/intent-retrieval for request formats and evidence obligations. These are shipped package documentation, not repository evidence or approval.',
    });
    for (const guide of guides) {
      const uri = `unknown-knowledge://protocol/${guide.name}`;
      server.registerResource(guide.name, uri, { mimeType: 'text/markdown',
        description: `Shipped unknown-knowledge ${version} documentation; not repository evidence or approval.` }, () =>
        bounded({ contents: [{ uri, mimeType: 'text/markdown', text: readFileSync(guide.path, 'utf8') }] }));
    }
    for (const { operation } of discovery.data.operations) {
      if (!inputSchemas[operation]) throw new Error(`Missing MCP schema for ${operation}`);
      server.registerTool(operation.replaceAll('.', '_'), { description: descriptions[operation], inputSchema: inputSchemas[operation],
        annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } }, async input => {
        const result = await invoke({ interfaceVersion: 1, inputVersion: 1, operation, root: options.root, input });
        return bounded({ content: [{ type: 'text', text: JSON.stringify(result) }],
          structuredContent: result, isError: !interfaceResultSucceeded(result) });
      });
    }
    return server;
  }, { transport: new StdioServerTransport(process.stdin, process.stdout, { maxBufferSize: maxMessageBytes }),
    onerror: error => process.stderr.write(`unknown-knowledge-mcp: ${error.message}\n`) });
  return 0;
}
