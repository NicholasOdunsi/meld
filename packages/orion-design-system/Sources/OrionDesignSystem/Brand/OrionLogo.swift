import SwiftUI

public struct OrionLogo: View {
    private let form: OrionLogoForm
    private let foreground: Color
    private let decorative: Bool

    public init(form: OrionLogoForm = .wordmark, foreground: Color = OrionColor.dayBreakBlue.color, decorative: Bool = false) {
        self.form = form
        self.foreground = foreground
        self.decorative = decorative
    }

    public var body: some View {
        OrionLogoShape(form: form)
            .fill(foreground, style: FillStyle(eoFill: true))
            .aspectRatio(form.aspectRatio, contentMode: .fit)
            .accessibilityLabel(Text("Orion", bundle: .module))
            .accessibilityHidden(decorative)
    }
}
