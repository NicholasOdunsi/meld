import ShelfCore
import SwiftUI

/// Nested rounded rectangles drawn with the rule outer radius = inner radius + padding.
struct ShapePicture: View {
    let corners: TasteCorners
    let depth: TasteDepth
    var size = CGSize(width: 84, height: 62)

    private let padding: CGFloat = 8
    private var innerRadius: CGFloat {
        switch corners {
        case .sharp: 2
        case .soft: 8
        case .round: 16
        }
    }

    var body: some View {
        let outer = innerRadius + padding
        ZStack {
            RoundedRectangle(cornerRadius: outer, style: .continuous)
                .fill(Color.primary.opacity(0.14))
                .shadow(color: depth == .shadows ? .black.opacity(0.35) : .clear, radius: 6, y: 3)
                .overlay {
                    if depth == .hairlines {
                        RoundedRectangle(cornerRadius: outer, style: .continuous)
                            .strokeBorder(Color.primary.opacity(0.4), lineWidth: 1)
                    }
                }
            RoundedRectangle(cornerRadius: innerRadius, style: .continuous)
                .fill(Color.primary.opacity(0.3))
                .padding(padding)
        }
        .frame(width: size.width, height: size.height)
        .accessibilityHidden(true)
    }
}
