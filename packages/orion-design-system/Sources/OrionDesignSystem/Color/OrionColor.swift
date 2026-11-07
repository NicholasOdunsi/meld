import SwiftUI

/// The supplied Orion palette. Raw values are sRGB, without alpha.
public enum OrionColor: UInt32, CaseIterable, Sendable {
    case summerYellow = 0xFFEA00, nectarineOrange = 0xFF9800, partyOrange = 0xFF5A00
    case dayBreakBlue = 0x00E1F3, electricBlue = 0x5151FC, openSkyBlue = 0x5100C0
    case candyPink = 0xFFC0FF, futuristicPink = 0xFF6FFF, loudRed = 0xFC032D
    case kryptoniteGreen = 0xABFF5A, pineGreen = 0x00906C, deepGreen = 0x085E55
    case offWhite = 0xF9F9F9, gray = 0x8F9193, black = 0x090909

    public var red: Double { Double((rawValue >> 16) & 255) / 255 }
    public var green: Double { Double((rawValue >> 8) & 255) / 255 }
    public var blue: Double { Double(rawValue & 255) / 255 }
    public var color: Color { Color(.sRGB, red: red, green: green, blue: blue, opacity: 1) }
    public var hex: String {
        let digits = String(rawValue, radix: 16, uppercase: true)
        return "#" + String(repeating: "0", count: 6 - digits.count) + digits
    }

    public var luminance: Double {
        func linear(_ value: Double) -> Double {
            value <= 0.04045 ? value / 12.92 : pow((value + 0.055) / 1.055, 2.4)
        }
        return 0.2126 * linear(red) + 0.7152 * linear(green) + 0.0722 * linear(blue)
    }
    public func contrast(with other: Self) -> Double {
        (max(luminance, other.luminance) + 0.05) / (min(luminance, other.luminance) + 0.05)
    }
    /// Readable text for a solid primitive background, independent of decorative accents.
    public var textForeground: Self {
        contrast(with: .black) > contrast(with: .offWhite) ? .black : .offWhite
    }
}

