import SwiftUI
import OrionDesignSystem

struct CatalogContent: View {
    @Environment(\.colorScheme) private var scheme
    var body: some View {
        VStack(alignment: .leading, spacing: OrionSpacing.xl) {
            OrionLogo().frame(width: OrionSize.wordmarkWidth)
            OrionText("Built to stand out.", style: .display)
            Text("ORION / NATIVE DESIGN SYSTEM / 01")
                .orionTextStyle(.caption)
                .foregroundStyle(OrionColorRole.textSecondary.resolve(in: scheme))
            CatalogTypography()
            CatalogControls()
            CatalogPalette()
            CatalogRoles()
            CatalogTones()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .foregroundStyle(OrionColorRole.textPrimary.resolve(in: scheme))
        .tint(OrionColor.dayBreakBlue.color)
    }
}
