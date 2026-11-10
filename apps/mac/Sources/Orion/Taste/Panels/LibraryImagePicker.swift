import CoreGraphics
import OrionDesignSystem
import ShelfCore
import SwiftUI

/// Newest Inspiration thumbnails for "Pull from an image…" in ColourPanel.
struct LibraryImagePicker: View {
    let items: [ShelfCore.LibraryItem]
    let thumbnails: ThumbnailCache
    let onPick: (UUID) -> Void

    private let columns = [GridItem(.adaptive(minimum: 72, maximum: 96), spacing: OrionSpacing.xs)]

    var body: some View {
        ScrollView {
            if items.isEmpty {
                Text("No Inspiration images yet.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(OrionSpacing.md)
            } else {
                LazyVGrid(columns: columns, spacing: OrionSpacing.xs) {
                    ForEach(items) { item in
                        LibraryImageThumb(item: item, thumbnails: thumbnails) {
                            onPick(item.id)
                        }
                    }
                }
                .padding(OrionSpacing.sm)
            }
        }
        .frame(width: 320, height: 280)
    }
}

private struct LibraryImageThumb: View {
    let item: ShelfCore.LibraryItem
    let thumbnails: ThumbnailCache
    let onTap: () -> Void

    @Environment(\.displayScale) private var displayScale
    @State private var image: CGImage?
    @State private var failed = false

    var body: some View {
        Button(action: onTap) {
            ZStack {
                RoundedRectangle(cornerRadius: OrionRadius.small, style: .continuous)
                    .fill(.fill.tertiary)
                if let image {
                    Image(decorative: image, scale: displayScale)
                        .resizable()
                        .scaledToFill()
                } else if failed {
                    Image(systemName: "photo")
                        .foregroundStyle(.secondary)
                }
            }
            .frame(width: 80, height: 80)
            .clipShape(.rect(cornerRadius: OrionRadius.small, style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(item.note ?? item.description ?? String(localized: "Inspiration image"))
        .task(id: item.id) { await load() }
    }

    private func load() async {
        failed = false
        let pixels = Int(80 * displayScale)
        image = await thumbnails.thumbnail(for: item, maxPixels: max(pixels, 160))
        failed = image == nil
    }
}
