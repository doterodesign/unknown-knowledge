import Foundation

/// UNEXTRACTABLE for `swift-enum` (PRD §5.1 envelope): `#if` conditional
/// compilation inside the case span is the declared out-of-envelope sentinel.
/// The extractor must hard-error (a confident wrong parse is a false
/// all-clear, the D-005/D-012 failure class); the bootstrap survey logs this
/// shape to logs/misses/. Concept K-180 points here on purpose.
enum AnalyticsEvent: String {
    case appOpen = "app_open"
    case betPlaced = "bet_placed"
    #if DEBUG
    case debugMenuOpened = "debug_menu_opened"
    #endif
    case sessionEnd = "session_end"
}
