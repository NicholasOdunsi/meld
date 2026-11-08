import SwiftUI

struct RecentThumbnailView: View {
    let capture: RecentCapture
    let open: (UUID) -> Void

    var body: some View {
        Button(action: openInOrion) {
            thumbnail
                .resizable()
                .scaledToFill()
                .frame(width: ShelfDesign.thumbnailSize, height: ShelfDesign.thumbnailSize)
                .clipShape(.rect(cornerRadius: ShelfDesign.compactSpacing))
        }
        .buttonStyle(.plain)
        .disabled(capture.itemID == nil)
        .accessibilityLabel(capture.itemID == nil ? "Saving…" : "Open in Orion")
    }

    private var thumbnail: Image {
        if let image = capture.thumbnail {
            Image(nsImage: image)
        } else {
            Image(systemName: "photo")
        }
    }

    private func openInOrion() {
        if let itemID = capture.itemID { open(itemID) }
    }
}
