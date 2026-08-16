// UCS-1151: typed edges — concepts, paths, relates; one-hop expansion and
// reverse lookup over leaf paths.
//
// Structural neighborhood WITHOUT term luck. Four claims are pinned here, and
// each fails differently:
//
//   1. All three edge families are DECLARED, not bespoke. `concepts` and
//      `relates.*` are rows in the ref-field table, so an unresolvable target
//      is the existing unresolved-ref with no new code. `paths` names the repo
//      tree rather than an id space, so it takes the path-existence treatment
//      concept source-of-truth pointers already ride — the honest mechanism per
//      family, one golden each.
//   2. The leaf<->concept edge is derived BIDIRECTIONALLY at load. Resolving a
//      concept surfaces the leaves that declared it even when no term or alias
//      text matches — a structural join, not two authors happening to pick the
//      same words.
//   3. Reverse lookup over a path list joins through BOTH leaf paths and
//      concept source-of-truth pointers, so a diff-shaped input surfaces its
//      governing leaves, stable-sorted.
//   4. Any resolver hit carries its one-hop relates neighborhood, typed and
//      labeled by kind, stable-sorted — and the hop is exactly ONE: a
//      neighbor's neighbors are absent.
//
// Tested through the public seams: the CLI process for the validator and the
// resolver (exit codes and JSON output ARE the contract, PRD §5), direct import
// for the loader model and the declaration tables.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  LEAF_PATHS_FIELD, REF_FIELDS, RELATES_FIELD, RELATES_KINDS, leafConcepts, loadStores,
} from '../payload/engine/lib/load-stores.js';
import { CHECKS } from '../payload/engine/commands/validate.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const fixture = (name) => join(root, 'tests/fixtures/structural-validator', name);

const CLEAN = fixture('typed-edges');
const REF_FINDINGS = fixture('typed-edges-findings');
const PATH_FINDINGS = fixture('typed-edges-missing-path');

function runCli(command, ...args) {
  return spawnSync(process.execPath, [join(root, 'payload/engine', command), ...args], { encoding: 'utf8' });
}

function json(command, expectStatus, ...args) {
  const r = runCli(command, ...args, '--json');
  assert.equal(r.status, expectStatus, `expected exit ${expectStatus}, got ${r.status}: ${r.stderr}`);
  return JSON.parse(r.stdout);
}

/** The knowledge entry points one concept resolves to, by id. */
function entryPoints(payload, conceptId) {
  const result = payload.results.find((r) => r.id === conceptId);
  assert.ok(result, `concept ${conceptId} did not resolve`);
  return result.knowledge;
}

// ---------------- AC1: all three families declared; each dangles at its seam

test('all three edge families are declared, and paths is deliberately not a ref row', () => {
  const declared = REF_FIELDS['knowledge-leaf'].map((row) => row.field);
  // concepts and the four relates kinds ride the ref graph: they target ID
  // SPACES, which is the only question that table knows how to ask.
  assert.ok(declared.includes('concepts'), '`concepts` is a declared typed edge');
  for (const kind of ['depends-on', 'see-also', 'contradicts', 'supersedes']) {
    assert.ok(
      declared.includes(`${RELATES_FIELD}.${kind}`),
      `relates.${kind} is a declared typed edge`,
    );
  }
  // The row's SPACE is what makes the edge mean something: concepts reach the
  // ontology, relates reaches the leaf space. A row pointed at the wrong space
  // would resolve against the wrong store and pass or fail for the wrong reason.
  const spaceOf = (field) => REF_FIELDS['knowledge-leaf'].find((r) => r.field === field)?.space;
  assert.equal(spaceOf('concepts'), 'concepts');
  assert.equal(spaceOf(`${RELATES_FIELD}.depends-on`), 'leaves');

  // `paths` is NOT here, and that is the design rather than an omission: the
  // ref graph resolves ids, and a repo path is not an id. Declaring it would
  // have asked whether "src/api/handler.ts" resolves to a knowledge entry,
  // which it never could — every leaf carrying a path would fail for the wrong
  // reason. It gets path existence instead, which is a real check with a real
  // finding, just a different one.
  assert.equal(
    declared.includes(LEAF_PATHS_FIELD), false,
    '`paths` names the working tree, not an id space — it must not be a ref row',
  );
  assert.ok(CHECKS.includes('missing-path'), 'path existence is a declared structural check');
});

test('RELATES_KINDS is derived from the table, never restated', () => {
  // The resolver expands over exactly the kinds the ref graph resolves, because
  // it reads them off the same declaration. Restating the list would let a
  // fifth kind be resolvable but never expanded — an edge that validates and
  // then silently fails to surface.
  const fromTable = REF_FIELDS['knowledge-leaf']
    .map((row) => row.field)
    .filter((field) => typeof field === 'string' && field.startsWith(`${RELATES_FIELD}.`))
    .map((field) => field.slice(RELATES_FIELD.length + 1));
  assert.deepEqual([...RELATES_KINDS], fromTable);
  assert.deepEqual([...RELATES_KINDS], ['depends-on', 'see-also', 'contradicts', 'supersedes']);
});

test('golden: an unresolvable concepts target and an unresolvable relates target each dangle', () => {
  // Both ID-space families reach the SAME existing finding, with no new
  // diagnostic code and no per-family branch: that is what "declared, not
  // bespoke" buys. An error-severity loader diagnostic gates the validator to
  // exit 2 — a check that never ran is a blocking defect (PRD §5).
  const r = runCli('validate.js', '--root', REF_FINDINGS);
  assert.equal(r.status, 2, `expected the loader-error gate: ${r.stdout}${r.stderr}`);
  const out = `${r.stdout}${r.stderr}`;
  assert.match(out, /unresolved-ref {2}knowledge\/library\/501\.1-result-ordering\.md {2}concepts\[0\]/);
  assert.match(out, /"K-999" does not resolve to any ontology entry or catalog-declared id/);
  assert.match(out, /unresolved-ref {2}knowledge\/library\/501\.1-result-ordering\.md {2}relates\.depends-on\[0\]/);
  assert.match(out, /"L-000999" does not resolve to any knowledge entry or catalog-declared id/);
  // Exactly two: the store's other edges all resolve, so nothing is
  // over-reported and the two findings are attributable to the two dangles.
  assert.equal((out.match(/unresolved-ref/g) ?? []).length, 2, out);
});

test('golden: an unresolvable paths target is a missing-path finding at the validator seam', () => {
  // The third family, at the seam that can honestly judge it. Same CODE a
  // concept's dead source-of-truth pointer earns, because it is the same defect
  // class: a declared pointer into the working tree that is not there.
  const payload = json('validate.js', 1, '--root', PATH_FINDINGS);
  assert.deepEqual(
    payload.findings.map((f) => [f.code, f.severity, f.id, f.path]),
    [['missing-path', 'error', 'L-000501', 'paths[1]']],
  );
  // The index points at the entry an author would edit — the FIRST path in the
  // same list exists, so the finding is per-entry rather than per-leaf.
  assert.match(payload.findings[0].message, /deleted-by-a-refactor\.ts/);
  // No demotion for leaves: unlike a deprecated concept (§3.5's source-deletion
  // escape hatch), nothing about a leaf's promotion stage licenses a dangling
  // pointer, so this stays blocking.
  assert.equal(payload.counts.errors, 1);
});

// ------------------------ pointers may only name things inside THIS repo

/**
 * Copy the clean fixture into a temp dir and hand it to `fn` — with a real file
 * sitting OUTSIDE the copied repo, at `<dir>/outside/secret.ts`.
 *
 * That outside file is the whole point of the harness. Without it an escaping
 * pointer would fail as `missing` and every containment test would pass for the
 * wrong reason, proving nothing about containment at all.
 *
 * `fn` receives both the repo root and the parent dir, since a test that plants
 * a symlink needs to name a target outside the repo.
 */
function withEscapeStore(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'uk-1151-escape-'));
  try {
    const repo = join(dir, 'repo');
    cpSync(CLEAN, repo, { recursive: true });
    mkdirSync(join(dir, 'outside'), { recursive: true });
    writeFileSync(join(dir, 'outside', 'secret.ts'), '// outside the repo\n');
    return fn(repo, dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Rewrite one file inside a prepared store, by string replacement. */
function rewrite(file, find, replacement) {
  writeFileSync(file, readFileSync(file, 'utf8').replace(find, replacement));
}

/** The fixture leaf whose `paths` list the containment tests rewrite. */
const leafOf = (repo) => join(repo, 'knowledge/library/501.1-result-ordering.md');

/** Replace the leaf's `paths` list with `entries`, then validate the store. */
function validateWithLeafPaths(entries, expectStatus = 1) {
  return withEscapeStore((repo) => {
    rewrite(leafOf(repo), '  - src/retrieval', entries.map((e) => `  - ${e}`).join('\n'));
    return json('validate.js', expectStatus, '--root', repo);
  });
}

test('a leaf path that escapes the repo root is a finding, even when the target exists', () => {
  // `join(repoRoot, p)` resolves `../outside/secret.ts` to a real file OUTSIDE
  // the repo. Judged on existence alone it passes — so the store's verdict
  // would depend on what sits outside it, passing on the author's machine and
  // failing on a machine where that file is absent. A check whose answer comes
  // from outside the unit under review is not a check.
  const payload = validateWithLeafPaths(['../outside/secret.ts']);
  assert.deepEqual(
    payload.findings.map((f) => [f.code, f.severity, f.path]),
    [['missing-path', 'error', 'paths[0]']],
  );
  assert.match(payload.findings[0].message, /resolves outside the repo root/);
});

test('an absolute leaf path is refused the same way — it is not repo-relative', () => {
  // `/etc/passwd` joins to `<repoRoot>/etc/passwd`, which is a different claim
  // than the author wrote. Paths are repo-relative (§9.1); an absolute one is
  // refused rather than silently reinterpreted.
  const payload = validateWithLeafPaths(['/etc/passwd']);
  assert.deepEqual(payload.findings.map((f) => f.code), ['missing-path']);
  assert.match(payload.findings[0].message, /resolves outside the repo root/);
});

test('a leaf path naming the repo root is refused — a pointer at everything attributes nothing', () => {
  // `.` normalizes to the empty path, which the reverse lookup cannot act on:
  // it would either match nothing (a silent no-op) or match everything (one
  // leaf in front of every developer regardless of what they touched). Neither
  // is a claim worth having, so it is refused where it is authored. The
  // resolver's `--paths` input side already refuses the same shape.
  const payload = validateWithLeafPaths(['"."']);
  assert.deepEqual(payload.findings.map((f) => f.code), ['missing-path']);
  assert.match(payload.findings[0].message, /names the repo root/);

  // ...and the resolver does not act on such a pointer either, since it never
  // gates on store health (§4) and so can be pointed at an unvalidated store.
  // Under-report rather than false-attribute: §3.1's costlier-error direction.
  const resolved = withEscapeStore((repo) => {
    rewrite(leafOf(repo), '  - src/retrieval', '  - "."');
    // The CHECKED helper: an unasserted spawn that failed would parse empty
    // stdout and throw somewhere less legible, or worse, satisfy a negative
    // assertion by returning nothing at all.
    return json('resolve.js', 0, '--paths', 'src/index/build.ts', '--root', repo);
  });
  // Anchored positively first — the lookup really did answer, with exactly the
  // leaves that legitimately govern this path. Without this, the negative below
  // would pass just as well against an empty result.
  assert.deepEqual(
    resolved.paths[0].knowledge.map((k) => [k.via, k.id]),
    [['direct', 'L-000510'], ['concept', 'L-000511']],
  );
  // ...and the root-pointer leaf is not among them.
  assert.equal(
    resolved.paths[0].knowledge.some((k) => k.id === 'L-000501'), false,
    'a root pointer must not attribute its leaf to every path',
  );
});

test('a symlink INSIDE the repo whose target is outside is still an escape', (t) => {
  // Containment cannot be judged lexically alone. `src/link.ts` sits inside the
  // repo by every string test there is, and resolves to a file outside it — so
  // the store's verdict would once again depend on something it does not
  // contain, which is the exact defect the lexical check was added to close.
  // Canonicalizing both sides is what actually closes it.
  const payload = withEscapeStore((repo, dir) => {
    try {
      // Escapes via link; stays inside via link; and a link to nothing.
      symlinkSync(join(dir, 'outside', 'secret.ts'), join(repo, 'src/link.ts'));
      symlinkSync(join(repo, 'src/index/build.ts'), join(repo, 'src/inlink.ts'));
      symlinkSync(join(dir, 'outside', 'gone.ts'), join(repo, 'src/dangling.ts'));
    } catch {
      // Some platforms and CI sandboxes forbid symlink creation outright.
      // There is no hole to test where there are no symlinks.
      return null;
    }
    rewrite(
      leafOf(repo), '  - src/retrieval',
      '  - src/link.ts\n  - src/inlink.ts\n  - src/dangling.ts\n  - src/retrieval',
    );
    return json('validate.js', 1, '--root', repo);
  });
  if (payload === null) {
    t.skip('symlink creation not permitted here');
    return;
  }
  assert.deepEqual(
    payload.findings.map((f) => f.path),
    [
      // paths[0] escapes THROUGH the link...
      'paths[0]',
      // ...paths[1] resolves back inside and is fine, so it is absent...
      // ...and paths[2] is a link to nothing, which is missing rather than
      // escaping: statSync follows links, and an author pointed at an escape
      // would go looking for a target that is not there to find.
      'paths[2]',
    ],
  );
  assert.match(payload.findings[0].message, /resolves outside the repo root/);
  assert.match(payload.findings[1].message, /does not exist in the working tree/);
});

test('concept source-of-truth pointers are held to the same containment rule', () => {
  // The two pointer families had the same hole independently, which is why the
  // containment test lives in ONE function both of them call. A leaf's paths
  // and a concept's source-of-truth are the same kind of claim about the same
  // repo, so they must not be judged by two different rules.
  const payload = withEscapeStore((repo) => {
    rewrite(
      join(repo, 'ontology/classes/200-retrieval.yaml'),
      'source-of-truth: [src/index/build.ts]',
      'source-of-truth: [../outside/secret.ts]',
    );
    return json('validate.js', 1, '--root', repo);
  });
  assert.deepEqual(
    payload.findings.map((f) => [f.code, f.id, f.path]),
    [['missing-path', 'K-202', 'source-of-truth[0]']],
  );
  assert.match(payload.findings[0].message, /resolves outside the repo root/);
});

test('a DEPRECATED concept does not demote an escaping pointer to a warning', () => {
  // §3.5 demotes a deprecated concept's missing-path to a warning: the
  // source-deletion escape hatch, so a PR that deletes an artifact can land
  // without dead-ending. That hatch is about a path that USED to exist. It says
  // nothing about a pointer that was never this store's to make, and demoting
  // one would let a malformed claim ship under a warning at exit 0.
  const payload = withEscapeStore((repo) => {
    rewrite(
      join(repo, 'ontology/classes/200-retrieval.yaml'),
      '    source-of-truth: [src/index/build.ts]\n    status: active',
      '    source-of-truth: [../outside/secret.ts, src/gone.ts]\n    status: deprecated',
    );
    return json('validate.js', 1, '--root', repo);
  });
  assert.deepEqual(
    payload.findings.map((f) => [f.severity, f.path]),
    [
      // The escaping pointer stays blocking...
      ['error', 'source-of-truth[0]'],
      // ...while an ordinarily absent one still demotes, so the hatch it
      // exists for is untouched.
      ['warning', 'source-of-truth[1]'],
    ],
  );
});

// ------------- AC2: the leaf<->concept edge is derived bidirectionally at load

test('the loader derives concept -> leaves from the leaf-side declaration', () => {
  const model = loadStores(CLEAN);
  assert.equal(model.ok, true);
  // Authored ONCE, leaf-side, because deciding what a leaf is about is
  // curatorial work under the human write gate...
  assert.deepEqual(leafConcepts(model.leaves.get('L-000501').record), ['K-201']);
  // ...and traversable from the other end, which is what the reverse index is.
  assert.deepEqual(model.leavesByConcept.get('K-201'), ['L-000501']);
  assert.deepEqual(model.leavesByConcept.get('K-202'), ['L-000510', 'L-000511']);
  // Sorted, so the index is byte-stable regardless of file walk order.
  const keys = [...model.leavesByConcept.keys()];
  assert.deepEqual(keys, [...keys].sort());
});

test('golden: resolving a concept surfaces its declaring leaves with NO term match', () => {
  // The acceptance criterion, stated as a fixture property first: K-201's term
  // and summary vocabulary appears in no leaf's `terms`, so the pre-1151
  // textual join reaches nothing at all.
  const model = loadStores(CLEAN);
  const concept = model.concepts.get('K-201').record;
  // Both sides lowercased: the join this guards is case-INSENSITIVE, so a
  // Title-Case alias compared raw would slip past the invariant and leave the
  // test claiming a textual miss that had actually become a hit.
  const names = new Set(
    [concept.term, ...(concept.aliases ?? [])].map((name) => name.toLowerCase()),
  );
  for (const leaf of model.leaves.values()) {
    for (const term of leaf.record.terms ?? []) {
      assert.equal(
        names.has(term.toLowerCase()), false,
        `fixture invariant broken: leaf term "${term}" now matches K-201 textually, which would make this test prove nothing`,
      );
    }
  }

  // And the leaf surfaces anyway, because it DECLARED the concept. This is the
  // whole point: rename the concept's term, or write the leaf in different
  // words, and the two still find each other.
  const knowledge = entryPoints(json('resolve.js', 0, 'retrieval', 'ranking', '--root', CLEAN), 'K-201');
  assert.deepEqual(
    knowledge.map((k) => [k.via, k.id, k.heading]),
    [['declared', 'L-000501', 'Result ordering']],
  );
});

test('the textual join still fires, and the structural claim wins a tie', () => {
  // K-202 is reachable BOTH ways. L-000510 declares it AND names it in `terms`;
  // L-000511 only declares it. Both surface, and both report `declared` —
  // the structural edge is the stronger claim and the one that survives a
  // concept rename, so it wins the tie rather than being masked by the weaker
  // one that happens to also hold.
  const knowledge = entryPoints(json('resolve.js', 0, 'index', 'build', '--root', CLEAN), 'K-202');
  assert.deepEqual(
    knowledge.map((k) => [k.via, k.id]),
    [['declared', 'L-000510'], ['declared', 'L-000511']],
  );

  // A leaf reached ONLY by term text still reports `terms` — the pre-1151 join
  // is not removed, it is joined by a stronger one. Proven on the pinned
  // resolver fixture, whose leaves declare no concepts at all.
  const legacy = entryPoints(
    json('resolve.js', 0, 'settlement', '--root', join(root, 'tests/fixtures/resolver/store')),
    'K-120',
  );
  assert.deepEqual(legacy.map((k) => k.via), ['terms']);
});

// ---------------- AC3: reverse lookup joins leaf paths AND concept pointers

test('golden: a diff-shaped path list surfaces its governing leaves, stable-sorted', () => {
  // A comma list of repo paths is what a diff hands over. Deliberately given
  // out of order, so the sort is the test rather than the input.
  const payload = json(
    'resolve.js', 0, '--paths', 'src/index/build.ts,src/retrieval/rank.ts', '--root', CLEAN,
  );
  assert.deepEqual(
    payload.paths.map((p) => [
      p.path,
      p.concepts.map((c) => c.id),
      p.knowledge.map((k) => [k.via, k.id]),
    ]),
    [
      // src/index/build.ts is a FILE pointer named by both K-202's
      // source-of-truth and L-000510's `paths`. L-000511 arrives through the
      // concept hop alone — it declares K-202 and names no path of its own.
      ['src/index/build.ts', ['K-202'], [['direct', 'L-000510'], ['concept', 'L-000511']]],
      // src/retrieval is a FOLDER pointer on both sides, so a file beneath it
      // nests exactly as concept pointers already did (§3.1).
      ['src/retrieval/rank.ts', ['K-201'], [['direct', 'L-000501']]],
    ],
  );
});

test('reverse lookup is byte-stable across runs and across input order', () => {
  const forward = runCli('resolve.js', '--paths', 'src/retrieval/rank.ts,src/index/build.ts', '--root', CLEAN, '--json');
  const reversed = runCli('resolve.js', '--paths', 'src/index/build.ts,src/retrieval/rank.ts', '--root', CLEAN, '--json');
  assert.equal(forward.stdout, reversed.stdout, 'input order must not reach the output');
  assert.doesNotMatch(forward.stdout, /\d{4}-\d{2}-\d{2}T/, 'no timestamps');
});

test('a path no leaf governs is a normal outcome — empty, exit 0', () => {
  const payload = json('resolve.js', 0, '--paths', 'src/retrieval', '--root', CLEAN);
  // The pointer itself resolves; a path nothing declares simply has no leaves.
  const unmapped = json('resolve.js', 0, '--paths', 'src/nowhere/at-all.ts', '--root', CLEAN);
  assert.deepEqual(unmapped.paths, [{ path: 'src/nowhere/at-all.ts', concepts: [], knowledge: [] }]);
  assert.ok(payload.paths[0].knowledge.length > 0, 'the declared path still attributes');
});

test('the human surface names the governing knowledge and how it was reached', () => {
  const human = runCli('resolve.js', '--paths', 'src/index/build.ts', '--root', CLEAN);
  assert.equal(human.status, 0, human.stderr);
  assert.match(human.stdout, /governing knowledge:/);
  assert.match(human.stdout, /L-000510 {2}502\.1 {2}Index build batch {2}\[via direct\]/);
  assert.match(human.stdout, /L-000511 {2}502\.2 {2}Index freshness window {2}\[via concept\]/);
});

// -------------------- AC4: one-hop relates neighborhood, and exactly one hop

test('golden: a hit carries its one-hop neighborhood, typed and labeled by kind', () => {
  const [hit] = entryPoints(json('resolve.js', 0, 'retrieval', 'ranking', '--root', CLEAN), 'K-201');
  assert.deepEqual(hit[RELATES_FIELD], {
    'depends-on': [{
      id: 'L-000502',
      notation: '501.2',
      heading: 'Score computation',
      file: 'knowledge/library/501.2-score-computation.md',
    }],
    'see-also': [{
      id: 'L-000504',
      notation: '501.4',
      heading: 'Ordering rationale',
      file: 'knowledge/library/501.4-ordering-rationale.md',
    }],
    contradicts: [{
      id: 'L-000505',
      notation: '501.5',
      heading: 'Recency ordering',
      file: 'knowledge/library/501.5-recency-ordering.md',
    }],
    // Present and empty, never absent: one result shape, so a consumer never
    // needs a presence check to tell "no supersedes edges" from "this engine
    // predates supersedes".
    supersedes: [],
  });
});

test('the hop is exactly ONE — a neighbor\'s neighbors are absent', () => {
  // The fixture is a three-leaf chain: 501.1 -depends-on-> 501.2
  // -depends-on-> 501.3. Depth 1 from 501.1 reaches 501.2 and stops.
  const [hit] = entryPoints(json('resolve.js', 0, 'retrieval', 'ranking', '--root', CLEAN), 'K-201');
  const reached = Object.values(hit[RELATES_FIELD]).flat().map((n) => n.id);
  assert.ok(reached.includes('L-000502'), 'the direct neighbor is present');
  assert.equal(
    reached.includes('L-000503'), false,
    'L-000503 is two hops away and must be absent — the hop is one, not "one or more"',
  );
  // ...and it really is reachable at depth 2, so its absence is the boundary
  // rather than a broken fixture: the middle leaf does declare it.
  const model = loadStores(CLEAN);
  assert.deepEqual(
    model.leaves.get('L-000502').record[RELATES_FIELD]['depends-on'],
    ['501.3'],
  );
});

test('neighbors resolve under either legal citation spelling', () => {
  // 501.2 cites 501.3 by NOTATION while 501.3 carries an accession. Both
  // spellings are legal while the migrate batches run (UCS-1144), so neither is
  // a second-class lookup — and the neighborhood publishes the leaf's identity
  // regardless of how the citation happened to spell it.
  const model = loadStores(CLEAN);
  // The setup: the citation is spelled as a NOTATION, the target carries an
  // ACCESSION, and the two are the same leaf.
  assert.deepEqual(model.leaves.get('L-000502').record[RELATES_FIELD]['depends-on'], ['501.3']);
  assert.equal(model.leaves.get('L-000503').notation, '501.3');

  // The claim, asserted where it is actually observable: the middle leaf's
  // PUBLISHED neighborhood resolves that notation to the accessioned leaf and
  // emits its identity, not the spelling the citation happened to use. The
  // middle leaf reaches the resolver as a one-hop neighbor of L-000501, so this
  // also pins that a neighbor is published by identity at any position.
  const [head] = entryPoints(json('resolve.js', 0, 'retrieval', 'ranking', '--root', CLEAN), 'K-201');
  assert.deepEqual(head[RELATES_FIELD]['depends-on'], [{
    id: 'L-000502',
    notation: '501.2',
    heading: 'Score computation',
    file: 'knowledge/library/501.2-score-computation.md',
  }]);
  // And the notation-cited leaf resolves to its accession wherever it is
  // published in its own right — here as a direct hit's neighbor would be, via
  // the loader's alias index rather than a second id lookup.
  assert.equal(model.leafAliases.get('501.3'), 'L-000503');
});

test('every leaf the resolver publishes carries a neighborhood, in both modes', () => {
  // "Any resolver hit" means any: the neighborhood is attached where the leaf
  // is published, not per mode, so a mode added later cannot forget it.
  const query = entryPoints(json('resolve.js', 0, 'index', 'build', '--root', CLEAN), 'K-202');
  const paths = json('resolve.js', 0, '--paths', 'src/index/build.ts', '--root', CLEAN).paths[0].knowledge;
  for (const leaf of [...query, ...paths]) {
    assert.deepEqual(
      Object.keys(leaf[RELATES_FIELD]), [...RELATES_KINDS],
      'every declared kind is a stable key, in declaration order',
    );
  }
});

test('the human surface labels each neighborhood by edge kind', () => {
  const human = runCli('resolve.js', 'retrieval', 'ranking', '--root', CLEAN);
  assert.equal(human.status, 0, human.stderr);
  assert.match(human.stdout, /depends-on: L-000502 "Score computation"/);
  assert.match(human.stdout, /contradicts: L-000505 "Recency ordering"/);
  // Empty kinds are omitted from the HUMAN surface (the opposite of the JSON
  // contract, on purpose): four "(none)" lines per leaf bury the real hits.
  assert.doesNotMatch(human.stdout, /supersedes:/);
});

// ------------------------------------------------ the whole store still loads

test('the typed-edges fixture validates clean — every declared edge resolves', () => {
  const payload = json('validate.js', 0, '--root', CLEAN);
  assert.deepEqual(payload.findings, []);
  assert.equal(payload['store-health'].ok, true);
});
