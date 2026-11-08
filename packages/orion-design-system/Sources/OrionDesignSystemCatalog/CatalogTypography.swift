import SwiftUI
import OrionDesignSystem

struct CatalogTypography: View {
    var body: some View {
        OrionCard {
            VStack(alignment: .leading, spacing: OrionSpacing.md) {
                OrionText("Typography", style: .title)
                OrionText("Ideas deserve space.", style: .headline)
                OrionText("A clear voice for every detail.", style: .subheadline)
                OrionText("Space Grotesk leads. Manrope keeps the details readable, from your first idea to the finished work.")
                OrionText("Body emphasis / Manrope Bold", emphasized: true)
                OrionText("Callout / Made for everyday use", style: .callout)
                OrionText("Caption / The small details matter", style: .caption)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}
