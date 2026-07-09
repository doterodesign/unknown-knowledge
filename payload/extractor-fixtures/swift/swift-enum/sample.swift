import Foundation

/// D-009 extractor fixture — swift-enum (facet pinned by `emit:` — this
/// pair's EXPECTED.yaml pins `case-name`). Adversarial-but-extractable:
/// an interior comment containing the word `case`, aligned `=` padding, a
/// trailing comment with a stray " quote, a comma-joined case list, a
/// computed property whose `switch` arms look like case declarations, and a
/// decoy sibling enum. Pair: EXPECTED.yaml.
enum PayoutSpeed: String, CaseIterable {
    case instant  = "INSTANT"
    // The word case inside a comment — case in point — is not a declaration.
    case sameDay  = "SAME_DAY" /* aligned '=' padding above */
    case standard = "STANDARD" // trailing comment with a stray " quote
    case batched, deferred // comma-joined list; implicit raw values

    var label: String {
        switch self {
        case .instant: return "Instant"
        case .sameDay: return "Same day"
        case .standard: return "Standard"
        case .batched: return "Batched"
        case .deferred: return "Deferred"
        }
    }
}

/// Decoy: an extractor scoped to `PayoutSpeed` must never bleed `wire` in.
enum PayoutRail: String {
    case wire = "WIRE"
}
