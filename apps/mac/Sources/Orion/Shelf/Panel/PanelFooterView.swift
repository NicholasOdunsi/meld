import SwiftUI

struct PanelFooterView: View {
    let openOrion: () -> Void
    let quit: () -> Void

    var body: some View {
        HStack {
            Button("Open Orion", systemImage: "macwindow", action: openOrion)
            Spacer()
            SettingsLink {
                Label("Settings…", systemImage: "gearshape")
            }
            Button("Quit Orion", systemImage: "power", action: quit)
        }
        .labelStyle(.titleAndIcon)
        .buttonStyle(.borderless)
    }
}
