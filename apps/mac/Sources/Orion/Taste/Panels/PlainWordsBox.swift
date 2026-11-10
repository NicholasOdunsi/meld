import OrionDesignSystem
import ShelfCore
import SwiftUI

/// Single-line-grows field under every edit panel for scoped compose.
struct PlainWordsBox: View {
    let tile: TasteTile
    @Bindable var model: TasteModel

    @State private var text = ""
    @State private var inlineError: String?

    private var composerEnabled: Bool { model.store.snapshot?.composerEnabled != false }
    private var canSend: Bool {
        TastePanelRequests.words(text, tile: tile) != nil && model.store.canEdit
    }

    var body: some View {
        if composerEnabled {
            VStack(alignment: .leading, spacing: OrionSpacing.xxs) {
                HStack(alignment: .bottom, spacing: OrionSpacing.sm) {
                    TextField("…or say it in your words", text: $text, axis: .vertical)
                        .textFieldStyle(.plain)
                        .lineLimit(1...4)
                        .onChange(of: text) { _, _ in inlineError = nil }

                    Button("Send") {
                        Task { await send() }
                    }
                    .buttonStyle(OrionButtonStyle(.secondary))
                    .disabled(!canSend)
                }
                .padding(OrionSpacing.sm)
                .background(.fill.tertiary, in: .rect(cornerRadius: OrionRadius.medium, style: .continuous))

                if let inlineError {
                    Text(inlineError)
                        .font(.caption)
                        .foregroundStyle(.red.opacity(0.85))
                }
            }
        }
    }

    private func send() async {
        guard let request = TastePanelRequests.words(text, tile: tile) else { return }
        inlineError = nil
        guard await model.store.compose(request) else {
            inlineError = Self.message(for: model.store.composeState)
            return
        }
        text = ""
        model.closePanel()
    }

    private static func message(for state: TasteStore.ComposeState) -> String {
        switch state {
        case .failed(let message):
            message
        case .noResult:
            String(localized: "Orion couldn't find anything usable in that. Try adding a few words about what you like.")
        default:
            String(localized: "Orion couldn't read that right now. Try again.")
        }
    }
}
