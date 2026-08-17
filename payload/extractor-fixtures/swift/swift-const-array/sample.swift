import Foundation

enum TemplateCatalog {
    /// D-009 extractor fixture — swift-const-array (facet: the element
    /// strings). Adversarial-but-extractable: multi-line literal, line +
    /// block comments between members, a commented-out entry, two values on
    /// one line, a trailing comma, an explicit type annotation, and a decoy
    /// sibling array. Pair: EXPECTED.yaml.
    static let activeTemplateKinds: [String] = [
        "wireframe",
        "moodboard", // weekly refresh
        // "sitemap",  — commented-out entry must NOT be extracted
        "storyboard", /* narrative frames */
        "flowchart", "persona", // two on one line
        "brand-sheet",
    ]

    /// Decoy: an extractor scoped to `activeTemplateKinds` must never bleed
    /// `retired-template` into its value set.
    static let retiredTemplateKinds = ["retired-template"]
}
