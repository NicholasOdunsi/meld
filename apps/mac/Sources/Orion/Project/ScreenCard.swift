import OrionAppCore
import OrionDesignSystem
import SwiftUI

struct ScreenCard: View {
    let screen: StreamScreen
    let store: ScreenCardStore
    let open: (StreamScreen) -> Void

    private var width: CGFloat { screen.formFactor == "mobile" ? 200 : 340 }
    private var height: CGFloat { width * screen.pixelSize.height / screen.pixelSize.width }

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
        .frame(width: width, height: height)
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
