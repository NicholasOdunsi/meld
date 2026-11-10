import SwiftUI

/// Frost specks near the rim: fixed positions, so the panel never shimmers on its own.
struct FrostSpecks: View {
    private static let dots: [(x: Double, y: Double, r: Double, a: Double)] = [
        (0.06, 0.18, 1.1, 0.60), (0.11, 0.82, 1.0, 0.50), (0.93, 0.22, 1.2, 0.60), (0.87, 0.76, 1.0, 0.40),
        (0.30, 0.04, 1.0, 0.50), (0.68, 0.97, 1.0, 0.45), (0.03, 0.55, 1.4, 0.40), (0.97, 0.50, 1.4, 0.40),
        (0.18, 0.07, 0.8, 0.50), (0.82, 0.93, 0.8, 0.50), (0.45, 0.03, 0.7, 0.35), (0.55, 0.98, 0.7, 0.35),
    ]

    var body: some View {
        Canvas { context, size in
            for dot in Self.dots {
                let rect = CGRect(x: dot.x * size.width - dot.r, y: dot.y * size.height - dot.r, width: dot.r * 2, height: dot.r * 2)
                context.fill(Path(ellipseIn: rect), with: .color(.white.opacity(dot.a)))
            }
        }
        .blendMode(.screen)
        .allowsHitTesting(false)
    }
}

private struct IceGlass: ViewModifier {
    let cornerRadius: CGFloat

    func body(content: Content) -> some View {
        let shape = RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
        content
            .glassEffect(.regular.tint(.black.opacity(0.35)), in: shape)
            .overlay {
                ZStack {
                    // inner glow near the rim
                    shape.strokeBorder(Color.white.opacity(0.28), lineWidth: 10).blur(radius: 8).clipShape(shape)
                    // the bright icy rim
                    shape.strokeBorder(Color.white.opacity(0.55), lineWidth: 1.5)
                }
                .allowsHitTesting(false)
            }
            .overlay { FrostSpecks().clipShape(shape) }
            .shadow(color: .black.opacity(0.45), radius: 24, y: 12)
    }
}

extension View {
    /// The frosted-ice look: real blur, a bright rim, an inner glow and a few frost specks.
    func iceGlass(cornerRadius: CGFloat) -> some View { modifier(IceGlass(cornerRadius: cornerRadius)) }
}
