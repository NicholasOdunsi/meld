import OrionDesignSystem
import ShelfCore
import SwiftUI

/// Slides in when one image is clicked: your note first, then what Orion noticed.
struct InspirationPanel: View {
    let item: ShelfCore.LibraryItem
    @Bindable var model: InspirationModel
    let frame: FrameModel

    @Environment(\.displayScale) private var displayScale
    @FocusState private var noteFocused: Bool
    @State private var note = ""
    @State private var image: CGImage?
    @State private var saveTask: Task<Void, Never>?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: OrionSpacing.md) {
                HStack {
                    Spacer()
                    Button("Close", systemImage: "xmark") { model.clearSelection() }
                        .labelStyle(.iconOnly)
                        .buttonStyle(.borderless)
                        .keyboardShortcut(.cancelAction)
                }
                if let image {
                    Image(decorative: image, scale: displayScale)
                        .resizable()
                        .scaledToFit()
                        .clipShape(.rect(cornerRadius: 10, style: .continuous))
                }
                section("Your note") {
                    TextField("Add a note", text: $note, axis: .vertical)
                        .lineLimit(2...8)
                        .orionDialogField()
                        .focused($noteFocused)
                        .disabled(!model.store.canEdit)
                        .onChange(of: note) {
                            if note.count > Limits.noteMax {
                                note = String(note.prefix(Limits.noteMax))
                            }
                            scheduleSave()
                        }
                }
                switch item.labelState {
                case .done:
                    if let description = item.description {
                        section("What Orion noticed") {
                            Text(description).foregroundStyle(.secondary)
                        }
                    }
                case .pending:
                    section("What Orion noticed") {
                        Text("Orion is still looking at this…").foregroundStyle(.tertiary)
                    }
                case .skipped:
                    EmptyView()
                }
                if let source = item.sourceURL {
                    section("From") {
                        Link(source.host() ?? source.absoluteString, destination: source)
                            .foregroundStyle(OrionColor.dayBreakBlue.color)
                    }
                }
                section("Saved") {
                    Text(item.createdAt, format: .relative(presentation: .named))
                }
                if !item.rooms.isEmpty {
                    section("Used in") {
                        FlowChips(rooms: item.rooms) { room in
                            frame.openTab(room.roomId.uuidString.lowercased())
                        }
                    }
                }
            }
            .padding(OrionSpacing.md)
        }
        .frame(width: 300)
        .background(.regularMaterial)
        .task(id: item.id) {
            saveTask?.cancel()
            note = item.note ?? ""
            image = await model.thumbnails.thumbnail(for: item, maxPixels: Int(600 * displayScale))
        }
        .onChange(of: noteFocused) {
            model.isEditingNote = noteFocused
        }
        .onDisappear {
            model.isEditingNote = false
            flushSave()
        }
    }

    private func section<Content: View>(_ title: LocalizedStringKey, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: OrionSpacing.xxs) {
            Text(title).font(.caption.weight(.semibold)).foregroundStyle(.secondary)
            content()
        }
    }

    private func scheduleSave() {
        saveTask?.cancel()
        let id = item.id
        let text = note
        saveTask = Task {
            try? await Task.sleep(for: .seconds(1))
            guard !Task.isCancelled, text != (model.store.items.first { $0.id == id }?.note ?? "") else { return }
            await model.store.updateNote(id, to: text)
        }
    }

    private func flushSave() {
        guard note != (item.note ?? "") else { return }
        saveTask?.cancel()
        let (id, text, store) = (item.id, note, model.store)
        Task { await store.updateNote(id, to: text) }
    }
}

/// Wrapping chips for the rooms that already use this image.
private struct FlowChips: View {
    let rooms: [ShelfRoom]
    let onTap: (ShelfRoom) -> Void

    var body: some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 110))], alignment: .leading, spacing: OrionSpacing.xxs) {
            ForEach(rooms) { room in
                Button("\(room.roomName) · \(room.projectName)") { onTap(room) }
                    .buttonStyle(OrionButtonStyle(.secondary))
            }
        }
    }
}
