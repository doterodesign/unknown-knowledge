import Foundation

enum ActionCatalog {
    /// `swift-const-array` anchor (PRD §5.1).
    ///
    /// ADVERSARIAL-BUT-EXTRACTABLE: multi-line literal, interior comments, a
    /// commented-out entry, two values on one line, a trailing comma, and a
    /// decoy sibling array under a different symbol.
    static let supportedActions: [String] = [
        "align",
        "distribute", // aka space evenly
        // "outline_stroke",  — commented-out entry must NOT be extracted
        "tidy",
        "group", "boolean_union", // two on one line
        "flatten",
    ]

    /// Decoy: same element type, different symbol. An extractor scoped to
    /// `supportedActions` must not bleed `explode` into its value set.
    static let retiredActions = ["explode"]
}
