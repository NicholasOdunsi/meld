import OrionDesignSystem
import ShelfCore
import SwiftUI

struct MotionControls: View {
    @Bindable var model: TasteModel
    private var current: TasteMotion { model.store.board?.motion ?? .snappy }

    var body: some View {
        LazyVGrid(columns: [GridItem(.flexible(), spacing: OrionSpacing.sm), GridItem(.flexible())], spacing: OrionSpacing.sm) {
            ForEach(TasteMotion.allCases, id: \.self) { motion in
                let spec = TasteMotionSpec(motion)
                Button {
                    Task { await model.store.save(.motion, to: .string(motion.rawValue)) }
                } label: {
                    VStack(alignment: .leading, spacing: OrionSpacing.xxs) {
                        Text(spec.title).font(.subheadline.weight(.semibold))
                        Text(spec.meaning).font(.caption2).foregroundStyle(.secondary).lineLimit(2)
                        MotionLoopDemo(spec: spec, compact: true)
                    }
                    .padding(OrionSpacing.sm)
                    .frame(maxWidth: .infinity, minHeight: 132, alignment: .topLeading)
                    .background(Color.primary.opacity(0.06), in: .rect(cornerRadius: OrionRadius.medium, style: .continuous))
                    .overlay {
                        if current == motion {
                            RoundedRectangle(cornerRadius: OrionRadius.medium, style: .continuous)
                                .strokeBorder(OrionColor.dayBreakBlue.color, lineWidth: 2)
                        }
                    }
                }
                .buttonStyle(.plain)
                .disabled(!model.store.canEdit)
                .accessibilityLabel(spec.title)
                .accessibilityAddTraits(current == motion ? [.isSelected] : [])
            }
        }
    }
}
