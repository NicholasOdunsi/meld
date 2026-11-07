import SwiftUI
import OrionDesignSystem

struct CatalogRoles: View {
    @Environment(\.colorScheme) private var scheme
    @Environment(\.colorSchemeContrast) private var contrast

    var body: some View {
        VStack(alignment: .leading, spacing: OrionSpacing.md) {
            OrionText("Colors with purpose", style: .title)
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 170))], alignment: .leading, spacing: OrionSpacing.sm) {
                ForEach(OrionColorRole.allCases, id: \.self) { role in
                    HStack(spacing: OrionSpacing.xs) {
                        RoundedRectangle(cornerRadius: OrionRadius.small)
                            .fill(role.resolve(in: scheme, contrast: contrast))
                            .stroke(OrionColorRole.border.resolve(in: scheme), lineWidth: OrionSize.border)
                            .frame(width: OrionSize.icon, height: OrionSize.icon)
                            .accessibilityHidden(true)
                        Text(verbatim: String(describing: role)).orionTextStyle(.callout)
                    }
                }
            }
        }
    }
}
