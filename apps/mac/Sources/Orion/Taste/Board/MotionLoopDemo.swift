import OrionDesignSystem
import ShelfCore
import SwiftUI

extension TasteMotionSpec {
    var enterAnimation: Animation? {
        switch motion {
        case .instant: nil
        case .playful: .spring(duration: enterDuration, bounce: 0.15)
        case .snappy, .smooth: .timingCurve(curve[0], curve[1], curve[2], curve[3], duration: enterDuration)
        }
    }

    var exitAnimation: Animation? {
        motion == .instant ? nil : .timingCurve(0.2, 0, 0, 1, duration: Self.exitDuration)
    }
}

/// A toast that arrives and leaves and a button that presses, looping on a 2.4 s cycle at the
/// chosen speed. With Reduce Motion on it stops on the end state.
struct MotionLoopDemo: View {
    let spec: TasteMotionSpec
    var compact = false
    var toastText = "Saved"
    var buttonTitle = "Save changes"

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var shown = true
    @State private var pressed = false

    var body: some View {
        VStack(alignment: .leading, spacing: compact ? OrionSpacing.xs : OrionSpacing.sm) {
            HStack(spacing: OrionSpacing.xs) {
                Circle().fill(Color.green).frame(width: 10, height: 10)
                Text(toastText).font(compact ? .caption2 : .caption)
            }
            .padding(.horizontal, OrionSpacing.sm)
            .padding(.vertical, OrionSpacing.xxs + 2)
            .background(Color.primary.opacity(0.12), in: Capsule(style: .continuous))
            .opacity(shown ? 1 : 0)
            .offset(y: shown ? 0 : spec.rise)
            .blur(radius: shown ? 0 : spec.blur)

            Text(buttonTitle)
                .font(compact ? .caption2.weight(.semibold) : .caption.weight(.semibold))
                .foregroundStyle(.black)
                .padding(.horizontal, OrionSpacing.sm)
                .padding(.vertical, OrionSpacing.xxs + 2)
                .background(.white, in: .rect(cornerRadius: OrionRadius.small, style: .continuous))
                .scaleEffect(pressed ? TasteMotionSpec.pressScale : 1)
        }
        .task(id: spec) { await loop() }
        .accessibilityHidden(true)
    }

    private func loop() async {
        shown = true
        pressed = false
        guard !reduceMotion else { return }
        while !Task.isCancelled {
            withAnimation(nil) { shown = false }
            try? await Task.sleep(for: .milliseconds(300))
            withAnimation(spec.enterAnimation) { shown = true }
            try? await Task.sleep(for: .milliseconds(800))
            withAnimation(.easeOut(duration: TasteMotionSpec.pressDuration)) { pressed = true }
            try? await Task.sleep(for: .milliseconds(450))
            withAnimation(.easeOut(duration: TasteMotionSpec.pressDuration)) { pressed = false }
            try? await Task.sleep(for: .milliseconds(500))
            withAnimation(spec.exitAnimation) { shown = false }
            try? await Task.sleep(for: .milliseconds(350))
        }
    }
}
