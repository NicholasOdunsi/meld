import OrionDesignSystem
import ShelfCore
import SwiftUI

/// Bars drawn at the chosen density, spaced by the chosen gap.
struct DensityPicture: View {
    let density: TasteDensity
    let spacing: TasteSpacing

    var body: some View {
        let choice = DensityChoice.choice(for: density)
        let rows = choice == .airy ? 3 : (choice == .balanced ? 4 : 6)
        let gap: CGFloat = switch spacing {
        case .tight: 3
        case .comfortable: 6
        case .generous: 10
        }
        VStack(alignment: .leading, spacing: gap) {
            ForEach(0..<rows, id: \.self) { row in
                Capsule().fill(Color.primary.opacity(0.28)).frame(width: row == 1 ? 84 : (row == 2 ? 58 : 110), height: 7)
            }
        }
        .accessibilityHidden(true)
    }
}

/// The small live example beside each sentence. Neutral on purpose: no fills, no colour.
struct TasteSpecimenView: View {
    let kind: TasteSpecimen
    let board: TasteBoard

    var body: some View {
        switch kind {
        case .motion:
            MotionLoopDemo(spec: TasteMotionSpec(board.motion))
        case .lettering:
            let style = TasteSampleStyle(board: board)
            HStack(alignment: .bottom, spacing: OrionSpacing.sm) {
                Text("Aa")
                    .font(.system(size: 76, weight: style.titleWeight.fontWeight))
                    .tracking(style.tracking * 4)
                VStack(alignment: .leading, spacing: 2) {
                    Text("Welcome back")
                        .font(.system(size: 15, weight: style.titleWeight.fontWeight))
                        .tracking(style.tracking)
                    Text("1,284.50").font(.system(size: 12).monospacedDigit()).foregroundStyle(.secondary)
                }
                .padding(.bottom, 6)
            }
        case .shape:
            ShapePicture(corners: board.shape.corners, depth: board.shape.depth)
        case .room:
            DensityPicture(density: board.density, spacing: board.spacing)
        case .voice:
            VStack(alignment: .leading, spacing: OrionSpacing.xxs) {
                Text("“\(TasteVoiceExamples.successLine(for: board.voice.tone))”")
                Text("“\(TasteVoiceExamples.emptyLine(for: board.voice.tone))”")
            }
            .font(.callout)
            .foregroundStyle(.secondary)
        case .none:
            EmptyView()
        }
    }
}
