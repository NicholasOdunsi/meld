import OrionDesignSystem
import SwiftUI

/// Overview header: the Orion hat beside today's date, a greeting, and one
/// line about your lists. The hat speaks when there is something to tell you.
struct OverviewHatHeader: View {
    let dateLine: String
    let salutation: String
    let summary: String
    let hasNews: Bool

    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.colorSchemeContrast) private var contrast

    var body: some View {
        HStack(alignment: .center, spacing: FrameMetrics.overviewHatSpacing) {
            hat
            VStack(alignment: .leading, spacing: 6) {
                Text(dateLine)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(OrionColorRole.success.resolve(in: colorScheme, contrast: contrast))
                Text(salutation)
                    .font(.system(.largeTitle, design: .serif, weight: .semibold))
                    .foregroundStyle(.primary)
                Text(summary)
                    .font(.title3)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                    .frame(maxWidth: FrameMetrics.overviewSummaryMaxWidth, alignment: .leading)
                    .padding(.top, 2)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.bottom, FrameMetrics.overviewHeaderBottomGap)
        .accessibilityElement(children: .combine)
    }

    @ViewBuilder private var hat: some View {
        if let image = (hasNews ? OrionHatPortrait.speaking : .neutral).image {
            Image(nsImage: image)
                .resizable()
                .scaledToFit()
                .frame(width: FrameMetrics.overviewHatSize, height: FrameMetrics.overviewHatSize)
                .accessibilityHidden(true)
        }
    }
}
