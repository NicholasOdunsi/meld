import AppKit

/// Hero painting for the Orion Overview page.
public enum OverviewArt {
    public static var warrior: NSImage? {
        let name = "watercolor-warrior"
        guard let url = ResourceBundle.current.url(
            forResource: name, withExtension: "png", subdirectory: "Overview"
        ) ?? ResourceBundle.current.url(forResource: name, withExtension: "png")
        else { return nil }
        return NSImage(contentsOf: url)
    }
}
