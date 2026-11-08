import CoreTransferable
import Foundation
import ShelfCore
import UniformTypeIdentifiers

/// What the panel's drop zone accepts: image files from Finder or image data from apps.
struct ShelfDropItem: Transferable {
    let captured: CapturedImage

    static var transferRepresentation: some TransferRepresentation {
        FileRepresentation(importedContentType: .image) { received in
            ShelfDropItem(captured: CapturedImage(data: try Data(contentsOf: received.file), sourceURL: nil))
        }
        DataRepresentation(importedContentType: .image) { data in
            ShelfDropItem(captured: CapturedImage(data: data, sourceURL: nil))
        }
    }
}
