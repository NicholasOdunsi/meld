import SwiftUI

struct PanelFooterView: View {
    let openLibrary: () -> Void
    let quit: () -> Void

    var body: some View {
        HStack {
            Button("Open Library", systemImage: "square.grid.2x2", action: openLibrary)
            Spacer()
            SettingsLink {
                Label("Settings…", systemImage: "gearshape")
            }
            Button("Quit", systemImage: "power", action: quit)
        }
        .labelStyle(.titleAndIcon)
        .buttonStyle(.borderless)
    }
}
