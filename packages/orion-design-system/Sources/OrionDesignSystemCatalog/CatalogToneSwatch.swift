import SwiftUI
import OrionDesignSystem

struct CatalogToneSwatch: View {
    let tone: OrionTone
    let variant: OrionToneVariant
    let letter: String
    var body: some View {
        let palette = tone.palette(for: variant)
        OrionSurface(tone: tone, variant: variant) {
            VStack(alignment: .leading, spacing: OrionSpacing.md) {
                HStack(spacing: OrionSpacing.xxs) {
                    ForEach(Array(palette.accents.enumerated()), id: \.offset) { _, accent in
                        OrionLogo(form: .mark, foreground: accent.color, decorative: true)
                            .frame(maxWidth: OrionSpacing.xl)
                    }
                }
                .frame(height: OrionSpacing.xl)
                Text(verbatim: letter).orionTextStyle(.caption, emphasized: true)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(OrionSpacing.md)
        }
        .clipShape(.rect(cornerRadius: OrionRadius.small))
        .accessibilityElement(children: .combine)
        .accessibilityLabel(Text(verbatim: "\(tone), combination \(letter)"))
    }
}
