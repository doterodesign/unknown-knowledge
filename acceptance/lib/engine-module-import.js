/** Audit literal dynamic imports against the actual engine boundary (D-014). */
import { realpathSync, statSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';

const inside = (root, target) => {
  const path = relative(root, target);
  return path !== '' && path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path);
};

export function isOwnEngineImport(specifier, importer, engineRoot) {
  const literal = /^'(\.\.?\/[A-Za-z0-9_./-]+\.js)'$/.exec(specifier.trim());
  if (!literal) return false;
  const root = resolve(engineRoot);
  const target = resolve(dirname(importer), literal[1]);
  if (!inside(root, target)) return false;
  try {
    return inside(realpathSync(root), realpathSync(target)) && statSync(target).isFile();
  } catch (error) {
    if (!Number.isInteger(error?.errno)) throw error;
    return false;
  }
}
