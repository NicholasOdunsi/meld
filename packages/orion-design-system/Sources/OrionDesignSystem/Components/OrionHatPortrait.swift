import AppKit

/// The large Orion hat (illustration style) for headers, exported by
/// `scripts/mascot/export-hat-portraits.mjs`.
public enum OrionHatPortrait: String, CaseIterable, Sendable {
    case neutral
    case curious
    case speaking

    public var image: NSImage? {
        let name = "hat-portrait-\(rawValue)"
        guard let url = ResourceBundle.current.url(
            forResource: name, withExtension: "png", subdirectory: "Mascot"
        ) ?? ResourceBundle.current.url(forResource: name, withExtension: "png")
        else { return nil }
        return NSImage(contentsOf: url)
    }
}
