import OrionDesignSystem
import ShelfCore
import SwiftUI

struct ColourPanel: View {
    @Bindable var model: TasteModel
    @State private var selectedRole: TasteColorRole?

    private var colors: [TasteColor] { model.store.board?.colors ?? [] }

    var body: some View {
        TastePanelChrome(tile: .colors, model: model) {
            VStack(alignment: .leading, spacing: OrionSpacing.md) {
                HStack(alignment: .top, spacing: OrionSpacing.sm) {
                    ForEach(colors, id: \.role) { color in
                        swatch(color)
                    }
                }

                if let role = selectedRole, let current = colors.first(where: { $0.role == role }) {
                    ColorPicker(
                        "",
                        selection: Binding(
                            get: { Color(hexString: current.hex) },
                            set: { newColor in
                                let hex = newColor.hexString
                                let value = TasteEdits.palette(setting: role, to: hex, in: colors)
                                Task { await model.store.save(.colors, to: value) }
                            }
                        )
                    )
                    .labelsHidden()
                    .frame(maxWidth: 120)
                }

                Text("Quick starts")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
                TasteDashedChips(items: Self.quickStarts.map(\.title)) { title in
                    guard let preset = Self.quickStarts.first(where: { $0.title == title }) else { return }
                    Task { await model.store.save(.colors, to: TasteEdits.colorsJSON(preset.colors)) }
                }
            }
        }
    }

    private func swatch(_ color: TasteColor) -> some View {
        Button {
            selectedRole = color.role
        } label: {
            VStack(spacing: OrionSpacing.xxs) {
                ZStack(alignment: .topTrailing) {
                    RoundedRectangle(cornerRadius: OrionRadius.small, style: .continuous)
                        .fill(Color(hexString: color.hex))
                        .frame(width: 44, height: 44)
                        .overlay {
                            RoundedRectangle(cornerRadius: OrionRadius.small, style: .continuous)
                                .strokeBorder(
                                    selectedRole == color.role ? Color.primary : Color.secondary.opacity(0.3),
                                    lineWidth: selectedRole == color.role ? 2 : 1
                                )
                        }
                    if color.role == .accent {
                        Text("accent")
                            .font(.system(size: 8, weight: .semibold))
                            .padding(.horizontal, 4)
                            .padding(.vertical, 1)
                            .background(.ultraThinMaterial, in: Capsule())
                            .offset(x: 6, y: -6)
                    }
                }
                Text(color.role.rawValue)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
    }

    private static let quickStarts: [(title: String, colors: [TasteColor])] = [
        ("Black & white", [
            TasteColor(hex: "#ffffff", role: .base),
            TasteColor(hex: "#111111", role: .text),
            TasteColor(hex: "#111111", role: .action),
        ]),
        ("Warm neutrals", [
            TasteColor(hex: "#faf6f0", role: .base),
            TasteColor(hex: "#2b2118", role: .text),
            TasteColor(hex: "#2b2118", role: .action),
            TasteColor(hex: "#c8553d", role: .accent),
        ]),
        ("Soft pastels", [
            TasteColor(hex: "#fbf7ff", role: .base),
            TasteColor(hex: "#2a2540", role: .text),
            TasteColor(hex: "#6c5ce7", role: .action),
            TasteColor(hex: "#ff8fab", role: .accent),
        ]),
    ]
}

/// Dashed suggestion / quick-start chips for Taste panels.
struct TasteDashedChips: View {
    let items: [String]
    let action: (String) -> Void

    var body: some View {
        FlowLayout(spacing: OrionSpacing.xs) {
            ForEach(items, id: \.self) { item in
                Button(item) { action(item) }
                    .buttonStyle(.plain)
                    .font(.caption)
                    .padding(.horizontal, OrionSpacing.sm)
                    .padding(.vertical, OrionSpacing.xxs + 2)
                    .overlay {
                        Capsule(style: .continuous)
                            .strokeBorder(style: StrokeStyle(lineWidth: 1, dash: [4, 3]))
                            .foregroundStyle(.secondary)
                    }
            }
        }
    }
}
