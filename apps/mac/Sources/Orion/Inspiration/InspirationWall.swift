import AppKit
import OrionAppCore
import ShelfCore
import SwiftUI

struct InspirationWall: View {
    @Bindable var model: InspirationModel
    let pending: [RecentCapture]
    let onColumns: ([[Int]]) -> Void

    private let spacing: CGFloat = 12

    var body: some View {
        GeometryReader { proxy in
            let usable = proxy.size.width - spacing * 2
            let count = MasonryLayout.columnCount(width: usable, tileWidth: model.tileStep.width, spacing: spacing)
            let tileWidth = (usable - spacing * CGFloat(count - 1)) / CGFloat(count)
            let columns = MasonryLayout.columns(aspectRatios: model.store.items.map(\.aspectRatio), count: count)
            ScrollView {
                VStack(spacing: spacing) {
                    if !pending.isEmpty {
                        HStack(spacing: spacing) {
                            ForEach(pending) { capture in
                                PendingTile(capture: capture, width: tileWidth)
                            }
                            Spacer(minLength: 0)
                        }
                    }
                    HStack(alignment: .top, spacing: spacing) {
                        ForEach(columns.indices, id: \.self) { column in
                            LazyVStack(spacing: spacing) {
                                ForEach(columns[column], id: \.self) { index in
                                    tile(index, width: tileWidth)
                                }
                            }
                            .frame(width: tileWidth)
                        }
                    }
                }
                .padding(spacing)
            }
            .onChange(of: columns, initial: true) { _, newColumns in
                onColumns(newColumns)
            }
        }
    }

    @ViewBuilder
    private func tile(_ index: Int, width: CGFloat) -> some View {
        let item = model.store.items[index]
        InspirationTile(
            item: item,
            width: width,
            isSelected: model.selection.contains(item.id),
            thumbnails: model.thumbnails,
            onLoadFailed: { model.thumbnailFailed() }
        )
        .onTapGesture {
            let flags = NSEvent.modifierFlags
            model.click(item.id, command: flags.contains(.command), shift: flags.contains(.shift))
        }
        .accessibilityAddTraits(.isButton)
        .onAppear {
            if index >= model.store.items.count - 10 { Task { await model.store.loadMore() } }
        }
    }
}
