import OrionDesignSystem
import ShelfCore
import SwiftUI

/// Right drawer for the image overlay: note, what Orion noticed, and meta only.
struct InspirationPanel: View {
    let item: ShelfCore.LibraryItem
    @Bindable var model: InspirationModel
    let frame: FrameModel

    @FocusState private var noteFocused: Bool
    @State private var note = ""
    @State private var saveTask: Task<Void, Never>?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: OrionSpacing.md) {
                if let noteTitle = item.note, !noteTitle.isEmpty {
                    Text(noteTitle)
                        .font(.title3.weight(.semibold))
                }
                section("Your note") {
                    TextField("Add a note", text: $note, axis: .vertical)
                        .lineLimit(6...14)
                        .font(.body)
                        .textFieldStyle(.plain)
                        .padding(OrionSpacing.sm)
                        .frame(maxWidth: .infinity, minHeight: 140, alignment: .topLeading)
                        .background(.fill.tertiary, in: .rect(cornerRadius: 12, style: .continuous))
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
                    metaRow("Source") {
                        Link(source.host() ?? source.absoluteString, destination: source)
                            .foregroundStyle(OrionColor.dayBreakBlue.color)
                    }
                }
                metaRow("Saved") {
                    Text(item.createdAt, format: .relative(presentation: .named))
                        .foregroundStyle(.secondary)
                }
                if !item.rooms.isEmpty {
                    section("Used in") {
                        FlowChips(rooms: item.rooms, frame: frame) { room in
                            frame.openTab(room.roomId.uuidString.lowercased())
                        }
                    }
                }
            }
            .padding(.horizontal, OrionSpacing.md)
            .padding(.top, OrionSpacing.sm)
            .padding(.bottom, OrionSpacing.lg)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .task(id: item.id) {
            saveTask?.cancel()
            note = item.note ?? ""
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
        VStack(alignment: .leading, spacing: OrionSpacing.xs) {
            Text(title).font(.caption.weight(.semibold)).foregroundStyle(.secondary)
            content()
        }
    }

    private func metaRow<Content: View>(_ title: LocalizedStringKey, @ViewBuilder content: () -> Content) -> some View {
        HStack(alignment: .firstTextBaseline) {
            Text(title)
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
                .frame(width: 72, alignment: .leading)
            content()
            Spacer(minLength: 0)
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

/// Single-line project pills for rooms that already use this image.
private struct FlowChips: View {
    let rooms: [ShelfRoom]
    let frame: FrameModel
    let onTap: (ShelfRoom) -> Void

    var body: some View {
        let projects = Dictionary(grouping: rooms, by: \.projectName)
        FlowLayout(spacing: OrionSpacing.xs) {
            ForEach(projects.keys.sorted(), id: \.self) { name in
                if let room = projects[name]?.first {
                    Button {
                        onTap(room)
                    } label: {
                        HStack(spacing: 5) {
                            projectMark(named: name)
                            Text(name)
                                .font(.caption2.weight(.medium))
                                .lineLimit(1)
                                .fixedSize(horizontal: true, vertical: false)
                        }
                        .padding(.leading, 5)
                        .padding(.trailing, 8)
                        .padding(.vertical, 4)
                        .background(.fill.tertiary, in: .capsule)
                        .overlay {
                            Capsule().strokeBorder(.primary.opacity(0.12), lineWidth: 1)
                        }
                    }
                    .buttonStyle(.plain)
                    .help("\(room.roomName) · \(name)")
                }
            }
        }
    }

    @ViewBuilder
    private func projectMark(named name: String) -> some View {
        if let project = frame.snapshot?.projects.first(where: { $0.name == name }) {
            ProjectMark(project: project, revision: frame.logoRevision)
                .scaleEffect(14 / 22)
                .frame(width: 14, height: 14)
        }
    }
}
