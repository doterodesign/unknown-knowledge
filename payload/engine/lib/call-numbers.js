/**
 * Synthesized call numbers (UCS-1158) — a display string, and never an identity.
 *
 * A call number is what a browse tree PRINTS beside a leaf so a reader scanning
 * a shelf has a compact handle for where that leaf sits in this particular
 * projection. It is derived, every time, from the leaf's facets. It is not
 * stored, not indexed, not resolvable, and not citable.
 *
 * That last part is the whole reason this module is careful rather than
 * cosmetic. The store this engine serves spent its first life with a Dewey-style
 * dotted notation that fused identity, location and browse order into one
 * string, and the cost of that fusion is what UCS-1147 spent a migration
 * undoing: a citation pointed at a position, so moving a leaf broke every
 * reference to it. A synthesized call number is the SAME SHAPE of string
 * arriving through a different door — positional, human-friendly, and highly
 * tempting to paste into a `see-also`. If that paste ever resolved, the whole
 * inversion would quietly reverse itself one convenient citation at a time.
 *
 * So the defense is structural rather than advisory, in three parts:
 *
 *   1. The grammar cannot be mistaken for an id. `L-000117` is the accession;
 *      a call number looks like `DES-COM/REF·L-000117` — uppercase facet
 *      abbreviations, a slash, and a MIDDLE DOT that no id grammar accepts.
 *      `assertNoIdSpaceMatches` (below) proves it against every compiled id
 *      space in ID_GRAMMARS rather than against a remembered list, so a new id
 *      space cannot silently start matching call numbers.
 *   2. Nothing accepts one. The citation grammar is `leaf-ref`, accession-only
 *      since UCS-1147, so a call number in a citation-shaped field is already a
 *      finding — no new check was needed, and tests/derived-call-numbers pins
 *      that it stays that way.
 *   3. The accession travels INSIDE the call number, as its suffix. A reader
 *      who copies the whole string still carries the identity, and a reader who
 *      wants the citable part can see exactly which half it is. The tempting
 *      thing to paste therefore contains the correct thing to paste.
 *
 * The call number is NOT stable across projections, and that is a feature: the
 * same leaf reads `DES-COM/REF·L-000117` in the domain-first tree and
 * `REF/DES-COM·L-000117` in the form-first one, because the call number
 * describes a POSITION in a projection, and that leaf holds two of them. A
 * string that changed meaning between trees while looking stable would be the
 * worst of both worlds; one that visibly reorders says what it is.
 */
import { idPattern, ID_GRAMMARS } from './id-grammars.js';

/**
 * The separator between the positional part and the accession.
 *
 * U+00B7 MIDDLE DOT, chosen because no id grammar in this engine accepts it and
 * none plausibly will: the id spaces are all `[A-Z]-[0-9]` or dotted decimals,
 * and a middle dot is not a character an author reaches for when minting an id.
 * It is also visually distinct from the ASCII period that the LEGACY notation
 * used, so `362.1` and `DES-COM/REF·L-000117` cannot be skim-confused.
 */
export const CALL_NUMBER_SEPARATOR = '·';

/** How many characters of each facet segment survive into the abbreviation. */
const SEGMENT_WIDTH = 3;

/** What a facet segment abbreviates to when it is missing entirely. */
const ABSENT_SEGMENT = 'UNC';

/**
 * Abbreviate one facet segment for display.
 *
 * Uppercased and truncated to three characters, with non-alphanumerics dropped
 * so a segment like `components` reads `COM` rather than `COM-`. Deliberately
 * LOSSY: two segments can abbreviate to the same three letters, and that is
 * fine because nothing resolves through this string — the accession suffix is
 * what disambiguates, and it is exact. Making the abbreviation collision-free
 * would mean minting and remembering it, which is precisely the property that
 * would turn a display string back into an identity.
 *
 * An absent or non-string segment reads `UNC` (unclassified) rather than
 * collapsing to an empty string. An empty abbreviation would make
 * `/REF·L-000117` — a call number with a hole where a facet should be, which
 * reads as a formatting bug rather than as the fact that the leaf declares no
 * domain. The tree also demotes such a leaf; the call number says why.
 *
 * @param {unknown} segment one facet path segment
 * @returns {string} the display abbreviation
 */
export function abbreviateSegment(segment) {
  if (typeof segment !== 'string') return ABSENT_SEGMENT;
  const cleaned = segment.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  return cleaned === '' ? ABSENT_SEGMENT : cleaned.slice(0, SEGMENT_WIDTH);
}

/**
 * Synthesize the call number for one leaf, in one projection.
 *
 * The positional half is the projection's own path — the same segments the tree
 * nested this leaf under, abbreviated and slash-joined — so the call number and
 * the position it describes cannot disagree: both are built from one array.
 * That is the invariant worth protecting, and it is why this function takes the
 * path rather than re-deriving it from the leaf's facets. A second derivation
 * would be a second chance to differ.
 *
 * The identity half is the accession, verbatim. A leaf that mints none (which
 * the schema refuses, but the derived layer never gates on store health) prints
 * the absent marker instead, so the string stays well-formed and the missing
 * identity is visible rather than swallowed.
 *
 * @param {string[]} path the projection's facet path for this leaf
 * @param {string|null} accession the leaf's accession id, or null
 * @returns {string} the synthesized display string
 */
export function synthesizeCallNumber(path, accession) {
  const positional = path.length
    ? path.map(abbreviateSegment).join('/')
    : ABSENT_SEGMENT;
  const identity = typeof accession === 'string' && accession !== '' ? accession : ABSENT_SEGMENT;
  return `${positional}${CALL_NUMBER_SEPARATOR}${identity}`;
}

/**
 * Prove a synthesized call number is not an id in ANY space this engine knows.
 *
 * Enumerates ID_GRAMMARS rather than checking a remembered list of spaces, so
 * adding an id space that happened to accept middle dots would fail here at the
 * moment it was added rather than the first time somebody cited a shelf label.
 * Returns the offending spaces rather than throwing: the caller decides whether
 * that is a test failure or a finding, and a library that threw would make the
 * check unusable from the one place it matters most — a test asserting the
 * property holds for every call number a real store generates.
 *
 * @param {string} callNumber a synthesized display string
 * @returns {string[]} the id spaces that would accept it — empty when safe
 */
export function idSpacesMatching(callNumber) {
  return Object.keys(ID_GRAMMARS)
    .filter((space) => idPattern(space).test(callNumber))
    .sort();
}
