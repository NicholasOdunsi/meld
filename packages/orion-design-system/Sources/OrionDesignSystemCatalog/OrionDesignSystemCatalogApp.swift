import SwiftUI
import OrionDesignSystem

@main
struct OrionDesignSystemCatalogApp: App {
    init() {
        if let index = CommandLine.arguments.firstIndex(of: "--snapshot"),
           CommandLine.arguments.indices.contains(index + 1) {
            CatalogSnapshot.export(to: CommandLine.arguments[index + 1])
            Foundation.exit(0)
        }
    }
    var body: some Scene {
        WindowGroup("Orion Design System") {
            CatalogView()
                .frame(minWidth: 420, minHeight: 600)
                .orionPreferredAppearance()
        }
    }
}
