import OrionAppCore
import OrionDesignSystem
import SwiftUI

/// A quiet line at the end of a conversation showing Orion's current task.
struct ActivityLine: View {
    let activity: StreamActivity
    @State private var sway = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        HStack(spacing: OrionSpacing.sm) {
            ChatAvatar(isOrion: true, size: 20)
                .rotationEffect(.degrees(isWorking && sway ? 6 : -6), anchor: .bottom)
                .animation(isWorking && !reduceMotion
                           ? .easeInOut(duration: 0.7).repeatForever(autoreverses: true) : .default, value: sway)
            Text(activity.line())
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .lineLimit(2)
        }
        .padding(.leading, 2)
        .onAppear { sway = true }
        .accessibilityElement(children: .combine)
    }

    private var isWorking: Bool {
        switch activity.phase {
        case .reading, .replying, .designing: true
        default: false
        }
    }
}
