// KK-28 launch-readiness pins: the license artifacts exist and agree with
// each other — LICENSE/NOTICE at the repo root, package.json's license
// field, and the D-020 decision entry all name Apache-2.0. Manifest
// embedding of LICENSE/NOTICE rides KK-17 and is not asserted here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { load } from 'js-yaml';

const root = fileURLToPath(new URL('..', import.meta.url));

test('LICENSE is the Apache-2.0 text and NOTICE names project + holder', () => {
  const license = readFileSync(join(root, 'LICENSE'), 'utf8');
  assert.match(license, /Apache License/);
  assert.match(license, /Version 2\.0, January 2004/);
  const notice = readFileSync(join(root, 'NOTICE'), 'utf8');
  assert.match(notice, /^unknown-knowledge/);
  assert.match(notice, /Unknown Creatives Studio/);
});

test('package.json license field matches the D-020 decision entry', () => {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  assert.equal(pkg.license, 'Apache-2.0');
  const d020 = load(readFileSync(
    join(root, 'decisions', 'entries', 'D-020-license-apache-2.yaml'), 'utf8',
  ));
  assert.equal(d020.entries[0].status, 'accepted');
  assert.match(d020.entries[0].decision, /Apache-2\.0/);
});

test('publish workflow carries provenance + OIDC and stays tag-gated', () => {
  const wf = readFileSync(join(root, '.github', 'workflows', 'publish.yml'), 'utf8');
  assert.match(wf, /npm publish --provenance --access public/);
  assert.match(wf, /id-token: write/);
  assert.match(wf, /tags:/);
});
