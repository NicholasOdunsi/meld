import OrionDesignSystem
import ShelfCore
import SwiftUI

struct ShapeControls: View {
    @Bindable var model: TasteModel
    private var shape: TasteShape { model.store.board?.shape ?? .default }

    private func save(corners: TasteCorners? = nil, depth: TasteDepth? = nil) {
        let next = TasteShape(corners: corners ?? shape.corners, depth: depth ?? shape.depth)
        Task {
            await model.store.save(.shape, to: .object(["corners": .string(next.corners.rawValue), "depth": .string(next.depth.rawValue)]))
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: OrionSpacing.md) {
            Text("Corners").font(.caption.weight(.semibold)).foregroundStyle(.secondary)
            HStack(alignment: .top, spacing: OrionSpacing.xs) {
                ForEach(TasteCorners.allCases, id: \.self) { corners in
                    PictureChoice(title: corners.rawValue.capitalized, isSelected: shape.corners == corners) {
                        save(corners: corners)
                    } picture: {
                        ShapePicture(corners: corners, depth: shape.depth)
                    }
                }
            }
            Text("Depth").font(.caption.weight(.semibold)).foregroundStyle(.secondary)
            HStack(alignment: .top, spacing: OrionSpacing.xs) {
                ForEach(TasteDepth.allCases, id: \.self) { depth in
                    PictureChoice(title: depth.rawValue.capitalized, isSelected: shape.depth == depth) {
                        save(depth: depth)
                    } picture: {
                        ShapePicture(corners: shape.corners, depth: depth)
                    }
                }
            }
            Text("Signature details").font(.caption.weight(.semibold)).foregroundStyle(.secondary)
            ListEditor(tile: .signatureDetails, model: model)
        }
        .disabled(!model.store.canEdit)
    }
}
