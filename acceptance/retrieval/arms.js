// Test-only: the two runtimes of an agent comparison, with identical content.
//
// The original arm is a 2.x installation exactly as the 08066b5 runtime built
// it (materialize.js). The current arm is what a client gets by the documented
// upgrade: a fresh 3.0 kit from this checkout's `init`, holding the same stores
// converted by `migrate.js`, plus the same sources and survey scope. Only the
// runtime and the identity format differ between the two.
import { cpSync, existsSync, mkdirSync, rmSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repository = fileURLToPath(new URL('../..', import.meta.url));
const KIT = 'unknown-knowledge';
const STORE_PATHS = ['ontology', 'knowledge', 'decisions', 'logs'];
const ROOT_PATHS = ['sources', 'survey-scope.yaml', '.gitignore'];

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', ...options });
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')}: ${result.stderr || result.stdout}`);
  return result.stdout;
}

/**
 * Build the current-runtime copy of one 2.x installation at `destination`.
 * Returns the old-to-new ID mapping `migrate.js` reported.
 */
export function currentInstallation(original, destination) {
  const staging = `${destination}.2x`;
  cpSync(original, staging, { recursive: true, verbatimSymlinks: true });
  const report = JSON.parse(run(process.execPath, [join(repository, 'payload/engine/migrate.js'), '--root', staging, '--json']));
  mkdirSync(destination);
  run(process.execPath, [join(repository, 'cli/init.js'), 'init', '--yes', '--target', destination,
    '--platforms', 'codex', '--stacks', 'none']);
  // The seeded kit's empty stores give way to the converted ones; a store the
  // 2.x installation did not have stays absent, as it was there.
  for (const path of STORE_PATHS) {
    rmSync(join(destination, KIT, path), { recursive: true, force: true });
    const from = join(staging, KIT, path);
    if (existsSync(from)) cpSync(from, join(destination, KIT, path), { recursive: true });
  }
  cpSync(join(staging, KIT, '_identity.yaml'), join(destination, KIT, '_identity.yaml'), { force: true });
  for (const path of ROOT_PATHS) {
    if (existsSync(join(staging, path))) cpSync(join(staging, path), join(destination, path), { recursive: true, force: true });
  }
  if (!existsSync(join(destination, 'node_modules'))) symlinkSync(join(repository, 'node_modules'), join(destination, 'node_modules'), 'dir');
  run('git', ['init', '-q', destination]);
  run('git', ['-C', destination, 'config', 'gc.autoDetach', 'false']);
  run('git', ['-C', destination, 'add', '.']);
  rmSync(staging, { recursive: true, force: true });
  return report.mapping;
}
