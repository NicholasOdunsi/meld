import ShelfCore
import SwiftUI

struct DropZoneView: View {
    let onDrop: ([CapturedImage]) -> Void
    let onPaste: () -> Void
    @State private var isTargeted = false

    var body: some View {
        RoundedRectangle(cornerRadius: ShelfDesign.cornerRadius)
            .strokeBorder(
                isTargeted ? AnyShapeStyle(.tint) : AnyShapeStyle(.secondary),
                style: StrokeStyle(lineWidth: ShelfDesign.dropBorderWidth, dash: ShelfDesign.dropDash.map { CGFloat($0) })
            )
            .overlay {
                Label("Drop or paste images", systemImage: "photo.on.rectangle.angled")
                    .foregroundStyle(.secondary)
            }
            .frame(height: ShelfDesign.dropZoneHeight)
            .contentShape(.rect)
            .dropDestination(for: ShelfDropItem.self) { items, _ in
                onDrop(items.map(\.captured))
                return !items.isEmpty
            } isTargeted: { isTargeted = $0 }
            .focusable()
            .onPasteCommand(of: [.image, .fileURL], perform: { _ in onPaste() })
            .accessibilityLabel("Drop zone. Drop images here or press Command V to paste.")
    }
}
