import Foundation

enum BonusCatalog {
    /// D-009 extractor fixture — swift-const-array (facet: the element
    /// strings). Adversarial-but-extractable: multi-line literal, line +
    /// block comments between members, a commented-out entry, two values on
    /// one line, a trailing comma, an explicit type annotation, and a decoy
    /// sibling array. Pair: EXPECTED.yaml.
    static let activeBonusTypes: [String] = [
        "welcome-bonus",
        "reload", // weekly
        // "cashback",  — commented-out entry must NOT be extracted
        "odds-boost", /* boosted odds */
        "referral", "loyalty", // two on one line
        "free-bet",
    ]

    /// Decoy: an extractor scoped to `activeBonusTypes` must never bleed
    /// `retired-promo` into its value set.
    static let retiredBonusTypes = ["retired-promo"]
}
