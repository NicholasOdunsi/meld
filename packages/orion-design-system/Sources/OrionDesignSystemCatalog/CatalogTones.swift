import SwiftUI
import OrionDesignSystem

struct CatalogTones: View {
    var body: some View {
        VStack(alignment: .leading, spacing: OrionSpacing.md) {
            OrionText("Color in combination", style: .title)
            Text("A–G / Decorative accents follow the brand guide. Text uses a readable foreground.")
                .orionTextStyle(.callout)
            ForEach(OrionTone.allCases, id: \.self) { tone in
                Text(verbatim: String(describing: tone).capitalized).orionTextStyle(.label)
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 120), spacing: OrionSpacing.xs)], spacing: OrionSpacing.xs) {
                    ForEach(Array(OrionToneVariant.allCases.enumerated()), id: \.offset) { index, variant in
                        CatalogToneSwatch(tone: tone, variant: variant, letter: ["A", "B", "C", "D", "E", "F", "G"][index])
                    }
                }
            }
        }
    }
}
