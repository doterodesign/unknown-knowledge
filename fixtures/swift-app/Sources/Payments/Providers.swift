import Foundation

enum PaymentProviders {
    /// Extractable decoy: `core` alone is a clean literal. No concept points
    /// at it; it exists so the survey pre-scan finds candidates the ontology
    /// does not cover yet.
    static let core = ["stripe", "adyen"]
    private static let regional = ["klarna"]

    /// UNEXTRACTABLE for `swift-const-array` (PRD §5.1 envelope): the value
    /// set is computed (concatenation), not a literal. Survey logs a miss;
    /// an extractor pointed here must hard-error, never guess.
    static let all: [String] = core + regional

    /// UNEXTRACTABLE: dynamic derivation via `map` — same envelope rule.
    static let checkoutLabels: [String] = all.map { $0.capitalized }
}
