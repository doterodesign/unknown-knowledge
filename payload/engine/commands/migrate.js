/**
 * One-shot 2.x -> 3.0 store conversion (UCS-1520).
 *
 *   node engine/migrate.js [--root <repo>] [--dry-run] [--json]
 *                          [--namespace <uuid>] [--review <text>]
 *
 * Reads every 2.x store document under the kit root, allocates permanent
 * K/O/D IDs in a new `_identity.yaml`, rewrites every citation to them and
 * writes the files in place. The result is an ordinary working-tree diff:
 * review it, run the validators, and commit it. `--dry-run` prints the
 * old-to-new mapping and writes nothing. Nothing keeps the old IDs afterwards.
 *
 * Exit 0: converted (or convertible, with --dry-run). Exit 1: the source stores
 * have defects to fix first, such as a duplicate ID or a citation that names no
 * record; nothing is written. Exit 2: usage or environment failure.
 */
import { randomUUID } from 'node:crypto';
import { lstatSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { dump } from 'js-yaml';
import { parseArgs as parseFlags, UsageError } from '../lib/cli.js';
import { locateKitRoot } from '../lib/kit-root.js';
import { isIdentityUuid } from '../lib/record-identity.js';
import { convertStoreDocuments, sourceKind } from '../lib/identity-migration.js';
import { EXIT_CODES } from '../lib/exit-codes.js';

export const USAGE = 'usage: migrate.js [--root <repo>] [--dry-run] [--json] [--namespace <uuid>] [--review <text>]';

const STORE_DIRS = ['ontology', 'knowledge', 'decisions', 'logs'];
const DEFAULT_REVIEW = 'migrate.js 2.x to 3.0 conversion, reviewed as the conversion commit';

/** Store-directory files the converter leaves alone, and what to do about each. */
function untouchedRole(path, bytes) {
  if (path.endsWith('/.gitkeep')) return null;
  if (path.startsWith('knowledge/derived/')) return 'regenerate with derive.js --write';
  if (/^(ontology|knowledge|decisions)\/_rules\.yaml$/.test(path)) {
    return /^\s*rules:\s*\[\]\s*$/m.test(bytes.toString('utf8')) ? null : 'review by hand: rules may name old IDs';
  }
  return 'review by hand: not a 2.x store document';
}

function collect(kitRoot) {
  const documents = [];
  const untouched = [];
  const visit = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name < b.name ? -1 : 1)) {
      const path = join(dir, entry.name);
      const file = relative(kitRoot, path).split(sep).join('/');
      if (entry.isDirectory()) visit(path);
      else if (!entry.isFile()) untouched.push({ file, action: 'review by hand: not a regular file' });
      else {
        const bytes = readFileSync(path);
        const kind = sourceKind(file);
        if (kind) documents.push({ file, kind, bytes });
        else {
          const action = untouchedRole(file, bytes);
          if (action) untouched.push({ file, action });
        }
      }
    }
  };
  for (const store of STORE_DIRS) if (lstatSync(join(kitRoot, store), { throwIfNoEntry: false })?.isDirectory()) visit(join(kitRoot, store));
  return { documents, untouched };
}

const where = (row) => `${row.file}${row.path?.length ? ` ${row.path.join('.')}` : ''}`;

export function main(argv) {
  const { options } = parseFlags(argv, { value: ['root', 'namespace', 'review'], boolean: ['dry-run', 'json'] });
  if (options.namespace !== undefined && !isIdentityUuid(options.namespace)) throw new UsageError('--namespace must be a lowercase v4 UUID');
  if (options.review !== undefined && !options.review.trim()) throw new UsageError('--review must not be blank');
  const kitRoot = locateKitRoot(resolve(options.root ?? process.cwd()));
  if (lstatSync(join(kitRoot, '_identity.yaml'), { throwIfNoEntry: false })) {
    throw new UsageError(`${join(kitRoot, '_identity.yaml')} exists: this installation is already in 3.0 format`);
  }
  const { documents, untouched } = collect(kitRoot);
  if (!documents.length) throw new UsageError(`no 2.x store documents under ${kitRoot}`);
  const dryRun = options['dry-run'] === true;
  const result = convertStoreDocuments(documents, {
    namespace: options.namespace ?? randomUUID(),
    publication: { id: randomUUID(), review: options.review ?? DEFAULT_REVIEW },
    proposalKey: (kind) => `proposal:${kind}:${randomUUID()}`,
  });
  if (result.ok && !dryRun) {
    for (const file of result.files) writeFileSync(join(kitRoot, file.file), file.bytes);
    // Written last: its presence marks a finished conversion.
    writeFileSync(join(kitRoot, '_identity.yaml'), dump(result.identity, { lineWidth: -1 }));
  }
  const report = {
    ok: result.ok, dryRun, kitRoot,
    ...(result.ok ? {
      mapping: result.mapping,
      prose: result.prose,
      kept: result.kept,
      files: result.files.map((file) => file.file),
      untouched,
    } : { code: result.code, diagnostics: result.diagnostics ?? [] }),
  };
  if (options.json) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  else process.stdout.write(`${human(report).join('\n')}\n`);
  return result.ok ? EXIT_CODES.CLEAN : EXIT_CODES.FINDINGS;
}

function human(report) {
  if (!report.ok) {
    return [`migrate: refused (${report.code}); nothing written. Fix these in the 2.x stores first:`,
      ...report.diagnostics.map((row) => `  ${row.code}: ${where(row)}${row.line ? `:${row.line}` : ''}`)];
  }
  const lines = [`migrate: ${report.dryRun ? 'dry run, nothing written' : 'converted'} (${report.kitRoot})`, '', 'IDs:'];
  for (const row of report.mapping) lines.push(`  ${row.kind.padEnd(9)} ${row.from} -> ${row.to}  (${row.file})`);
  if (report.prose.length) {
    lines.push('', 'Prose mentions rewritten:');
    for (const row of report.prose) lines.push(`  ${where(row)}: ${row.ids.join(', ')}`);
  }
  const ambiguous = report.kept.filter((row) => row.reason === 'ambiguous-record-id');
  if (ambiguous.length) {
    lines.push('', 'Prose mentions left as written (the ID names more than one record):');
    for (const row of ambiguous) lines.push(`  ${where(row)}: ${row.id}`);
  }
  if (report.untouched.length) {
    lines.push('', 'Not converted:');
    for (const row of report.untouched) lines.push(`  ${row.file}: ${row.action}`);
  }
  lines.push('', report.dryRun
    ? `${report.files.length} file(s) would change, plus a new _identity.yaml.`
    : `${report.files.length} file(s) rewritten and _identity.yaml written. Next: run validate.js and validate-values.js, regenerate derived views with derive.js --write, then review and commit the diff.`);
  return lines;
}
