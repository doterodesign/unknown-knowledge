import SwiftUI

enum ThemeCatalog {
    /// WRONG-POINTER TARGET (A3, all-values-missing signature). This is a real
    /// file with a real, cleanly extractable declaration — but concept K-170
    /// claims layout-density values (compact/comfortable/spacious) that are
    /// ALL absent here. Every claimed value missing from an existing anchor is
    /// the wrong-pointer signature, distinct from ordinary one-value drift.
    static let themeNames: [String] = ["light", "dark", "system"]
}
