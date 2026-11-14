import AppKit
import OrionDesignSystem
import SwiftUI

/// A short message that rides just above a composer, outside its glass. Tap to dismiss.
struct ComposerStatusPill: View {
    let notice: ComposerNotice
    let onDismiss: () -> Void

    var body: some View {
        Button(action: onDismiss) {
            HStack(spacing: OrionSpacing.xs) {
                if notice.kind == .error {
                    Image(systemName: "exclamationmark.circle.fill")
                        .foregroundStyle(Color.red.opacity(0.95))
                        .accessibilityHidden(true)
                }
                Text(notice.text)
                    .font(.system(size: 13, weight: .regular))
                    .foregroundStyle(.white.opacity(0.92))
                    .multilineTextAlignment(.leading)
                    .lineLimit(3)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(.horizontal, OrionSpacing.md)
            .padding(.vertical, OrionSpacing.xs + 2)
            .glassEffect(.regular.tint(.black.opacity(0.35)), in: .capsule)
            .shadow(color: .black.opacity(0.3), radius: 12, y: 4)
        }
        .buttonStyle(.plain)
        .pointerStyle(.link)
        .help("Dismiss")
        .accessibilityElement(children: .combine)
        .accessibilityHint("Dismisses this message")
        .onAppear {
            NSAccessibility.post(
                element: NSApp as Any,
                notification: .announcementRequested,
                userInfo: [.announcement: notice.text, .priority: NSAccessibilityPriorityLevel.high.rawValue]
            )
        }
    }
}
