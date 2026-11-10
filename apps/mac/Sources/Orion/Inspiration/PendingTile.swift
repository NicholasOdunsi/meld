import AppKit
import SwiftUI

/// Local shimmer tile for a capture that has not reached Orion yet.
struct PendingTile: View {
    let capture: RecentCapture
    let width: CGFloat

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        let height = tileHeight
        Group {
            if reduceMotion {
                imageLayer
            } else {
                imageLayer
                    .phaseAnimator([false, true]) { view, moving in
                        view.overlay {
                            LinearGradient(
                                colors: [.clear, .white.opacity(0.35), .clear],
                                startPoint: .leading,
                                endPoint: .trailing
                            )
                            .frame(width: width * 0.55)
                            .offset(x: moving ? width : -width)
                            .blendMode(.plusLighter)
                            .allowsHitTesting(false)
                        }
                    } animation: { _ in
                        .easeInOut(duration: 1.2).repeatForever(autoreverses: false)
                    }
            }
        }
        .frame(width: width, height: height)
        .clipShape(.rect(cornerRadius: 10, style: .continuous))
        .accessibilityElement()
        .accessibilityLabel(String(localized: "Uploading image"))
    }

    private var tileHeight: CGFloat {
        guard let thumbnail = capture.thumbnail, thumbnail.size.width > 0 else { return width }
        return width * thumbnail.size.height / thumbnail.size.width
    }

    @ViewBuilder
    private var imageLayer: some View {
        ZStack {
            Rectangle().fill(.fill.tertiary)
            if let thumbnail = capture.thumbnail {
                Image(nsImage: thumbnail)
                    .resizable()
                    .scaledToFill()
                    .opacity(0.6)
            }
        }
    }
}
