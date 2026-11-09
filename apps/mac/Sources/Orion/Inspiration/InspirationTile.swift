import CoreGraphics
import OrionAppCore
import OrionDesignSystem
import ShelfCore
import SwiftUI

struct InspirationTile: View {
    let item: ShelfCore.LibraryItem
    let width: CGFloat
    let isSelected: Bool
    let thumbnails: ThumbnailCache
    let onLoadFailed: () -> Void

    @Environment(\.displayScale) private var displayScale
    @State private var image: CGImage?
    @State private var failed = false
    @State private var isHovering = false

    var body: some View {
        let height = width / max(item.aspectRatio, 0.05)
        ZStack {
            Rectangle().fill(.fill.tertiary)
            if let image {
                Image(decorative: image, scale: displayScale)
                    .resizable()
                    .scaledToFill()
            } else if failed {
                Button("Try again", systemImage: "arrow.clockwise") { Task { await load() } }
                    .labelStyle(.iconOnly)
                    .buttonStyle(.borderless)
            }
        }
        .frame(width: width, height: height)
        .clipShape(.rect(cornerRadius: 10, style: .continuous))
        .overlay {
            if isSelected {
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .strokeBorder(OrionColor.dayBreakBlue.color, lineWidth: 2.5)
            }
        }
        .scaleEffect(isHovering && !isSelected ? 1.015 : 1)
        .animation(.snappy(duration: 0.15), value: isHovering)
        .onHover { isHovering = $0 }
        .task(id: item.id) { await load() }
        .accessibilityElement()
        .accessibilityLabel(item.note ?? item.description ?? String(localized: "Inspiration image"))
        .accessibilityAddTraits(isSelected ? [.isImage, .isSelected] : .isImage)
    }

    private func load() async {
        failed = false
        let pixels = Int(TileStep.widths.last ?? 360) * Int(displayScale)
        image = await thumbnails.thumbnail(for: item, maxPixels: pixels)
        failed = image == nil
        if failed { onLoadFailed() }
    }
}
