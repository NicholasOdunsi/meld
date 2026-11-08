import SwiftUI

/// Orion's default presentation is dark: Black canvas with Off-white text.
public enum OrionAppearance: Sendable {
    public static let preferredColorScheme: ColorScheme = .dark
}

public extension View {
    /// Pins the view tree to Orion's default dark appearance.
    func orionPreferredAppearance() -> some View {
        preferredColorScheme(OrionAppearance.preferredColorScheme)
    }
}
