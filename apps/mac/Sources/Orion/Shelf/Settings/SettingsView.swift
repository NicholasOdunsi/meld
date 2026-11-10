import SwiftUI

struct SettingsView: View {
    @Environment(AppModel.self) private var appModel

    var body: some View {
        @Bindable var appModel = appModel
        Form {
            Section("Connection") {
                LabeledContent("Orion", value: appModel.baseURL.absoluteString)
                if case .connected(_, let workspaceName) = appModel.connection {
                    LabeledContent("Workspace", value: workspaceName)
                    Button("Disconnect", role: .destructive, action: appModel.disconnect)
                        .pointerStyle(.link)
                } else {
                    Text("Not connected")
                        .foregroundStyle(.secondary)
                }
            }
            Section("General") {
                Toggle("Open at login", isOn: $appModel.launchAtLogin)
                LabeledContent("Version", value: Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "—")
                Button("Check for Updates…") { appModel.checkForUpdates?() }
                    .pointerStyle(.link)
            }
            Section("Waiting images") {
                Button("Open outbox folder", systemImage: "folder", action: appModel.openOutboxFolder)
                    .pointerStyle(.link)
            }
        }
        .formStyle(.grouped)
        .frame(width: ShelfDesign.settingsWidth)
    }
}
