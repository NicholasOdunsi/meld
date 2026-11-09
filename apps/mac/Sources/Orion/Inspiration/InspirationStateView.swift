import OrionDesignSystem
import SwiftUI

/// Empty, connecting and offline chrome for the Inspiration wall.
struct InspirationStateView: View {
    enum Kind {
        case connecting
        case empty
    }

    let kind: Kind
    let reconnect: () -> Void

    @State private var showReconnect = false

    var body: some View {
        switch kind {
        case .connecting:
            connecting
        case .empty:
            ContentUnavailableView(
                String(localized: "Drag images here, paste with ⌘V, or use the Shelf in your menu bar."),
                systemImage: "photo.on.rectangle.angled"
            )
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }

    private var connecting: some View {
        VStack(spacing: OrionSpacing.md) {
            ProgressView()
            Text(String(localized: "Connecting…"))
                .foregroundStyle(.secondary)
            if showReconnect {
                Button("Reconnect Inspiration", action: reconnect)
                    .buttonStyle(OrionButtonStyle())
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .task {
            try? await Task.sleep(for: .seconds(8))
            showReconnect = true
        }
    }

    static var offlineBanner: some View {
        Label(String(localized: "Offline — showing your last saved view."), systemImage: "wifi.slash")
            .font(.callout)
            .foregroundStyle(.secondary)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 16)
            .padding(.vertical, 6)
    }
}
