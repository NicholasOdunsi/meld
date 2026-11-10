import OrionDesignSystem
import ShelfCore
import SwiftUI

/// Shared back link, title, explanation, reason box, content, and Done / reset footer.
struct TastePanelChrome<Content: View>: View {
    let tile: TasteTile
    @Bindable var model: TasteModel
    @ViewBuilder var content: () -> Content

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: OrionSpacing.md) {
                Button("‹ Back to your taste") { model.closePanel() }
                    .buttonStyle(OrionButtonStyle(.quiet))
                Text(TasteChapters.row(for: tile).title)
                    .font(.title3.weight(.semibold))
                Text(Self.explanation(for: tile))
                    .font(.callout)
                    .foregroundStyle(.secondary)
                content()
                if let reason, !reason.isEmpty {
                    VStack(alignment: .leading, spacing: OrionSpacing.xxs) {
                        Text("Why Orion chose this")
                            .font(.caption.weight(.semibold))
                        Text(reason)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(OrionSpacing.sm)
                    .background(.fill.tertiary, in: .rect(cornerRadius: OrionRadius.medium, style: .continuous))
                }
                // Plain-words box deferred to Plan 3.
                HStack(spacing: OrionSpacing.sm) {
                    Button("Done") { model.closePanel() }
                        .buttonStyle(OrionButtonStyle(.primary))
                    Button("Let Orion decide again") {
                        Task {
                            guard await model.store.resetTile(tile) else { return }
                            model.toast = String(localized: "Orion will look again after your next saves.")
                        }
                    }
                    .buttonStyle(OrionButtonStyle(.secondary))
                    Spacer(minLength: 0)
                }
                .padding(.top, OrionSpacing.xs)
            }
            .padding(.trailing, OrionSpacing.md)
            .padding(.bottom, OrionSpacing.lg)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }

    /// Reason from a pending card for this tile, when one exists.
    private var reason: String? {
        model.store.snapshot?.pending.first { $0.tile == tile && !$0.reason.isEmpty }?.reason
    }

    static func explanation(for tile: TasteTile) -> String {
        switch tile {
        case .designLanguage:
            String(localized: "The overall mood of your screens. Pick the words that sound like you.")
        case .colors:
            String(localized: "The few colours you keep coming back to. Orion uses them for backgrounds, text and buttons.")
        case .typography:
            String(localized: "How heavy and how tight your lettering is. Heavier feels bold and confident; lighter feels quiet.")
        case .density:
            String(localized: "How much is on screen at once. Airy feels calm and premium. Packed feels powerful and busy.")
        case .spacing:
            String(localized: "Breathing room between things. Tight feels efficient; generous feels relaxed.")
        case .layoutHabits:
            String(localized: "The way you like screens arranged. Orion follows these when it designs.")
        case .signatureDetails:
            String(localized: "Small touches you repeat, like a full-width black button.")
        case .avoid:
            String(localized: "Things Orion should never do. Add anything that makes you wince.")
        }
    }
}
