import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** Change only a disposable source before it is committed; never the pinned fixture. */
export function optionalStoreSource({ knowledge = 'absent', ontology = 'absent', decisions = 'full' } = {}) {
  return (kit) => {
    if (knowledge === 'full' && ontology !== 'full') {
      const file = join(kit, 'knowledge/design-system/component-render-budget.md');
      writeFileSync(file, readFileSync(file, 'utf8').replace('concepts: [K-102]\n', ''));
    }
    for (const [store, state] of Object.entries({ knowledge, ontology, decisions })) {
      if (state === 'full') continue;
      rmSync(join(kit, store), { recursive: true });
      if (state === 'empty') {
        mkdirSync(join(kit, store));
        writeFileSync(join(kit, store, '_catalog.yaml'), `schema-version: 1\nstore: ${store}\nentries: []\n`);
      } else if (state === 'file') writeFileSync(join(kit, store), 'This is not a store directory.\n');
    }
  };
}
