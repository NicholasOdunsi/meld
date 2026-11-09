import CoreTransferable
import ShelfCore
import UniformTypeIdentifiers

/// Dragging a tile out hands over the full-size file.
struct InspirationDragFile: Transferable {
    let item: ShelfCore.LibraryItem
    let thumbnails: ThumbnailCache

    static var transferRepresentation: some TransferRepresentation {
        FileRepresentation(exportedContentType: .image) { file in
            SentTransferredFile(try await file.thumbnails.fullImageFile(for: file.item))
        }
    }
}
