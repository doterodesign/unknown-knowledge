import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { isOwnEngineImport } from '../acceptance/lib/engine-module-import.js';

test('literal imports remain inside the engine after lexical and realpath resolution', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'engine-import-audit-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const engine = join(root, 'engine');
  for (const dir of ['engine/commands', 'engine/lib', 'engine/lib/directory.js', 'engine-sibling']) {
    mkdirSync(join(root, dir), { recursive: true });
  }
  writeFileSync(join(engine, 'lib/own.js'), 'export const own = true;\n');
  writeFileSync(join(root, 'client.js'), 'export const client = true;\n');
  writeFileSync(join(root, 'engine-sibling/client.js'), 'export const client = true;\n');
  symlinkSync(join(root, 'client.js'), join(engine, 'lib/escape.js'));
  symlinkSync(join(root, 'engine-sibling'), join(engine, 'linked'));
  const importer = join(engine, 'commands/lookup.js');
  assert.equal(isOwnEngineImport("'../lib/own.js'", importer, engine), true);
  assert.equal(isOwnEngineImport("'./lib/own.js'", join(engine, 'lookup.js'), engine), true);
  for (const specifier of [
    "'../../client.js'", "'../../engine-sibling/client.js'", "'../lib/escape.js'",
    "'../linked/client.js'", "'../lib/missing.js'", "'../lib/directory.js'",
    'path', '`../lib/own.js`', '"../lib/own.js"', "'../lib/' + name",
    "'../lib/own\\x2ejs'", "'/absolute.js'", "'node:fs'",
  ]) assert.equal(isOwnEngineImport(specifier, importer, engine), false, specifier);
});
