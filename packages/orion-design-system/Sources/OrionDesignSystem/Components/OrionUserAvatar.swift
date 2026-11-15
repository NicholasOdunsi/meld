import AppKit

/// The owner's chat avatar: the DiceBear "glass" avatar for seed "Felix",
/// downloaded once at development time (never fetched at runtime). The PNG is
/// what renders; the SVG is kept as the source.
public enum OrionUserAvatar {
    public static var image: NSImage? {
        let name = "dicebear-glass-felix"
        guard let url = ResourceBundle.current.url(
            forResource: name, withExtension: "png", subdirectory: "Avatars"
        ) ?? ResourceBundle.current.url(forResource: name, withExtension: "png")
        else { return nil }
        return NSImage(contentsOf: url)
    }
}
