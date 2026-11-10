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
                model.columns = newColumns
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
            isChecked: model.selection.contains(item.id),
            showCheckbox: !model.selection.isEmpty,
            thumbnails: model.thumbnails,
            onToggleCheck: { model.toggleChecked(item.id) },
            onLoadFailed: { model.thumbnailFailed() }
        )
        .onTapGesture {
            let flags = NSEvent.modifierFlags
            model.click(item.id, command: flags.contains(.command), shift: flags.contains(.shift))
        }
        .draggable(InspirationDragFile(item: item, thumbnails: model.thumbnails))
        .contextMenu {
            Button("Use in project…") { model.dialog = .useInProject(model.targets(for: item.id)) }
                .disabled(!model.store.canEdit)
            Button("Copy Image") { copy(item) }
                .disabled(model.targets(for: item.id).count != 1)
            if let source = item.sourceURL {
                Button("Open Source Link") { NSWorkspace.shared.open(source) }
            }
            Divider()
            Button("Delete…", role: .destructive) { model.dialog = .delete(model.targets(for: item.id)) }
                .disabled(!model.store.canEdit)
        }
        .accessibilityAddTraits(.isButton)
        .onAppear {
            if index >= model.store.items.count - 10 { Task { await model.store.loadMore() } }
        }
    }

    private func copy(_ item: ShelfCore.LibraryItem) {
        Task {
            guard let url = try? await model.thumbnails.fullImageFile(for: item),
                  let image = NSImage(contentsOf: url) else { return }
            NSPasteboard.general.clearContents()
            NSPasteboard.general.writeObjects([image])
        }
    }
}
