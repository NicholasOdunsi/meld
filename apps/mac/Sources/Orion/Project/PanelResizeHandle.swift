import AppKit
import OrionAppCore
import SwiftUI

/// The invisible strip on the side panel's left edge. Drag it to resize the
/// panel; the width stays between `PanelWidth`'s limits as you drag.
struct PanelResizeHandle: View {
    @Bindable var frame: FrameModel
    let detailWidth: Double

    @State private var dragStartWidth: Double?
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
                DragGesture(minimumDistance: 1, coordinateSpace: .global)
                    .onChanged { value in
                        let start = dragStartWidth ?? frame.sidePanelWidth(inDetailWidth: detailWidth)
                        dragStartWidth = start
                        // The panel is on the right: dragging left makes it wider.
                        frame.preferredSidePanelWidth = PanelWidth.clamp(
                            start - value.translation.width, windowWidth: detailWidth
                        )
                        updateCursor()
                    }
                    .onEnded { _ in
                        dragStartWidth = nil
                        updateCursor()
                    }
            )
            .onDisappear {
                isHovering = false
                dragStartWidth = nil
                updateCursor()
            }
            .accessibilityHidden(true)
    }

    /// Keeps the resize cursor while hovering or dragging, with push/pop balanced.
    private func updateCursor() {
        let wanted = isHovering || dragStartWidth != nil
        if wanted && !isCursorPushed {
            NSCursor.resizeLeftRight.push()
            isCursorPushed = true
        } else if !wanted && isCursorPushed {
            NSCursor.pop()
            isCursorPushed = false
        }
    }
}
