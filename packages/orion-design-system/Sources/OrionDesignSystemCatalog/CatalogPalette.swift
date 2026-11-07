import SwiftUI
import OrionDesignSystem

struct CatalogPalette: View {
    var body: some View {
        VStack(alignment: .leading, spacing: OrionSpacing.md) {
            OrionText("The full spectrum", style: .title)
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 170), spacing: OrionSpacing.xs)], spacing: OrionSpacing.xs) {
                ForEach(OrionColor.allCases, id: \.self) { color in
                    VStack(alignment: .leading, spacing: OrionSpacing.xs) {
                        Text(verbatim: String(describing: color)).orionTextStyle(.label)
                        Text(verbatim: color.hex).orionTextStyle(.caption)
                    }
                    .frame(maxWidth: .infinity, minHeight: 70, alignment: .leading)
                    .padding(OrionSpacing.md)
                    .foregroundStyle(color.textForeground.color)
                    .background(color.color, in: .rect(cornerRadius: OrionRadius.small))
                }
            }
        }
    }
}
