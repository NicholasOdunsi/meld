import OrionAppCore
import OrionDesignSystem
import SwiftUI

struct ScreenCard: View {
    let screen: StreamScreen
    let store: ScreenCardStore
    let open: (StreamScreen) -> Void

    /// The widest the card gets; in a narrower column it shrinks, keeping the screen's shape.
    private var maxWidth: CGFloat { screen.formFactor == "mobile" ? 200 : 340 }

    var body: some View {
        VStack(alignment: .leading, spacing: OrionSpacing.xs) {
            Button { open(screen) } label: { picture }
                .buttonStyle(.plain)
                .disabled(screen.state != .built)
                .accessibilityLabel("Open \(screen.name) on the Canvas")
            HStack(spacing: OrionSpacing.xs) {
                Text(screen.name).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                if screen.updating { Text("Updating…").font(.caption2).foregroundStyle(.secondary) }
            }
        }
    }

    /// The shape of the picture itself, which can be taller than the screen's window.
    private var pictureSize: CGSize {
        if screen.state == .built, let size = store.image(for: screen)?.size, size.width > 0, size.height > 0 { return size }
        return screen.pixelSize
    }

    @ViewBuilder private var picture: some View {
        let shape = RoundedRectangle(cornerRadius: 14, style: .continuous)
        Group {
            switch screen.state {
            case .built:
                if let image = store.image(for: screen) {
                    Image(nsImage: image).resizable().scaledToFill()
                } else {
                    placeholder("Loading…")
                }
            case .building: placeholder("Designing…")
            case .failed: placeholder("Couldn't build this screen")
            }
        }
        .aspectRatio(pictureSize, contentMode: .fit)
        .frame(maxWidth: maxWidth)
        .clipShape(shape)
        .overlay(shape.strokeBorder(.white.opacity(0.12)))
    }

    private func placeholder(_ text: String) -> some View {
        ZStack {
            Rectangle().fill(.white.opacity(0.06))
            Text(text).font(.caption).foregroundStyle(.secondary)
        }
    }
}
