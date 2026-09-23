/** Read-only inventory; conversion/publication are separate, unreleased phases. */
import { inventoryCommittedSource } from '../lib/identity-migration-source.js';
import { parseArgs as parseFlags } from '../lib/cli.js';
import { EXIT_CODES } from '../lib/exit-codes.js';
export const USAGE = 'usage: migrate-identity --root <repo> --source <commit> --kit-root <.|unknown-knowledge> [--json]';

export async function main(argv) {
  const { options } = parseFlags(argv, { value: ['root', 'source', 'kit-root'], boolean: ['json'] });
  const inventory = inventoryCommittedSource({ repoRoot: options.root ?? process.cwd(), commit: options.source, kitRoot: options['kit-root'] });
  process.stdout.write(options.json ? `${JSON.stringify(inventory, null, 2)}\n` : [
    `Identity source inventory: ${inventory.source.commit}`,
    `${inventory.records.length} source records; ${inventory.references.length} typed references; ${inventory.diagnostics.length} diagnostics`,
    'Coverage: supplied store documents only; external consumers and unclassified paths require review.',
    'Index, worktree and untracked files excluded and unchanged. No conversion or publication performed.',
    ...inventory.diagnostics.map((item) => `${item.code}: ${item.file}:${item.line ?? ''} ${item.path.join('.')}`),
    '',
  ].join('\n'));
  return inventory.ok ? EXIT_CODES.CLEAN : EXIT_CODES.FINDINGS;
}
