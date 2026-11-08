import SwiftUI

@MainActor
public struct OrionTextFieldStyle: @MainActor TextFieldStyle {
    private let error: LocalizedStringResource?
    @FocusState private var isFocused: Bool
    @Environment(\.isEnabled) private var isEnabled
    @Environment(\.colorScheme) private var scheme
    @Environment(\.colorSchemeContrast) private var contrast

    public init(error: LocalizedStringResource? = nil) { self.error = error }

    public func _body(configuration: TextField<Self._Label>) -> some View {
        VStack(alignment: .leading, spacing: OrionSpacing.xxs) {
            configuration
                .textFieldStyle(.plain)
                .orionTextStyle(.body)
                .foregroundStyle(OrionColorRole.textPrimary.resolve(in: scheme))
                .padding(.horizontal, OrionSpacing.sm)
                .padding(.vertical, OrionSpacing.xs)
                .frame(minWidth: OrionSize.minimumHitTarget, minHeight: OrionSize.controlHeight)
                .background(OrionColorRole.surfaceStrong.resolve(in: scheme), in: .rect(cornerRadius: OrionRadius.small))
                .overlay {
                    RoundedRectangle(cornerRadius: OrionRadius.small)
                        .strokeBorder(borderColor, lineWidth: isFocused || error != nil ? OrionSize.focusBorder : OrionSize.border)
                }
                .focused($isFocused)
                .accessibilityHint(error.map { Text($0) } ?? Text(verbatim: ""))
            if let error {
                Label { Text(error) } icon: { Image(systemName: "exclamationmark.circle.fill") }
                    .orionTextStyle(.caption)
                    .foregroundStyle(OrionColorRole.textPrimary.resolve(in: scheme))
            }
        }
        .opacity(isEnabled ? 1 : 0.45)
    }

    private var borderColor: Color {
        if isFocused { return OrionColorRole.focus.resolve(in: scheme) }
        if error != nil { return OrionColor.loudRed.color }
        return OrionColorRole.borderStrong.resolve(in: scheme, contrast: contrast)
    }
}
