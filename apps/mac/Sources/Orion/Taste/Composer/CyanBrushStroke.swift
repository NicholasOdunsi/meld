import OrionDesignSystem
import SwiftUI

/// A tapered, slightly rough brush stroke, drawn from deterministic maths so it never flickers.
struct BrushStrokeShape: Shape {
    /// Full thickness at `t` (0...1) along the stroke: thin at both ends, fullest in the middle, with a little roughness.
    static func thickness(at t: Double, height: CGFloat) -> CGFloat {
        let taper = sin(Double.pi * min(max(t, 0), 1))
        let rough = 1 + 0.18 * sin(t * 37) + 0.12 * sin(t * 91)
        return height * CGFloat((0.25 + 0.75 * taper) * rough)
    }

    func path(in rect: CGRect) -> Path {
        let steps = 28
        var top: [CGPoint] = []
        var bottom: [CGPoint] = []
        for index in 0...steps {
            let t = Double(index) / Double(steps)
            let x = rect.minX + rect.width * CGFloat(t)
            let half = Self.thickness(at: t, height: rect.height) / 2
            top.append(CGPoint(x: x, y: rect.midY - half))
            bottom.append(CGPoint(x: x, y: rect.midY + half * 0.8))
        }
        var path = Path()
        guard let first = top.first else { return path }
        path.move(to: first)
        top.dropFirst().forEach { path.addLine(to: $0) }
        bottom.reversed().forEach { path.addLine(to: $0) }
        path.closeSubpath()
        return path
    }
}

/// The glowing cyan stroke under "Orion". Sweeps back and forth while Orion reads.
struct CyanBrushStroke: View {
    var isSweeping: Bool
    var width: CGFloat = 320

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var extent: CGFloat = 1

    private var cyan: Color { OrionColor.dayBreakBlue.color }

    var body: some View {
        BrushStrokeShape()
            .fill(LinearGradient(
                stops: [
                    .init(color: .clear, location: 0),
                    .init(color: cyan, location: 0.10),
                    .init(color: Color(red: 0.75, green: 0.98, blue: 1.0), location: 0.34),
                    .init(color: cyan, location: 0.62),
                    .init(color: cyan.opacity(0.25), location: 0.92),
                    .init(color: .clear, location: 1),
                ],
                startPoint: .leading,
                endPoint: .trailing
            ))
            .frame(width: width, height: 8)
            .shadow(color: cyan.opacity(0.9), radius: 6)
            .shadow(color: .white.opacity(0.5), radius: 1.5)
            .scaleEffect(x: extent, y: 1, anchor: .leading)
            .onChange(of: isSweeping, initial: true) { _, sweeping in
                guard !reduceMotion else { extent = 1; return }
                if sweeping {
                    extent = 0.15
                    withAnimation(.timingCurve(0.2, 0, 0, 1, duration: 1.6).repeatForever(autoreverses: true)) { extent = 1 }
                } else {
                    withAnimation(.linear(duration: 0)) { extent = 1 }
                }
            }
            .accessibilityHidden(true)
    }
}
