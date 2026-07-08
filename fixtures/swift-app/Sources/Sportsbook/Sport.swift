import Foundation

/// The sports registry — the idiomatic Swift anchor for `swift-enum` (PRD §5.1).
/// Raw values are wire codes and deliberately differ from the case names, so the
/// case-name facet and the raw-value facet are two distinct value sets (§3.5 emit).
///
/// ADVERSARIAL-BUT-EXTRACTABLE: interior comments (one containing the word
/// `case`), aligned `=` padding, a trailing comment with a stray `"` quote, a
/// decoy sibling enum in the same file, and a computed property whose `switch`
/// arms look like `case` declarations to a naive regex. A correct extractor
/// parses all of it; none of it is out-of-envelope.
enum Sport: String, CaseIterable {
    case football = "NFL"
    // A comment between cases must not break extraction; neither must the
    // word `case` appearing inside it — case in point.
    case basketball = "NBA"
    case baseball   = "MLB" // aligned '=' padding
    case iceHockey  = "NHL"
    case soccer = "EPL" // trailing comment with a stray " quote
    case tennis = "ATP"

    /// Switch arms below (`case .football:` …) must NOT be counted as enum
    /// cases — they sit inside the enum body but are pattern matches.
    var displayName: String {
        switch self {
        case .football: return "Football"
        case .basketball: return "Basketball"
        case .baseball: return "Baseball"
        case .iceHockey: return "Ice Hockey"
        case .soccer: return "Soccer"
        case .tennis: return "Tennis"
        }
    }
}

/// Decoy: a second enum in the same file. An extractor scoped to symbol
/// `Sport` must not bleed `team` / `individual` into its value set.
enum SportGroup: String {
    case team = "team"
    case individual = "individual"
}
