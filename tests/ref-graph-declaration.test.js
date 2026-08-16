// UCS-1143: a brand-new typed edge is introduced by DECLARATION ALONE.
//
// The acceptance criterion this file executes: adding one row to the ref-field
// table is the whole change needed to make a new typed edge real — collected,
// resolved, and surfaced at the CLI seam as the existing unresolved-ref
// finding, with no bespoke check anywhere. Later tickets (frontmatter v2's
// `relates` map: depends-on / see-also / contradicts / supersedes) add edges
// this way, so the property is worth pinning rather than trusting.
//
// It is proven the way the kit proves everything else — through the public
// seam, a real CLI process. The engine is copied into a temp dir INSIDE the
// repo (so `js-yaml` still resolves through node_modules), exactly ONE line is
// added to REF_FIELDS in that copy, and the unmodified validate.js runs
// against a store whose record carries the new three-level edge. Nothing in
// the shipped table changes: a fake edge left in payload/ would ship a phantom
// relationship to every consumer of the kit.
//
// Two declarations are at play, and they are deliberately separate concerns:
// the SCHEMA says a field may exist (every shipped schema is closed, so v2
// lands its field there), and the REF-FIELD TABLE says that field's contents
// are typed edges into an id space. The sandbox opens the schema in BOTH the
// control and the test run, so the only difference between them — and so the
// only cause of the finding — is the one ref-field row. That is exactly the
// claim: the edge is bought by the declaration, not by engine code.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const engineDir = join(repoRoot, 'payload', 'engine');

// The one row under test: a third-level path into a nested map of typed
// arrays — the shape frontmatter v2's `relates` uses, one level deeper than
// anything the walker handled before this ticket.
const NEW_EDGE = "    { field: 'meta.relates.depends-on', space: 'leaves' },";
const ANCHOR = "  'knowledge-leaf': [";

/**
 * Run validate.js from an engine copy whose REF_FIELDS may carry an extra row.
 * `declare` false is the control: the SAME store, the SAME engine source, with
 * only the declaration withheld.
 */
function runValidate(store, { declare }) {
  // Inside the repo so the copied engine resolves js-yaml from node_modules.
  // The engine copy must sit INSIDE the repo — unlike the store fixture, it
  // imports `js-yaml`, which only resolves from a directory under the repo's
  // node_modules. A dot-prefixed name keeps it out of the `tests/**/*.test.js`
  // glob; the finally below removes it either way.
  const sandbox = mkdtempSync(join(repoRoot, 'tests', '.tmp-ref-graph-'));
  try {
    // Mirror the payload/ layout: the engine resolves its shipped schemas at
    // ../../schemas/ relative to lib/, so engine/ needs that sibling.
    const engine = join(sandbox, 'engine');
    cpSync(engineDir, engine, { recursive: true });
    const schemas = join(sandbox, 'schemas');
    cpSync(join(repoRoot, 'payload', 'schemas'), schemas, { recursive: true });

    // Open the leaf schema for the v2-shaped field, in BOTH runs. Schema
    // legality is a separate declaration from edge semantics; holding it
    // constant is what isolates the ref-field row as the only variable.
    const schemaPath = join(schemas, 'knowledge-leaf.schema.json');
    const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));
    schema.properties.meta = {
      type: 'object',
      additionalProperties: false,
      properties: {
        relates: {
          type: 'object',
          additionalProperties: false,
          properties: { 'depends-on': { type: 'array', items: { type: 'string' } } },
        },
      },
    };
    writeFileSync(schemaPath, JSON.stringify(schema, null, 2));

    const loaderPath = join(engine, 'lib', 'load-stores.js');
    const source = readFileSync(loaderPath, 'utf8');
    assert.ok(source.includes(ANCHOR), 'the ref-field table no longer has the shape this test patches');
    if (declare) {
      // THE ENTIRE CHANGE: one declaration, inserted into the table. No edit
      // to the collector, the resolver, the diagnostic, or the CLI.
      const patched = source.replace(ANCHOR, `${ANCHOR}\n${NEW_EDGE}`);
      assert.notEqual(patched, source, 'expected the declaration to be inserted');
      writeFileSync(loaderPath, patched);
      assert.equal(
        readFileSync(loaderPath, 'utf8').split('\n').length,
        source.split('\n').length + 1,
        'exactly one line was added',
      );
    }
    const r = spawnSync(process.execPath, [join(engine, 'validate.js'), '--root', store], { encoding: 'utf8' });
    return { status: r.status, stdout: r.stdout, stderr: r.stderr };
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
}

/** A store whose leaf carries the new three-level edge, pointing nowhere. */
function withStore(fn) {
  const root = mkdtempSync(join(tmpdir(), 'ucs1143-store-'));
  try {
    cpSync(join(repoRoot, 'tests', 'fixtures', 'loader', 'healthy'), root, { recursive: true });
    mkdirSync(join(root, 'knowledge', 'regulation'), { recursive: true });
    // The fixture's concepts anchor to source-of-truth paths, which the
    // structural validator requires to exist in the working tree (§3.1).
    // Creating them is what lets the control run assert a clean exit 0, so an
    // unrelated CLI failure cannot masquerade as "no edge was collected".
    mkdirSync(join(root, 'src', 'verticals', 'sportsbook', 'sports'), { recursive: true });
    writeFileSync(join(root, 'src', 'verticals', 'sportsbook', 'sports', 'registry.ts'), '// fixture anchor\n');
    mkdirSync(join(root, 'src', 'verticals', 'sportsbook', 'bet-slip'), { recursive: true });
    // L-000362 already exists and is catalog-declared; this rewrites it to
    // carry the nested `relates` map. `depends-on` names an accession no store
    // mints, so the edge — once declared — has nowhere to resolve.
    //
    // Everything here is spelled the one legal way (UCS-1147): the leaf carries
    // its required `id`, `see-also` names its sibling by accession, and the
    // dangling target is a well-formed accession rather than the notation
    // "999.9" it used to be. That matters for the CONTROL run specifically —
    // its whole claim is a clean exit 0, and a leaf with a missing identity or
    // a notation-form citation would fail it for reasons that have nothing to
    // do with whether the edge was declared.
    writeFileSync(join(root, 'knowledge', 'regulation', '362.1-ach-settlement-windows.md'), [
      '---',
      'schema-version: 2',
      'id: L-000362',
      'notation: "362.1"',
      'domain: regulation',
      'heading: ACH settlement windows',
      'cross-references:',
      '  see-also: [L-000363]',
      'meta:',
      '  relates:',
      '    depends-on: [L-000999]',
      'citations:',
      '  - source: NACHA operating rules 2026',
      '---',
      '',
      'A leaf carrying the v2-shaped nested edge.',
      '',
    ].join('\n'));
    return fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('an undeclared nested edge is invisible — the control', () => {
  // Without the declaration the same bytes are just data the loader walks
  // past: no edge is collected, so nothing points at the dangling notation.
  // This is what makes the next test's finding attributable to the
  // declaration and nothing else.
  const before = withStore((store) => runValidate(store, { declare: false }));
  const output = `${before.stdout}${before.stderr}`;
  // Exit 0 first: a control that "passed" because of some unrelated loader or
  // CLI failure would prove nothing about the declaration.
  assert.equal(before.status, 0, `expected a clean control validation: ${output}`);
  assert.equal(output.includes('unresolved-ref'), false, `an undeclared field must not produce an edge: ${output}`);
  assert.equal(output.includes('L-000999'), false, 'the dangling target is not referenced by anything');
});

test('one declaration makes the new typed edge real, surfacing at the CLI seam', () => {
  const after = withStore((store) => runValidate(store, { declare: true }));
  const output = `${after.stdout}${after.stderr}`;

  // The unresolvable target arrives as the EXISTING unresolved-ref finding —
  // no new code, no new diagnostic code, no new message shape. An error-
  // severity loader diagnostic gates the validator to exit 2 (PRD §5: a check
  // that never ran is a blocking defect), which is the unchanged seam.
  assert.equal(after.status, 2, `expected the loader-error gate: ${output}`);
  assert.match(output, /unresolved-ref/);
  assert.match(output, /"L-000999" does not resolve to any knowledge entry or catalog-declared id/);

  // The finding names the edge by its declared path, so an author is pointed
  // at the exact member they wrote — three levels down, index included.
  assert.match(output, /meta\.relates\.depends-on\[0\]/);
  assert.match(output, /knowledge\/regulation\/362\.1-ach-settlement-windows\.md/);

  // The declaration adds exactly ONE edge; the store's other refs still resolve.
  assert.equal((output.match(/unresolved-ref/g) ?? []).length, 1, `exactly one new finding: ${output}`);
});

test('the shipped ref-field table carries no test-only edge', () => {
  // The proof above must leave nothing behind: a fake edge shipped in payload/
  // would be a phantom relationship in every seeded repo.
  const shipped = readFileSync(join(engineDir, 'lib', 'load-stores.js'), 'utf8');
  assert.equal(shipped.includes('meta.relates'), false, 'a test-only edge leaked into the shipped table');
});
