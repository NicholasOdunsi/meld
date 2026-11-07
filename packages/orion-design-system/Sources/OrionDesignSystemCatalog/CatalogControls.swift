import SwiftUI
import OrionDesignSystem

struct CatalogControls: View {
    @State private var name = ""
    @State private var invalid = ""
    @State private var saved = false
    var body: some View {
        OrionCard {
            VStack(alignment: .leading, spacing: OrionSpacing.md) {
                OrionText("Components", style: .title)
                ViewThatFits {
                    HStack(spacing: OrionSpacing.xs) { CatalogButtons(saved: $saved) }
                    VStack(alignment: .leading, spacing: OrionSpacing.xs) { CatalogButtons(saved: $saved) }
                }
                TextField("Collection name", text: $name).textFieldStyle(OrionTextFieldStyle())
                TextField("Required collection", text: $invalid)
                    .textFieldStyle(OrionTextFieldStyle(error: "Give your collection a name."))
                TextField("Disabled field", text: .constant("Read only"))
                    .textFieldStyle(OrionTextFieldStyle()).disabled(true)
                ViewThatFits {
                    HStack(spacing: OrionSpacing.xs) { CatalogStatuses() }
                    VStack(alignment: .leading, spacing: OrionSpacing.xs) { CatalogStatuses() }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}
