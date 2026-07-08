import Foundation

enum MarketCatalog {
    /// `swift-const-array` anchor (PRD §5.1).
    ///
    /// ADVERSARIAL-BUT-EXTRACTABLE: multi-line literal, interior comments, a
    /// commented-out entry, two values on one line, a trailing comma, and a
    /// decoy sibling array under a different symbol.
    static let supportedMarkets: [String] = [
        "moneyline",
        "spread", // aka handicap
        // "teaser",  — commented-out entry must NOT be extracted
        "totals",
        "parlay", "same_game_parlay", // two on one line
        "props",
    ]

    /// Decoy: same element type, different symbol. An extractor scoped to
    /// `supportedMarkets` must not bleed `pleaser` into its value set.
    static let retiredMarkets = ["pleaser"]
}
