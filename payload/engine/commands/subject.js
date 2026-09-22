/** Read-only declared subject metadata lookup (UCS-1235). */
import { resolve } from 'node:path';
import { parseArgs as parseFlags, UsageError, EngineRefusal, rethrowIfBug } from '../lib/cli.js';
import { locateKitRoot } from '../lib/kit-root.js';
import { loadStores, storeHealth } from '../lib/load-stores.js';
import { SubjectError } from '../lib/subjects.js';
import { subjectLookupReport } from '../lib/subject-lookup.js';
import { EXIT_CODES } from '../lib/exit-codes.js';

export const USAGE = 'Usage: subject.js lookup <label...> [--locale value] [--context value] [--root repo] [--json]';

export function main(argv) {
  const { options, positionals } = parseFlags(argv, {
    boolean: ['json'], value: ['locale', 'context', 'root'], positionals: true,
  });
  if (positionals[0] !== 'lookup' || positionals.length < 2) throw new UsageError('lookup requires a label');
  const text = positionals.slice(1).join(' ');
  const lookupOptions = Object.fromEntries(['locale', 'context']
    .filter((key) => options[key] !== undefined).map((key) => [key, options[key]]));
  let model;
  try { model = loadStores(locateKitRoot(resolve(options.root ?? process.cwd()))); }
  catch (error) {
    rethrowIfBug(error);
    if (!(error instanceof EngineRefusal)) throw error;
    process.stderr.write(`subject: ${error.name}: ${error.message}\n`);
    return EXIT_CODES.FAILURE;
  }
  const health = storeHealth(model);
  if (!health.ok) {
    process.stderr.write('subject: invalid-model: the captured installation failed validation\n');
    for (const diagnostic of health.errors) {
      process.stderr.write(`${diagnostic.code}: ${diagnostic.file ?? ''} ${diagnostic.path ?? ''}: ${diagnostic.message}\n`);
    }
    return EXIT_CODES.FAILURE;
  }
  const registry = model.subjectRegistry;
  if (!registry) {
    process.stderr.write('subject: subject-registry-unavailable: subjects/registry.yaml is absent\n');
    return EXIT_CODES.FAILURE;
  }
  let output;
  try { output = subjectLookupReport(model, text, lookupOptions); }
  catch (error) {
    if (!(error instanceof SubjectError)) throw error;
    throw new UsageError(`${error.code}: ${error.message}`);
  }
  const { result } = output;
  if (options.json) process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  else {
    process.stdout.write(`subject.lookup (declared-metadata): ${result.matches.length} match(es)\n`);
    for (const match of result.matches) {
      process.stdout.write(`${match.id} [${match.status}] ${match.label}\n  ${JSON.stringify(match.definition)}\n`);
      for (const evidence of match.matches) process.stdout.write(`  matched ${JSON.stringify(evidence)}\n`);
    }
  }
  return EXIT_CODES.CLEAN;
}
