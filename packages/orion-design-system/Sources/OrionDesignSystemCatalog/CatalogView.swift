import SwiftUI
import OrionDesignSystem

struct CatalogView: View {
    @State private var dark = true
    var body: some View {
        ScrollView {
            CatalogContent()
                .padding(OrionSpacing.xl)
                .frame(maxWidth: OrionSize.catalogWidth)
                .frame(maxWidth: .infinity)
        }
        .background(OrionColorRole.canvas.resolve(in: dark ? .dark : .light))
        .environment(\.colorScheme, dark ? .dark : .light)
        .orionPreferredAppearance()
        .toolbar { Toggle("Dark appearance", isOn: $dark) }
    }
}
