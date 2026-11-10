import OrionDesignSystem
import ShelfCore
import SwiftUI

/// Tiny picture of how dense, roomy, or heavy a screen feels.
struct MiniScreen: View {
    enum Kind: Equatable {
        case density(DensityChoice)
        case spacing(TasteSpacing)
        case weight(TasteWeight)
    }

    let kind: Kind

    init(_ kind: Kind) { self.kind = kind }

    var body: some View {
        Group {
            switch kind {
            case .weight(let weight):
                Text("Aa")
                    .font(.system(size: 28, weight: fontWeight(weight)))
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            case .density, .spacing:
                VStack(spacing: gap) {
                    ForEach(0..<barCount, id: \.self) { _ in
                        RoundedRectangle(cornerRadius: OrionRadius.small / 2, style: .continuous)
                            .fill(Color.secondary.opacity(0.35))
                            .frame(height: barHeight)
                    }
                }
                .padding(OrionSpacing.xs)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
            }
        }
        .frame(height: 64)
        .frame(maxWidth: .infinity)
        .background(.white, in: .rect(cornerRadius: OrionRadius.small, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: OrionRadius.small, style: .continuous)
                .strokeBorder(Color.secondary.opacity(0.25), lineWidth: 1)
        }
    }

    private var barCount: Int {
        switch kind {
        case .density(.airy): 2
        case .density(.balanced): 4
        case .density(.packed): 7
        case .spacing: 3
        case .weight: 0
        }
    }

    private var gap: CGFloat {
        switch kind {
        case .density(.airy): OrionSpacing.sm
        case .density(.balanced): OrionSpacing.xs
        case .density(.packed): 2
        case .spacing(.tight): 2
        case .spacing(.comfortable): OrionSpacing.xs
        case .spacing(.generous): OrionSpacing.sm
        case .weight: 0
        }
    }

    private var barHeight: CGFloat {
        switch kind {
        case .density(.airy): 10
        case .density(.balanced): 8
        case .density(.packed): 5
        case .spacing: 8
        case .weight: 0
        }
    }

    private func fontWeight(_ weight: TasteWeight) -> Font.Weight {
        switch weight {
        case .light: .light
        case .regular: .regular
        case .bold: .bold
        case .heavy: .heavy
        }
    }
}

/// Outlined picture + label; selected state draws a 2pt primary border.
struct PictureChoice<Picture: View>: View {
    let title: String
    let isSelected: Bool
    let action: () -> Void
    @ViewBuilder let picture: () -> Picture

    var body: some View {
        Button(action: action) {
            VStack(spacing: OrionSpacing.xxs) {
                picture()
                    .overlay {
                        RoundedRectangle(cornerRadius: OrionRadius.small, style: .continuous)
                            .strokeBorder(isSelected ? Color.primary : .clear, lineWidth: 2)
                    }
                Text(title)
                    .font(.caption.weight(isSelected ? .semibold : .regular))
                    .foregroundStyle(.primary)
                    .lineLimit(1)
            }
            .frame(maxWidth: .infinity)
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
    }
}
