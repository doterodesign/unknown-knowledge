// UCS-940: the signature table and the Extractor-kind registry cannot drift.
//
// Two adapters at one seam. `ANCHOR_SIGNATURES` (survey-map's Anchor-candidate
// pre-scan) NAMES the kinds; `KINDS` (the extractor registry) IMPLEMENTS them.
// Nothing held them together — no test imported both.
//
// Rename or typo a kind on one side and the survey map cheerfully surfaces
// Anchor candidates that no Extractor kind can ever read. The bootstrap skill
// then triages such a candidate into a Concept whose `enumerates` block can
// never be re-derived, so `validate-values` cannot check it and the reverse
// audit cannot see it. The failure is silent, and it lands in a client's Store.
//
// These tests import both and hold them to each other.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ANCHOR_SIGNATURES } from '../payload/engine/lib/anchor-signatures.js';
import { KINDS } from '../payload/engine/lib/extractor-kinds.js';

const registered = () => Object.keys(KINDS).sort();
const signed = () => [...new Set(ANCHOR_SIGNATURES.map((s) => s.kind))].sort();

/**
 * The ONE intentional asymmetry, named rather than silently tolerated.
 *
 * `test-lines` reads newline-delimited registry files. It exists to prove the
 * three things the registry's contract rests on — that `checkDescriptor`
 * dispatches by kind, that an out-of-envelope sentinel is a hard error rather
 * than a confident wrong parse (PRD §5), and that extraction is deterministic.
 *
 * It has no signature because a signature is how the survey map GUESSES that
 * some file in a client repo might be an Anchor. "A file of lines" describes
 * every text file ever written; proposing them all as Anchor candidates would
 * bury the real ones. So the kind is reachable only when a human names it in a
 * descriptor, never proposed by the pre-scan.
 */
const REGISTRY_EXCESS = new Set(['test-lines']);

test('every signature names a kind the registry implements', () => {
  const orphans = signed().filter((kind) => !Object.hasOwn(KINDS, kind));
  assert.deepEqual(orphans, [],
    'the survey map would surface Anchor candidates no Extractor kind can read: ' + orphans.join(', '));
});

test('the registry excess is exactly the dispatch-proving kind, and nothing else', () => {
  // Not `orphans.length === 1`, and not a skip. A kind added to the registry
  // without a signature is a real decision — either it should be discoverable
  // and needs one, or it is deliberately human-named like test-lines and
  // belongs in REGISTRY_EXCESS with a reason. This test forces the choice.
  const excess = registered().filter((kind) => !signed().includes(kind));
  assert.deepEqual(excess, [...REGISTRY_EXCESS].sort(),
    'a registered kind has no anchor signature: either give it one, or record here why the survey map must never propose it');
});

test('the two sides partition the kinds — nothing is invented or lost', () => {
  const union = new Set([...registered(), ...signed()]);
  assert.deepEqual([...union].sort(), registered(),
    'a signature names a kind that exists nowhere in the registry');
  assert.equal(signed().length + REGISTRY_EXCESS.size, registered().length,
    'every registered kind is either discoverable by signature or deliberately not');
});

/** True when the registry entry is the directory-reading shape, not a text extractor. */
const readsDirectory = (entry) => typeof entry === 'object' && entry !== null && entry.reads === 'directory';

test('every registered kind is one of the two shapes checkDescriptor dispatches on', () => {
  for (const [kind, entry] of Object.entries(KINDS)) {
    if (readsDirectory(entry)) {
      assert.equal(typeof entry.extract, 'function', `${kind}: a directory kind extracts from a listing`);
    } else {
      assert.equal(typeof entry, 'function', `${kind}: a text kind is an extractor over file text`);
    }
  }
});

test('a kind reads a directory exactly when its signature has no file predicate', () => {
  // The seam's real invariant, and the one a rename cannot preserve by accident.
  // A signature's `extensions`/`pattern` are how the pre-scan decides whether a
  // FILE looks like an Anchor. A directory kind has no file to look at, so both
  // must be null — and a text kind must have at least one, or the pre-scan
  // would propose every tracked path as a candidate.
  for (const sig of ANCHOR_SIGNATURES) {
    const entry = KINDS[sig.kind];
    const noFilePredicate = sig.extensions === null && sig.pattern === null;
    assert.equal(readsDirectory(entry), noFilePredicate,
      `${sig.kind}: a directory kind must have no extensions/pattern, and a text kind must have one`);
  }
});

test('every signature is well formed', () => {
  for (const sig of ANCHOR_SIGNATURES) {
    assert.ok(typeof sig.kind === 'string' && sig.kind.length > 0, 'a signature names its kind');
    assert.ok(typeof sig.reads === 'string' && sig.reads.length > 0, `${sig.kind}: a signature says what it reads`);
    if (sig.pattern !== null) {
      // survey-map compiles these against file text. A signature whose regex
      // does not compile turns the pre-scan into an engine failure.
      assert.doesNotThrow(() => new RegExp(sig.pattern, sig.flags), `${sig.kind}: pattern must compile`);
      // A stateful flag (`g`/`y`) carries lastIndex between `.test()` calls, so
      // the same file would match or not depending on what was scanned before.
      // The survey map must be deterministic (D-014).
      assert.doesNotMatch(sig.flags, /[gy]/, `${sig.kind}: a stateful regex flag would make the pre-scan order-dependent`);
    }
    if (sig.extensions !== null) {
      assert.ok(Array.isArray(sig.extensions) && sig.extensions.length > 0, `${sig.kind}: extensions is a non-empty list or null`);
      for (const ext of sig.extensions) {
        assert.match(ext, /^\.[a-z0-9]+$/, `${sig.kind}: "${ext}" must be a lowercase dotted extension`);
      }
    }
  }
});

test('a kind is spelled the same on both sides — no near-miss aliases', () => {
  // A rename on one side alone usually reads as "orphan signature + registry
  // excess", which the tests above already catch. This catches the subtler
  // case: a kind whose two spellings differ only in punctuation or case, where
  // a reader skims both lists and sees the same word twice.
  const norm = (k) => k.toLowerCase().replace(/[^a-z0-9]/g, '');
  const byNorm = new Map();
  for (const kind of new Set([...registered(), ...signed()])) {
    const key = norm(kind);
    const seen = byNorm.get(key);
    assert.equal(seen, undefined, `"${kind}" and "${seen}" differ only in punctuation or case`);
    byNorm.set(key, kind);
  }
});
