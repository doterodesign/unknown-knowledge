import SwiftUI

enum ThemeCatalog {
    /// WRONG-POINTER TARGET (A3, all-values-missing signature). This is a real
    /// file with a real, cleanly extractable declaration — but concept K-170
    /// claims layout-density values, ALL of which are absent here (lexically
    /// too: naming them even in a comment would break the signature). Every
    /// claimed value missing from an existing anchor marks a wrong pointer.
    static let themeNames: [String] = ["light", "dark", "system"]
}
