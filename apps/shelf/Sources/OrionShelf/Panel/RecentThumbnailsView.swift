import SwiftUI

struct RecentThumbnailsView: View {
    let recent: [RecentCapture]
    let open: (UUID) -> Void

    var body: some View {
        HStack(spacing: ShelfDesign.compactSpacing) {
            ForEach(recent) { capture in
                RecentThumbnailView(capture: capture, open: open)
            }
        }
    }
}
