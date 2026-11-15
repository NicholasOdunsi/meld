import AppKit
import OrionAppCore
import SwiftUI

/// The invisible strip on the side panel's left edge. Drag it to resize the
/// panel; the width stays between `PanelWidth`'s limits as you drag and is
/// saved when the drag ends. A click (or a cancelled press) changes nothing.
struct PanelResizeHandle: View {
    @Bindable var frame: FrameModel
    let detailWidth: Double

    /// True while SwiftUI thinks the drag is going on; it resets itself even
    /// when the gesture is cancelled and `onEnded` never comes.
    @GestureState private var isDragging = false
    @State private var isHovering = false
    @State private var isCursorPushed = false

    var body: some View {
        Color.clear
            .frame(width: 8)
            .contentShape(Rectangle())
            // Centred on the 1pt divider, so half the strip is over the chat.
            .offset(x: -4)
            .onHover { inside in
                isHovering = inside
                updateCursor()
            }
            .gesture(
                DragGesture(minimumDistance: 0, coordinateSpace: .global)
                    .updating($isDragging) { _, state, _ in state = true }
                    .onChanged { value in
                        frame.changeSidePanelDrag(startLocationX: value.startLocation.x,
                                                  translation: value.translation.width,
                                                  detailWidth: detailWidth)
                        updateCursor()
                    }
                    .onEnded { _ in
                        frame.finishSidePanelDrag()
                        updateCursor()
                    }
            )
            .onChange(of: isDragging) { _, dragging in
                // Cancelled without `onEnded`: finish anyway (a no-op if it already ended).
                if !dragging { frame.finishSidePanelDrag(); updateCursor() }
            }
            .onDisappear {
                isHovering = false
                frame.finishSidePanelDrag()
                updateCursor()
            }
            .accessibilityHidden(true)
    }

    /// Keeps the resize cursor while hovering or dragging, with push/pop balanced.
    private func updateCursor() {
        let wanted = isHovering || frame.isDraggingSidePanel
        if wanted && !isCursorPushed {
            NSCursor.resizeLeftRight.push()
            isCursorPushed = true
        } else if !wanted && isCursorPushed {
            NSCursor.pop()
            isCursorPushed = false
        }
    }
}
