import { appendFileSync, chmodSync, cpSync, mkdirSync, writeFileSync, symlinkSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
// A5 preparation only: reused clean v2 store, never part of the init payload.
const repo = fileURLToPath(new URL('..', import.meta.url));
if (!process.argv[2]) throw Error('usage: node acceptance/setup-knowledge-gap.js <new-directory>');
const root = resolve(process.argv[2]);
mkdirSync(root);
cpSync(`${repo}/tests/fixtures/structural-validator/frontmatter-v2`, `${root}/unknown-knowledge`, { recursive: true });
cpSync(`${root}/unknown-knowledge/src`, `${root}/src`, { recursive: true });
for (const name of ['engine', 'protocol', 'hooks', 'schemas', 'templates']) {
  cpSync(`${repo}/payload/${name}`, `${root}/unknown-knowledge/${name}`, { recursive: true });
}
writeFileSync(`${root}/unknown-knowledge/package.json`, '{"type":"module"}\n');
symlinkSync(`${repo}/node_modules`, `${root}/node_modules`);
writeFileSync(`${root}/.gitignore`, 'node_modules\n');
writeFileSync(`${root}/survey-scope.yaml`, 'schema-version: 1\ninclude: [src, docs]\nexclude: [private]\n');
mkdirSync(`${root}/docs`);
writeFileSync(`${root}/docs/component-telemetry.md`, '# Component telemetry\n\nThe component telemetry interface exists for render diagnostics. This inventory does not establish a provider or safeguards.\n');
writeFileSync(`${root}/src/feed/telemetry.ts`, 'export type ComponentTelemetry = { record(event: string): void };\n');
writeFileSync(`${root}/unknown-knowledge/ontology/classes/103-telemetry.yaml`, 'schema-version: 1\nentries:\n  - id: K-103\n    term: Component telemetry\n    class: 103-telemetry\n    summary: Render diagnostics interface.\n    source-of-truth: [src/feed/telemetry.ts, docs/component-telemetry.md]\n    status: active\n');
appendFileSync(`${root}/unknown-knowledge/ontology/_catalog.yaml`, '  - id: K-103\n    title: Component telemetry\n    file: classes/103-telemetry.yaml\n');
writeFileSync(`${root}/unknown-knowledge/knowledge/_rules.yaml`, 'schema-version: 1\nstore: knowledge\nrules:\n  - rule: write-gate\n    text: Human-only; kb-build is the sole write path.\n  - rule: domains\n    domains:\n      - domain: design-system\n        divisions: [components]\n');
for (const log of ['findings', 'gaps', 'misses']) mkdirSync(`${root}/unknown-knowledge/logs/${log}`, { recursive: true });
function git(...args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw Error(result.stdout + result.stderr);
  return result.stdout + result.stderr;
}
git('init', '-q');
git('config', 'user.name', 'Controlled fixture');
git('config', 'user.email', 'fixture@example.invalid');
symlinkSync('../../unknown-knowledge/hooks/pre-commit', `${root}/.git/hooks/pre-commit`);
symlinkSync('../../unknown-knowledge/hooks/reverse-lookup', `${root}/.git/hooks/prepare-commit-msg`);
for (const hook of ['pre-commit', 'reverse-lookup']) chmodSync(`${root}/unknown-knowledge/hooks/${hook}`, 0o755);
git('add', '.');
console.log(git('commit', '-q', '-m', 'Controlled component telemetry baseline'));
console.log(`Fixture ready at ${root} (${git('rev-parse', 'HEAD').trim()})`);
