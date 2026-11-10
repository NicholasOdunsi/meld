import OrionDesignSystem
import ShelfCore
import SwiftUI

struct TasteSampleView: View {
    let style: TasteSampleStyle

    var body: some View {
        VStack(alignment: .leading, spacing: OrionSpacing.xs) {
            Text("Live sample")
                .font(.caption2)
                .foregroundStyle(.secondary)
            card
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        }
    }

    private var card: some View {
        VStack(alignment: .leading, spacing: style.rowGap) {
            Text(style.screenTitle)
                .font(.system(size: style.titleSize, weight: fontWeight(style.titleWeight)))
                .tracking(style.tracking)
                .foregroundStyle(Color(hexString: style.ink))
            fieldOutline
            fieldOutline
            Text("Continue")
                .font(.body.weight(.semibold))
                .foregroundStyle(.white)
                .frame(maxWidth: .infinity)
                .padding(.vertical, OrionSpacing.sm)
                .background(Color(hexString: style.action), in: .rect(cornerRadius: OrionRadius.small, style: .continuous))
        }
        .padding(style.padding)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(hexString: style.background), in: .rect(cornerRadius: OrionRadius.medium, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: OrionRadius.medium, style: .continuous)
                .strokeBorder(.black.opacity(0.08), lineWidth: 1)
        }
    }

    private var fieldOutline: some View {
        RoundedRectangle(cornerRadius: OrionRadius.small, style: .continuous)
            .strokeBorder(Color(hexString: style.ink).opacity(0.25), lineWidth: 1)
            .frame(height: 36)
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
