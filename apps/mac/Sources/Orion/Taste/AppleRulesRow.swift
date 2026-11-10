import OrionDesignSystem
import ShelfCore
import SwiftUI

/// Fifth chapter block: follow Apple HIG-style rules while taste drives look.
struct AppleRulesRow: View {
    @Bindable var model: TasteModel

    private static let rules: [String] = [
        "Buttons are at least 44 pt tall",
        "Body text is 17 pt on iPhone and 13 pt on Mac, never below 11 pt",
        "No Thin or Light type",
        "At most two typefaces",
        "Most important things go top and leading",
        "Controls look different from content, and colours work in Light and Dark",
    ]

    var body: some View {
        VStack(alignment: .leading, spacing: OrionSpacing.xs) {
            Text("Apple design rules")
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(.primary)
            Toggle(
                "Follow Apple's design rules",
                isOn: Binding(
                    get: { model.store.snapshot?.appleRules ?? true },
                    set: { value in Task { await model.store.setAppleRules(value) } }
                )
            )
            .disabled(!model.store.canEdit)
            Text("For screens Orion designs for iPhone, iPad and Mac apps. Your taste decides the look; these rules protect usability.")
                .font(.caption)
                .foregroundStyle(.secondary)
            DisclosureGroup("What the rules say") {
                VStack(alignment: .leading, spacing: OrionSpacing.xxs) {
                    ForEach(Self.rules, id: \.self) { rule in
                        Text("• \(rule)")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
                .padding(.top, OrionSpacing.xxs)
            }
            .font(.caption)
        }
    }
}
