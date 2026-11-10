import OrionDesignSystem
import ShelfCore
import SwiftUI

struct TypographyPanel: View {
    @Bindable var model: TasteModel

    private var typography: TasteTypography {
        model.store.board?.typography ?? TasteTypography(weight: .regular, tracking: .normal, note: "")
    }

    var body: some View {
        TastePanelChrome(tile: .typography, model: model) {
            VStack(alignment: .leading, spacing: OrionSpacing.md) {
                Text("Weight")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
                HStack(alignment: .top, spacing: OrionSpacing.xs) {
                    ForEach(TasteWeight.allCases, id: \.self) { weight in
                        PictureChoice(
                            title: weight.rawValue.capitalized,
                            isSelected: typography.weight == weight
                        ) {
                            save(weight: weight, tracking: nil)
                        } picture: {
                            MiniScreen(.weight(weight))
                        }
                    }
                }
                if model.store.snapshot?.appleRules == true, typography.weight == .light {
                    Text("Apple rules use Regular instead of Light on iPhone and Mac screens.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                Text("Tracking")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
                HStack(spacing: OrionSpacing.xs) {
                    ForEach(TasteTracking.allCases, id: \.self) { tracking in
                        Button {
                            save(weight: nil, tracking: tracking)
                        } label: {
                            Text("Aa tracking")
                                .font(.body)
                                .tracking(trackingValue(tracking))
                                .padding(.horizontal, OrionSpacing.sm)
                                .padding(.vertical, OrionSpacing.xs)
                                .frame(maxWidth: .infinity)
                                .background(
                                    typography.tracking == tracking ? Color.primary.opacity(0.08) : Color.clear,
                                    in: .rect(cornerRadius: OrionRadius.small, style: .continuous)
                                )
                                .overlay {
                                    RoundedRectangle(cornerRadius: OrionRadius.small, style: .continuous)
                                        .strokeBorder(
                                            typography.tracking == tracking ? Color.primary : Color.secondary.opacity(0.3),
                                            lineWidth: typography.tracking == tracking ? 2 : 1
                                        )
                                }
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel(tracking.rawValue.capitalized)
                    }
                }

                Text("Quick starts")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
                TasteDashedChips(items: ["Make it feel like Apple"]) { _ in
                    Task { await model.composeAppleQuickStart() }
                }
                .disabled(!model.store.canEdit)
            }
        }
    }

    private func save(weight: TasteWeight?, tracking: TasteTracking?) {
        let value = TasteEdits.typography(typography, weight: weight, tracking: tracking)
        Task { await model.store.save(.typography, to: value) }
    }

    private func trackingValue(_ tracking: TasteTracking) -> CGFloat {
        switch tracking {
        case .loose: 1.2
        case .normal: 0
        case .tight: -0.8
        }
    }
}
