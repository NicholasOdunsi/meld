import SwiftUI

public enum OrionFont {
    @MainActor
    public static func font(for style: OrionTextStyle, size: CGFloat, emphasized: Bool = false) -> Font {
        let weight: Font.Weight = style.isBold || emphasized ? .bold : .regular
        let resource = style.isHeadline ? "SpaceGrotesk-Bold" : (style.isBold || emphasized ? "Manrope-Bold" : "Manrope-Regular")
        return resolvedFont(name: FontRegistration.names[resource], size: size, weight: weight)
    }

    static func resolvedFont(name: String?, size: CGFloat, weight: Font.Weight) -> Font {
        guard let name else {
            return .system(size: size, weight: weight, design: .default)
        }
        return .custom(name, fixedSize: size).weight(weight)
    }
}
