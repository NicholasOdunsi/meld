import AppKit
import SwiftUI

public enum OrionHatState: Sendable { case working, needsYou }

/// PNG frames rendered from the web mascot by scripts/mascot/export-hat-frames.mjs.
public enum OrionHatFrames {
    public static let neutralGazeCount = 5

    public static func image(_ name: String) -> NSImage? {
        guard let url = ResourceBundle.current.url(forResource: name, withExtension: "png", subdirectory: "Mascot")
            ?? ResourceBundle.current.url(forResource: name, withExtension: "png") else { return nil }
        return NSImage(contentsOf: url)
    }
}

/// A project's status as the Orion hat, tinted with the project's colour.
/// Working: the tip sways and the eyes follow. Needs you: curious face, and
/// in the sidebar a springy hop every 6 seconds.
public struct OrionHatMark: View {
    let state: OrionHatState
    let tint: Color
    let hop: Bool
    let label: String

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    public init(state: OrionHatState, tint: Color, hop: Bool, label: String) {
        self.state = state
        self.tint = tint
        self.hop = hop
        self.label = label
    }

    /// 0…1 sway phase → gaze frame (0 = far left, last = far right, back again).
    nonisolated static func gazeIndex(phase: Double) -> Int {
        let wave = 0.5 - 0.5 * cos(phase * 2 * .pi)          // 0 → 1 → 0
        return Int((wave * Double(OrionHatFrames.neutralGazeCount - 1)).rounded())
    }

    /// SkewX about a bottom-near pivot (web `transform-origin: 50% 95%`).
    /// For skewX only the y pivot matters: x' = x + k·(y − 0.95·h).
    nonisolated static func workingSwayTransform(skewRadians: Double, height: CGFloat) -> CGAffineTransform {
        let k = CGFloat(tan(skewRadians))
        let py = height * 0.95
        return CGAffineTransform(a: 1, b: 0, c: k, d: 1, tx: -k * py, ty: 0)
    }

    public var body: some View {
        TimelineView(.animation(paused: reduceMotion)) { context in
            let t = context.date.timeIntervalSinceReferenceDate
            frame(at: t)
        }
        .accessibilityElement()
        .accessibilityLabel(label)
        .help(label)
    }

    @ViewBuilder private func frame(at t: TimeInterval) -> some View {
        switch state {
        case .working:
            let phase = reduceMotion ? 0.25 : (t / 2.8).truncatingRemainder(dividingBy: 1)
            let skew = reduceMotion ? 0 : (5 - 11 * (0.5 - 0.5 * cos(phase * 2 * .pi))) * .pi / 180
            let gaze = Self.gazeIndex(phase: phase)
            GeometryReader { geo in
                tinted("hat-neutral-\(gaze)", gaze: gaze, curious: false)
                    .frame(width: geo.size.width, height: geo.size.height)
                    .transformEffect(Self.workingSwayTransform(skewRadians: skew, height: geo.size.height))
            }
        case .needsYou:
            let (lift, sx, sy) = hop && !reduceMotion ? Self.hopPose((t / 6).truncatingRemainder(dividingBy: 1)) : (0, 1, 1)
            tinted("hat-curious", gaze: 2, curious: true)
                .scaleEffect(x: sx, y: sy, anchor: .bottom)
                .offset(y: -lift)
        }
    }

    /// Matches the web keyframes: squash 2%, leap 5% (38% of height), land 8%, rest from 10%.
    static func hopPose(_ p: Double) -> (lift: CGFloat, sx: CGFloat, sy: CGFloat) {
        func mix(_ a: Double, _ b: Double, _ f: Double) -> Double { a + (b - a) * f }
        switch p {
        case ..<0.02: let f = p / 0.02; return (0, mix(1, 1.12, f), mix(1, 0.86, f))
        case ..<0.05: let f = (p - 0.02) / 0.03; return (CGFloat(mix(0, 0.38, f)) * 22, mix(1.12, 0.94, f), mix(0.86, 1.08, f))
        case ..<0.08: let f = (p - 0.05) / 0.03; return (CGFloat(mix(0.38, 0, f)) * 22, mix(0.94, 1.1, f), mix(1.08, 0.9, f))
        case ..<0.10: let f = (p - 0.08) / 0.02; return (0, mix(1.1, 1, f), mix(0.9, 1, f))
        default: return (0, 1, 1)
        }
    }

    private func tinted(_ name: String, gaze: Int, curious: Bool) -> some View {
        let image = OrionHatFrames.image(name).map { Image(nsImage: $0).resizable().scaledToFit() }
        return ZStack {
            image
            tint.blendMode(.color).mask { image }
            // Raster faces vanish under tint at ~26pt — draw crisp eyes + mouth on top.
            OrionHatFace(gaze: gaze, curious: curious)
        }
        .compositingGroup()
    }
}

/// Vector face that stays legible when the tinted PNG is tiny (sidebar, composer, tabs).
/// Coordinates match the web SVG viewBox (0…400).
struct OrionHatFace: View {
    let gaze: Int
    let curious: Bool

    /// Same gaze steps as the exported frames (−5…+6 SVG units).
    private static let gazeX: [CGFloat] = [-5, -2.5, 0, 3, 6]

    var body: some View {
        Canvas { context, size in
            let s = min(size.width, size.height) / 400
            let ox = (size.width - 400 * s) / 2
            let oy = (size.height - 400 * s) / 2
            let look = Self.gazeX[min(max(gaze, 0), Self.gazeX.count - 1)]
            let lookNudge: CGFloat = curious ? -3 : 1
            // Slightly oversized vs the PNG so the face still reads at ~26pt.
            eye(&context, s: s, ox: ox, oy: oy, cx: 177 + look, cy: 229 + lookNudge, open: curious ? 0.78 : 0.7)
            eye(&context, s: s, ox: ox, oy: oy, cx: 260 + look, cy: 232 + lookNudge, open: curious ? 0.72 : 0.62)
            mouth(&context, s: s, ox: ox, oy: oy)
        }
        .allowsHitTesting(false)
    }

    private func eye(
        _ context: inout GraphicsContext,
        s: CGFloat,
        ox: CGFloat,
        oy: CGFloat,
        cx: CGFloat,
        cy: CGFloat,
        open: CGFloat
    ) {
        let center = CGPoint(x: ox + cx * s, y: oy + cy * s)
        let rx = 17 * s
        let ry = 12 * s * open
        context.fill(
            Path(ellipseIn: CGRect(x: center.x - rx, y: center.y - ry, width: rx * 2, height: ry * 2)),
            with: .color(Color(red: 0.97, green: 0.94, blue: 0.88))
        )
        let irisR = 7.8 * s
        context.fill(
            Path(ellipseIn: CGRect(x: center.x - irisR, y: center.y - irisR, width: irisR * 2, height: irisR * 2)),
            with: .color(Color(red: 0.42, green: 0.28, blue: 0.14))
        )
        let pupilR = 3.6 * s
        context.fill(
            Path(ellipseIn: CGRect(x: center.x - pupilR, y: center.y - pupilR, width: pupilR * 2, height: pupilR * 2)),
            with: .color(Color(red: 0.04, green: 0.02, blue: 0.01))
        )
        context.fill(
            Path(ellipseIn: CGRect(x: center.x - 3.4 * s, y: center.y - 4.4 * s, width: 2.8 * s, height: 2.1 * s)),
            with: .color(.white.opacity(0.9))
        )
    }

    private func mouth(_ context: inout GraphicsContext, s: CGFloat, ox: CGFloat, oy: CGFloat) {
        var path = Path()
        if curious {
            path.move(to: CGPoint(x: ox + 178 * s, y: oy + 296 * s))
            path.addQuadCurve(
                to: CGPoint(x: ox + 292 * s, y: oy + 297 * s),
                control: CGPoint(x: ox + 235 * s, y: oy + 286 * s)
            )
        } else {
            path.move(to: CGPoint(x: ox + 142 * s, y: oy + 300 * s))
            path.addQuadCurve(
                to: CGPoint(x: ox + 294 * s, y: oy + 296 * s),
                control: CGPoint(x: ox + 218 * s, y: oy + 282 * s)
            )
        }
        context.stroke(
            path,
            with: .color(Color(red: 0.04, green: 0.02, blue: 0.01).opacity(0.92)),
            style: StrokeStyle(lineWidth: max(1.8 * s, 1.15), lineCap: .round)
        )
    }
}
