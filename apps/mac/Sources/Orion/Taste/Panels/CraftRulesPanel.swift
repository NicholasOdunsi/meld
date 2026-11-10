import OrionDesignSystem
import ShelfCore
import SwiftUI

/// Read-only: what Orion always does. No editing, no reset.
struct CraftRulesPanel: View {
    @Bindable var model: TasteModel

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: OrionSpacing.md) {
                Button("‹ Back to board") { model.closePanel() }
                    .buttonStyle(OrionButtonStyle(.quiet))
                Label(TasteSlot.craft.title, systemImage: "lock.fill").font(.title3.weight(.semibold))
                Text(TasteSlot.craft.explanation).font(.callout).foregroundStyle(.secondary)
                ForEach(TasteCraftGroup.allCases, id: \.self) { group in
                    VStack(alignment: .leading, spacing: OrionSpacing.xxs) {
                        Text(group.title.uppercased()).font(.caption2.weight(.semibold)).foregroundStyle(.secondary)
                        VStack(spacing: 0) {
                            ForEach(TasteCraftRules.rules(in: group)) { rule in
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(rule.title).font(.subheadline)
                                    Text(rule.reason).font(.caption).foregroundStyle(.secondary)
                                }
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .padding(OrionSpacing.sm)
                                Divider()
                            }
                        }
                        .background(Color.primary.opacity(0.06), in: .rect(cornerRadius: OrionRadius.medium, style: .continuous))
                    }
                }
            }
            .padding(OrionSpacing.md)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}
