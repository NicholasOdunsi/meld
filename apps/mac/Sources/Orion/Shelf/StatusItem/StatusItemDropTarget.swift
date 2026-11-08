import AppKit
import ShelfCore
import UniformTypeIdentifiers

/// Accepts drops on the menu-bar icon itself. NSWindow forwards dragging
/// callbacks to its delegate, which is the standard way to make a status
/// item a drop target without replacing its button.
@MainActor
final class StatusItemDropTarget: NSObject, NSWindowDelegate, NSDraggingDestination {
    private let appModel: AppModel
    private let reader = PasteboardReader()

    init(appModel: AppModel) {
        self.appModel = appModel
    }

    func attach(to button: NSStatusBarButton) {
        guard let window = button.window else { return }
        window.registerForDraggedTypes([.fileURL, .URL, .png, .tiff, NSPasteboard.PasteboardType(UTType.image.identifier)])
        window.delegate = self
    }

    func draggingEntered(_ sender: any NSDraggingInfo) -> NSDragOperation {
        .copy
    }

    func performDragOperation(_ sender: any NSDraggingInfo) -> Bool {
        let images = reader.images(from: sender.draggingPasteboard)
        Task { await appModel.capture(images, note: nil, roomID: nil) }
        return !images.isEmpty
    }
}
