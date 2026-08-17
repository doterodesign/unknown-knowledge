import Foundation

/// D-009 extractor fixture — swift-enum (facet pinned by `emit:` — this
/// pair's EXPECTED.yaml pins `case-name`). Adversarial-but-extractable:
/// an interior comment containing the word `case`, aligned `=` padding, a
/// trailing comment with a stray " quote, a comma-joined case list, a
/// computed property whose `switch` arms look like case declarations, and a
/// decoy sibling enum. Pair: EXPECTED.yaml.
enum RenderQuality: String, CaseIterable {
    case preview  = "PREVIEW"
    // The word case inside a comment — case in point — is not a declaration.
    case balanced = "BALANCED" /* aligned '=' padding above */
    case high     = "HIGH" // trailing comment with a stray " quote
    case draft, print // comma-joined list; implicit raw values

    var label: String {
        switch self {
        case .preview: return "Preview"
        case .balanced: return "Balanced"
        case .high: return "High"
        case .draft: return "Draft"
        case .print: return "Print"
        }
    }
}

/// Decoy: an extractor scoped to `RenderQuality` must never bleed `metal` in.
enum RenderEngine: String {
    case metal = "METAL"
}
