import OrionDesignSystem
import SwiftUI

/// Orion's one dialog shape (New Project, Rename, Delete): a centred glass
/// panel with big corners, a bold title, optional message and fields, then
/// Cancel and the action as two equal buttons. Drawn inside the window by
/// `OrionFrameView` (system sheets and alerts can't take Orion's colours).
struct OrionDialog<Content: View>: View {
    let title: Text
    var message: Text?
    let actionTitle: LocalizedStringKey
    /// Orion blue for normal actions, Orion red for destructive ones.
    var isDestructive = false
    var canConfirm = true
    let onCancel: () -> Void
    let onConfirm: () -> Void
    @ViewBuilder var content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: OrionSpacing.md) {
            VStack(alignment: .leading, spacing: OrionSpacing.xs) {
                title
                    .font(.headline)
                if let message {
                    message
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }

            content

            HStack(spacing: OrionSpacing.sm) {
                Button(action: onCancel) {
                    Text("Cancel").frame(maxWidth: .infinity)
                }
                .buttonStyle(.glass)
                .keyboardShortcut(.cancelAction)

                confirmButton
                    .disabled(!canConfirm)
            }
            .controlSize(.extraLarge)
            .padding(.top, OrionSpacing.xxs)
        }
        .padding(OrionSpacing.lg)
        .frame(width: 320)
        .glassEffect(.regular, in: .rect(cornerRadius: 26, style: .continuous))
        .shadow(color: .black.opacity(0.35), radius: 30, y: 12)
        .accessibilityElement(children: .contain)
        .accessibilityAddTraits(.isModal)
        // Esc closes even while typing in a field.
        .onExitCommand(perform: onCancel)
    }

    @ViewBuilder
    private var confirmButton: some View {
        let button = Button(action: onConfirm) {
            Text(actionTitle).frame(maxWidth: .infinity)
        }
        .buttonStyle(.glassProminent)
        if isDestructive {
            // No Return shortcut: deleting should take a deliberate click.
            button.tint(OrionColor.loudRed.color)
        } else {
            button
                .tint(OrionColor.dayBreakBlue.color)
                .keyboardShortcut(.defaultAction)
        }
    }
}

extension View {
    /// The name box inside an `OrionDialog`: the same soft fill as the panel.
    func orionDialogField() -> some View {
        textFieldStyle(.plain)
            .padding(.horizontal, OrionSpacing.sm)
            .frame(minHeight: 36)
            .background(.fill.tertiary, in: .rect(cornerRadius: 10, style: .continuous))
    }
}
