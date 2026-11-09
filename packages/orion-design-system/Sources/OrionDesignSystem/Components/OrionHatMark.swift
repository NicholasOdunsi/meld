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
    static func gazeIndex(phase: Double) -> Int {
        let wave = 0.5 - 0.5 * cos(phase * 2 * .pi)          // 0 → 1 → 0
        return Int((wave * Double(OrionHatFrames.neutralGazeCount - 1)).rounded())
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
            tinted("hat-neutral-\(Self.gazeIndex(phase: phase))")
                .transformEffect(CGAffineTransform(a: 1, b: 0, c: CGFloat(tan(skew)), d: 1, tx: 0, ty: 0))
        case .needsYou:
            let (lift, sx, sy) = hop && !reduceMotion ? Self.hopPose((t / 6).truncatingRemainder(dividingBy: 1)) : (0, 1, 1)
            tinted("hat-curious")
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

    private func tinted(_ name: String) -> some View {
        let image = OrionHatFrames.image(name).map { Image(nsImage: $0).resizable().scaledToFit() }
        return ZStack {
            image
            tint.blendMode(.color).mask { image }
        }
        .compositingGroup()
    }
}
