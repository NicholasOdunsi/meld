import OrionDesignSystem
import ShelfCore
import SwiftUI

struct MotionTileContent: View {
    let board: TasteBoard
    var body: some View {
        let spec = TasteMotionSpec(board.motion)
        VStack(alignment: .leading, spacing: OrionSpacing.xxs) {
            Text(spec.title).font(.system(size: 30, weight: .heavy)).tracking(-1)
            Text(spec.meaning).font(.caption).foregroundStyle(.secondary)
            Spacer(minLength: 0)
            MotionLoopDemo(spec: spec)
        }
    }
}

struct LetteringTileContent: View {
    let board: TasteBoard
    var body: some View {
        let style = TasteSampleStyle(board: board)
        HStack(alignment: .bottom, spacing: OrionSpacing.md) {
            Text("Aa")
                .font(.system(size: 56, weight: style.titleWeight.fontWeight))
                .tracking(style.tracking * 3)
            VStack(alignment: .leading, spacing: 4) {
                Text("Welcome back")
                    .font(.system(size: 17, weight: style.titleWeight.fontWeight))
                    .tracking(style.tracking)
                Text("Body text stays easy to read").font(.system(size: 12))
                Text("1,284.50").font(.system(size: 12).monospacedDigit())
                Text("\(board.typography.weight.rawValue.capitalized) · \(board.typography.tracking.rawValue)")
                    .font(.caption2).foregroundStyle(.secondary)
            }
        }
    }
}

struct ShapeTileContent: View {
    let board: TasteBoard
    var body: some View {
        VStack(alignment: .leading, spacing: OrionSpacing.xs) {
            HStack(alignment: .bottom, spacing: OrionSpacing.sm) {
                ShapePicture(corners: board.shape.corners, depth: board.shape.depth)
                VStack(alignment: .leading, spacing: 2) {
                    Text(board.shape.corners.rawValue.capitalized).font(.subheadline.weight(.semibold))
                    Text(board.shape.depth.rawValue.capitalized).font(.caption).foregroundStyle(.secondary)
                }
            }
            if !board.signatureDetails.isEmpty {
                FlowLayout(spacing: OrionSpacing.xxs) {
                    ForEach(board.signatureDetails.prefix(2), id: \.self) { TasteChip(text: $0) }
                }
            }
        }
    }
}

struct DensityPicture: View {
    let density: TasteDensity
    var body: some View {
        let choice = DensityChoice.choice(for: density)
        let rows = choice == .airy ? 2 : (choice == .balanced ? 3 : 5)
        VStack(spacing: choice == .packed ? 2 : (choice == .balanced ? 4 : 8)) {
            ForEach(0..<rows, id: \.self) { _ in
                Capsule().fill(Color.primary.opacity(0.3)).frame(height: 6)
            }
        }
        .frame(width: 84)
        .accessibilityHidden(true)
    }
}

struct SpaceTileContent: View {
    let board: TasteBoard
    var body: some View {
        VStack(alignment: .leading, spacing: OrionSpacing.xs) {
            HStack(alignment: .bottom, spacing: OrionSpacing.sm) {
                DensityPicture(density: board.density)
                VStack(alignment: .leading, spacing: 2) {
                    Text(board.density.rawValue.capitalized).font(.subheadline.weight(.semibold))
                    Text("\(board.spacing.rawValue.capitalized) gaps").font(.caption).foregroundStyle(.secondary)
                }
            }
            if !board.layoutHabits.isEmpty {
                FlowLayout(spacing: OrionSpacing.xxs) {
                    ForEach(board.layoutHabits.prefix(3), id: \.self) { TasteChip(text: $0) }
                }
            }
        }
    }
}

struct VoiceTileContent: View {
    let board: TasteBoard
    var body: some View {
        VStack(alignment: .leading, spacing: OrionSpacing.xxs) {
            Text(board.voice.tone.title).font(.subheadline.weight(.semibold))
            TasteChip(text: TasteVoiceExamples.successLine(for: board.voice.tone))
            TasteChip(text: TasteVoiceExamples.emptyLine(for: board.voice.tone))
        }
    }
}

struct AvoidStripContent: View {
    let board: TasteBoard
    var body: some View {
        HStack(spacing: OrionSpacing.xs) {
            if board.avoid.isEmpty {
                Text("None yet").font(.caption).foregroundStyle(.secondary)
            } else {
                ForEach(board.avoid.prefix(3), id: \.text) { TasteChip(text: $0.text, isStruck: true) }
                if board.avoid.count > 3 {
                    Text("+\(board.avoid.count - 3)").font(.caption2).foregroundStyle(.secondary)
                }
            }
            Spacer(minLength: 0)
        }
    }
}

struct CraftStripContent: View {
    var body: some View {
        HStack(spacing: OrionSpacing.xs) {
            Image(systemName: "lock.fill").font(.caption).foregroundStyle(OrionColor.dayBreakBlue.color)
            Text("Always on").font(.caption).foregroundStyle(.secondary)
            Spacer(minLength: 0)
            Text("\(TasteCraftRules.all.count) rules ›").font(.caption).foregroundStyle(.secondary)
        }
    }
}
