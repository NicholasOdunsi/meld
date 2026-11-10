import CoreGraphics
import OrionAppCore
import OrionDesignSystem
import ShelfCore
import SwiftUI

struct InspirationTile: View {
    let item: ShelfCore.LibraryItem
    let width: CGFloat
    let isChecked: Bool
    let showCheckbox: Bool
    let thumbnails: ThumbnailCache
    let onToggleCheck: () -> Void
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
        .overlay(alignment: .topLeading) {
            if showCheckbox || isChecked || isHovering {
                checkbox
                    .padding(8)
            }
        }
        .overlay {
            if isChecked {
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .strokeBorder(OrionColor.dayBreakBlue.color, lineWidth: 2.5)
            }
        }
        .scaleEffect(isHovering && !isChecked ? 1.015 : 1)
        .animation(.snappy(duration: 0.15), value: isHovering)
        .onHover { isHovering = $0 }
        .task(id: item.id) { await load() }
        .accessibilityElement()
        .accessibilityLabel(item.note ?? item.description ?? String(localized: "Inspiration image"))
        .accessibilityAddTraits(isChecked ? [.isImage, .isSelected] : .isImage)
    }

    private var checkbox: some View {
        Button {
            onToggleCheck()
        } label: {
            Image(systemName: isChecked ? "checkmark.circle.fill" : "circle")
                .font(.title3)
                .symbolRenderingMode(.palette)
                .foregroundStyle(
                    isChecked ? OrionColor.dayBreakBlue.color : .white,
                    isChecked ? .white : .white.opacity(0.9)
                )
                .shadow(color: .black.opacity(0.35), radius: 2, y: 1)
        }
        .buttonStyle(.plain)
        .help(isChecked ? String(localized: "Deselect") : String(localized: "Select"))
        .accessibilityLabel(isChecked ? String(localized: "Deselect image") : String(localized: "Select image"))
    }

    private func load() async {
        failed = false
        let pixels = Int(TileStep.widths.last ?? 360) * Int(displayScale)
        image = await thumbnails.thumbnail(for: item, maxPixels: pixels)
        failed = image == nil
        if failed { onLoadFailed() }
    }
}
