import AppKit

/// A save shown in the panel. `itemID` arrives once Orion confirms the upload.
struct RecentCapture: Identifiable {
    let id: UUID
    let thumbnail: NSImage?
    var itemID: UUID?
}
