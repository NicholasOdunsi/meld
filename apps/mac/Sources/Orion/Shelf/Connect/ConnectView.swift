import SwiftUI

struct ConnectView: View {
    @Environment(AppModel.self) private var appModel
    @State private var model = ConnectModel()

    var body: some View {
        VStack(alignment: .leading, spacing: ShelfDesign.spacing) {
            ContentUnavailableView(
                "Connect the shelf",
                systemImage: "link",
                description: Text("In Orion, open Settings → Shelf and click Connect shelf.")
            )
            TextField("Orion address", text: $model.baseURLText)
            TextField("Code", text: $model.code)
                .onSubmit(connect)
            if let errorMessage = model.errorMessage {
                Text(errorMessage)
                    .foregroundStyle(.red)
            }
            Button("Connect", action: connect)
                .buttonStyle(.borderedProminent)
                .pointerStyle(model.code.isEmpty || model.isConnecting ? .default : .link)
                .disabled(model.code.isEmpty || model.isConnecting)
        }
        .onAppear(perform: prefill)
    }

    private func prefill() {
        model.prefill(from: appModel.baseURL)
    }

    private func connect() {
        Task { await model.connect(using: appModel) }
    }
}
