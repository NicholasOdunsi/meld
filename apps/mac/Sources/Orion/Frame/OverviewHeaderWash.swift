import OrionDesignSystem
import SwiftUI

/// The Overview painting as a soft wash behind the hat header, fading out
/// before the lists start.
struct OverviewHeaderWash: View {
    var body: some View {
        if let image = OverviewArt.warrior {
            Image(nsImage: image)
                .resizable()
                .scaledToFill()
                .frame(height: FrameMetrics.overviewWashHeight)
                .frame(maxWidth: .infinity)
                .clipped()
                .opacity(FrameMetrics.overviewWashOpacity)
                .mask {
                    LinearGradient(
                        stops: [.init(color: .black, location: 0.35), .init(color: .clear, location: 1)],
                        startPoint: .top,
                        endPoint: .bottom
                    )
                }
                .accessibilityHidden(true)
                .allowsHitTesting(false)
        }
    }
}
