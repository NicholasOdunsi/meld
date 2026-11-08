import SwiftUI

/// Locale-aware headline presentation preserves the original VoiceOver label.
public struct OrionText: View {
    private let text: LocalizedStringResource
    private let style: OrionTextStyle
    private let emphasized: Bool
    @Environment(\.locale) private var locale

    public init(_ text: LocalizedStringResource, style: OrionTextStyle = .body, emphasized: Bool = false) {
        self.text = text
        self.style = style
        self.emphasized = emphasized
    }

    public var body: some View {
        let localized = localizedText
        Text(verbatim: style.isHeadline ? localized.uppercased(with: locale) : localized)
            .orionTextStyle(style, emphasized: emphasized)
            .accessibilityLabel(Text(verbatim: localized))
    }

    private var localizedText: String {
        var resource = text
        resource.locale = locale
        return String(localized: resource)
    }
}
