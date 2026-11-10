import AppKit
import SwiftUI

extension Color {
    /// Parses `#rrggbb` (optional leading `#`). Bad strings become `.gray`.
    init(hexString: String) {
        let cleaned = hexString.trimmingCharacters(in: CharacterSet(charactersIn: "#"))
            .trimmingCharacters(in: .whitespacesAndNewlines)
        guard cleaned.count == 6, let value = UInt64(cleaned, radix: 16) else {
            self = .gray
            return
        }
        let red = Double((value >> 16) & 0xff) / 255
        let green = Double((value >> 8) & 0xff) / 255
        let blue = Double(value & 0xff) / 255
        self.init(red: red, green: green, blue: blue)
    }

    /// `#rrggbb` in sRGB. Falls back to `#808080` if the colour can't convert.
    var hexString: String {
        guard let ns = NSColor(self).usingColorSpace(.sRGB) else { return "#808080" }
        let r = Int((ns.redComponent * 255).rounded())
        let g = Int((ns.greenComponent * 255).rounded())
        let b = Int((ns.blueComponent * 255).rounded())
        return String(format: "#%02x%02x%02x", r, g, b)
    }
}
